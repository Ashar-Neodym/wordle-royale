import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalProviderToolJson } from './g0-provider-tool-bundle.mjs';

const PYTHON = Object.freeze({ path: '/usr/bin/python3.12', realpath: '/usr/bin/python3.12', mode: 0o755, uid: 0, sha256: '1643dacd9feaedc58f3cc581e4d22577dfe25c09b10282936186ccf0f2e61118', version: 'Python 3.12.3' });
const HELPER = Object.freeze({ path: fileURLToPath(new URL('./g0-standalone-repro-scanner.py', import.meta.url)), mode: 0o644, sha256: '94a7d1c10981ae9e877b9453f40744887094399c4fa257234c2712108bba83c0' });
const MAX_HELPER_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DIR_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const identity = (st) => [st.dev, st.ino, st.mode, st.nlink, st.uid, st.gid, st.size, st.mtimeNs, st.ctimeNs].map(String).join(':');
const plain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
function exact(value, keys) { if (!plain(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail('STANDALONE_REPORT_INVALID'); }
async function hashHandle(handle, size, limit) {
  if (size < 0n || size > BigInt(limit)) fail('STANDALONE_PIN_INVALID');
  const hash = createHash('sha256'); const buffer = Buffer.allocUnsafe(64 * 1024); let offset = 0;
  while (offset < Number(size)) { const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, Number(size) - offset), offset); if (!bytesRead) fail('STANDALONE_PIN_CHANGED'); hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead; }
  return hash.digest('hex');
}
async function holdFile(pin, limit, requireRealpath = false) {
  const named = await lstat(pin.path, { bigint: true }).catch(() => fail('STANDALONE_PIN_INVALID'));
  if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n || Number(named.mode & 0o7777n) !== pin.mode || named.uid !== BigInt(pin.uid ?? process.getuid())
      || (requireRealpath && await realpath(pin.path).catch(() => '') !== pin.realpath)) fail('STANDALONE_PIN_INVALID');
  const handle = await open(pin.path, FILE_FLAGS).catch(() => fail('STANDALONE_PIN_INVALID'));
  try { const held = await handle.stat({ bigint: true }); if (identity(named) !== identity(held) || await hashHandle(handle, held.size, limit) !== pin.sha256) fail('STANDALONE_PIN_CHANGED'); return { handle, identity: identity(held) }; }
  catch (error) { await handle.close(); throw error; }
}
async function verifyHeld(pin, held, requireRealpath = false) {
  const named = await lstat(pin.path, { bigint: true }).catch(() => fail('STANDALONE_PIN_CHANGED')); const current = await held.handle.stat({ bigint: true }).catch(() => fail('STANDALONE_PIN_CHANGED'));
  if (identity(named) !== held.identity || identity(current) !== held.identity || (requireRealpath && await realpath(pin.path).catch(() => '') !== pin.realpath)) fail('STANDALONE_PIN_CHANGED');
}
function validateOutput(value) {
  exact(value, ['contentReport', 'regularFileIdentities']); const report = value.contentReport;
  exact(report, ['artifactId', 'canonicalSourceSnapshotSha256', 'counts', 'memberHashes', 'memberInventory', 'provider', 'publicationId', 'schemaVersion', 'sourceRevision', 'tree', 'treeSha256']);
  if (report.schemaVersion !== 'wordle-royale-g0-standalone-repro-scan/v1' || !['vercel', 'railway', 'supabase'].includes(report.provider)
      || typeof report.artifactId !== 'string' || !report.artifactId.startsWith(`${report.provider}-`) || typeof report.publicationId !== 'string'
      || !SHA.test(report.canonicalSourceSnapshotSha256) || !SHA.test(report.treeSha256) || !REVISION.test(report.sourceRevision)) fail('STANDALONE_REPORT_INVALID');
  exact(report.counts, ['nodeCount', 'packageCount', 'payloadBytes']);
  if (Object.values(report.counts).some((x) => !Number.isSafeInteger(x) || x < 0)) fail('STANDALONE_REPORT_INVALID');
  const members = ['COMMIT', 'acquisition-record.json', 'bundle.tree-manifest.json', 'descriptor.json', 'install-plan.json', 'publication-index.json'];
  exact(report.memberHashes, members); if (Object.values(report.memberHashes).some((x) => !SHA.test(x))) fail('STANDALONE_REPORT_INVALID');
  if (!Array.isArray(report.tree) || report.tree.length !== report.counts.nodeCount || !Array.isArray(report.memberInventory) || report.memberInventory.length !== 6
      || !Array.isArray(value.regularFileIdentities) || value.regularFileIdentities.length !== report.tree.filter((x) => x?.type === 'file').length + 6
      || new Set(value.regularFileIdentities).size !== value.regularFileIdentities.length || value.regularFileIdentities.some((x) => !/^[0-9]+:[0-9]+$/u.test(x))) fail('STANDALONE_REPORT_INVALID');
  for (const entry of [...report.tree, ...report.memberInventory]) {
    if (!plain(entry) || typeof entry.path !== 'string' || !Number.isSafeInteger(entry.mode) || !['file', 'directory'].includes(entry.type)) fail('STANDALONE_REPORT_INVALID');
    if (entry.type === 'file' && (!Number.isSafeInteger(entry.size) || entry.size < 0 || !SHA.test(entry.sha256))) fail('STANDALONE_REPORT_INVALID');
  }
  return value;
}
function execute(python, helper, parent, publicationName) {
  return new Promise((accept, reject) => {
    const child = spawn('/proc/self/fd/4', ['/proc/self/fd/5', '6', publicationName], { env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1', PYTHONHASHSEED: '0' }, stdio: ['ignore', 'pipe', 'pipe', 'ignore', python.handle.fd, helper.handle.fd, parent.fd], windowsHide: true });
    const stdout = []; const stderr = []; let count = 0; let overflow = false;
    const consume = (target) => (chunk) => { count += chunk.length; if (count > MAX_OUTPUT_BYTES) { overflow = true; child.kill('SIGKILL'); } else target.push(Buffer.from(chunk)); };
    child.stdout.on('data', consume(stdout)); child.stderr.on('data', consume(stderr)); child.once('error', reject);
    child.once('close', (code, signal) => { if (overflow) return reject(Object.assign(new Error('STANDALONE_OUTPUT_LIMIT'), { code: 'STANDALONE_OUTPUT_LIMIT' })); if (code !== 0 || signal !== null) return reject(Object.assign(new Error(Buffer.concat(stderr).toString('utf8').trim() || 'STANDALONE_SCAN_FAILED'), { code: 'STANDALONE_SCAN_FAILED' })); accept(Buffer.concat(stdout)); });
  });
}
export async function scanProviderBundlePublicationStandalone(input) {
  exact(input, ['publicationName', 'publicationParent']);
  if (typeof input.publicationParent !== 'string' || !isAbsolute(input.publicationParent) || resolve(input.publicationParent) !== input.publicationParent || typeof input.publicationName !== 'string' || !input.publicationName || input.publicationName.includes('/')) fail('STANDALONE_INPUT_INVALID');
  const parent = await open(input.publicationParent, DIR_FLAGS).catch(() => fail('STANDALONE_PARENT_INVALID'));
  const python = await holdFile(PYTHON, 16 * 1024 * 1024, true); const helper = await holdFile(HELPER, MAX_HELPER_BYTES);
  try {
    const bytes = await execute(python, helper, parent, input.publicationName);
    if (bytes.length < 3 || bytes.length > MAX_OUTPUT_BYTES) fail('STANDALONE_OUTPUT_INVALID');
    let value; try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('STANDALONE_OUTPUT_INVALID'); }
    if (!Buffer.from(`${canonicalProviderToolJson(value)}\n`).equals(bytes)) fail('STANDALONE_OUTPUT_NONCANONICAL'); validateOutput(value);
    await verifyHeld(PYTHON, python, true); await verifyHeld(HELPER, helper);
    const r = value.contentReport;
    return Object.freeze({ contentReport: r, regularFileIdentities: Object.freeze([...value.regularFileIdentities]), report: Object.freeze({ status: 'PUBLICATION_VALID', publicationValid: true, provider: r.provider, artifactId: r.artifactId, publicationId: r.publicationId, memberHashes: Object.freeze({ ...r.memberHashes }), treeSha256: r.treeSha256, canonicalSourceSnapshotSha256: r.canonicalSourceSnapshotSha256, sourceRevision: r.sourceRevision, counts: Object.freeze({ ...r.counts }) }) });
  } finally { await Promise.allSettled([parent.close(), python.handle.close(), helper.handle.close()]); }
}

export const STANDALONE_REPRO_SCANNER_TOOLCHAIN = Object.freeze({ python: Object.freeze({ version: PYTHON.version, sha256: `sha256:${PYTHON.sha256}` }), helper: Object.freeze({ sha256: `sha256:${HELPER.sha256}` }) });
