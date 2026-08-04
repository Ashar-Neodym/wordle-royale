import { constants } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { link, lstat, open, readFile, readdir, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { runFreshProviderBundleAcquisition } from './g0-provider-bundle-fresh-acquisition.mjs';
import { publishProviderBundleLocally } from './g0-provider-bundle-local-publisher.mjs';
import { validateProviderBundlePublication } from './g0-provider-bundle-publication-validator.mjs';
import { canonicalProviderToolJson } from './g0-provider-tool-bundle.mjs';

export const REPRODUCIBILITY_RECEIPT_SCHEMA = 'wordle-royale-g0-provider-bundle-reproducibility/v1';
export const MAX_REPRODUCIBILITY_RECEIPT_BYTES = 256 * 1024;
const PROVIDERS = Object.freeze(['vercel', 'railway', 'supabase']);
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
const PINNED_ACQUISITION = Object.freeze({
  packageJsonSha256: 'sha256:58fffb1ef8b6b6ff51cba0d9f752ea29dac6830cfaed4c763c7a3bd0f2d9dcde',
  packageLockSha256: 'sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90',
  toolchain: Object.freeze({
    node: Object.freeze({ path: '/home/ashar/.nvm/versions/node/v26.3.0/bin/node', realpath: '/home/ashar/.nvm/versions/node/v26.3.0/bin/node', sha256: 'sha256:5325ac9da58541494afcc136f0880279a2a853609bf4dae7755e04fb682b6926', version: 'v26.3.0' }),
    npm: Object.freeze({ path: '/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js', realpath: '/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js', sha256: 'sha256:8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7', version: '11.16.0' }),
  }),
});
const DIR_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_NOATIME ?? 0);
const CREATE_FLAGS = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const RECEIPT_KEYS = Object.freeze([
  'acquisitionContract', 'acquisitionCount', 'allBytesAndModesReproduced', 'hostedMutationAuthorized',
  'independentScannerCount', 'independentScanners', 'networkSummaries', 'privilegedInstallationAuthorized', 'providerBundleCount',
  'providerExecutionAuthorized', 'providers', 'retryGate', 'rootInstallationPerformed', 'schemaVersion', 'sourceRevision',
]);

function fail(code, details) { const error = new Error(code); error.code = code; if (details !== undefined) error.details = details; throw error; }
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function exact(value, keys, code) { if (!plain(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail(code); }
function freezeDeep(value) { if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) { for (const child of Object.values(value)) freezeDeep(child); Object.freeze(value); } return value; }
const canonicalBytes = (value) => Buffer.from(`${canonicalProviderToolJson(value)}\n`, 'utf8');
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const modeOf = (st) => Number(st.mode) & 0o7777;
const identity = (st) => `${st.dev}:${st.ino}`;
const metadata = (st) => [st.dev, st.ino, st.mode, st.nlink, st.uid, st.gid, st.size, st.atimeNs, st.mtimeNs, st.ctimeNs].map(String).join(':');
const anchor = (handle) => `/proc/self/fd/${handle.fd}`;
const childAt = (handle, name) => `${anchor(handle)}/${name}`;
const equalCanonical = (a, b) => canonicalProviderToolJson(a) === canonicalProviderToolJson(b);
function normalizedAbsolute(value) { return typeof value === 'string' && isAbsolute(value) && value !== '/' && resolve(value) === value && !value.includes('\0'); }

async function invokeHook(hooks, point, context = {}) {
  if (hooks === undefined) return;
  const fn = typeof hooks === 'function' ? hooks : hooks?.[point];
  if (fn === undefined) return;
  if (typeof fn !== 'function') fail('REPRODUCIBILITY_TEST_HOOK_INVALID');
  await fn(freezeDeep({ point, ...context }));
}

async function openSafeDirectory(path, code) {
  const uid = BigInt(process.getuid?.());
  const named = await lstat(path, { bigint: true }).catch(() => fail(code));
  if (!named.isDirectory() || named.isSymbolicLink() || named.uid !== uid || named.nlink < 1n || modeOf(named) !== 0o700
      || await realpath(path).catch(() => '') !== path) fail(code);
  const handle = await open(path, DIR_FLAGS).catch(() => fail(code));
  const held = await handle.stat({ bigint: true });
  if (metadata(named) !== metadata(held)) { await handle.close(); fail(code); }
  return { path, handle, stat: held, id: identity(held), metadata: metadata(held) };
}
async function assertDirectoryHeld(item, code) {
  const held = await item.handle.stat({ bigint: true }).catch(() => fail(code));
  const named = await lstat(item.path, { bigint: true }).catch(() => fail(code));
  if (identity(held) !== item.id || identity(named) !== item.id || !held.isDirectory() || !named.isDirectory()
      || modeOf(held) !== 0o700 || modeOf(named) !== 0o700 || held.uid !== BigInt(process.getuid()) || named.uid !== held.uid
      || await realpath(item.path).catch(() => '') !== item.path) fail(code);
}

async function sourceInventory(sourceRoot, cacheRoot) {
  const source = await openSafeDirectory(sourceRoot, 'ACQUISITION_SOURCE_UNSAFE');
  const cache = await openSafeDirectory(cacheRoot, 'ACQUISITION_CACHE_UNSAFE');
  const files = new Map();
  const walk = async (directory, relative) => {
    const names = (await readdir(anchor(directory), { encoding: 'buffer' })).sort(Buffer.compare);
    for (const raw of names) {
      const name = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      if (!Buffer.from(name).equals(raw) || !name || name.includes('/') || name === '.' || name === '..') fail('ACQUISITION_SOURCE_PATH_INVALID');
      const path = childAt(directory, name); const st = await lstat(path, { bigint: true }).catch(() => fail('ACQUISITION_SOURCE_CHANGED'));
      const rel = relative ? `${relative}/${name}` : name;
      if (st.isSymbolicLink()) fail('ACQUISITION_SOURCE_SYMLINK_FORBIDDEN');
      if (st.dev !== source.stat.dev || st.uid !== source.stat.uid) fail('ACQUISITION_SOURCE_POLICY_MISMATCH');
      if (st.isDirectory()) {
        const child = await open(path, DIR_FLAGS).catch(() => fail('ACQUISITION_SOURCE_CHANGED'));
        try { const held = await child.stat({ bigint: true }); if (identity(st) !== identity(held)) fail('ACQUISITION_SOURCE_CHANGED'); await walk(child, rel); }
        finally { await child.close(); }
      } else if (st.isFile()) {
        if (st.nlink !== 1n) fail('ACQUISITION_HARDLINK_FORBIDDEN');
        const id = identity(st); if (files.has(id)) fail('ACQUISITION_HARDLINK_FORBIDDEN'); files.set(id, rel);
      } else fail('ACQUISITION_SOURCE_SPECIAL_FILE_FORBIDDEN');
    }
  };
  try {
    await walk(source.handle, '');
    for (const required of ['package.json', 'package-lock.json']) if (![...files.values()].includes(required)) fail('ACQUISITION_INPUT_MISSING');
    const nm = await lstat(childAt(source.handle, 'node_modules'), { bigint: true }).catch(() => fail('ACQUISITION_NODE_MODULES_MISSING'));
    if (!nm.isDirectory() || nm.isSymbolicLink()) fail('ACQUISITION_NODE_MODULES_MISSING');
    return freezeDeep({ sourceId: source.id, cacheId: cache.id, nodeModulesId: identity(nm), sourceDevice: source.stat.dev, cacheDevice: cache.stat.dev, files });
  } finally { await Promise.allSettled([source.handle.close(), cache.handle.close()]); }
}
function assertIndependent(a, b) {
  const roots = [a.sourceId, a.cacheId, a.nodeModulesId, b.sourceId, b.cacheId, b.nodeModulesId];
  if (new Set(roots).size !== roots.length) fail('ACQUISITION_ROOT_ALIAS');
  for (const id of a.files.keys()) if (b.files.has(id)) fail('ACQUISITION_FILE_ALIAS', { a: a.files.get(id), b: b.files.get(id) });
}

function validateTool(name, value) {
  exact(value, ['path', 'realpath', 'sha256', 'version'], 'ACQUISITION_TOOLCHAIN_INVALID');
  if (!normalizedAbsolute(value.path) || !normalizedAbsolute(value.realpath) || !SHA256.test(value.sha256) || typeof value.version !== 'string' || !value.version) fail('ACQUISITION_TOOLCHAIN_INVALID');
  return { path: value.path, realpath: value.realpath, sha256: value.sha256, version: value.version };
}
function sanitizeAcquisition(value, label, expectedSource) {
  exact(value, ['canonicalSourceSnapshotSha256', 'credentialsForwarded', 'label', 'lifecycleScriptsExecuted', 'networkSummary', 'packageJsonSha256', 'packageLockSha256', 'providerExecuted', 'sourceRoot', 'status', 'toolchain'], 'ACQUISITION_RESULT_INVALID');
  if (value.status !== 'FRESH_ACQUISITION_VALID' || value.label !== label || value.sourceRoot !== expectedSource
      || !SHA256.test(value.canonicalSourceSnapshotSha256) || !SHA256.test(value.packageJsonSha256) || !SHA256.test(value.packageLockSha256)
      || value.lifecycleScriptsExecuted !== false || value.credentialsForwarded !== false || value.providerExecuted !== false) fail('ACQUISITION_RESULT_INVALID');
  exact(value.toolchain, ['node', 'npm'], 'ACQUISITION_TOOLCHAIN_INVALID');
  const toolchain = { node: validateTool('node', value.toolchain.node), npm: validateTool('npm', value.toolchain.npm) };
  if (value.packageJsonSha256 !== PINNED_ACQUISITION.packageJsonSha256 || value.packageLockSha256 !== PINNED_ACQUISITION.packageLockSha256
      || !equalCanonical(toolchain, PINNED_ACQUISITION.toolchain)) fail('ACQUISITION_PIN_MISMATCH');
  exact(value.networkSummary, ['allowedOrigin', 'dnsRequestCount', 'httpRequestCount', 'networkSyscallCount', 'registryConnectionCount'], 'ACQUISITION_NETWORK_SUMMARY_INVALID');
  if (value.networkSummary.allowedOrigin !== 'https://registry.npmjs.org/'
      || ['dnsRequestCount', 'httpRequestCount', 'networkSyscallCount', 'registryConnectionCount'].some((key) => !Number.isSafeInteger(value.networkSummary[key]) || value.networkSummary[key] < 1)) fail('ACQUISITION_NETWORK_SUMMARY_INVALID');
  return freezeDeep({
    contract: { canonicalSourceSnapshotSha256: value.canonicalSourceSnapshotSha256, packageJsonSha256: value.packageJsonSha256, packageLockSha256: value.packageLockSha256, toolchain },
    network: { allowedOrigin: value.networkSummary.allowedOrigin, credentialsForwarded: false, dnsRequestCount: value.networkSummary.dnsRequestCount, httpRequestCount: value.networkSummary.httpRequestCount, lifecycleScriptsExecuted: false, networkSyscallCount: value.networkSummary.networkSyscallCount, providerExecuted: false, registryConnectionCount: value.networkSummary.registryConnectionCount },
  });
}

function normalizeReport(value, provider) {
  exact(value, ['artifactId', 'canonicalSourceSnapshotSha256', 'counts', 'memberHashes', 'provider', 'publicationId', 'publicationValid', 'sourceRevision', 'status', 'treeSha256'], 'PUBLICATION_REPORT_INVALID');
  if (value.status !== 'PUBLICATION_VALID' || value.publicationValid !== true || value.provider !== provider
      || typeof value.artifactId !== 'string' || !value.artifactId.startsWith(`${provider}-`) || value.publicationId !== `${value.artifactId}-${value.publicationId.slice(value.artifactId.length + 1)}`
      || !new RegExp(`^${value.artifactId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}-[a-f0-9]{32}$`, 'u').test(value.publicationId)
      || !SHA256.test(value.treeSha256) || !SHA256.test(value.canonicalSourceSnapshotSha256) || !REVISION.test(value.sourceRevision)) fail('PUBLICATION_REPORT_INVALID');
  exact(value.counts, ['nodeCount', 'packageCount', 'payloadBytes'], 'PUBLICATION_REPORT_INVALID');
  if (Object.values(value.counts).some((x) => !Number.isSafeInteger(x) || x < 0)) fail('PUBLICATION_REPORT_INVALID');
  const memberNames = ['COMMIT', 'acquisition-record.json', 'bundle.tree-manifest.json', 'descriptor.json', 'install-plan.json', 'publication-index.json'];
  exact(value.memberHashes, memberNames, 'PUBLICATION_REPORT_INVALID');
  if (Object.values(value.memberHashes).some((x) => !SHA256.test(x))) fail('PUBLICATION_REPORT_INVALID');
  return freezeDeep({ artifactId: value.artifactId, publicationId: value.publicationId, treeSha256: value.treeSha256, canonicalSourceSnapshotSha256: value.canonicalSourceSnapshotSha256, sourceRevision: value.sourceRevision, memberHashes: { ...value.memberHashes }, counts: { ...value.counts } });
}
function checkPublisherResult(result, provider, scannerReport, sourceRevision, snapshot) {
  exact(result, ['artifactId', 'provider', 'publicationName', 'report', 'status'], 'PUBLISHER_RESULT_INVALID');
  if (!['PUBLISHED', 'ALREADY_PUBLISHED_IDENTICAL'].includes(result.status) || result.provider !== provider || result.publicationName !== scannerReport.publicationId || result.artifactId !== scannerReport.artifactId) fail('PUBLISHER_RESULT_INVALID');
  const publisherReport = normalizeReport(result.report, provider);
  if (!equalCanonical(publisherReport, scannerReport)) fail('PUBLISHER_SCANNER_MISMATCH');
  if (scannerReport.sourceRevision !== sourceRevision) fail('PUBLICATION_SOURCE_REVISION_MISMATCH');
  if (scannerReport.canonicalSourceSnapshotSha256 !== snapshot) fail('PUBLICATION_SOURCE_SNAPSHOT_MISMATCH');
}

function receiptDocument(sourceRevision, acquisitions, providers) {
  return {
    acquisitionContract: acquisitions.A.contract,
    acquisitionCount: 2,
    allBytesAndModesReproduced: true,
    hostedMutationAuthorized: false,
    independentScannerCount: 3,
    independentScanners: ['copy-helper', 'staging-validator', 'publication-validator'],
    networkSummaries: { A: acquisitions.A.network, B: acquisitions.B.network },
    privilegedInstallationAuthorized: false,
    providerBundleCount: 3,
    providerExecutionAuthorized: false,
    providers,
    retryGate: 'closed',
    rootInstallationPerformed: false,
    schemaVersion: REPRODUCIBILITY_RECEIPT_SCHEMA,
    sourceRevision,
  };
}
function validateReceipt(value) {
  exact(value, RECEIPT_KEYS, 'RECEIPT_INVALID');
  if (value.schemaVersion !== REPRODUCIBILITY_RECEIPT_SCHEMA || !REVISION.test(value.sourceRevision) || value.acquisitionCount !== 2 || value.providerBundleCount !== 3
      || value.independentScannerCount !== 3 || value.allBytesAndModesReproduced !== true || value.hostedMutationAuthorized !== false
      || value.privilegedInstallationAuthorized !== false || value.providerExecutionAuthorized !== false || value.rootInstallationPerformed !== false || value.retryGate !== 'closed') fail('RECEIPT_INVALID');
  if (!Array.isArray(value.independentScanners) || value.independentScanners.join('\0') !== 'copy-helper\0staging-validator\0publication-validator') fail('RECEIPT_INVALID');
  exact(value.acquisitionContract, ['canonicalSourceSnapshotSha256', 'packageJsonSha256', 'packageLockSha256', 'toolchain'], 'RECEIPT_INVALID');
  if (![value.acquisitionContract.canonicalSourceSnapshotSha256, value.acquisitionContract.packageJsonSha256, value.acquisitionContract.packageLockSha256].every((x) => typeof x === 'string' && SHA256.test(x))) fail('RECEIPT_INVALID');
  exact(value.acquisitionContract.toolchain, ['node', 'npm'], 'RECEIPT_INVALID');
  validateTool('node', value.acquisitionContract.toolchain.node); validateTool('npm', value.acquisitionContract.toolchain.npm);
  exact(value.networkSummaries, ['A', 'B'], 'RECEIPT_INVALID');
  for (const summary of Object.values(value.networkSummaries)) {
    exact(summary, ['allowedOrigin', 'credentialsForwarded', 'dnsRequestCount', 'httpRequestCount', 'lifecycleScriptsExecuted', 'networkSyscallCount', 'providerExecuted', 'registryConnectionCount'], 'RECEIPT_INVALID');
    if (summary.allowedOrigin !== 'https://registry.npmjs.org/' || summary.credentialsForwarded !== false || summary.lifecycleScriptsExecuted !== false || summary.providerExecuted !== false
        || ['dnsRequestCount', 'httpRequestCount', 'networkSyscallCount', 'registryConnectionCount'].some((key) => !Number.isSafeInteger(summary[key]) || summary[key] < 1)) fail('RECEIPT_INVALID');
  }
  if (!Array.isArray(value.providers) || value.providers.length !== 3 || value.providers.some((p, i) => p?.provider !== PROVIDERS[i])) fail('RECEIPT_INVALID');
  for (const provider of value.providers) {
    exact(provider, ['provider', 'artifactId', 'publicationId', 'treeSha256', 'memberHashes', 'counts'], 'RECEIPT_INVALID');
    normalizeReport({
      status: 'PUBLICATION_VALID', publicationValid: true, provider: provider.provider, artifactId: provider.artifactId,
      publicationId: provider.publicationId, treeSha256: provider.treeSha256,
      canonicalSourceSnapshotSha256: value.acquisitionContract.canonicalSourceSnapshotSha256, sourceRevision: value.sourceRevision,
      memberHashes: provider.memberHashes, counts: provider.counts,
    }, provider.provider);
  }
  return value;
}
function parseReceipt(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > MAX_REPRODUCIBILITY_RECEIPT_BYTES) fail('RECEIPT_INVALID');
  let value; try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('RECEIPT_INVALID'); }
  validateReceipt(value); if (!canonicalBytes(value).equals(bytes)) fail('RECEIPT_INVALID'); return value;
}

async function readExistingReceipt(parent, name, expected) {
  let handle;
  try { handle = await open(childAt(parent.handle, name), FILE_FLAGS); } catch { fail('RECEIPT_COLLISION_INVALID'); }
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.uid !== BigInt(process.getuid()) || before.nlink !== 1n || modeOf(before) !== 0o600 || before.size > BigInt(MAX_REPRODUCIBILITY_RECEIPT_BYTES)) fail('RECEIPT_COLLISION_INVALID');
    const bytes = await readFile(handle);
    const after = await handle.stat({ bigint: true });
    if (metadata(before) !== metadata(after)) fail('RECEIPT_REPLAY_METADATA_CHANGED');
    try { parseReceipt(bytes); } catch { fail('RECEIPT_COLLISION_INVALID'); }
    if (!bytes.equals(expected)) fail('RECEIPT_COLLISION_DIFFERENT');
    return bytes;
  } finally { await handle.close(); }
}
async function cleanupTemp(parent, name, tempIdentity) {
  const named = await lstat(childAt(parent.handle, name), { bigint: true }).catch(() => null);
  if (!named) return;
  if (!named.isFile() || identity(named) !== tempIdentity) fail('RECEIPT_CLEANUP_IDENTITY_LOST');
  await unlink(childAt(parent.handle, name)).catch(() => fail('RECEIPT_CLEANUP_FAILED'));
}
async function commitReceipt(receiptPath, bytes, hooks) {
  const parentPath = dirname(receiptPath); const name = basename(receiptPath);
  if (!name || name === '.' || name === '..' || name.includes('/')) fail('REPRODUCIBILITY_INPUT_INVALID');
  const parent = await openSafeDirectory(parentPath, 'RECEIPT_PARENT_UNSAFE');
  let temp; let tempName; let tempId;
  try {
    await assertDirectoryHeld(parent, 'RECEIPT_PARENT_CHANGED');
    const existing = await lstat(childAt(parent.handle, name), { bigint: true }).catch((error) => error?.code === 'ENOENT' ? null : fail('RECEIPT_COLLISION_INVALID'));
    if (existing) { const replay = await readExistingReceipt(parent, name, bytes); await assertDirectoryHeld(parent, 'RECEIPT_PARENT_CHANGED'); return { status: 'ALREADY_REPRODUCED_IDENTICAL', bytes: replay }; }
    tempName = `.an5b-receipt-${randomBytes(16).toString('hex')}`;
    temp = await open(childAt(parent.handle, tempName), CREATE_FLAGS, 0o600).catch(() => fail('RECEIPT_TEMP_CREATE_FAILED'));
    const created = await temp.stat({ bigint: true }); tempId = identity(created);
    if (!created.isFile() || created.uid !== BigInt(process.getuid()) || created.nlink !== 1n || modeOf(created) !== 0o600) fail('RECEIPT_TEMP_POLICY');
    await invokeHook(hooks, 'afterTempCreate', { receiptPath, tempName });
    let offset = 0; while (offset < bytes.length) { const { bytesWritten } = await temp.write(bytes, offset, bytes.length - offset, offset); if (!bytesWritten) fail('RECEIPT_WRITE_FAILED'); offset += bytesWritten; }
    await invokeHook(hooks, 'afterTempWrite', { receiptPath, tempName });
    await temp.sync().catch(() => fail('RECEIPT_TEMP_FSYNC_FAILED'));
    await invokeHook(hooks, 'afterTempFsync', { receiptPath, tempName });
    const reread = Buffer.alloc(bytes.length); let read = 0; while (read < reread.length) { const x = await temp.read(reread, read, reread.length - read, read); if (!x.bytesRead) fail('RECEIPT_TEMP_CHANGED'); read += x.bytesRead; }
    if (!reread.equals(bytes)) fail('RECEIPT_TEMP_CHANGED');
    const assertTempNamed = async () => {
      const held = await temp.stat({ bigint: true }).catch(() => fail('RECEIPT_TEMP_CHANGED'));
      const named = await lstat(childAt(parent.handle, tempName), { bigint: true }).catch(() => fail('RECEIPT_TEMP_CHANGED'));
      if (!held.isFile() || !named.isFile() || identity(held) !== tempId || identity(named) !== tempId || held.nlink !== 1n || named.nlink !== 1n || modeOf(held) !== 0o600 || modeOf(named) !== 0o600) fail('RECEIPT_TEMP_CHANGED');
    };
    await assertTempNamed(); await assertDirectoryHeld(parent, 'RECEIPT_PARENT_CHANGED'); await invokeHook(hooks, 'beforeLink', { receiptPath, tempName });
    await assertDirectoryHeld(parent, 'RECEIPT_PARENT_CHANGED'); await assertTempNamed();
    try { await link(childAt(parent.handle, tempName), childAt(parent.handle, name)); } catch (error) {
      if (error?.code !== 'EEXIST') fail('RECEIPT_LINK_FAILED');
      const replay = await readExistingReceipt(parent, name, bytes); return { status: 'ALREADY_REPRODUCED_IDENTICAL', bytes: replay };
    }
    await invokeHook(hooks, 'afterLink', { receiptPath, tempName });
    await assertDirectoryHeld(parent, 'RECEIPT_PARENT_CHANGED'); await invokeHook(hooks, 'beforeParentFsync', { receiptPath, tempName });
    await parent.handle.sync().catch(() => fail('RECEIPT_PARENT_FSYNC_FAILED')); await invokeHook(hooks, 'afterParentFsync', { receiptPath, tempName });
    await cleanupTemp(parent, tempName, tempId); tempName = undefined;
    await invokeHook(hooks, 'afterTempUnlink', { receiptPath });
    await parent.handle.sync().catch(() => fail('RECEIPT_PARENT_FSYNC_FAILED'));
    await assertDirectoryHeld(parent, 'RECEIPT_PARENT_CHANGED'); await invokeHook(hooks, 'beforeFinalRead', { receiptPath });
    const finalBytes = await readExistingReceipt(parent, name, bytes); await invokeHook(hooks, 'afterFinalRead', { receiptPath });
    return { status: 'REPRODUCED', bytes: finalBytes };
  } finally {
    await temp?.close().catch(() => {});
    if (tempName) await cleanupTemp(parent, tempName, tempId).catch(() => {});
    await parent.handle.close();
  }
}

const PRODUCTION_DEPS = Object.freeze({ acquisitionRunner: runFreshProviderBundleAcquisition, publisher: publishProviderBundleLocally, validator: validateProviderBundlePublication });
export function createProviderBundleReproducibilityForTests(overrides = {}) {
  if (!plain(overrides)) fail('REPRODUCIBILITY_TEST_DEPS_INVALID');
  const { hooks, ...deps } = overrides;
  for (const key of Object.keys(deps)) if (!['acquisitionRunner', 'publisher', 'validator'].includes(key) || typeof deps[key] !== 'function') fail('REPRODUCIBILITY_TEST_DEPS_INVALID');
  return (input) => reproduce(input, Object.freeze({ ...PRODUCTION_DEPS, ...deps }), hooks);
}
export const createReproducibilityOrchestratorForTests = createProviderBundleReproducibilityForTests;
export async function reproduceProviderBundles(input) {
  if (arguments.length !== 1) fail('REPRODUCIBILITY_INPUT_INVALID');
  return reproduce(input, PRODUCTION_DEPS);
}

async function reproduce(input, deps, hooks) {
  exact(input, ['publicationRootA', 'publicationRootB', 'receiptPath', 'sourceRevision', 'workspaceRoot'], 'REPRODUCIBILITY_INPUT_INVALID');
  const { workspaceRoot, publicationRootA, publicationRootB, receiptPath, sourceRevision } = input;
  if (![workspaceRoot, publicationRootA, publicationRootB, receiptPath].every(normalizedAbsolute) || !REVISION.test(sourceRevision)) fail('REPRODUCIBILITY_INPUT_INVALID');
  const roots = await Promise.all([workspaceRoot, publicationRootA, publicationRootB].map((path) => openSafeDirectory(path, 'REPRODUCIBILITY_ROOT_UNSAFE')));
  const rootDevice = roots[0].stat.dev;
  try {
    if (new Set(roots.map((x) => x.id)).size !== roots.length || new Set(roots.map((x) => String(x.stat.dev))).size !== 1) fail('REPRODUCIBILITY_ROOTS_NOT_INDEPENDENT');
    const raw = await Promise.all(['A', 'B'].map((label) => deps.acquisitionRunner({ workspaceRoot, label })));
  const sourceA = join(workspaceRoot, 'acquisition-A/source'); const sourceB = join(workspaceRoot, 'acquisition-B/source');
  const acquisitions = { A: sanitizeAcquisition(raw[0], 'A', sourceA), B: sanitizeAcquisition(raw[1], 'B', sourceB) };
  if (!equalCanonical(acquisitions.A.contract, acquisitions.B.contract)) fail('ACQUISITION_CONTRACT_MISMATCH');
  const inventories = await Promise.all([sourceInventory(sourceA, join(workspaceRoot, 'acquisition-A/cache')), sourceInventory(sourceB, join(workspaceRoot, 'acquisition-B/cache'))]);
  if (inventories.some((item) => item.sourceDevice !== rootDevice || item.cacheDevice !== rootDevice)) fail('ACQUISITION_FILESYSTEM_MISMATCH');
  assertIndependent(inventories[0], inventories[1]);
  const providerReceipts = [];
  for (const provider of PROVIDERS) {
    const pair = [];
    for (const [label, sourceRoot, publicationParent] of [['A', sourceA, publicationRootA], ['B', sourceB, publicationRootB]]) {
      await invokeHook(hooks, 'beforePublish', { label, provider });
      const published = await deps.publisher({ provider, sourceRoot, publicationParent, sourceRevision });
      if (!plain(published) || typeof published.publicationName !== 'string') fail('PUBLISHER_RESULT_INVALID');
      const scanned = normalizeReport(await deps.validator({ publicationParent, publicationName: published.publicationName }), provider);
      checkPublisherResult(published, provider, scanned, sourceRevision, acquisitions[label].contract.canonicalSourceSnapshotSha256);
      pair.push(scanned);
    }
    if (!equalCanonical(pair[0], pair[1])) fail('PROVIDER_REPRODUCIBILITY_MISMATCH', provider);
    providerReceipts.push(freezeDeep({ provider, artifactId: pair[0].artifactId, publicationId: pair[0].publicationId, treeSha256: pair[0].treeSha256, memberHashes: pair[0].memberHashes, counts: pair[0].counts }));
  }
  const document = receiptDocument(sourceRevision, acquisitions, providerReceipts);
  validateReceipt(document); const bytes = canonicalBytes(document);
  if (bytes.length > MAX_REPRODUCIBILITY_RECEIPT_BYTES) fail('RECEIPT_SIZE_LIMIT');
  for (const path of [workspaceRoot, publicationRootA, publicationRootB, receiptPath, sourceA, sourceB]) if (bytes.includes(Buffer.from(path))) fail('RECEIPT_ABSOLUTE_PATH_LEAK');
    for (const root of roots) await assertDirectoryHeld(root, 'REPRODUCIBILITY_ROOT_CHANGED');
    const committed = await commitReceipt(receiptPath, bytes, hooks);
    for (const root of roots) await assertDirectoryHeld(root, 'REPRODUCIBILITY_ROOT_CHANGED');
    const result = { status: committed.status, receiptSha256: sha256(committed.bytes), providers: providerReceipts, receiptPath };
    return freezeDeep(result);
  } finally { await Promise.allSettled(roots.map((x) => x.handle.close())); }
}

export const runProviderBundleReproducibility = reproduceProviderBundles;
