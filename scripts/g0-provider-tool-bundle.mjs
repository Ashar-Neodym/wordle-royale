import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, resolve, sep } from 'node:path';

export const PROVIDER_TOOL_SCHEMA = 'wordle-royale-provider-tool/v1';
export const PROVIDER_TOOL_TREE_MANIFEST_SCHEMA = 'wordle-royale-provider-tool-tree-manifest/v1';

// These are reviewed distribution identities, not values discovered from PATH or
// the collector user's npm tree. Upgrades must deliberately change this table.

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const PROVIDERS = Object.freeze({
  vercel: Object.freeze({
    package: 'vercel', version: '58.4.4', entrypoint: 'node_modules/vercel/dist/vc.js',
    entrypointSha256: 'sha256:56b16d6893212069398eb30e2d96943421cd8a5ba7ea3372a1dd5743ed23d363',
    sessionMode: 'standard_os_user_session', invocationProfile: 'vercel-g0-readonly/1', native: null,
    finalRoot: '/opt/wordle-royale/g0-provider-tools/vercel-58.4.4',
    limits: Object.freeze({ maxPackages: 400, maxNodes: 8_500, maxPayloadBytes: 192 * 1024 * 1024, maxManifestBytes: 1_310_720 }),
  }),
  railway: Object.freeze({
    package: '@railway/cli', version: '5.30.1', entrypoint: 'node_modules/@railway/cli/bin/railway.js',
    entrypointSha256: 'sha256:21023bebb7838bd52d7646bf0ce75d3c33dc259797dd6e920e318be630184d2d',
    sessionMode: 'standard_os_user_session', invocationProfile: 'railway-g0-readonly/1',
    native: Object.freeze({ package: '@railway/cli', version: '5.30.1', path: 'node_modules/@railway/cli/bin/railway', sha256: 'sha256:26f5c4d8e22c8af4b6523e54d33a44cfe861a40442f171d4aa0fee8ec800a3b2' }),
    finalRoot: '/opt/wordle-royale/g0-provider-tools/railway-5.30.1',
    limits: Object.freeze({ maxPackages: 24, maxNodes: 320, maxPayloadBytes: 32 * 1024 * 1024, maxManifestBytes: 49_152 }),
  }),
  supabase: Object.freeze({
    package: 'supabase', version: '2.110.0', entrypoint: 'node_modules/supabase/dist/supabase.js',
    entrypointSha256: 'sha256:253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240',
    sessionMode: 'standard_os_user_session', invocationProfile: 'supabase-g0-readonly/1',
    native: Object.freeze({ package: '@supabase/cli-linux-x64', version: '2.110.0', path: 'node_modules/@supabase/cli-linux-x64/bin/supabase', sha256: 'sha256:e0574b435f54898aa1f5f6fe0696e61b612dafc9b86a2aa538cf8215fc3c9e9f' }),
    finalRoot: '/opt/wordle-royale/g0-provider-tools/supabase-2.110.0',
    limits: Object.freeze({ maxPackages: 24, maxNodes: 900, maxPayloadBytes: 224 * 1024 * 1024, maxManifestBytes: 147_456 }),
  }),
});
const LOCKFILE_SHA256 = 'sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90';
const RUNTIME = Object.freeze({ path: '/usr/bin/node', version: 'v18.19.1', sha256: 'sha256:f3f93db342d5ac5bb61656d0599a603a73779e98befd9342171e550002725f4d' });
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const plain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
function exact(x, fields, code) {
  if (!plain(x)) fail(code);
  const actual = Object.keys(x).sort(); const wanted = [...fields].sort();
  if (actual.join('\0') !== wanted.join('\0')) fail(code);
}
function digest(value, code = 'TOOL_DESCRIPTOR_INVALID') { if (typeof value !== 'string' || !SHA256.test(value)) fail(code); }
function absolute(value, code = 'TOOL_DESCRIPTOR_INVALID') {
  if (typeof value !== 'string' || value.includes('\0') || !isAbsolute(value) || resolve(value) !== value) fail(code);
}
function relative(value, code = 'TOOL_DESCRIPTOR_INVALID') {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\\') || value.startsWith('/') || posix.normalize(value) !== value || value === '.' || value.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(code);
}

export function canonicalProviderToolJson(value) {
  const visit = (x) => {
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
    if (typeof x === 'number' && Number.isFinite(x)) return JSON.stringify(x);
    if (Array.isArray(x)) return `[${x.map(visit).join(',')}]`;
    if (!plain(x)) fail('NON_CANONICAL_VALUE');
    return `{${Object.keys(x).sort().map((key) => `${JSON.stringify(key)}:${visit(x[key])}`).join(',')}}`;
  };
  return visit(value);
}
export const sha256ProviderTool = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
// Wire bytes are canonical JSON followed by one LF. Manifest paths are sorted
// separately as raw UTF-8 bytes, independent of locale and readdir order.
export const hashProviderToolManifest = (manifest) => sha256ProviderTool(Buffer.from(`${canonicalProviderToolJson(manifest)}\n`, 'utf8'));

// Artifact builders consume this reviewed, recursively frozen policy instead of
// re-stating production pins. The closed provider name is the only selector.
export function getProviderToolArtifactPolicy(provider) {
  const policy = PROVIDERS[provider];
  if (!policy) fail('TOOL_PROVIDER_UNSUPPORTED');
  return Object.freeze({
    provider, package: policy.package, version: policy.version,
    distribution: 'official_npm_cli', sessionMode: policy.sessionMode,
    entrypoint: policy.entrypoint, entrypointSha256: policy.entrypointSha256,
    invocationProfile: policy.invocationProfile, native: policy.native,
    finalRoot: policy.finalRoot, lockfileSha256: LOCKFILE_SHA256,
    runtime: RUNTIME, limits: policy.limits,
  });
}

export function validateProviderToolDescriptor(descriptor, expectedProvider) {
  const policy = PROVIDERS[expectedProvider]; if (!policy) fail('TOOL_PROVIDER_UNSUPPORTED');
  const fields = ['schemaVersion', 'distribution', 'package', 'version', 'bundleRoot', 'bundleRealpath', 'entrypoint', 'entrypointSha256', 'packageJsonSha256', 'lockfileSha256', 'treeManifestSha256', 'runtime', 'sessionMode', 'invocationProfile', 'invocationProfileSha256', 'nativeBinary'];
  exact(descriptor, fields, 'TOOL_DESCRIPTOR_INVALID');
  if (descriptor.schemaVersion !== PROVIDER_TOOL_SCHEMA || descriptor.distribution !== 'official_npm_cli' || descriptor.package !== policy.package || descriptor.version !== policy.version || descriptor.entrypoint !== policy.entrypoint || descriptor.sessionMode !== policy.sessionMode || descriptor.invocationProfile !== policy.invocationProfile) fail('TOOL_DESCRIPTOR_POLICY_MISMATCH');
  absolute(descriptor.bundleRoot); absolute(descriptor.bundleRealpath); relative(descriptor.entrypoint);
  for (const key of ['entrypointSha256', 'packageJsonSha256', 'lockfileSha256', 'treeManifestSha256', 'invocationProfileSha256']) digest(descriptor[key]);
  if (descriptor.entrypointSha256 !== policy.entrypointSha256 || descriptor.lockfileSha256 !== LOCKFILE_SHA256) fail('TOOL_DESCRIPTOR_POLICY_MISMATCH');
  exact(descriptor.runtime, ['path', 'realpath', 'version', 'sha256'], 'TOOL_DESCRIPTOR_INVALID');
  absolute(descriptor.runtime.path); absolute(descriptor.runtime.realpath); digest(descriptor.runtime.sha256);
  if (descriptor.runtime.path !== RUNTIME.path || descriptor.runtime.realpath !== RUNTIME.path || descriptor.runtime.version !== RUNTIME.version || descriptor.runtime.sha256 !== RUNTIME.sha256) fail('TOOL_RUNTIME_POLICY_MISMATCH');
  if (policy.native === null) { if (descriptor.nativeBinary !== null) fail('TOOL_NATIVE_POLICY_MISMATCH'); }
  else {
    exact(descriptor.nativeBinary, ['package', 'version', 'path', 'sha256', 'packageJsonSha256'], 'TOOL_DESCRIPTOR_INVALID'); relative(descriptor.nativeBinary.path); digest(descriptor.nativeBinary.sha256); digest(descriptor.nativeBinary.packageJsonSha256);
    if (descriptor.nativeBinary.package !== policy.native.package || descriptor.nativeBinary.version !== policy.native.version || descriptor.nativeBinary.path !== policy.native.path || descriptor.nativeBinary.sha256 !== policy.native.sha256) fail('TOOL_NATIVE_POLICY_MISMATCH');
  }
  return descriptor;
}

function comparePath(a, b) { return Buffer.compare(Buffer.from(a.path, 'utf8'), Buffer.from(b.path, 'utf8')); }
export function validateProviderToolTreeManifest(manifest, expectedProvider) {
  exact(manifest, ['schemaVersion', 'entries'], 'TOOL_MANIFEST_INVALID');
  if (manifest.schemaVersion !== PROVIDER_TOOL_TREE_MANIFEST_SCHEMA || !Array.isArray(manifest.entries) || manifest.entries.length < 2) fail('TOOL_MANIFEST_INVALID');
  if (expectedProvider !== undefined) {
    const policy = PROVIDERS[expectedProvider];
    if (!policy) fail('TOOL_PROVIDER_UNSUPPORTED');
    if (manifest.entries.length > policy.limits.maxNodes) fail('TOOL_MANIFEST_NODE_LIMIT');
  }
  const paths = new Set(); const folded = new Set(); let previous;
  for (const entry of manifest.entries) {
    if (!plain(entry) || (entry.type !== 'directory' && entry.type !== 'file')) fail('TOOL_MANIFEST_INVALID');
    exact(entry, entry.type === 'file' ? ['path', 'type', 'mode', 'sha256'] : ['path', 'type', 'mode'], 'TOOL_MANIFEST_INVALID');
    if (entry.path !== '.') relative(entry.path, 'TOOL_MANIFEST_PATH_INVALID');
    if (entry.path === '.' && entry.type !== 'directory') fail('TOOL_MANIFEST_PATH_INVALID');
    if (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777 || (entry.mode & 0o22) !== 0) fail('TOOL_MANIFEST_MODE_INVALID');
    if (entry.type === 'file') digest(entry.sha256, 'TOOL_MANIFEST_INVALID');
    if (paths.has(entry.path) || folded.has(entry.path.toLowerCase())) fail('TOOL_MANIFEST_PATH_COLLISION');
    paths.add(entry.path); folded.add(entry.path.toLowerCase());
    if (previous && comparePath(previous, entry) >= 0) fail('TOOL_MANIFEST_ORDER_INVALID'); previous = entry;
  }
  if (manifest.entries[0].path !== '.') fail('TOOL_MANIFEST_PATH_INVALID');
  for (const entry of manifest.entries.slice(1)) { const parent = posix.dirname(entry.path); if (!paths.has(parent) || manifest.entries.find((x) => x.path === parent)?.type !== 'directory') fail('TOOL_MANIFEST_PARENT_INVALID'); }
  return manifest;
}

function validateNode(node, collectorUid, isRuntime = false) {
  exact(node, ['path', 'realpath', 'type', 'mode', 'uid', 'dev', 'ino', 'nlink', 'sha256'], 'TOOL_SNAPSHOT_INVALID');
  absolute(node.path, 'TOOL_SNAPSHOT_INVALID'); absolute(node.realpath, 'TOOL_SNAPSHOT_INVALID');
  if (!['file', 'directory'].includes(node.type) || !Number.isInteger(node.mode) || !Number.isInteger(node.uid) || !Number.isInteger(node.dev) || !Number.isInteger(node.ino) || !Number.isInteger(node.nlink)) fail('TOOL_SNAPSHOT_INVALID');
  if (node.path !== node.realpath) fail('TOOL_SYMLINK_FORBIDDEN');
  if ((node.mode & 0o22) !== 0 || node.uid !== 0 || node.uid === collectorUid) fail(isRuntime ? 'TOOL_RUNTIME_POLICY_MISMATCH' : 'TOOL_BUNDLE_POLICY_MISMATCH');
  if (node.type === 'file') { if (node.nlink !== 1) fail('TOOL_HARDLINK_FORBIDDEN'); digest(node.sha256, 'TOOL_SNAPSHOT_INVALID'); }
  else if (node.sha256 !== null || node.nlink < 1) fail('TOOL_SNAPSHOT_INVALID');
}
function packageJsonPath(descriptor) { return `node_modules/${descriptor.package}/package.json`; }
function invocationProfilePath(descriptor) { return `invocation-profiles/${descriptor.invocationProfile}.json`; }
export function validateProviderToolBundleSnapshot({ descriptor, manifest, snapshot, expectedProvider, collectorUid }) {
  validateProviderToolDescriptor(descriptor, expectedProvider); validateProviderToolTreeManifest(manifest);
  if (!Number.isInteger(collectorUid) || !plain(snapshot)) fail('TOOL_SNAPSHOT_INVALID');
  exact(snapshot, ['bundleRoot', 'bundleRealpath', 'ancestry', 'nodes', 'runtime'], 'TOOL_SNAPSHOT_INVALID');
  if (snapshot.bundleRoot !== descriptor.bundleRoot || snapshot.bundleRealpath !== descriptor.bundleRealpath || descriptor.bundleRoot !== descriptor.bundleRealpath) fail('TOOL_BUNDLE_REALPATH_MISMATCH');
  if (!Array.isArray(snapshot.ancestry) || !Array.isArray(snapshot.nodes)) fail('TOOL_SNAPSHOT_INVALID');
  snapshot.ancestry.forEach((node) => { validateNode(node, collectorUid); if (node.type !== 'directory') fail('TOOL_ANCESTRY_INVALID'); }); snapshot.nodes.forEach((node) => validateNode(node, collectorUid)); validateNode(snapshot.runtime, collectorUid, true);
  if (snapshot.ancestry.length < 2 || snapshot.ancestry[0].path !== '/' || snapshot.ancestry.at(-1).path !== descriptor.bundleRoot) fail('TOOL_ANCESTRY_INVALID');
  for (let i = 1; i < snapshot.ancestry.length; i += 1) if (dirname(snapshot.ancestry[i].path) !== snapshot.ancestry[i - 1].path) fail('TOOL_ANCESTRY_INVALID');
  if (snapshot.runtime.type !== 'file' || snapshot.runtime.path !== descriptor.runtime.path || snapshot.runtime.realpath !== descriptor.runtime.realpath || snapshot.runtime.sha256 !== descriptor.runtime.sha256) fail('TOOL_RUNTIME_POLICY_MISMATCH');
  if (snapshot.nodes.length !== manifest.entries.length) fail('TOOL_TREE_MANIFEST_MISMATCH');
  const fileIds = new Set();
  for (let i = 0; i < manifest.entries.length; i += 1) {
    const wanted = manifest.entries[i], node = snapshot.nodes[i], path = wanted.path === '.' ? descriptor.bundleRoot : join(descriptor.bundleRoot, ...wanted.path.split('/'));
    if (node.path !== path || node.realpath !== path || node.type !== wanted.type || node.mode !== wanted.mode || (wanted.type === 'file' && node.sha256 !== wanted.sha256)) fail('TOOL_TREE_MANIFEST_MISMATCH');
    if (node.type === 'file') { const id = `${node.dev}:${node.ino}`; if (fileIds.has(id)) fail('TOOL_HARDLINK_FORBIDDEN'); fileIds.add(id); }
  }
  if (hashProviderToolManifest(manifest) !== descriptor.treeManifestSha256) fail('TOOL_TREE_MANIFEST_DIGEST_MISMATCH');
  const byRelative = new Map(snapshot.nodes.map((node, i) => [manifest.entries[i].path, node]));
  const required = [[packageJsonPath(descriptor), descriptor.packageJsonSha256], ['package-lock.json', descriptor.lockfileSha256], [descriptor.entrypoint, descriptor.entrypointSha256], [invocationProfilePath(descriptor), descriptor.invocationProfileSha256]];
  if (descriptor.nativeBinary) required.push([descriptor.nativeBinary.path, descriptor.nativeBinary.sha256], [`node_modules/${descriptor.nativeBinary.package}/package.json`, descriptor.nativeBinary.packageJsonSha256]);
  for (const [path, hash] of required) if (byRelative.get(path)?.type !== 'file' || byRelative.get(path)?.sha256 !== hash) fail('TOOL_PIN_MISMATCH');
  return snapshot;
}
export function assertProviderToolSnapshotsEqual(before, after) {
  if (canonicalProviderToolJson(before) !== canonicalProviderToolJson(after)) fail('TOOL_BUNDLE_CHANGED');
}

async function hashHandle(handle) {
  const hash = createHash('sha256');
  await new Promise((ok, no) => createReadStream('', { fd: handle.fd, autoClose: false, start: 0 }).on('data', (chunk) => hash.update(chunk)).on('error', no).on('end', ok));
  return `sha256:${hash.digest('hex')}`;
}
async function inspect(path) {
  const named = await lstat(path).catch(() => fail('TOOL_FILESYSTEM_UNAVAILABLE'));
  if (named.isSymbolicLink()) fail('TOOL_SYMLINK_FORBIDDEN');
  const type = named.isFile() ? 'file' : named.isDirectory() ? 'directory' : fail('TOOL_SPECIAL_FILE_FORBIDDEN');
  let hash = null;
  if (type === 'file') {
    let handle; try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('TOOL_FILESYSTEM_CHANGED'); }
    try { const a = await handle.stat(); hash = await hashHandle(handle); const b = await handle.stat(); if (!a.isFile() || a.dev !== b.dev || a.ino !== b.ino || a.size !== b.size || a.mtimeNs !== b.mtimeNs) fail('TOOL_FILESYSTEM_CHANGED'); } finally { await handle.close(); }
  }
  return { path, realpath: await realpath(path), type, mode: named.mode & 0o7777, uid: named.uid, dev: named.dev, ino: named.ino, nlink: named.nlink, sha256: hash };
}
async function scan(root) {
  const nodes = []; const walk = async (absolutePath, relativePath) => {
    nodes.push({ relativePath, node: await inspect(absolutePath) });
    if (nodes.at(-1).node.type === 'directory') {
      const names = await readdir(absolutePath, { encoding: 'utf8' });
      names.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
      for (const name of names) await walk(join(absolutePath, name), relativePath === '.' ? name : `${relativePath}/${name}`);
    }
  }; await walk(root, '.'); nodes.sort((a, b) => comparePath({ path: a.relativePath }, { path: b.relativePath })); return nodes.map((x) => x.node);
}
async function ancestry(root) {
  const out = []; let current = root;
  while (true) { out.push(await inspect(current)); if (current === sep) break; current = dirname(current); }
  return out.reverse();
}
async function filesystemSnapshot(descriptor) {
  return { bundleRoot: descriptor.bundleRoot, bundleRealpath: await realpath(descriptor.bundleRoot), ancestry: await ancestry(descriptor.bundleRoot), nodes: await scan(descriptor.bundleRoot), runtime: await inspect(descriptor.runtime.path) };
}
async function validateProviderToolPackageVersions(descriptor) {
  const packagePins = [[packageJsonPath(descriptor), descriptor.package, descriptor.version]];
  if (descriptor.nativeBinary && descriptor.nativeBinary.package !== descriptor.package) packagePins.push([`node_modules/${descriptor.nativeBinary.package}/package.json`, descriptor.nativeBinary.package, descriptor.nativeBinary.version]);
  for (const [relativePath, name, version] of packagePins) {
    let packageJson; try { packageJson = JSON.parse(await readFile(join(descriptor.bundleRoot, relativePath), 'utf8')); } catch { fail('TOOL_PACKAGE_JSON_INVALID'); }
    if (!plain(packageJson) || packageJson.name !== name || packageJson.version !== version) fail('TOOL_PACKAGE_VERSION_MISMATCH');
  }
}
// Pure policy above lets tests model root-owned trees without privileges. This
// adapter collects complete pre/post snapshots from a real filesystem.
export async function validateProviderToolBundleFilesystem({ descriptor, manifest, expectedProvider, collectorUid = process.getuid?.(), betweenSnapshots } = {}) {
  validateProviderToolDescriptor(descriptor, expectedProvider); validateProviderToolTreeManifest(manifest);
  const before = await filesystemSnapshot(descriptor); validateProviderToolBundleSnapshot({ descriptor, manifest, snapshot: before, expectedProvider, collectorUid });
  await validateProviderToolPackageVersions(descriptor);
  let operationResult, operationError;
  if (betweenSnapshots !== undefined) {
    if (typeof betweenSnapshots !== 'function') fail('TOOL_VALIDATOR_INVALID');
    try { operationResult = await betweenSnapshots(); } catch (error) { operationError = error; }
  }
  const after = await filesystemSnapshot(descriptor); validateProviderToolBundleSnapshot({ descriptor, manifest, snapshot: after, expectedProvider, collectorUid }); assertProviderToolSnapshotsEqual(before, after);
  await validateProviderToolPackageVersions(descriptor);
  if (operationError) throw operationError;
  return Object.freeze({ descriptor, manifest, before, after, operationResult });
}

// The signed plan pins the manifest digest, while the complete manifest lives
// beside (not inside) the bundle so it does not have to describe/hash itself.
// Production callers use this entry point; its snapshots always inspect the
// real filesystem. Tests can still exercise the pure snapshot policy above.
export async function validateProviderToolBundleForExecution({ descriptor, expectedProvider, betweenSnapshots } = {}) {
  validateProviderToolDescriptor(descriptor, expectedProvider);
  // The descriptor policy is validated before selecting this cap. Neither a
  // descriptor field nor any caller-supplied numeric value can widen it.
  const manifestPolicy = PROVIDERS[expectedProvider];
  const path = `${descriptor.bundleRoot}.tree-manifest.json`;
  let bytes;
  try { bytes = await readFile(path); } catch { fail('TOOL_MANIFEST_UNAVAILABLE'); }
  if (bytes.length < 3 || bytes.length > manifestPolicy.limits.maxManifestBytes) fail('TOOL_MANIFEST_SIZE_INVALID');
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { fail('TOOL_MANIFEST_INVALID'); }
  validateProviderToolTreeManifest(manifest, expectedProvider);
  const canonical = Buffer.from(`${canonicalProviderToolJson(manifest)}\n`, 'utf8');
  if (!bytes.equals(canonical)) fail('TOOL_MANIFEST_NON_CANONICAL');
  if (hashProviderToolManifest(manifest) !== descriptor.treeManifestSha256) fail('TOOL_TREE_MANIFEST_DIGEST_MISMATCH');
  return validateProviderToolBundleFilesystem({ descriptor, manifest, expectedProvider, betweenSnapshots });
}
