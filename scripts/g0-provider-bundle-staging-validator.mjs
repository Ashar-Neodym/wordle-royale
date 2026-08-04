import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, posix, resolve } from 'node:path';
import { parseBoundedStrictJson } from './g0-provider-bundle-assembler-core.mjs';
import { generateProviderBundleArtifacts, PROVIDER_BUNDLE_COPY_SCHEMA } from './g0-provider-bundle-artifact-core.mjs';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import {
  canonicalProviderToolJson, getProviderToolArtifactPolicy, sha256ProviderTool,
  validateProviderToolDescriptor, validateProviderToolTreeManifest,
} from './g0-provider-tool-bundle.mjs';

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const MAX_FILE_BYTES = 224 * 1024 * 1024;
const MAX_PATH_BYTES = 1024;
const MAX_COMPONENT_BYTES = 255;
const READ_LIMIT = 256 * 1024;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const rawCompare = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const exact = (value, keys, code) => {
  if (!plain(value) || Object.keys(value).sort(rawCompare).join('\0') !== [...keys].sort(rawCompare).join('\0')) fail(code);
};
const metadata = (st) => [st.dev, st.ino, st.mode, st.nlink, st.uid, st.gid, st.size, st.ctimeNs, st.mtimeNs].map(String).join(':');
const absoluteNormalized = (value) => typeof value === 'string' && !value.includes('\0') && isAbsolute(value) && resolve(value) === value && value !== '/';
const canonicalBytes = (value) => Buffer.from(`${canonicalProviderToolJson(value)}\n`, 'utf8');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validRelativePath(path) {
  if (path === '.') return;
  if (typeof path !== 'string' || path.length === 0 || path.includes('\0') || path.includes('\\')
      || path.startsWith('/') || posix.normalize(path) !== path
      || path.split('/').some((part) => !part || part === '.' || part === '..')) fail('STAGING_PATH_INVALID');
  if (Buffer.byteLength(path, 'utf8') > MAX_PATH_BYTES) fail('STAGING_PATH_LIMIT');
  if (path.split('/').some((part) => Buffer.byteLength(part, 'utf8') > MAX_COMPONENT_BYTES)) fail('STAGING_COMPONENT_LIMIT');
}

function validateAssembly(provider, value, policy) {
  exact(value, ['status', 'provider', 'packageCount', 'nodeCount', 'payloadBytes', 'sourceSnapshotSha256'], 'STAGING_ASSEMBLY_RESULT_INVALID');
  if (value.status !== 'STAGED' || value.provider !== provider
      || !Number.isSafeInteger(value.packageCount) || value.packageCount < 1 || value.packageCount > policy.limits.maxPackages
      || !Number.isSafeInteger(value.nodeCount) || value.nodeCount < 2 || value.nodeCount > policy.limits.maxNodes
      || !Number.isSafeInteger(value.payloadBytes) || value.payloadBytes < 0 || value.payloadBytes > policy.limits.maxPayloadBytes
      || typeof value.sourceSnapshotSha256 !== 'string' || !SHA256.test(value.sourceSnapshotSha256)) fail('STAGING_ASSEMBLY_RESULT_INVALID');
}

// Linux exposes an already-open directory as a stable directory anchor here.
// Descendants are always addressed below one of these held descriptors; no
// recursive operation reconstructs a path below stagingRoot.
const fdAnchor = (handle) => `/proc/self/fd/${handle.fd}`;
const childAt = (parent, name) => `${fdAnchor(parent)}/${name}`;

async function openDirectory(parent, name, uid, wantedMode, rootDev) {
  const anchoredPath = childAt(parent, name);
  let named;
  try { named = await lstat(anchoredPath, { bigint: true }); } catch { fail('STAGING_FILESYSTEM_CHANGED'); }
  if (!named.isDirectory() || named.isSymbolicLink()) fail('STAGING_NODE_TYPE_INVALID');
  let handle;
  try { handle = await open(anchoredPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); } catch { fail('STAGING_FILESYSTEM_CHANGED'); }
  try {
    const held = await handle.stat({ bigint: true });
    if (metadata(named) !== metadata(held) || held.uid !== uid || held.dev !== rootDev || held.nlink < 1n
        || (Number(held.mode) & 0o7777) !== wantedMode) fail('STAGING_DIRECTORY_POLICY');
    return { handle, identity: metadata(held) };
  } catch (error) { await handle.close(); throw error; }
}

async function namesIn(handle) {
  let buffers;
  try { buffers = await readdir(fdAnchor(handle), { encoding: 'buffer' }); } catch { fail('STAGING_FILESYSTEM_CHANGED'); }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const names = buffers.map((bytes) => {
    let name; try { name = decoder.decode(bytes); } catch { fail('STAGING_PATH_ENCODING_INVALID'); }
    if (Buffer.from(name, 'utf8').compare(bytes) !== 0 || !name || name === '.' || name === '..' || name.includes('/') || name.includes('\0')) fail('STAGING_PATH_INVALID');
    if (bytes.length > MAX_COMPONENT_BYTES) fail('STAGING_COMPONENT_LIMIT');
    return name;
  }).sort(rawCompare);
  if (new Set(names).size !== names.length) fail('STAGING_PATH_COLLISION');
  return names;
}

async function readRegularFile(parent, name, relativePath, uid, rootDev, wantedMode, capture) {
  const anchoredPath = childAt(parent, name);
  let named;
  try { named = await lstat(anchoredPath, { bigint: true }); } catch { fail('STAGING_FILESYSTEM_CHANGED'); }
  if (named.isSymbolicLink()) fail('STAGING_SYMLINK_FORBIDDEN');
  if (!named.isFile()) fail('STAGING_SPECIAL_FILE_FORBIDDEN');
  let handle;
  try { handle = await open(anchoredPath, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('STAGING_FILESYSTEM_CHANGED'); }
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || metadata(named) !== metadata(before)) fail('STAGING_FILESYSTEM_CHANGED');
    if (before.dev !== rootDev) fail('STAGING_MOUNT_CROSSING');
    if (before.uid !== uid || before.nlink !== 1n || (Number(before.mode) & 0o7777) !== wantedMode) fail('STAGING_FILE_POLICY');
    if (before.size > BigInt(MAX_FILE_BYTES)) fail('STAGING_FILE_LIMIT');
    const digest = createHash('sha256');
    const chunks = capture && before.size <= BigInt(READ_LIMIT) ? [] : null;
    const buffer = Buffer.allocUnsafe(64 * 1024); let position = 0;
    while (position < Number(before.size)) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, Number(before.size) - position), position);
      if (bytesRead === 0) fail('STAGING_FILESYSTEM_CHANGED');
      const chunk = buffer.subarray(0, bytesRead); digest.update(chunk); if (chunks) chunks.push(Buffer.from(chunk)); position += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    let namedAfter; try { namedAfter = await lstat(anchoredPath, { bigint: true }); } catch { fail('STAGING_FILESYSTEM_CHANGED'); }
    if (metadata(before) !== metadata(after) || metadata(before) !== metadata(namedAfter)) fail('STAGING_FILESYSTEM_CHANGED');
    return { entry: { path: relativePath, type: 'file', mode: wantedMode, sha256: `sha256:${digest.digest('hex')}` }, size: Number(before.size), identity: metadata(before), bytes: chunks ? Buffer.concat(chunks) : undefined };
  } finally { await handle.close(); }
}

function isPackageRoot(path) {
  if (path === '.') return false;
  const parts = path.split('/'); const n = parts.length;
  return n >= 2 && ((parts[n - 2] === 'node_modules' && !parts[n - 1].startsWith('@'))
    || (n >= 3 && parts[n - 3] === 'node_modules' && parts[n - 2].startsWith('@') && !parts[n - 1].startsWith('@')));
}

async function scanTree(rootHeld, uid, rootDev, policy, capturePaths) {
  const entries = []; const identities = []; const fileIds = new Set(); const folded = new Set(); const captures = new Map();
  let payloadBytes = 0; let packageCount = 0;
  const visitHeldDirectory = async (opened, relativePath) => {
    validRelativePath(relativePath);
    if (relativePath === 'node_modules/.bin' || relativePath.endsWith('/node_modules/.bin')) fail('STAGING_BIN_FORBIDDEN');
    const foldedPath = relativePath.toLowerCase(); if (folded.has(foldedPath)) fail('STAGING_PATH_COLLISION'); folded.add(foldedPath);
    if (entries.length >= policy.limits.maxNodes) fail('STAGING_NODE_LIMIT');
    const beforeNames = await namesIn(opened.handle);
    entries.push({ path: relativePath, type: 'directory', mode: 0o555 }); identities.push([relativePath, opened.identity]);
    if (isPackageRoot(relativePath)) { packageCount += 1; if (packageCount > policy.limits.maxPackages) fail('STAGING_PACKAGE_LIMIT'); }
    for (const name of beforeNames) {
      const childPath = childAt(opened.handle, name);
      let named; try { named = await lstat(childPath, { bigint: true }); } catch { fail('STAGING_FILESYSTEM_CHANGED'); }
      if (named.isSymbolicLink()) fail('STAGING_SYMLINK_FORBIDDEN');
      if (named.dev !== rootDev) fail('STAGING_MOUNT_CROSSING');
      const childRelative = relativePath === '.' ? name : `${relativePath}/${name}`;
      if (named.isDirectory()) {
        const child = await openDirectory(opened.handle, name, uid, 0o555, rootDev);
        try {
          await visitHeldDirectory(child, childRelative);
          const namedAfter = await lstat(childPath, { bigint: true }).catch(() => fail('STAGING_FILESYSTEM_CHANGED'));
          const heldAfter = await child.handle.stat({ bigint: true }).catch(() => fail('STAGING_FILESYSTEM_CHANGED'));
          if (metadata(named) !== child.identity || metadata(namedAfter) !== child.identity
              || metadata(heldAfter) !== child.identity) fail('STAGING_FILESYSTEM_CHANGED');
        } finally { await child.handle.close(); }
      } else {
        const wantedMode = childRelative === policy.native?.path ? 0o555 : 0o444;
        const item = await readRegularFile(opened.handle, name, childRelative, uid, rootDev, wantedMode, capturePaths.has(childRelative));
        const id = item.identity.split(':').slice(0, 2).join(':'); if (fileIds.has(id)) fail('STAGING_HARDLINK_FORBIDDEN'); fileIds.add(id);
        payloadBytes += item.size; if (!Number.isSafeInteger(payloadBytes) || payloadBytes > policy.limits.maxPayloadBytes) fail('STAGING_PAYLOAD_LIMIT');
        entries.push(item.entry); identities.push([childRelative, item.identity]); if (item.bytes) captures.set(childRelative, item.bytes);
      }
    }
    const afterNames = await namesIn(opened.handle);
    const after = await opened.handle.stat({ bigint: true }).catch(() => fail('STAGING_FILESYSTEM_CHANGED'));
    if (beforeNames.length !== afterNames.length || beforeNames.some((name, i) => name !== afterNames[i])
        || metadata(after) !== opened.identity) fail('STAGING_FILESYSTEM_CHANGED');
  };
  await visitHeldDirectory(rootHeld, '.');
  entries.sort((a, b) => rawCompare(a.path, b.path)); identities.sort((a, b) => rawCompare(a[0], b[0]));
  return { entries, identities, payloadBytes, packageCount, nodeCount: entries.length, captures };
}

function scanCanonical(scan) {
  return canonicalProviderToolJson({ entries: scan.entries, identities: scan.identities, payloadBytes: scan.payloadBytes, packageCount: scan.packageCount, nodeCount: scan.nodeCount });
}

function validatePackageJson(bytes, name, version) {
  if (!bytes) fail('STAGING_REQUIRED_FILE_UNAVAILABLE');
  let value; try { value = parseBoundedStrictJson(bytes, { maxBytes: READ_LIMIT, maxDepth: 32, maxStringBytes: 64 * 1024, maxValues: 10_000 }); } catch { fail('STAGING_PACKAGE_JSON_INVALID'); }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value.name !== name || value.version !== version) fail('STAGING_PACKAGE_VERSION_MISMATCH');
}

async function assertHeld(path, held, code) {
  const now = await held.handle.stat({ bigint: true }).catch(() => fail(code));
  const named = await lstat(path, { bigint: true }).catch(() => fail(code));
  const resolved = await realpath(path).catch(() => fail(code));
  if (metadata(now) !== held.identity || metadata(named) !== held.identity || resolved !== path) fail(code);
}

// Node exposes no built-in listxattr(2) API. The staging copier is therefore the
// enforcement point for stripping/rejecting source xattrs; this independent JS
// rescan cannot attest to xattr absence. All representable namespace, inode,
// ownership, mode, mount, byte, and race properties are checked again here.
export async function validateStagedProviderBundle(input) {
  if (arguments.length !== 1) fail('STAGING_VALIDATOR_INPUT_INVALID');
  exact(input, ['provider', 'stagingRoot', 'assemblyResult'], 'STAGING_VALIDATOR_INPUT_INVALID');
  const { provider, stagingRoot, assemblyResult } = input;
  if (typeof provider !== 'string' || !absoluteNormalized(stagingRoot)) fail('STAGING_VALIDATOR_INPUT_INVALID');
  const policy = getProviderToolArtifactPolicy(provider);
  validateAssembly(provider, assemblyResult, policy);
  const uidNumber = process.getuid?.(); if (!Number.isInteger(uidNumber)) fail('STAGING_UID_UNAVAILABLE'); const uid = BigInt(uidNumber);
  const parentPath = dirname(stagingRoot);
  let parentNamed; try { parentNamed = await lstat(parentPath, { bigint: true }); } catch { fail('STAGING_PARENT_UNSAFE'); }
  if (!parentNamed.isDirectory() || parentNamed.isSymbolicLink() || parentNamed.uid !== uid || (Number(parentNamed.mode) & 0o022) !== 0 || parentNamed.nlink < 1n) fail('STAGING_PARENT_UNSAFE');
  let parentHandle; try { parentHandle = await open(parentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); } catch { fail('STAGING_PARENT_UNSAFE'); }
  let rootHandle;
  try {
    const parentHeld = { handle: parentHandle, identity: metadata(await parentHandle.stat({ bigint: true })) };
    if (parentHeld.identity !== metadata(parentNamed) || await realpath(parentPath) !== parentPath) fail('STAGING_PARENT_UNSAFE');
    const rootName = basename(stagingRoot); const anchoredRoot = childAt(parentHandle, rootName);
    let rootNamed; try { rootNamed = await lstat(anchoredRoot, { bigint: true }); } catch { fail('STAGING_ROOT_UNSAFE'); }
    if (!rootNamed.isDirectory() || rootNamed.isSymbolicLink() || rootNamed.uid !== uid || rootNamed.dev !== parentNamed.dev
        || rootNamed.nlink < 1n || (Number(rootNamed.mode) & 0o7777) !== 0o555) fail('STAGING_ROOT_UNSAFE');
    rootHandle = await open(anchoredRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW).catch(() => fail('STAGING_ROOT_UNSAFE'));
    const rootHeld = { handle: rootHandle, identity: metadata(await rootHandle.stat({ bigint: true })) };
    if (rootHeld.identity !== metadata(rootNamed) || await realpath(stagingRoot) !== stagingRoot) fail('STAGING_ROOT_UNSAFE');
    const rootDev = rootNamed.dev;
    const profile = generateProviderBundleProfile(provider);
    const packagePath = `node_modules/${policy.package}/package.json`;
    const capturePaths = new Set(['package-lock.json', profile.relativePath, packagePath]);
    if (policy.native) capturePaths.add(`node_modules/${policy.native.package}/package.json`);
    const first = await scanTree(rootHeld, uid, rootDev, policy, capturePaths);
    await assertHeld(stagingRoot, rootHeld, 'STAGING_ROOT_CHANGED'); await assertHeld(parentPath, parentHeld, 'STAGING_PARENT_CHANGED');
    const second = await scanTree(rootHeld, uid, rootDev, policy, capturePaths);
    await assertHeld(stagingRoot, rootHeld, 'STAGING_ROOT_CHANGED'); await assertHeld(parentPath, parentHeld, 'STAGING_PARENT_CHANGED');
    if (scanCanonical(first) !== scanCanonical(second)) fail('STAGING_SCAN_MISMATCH');
    if (second.packageCount !== assemblyResult.packageCount) fail('STAGING_PACKAGE_COUNT_MISMATCH');
    if (second.nodeCount !== assemblyResult.nodeCount) fail('STAGING_NODE_COUNT_MISMATCH');
    if (second.payloadBytes !== assemblyResult.payloadBytes) fail('STAGING_PAYLOAD_MISMATCH');
    // sourceSnapshotSha256 describes the copier's source walk. A destination-only
    // validator can validate and preserve it, but must not claim to rederive it.
    const copierResult = { schemaVersion: PROVIDER_BUNDLE_COPY_SCHEMA, packageCount: second.packageCount, nodeCount: second.nodeCount, payloadBytes: second.payloadBytes, entries: second.entries, sourceSnapshotSha256: assemblyResult.sourceSnapshotSha256 };
    const artifacts = generateProviderBundleArtifacts({ provider, copierResult });
    validateProviderToolTreeManifest(artifacts.manifest, provider); validateProviderToolDescriptor(artifacts.descriptor, provider);
    if (canonicalProviderToolJson(artifacts.manifest.entries) !== canonicalProviderToolJson(second.entries)) fail('STAGING_MANIFEST_MISMATCH');
    if (!artifacts.manifestBytes.equals(canonicalBytes(artifacts.manifest)) || artifacts.manifestSha256 !== sha256ProviderTool(artifacts.manifestBytes)
        || !artifacts.descriptorBytes.equals(canonicalBytes(artifacts.descriptor)) || artifacts.descriptorSha256 !== sha256ProviderTool(artifacts.descriptorBytes)
        || artifacts.bundleTreeSha256 !== artifacts.manifestSha256) fail('STAGING_ARTIFACT_BINDING_INVALID');
    if (artifacts.descriptor.bundleRoot !== policy.finalRoot || artifacts.descriptor.bundleRealpath !== policy.finalRoot) fail('STAGING_ARTIFACT_ROOT_INVALID');
    const captures = second.captures;
    if (hash(captures.get('package-lock.json') ?? Buffer.alloc(0)) !== policy.lockfileSha256) fail('STAGING_LOCKFILE_PIN_MISMATCH');
    const profileBytes = captures.get(profile.relativePath); if (!profileBytes?.equals(profile.bytes) || hash(profileBytes) !== profile.sha256) fail('STAGING_PROFILE_PIN_MISMATCH');
    validatePackageJson(captures.get(packagePath), policy.package, policy.version);
    if (policy.native) validatePackageJson(captures.get(`node_modules/${policy.native.package}/package.json`), policy.native.package, policy.native.version);
    await assertHeld(stagingRoot, rootHeld, 'STAGING_ROOT_CHANGED');
    await assertHeld(parentPath, parentHeld, 'STAGING_PARENT_CHANGED');
    return deepFreeze({ status: 'STAGING_VALID', provider, stagingRoot, packageCount: second.packageCount, nodeCount: second.nodeCount, payloadBytes: second.payloadBytes, sourceSnapshotSha256: assemblyResult.sourceSnapshotSha256, artifacts });
  } finally {
    await Promise.allSettled([rootHandle?.close(), parentHandle.close()]);
  }
}
