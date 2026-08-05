import { constants, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, open, realpath, stat } from 'node:fs/promises';

const HELPER_PATH = new URL('./g0-bundle-publication-helper.py', import.meta.url).pathname;
const PYTHON_PATH = '/usr/bin/python3';
const PYTHON_REALPATH = '/usr/bin/python3.12';
const PYTHON_SHA256 = 'sha256:1643dacd9feaedc58f3cc581e4d22577dfe25c09b10282936186ccf0f2e61118';
export const LOCAL_NOREPLACE_HELPER_SHA256 = 'sha256:b5190ff5ee5a515839a6c04446d6c399d30dfb03b5578a0275ecaa1508a45ebf';
const SCHEMA = 'wordle-royale-g0-bundle-publication-helper/v1';
const ENV = Object.freeze({ LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', PATH: '/usr/bin:/bin', TZ: 'UTC' });
const TEMP = /^\.an5b-receipt-[0-9a-f]{32}$/u;
const FINAL = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9])?$/u;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const modeOf = (st) => Number(st.mode) & 0o7777;
const identity = (st) => `${st.dev}:${st.ino}`;
const metadata = (st) => [st.dev, st.ino, st.mode, st.nlink, st.uid, st.gid, st.size, st.ctimeNs, st.mtimeNs].map(String).join(':');
const sorted = (value) => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])])) : value;
const canonical = (value) => Buffer.from(`${JSON.stringify(sorted(value))}\n`);

async function hashHandle(handle) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => createReadStream('', { fd: handle.fd, autoClose: false, start: 0 })
    .on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', resolve));
  return `sha256:${hash.digest('hex')}`;
}
async function verifyPython() {
  if (await realpath(PYTHON_PATH).catch(() => '') !== PYTHON_REALPATH) fail('NOREPLACE_TOOLCHAIN_POLICY');
  const st = await stat(PYTHON_REALPATH, { bigint: true });
  const handle = await open(PYTHON_REALPATH, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!st.isFile() || st.uid !== 0n || st.nlink !== 1n || modeOf(st) !== 0o755 || await hashHandle(handle) !== PYTHON_SHA256) fail('NOREPLACE_TOOLCHAIN_POLICY');
  } finally { await handle.close(); }
}
async function openHelper(uid) {
  const named = await lstat(HELPER_PATH, { bigint: true }).catch(() => fail('NOREPLACE_HELPER_POLICY'));
  const handle = await open(HELPER_PATH, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => fail('NOREPLACE_HELPER_POLICY'));
  const held = await handle.stat({ bigint: true });
  if (!held.isFile() || metadata(named) !== metadata(held) || held.uid !== uid || held.nlink !== 1n || modeOf(held) !== 0o644
      || await hashHandle(handle) !== LOCAL_NOREPLACE_HELPER_SHA256) { await handle.close(); fail('NOREPLACE_HELPER_POLICY'); }
  return { handle, held: metadata(held) };
}
function run(frame, helperFd, parentFd) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_PATH, ['-I', '-S', '-B', '/proc/self/fd/3'], { env: ENV, shell: false, stdio: ['pipe', 'pipe', 'pipe', helperFd, parentFd] });
    const out = []; const err = []; let bytes = 0; let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, 30_000);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { bytes += chunk.length; if (bytes > 64 * 1024) { killed = true; child.kill('SIGKILL'); } });
    child.stdout.on('data', (chunk) => out.push(chunk)); child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', () => { clearTimeout(timer); resolve({ error: true }); });
    child.on('close', (status, signal) => { clearTimeout(timer); resolve({ status, signal, killed, stdout: Buffer.concat(out), stderr: Buffer.concat(err) }); });
    child.stdin.end(canonical(frame));
  });
}

// Deliberately accepts only already-held directory/file descriptors and the two
// closed receipt-name grammars. It exposes no generic helper action or path API.
export async function commitLocalReceiptNoReplace(input) {
  if (arguments.length !== 1 || !input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).sort().join('\0') !== ['finalName', 'parentHandle', 'tempHandle', 'tempName'].join('\0')) fail('NOREPLACE_COMMIT_INPUT_INVALID');
  const { parentHandle, tempHandle, tempName, finalName } = input;
  if (!parentHandle || !tempHandle || !TEMP.test(tempName) || !FINAL.test(finalName)) fail('NOREPLACE_COMMIT_INPUT_INVALID');
  const uidNumber = process.getuid?.(); if (!Number.isInteger(uidNumber)) fail('NOREPLACE_UID_UNAVAILABLE'); const uid = BigInt(uidNumber);
  const parent = await parentHandle.stat({ bigint: true }).catch(() => fail('NOREPLACE_PARENT_CHANGED'));
  const temp = await tempHandle.stat({ bigint: true }).catch(() => fail('NOREPLACE_TEMP_CHANGED'));
  if (!parent.isDirectory() || parent.uid !== uid || modeOf(parent) !== 0o700) fail('NOREPLACE_PARENT_POLICY');
  if (!temp.isFile() || temp.uid !== uid || temp.dev !== parent.dev || temp.nlink !== 1n || modeOf(temp) !== 0o600) fail('NOREPLACE_TEMP_POLICY');
  const named = await lstat(`/proc/self/fd/${parentHandle.fd}/${tempName}`, { bigint: true }).catch(() => fail('NOREPLACE_TEMP_CHANGED'));
  if (metadata(named) !== metadata(temp)) fail('NOREPLACE_TEMP_CHANGED');
  await verifyPython(); const helper = await openHelper(uid);
  try {
    const frame = {
      action: 'commit_file', expectedParentDev: String(parent.dev), expectedParentIno: String(parent.ino),
      expectedTempDev: String(temp.dev), expectedTempIno: String(temp.ino), finalName,
      limits: { maxDepth: 1, maxFrameBytes: 4096, maxNodes: 1 }, schemaVersion: SCHEMA, tempName,
    };
    const result = await run(frame, helper.handle.fd, parentHandle.fd);
    if (result.error || result.killed || result.signal !== null || result.stderr?.length) fail('NOREPLACE_HELPER_FAILED');
    let body; try { body = JSON.parse(result.stdout.toString('utf8')); } catch { fail('NOREPLACE_HELPER_PROTOCOL'); }
    if (!canonical(body).equals(result.stdout) || !body || Object.keys(body).join('') !== 'status'
        || !['PUBLISHED', 'COLLISION'].includes(body.status) || result.status !== (body.status === 'PUBLISHED' ? 0 : 2)) fail('NOREPLACE_HELPER_PROTOCOL');
    const parentAfter = await parentHandle.stat({ bigint: true }).catch(() => fail('NOREPLACE_PARENT_CHANGED'));
    const helperAfter = await helper.handle.stat({ bigint: true }).catch(() => fail('NOREPLACE_HELPER_CHANGED'));
    if (identity(parentAfter) !== identity(parent) || modeOf(parentAfter) !== 0o700
        || metadata(helperAfter) !== helper.held || await hashHandle(helper.handle) !== LOCAL_NOREPLACE_HELPER_SHA256) fail('NOREPLACE_HELPER_CHANGED');
    return Object.freeze({ status: body.status });
  } finally { await helper.handle.close(); }
}
