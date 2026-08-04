import { constants, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdtemp, open, readdir, realpath, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ACQUISITION_DECLARATION, parseAndValidateLockfile, parseBoundedStrictJson,
  PROVIDER_LIMITS, resolveProviderLockClosure,
} from './g0-provider-bundle-assembler-core.mjs';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';

export const STAGING_COPY_SCHEMA = 'wordle-g0-bundle-copy/v2';
const HELPER_PATH = new URL('./g0-bundle-copy-helper.py', import.meta.url).pathname;
const PYTHON_PATH = '/usr/bin/python3';
const PYTHON_REALPATH = '/usr/bin/python3.12';
const PYTHON_VERSION = 'Python 3.12.3';
// Updated only when the reviewed helper source changes.
const HELPER_SHA256 = 'sha256:5e0ed359645445379948c911592291451a515f9fcf99f2c17ac64a377dfae75d';
const PYTHON_SHA256 = 'sha256:1643dacd9feaedc58f3cc581e4d22577dfe25c09b10282936186ccf0f2e61118';
const MAX_HELPER_OUTPUT = 2 * 1024 * 1024;
const HELPER_TIMEOUT_MS = 120_000;
const NATIVE = Object.freeze({
  vercel: Object.freeze([]),
  railway: Object.freeze(['node_modules/@railway/cli/bin/railway']),
  supabase: Object.freeze(['node_modules/@supabase/cli-linux-x64/bin/supabase']),
});
const ENVIRONMENT = Object.freeze({ LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', PATH: '/usr/bin:/bin', TZ: 'UTC' });
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const rawCompare = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const plain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const exact = (x, keys, code) => { if (!plain(x) || Object.keys(x).sort().join('\0') !== [...keys].sort().join('\0')) fail(code); };
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  return value;
}
const canonical = (value) => Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
function absolute(value) { return typeof value === 'string' && !value.includes('\0') && isAbsolute(value) && resolve(value) === value && value !== '/'; }
function identity(st) { return [st.dev, st.ino, st.mode, st.nlink, st.uid, st.gid, st.size, st.ctimeNs, st.mtimeNs].join(':'); }

async function hashHandle(handle) {
  const hash = createHash('sha256');
  await new Promise((ok, no) => createReadStream('', { fd: handle.fd, autoClose: false, start: 0 })
    .on('data', (chunk) => hash.update(chunk)).on('error', no).on('end', ok));
  return `sha256:${hash.digest('hex')}`;
}
async function readHandle(handle, maxBytes) {
  const st = await handle.stat({ bigint: true });
  if (!st.isFile() || st.nlink !== 1n || st.size < 1n || st.size > BigInt(maxBytes)) fail('SOURCE_FILE_UNSAFE');
  const bytes = Buffer.alloc(Number(st.size));
  let offset = 0;
  while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) fail('SOURCE_CHANGED'); offset += bytesRead; }
  return { bytes, st, digest: sha256(bytes) };
}
async function openProtected(path, maxBytes, owner) {
  let named; try { named = await lstat(path, { bigint: true }); } catch { fail('SOURCE_FILE_UNAVAILABLE'); }
  let handle; try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('SOURCE_FILE_UNSAFE'); }
  try {
    const value = await readHandle(handle, maxBytes);
    if (identity(named) !== identity(value.st) || value.st.uid !== BigInt(owner) || (Number(value.st.mode) & 0o022) !== 0) fail('SOURCE_FILE_UNSAFE');
    return { path, handle, ...value, initialIdentity: identity(value.st) };
  } catch (error) { await handle.close(); throw error; }
}
async function recheckProtected(item) {
  const value = await readHandle(item.handle, item.bytes.length);
  let named; try { named = await lstat(item.path, { bigint: true }); } catch { fail('SOURCE_CHANGED'); }
  if (identity(value.st) !== item.initialIdentity || identity(named) !== item.initialIdentity || !value.bytes.equals(item.bytes) || value.digest !== item.digest) fail('SOURCE_CHANGED');
}
async function safeRoot(path, owner) {
  let st; try { st = await lstat(path, { bigint: true }); } catch { fail('SOURCE_ROOT_UNAVAILABLE'); }
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== BigInt(owner) || (Number(st.mode) & 0o022) !== 0) fail('SOURCE_ROOT_UNSAFE');
}
async function packageMetadata(sourceRoot, packagePath, owner) {
  const dirPath = join(sourceRoot, ...packagePath.split('/'));
  let dst; try { dst = await lstat(dirPath, { bigint: true }); } catch { return null; }
  if (!dst.isDirectory() || dst.isSymbolicLink()) fail('LAYOUT_NODE_UNSAFE');
  const protectedFile = await openProtected(join(dirPath, 'package.json'), 256 * 1024, owner);
  let parsed;
  try { parsed = parseBoundedStrictJson(protectedFile.bytes, { maxBytes: 256 * 1024, maxValues: 10_000 }); } catch { await protectedFile.handle.close(); fail('LAYOUT_PACKAGE_JSON_INVALID'); }
  if (!plain(parsed) || typeof parsed.name !== 'string' || typeof parsed.version !== 'string') { await protectedFile.handle.close(); fail('LAYOUT_PACKAGE_JSON_INVALID'); }
  return { layout: { path: packagePath, name: parsed.name, version: parsed.version }, protectedFile };
}
async function verifyProgram(path, wantedRealpath, wantedSha, wantedMode, owner) {
  let actualRealpath, st;
  try { actualRealpath = await realpath(path); st = await stat(actualRealpath, { bigint: true }); } catch { fail('TOOLCHAIN_UNAVAILABLE'); }
  if (actualRealpath !== wantedRealpath || !st.isFile() || st.nlink !== 1n || st.uid !== BigInt(owner) || (Number(st.mode) & 0o7777) !== wantedMode) fail('TOOLCHAIN_POLICY_MISMATCH');
  const bytes = await openProtected(actualRealpath, 256 * 1024 * 1024, owner);
  try { if (bytes.digest !== wantedSha) fail('TOOLCHAIN_POLICY_MISMATCH'); } finally { await bytes.handle.close(); }
}

async function openVerifiedHelper(path, wantedSha, owner) {
  let named;
  try { named = await lstat(path, { bigint: true }); } catch { fail('TOOLCHAIN_UNAVAILABLE'); }
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('TOOLCHAIN_POLICY_MISMATCH'); }
  try {
    const value = await readHandle(handle, 256 * 1024 * 1024);
    const after = await handle.stat({ bigint: true });
    if (identity(named) !== identity(value.st) || identity(after) !== identity(value.st)
      || value.st.uid !== BigInt(owner) || value.st.nlink !== 1n
      || (Number(value.st.mode) & 0o7777) !== 0o644 || value.digest !== wantedSha) fail('TOOLCHAIN_POLICY_MISMATCH');
    return { path, handle, ...value, initialIdentity: identity(value.st) };
  } catch (error) { await handle.close(); throw error; }
}

async function recheckVerifiedHelper(item) {
  let namedHandle;
  try {
    const held = await readHandle(item.handle, item.bytes.length);
    const heldAfter = await item.handle.stat({ bigint: true });
    const named = await lstat(item.path, { bigint: true });
    namedHandle = await open(item.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await readHandle(namedHandle, item.bytes.length);
    const openedAfter = await namedHandle.stat({ bigint: true });
    if (identity(held.st) !== item.initialIdentity || identity(heldAfter) !== item.initialIdentity
      || identity(named) !== item.initialIdentity || identity(opened.st) !== item.initialIdentity
      || identity(openedAfter) !== item.initialIdentity || !held.bytes.equals(item.bytes)
      || !opened.bytes.equals(item.bytes) || held.digest !== item.digest || opened.digest !== item.digest
      || held.st.uid !== item.st.uid || held.st.nlink !== 1n || (Number(held.st.mode) & 0o7777) !== 0o644) fail('SOURCE_CHANGED');
  } catch (error) {
    if (error?.code === 'SOURCE_CHANGED') throw error;
    fail('SOURCE_CHANGED');
  } finally { await namedHandle?.close(); }
}

async function runBoundedTestHook(hook, value) {
  if (hook === undefined) return;
  if (typeof hook !== 'function') fail('ASSEMBLER_INPUT_INVALID');
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => hook(value)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('TEST_HOOK_TIMEOUT'), { code: 'TEST_HOOK_TIMEOUT' })), 5_000); }),
    ]);
  } finally { clearTimeout(timer); }
}

function childProcess(path, args, { cwd, input, timeoutMs, maxOutput, helperFd, testChildBoundary }) {
  return new Promise((resolveChild) => {
    const stdio = helperFd === undefined ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe', helperFd];
    const child = spawn(path, args, { cwd, env: ENVIRONMENT, stdio, shell: false });
    const stdout = []; const stderr = []; let out = 0; let killedForOutput = false; let timedOut = false; let stdinFailed = false; let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolveChild(value); } };
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) stream.on('data', (chunk) => { out += chunk.length; if (out > maxOutput) { killedForOutput = true; child.kill('SIGKILL'); } else chunks.push(chunk); });
    child.stdin.on('error', () => { stdinFailed = true; child.kill('SIGKILL'); });
    child.on('error', () => { clearTimeout(timer); finish({ error: true, stdinFailed }); });
    child.on('close', (status, signal) => { clearTimeout(timer); finish({ status, signal, timedOut, killedForOutput, stdinFailed, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }); });
    try {
      if (testChildBoundary !== undefined) {
        if (typeof testChildBoundary !== 'function') throw new TypeError('invalid test child boundary');
        testChildBoundary(child);
      }
      child.stdin.end(input);
    } catch { stdinFailed = true; child.kill('SIGKILL'); }
  });
}
async function verifyPython(deps, cwd) {
  await verifyProgram(deps.pythonPath, deps.pythonRealpath, deps.pythonSha256, 0o755, 0);
  const result = await childProcess(deps.pythonPath, ['--version'], { cwd, input: Buffer.alloc(0), timeoutMs: 5_000, maxOutput: 1024 });
  const version = Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]).toString('utf8').trim();
  if (result.status !== 0 || version !== deps.pythonVersion) fail('TOOLCHAIN_POLICY_MISMATCH');
}
function validateHelperResult(bytes, frame, expected) {
  if (bytes.length < 3 || bytes.length > MAX_HELPER_OUTPUT || bytes.at(-1) !== 0x0a) fail('HELPER_PROTOCOL');
  let value; try { value = JSON.parse(bytes); } catch { fail('HELPER_PROTOCOL'); }
  if (!canonical(value).equals(bytes)) fail('HELPER_PROTOCOL');
  if (plain(value) && Object.keys(value).length === 1 && typeof value.error === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value.error)) fail('HELPER_FAILED');
  exact(value, ['schemaVersion','packageCount','nodeCount','payloadBytes','entries','sourceSnapshotSha256'], 'HELPER_PROTOCOL');
  if (value.schemaVersion !== STAGING_COPY_SCHEMA || value.packageCount !== frame.selectedPackagePaths.length || !Number.isInteger(value.nodeCount) || value.nodeCount !== value.entries?.length || !Number.isInteger(value.payloadBytes) || !/^sha256:[a-f0-9]{64}$/u.test(value.sourceSnapshotSha256)) fail('HELPER_RESULT_MISMATCH');
  const byPath = new Map(); let previous;
  for (const entry of value.entries) {
    exact(entry, entry.type === 'file' ? ['path','type','mode','sha256'] : ['path','type','mode'], 'HELPER_PROTOCOL');
    if (previous !== undefined && rawCompare(previous, entry.path) >= 0) fail('HELPER_PROTOCOL'); previous = entry.path;
    if (byPath.has(entry.path)) fail('HELPER_PROTOCOL'); byPath.set(entry.path, entry);
  }
  for (const [path, hash, mode] of expected) { const entry = byPath.get(path); if (entry?.type !== 'file' || entry.mode !== mode || entry.sha256 !== hash) fail('HELPER_RESULT_MISMATCH'); }
  return Object.freeze({ packageCount: value.packageCount, nodeCount: value.nodeCount, payloadBytes: value.payloadBytes, sourceSnapshotSha256: value.sourceSnapshotSha256 });
}

const PRODUCTION_DEPS = Object.freeze({ helperPath: HELPER_PATH, helperSha256: HELPER_SHA256, pythonPath: PYTHON_PATH, pythonRealpath: PYTHON_REALPATH, pythonSha256: PYTHON_SHA256, pythonVersion: PYTHON_VERSION, declaration: ACQUISITION_DECLARATION, parseLock: parseAndValidateLockfile, timeoutMs: HELPER_TIMEOUT_MS, maxOutput: MAX_HELPER_OUTPUT });

export function createStagingAssemblerForTests(overrides = {}) {
  const { beforeHelperSpawn, testChildBoundary, ...dependencyOverrides } = overrides;
  const testHooks = Object.freeze({ beforeHelperSpawn, testChildBoundary });
  return (input) => assembleProviderBundleStaging(input, { ...PRODUCTION_DEPS, ...dependencyOverrides }, testHooks);
}
export async function assembleProviderBundleStagingProduction(input) { return assembleProviderBundleStaging(input, PRODUCTION_DEPS); }

async function assembleProviderBundleStaging({ provider, sourceRoot, destinationRoot } = {}, deps, testHooks) {
  if (!Object.hasOwn(PROVIDER_LIMITS, provider) || !absolute(sourceRoot) || !absolute(destinationRoot) || sourceRoot === destinationRoot || destinationRoot.startsWith(`${sourceRoot}/`)) fail('ASSEMBLER_INPUT_INVALID');
  const owner = process.getuid();
  await safeRoot(sourceRoot, owner);
  let destinationParent; try { destinationParent = await lstat(dirname(destinationRoot), { bigint: true }); } catch { fail('DESTINATION_PARENT_UNSAFE'); }
  if (!destinationParent.isDirectory() || destinationParent.uid !== BigInt(owner) || (Number(destinationParent.mode) & 0o077) !== 0) fail('DESTINATION_PARENT_UNSAFE');
  try { await lstat(destinationRoot); fail('DESTINATION_COLLISION'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const held = [];
  const cwd = await mkdtemp(join(tmpdir(), 'wordle-g0-assembler-'));
  await chmod(cwd, 0o700);
  try {
    const rootPackage = await openProtected(join(sourceRoot, 'package.json'), 16 * 1024, owner); held.push(rootPackage);
    const lockfile = await openProtected(join(sourceRoot, 'package-lock.json'), 256 * 1024, owner); held.push(lockfile);
    const { lock } = deps.parseLock(lockfile.bytes, rootPackage.bytes, deps.declaration);
    const layout = [];
    for (const packagePath of Object.keys(lock.packages).filter(Boolean).sort(rawCompare)) {
      const metadata = await packageMetadata(sourceRoot, packagePath, owner);
      if (metadata) { layout.push(metadata.layout); held.push(metadata.protectedFile); }
    }
    const closure = resolveProviderLockClosure({ provider, lock, physicalLayout: layout, declaration: deps.declaration });
    const profile = generateProviderBundleProfile(provider);
    if (profile.sha256 !== sha256(profile.bytes) || profile.bytes.length > 256 * 1024) fail('PROFILE_POLICY_MISMATCH');
    const nativeExecutablePaths = [...NATIVE[provider]];
    if (nativeExecutablePaths.some((path) => !closure.paths.some((pkg) => path.startsWith(`${pkg}/`)))) fail('NATIVE_POLICY_MISMATCH');
    const generatedFiles = [
      { path: 'package-lock.json', bytesBase64: lockfile.bytes.toString('base64'), mode: 0o444 },
      { path: profile.relativePath, bytesBase64: profile.bytes.toString('base64'), mode: 0o444 },
    ].sort((a, b) => rawCompare(a.path, b.path));
    const policy = deps.declaration.providerLimits[provider];
    const frame = { schemaVersion: STAGING_COPY_SCHEMA, sourceRoot, destinationRoot, selectedPackagePaths: closure.paths, installedPackagePaths: layout.map((x) => x.path).sort(rawCompare), nativeExecutablePaths, generatedFiles, limits: { maxPackages: policy.maxPackages, maxNodes: policy.maxNodes, maxSourceNodes: 12_000, maxPayloadBytes: policy.maxPayloadBytes, maxFileBytes: 224 * 1024 * 1024, maxPathBytes: 1024, maxComponentBytes: 255, maxFrameBytes: 1024 * 1024 } };
    const frameBytes = canonical(frame); if (frameBytes.length > frame.limits.maxFrameBytes) fail('FRAME_LIMIT');
    const helper = await openVerifiedHelper(deps.helperPath, deps.helperSha256, owner);
    let child;
    try {
      await runBoundedTestHook(testHooks?.beforeHelperSpawn, Object.freeze({ helperPath: deps.helperPath }));
      await recheckVerifiedHelper(helper);
      await verifyPython(deps, cwd);
      child = await childProcess(deps.pythonPath, ['-I', '-S', '-B', '/proc/self/fd/3'], { cwd, input: frameBytes, timeoutMs: deps.timeoutMs, maxOutput: deps.maxOutput, helperFd: helper.handle.fd, testChildBoundary: testHooks?.testChildBoundary });
      await recheckVerifiedHelper(helper);
    } finally { await helper.handle.close(); }
    if (child.error || child.timedOut) fail('HELPER_TIMEOUT');
    if (child.killedForOutput) fail('HELPER_OUTPUT_LIMIT');
    if (child.stdinFailed || child.status !== 0 || child.signal !== null || child.stderr.length !== 0) fail('HELPER_FAILED');
    const expected = [['package-lock.json', lockfile.digest, 0o444], [profile.relativePath, profile.sha256, 0o444]];
    for (const packagePath of closure.paths) {
      const item = held.find((x) => x.path === join(sourceRoot, ...packagePath.split('/'), 'package.json'));
      expected.push([`${packagePath}/package.json`, item.digest, 0o444]);
    }
    for (const nativePath of nativeExecutablePaths) {
      const source = await openProtected(join(sourceRoot, ...nativePath.split('/')), 224 * 1024 * 1024, owner);
      try { expected.push([nativePath, source.digest, 0o555]); } finally { await source.handle.close(); }
    }
    const result = validateHelperResult(child.stdout, frame, expected);
    for (const item of held) await recheckProtected(item);
    return Object.freeze({ status: 'STAGED', provider, ...result });
  } finally {
    await Promise.allSettled(held.map((item) => item.handle.close()));
    await rm(cwd, { recursive: true, force: true });
  }
}
