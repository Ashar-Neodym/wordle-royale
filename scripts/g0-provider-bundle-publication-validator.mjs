import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, posix, resolve } from 'node:path';
import { parseBoundedStrictJson } from './g0-provider-bundle-assembler-core.mjs';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import {
  canonicalProviderToolJson, getProviderToolArtifactPolicy, validateProviderToolDescriptor,
  validateProviderToolTreeManifest,
} from './g0-provider-tool-bundle.mjs';
import {
  parseAcquisitionRecord, parseInertInstallPlan, parsePublicationCommit, parsePublicationIndex,
} from './g0-provider-bundle-publication-schema.mjs';

const MAX_PUBLICATION_JSON_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 224 * 1024 * 1024;
const MAX_PATH_BYTES = 1024;
const MAX_COMPONENT_BYTES = 255;
const CAPTURE_BYTES = 256 * 1024;
const MEMBERS = Object.freeze(['COMMIT', 'acquisition-record.json', 'bundle', 'bundle.tree-manifest.json', 'descriptor.json', 'install-plan.json', 'publication-index.json']);
const ARTIFACTS = Object.freeze({
  'vercel-58.4.4': 'vercel',
  'railway-5.30.1': 'railway',
  'supabase-2.110.0': 'supabase',
});
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const rawCompare = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const canonicalBytes = (value) => Buffer.from(`${canonicalProviderToolJson(value)}\n`, 'utf8');
const fdAnchor = (handle) => `/proc/self/fd/${handle.fd}`;
const childAt = (parent, name) => `${fdAnchor(parent)}/${name}`;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function metadata(st) {
  return [st.dev, st.ino, st.mode, st.nlink, st.uid, st.gid, st.size, st.ctimeNs, st.mtimeNs]
    .map(String).join(':');
}
function identity(st) { return `${st.dev}:${st.ino}`; }
function pathValid(path) {
  if (path === '.') return;
  if (typeof path !== 'string' || !path || path.includes('\0') || path.includes('\\') || path.startsWith('/')
      || posix.normalize(path) !== path || path.split('/').some((part) => !part || part === '.' || part === '..')) fail('PUBLICATION_PATH_INVALID');
  if (Buffer.byteLength(path) > MAX_PATH_BYTES || path.split('/').some((part) => Buffer.byteLength(part) > MAX_COMPONENT_BYTES)) fail('PUBLICATION_PATH_LIMIT');
}
async function openReadOnly(path, directory = false) {
  const base = constants.O_RDONLY | constants.O_NOFOLLOW | (directory ? constants.O_DIRECTORY : 0);
  const noAtime = constants.O_NOATIME ?? 0;
  try { return await open(path, base | noAtime); } catch (error) {
    if (!noAtime || !['EPERM', 'EINVAL', 'EOPNOTSUPP'].includes(error?.code)) throw error;
    return open(path, base);
  }
}
async function namesIn(handle) {
  let buffers; try { buffers = await readdir(fdAnchor(handle), { encoding: 'buffer' }); } catch { fail('PUBLICATION_FILESYSTEM_CHANGED'); }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const names = buffers.map((bytes) => {
    let name; try { name = decoder.decode(bytes); } catch { fail('PUBLICATION_PATH_ENCODING_INVALID'); }
    if (!Buffer.from(name).equals(bytes) || !name || name === '.' || name === '..' || name.includes('/') || name.includes('\0') || bytes.length > MAX_COMPONENT_BYTES) fail('PUBLICATION_PATH_INVALID');
    return name;
  }).sort(rawCompare);
  const folded = new Set();
  for (const name of names) { const key = name.toLowerCase(); if (folded.has(key)) fail('PUBLICATION_PATH_COLLISION'); folded.add(key); }
  return names;
}
async function openHeldDirectory(parent, name, uid, mode, dev) {
  const path = childAt(parent, name);
  let named; try { named = await lstat(path, { bigint: true }); } catch { fail('PUBLICATION_FILESYSTEM_CHANGED'); }
  if (!named.isDirectory() || named.isSymbolicLink()) fail('PUBLICATION_NODE_TYPE_INVALID');
  let handle; try { handle = await openReadOnly(path, true); } catch { fail('PUBLICATION_FILESYSTEM_CHANGED'); }
  try {
    const held = await handle.stat({ bigint: true });
    if (metadata(named) !== metadata(held) || held.uid !== uid || held.dev !== dev || held.nlink < 1n || (Number(held.mode) & 0o7777) !== mode) fail('PUBLICATION_DIRECTORY_POLICY');
    return { handle, metadata: metadata(held) };
  } catch (error) { await handle.close(); throw error; }
}
async function readHeldFile(parent, name, relativePath, uid, dev, mode, maxBytes, capture = true) {
  const path = childAt(parent, name);
  let named; try { named = await lstat(path, { bigint: true }); } catch { fail('PUBLICATION_FILESYSTEM_CHANGED'); }
  if (named.isSymbolicLink()) fail('PUBLICATION_SYMLINK_FORBIDDEN');
  if (!named.isFile()) fail('PUBLICATION_SPECIAL_FILE_FORBIDDEN');
  let handle; try { handle = await openReadOnly(path); } catch { fail('PUBLICATION_FILESYSTEM_CHANGED'); }
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || metadata(named) !== metadata(before)) fail('PUBLICATION_FILESYSTEM_CHANGED');
    if (before.dev !== dev) fail('PUBLICATION_MOUNT_CROSSING');
    if (before.uid !== uid || before.nlink !== 1n || (Number(before.mode) & 0o7777) !== mode) fail('PUBLICATION_FILE_POLICY');
    if (before.size < 0n || before.size > BigInt(maxBytes)) fail('PUBLICATION_FILE_LIMIT');
    const digest = createHash('sha256'); const chunks = capture ? [] : null;
    const buffer = Buffer.allocUnsafe(64 * 1024); let position = 0;
    while (position < Number(before.size)) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, Number(before.size) - position), position);
      if (!bytesRead) fail('PUBLICATION_FILESYSTEM_CHANGED');
      const chunk = buffer.subarray(0, bytesRead); digest.update(chunk); if (chunks) chunks.push(Buffer.from(chunk)); position += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const namedAfter = await lstat(path, { bigint: true }).catch(() => fail('PUBLICATION_FILESYSTEM_CHANGED'));
    if (metadata(before) !== metadata(after) || metadata(before) !== metadata(namedAfter)) fail('PUBLICATION_FILESYSTEM_CHANGED');
    return { path: relativePath, type: 'file', mode, sha256: `sha256:${digest.digest('hex')}`, size: Number(before.size), metadata: metadata(before), id: identity(before), bytes: chunks ? Buffer.concat(chunks) : undefined };
  } finally { await handle.close(); }
}
function parseManifest(bytes, provider, cap) {
  if (bytes.length < 3 || bytes.length > cap) fail('PUBLICATION_MANIFEST_INVALID');
  let value; try { parseBoundedStrictJson(bytes, { maxBytes: cap, maxDepth: 32, maxStringBytes: 64 * 1024, maxValues: 100_000 }); value = JSON.parse(bytes.toString('utf8')); } catch { fail('PUBLICATION_MANIFEST_INVALID'); }
  validateProviderToolTreeManifest(value, provider);
  if (!canonicalBytes(value).equals(bytes)) fail('PUBLICATION_MANIFEST_NON_CANONICAL');
  return value;
}
function parseDescriptor(bytes, provider) {
  if (bytes.length < 3 || bytes.length > MAX_PUBLICATION_JSON_BYTES) fail('PUBLICATION_DESCRIPTOR_INVALID');
  let value; try { parseBoundedStrictJson(bytes, { maxBytes: MAX_PUBLICATION_JSON_BYTES, maxDepth: 32, maxStringBytes: 64 * 1024, maxValues: 10_000 }); value = JSON.parse(bytes.toString('utf8')); } catch { fail('PUBLICATION_DESCRIPTOR_INVALID'); }
  validateProviderToolDescriptor(value, provider);
  if (!canonicalBytes(value).equals(bytes)) fail('PUBLICATION_DESCRIPTOR_NON_CANONICAL');
  return value;
}
function validatePackageJson(bytes, name, version) {
  if (!bytes) fail('PUBLICATION_PACKAGE_JSON_MISSING');
  let value; try { parseBoundedStrictJson(bytes, { maxBytes: CAPTURE_BYTES, maxDepth: 32, maxStringBytes: 64 * 1024, maxValues: 10_000 }); value = JSON.parse(bytes.toString('utf8')); } catch { fail('PUBLICATION_PACKAGE_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.name !== name || value.version !== version) fail('PUBLICATION_PACKAGE_VERSION_MISMATCH');
}
async function scanBundle(root, uid, dev, policy, capturePaths) {
  const entries = []; const identities = []; const fileIds = new Set(); const folded = new Set(); const captures = new Map();
  let payloadBytes = 0; let packageCount = 0;
  const isPackageRoot = (path) => { const p = path.split('/'); const n = p.length; return path !== '.' && ((n >= 2 && p[n - 2] === 'node_modules' && !p[n - 1].startsWith('@')) || (n >= 3 && p[n - 3] === 'node_modules' && p[n - 2].startsWith('@') && !p[n - 1].startsWith('@'))); };
  const visit = async (opened, relative) => {
    pathValid(relative); if (relative === 'node_modules/.bin' || relative.endsWith('/node_modules/.bin')) fail('PUBLICATION_BIN_FORBIDDEN');
    const foldedPath = relative.toLowerCase(); if (folded.has(foldedPath)) fail('PUBLICATION_PATH_COLLISION'); folded.add(foldedPath);
    if (entries.length >= policy.limits.maxNodes) fail('PUBLICATION_NODE_LIMIT');
    const beforeNames = await namesIn(opened.handle);
    entries.push({ path: relative, type: 'directory', mode: 0o555 }); identities.push([relative, opened.metadata]);
    if (isPackageRoot(relative) && ++packageCount > policy.limits.maxPackages) fail('PUBLICATION_PACKAGE_LIMIT');
    for (const name of beforeNames) {
      const childPath = childAt(opened.handle, name); let named;
      try { named = await lstat(childPath, { bigint: true }); } catch { fail('PUBLICATION_FILESYSTEM_CHANGED'); }
      if (named.isSymbolicLink()) fail('PUBLICATION_SYMLINK_FORBIDDEN');
      if (named.dev !== dev) fail('PUBLICATION_MOUNT_CROSSING');
      const childRelative = relative === '.' ? name : `${relative}/${name}`;
      if (named.isDirectory()) {
        const child = await openHeldDirectory(opened.handle, name, uid, 0o555, dev);
        try {
          await visit(child, childRelative);
          const namedAfter = await lstat(childPath, { bigint: true }).catch(() => fail('PUBLICATION_FILESYSTEM_CHANGED'));
          const heldAfter = await child.handle.stat({ bigint: true }).catch(() => fail('PUBLICATION_FILESYSTEM_CHANGED'));
          if (metadata(namedAfter) !== child.metadata || metadata(heldAfter) !== child.metadata || metadata(named) !== child.metadata) fail('PUBLICATION_FILESYSTEM_CHANGED');
        } finally { await child.handle.close(); }
      } else {
        const wantedMode = childRelative === policy.native?.path ? 0o555 : 0o444;
        const file = await readHeldFile(opened.handle, name, childRelative, uid, dev, wantedMode, MAX_FILE_BYTES, capturePaths.has(childRelative));
        if (fileIds.has(file.id)) fail('PUBLICATION_HARDLINK_FORBIDDEN'); fileIds.add(file.id);
        payloadBytes += file.size; if (!Number.isSafeInteger(payloadBytes) || payloadBytes > policy.limits.maxPayloadBytes) fail('PUBLICATION_PAYLOAD_LIMIT');
        entries.push({ path: file.path, type: 'file', mode: file.mode, sha256: file.sha256 }); identities.push([file.path, file.metadata]);
        if (file.bytes) captures.set(file.path, file.bytes);
      }
    }
    const afterNames = await namesIn(opened.handle); const after = await opened.handle.stat({ bigint: true }).catch(() => fail('PUBLICATION_FILESYSTEM_CHANGED'));
    if (beforeNames.join('\0') !== afterNames.join('\0') || metadata(after) !== opened.metadata) fail('PUBLICATION_FILESYSTEM_CHANGED');
  };
  await visit(root, '.'); entries.sort((a, b) => rawCompare(a.path, b.path)); identities.sort((a, b) => rawCompare(a[0], b[0]));
  return { entries, identities, packageCount, nodeCount: entries.length, payloadBytes, captures };
}
function expectedIndex({ artifactId, snapshotHash, sourceRevision, files }) {
  return {
    artifactId, canonicalSourceSnapshotSha256: snapshotHash,
    members: {
      acquisitionRecord: { mode: 0o400, path: 'acquisition-record.json', sha256: files.acquisition.sha256 },
      bundle: { path: 'bundle', treeManifestSha256: files.manifest.sha256 },
      descriptor: { mode: 0o400, path: 'descriptor.json', sha256: files.descriptor.sha256 },
      installPlan: { mode: 0o400, path: 'install-plan.json', sha256: files.plan.sha256 },
      treeManifest: { mode: 0o400, path: 'bundle.tree-manifest.json', sha256: files.manifest.sha256 },
    }, schemaVersion: 'wordle-royale-g0-local-publication-index/v1', sourceRevision,
  };
}
function scanFingerprint(scan) {
  return canonicalProviderToolJson({ entries: scan.bundle.entries, identities: scan.bundle.identities, packageCount: scan.bundle.packageCount, nodeCount: scan.bundle.nodeCount, payloadBytes: scan.bundle.payloadBytes, memberIdentities: scan.memberIdentities, memberHashes: scan.memberHashes });
}
async function scanPublication(container, uid, dev, provider, artifactId, publicationName, bindings) {
  const policy = getProviderToolArtifactPolicy(provider); const names = await namesIn(container.handle);
  if (names.length !== MEMBERS.length || names.some((name, i) => name !== MEMBERS[i])) fail('PUBLICATION_MEMBERS_INVALID');
  const profile = generateProviderBundleProfile(provider); const packagePath = `node_modules/${policy.package}/package.json`;
  const captures = new Set(['package-lock.json', profile.relativePath, packagePath]);
  if (policy.native) captures.add(`node_modules/${policy.native.package}/package.json`);
  const manifestFile = await readHeldFile(container.handle, 'bundle.tree-manifest.json', 'bundle.tree-manifest.json', uid, dev, 0o400, policy.limits.maxManifestBytes);
  const descriptorFile = await readHeldFile(container.handle, 'descriptor.json', 'descriptor.json', uid, dev, 0o400, MAX_PUBLICATION_JSON_BYTES);
  const acquisitionFile = await readHeldFile(container.handle, 'acquisition-record.json', 'acquisition-record.json', uid, dev, 0o400, MAX_PUBLICATION_JSON_BYTES);
  const planFile = await readHeldFile(container.handle, 'install-plan.json', 'install-plan.json', uid, dev, 0o400, MAX_PUBLICATION_JSON_BYTES);
  const indexFile = await readHeldFile(container.handle, 'publication-index.json', 'publication-index.json', uid, dev, 0o400, MAX_PUBLICATION_JSON_BYTES);
  const commitFile = await readHeldFile(container.handle, 'COMMIT', 'COMMIT', uid, dev, 0o400, MAX_PUBLICATION_JSON_BYTES);
  const manifest = parseManifest(manifestFile.bytes, provider, policy.limits.maxManifestBytes);
  const descriptor = parseDescriptor(descriptorFile.bytes, provider);
  let acquisition, plan, index, commit;
  try { acquisition = parseAcquisitionRecord(acquisitionFile.bytes); } catch { fail('PUBLICATION_ACQUISITION_INVALID'); }
  try { plan = parseInertInstallPlan(planFile.bytes); } catch { fail('PUBLICATION_PLAN_INVALID'); }
  try { index = parsePublicationIndex(indexFile.bytes); } catch { fail('PUBLICATION_INDEX_INVALID'); }
  try { commit = parsePublicationCommit(commitFile.bytes); } catch { fail('PUBLICATION_COMMIT_INVALID'); }
  if (descriptor.bundleRoot !== policy.finalRoot || descriptor.bundleRealpath !== policy.finalRoot) fail('PUBLICATION_DESCRIPTOR_ROOT_INVALID');
  if (plan.artifactId !== artifactId || index.artifactId !== artifactId) fail('PUBLICATION_ARTIFACT_BINDING_INVALID');
  if (acquisition.canonicalSourceSnapshotSha256 !== index.canonicalSourceSnapshotSha256) fail('PUBLICATION_SOURCE_SNAPSHOT_MISMATCH');
  const files = { manifest: manifestFile, descriptor: descriptorFile, acquisition: acquisitionFile, plan: planFile };
  const rederived = expectedIndex({ artifactId, snapshotHash: acquisition.canonicalSourceSnapshotSha256, sourceRevision: index.sourceRevision, files });
  if (!canonicalBytes(rederived).equals(indexFile.bytes)) fail('PUBLICATION_INDEX_BINDING_MISMATCH');
  if (commit.publicationIndexSha256 !== indexFile.sha256) fail('PUBLICATION_COMMIT_BINDING_MISMATCH');
  const derivedName = `${artifactId}-${indexFile.sha256.slice(7, 39)}`;
  if (derivedName !== publicationName) fail('PUBLICATION_NAME_MISMATCH');
  const bundle = await openHeldDirectory(container.handle, 'bundle', uid, 0o555, dev);
  let bundleScan;
  try {
    bundleScan = await scanBundle(bundle, uid, dev, policy, captures);
    await assertHeldEntry(container.handle, 'bundle', bundle, 'PUBLICATION_BUNDLE_CHANGED');
  } finally { await bundle.handle.close(); }
  await assertPublicationBindings(bindings);
  if (canonicalProviderToolJson(bundleScan.entries) !== canonicalProviderToolJson(manifest.entries)) fail('PUBLICATION_MANIFEST_TREE_MISMATCH');
  if (descriptor.treeManifestSha256 !== manifestFile.sha256) fail('PUBLICATION_DESCRIPTOR_MANIFEST_MISMATCH');
  const byPath = new Map(bundleScan.entries.map((entry) => [entry.path, entry]));
  const requireHash = (path, wanted, code) => { const entry = byPath.get(path); if (entry?.type !== 'file' || entry.sha256 !== wanted) fail(code); };
  requireHash('package-lock.json', policy.lockfileSha256, 'PUBLICATION_LOCKFILE_PIN_MISMATCH');
  requireHash(profile.relativePath, profile.sha256, 'PUBLICATION_PROFILE_PIN_MISMATCH');
  requireHash(policy.entrypoint, policy.entrypointSha256, 'PUBLICATION_ENTRYPOINT_PIN_MISMATCH');
  requireHash(packagePath, descriptor.packageJsonSha256, 'PUBLICATION_PACKAGE_JSON_HASH_MISMATCH');
  if (!bundleScan.captures.get(profile.relativePath)?.equals(profile.bytes)) fail('PUBLICATION_PROFILE_PIN_MISMATCH');
  validatePackageJson(bundleScan.captures.get(packagePath), policy.package, policy.version);
  if (policy.native) {
    requireHash(policy.native.path, policy.native.sha256, 'PUBLICATION_NATIVE_PIN_MISMATCH');
    const nativePackage = `node_modules/${policy.native.package}/package.json`;
    requireHash(nativePackage, descriptor.nativeBinary.packageJsonSha256, 'PUBLICATION_NATIVE_PACKAGE_JSON_HASH_MISMATCH');
    validatePackageJson(bundleScan.captures.get(nativePackage), policy.native.package, policy.native.version);
  }
  const memberFiles = [commitFile, acquisitionFile, manifestFile, descriptorFile, planFile, indexFile];
  return {
    bundle: bundleScan,
    memberHashes: Object.fromEntries(memberFiles.map((file) => [file.path, file.sha256])),
    memberIdentities: Object.fromEntries(memberFiles.map((file) => [file.path, file.metadata])),
    sourceSnapshotSha256: acquisition.canonicalSourceSnapshotSha256, sourceRevision: index.sourceRevision,
    publicationId: derivedName, treeSha256: manifestFile.sha256,
  };
}
async function assertHeldEntry(parent, name, held, code, parentMetadata) {
  const current = await held.handle.stat({ bigint: true }).catch(() => fail(code));
  const named = await lstat(childAt(parent, name), { bigint: true }).catch(() => fail(code));
  const parentCurrent = parentMetadata === undefined ? undefined : await parent.stat({ bigint: true }).catch(() => fail(code));
  if (metadata(current) !== held.metadata || metadata(named) !== held.metadata
      || (parentCurrent && metadata(parentCurrent) !== parentMetadata)) fail(code);
}
async function assertPublicationBindings(bindings) {
  const parentDirectoryCurrent = await bindings.parentDirectory.handle.stat({ bigint: true }).catch(() => fail('PUBLICATION_PARENT_CHANGED'));
  if (metadata(parentDirectoryCurrent) !== bindings.parentDirectory.metadata) fail('PUBLICATION_PARENT_CHANGED');
  await assertHeldEntry(bindings.parent.handle, bindings.publicationName, bindings.container, 'PUBLICATION_CONTAINER_CHANGED', bindings.parent.metadata);
  await assertHeldEntry(bindings.parentDirectory.handle, bindings.parentBase, bindings.parent, 'PUBLICATION_PARENT_CHANGED', bindings.parentDirectory.metadata);
}

export async function validateProviderBundlePublication(input) {
  if (arguments.length !== 1 || !input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).sort().join('\0') !== ['publicationName', 'publicationParent'].join('\0')) fail('PUBLICATION_VALIDATOR_INPUT_INVALID');
  const { publicationParent, publicationName } = input;
  if (typeof publicationParent !== 'string' || !isAbsolute(publicationParent) || resolve(publicationParent) !== publicationParent || publicationParent === '/'
      || typeof publicationName !== 'string' || basename(publicationName) !== publicationName) fail('PUBLICATION_VALIDATOR_INPUT_INVALID');
  const artifactId = Object.keys(ARTIFACTS).find((id) => publicationName.startsWith(`${id}-`) && new RegExp(`^${id.replaceAll('.', '\\.')}-[a-f0-9]{32}$`, 'u').test(publicationName));
  if (!artifactId) fail('PUBLICATION_NAME_INVALID'); const provider = ARTIFACTS[artifactId];
  const uidNumber = process.getuid?.(); if (!Number.isInteger(uidNumber)) fail('PUBLICATION_UID_UNAVAILABLE'); const uid = BigInt(uidNumber);
  const publicationParentDirectory = dirname(publicationParent); const publicationParentBase = basename(publicationParent);
  let parentDirectoryHandle; try { parentDirectoryHandle = await openReadOnly(publicationParentDirectory, true); } catch { fail('PUBLICATION_PARENT_UNSAFE'); }
  const parentDirectoryMetadata = metadata(await parentDirectoryHandle.stat({ bigint: true }).catch(() => fail('PUBLICATION_PARENT_UNSAFE')));
  let parentNamed; try { parentNamed = await lstat(childAt(parentDirectoryHandle, publicationParentBase), { bigint: true }); } catch { await parentDirectoryHandle.close(); fail('PUBLICATION_PARENT_UNSAFE'); }
  if (!parentNamed.isDirectory() || parentNamed.isSymbolicLink() || parentNamed.uid !== uid || parentNamed.nlink < 1n || (Number(parentNamed.mode) & 0o7777) !== 0o700) { await parentDirectoryHandle.close(); fail('PUBLICATION_PARENT_UNSAFE'); }
  let parentHandle; try { parentHandle = await openReadOnly(childAt(parentDirectoryHandle, publicationParentBase), true); } catch { await parentDirectoryHandle.close(); fail('PUBLICATION_PARENT_UNSAFE'); }
  let container;
  try {
    const parentHeld = { handle: parentHandle, metadata: metadata(await parentHandle.stat({ bigint: true })) };
    if (parentHeld.metadata !== metadata(parentNamed) || await realpath(publicationParent).catch(() => '') !== publicationParent) fail('PUBLICATION_PARENT_UNSAFE');
    container = await openHeldDirectory(parentHandle, publicationName, uid, 0o700, parentNamed.dev);
    const bindings = {
      container, publicationName, parent: parentHeld,
      parentDirectory: { handle: parentDirectoryHandle, metadata: parentDirectoryMetadata }, parentBase: publicationParentBase,
    };
    const first = await scanPublication(container, uid, parentNamed.dev, provider, artifactId, publicationName, bindings);
    await assertPublicationBindings(bindings);
    const second = await scanPublication(container, uid, parentNamed.dev, provider, artifactId, publicationName, bindings);
    if (scanFingerprint(first) !== scanFingerprint(second)) fail('PUBLICATION_SCAN_MISMATCH');
    const result = deepFreeze({
      status: 'PUBLICATION_VALID', publicationValid: true, provider, artifactId, publicationId: second.publicationId,
      memberHashes: second.memberHashes, treeSha256: second.treeSha256,
      canonicalSourceSnapshotSha256: second.sourceSnapshotSha256, sourceRevision: second.sourceRevision,
      counts: { packageCount: second.bundle.packageCount, nodeCount: second.bundle.nodeCount, payloadBytes: second.bundle.payloadBytes },
    });
    await assertPublicationBindings(bindings);
    if (await realpath(publicationParent).catch(() => '') !== publicationParent) fail('PUBLICATION_PARENT_CHANGED');
    return result;
  } finally { await Promise.allSettled([container?.handle.close(), parentHandle.close(), parentDirectoryHandle.close()]); }
}
