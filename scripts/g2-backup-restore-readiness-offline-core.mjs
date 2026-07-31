import { constants } from 'node:fs';
import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import { link, lstat, open, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 32;
const KEYRING_VERSION = 'wordle-provider-collector-keyring/v1';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_SHAPE');
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.join('|') !== expected.join('|')) fail(actual.some((key) => !expected.includes(key)) ? 'UNKNOWN_FIELD' : 'OMITTED_FIELD');
}
export function exactAbsolutePath(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || path.includes('\0')) fail('PATH_NOT_ABSOLUTE');
  return path;
}
export function safeG2Id(value) { if (typeof value !== 'string' || !SAFE_ID.test(value)) fail('INVALID_ID'); return value; }

// JSON.parse alone silently accepts duplicate keys. This lexical pass records every
// object key while JSON.parse supplies complete grammar and trailing-data checks.
export function parseG2StrictJson(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_JSON_BYTES) fail('JSON_SIZE');
  let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('JSON_ENCODING'); }
  let value; try { value = JSON.parse(text); } catch { fail('JSON_SYNTAX'); }
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
        const frame = stack.at(-1); if (!frame || frame.type !== 'object') fail('JSON_SYNTAX');
        const key = JSON.parse(text.slice(start, index + 1)); if (frame.keys.has(key)) fail('DUPLICATE_JSON_KEY'); frame.keys.add(key);
      }
    } else if (character === '{' || character === '[') {
      stack.push(character === '{' ? { type: 'object', keys: new Set() } : { type: 'array' });
      if (stack.length > MAX_JSON_DEPTH) fail('JSON_DEPTH');
    } else if (character === '}' || character === ']') stack.pop();
  }
  return value;
}

export async function readG2ProtectedFile(path, maxBytes = MAX_JSON_BYTES) {
  exactAbsolutePath(path);
  const uid = process.getuid?.();
  let before; try { before = await lstat(path); } catch { fail('INPUT_FILE_UNAVAILABLE'); }
  if (!before.isFile() || before.isSymbolicLink() || before.uid !== uid || before.nlink !== 1 || (before.mode & 0o777) !== 0o600 || before.size > maxBytes) fail('UNSAFE_INPUT_FILE');
  let handle; try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('INPUT_FILE_CHANGED'); }
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.uid !== uid || opened.nlink !== 1 || (opened.mode & 0o777) !== 0o600 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > maxBytes) fail('INPUT_FILE_CHANGED');
    const bytes = await handle.readFile(); const after = await handle.stat();
    if (bytes.byteLength > maxBytes || after.dev !== opened.dev || after.ino !== opened.ino || after.uid !== uid || after.nlink !== 1 || (after.mode & 0o777) !== 0o600 || after.size !== bytes.byteLength) fail('INPUT_FILE_CHANGED');
    return { bytes, dev: opened.dev, ino: opened.ino };
  } finally { await handle.close(); }
}
export async function readG2ProtectedJson(path) {
  const record = await readG2ProtectedFile(path);
  return { ...record, value: parseG2StrictJson(record.bytes) };
}

export async function openG2ProtectedDirectory(path) {
  exactAbsolutePath(path); let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); } catch { fail('DIRECTORY_UNAVAILABLE'); }
  try {
    const info = await handle.stat();
    if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700) fail('DIRECTORY_POLICY');
    const anchoredPath = `/proc/self/fd/${handle.fd}`;
    const anchored = await stat(anchoredPath).catch(() => fail('DIRECTORY_DESCRIPTOR_UNAVAILABLE'));
    if (!anchored.isDirectory() || anchored.dev !== info.dev || anchored.ino !== info.ino) fail('DIRECTORY_DESCRIPTOR_UNAVAILABLE');
    return { handle, info, anchoredPath, originalPath: path };
  } catch (error) { await handle.close(); throw error; }
}

export function resolveG2CollectorKey(keyring, keyId, at) {
  exact(keyring, ['schemaVersion', 'keys']);
  if (keyring.schemaVersion !== KEYRING_VERSION || !Array.isArray(keyring.keys)) fail('INVALID_KEYRING');
  const matches = keyring.keys.filter((entry) => entry?.keyId === keyId);
  if (matches.length !== 1) fail('COLLECTOR_KEY_NOT_APPROVED');
  const entry = matches[0]; exact(entry, ['keyId', 'publicKeyPem', 'notBefore', 'notAfter', 'revokedAt']); safeG2Id(entry.keyId);
  const when = Date.parse(at); const start = Date.parse(entry.notBefore); const end = Date.parse(entry.notAfter); const revoked = entry.revokedAt === null ? null : Date.parse(entry.revokedAt);
  if (![when, start, end].every(Number.isFinite) || (revoked !== null && !Number.isFinite(revoked)) || when < start || when >= end || revoked !== null) fail('COLLECTOR_KEY_INACTIVE');
  let key; try { key = createPublicKey(entry.publicKeyPem); } catch { fail('INVALID_COLLECTOR_KEY'); }
  if (key.asymmetricKeyType !== 'ed25519') fail('INVALID_COLLECTOR_KEY'); return key;
}

async function ownInodeAt(root, name, expected) {
  const current = await lstat(join(root.anchoredPath, name)).catch(() => undefined);
  return Boolean(current?.isFile() && !current.isSymbolicLink() && current.dev === expected.dev && current.ino === expected.ino);
}
async function removeOwn(root, name, expected) {
  if (await ownInodeAt(root, name, expected)) await unlink(join(root.anchoredPath, name)).catch(() => {});
}

// Candidate-first, marker-second, final-last transaction. Both roots are held by
// descriptors, so path replacement cannot redirect any write.
export async function publishG2Eligibility({ outputRoot, replayRoot, runId, nonce, receipt, canonicalJson }) {
  safeG2Id(runId); safeG2Id(nonce);
  if (outputRoot.info.dev === replayRoot.info.dev && outputRoot.info.ino === replayRoot.info.ino) fail('DIRECTORY_ALIAS');
  const finalName = `${runId}.eligibility.json`; const finalPath = join(outputRoot.anchoredPath, finalName);
  try { await lstat(finalPath); fail('OUTPUT_ALREADY_EXISTS'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const candidateName = `.${runId}.${process.pid}.${randomBytes(16).toString('hex')}.candidate`;
  const candidatePath = join(outputRoot.anchoredPath, candidateName); let candidate; let candidateInfo;
  try {
    candidate = await open(candidatePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    candidateInfo = await candidate.stat();
    if (!candidateInfo.isFile() || candidateInfo.uid !== process.getuid?.() || candidateInfo.nlink !== 1 || (candidateInfo.mode & 0o777) !== 0o600) fail('OUTPUT_FILE_POLICY');
    await candidate.writeFile(Buffer.from(`${canonicalJson(receipt)}\n`)); await candidate.sync();
  } catch (error) { await candidate?.close().catch(() => {}); if (candidateInfo) await removeOwn(outputRoot, candidateName, candidateInfo); throw error; }
  await candidate.close(); candidate = undefined;
  if (!await ownInodeAt(outputRoot, candidateName, candidateInfo)) { await removeOwn(outputRoot, candidateName, candidateInfo); fail('OUTPUT_CANDIDATE_CHANGED'); }

  const markerName = `${createHash('sha256').update(nonce).digest('hex')}.used`; let marker;
  try {
    marker = await open(join(replayRoot.anchoredPath, markerName), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const markerInfo = await marker.stat();
    if (!markerInfo.isFile() || markerInfo.uid !== process.getuid?.() || markerInfo.nlink !== 1 || (markerInfo.mode & 0o777) !== 0o600) fail('REPLAY_MARKER_POLICY');
    await marker.writeFile(`${createHash('sha256').update(nonce).digest('hex')}\n`); await marker.sync(); await marker.close(); marker = undefined; await replayRoot.handle.sync();
  } catch (error) {
    await marker?.close().catch(() => {}); await removeOwn(outputRoot, candidateName, candidateInfo);
    if (error?.code === 'EEXIST') fail('CHALLENGE_REPLAY'); throw error;
  }

  let finalOwned = false;
  try {
    if (!await ownInodeAt(outputRoot, candidateName, candidateInfo)) fail('OUTPUT_CANDIDATE_CHANGED');
    await link(candidatePath, finalPath); finalOwned = await ownInodeAt(outputRoot, finalName, candidateInfo);
    if (!finalOwned) fail('OUTPUT_PUBLICATION_RACE');
    await unlink(candidatePath); await outputRoot.handle.sync();
    if (!await ownInodeAt(outputRoot, finalName, candidateInfo)) fail('OUTPUT_PUBLICATION_RACE');
    return join(outputRoot.originalPath, finalName);
  } catch (error) {
    if (finalOwned) await removeOwn(outputRoot, finalName, candidateInfo);
    await removeOwn(outputRoot, candidateName, candidateInfo);
    await outputRoot.handle.sync().catch(() => {});
    throw error;
  }
}
