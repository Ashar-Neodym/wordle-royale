import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import {
  ACQUISITION_DECLARATION, parseAndValidateLockfile, parseBoundedStrictJson,
  resolveProviderLockClosure,
} from './g0-provider-bundle-assembler-core.mjs';
import { compileCanonicalSourceSnapshot } from './g0-provider-bundle-publication-schema.mjs';

const MAX_FILE_BYTES = 224 * 1024 * 1024;
const MAX_NODES = 20_000;
const MAX_PATH_BYTES = 1024;
const MAX_COMPONENT_BYTES = 255;
const PACKAGE_JSON_MAX = 256 * 1024;
const NATIVE_PATHS = new Set([
  'node_modules/@railway/cli/bin/railway',
  'node_modules/@supabase/cli-linux-x64/bin/supabase',
]);
const SOURCE_EXECUTABLE_PATHS = new Set([
  'node_modules/vercel/dist/vc.js',
  'node_modules/@railway/cli/bin/railway.js',
  'node_modules/@railway/cli/bin/railway',
  'node_modules/supabase/dist/supabase.js',
  'node_modules/@supabase/cli-linux-x64/bin/supabase',
]);
const DIR_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const rawCompare = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const anchor = (handle) => `/proc/self/fd/${handle.fd}`;
const childAt = (handle, name) => `${anchor(handle)}/${name}`;
const identity = (st) => [st.dev, st.ino, st.mode, st.nlink, st.uid, st.gid, st.size, st.blocks, st.ctimeNs, st.mtimeNs].map(String).join(':');
const inode = (st) => `${st.dev}:${st.ino}`;
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function exact(value, fields, code) {
  if (!plain(value) || Object.keys(value).sort(rawCompare).join('\0') !== [...fields].sort(rawCompare).join('\0')) fail(code);
}
function absoluteNormalized(value) {
  return typeof value === 'string' && isAbsolute(value) && value !== '/' && !value.includes('\0')
    && !value.includes('\\') && resolve(value) === value;
}
function validPath(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\0') || path.includes('\\')) fail('SOURCE_PATH_INVALID');
  const parts = path.split('/');
  if (Buffer.byteLength(path) > MAX_PATH_BYTES || parts.some((part) => !part || part === '.' || part === '..' || Buffer.byteLength(part) > MAX_COMPONENT_BYTES)) fail('SOURCE_PATH_INVALID');
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function statType(st) {
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isDirectory()) return 'directory';
  if (st.isFile()) return 'file';
  return 'special';
}
async function namesIn(handle) {
  let values;
  try { values = await readdir(anchor(handle), { encoding: 'buffer' }); } catch { fail('SOURCE_CHANGED'); }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const folded = new Set();
  const names = values.map((bytes) => {
    let name; try { name = decoder.decode(bytes); } catch { fail('SOURCE_PATH_ENCODING_INVALID'); }
    if (!Buffer.from(name).equals(bytes) || !name || name === '.' || name === '..' || name.includes('/') || name.includes('\0') || bytes.length > MAX_COMPONENT_BYTES) fail('SOURCE_PATH_INVALID');
    const key = name.toLowerCase(); if (folded.has(key)) fail('SOURCE_CASE_COLLISION'); folded.add(key);
    return name;
  });
  return names.sort(rawCompare);
}
function validateNode(st, rootDev, wantedType) {
  if (st.dev !== rootDev) fail('SOURCE_MOUNT_CROSSING');
  if (statType(st) !== wantedType) fail(wantedType === 'file' ? 'SOURCE_SPECIAL_FORBIDDEN' : 'SOURCE_DIRECTORY_INVALID');
  if ((Number(st.mode) & 0o7000) !== 0 || (Number(st.mode) & 0o022) !== 0) fail('SOURCE_MODE_INVALID');
  if (wantedType === 'file') {
    if (st.nlink !== 1n) fail('SOURCE_HARDLINK_FORBIDDEN');
    if (st.size > BigInt(MAX_FILE_BYTES)) fail('SOURCE_FILE_LIMIT');
    if (st.size > 0n && st.blocks * 512n < st.size) fail('SOURCE_SPARSE_FORBIDDEN');
  } else if (st.nlink < 2n) fail('SOURCE_DIRECTORY_INVALID');
}
async function openDirectoryAt(parent, name, rootDev) {
  let named; try { named = await lstat(childAt(parent, name), { bigint: true }); } catch { fail('SOURCE_CHANGED'); }
  if (named.isSymbolicLink()) fail('SOURCE_SYMLINK_FORBIDDEN');
  validateNode(named, rootDev, 'directory');
  let handle; try { handle = await open(childAt(parent, name), DIR_FLAGS); } catch { fail('SOURCE_CHANGED'); }
  const held = await handle.stat({ bigint: true }).catch(() => fail('SOURCE_CHANGED'));
  if (identity(named) !== identity(held)) { await handle.close(); fail('SOURCE_CHANGED'); }
  return { handle, identity: identity(held), stat: held };
}
async function readFileAt(parent, name, rootDev, maxBytes = MAX_FILE_BYTES) {
  let named; try { named = await lstat(childAt(parent, name), { bigint: true }); } catch { fail('SOURCE_FILE_UNAVAILABLE'); }
  if (named.isSymbolicLink()) fail('SOURCE_SYMLINK_FORBIDDEN');
  validateNode(named, rootDev, 'file');
  if (named.size > BigInt(maxBytes)) fail('SOURCE_FILE_LIMIT');
  let handle; try { handle = await open(childAt(parent, name), FILE_FLAGS); } catch { fail('SOURCE_CHANGED'); }
  try {
    const before = await handle.stat({ bigint: true });
    if (identity(named) !== identity(before)) fail('SOURCE_CHANGED');
    const hash = createHash('sha256'); const chunks = []; const buffer = Buffer.allocUnsafe(64 * 1024); let offset = 0;
    while (offset < Number(before.size)) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, Number(before.size) - offset), offset);
      if (!bytesRead) fail('SOURCE_CHANGED'); const chunk = Buffer.from(buffer.subarray(0, bytesRead)); chunks.push(chunk); hash.update(chunk); offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const namedAfter = await lstat(childAt(parent, name), { bigint: true }).catch(() => fail('SOURCE_CHANGED'));
    if (identity(before) !== identity(after) || identity(before) !== identity(namedAfter)) fail('SOURCE_CHANGED');
    return { bytes: Buffer.concat(chunks), sha256: `sha256:${hash.digest('hex')}`, identity: identity(before), inode: inode(before), mode: Number(before.mode & 0o7777n), size: Number(before.size), handle };
  } catch (error) { await handle.close(); throw error; }
}
async function recheckFile(parent, name, item) {
  const held = await item.handle.stat({ bigint: true }).catch(() => fail('SOURCE_CHANGED'));
  const named = await lstat(childAt(parent, name), { bigint: true }).catch(() => fail('SOURCE_CHANGED'));
  if (identity(held) !== item.identity || identity(named) !== item.identity) fail('SOURCE_CHANGED');
}
async function secureOpenPath(root, relativePath) {
  const handles = []; let current = root;
  try {
    for (const part of relativePath.split('/')) { const opened = await openDirectoryAt(current, part, (await root.stat({ bigint: true })).dev); handles.push(opened.handle); current = opened.handle; }
    return { handle: current, handles };
  } catch (error) { await Promise.allSettled(handles.map((h) => h.close())); throw error; }
}
function packageCandidate(parentPath, name) {
  const parts = parentPath.split('/');
  if (parts.at(-1) === 'node_modules') return !name.startsWith('@') && name !== '.bin' && name !== '.package-lock.json';
  return parts.length >= 2 && parts.at(-2) === 'node_modules' && parts.at(-1).startsWith('@');
}

async function discoverPhysicalPackages(rootHeld, rootDev) {
  const found = []; const heldPackages = new Map(); const seenDirs = new Set(); let discoveryNodes = 0;
  const visit = async (opened, path) => {
    const key = inode(opened.stat); if (seenDirs.has(key)) fail('SOURCE_DIRECTORY_ALIAS'); seenDirs.add(key);
    const beforeNames = await namesIn(opened.handle); const beforeIdentity = opened.identity;
    for (const name of beforeNames) {
      discoveryNodes += 1; if (discoveryNodes > MAX_NODES * 4) fail('SOURCE_DISCOVERY_LIMIT');
      if (name === '.bin' && path.split('/').at(-1) === 'node_modules') continue;
      if (path === 'node_modules' && name === '.package-lock.json') continue;
      const childPath = `${path}/${name}`; validPath(childPath);
      let st; try { st = await lstat(childAt(opened.handle, name), { bigint: true }); } catch { fail('SOURCE_CHANGED'); }
      if (st.isSymbolicLink()) fail('SOURCE_SYMLINK_FORBIDDEN');
      if (!st.isDirectory()) {
        if (packageCandidate(path, name)) fail('SOURCE_PACKAGE_ROOT_INVALID');
        if (!st.isFile()) fail('SOURCE_SPECIAL_FORBIDDEN');
        validateNode(st, rootDev, 'file');
        continue;
      }
      const child = await openDirectoryAt(opened.handle, name, rootDev);
      try {
        if (packageCandidate(path, name)) {
          const packageFile = await readFileAt(child.handle, 'package.json', rootDev, PACKAGE_JSON_MAX);
          let manifest;
          try {
            try { manifest = parseBoundedStrictJson(packageFile.bytes, { maxBytes: PACKAGE_JSON_MAX, maxValues: 10_000 }); } catch { fail('SOURCE_PACKAGE_JSON_INVALID'); }
            if (!plain(manifest) || typeof manifest.name !== 'string' || typeof manifest.version !== 'string') fail('SOURCE_PACKAGE_JSON_INVALID');
            await recheckFile(child.handle, 'package.json', packageFile);
          } finally { await packageFile.handle.close(); }
          found.push({ path: childPath, name: manifest.name, version: manifest.version });
          heldPackages.set(childPath, { handle: child.handle, identity: child.identity, stat: child.stat });
        }
        await visit(child, childPath);
        const after = await child.handle.stat({ bigint: true }).catch(() => fail('SOURCE_CHANGED'));
        const namedAfter = await lstat(childAt(opened.handle, name), { bigint: true }).catch(() => fail('SOURCE_CHANGED'));
        if (identity(after) !== child.identity || identity(namedAfter) !== child.identity) fail('SOURCE_CHANGED');
      } finally { if (!heldPackages.has(childPath)) await child.handle.close(); }
    }
    const afterNames = await namesIn(opened.handle); const after = await opened.handle.stat({ bigint: true }).catch(() => fail('SOURCE_CHANGED'));
    if (beforeNames.join('\0') !== afterNames.join('\0') || identity(after) !== beforeIdentity) fail('SOURCE_CHANGED');
  };
  let modules;
  try { modules = await openDirectoryAt(rootHeld, 'node_modules', rootDev); } catch (error) { if (error?.code === 'SOURCE_FILE_UNAVAILABLE') fail('SOURCE_LAYOUT_MISSING'); throw error; }
  try { await visit(modules, 'node_modules'); }
  catch (error) { await Promise.allSettled([...heldPackages.values()].map((item) => item.handle.close())); throw error; }
  finally { await modules.handle.close(); }
  found.sort((a, b) => rawCompare(a.path, b.path));
  const folded = new Set(); for (const item of found) { const key = item.path.toLowerCase(); if (folded.has(key)) fail('SOURCE_CASE_COLLISION'); folded.add(key); }
  return { layout: found, heldPackages };
}

async function scanPackages(packagePaths, heldPackages, rootDev) {
  const entries = []; const fileInodes = new Set(); const folded = new Set(); let payloadBytes = 0;
  const packageSet = new Set(packagePaths);
  const add = (entry) => {
    validPath(entry.path); const key = entry.path.toLowerCase(); if (folded.has(key)) fail('SOURCE_CASE_COLLISION'); folded.add(key);
    entries.push(entry); if (entries.length > MAX_NODES) fail('SOURCE_SNAPSHOT_NODE_LIMIT');
  };
  const visit = async (opened, path) => {
    add({ mode: 0o555, path, type: 'directory' });
    const namesBefore = await namesIn(opened.handle);
    for (const name of namesBefore) {
      if (name === '.bin' && path.split('/').at(-1) === 'node_modules') continue;
      const childPath = `${path}/${name}`;
      if (packageSet.has(childPath)) continue;
      let named; try { named = await lstat(childAt(opened.handle, name), { bigint: true }); } catch { fail('SOURCE_CHANGED'); }
      if (named.isSymbolicLink()) fail('SOURCE_SYMLINK_FORBIDDEN');
      if (named.isDirectory()) {
        const child = await openDirectoryAt(opened.handle, name, rootDev);
        try {
          await visit(child, childPath);
          const heldAfter = await child.handle.stat({ bigint: true }).catch(() => fail('SOURCE_CHANGED'));
          const namedAfter = await lstat(childAt(opened.handle, name), { bigint: true }).catch(() => fail('SOURCE_CHANGED'));
          if (identity(heldAfter) !== child.identity || identity(namedAfter) !== child.identity) fail('SOURCE_CHANGED');
        } finally { await child.handle.close(); }
      } else {
        const item = await readFileAt(opened.handle, name, rootDev);
        try {
          const allowedModes = new Set([0o600, 0o644, 0o700, 0o755]);
          if (!allowedModes.has(item.mode)) fail('SOURCE_MODE_INVALID');
          if (fileInodes.has(item.inode)) fail('SOURCE_HARDLINK_FORBIDDEN'); fileInodes.add(item.inode);
          payloadBytes += item.size; if (!Number.isSafeInteger(payloadBytes)) fail('SOURCE_PAYLOAD_LIMIT');
          add({ mode: NATIVE_PATHS.has(childPath) ? 0o555 : 0o444, path: childPath, sha256: item.sha256, type: 'file' });
        } finally { await item.handle.close(); }
      }
    }
    const namesAfter = await namesIn(opened.handle); const heldAfter = await opened.handle.stat({ bigint: true }).catch(() => fail('SOURCE_CHANGED'));
    if (namesBefore.join('\0') !== namesAfter.join('\0') || identity(heldAfter) !== opened.identity) fail('SOURCE_CHANGED');
  };
  for (const path of packagePaths) await visit(heldPackages.get(path), path);
  entries.sort((a, b) => rawCompare(a.path, b.path));
  return { entries, payloadBytes };
}
function scanWitness(scan) { return JSON.stringify(scan); }
async function assertRootAndParent(sourceRoot, parentPath, rootHeld, parentHeld, parentParentHeld) {
  const rootNow = await rootHeld.handle.stat({ bigint: true }).catch(() => fail('SOURCE_ROOT_CHANGED'));
  const rootNamed = await lstat(childAt(parentHeld.handle, basename(sourceRoot)), { bigint: true }).catch(() => fail('SOURCE_ROOT_CHANGED'));
  if (identity(rootNow) !== rootHeld.identity || identity(rootNamed) !== rootHeld.identity) fail('SOURCE_ROOT_CHANGED');
  const parentNow = await parentHeld.handle.stat({ bigint: true }).catch(() => fail('SOURCE_PARENT_CHANGED'));
  const parentNamed = await lstat(childAt(parentParentHeld.handle, basename(parentPath)), { bigint: true }).catch(() => fail('SOURCE_PARENT_CHANGED'));
  if (identity(parentNow) !== parentHeld.identity || identity(parentNamed) !== parentHeld.identity) fail('SOURCE_PARENT_CHANGED');
}

// Node has no listxattr/fgetxattr API. This scanner attests every filesystem
// property Node exposes (including blocks for sparse-file detection); AN-2 remains
// the enforcement boundary for source xattrs on platforms where Node cannot attest.
export async function scanCanonicalProviderBundleSourceSnapshot(input) {
  if (arguments.length !== 1) fail('SOURCE_SNAPSHOT_INPUT_INVALID');
  exact(input, ['sourceRoot'], 'SOURCE_SNAPSHOT_INPUT_INVALID');
  const { sourceRoot } = input; if (!absoluteNormalized(sourceRoot)) fail('SOURCE_SNAPSHOT_INPUT_INVALID');
  const uidNumber = process.getuid?.(); if (!Number.isInteger(uidNumber)) fail('SOURCE_UID_UNAVAILABLE'); const uid = BigInt(uidNumber);
  const parentPath = dirname(sourceRoot);
  const parentParentPath = dirname(parentPath);
  let parentParentHandle; try { parentParentHandle = await open(parentParentPath, DIR_FLAGS); } catch { fail('SOURCE_PARENT_UNSAFE'); }
  let parentNamed; try { parentNamed = await lstat(childAt(parentParentHandle, basename(parentPath)), { bigint: true }); } catch { await parentParentHandle.close(); fail('SOURCE_PARENT_UNSAFE'); }
  if (!parentNamed.isDirectory() || parentNamed.isSymbolicLink() || parentNamed.uid !== uid || parentNamed.nlink < 2n || (Number(parentNamed.mode) & 0o022) !== 0 || await realpath(parentPath).catch(() => '') !== parentPath) { await parentParentHandle.close(); fail('SOURCE_PARENT_UNSAFE'); }
  let parentHandle; try { parentHandle = await open(childAt(parentParentHandle, basename(parentPath)), DIR_FLAGS); } catch { await parentParentHandle.close(); fail('SOURCE_PARENT_UNSAFE'); }
  let rootHandle; const heldFiles = []; let packages;
  try {
    const parentHeldStat = await parentHandle.stat({ bigint: true }); if (identity(parentHeldStat) !== identity(parentNamed)) fail('SOURCE_PARENT_UNSAFE');
    const parentHeld = { handle: parentHandle, identity: identity(parentHeldStat) };
    const parentParentHeld = { handle: parentParentHandle };
    let rootNamed; try { rootNamed = await lstat(childAt(parentHandle, basename(sourceRoot)), { bigint: true }); } catch { fail('SOURCE_ROOT_UNSAFE'); }
    if (!rootNamed.isDirectory() || rootNamed.isSymbolicLink() || rootNamed.uid !== uid || rootNamed.nlink < 2n || (Number(rootNamed.mode) & 0o7777) !== 0o700 || rootNamed.dev !== parentNamed.dev || await realpath(sourceRoot).catch(() => '') !== sourceRoot) fail('SOURCE_ROOT_UNSAFE');
    rootHandle = await open(childAt(parentHandle, basename(sourceRoot)), DIR_FLAGS).catch(() => fail('SOURCE_ROOT_UNSAFE'));
    const rootStat = await rootHandle.stat({ bigint: true }); if (identity(rootStat) !== identity(rootNamed)) fail('SOURCE_ROOT_UNSAFE');
    const rootHeld = { handle: rootHandle, identity: identity(rootStat) }; const rootDev = rootStat.dev;
    const packageJson = await readFileAt(rootHandle, 'package.json', rootDev, 16 * 1024); heldFiles.push(['package.json', packageJson]);
    const lockfile = await readFileAt(rootHandle, 'package-lock.json', rootDev, 256 * 1024); heldFiles.push(['package-lock.json', lockfile]);
    const { lock } = parseAndValidateLockfile(lockfile.bytes, packageJson.bytes, ACQUISITION_DECLARATION);
    packages = await discoverPhysicalPackages(rootHandle, rootDev);
    const closures = ['vercel', 'railway', 'supabase'].map((provider) => resolveProviderLockClosure({ provider, lock, physicalLayout: packages.layout, declaration: ACQUISITION_DECLARATION }));
    const packagePaths = [...new Set(closures.flatMap((closure) => closure.paths))].sort(rawCompare);
    const installed = packages.layout.map((item) => item.path);
    if (packagePaths.length !== installed.length || packagePaths.some((path, index) => path !== installed[index])) fail('SOURCE_LAYOUT_UNION_MISMATCH');
    const first = await scanPackages(packagePaths, packages.heldPackages, rootDev);
    await assertRootAndParent(sourceRoot, parentPath, rootHeld, parentHeld, parentParentHeld);
    const second = await scanPackages(packagePaths, packages.heldPackages, rootDev);
    if (scanWitness(first) !== scanWitness(second)) fail('SOURCE_SNAPSHOT_SCAN_MISMATCH');
    for (const [name, item] of heldFiles) await recheckFile(rootHandle, name, item);
    for (const path of packagePaths) {
      const secured = await secureOpenPath(rootHandle, path);
      try { if (identity(await secured.handle.stat({ bigint: true })) !== packages.heldPackages.get(path).identity) fail('SOURCE_PACKAGE_ROOT_CHANGED'); }
      finally { await Promise.allSettled(secured.handles.map((handle) => handle.close())); }
    }
    const compilation = compileCanonicalSourceSnapshot({ entries: second.entries, packagePaths, schemaVersion: 'wordle-royale-g0-canonical-source-snapshot/v1', target: { cpu: 'x64', libc: 'glibc', os: 'linux' } });
    const heldBytes = compilation.bytes;
    const result = { status: 'SOURCE_SNAPSHOT_VALID', canonicalSourceSnapshotSha256: compilation.sha256, snapshot: compilation.document, packageCount: packagePaths.length, nodeCount: second.entries.length, payloadBytes: second.payloadBytes };
    Object.defineProperty(result, 'snapshotBytes', { enumerable: true, get: () => Buffer.from(heldBytes) });
    // Keep the final named root and parent checks immediately before acceptance.
    await assertRootAndParent(sourceRoot, parentPath, rootHeld, parentHeld, parentParentHeld);
    return deepFreeze(result);
  } finally {
    await Promise.allSettled(heldFiles.map(([, item]) => item.handle.close()));
    await Promise.allSettled([...(packages?.heldPackages.values() ?? [])].map((item) => item.handle.close()));
    await Promise.allSettled([rootHandle?.close(), parentHandle.close(), parentParentHandle.close()]);
  }
}
