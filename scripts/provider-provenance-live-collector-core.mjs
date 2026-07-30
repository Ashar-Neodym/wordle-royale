import { constants, createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import {
  LIVE_COLLECTOR_ID, LIVE_EVIDENCE_VERSION, LIVE_RECEIPT_VERSION, POSTGRES_SQL_DIGEST,
  POSTGRES_SQL_QUERY_ID, deriveLiveInventory, liveCanonicalJson, liveSha256, validateLiveChallenge,
  verifyLiveBundle,
} from './provider-provenance-live-core.mjs';

export const OPERATION_PLANS_VERSION = 'wordle-provider-operation-plans/v1';
export const KEYRING_VERSION = 'wordle-provider-collector-keyring/v1';
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 32;
const BUNDLE_COMMIT_VERSION = 'wordle-provider-bundle-commit/v1';
const BUNDLE_FILES = Object.freeze(['challenge', 'evidence', 'inventory', 'receipt']);

const EXECUTORS = Object.freeze({
  'vercel-control-plane': 'vercel',
  'railway-control-plane': 'railway',
  'postgres-direct-sql': 'postgresql',
});
const fail = (code, field = 'operation') => { const error = new Error(`${code}: ${field}`); error.code = code; throw error; };
const plain = (value, field) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_SHAPE', field); return value; };
function exact(value, fields, path) {
  plain(value, path); const actual = Object.keys(value).sort(); const expected = [...fields].sort();
  if (actual.join('|') !== expected.join('|')) fail(actual.some((key) => !expected.includes(key)) ? 'UNKNOWN_FIELD' : 'OMITTED_FIELD', path);
}
function boundedInteger(value, min, max, path) { if (!Number.isInteger(value) || value < min || value > max) fail('INVALID_BOUND', path); return value; }
function safeId(value, path) { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u.test(value)) fail('INVALID_ID', path); return value; }
function sha(value, path) { if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) fail('INVALID_DIGEST', path); return value; }
function isoNow(clock) { const date = new Date(clock()); if (!Number.isFinite(date.getTime())) fail('INVALID_CLOCK', 'clock'); return date.toISOString(); }

export function parseStrictJson(bytes, path = 'json') {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_JSON_BYTES) fail('JSON_SIZE', path);
  let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('JSON_ENCODING', path); }
  let value; try { value = JSON.parse(text); } catch { fail('JSON_SYNTAX', path); }
  const stack = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      const start = index; index += 1;
      for (; index < text.length; index += 1) {
        if (text[index] === '\\') { index += 1; continue; }
        if (text[index] === '"') break;
      }
      let next = index + 1; while (/\s/u.test(text[next] ?? '')) next += 1;
      if (text[next] === ':') {
        const frame = stack.at(-1); if (!frame || frame.type !== 'object') fail('JSON_SYNTAX', path);
        const key = JSON.parse(text.slice(start, index + 1)); if (frame.keys.has(key)) fail('DUPLICATE_JSON_KEY', path); frame.keys.add(key);
      }
    } else if (character === '{' || character === '[') {
      stack.push(character === '{' ? { type: 'object', keys: new Set() } : { type: 'array' }); if (stack.length > MAX_JSON_DEPTH) fail('JSON_DEPTH', path);
    } else if (character === '}' || character === ']') stack.pop();
  }
  return value;
}

export function validateOperationPlans(raw) {
  exact(raw, ['schemaVersion', 'executables', 'limits'], 'plans');
  if (raw.schemaVersion !== OPERATION_PLANS_VERSION) fail('UNSUPPORTED_OPERATION_PLANS', 'plans.schemaVersion');
  exact(raw.executables, ['vercel', 'railway', 'postgresql'], 'plans.executables');
  const executables = {};
  for (const name of Object.keys(EXECUTORS)) {
    const key = EXECUTORS[name]; const item = raw.executables[key];
    exact(item, ['path', 'realpath', 'sha256', 'version', 'uid', 'mode'], `plans.executables.${key}`);
    if (![item.path, item.realpath].every((entry) => typeof entry === 'string' && isAbsolute(entry))) fail('EXECUTABLE_PATH_NOT_ABSOLUTE', key);
    if (typeof item.version !== 'string' || item.version.length < 1 || item.version.length > 200 || /[\r\n\0]/u.test(item.version)) fail('INVALID_EXECUTABLE_VERSION', key);
    if (!Number.isInteger(item.uid) || item.uid < 0 || !Number.isInteger(item.mode) || item.mode < 0 || item.mode > 0o7777 || (item.mode & 0o111) === 0 || (item.mode & 0o022) !== 0) fail('INVALID_EXECUTABLE_POLICY', key);
    executables[key] = { ...item, sha256: sha(item.sha256, `${key}.sha256`) };
  }
  exact(raw.limits, ['timeoutMs', 'versionTimeoutMs', 'stdoutBytes', 'stderrBytes'], 'plans.limits');
  return { schemaVersion: raw.schemaVersion, executables, limits: {
    timeoutMs: boundedInteger(raw.limits.timeoutMs, 100, 120_000, 'limits.timeoutMs'),
    versionTimeoutMs: boundedInteger(raw.limits.versionTimeoutMs, 100, 10_000, 'limits.versionTimeoutMs'),
    stdoutBytes: boundedInteger(raw.limits.stdoutBytes, 256, MAX_JSON_BYTES, 'limits.stdoutBytes'),
    stderrBytes: boundedInteger(raw.limits.stderrBytes, 0, 64 * 1024, 'limits.stderrBytes'),
  } };
}

async function fileDigest(path) {
  const hash = createHash('sha256');
  await new Promise((accept, reject) => createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', accept));
  return `sha256:${hash.digest('hex')}`;
}

/** Production runner. It validates and snapshots the executable before spawning it with no shell. */
export function createSecureChildRunner({ stagingDirectory }) {
  if (typeof stagingDirectory !== 'string' || !isAbsolute(stagingDirectory)) fail('STAGING_DIRECTORY_REQUIRED', 'stagingDirectory');
  return { async run(spec) {
    exact(spec, ['executable', 'argv', 'limits'], 'runner.spec');
    const policy = spec.executable; const before = await lstat(policy.path).catch(() => fail('EXECUTABLE_UNAVAILABLE', 'executable'));
    if (!before.isFile() || before.isSymbolicLink()) fail('EXECUTABLE_NOT_REGULAR', 'executable');
    const actualRealpath = await realpath(policy.path);
    if (actualRealpath !== policy.realpath || before.uid !== policy.uid || (before.mode & 0o7777) !== policy.mode) fail('EXECUTABLE_POLICY_MISMATCH', 'executable');
    if (await fileDigest(policy.path) !== policy.sha256) fail('EXECUTABLE_DIGEST_MISMATCH', 'executable');
    await mkdir(stagingDirectory, { recursive: true, mode: 0o700 }); await chmod(stagingDirectory, 0o700);
    const staged = join(stagingDirectory, `executor-${process.pid}-${createHash('sha256').update(`${policy.path}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 16)}`);
    await copyFile(policy.path, staged, constants.COPYFILE_EXCL); await chmod(staged, 0o500);
    try {
      if (await fileDigest(staged) !== policy.sha256) fail('EXECUTABLE_SNAPSHOT_MISMATCH', 'executable');
      const version = await spawnBounded(staged, ['--version'], { timeoutMs: spec.limits.versionTimeoutMs, stdoutBytes: 512, stderrBytes: spec.limits.stderrBytes });
      if (version.exitCode !== 0 || version.stdout.toString('utf8').trim() !== policy.version) fail('EXECUTABLE_VERSION_MISMATCH', 'executable');
      return await spawnBounded(staged, spec.argv, spec.limits);
    } finally { await rm(staged, { force: true }); }
  } };
}

export function spawnBounded(executable, argv, limits) {
  if (!isAbsolute(executable) || !Array.isArray(argv) || argv.some((value) => typeof value !== 'string' || value.includes('\0'))) fail('INVALID_SPAWN_SPEC', 'spawn');
  return new Promise((accept, reject) => {
    let stdoutLength = 0; let stderrLength = 0; const stdout = []; const stderr = []; let settled = false; let reason;
    const isolateProcessGroup = process.platform !== 'win32';
    const child = spawn(executable, argv, { shell: false, detached: isolateProcessGroup, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' } });
    const terminate = () => { try { if (isolateProcessGroup && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { child.kill('SIGKILL'); } };
    const stop = (code) => { if (!reason) reason = code; terminate(); };
    const timer = setTimeout(() => stop('PROCESS_TIMEOUT'), limits.timeoutMs); timer.unref?.();
    child.stdout.on('data', (chunk) => { stdoutLength += chunk.length; if (stdoutLength > limits.stdoutBytes) stop('STDOUT_LIMIT'); else stdout.push(chunk); });
    child.stderr.on('data', (chunk) => { stderrLength += chunk.length; if (stderrLength > limits.stderrBytes) stop('STDERR_LIMIT'); else stderr.push(chunk); });
    child.on('error', () => { clearTimeout(timer); if (!settled) { settled = true; const error = new Error('PROCESS_SPAWN_FAILED'); error.code = 'PROCESS_SPAWN_FAILED'; reject(error); } });
    child.on('close', (code, signal) => { clearTimeout(timer); if (settled) return; settled = true; if (isolateProcessGroup) terminate(); if (reason) { const error = new Error(reason); error.code = reason; reject(error); return; } accept({ exitCode: code ?? -1, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), stdoutBytes: stdoutLength, stderrBytes: stderrLength }); });
  });
}

function argvFor(operation) {
  const argv = ['collect', '--operation-id', operation.operationId, '--environment', operation.environment, '--target-host', operation.targetHost, '--format', LIVE_EVIDENCE_VERSION];
  if (operation.method === 'postgres-direct-sql') argv.push('--query-id', POSTGRES_SQL_QUERY_ID, '--query-digest', POSTGRES_SQL_DIGEST, '--transaction', 'read-only');
  return argv;
}
function parseAdapterJson(bytes, path) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_JSON_BYTES) fail('ADAPTER_OUTPUT_SIZE', path);
  let value; try { value = parseStrictJson(bytes, path); } catch (error) { if (error?.code === 'DUPLICATE_JSON_KEY' || error?.code === 'JSON_DEPTH') throw error; fail('ADAPTER_OUTPUT_JSON', path); }
  return plain(value, path);
}
function cleanVariables(raw, path) {
  if (!Array.isArray(raw)) fail('INVALID_SHAPE', path);
  return raw.map((entry, index) => { exact(entry, ['name', 'required', 'state'], `${path}[${index}]`); return { name: entry.name, required: entry.required, state: entry.state }; });
}
function cleanObservation(raw, operation, digest, observedAt, path) {
  exact(raw, ['observationId', 'physicalNodeId', 'subject', 'fieldProvenance', 'facts'], path);
  return { observationId: raw.observationId, operationId: operation.operationId, method: operation.method, evidenceDigest: digest, observedAt, physicalNodeId: raw.physicalNodeId, subject: structuredClone(raw.subject), fieldProvenance: structuredClone(raw.fieldProvenance), facts: structuredClone(raw.facts) };
}
function sanitize(operation, raw, rawDigest, observedAt) {
  if (operation.provider === 'vercel' || operation.provider === 'railway') {
    exact(raw, ['identity', 'artifact', 'variables'], 'adapter.output');
    return { identity: structuredClone(raw.identity), artifact: structuredClone(raw.artifact), variables: cleanVariables(raw.variables, 'adapter.output.variables'), provenance: { operationId: operation.operationId, method: operation.method, evidenceDigest: rawDigest, observedAt } };
  }
  exact(raw, ['identity', 'variables', 'observation'], 'adapter.output');
  return { identity: structuredClone(raw.identity), variables: cleanVariables(raw.variables, 'adapter.output.variables'), observation: cleanObservation(raw.observation, operation, rawDigest, observedAt, 'adapter.output.observation') };
}

export async function collectLiveBundle({ challenge: challengeRaw, policy, plans: plansRaw, signingKey, childRunner, clock = Date.now }) {
  if (typeof clock !== 'function') fail('INVALID_CLOCK', 'clock');
  const challenge = validateLiveChallenge(challengeRaw, { ...policy, now: clock() }); const plans = validateOperationPlans(plansRaw);
  let privateKey; try { privateKey = signingKey?.type === 'private' ? signingKey : createPrivateKey(signingKey); } catch { fail('INVALID_SIGNING_KEY', 'signingKey'); }
  if (privateKey.asymmetricKeyType !== 'ed25519') fail('INVALID_SIGNING_KEY', 'signingKey');
  if (!childRunner || typeof childRunner.run !== 'function') fail('CHILD_RUNNER_REQUIRED', 'childRunner');
  const environments = { preview: {}, production: {} }; const pg = { preview: [], production: [] }; let latest = challenge.issuedAt;
  for (const operation of challenge.operations) {
    const executable = plans.executables[EXECUTORS[operation.method]];
    let result; try { result = await childRunner.run({ executable, argv: argvFor(operation), limits: plans.limits }); } catch (error) { fail(error?.code ?? 'OPERATION_FAILED', operation.operationId); }
    if (!result || result.exitCode !== 0 || !(result.stdout instanceof Uint8Array)) fail('OPERATION_FAILED', operation.operationId);
    const observedAt = isoNow(clock); latest = observedAt; const digest = liveSha256(Buffer.from(result.stdout));
    const sanitized = sanitize(operation, parseAdapterJson(result.stdout, operation.operationId), digest, observedAt);
    if (operation.provider === 'postgresql') {
      pg[operation.environment].push(sanitized.observation);
      const existing = environments[operation.environment].postgresql;
      if (existing && (liveCanonicalJson(existing.identity) !== liveCanonicalJson(sanitized.identity) || liveCanonicalJson(existing.variables) !== liveCanonicalJson(sanitized.variables))) fail('POSTGRES_METHOD_DISAGREEMENT', operation.operationId);
      if (!existing) environments[operation.environment].postgresql = { identity: sanitized.identity, variables: sanitized.variables, observations: pg[operation.environment] };
    }
    else environments[operation.environment][operation.provider] = sanitized;
  }
  const unsignedEvidence = { schemaVersion: LIVE_EVIDENCE_VERSION, collector: LIVE_COLLECTOR_ID, collectorKeyId: challenge.collectorKeyId, challengeDigest: liveSha256(liveCanonicalJson(challengeRaw)), challengeId: challenge.challengeId, runId: challenge.runId, nonce: challenge.nonce, collectedAt: latest, expiresAt: challenge.expiresAt, environments };
  const evidence = { ...unsignedEvidence, signature: `ed25519:${sign(null, Buffer.from(liveCanonicalJson(unsignedEvidence)), privateKey).toString('base64')}` };
  const publicKey = createPublicKey(privateKey); const inventory = deriveLiveInventory(evidence, challengeRaw, publicKey, { ...policy, now: clock() });
  const unsignedReceipt = { schemaVersion: LIVE_RECEIPT_VERSION, collector: LIVE_COLLECTOR_ID, collectorKeyId: challenge.collectorKeyId, challengeDigest: liveSha256(liveCanonicalJson(challengeRaw)), evidenceDigest: liveSha256(liveCanonicalJson(evidence)), inventoryDigest: liveSha256(liveCanonicalJson(inventory)) };
  const receipt = { ...unsignedReceipt, signature: `ed25519:${sign(null, Buffer.from(liveCanonicalJson(unsignedReceipt)), privateKey).toString('base64')}` };
  return { challenge: structuredClone(challengeRaw), evidence, inventory, receipt };
}

export function resolveCollectorKey(keyring, keyId, at) {
  exact(keyring, ['schemaVersion', 'keys'], 'keyring'); if (keyring.schemaVersion !== KEYRING_VERSION || !Array.isArray(keyring.keys)) fail('INVALID_KEYRING', 'keyring');
  const matches = keyring.keys.filter((entry) => entry?.keyId === keyId); if (matches.length !== 1) fail('COLLECTOR_KEY_NOT_APPROVED', 'keyId');
  const entry = matches[0]; exact(entry, ['keyId', 'publicKeyPem', 'notBefore', 'notAfter', 'revokedAt'], 'keyring.key'); safeId(entry.keyId, 'keyId');
  const when = Date.parse(at); const start = Date.parse(entry.notBefore); const end = Date.parse(entry.notAfter); const revoked = entry.revokedAt === null ? null : Date.parse(entry.revokedAt);
  if (![when, start, end].every(Number.isFinite) || (revoked !== null && !Number.isFinite(revoked)) || when < start || when >= end || revoked !== null) fail('COLLECTOR_KEY_INACTIVE', 'keyId');
  let key; try { key = createPublicKey(entry.publicKeyPem); } catch { fail('INVALID_COLLECTOR_KEY', 'publicKeyPem'); }
  if (key.asymmetricKeyType !== 'ed25519') fail('INVALID_COLLECTOR_KEY', 'publicKeyPem'); return key;
}

// Internal composition primitive. This authenticates every committed component and
// returns the exact authorized key identity, but deliberately cannot consume replay.
// Shipped standalone verification remains verifyAndConsumeLiveBundle below.
export function verifyCommittedLiveBundle({ bundle, keyring, policy, clock = Date.now }) {
  exact(bundle, ['challenge', 'evidence', 'inventory', 'receipt'], 'bundle');
  exact(policy, ['expectedChallengeId', 'expectedRunId', 'expectedNonce', 'expectedCollectorKeyId'], 'policy');
  const collectorPublicKey = resolveCollectorKey(keyring, bundle?.challenge?.collectorKeyId, bundle?.evidence?.collectedAt);
  const inventory = verifyLiveBundle({
    ...bundle,
    collectorPublicKey,
    ...policy,
    now: clock(),
    consumeReplay: false,
  });
  return {
    inventory,
    liveChallenge: structuredClone(bundle.challenge),
    nativeEvidence: structuredClone(bundle.evidence),
    providerInventory: structuredClone(bundle.inventory),
    providerReceipt: structuredClone(bundle.receipt),
    collectorPublicKey,
    collectorKeyId: bundle.challenge.collectorKeyId,
  };
}

export async function readProtectedFile(path, { maxBytes = MAX_JSON_BYTES, uid = process.getuid?.() } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('PROTECTED_PATH_NOT_ABSOLUTE', 'path');
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_JSON_BYTES || !Number.isInteger(uid) || uid < 0) fail('INVALID_PROTECTED_FILE_POLICY', 'path');
  const before = await lstat(path).catch(() => fail('PROTECTED_FILE_UNAVAILABLE', 'path'));
  if (!before.isFile() || before.isSymbolicLink() || before.uid !== uid || (before.mode & 0o777) !== 0o600 || before.size > maxBytes) fail('PROTECTED_FILE_POLICY', 'path');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.uid !== uid || (opened.mode & 0o777) !== 0o600 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > maxBytes) fail('PROTECTED_FILE_CHANGED', 'path');
    const bytes = await handle.readFile(); const after = await handle.stat();
    if (bytes.byteLength > maxBytes || after.dev !== opened.dev || after.ino !== opened.ino || after.uid !== uid || (after.mode & 0o777) !== 0o600 || after.size !== bytes.byteLength) fail('PROTECTED_FILE_CHANGED', 'path');
    return bytes;
  } finally { await handle.close(); }
}
export async function readProtectedJson(path, options) { const bytes = await readProtectedFile(path, options); try { return parseStrictJson(bytes, 'path'); } catch (error) { if (error?.code === 'DUPLICATE_JSON_KEY' || error?.code === 'JSON_DEPTH') throw error; fail('PROTECTED_JSON_INVALID', 'path'); } }

async function openDirectory(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('OUTPUT_PATH_NOT_ABSOLUTE', 'directory');
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); }
  catch { fail('OUTPUT_DIRECTORY_UNAVAILABLE', 'directory'); }
  try {
    const info = await handle.stat();
    if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700) fail('OUTPUT_DIRECTORY_POLICY', 'directory');
    const anchoredPath = `/proc/self/fd/${handle.fd}`;
    const anchored = await stat(anchoredPath).catch(() => fail('DIRECTORY_DESCRIPTOR_UNAVAILABLE', 'directory'));
    if (!anchored.isDirectory() || anchored.dev !== info.dev || anchored.ino !== info.ino) fail('DIRECTORY_DESCRIPTOR_UNAVAILABLE', 'directory');
    return { handle, info, anchoredPath };
  } catch (error) { await handle.close(); throw error; }
}
export async function assertProtectedDirectory(path) {
  const root = await openDirectory(path); try { return path; } finally { await root.handle.close(); }
}
function bundleNames(runId) {
  const files = Object.fromEntries(BUNDLE_FILES.map((component) => [component, `${runId}.${component}.json`]));
  return { files, commit: `${runId}.commit.json`, prefix: `${runId}.` };
}
async function durableWrite(root, name, value, publishedInodes, publicationHooks) {
  const bytes = Buffer.from(`${liveCanonicalJson(value)}\n`);
  const path = join(root.anchoredPath, name);
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const info = await handle.stat();
    publishedInodes.set(name, { dev: info.dev, ino: info.ino });
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) fail('OUTPUT_FILE_POLICY', name);
    await publicationHooks?.afterCreate?.({ name });
    await handle.writeFile(bytes); await handle.sync();
  } finally { await handle.close(); }
  const current = await lstat(path).catch(() => undefined); const expected = publishedInodes.get(name);
  if (!current?.isFile() || current.isSymbolicLink() || current.dev !== expected.dev || current.ino !== expected.ino) fail('BUNDLE_PUBLICATION_RACE', name);
  return liveSha256(bytes);
}
async function assertPublishedInodes(root, publishedInodes) {
  for (const [name, expected] of publishedInodes) {
    const current = await lstat(join(root.anchoredPath, name)).catch(() => undefined);
    if (!current?.isFile() || current.isSymbolicLink() || current.dev !== expected.dev || current.ino !== expected.ino) fail('BUNDLE_PUBLICATION_RACE', name);
  }
}
export async function commitLiveBundle(outputDirectory, bundle, publicationHooks = undefined) {
  const root = await openDirectory(outputDirectory);
  const publishedInodes = new Map();
  try {
    const runId = safeId(bundle?.challenge?.runId, 'bundle.runId'); const names = bundleNames(runId); const files = {};
    for (const component of BUNDLE_FILES) files[names.files[component]] = await durableWrite(root, names.files[component], bundle[component], publishedInodes, publicationHooks);
    await root.handle.sync(); await assertPublishedInodes(root, publishedInodes);
    await durableWrite(root, names.commit, { schemaVersion: BUNDLE_COMMIT_VERSION, runId, files }, publishedInodes, publicationHooks);
    await root.handle.sync(); await assertPublishedInodes(root, publishedInodes);
    return join(await realpath(root.anchoredPath), names.commit);
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') fail('BUNDLE_ALREADY_COMMITTED', 'runId');
    throw error;
  } finally { await root.handle.close(); }
}
export async function loadCommittedBundle(outputDirectory, runIdRaw) {
  const runId = safeId(runIdRaw, 'runId'); const names = bundleNames(runId); const root = await openDirectory(outputDirectory);
  try {
    const expectedEntries = [...Object.values(names.files), names.commit].sort();
    const runEntries = (await readdir(root.anchoredPath)).filter((name) => name.startsWith(names.prefix)).sort();
    if (runEntries.join('|') !== expectedEntries.join('|')) fail('BUNDLE_MANIFEST_MISMATCH', 'bundle');
    const markerBytes = await readProtectedFile(join(root.anchoredPath, names.commit));
    let marker; try { marker = parseStrictJson(markerBytes, names.commit); } catch { fail('BUNDLE_COMMIT_INVALID', 'bundle'); }
    exact(marker, ['schemaVersion', 'runId', 'files'], 'bundle.commit');
    if (marker.schemaVersion !== BUNDLE_COMMIT_VERSION) fail('BUNDLE_COMMIT_INVALID', 'bundle');
    if (safeId(marker.runId, 'bundle.commit.runId') !== runId) fail('BUNDLE_COMMIT_INVALID', 'bundle'); exact(marker.files, Object.values(names.files), 'bundle.commit.files');
    if (!markerBytes.equals(Buffer.from(`${liveCanonicalJson(marker)}\n`))) fail('BUNDLE_COMMIT_INVALID', 'bundle');
    const result = {};
    for (const name of BUNDLE_FILES) {
      const fileName = names.files[name]; const bytes = await readProtectedFile(join(root.anchoredPath, fileName));
      if (marker.files[fileName] !== liveSha256(bytes)) fail('BUNDLE_MANIFEST_MISMATCH', fileName);
      try { result[name] = parseStrictJson(bytes, fileName); } catch { fail('PROTECTED_JSON_INVALID', fileName); }
    }
    const finalEntries = (await readdir(root.anchoredPath)).filter((name) => name.startsWith(names.prefix)).sort();
    if (result.challenge?.runId !== marker.runId || finalEntries.join('|') !== expectedEntries.join('|')) fail('BUNDLE_MANIFEST_MISMATCH', 'bundle');
    return result;
  } finally { await root.handle.close(); }
}
export async function createReplayGuard(directory) {
  const root = await openDirectory(directory); let closed = false;
  return {
    async consumeAsync(nonce) {
      if (closed) fail('REPLAY_GUARD_CLOSED', 'replay');
      safeId(nonce, 'nonce'); const name = createHash('sha256').update(nonce).digest('hex'); let handle;
      try {
        handle = await open(join(root.anchoredPath, `${name}.used`), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        await handle.writeFile(`${name}\n`); await handle.sync();
      } catch (error) { if (error?.code === 'EEXIST') return false; throw error; }
      finally { await handle?.close(); }
      await root.handle.sync(); return true;
    },
    async close() { if (!closed) { closed = true; await root.handle.close(); } },
  };
}
export async function verifyAndConsumeLiveBundle({ bundle, keyring, policy, replayDirectory, clock = Date.now }) {
  // Standalone verification intentionally consumes only after complete cryptographic
  // and inventory validation. The non-consuming primitive is not exposed by the CLI.
  const { inventory } = verifyCommittedLiveBundle({ bundle, keyring, policy, clock });
  const guard = await createReplayGuard(replayDirectory);
  try {
    if (await guard.consumeAsync(bundle.challenge.nonce) !== true) fail('CHALLENGE_REPLAY', 'challenge.nonce');
    return inventory;
  } finally { await guard.close(); }
}
