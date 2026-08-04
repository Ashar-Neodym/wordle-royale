import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  PROVIDER_TOOL_SCHEMA, PROVIDER_TOOL_TREE_MANIFEST_SCHEMA, assertProviderToolSnapshotsEqual,
  canonicalProviderToolJson, hashProviderToolManifest, validateProviderToolBundleFilesystem,
  validateProviderToolBundleSnapshot, validateProviderToolDescriptor, validateProviderToolTreeManifest,
} from './g0-provider-tool-bundle.mjs';

const HASH = Object.freeze({
  lock: 'sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90',
  runtime: 'sha256:f3f93db342d5ac5bb61656d0599a603a73779e98befd9342171e550002725f4d',
  vercel: 'sha256:56b16d6893212069398eb30e2d96943421cd8a5ba7ea3372a1dd5743ed23d363',
  railway: 'sha256:21023bebb7838bd52d7646bf0ce75d3c33dc259797dd6e920e318be630184d2d',
  railwayNative: 'sha256:26f5c4d8e22c8af4b6523e54d33a44cfe861a40442f171d4aa0fee8ec800a3b2',
  supabase: 'sha256:253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240',
  supabaseNative: 'sha256:e0574b435f54898aa1f5f6fe0696e61b612dafc9b86a2aa538cf8215fc3c9e9f',
  package: `sha256:${'1'.repeat(64)}`, profile: `sha256:${'2'.repeat(64)}`, nativePackage: `sha256:${'3'.repeat(64)}`,
});
const POLICIES = {
  vercel: { package: 'vercel', version: '58.4.4', entrypoint: 'node_modules/vercel/dist/vc.js', entryHash: HASH.vercel, profile: 'vercel-g0-readonly/1', native: null },
  railway: { package: '@railway/cli', version: '5.30.1', entrypoint: 'node_modules/@railway/cli/bin/railway.js', entryHash: HASH.railway, profile: 'railway-g0-readonly/1', native: { package: '@railway/cli', version: '5.30.1', path: 'node_modules/@railway/cli/bin/railway', sha256: HASH.railwayNative } },
  supabase: { package: 'supabase', version: '2.110.0', entrypoint: 'node_modules/supabase/dist/supabase.js', entryHash: HASH.supabase, profile: 'supabase-g0-readonly/1', native: { package: '@supabase/cli-linux-x64', version: '2.110.0', path: 'node_modules/@supabase/cli-linux-x64/bin/supabase', sha256: HASH.supabaseNative } },
};
const clone = (x) => structuredClone(x);
const throws = (code, fn) => assert.throws(fn, (error) => error?.code === code);
function descriptor(provider = 'vercel', root = `/opt/wordle-tools/${provider}`) {
  const p = POLICIES[provider];
  return { schemaVersion: PROVIDER_TOOL_SCHEMA, distribution: 'official_npm_cli', package: p.package, version: p.version, bundleRoot: root, bundleRealpath: root, entrypoint: p.entrypoint, entrypointSha256: p.entryHash, packageJsonSha256: HASH.package, lockfileSha256: HASH.lock, treeManifestSha256: `sha256:${'0'.repeat(64)}`, runtime: { path: '/usr/bin/node', realpath: '/usr/bin/node', version: 'v18.19.1', sha256: HASH.runtime }, sessionMode: 'standard_os_user_session', invocationProfile: p.profile, invocationProfileSha256: HASH.profile, nativeBinary: p.native ? { ...p.native, packageJsonSha256: p.native.package === p.package ? HASH.package : HASH.nativePackage } : null };
}
function fixture(provider = 'vercel') {
  const d = descriptor(provider); const p = POLICIES[provider];
  const files = new Map([
    ['package-lock.json', HASH.lock], [p.entrypoint, p.entryHash], [`node_modules/${p.package}/package.json`, HASH.package], [`invocation-profiles/${p.profile}.json`, HASH.profile],
  ]); if (p.native) { files.set(p.native.path, p.native.sha256); files.set(`node_modules/${p.native.package}/package.json`, p.native.package === p.package ? HASH.package : HASH.nativePackage); }
  const dirs = new Set(['.']);
  for (const path of files.keys()) { let at = path; while (at.includes('/')) { at = at.slice(0, at.lastIndexOf('/')); dirs.add(at); } }
  const entries = [...dirs].map((path) => ({ path, type: 'directory', mode: 0o555 }));
  entries.push(...[...files].map(([path, sha256]) => ({ path, type: 'file', mode: path === p.native?.path ? 0o555 : 0o444, sha256 })));
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const manifest = { schemaVersion: PROVIDER_TOOL_TREE_MANIFEST_SCHEMA, entries }; d.treeManifestSha256 = hashProviderToolManifest(manifest);
  let ino = 100; const nodes = entries.map((entry) => ({ path: entry.path === '.' ? d.bundleRoot : join(d.bundleRoot, ...entry.path.split('/')), realpath: entry.path === '.' ? d.bundleRoot : join(d.bundleRoot, ...entry.path.split('/')), type: entry.type, mode: entry.mode, uid: 0, dev: 1, ino: ino++, nlink: entry.type === 'file' ? 1 : 2, sha256: entry.sha256 ?? null }));
  const safeDir = (path, inode) => ({ path, realpath: path, type: 'directory', mode: 0o755, uid: 0, dev: 1, ino: inode, nlink: 2, sha256: null });
  const snapshot = { bundleRoot: d.bundleRoot, bundleRealpath: d.bundleRealpath, ancestry: [safeDir('/', 1), safeDir('/opt', 2), safeDir('/opt/wordle-tools', 3), nodes[0]], nodes, runtime: { path: '/usr/bin/node', realpath: '/usr/bin/node', type: 'file', mode: 0o755, uid: 0, dev: 1, ino: 10, nlink: 1, sha256: HASH.runtime } };
  return { descriptor: d, manifest, snapshot, expectedProvider: provider, collectorUid: 1000 };
}

test('canonical manifest bytes are recursively key-sorted and newline-hashed', () => {
  assert.equal(canonicalProviderToolJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  const a = fixture(); assert.equal(a.descriptor.treeManifestSha256, hashProviderToolManifest(a.manifest));
});

test('closed descriptors accept only the approved provider/package/version/profile/session/runtime/native combinations', () => {
  for (const provider of Object.keys(POLICIES)) assert.equal(validateProviderToolDescriptor(descriptor(provider), provider).version, POLICIES[provider].version);
  for (const [field, value, code] of [['version', 'latest', 'TOOL_DESCRIPTOR_POLICY_MISMATCH'], ['sessionMode', 'token_file', 'TOOL_DESCRIPTOR_POLICY_MISMATCH'], ['invocationProfile', 'arbitrary', 'TOOL_DESCRIPTOR_POLICY_MISMATCH'], ['bundleRoot', '../tree', 'TOOL_DESCRIPTOR_INVALID']]) { const d = descriptor(); d[field] = value; throws(code, () => validateProviderToolDescriptor(d, 'vercel')); }
  const extra = descriptor(); extra.credentialPath = '/secret'; throws('TOOL_DESCRIPTOR_INVALID', () => validateProviderToolDescriptor(extra, 'vercel'));
  const runtime = descriptor(); runtime.runtime.version = 'v99.0.0'; throws('TOOL_RUNTIME_POLICY_MISMATCH', () => validateProviderToolDescriptor(runtime, 'vercel'));
  const swapped = descriptor('railway'); swapped.nativeBinary.sha256 = HASH.supabaseNative; throws('TOOL_NATIVE_POLICY_MISMATCH', () => validateProviderToolDescriptor(swapped, 'railway'));
});

test('manifest requires bytewise relative-path order, complete parents, closed entries, and no collisions/traversal', () => {
  assert.doesNotThrow(() => validateProviderToolTreeManifest(fixture().manifest));
  const cases = [
    ['TOOL_MANIFEST_ORDER_INVALID', (m) => m.entries.reverse()],
    ['TOOL_MANIFEST_PATH_INVALID', (m) => { m.entries[1].path = '../escape'; }],
    ['TOOL_MANIFEST_PATH_COLLISION', (m) => { const file = m.entries.find((x) => x.type === 'file'); m.entries.splice(m.entries.indexOf(file) + 1, 0, { ...file }); }],
    ['TOOL_MANIFEST_PATH_COLLISION', (m) => { const file = m.entries.find((x) => x.type === 'file'); m.entries.splice(m.entries.indexOf(file) + 1, 0, { ...file, path: file.path.toUpperCase() }); m.entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))); }],
    ['TOOL_MANIFEST_MODE_INVALID', (m) => { m.entries[0].mode = 0o775; }],
    ['TOOL_MANIFEST_INVALID', (m) => { m.entries[0].owner = 'root'; }],
  ];
  for (const [code, mutate] of cases) { const m = clone(fixture().manifest); mutate(m); throws(code, () => validateProviderToolTreeManifest(m)); }
});

test('pure immutable-tree policy validates all three npm distribution shapes', () => {
  for (const provider of Object.keys(POLICIES)) assert.equal(validateProviderToolBundleSnapshot(fixture(provider)).bundleRoot, `/opt/wordle-tools/${provider}`);
});

test('tree comparison rejects omitted, extra, swapped dependency and each pinned file', () => {
  for (const mutate of [
    (f) => f.snapshot.nodes.pop(),
    (f) => f.snapshot.nodes.push(clone(f.snapshot.nodes.at(-1))),
    (f) => { f.snapshot.nodes.find((x) => x.path.endsWith('/vc.js')).sha256 = `sha256:${'a'.repeat(64)}`; },
    (f) => { f.snapshot.nodes.find((x) => x.path.endsWith('/package.json')).sha256 = `sha256:${'b'.repeat(64)}`; },
    (f) => { f.snapshot.nodes.find((x) => x.path.endsWith('/package-lock.json')).sha256 = `sha256:${'c'.repeat(64)}`; },
    (f) => { f.snapshot.nodes.find((x) => x.path.includes('/invocation-profiles/')).sha256 = `sha256:${'d'.repeat(64)}`; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => validateProviderToolBundleSnapshot(f)); }
  const railway = fixture('railway'); railway.snapshot.nodes.find((x) => x.path.endsWith('/bin/railway')).sha256 = HASH.supabaseNative; assert.throws(() => validateProviderToolBundleSnapshot(railway));
});

test('policy rejects wrong realpath, writable ancestry/dependency, collector ownership, hardlinks, symlinks and special nodes', () => {
  const attacks = [
    ['TOOL_BUNDLE_REALPATH_MISMATCH', (f) => { f.snapshot.bundleRealpath = '/other'; }],
    ['TOOL_BUNDLE_POLICY_MISMATCH', (f) => { f.snapshot.ancestry[1].mode = 0o777; }],
    ['TOOL_BUNDLE_POLICY_MISMATCH', (f) => { f.snapshot.nodes.at(-1).mode = 0o666; }],
    ['TOOL_BUNDLE_POLICY_MISMATCH', (f) => { f.snapshot.nodes.at(-1).uid = 1000; }],
    ['TOOL_BUNDLE_POLICY_MISMATCH', (f) => { f.snapshot.nodes.at(-1).uid = 2000; }],
    ['TOOL_HARDLINK_FORBIDDEN', (f) => { f.snapshot.nodes.find((x) => x.type === 'file').nlink = 2; }],
    ['TOOL_HARDLINK_FORBIDDEN', (f) => { const files = f.snapshot.nodes.filter((x) => x.type === 'file'); files[1].dev = files[0].dev; files[1].ino = files[0].ino; }],
    ['TOOL_SYMLINK_FORBIDDEN', (f) => { f.snapshot.nodes.at(-1).realpath = '/elsewhere'; }],
    ['TOOL_SNAPSHOT_INVALID', (f) => { f.snapshot.nodes.at(-1).type = 'fifo'; }],
    ['TOOL_RUNTIME_POLICY_MISMATCH', (f) => { f.snapshot.runtime.mode = 0o777; }],
    ['TOOL_ANCESTRY_INVALID', (f) => { f.snapshot.ancestry.splice(1, 1); }],
  ];
  for (const [code, mutate] of attacks) { const f = fixture(); mutate(f); throws(code, () => validateProviderToolBundleSnapshot(f)); }
});

test('pre/post comparison detects metadata, dependency, runtime and manifest-time mutation', () => {
  const before = fixture().snapshot;
  assert.doesNotThrow(() => assertProviderToolSnapshotsEqual(before, clone(before)));
  for (const mutate of [(x) => { x.nodes.at(-1).sha256 = `sha256:${'e'.repeat(64)}`; }, (x) => { x.nodes[0].ino += 1; }, (x) => { x.runtime.sha256 = `sha256:${'f'.repeat(64)}`; }]) { const after = clone(before); mutate(after); throws('TOOL_BUNDLE_CHANGED', () => assertProviderToolSnapshotsEqual(before, after)); }
});

test('filesystem adapter rejects an actually symlinked bundle node without following it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wordle-am1-'));
  try {
    await mkdir(join(root, 'node_modules/vercel/dist'), { recursive: true }); await mkdir(join(root, 'invocation-profiles/vercel-g0-readonly'), { recursive: true });
    await writeFile(join(root, 'package-lock.json'), 'lock'); await writeFile(join(root, 'node_modules/vercel/package.json'), '{"name":"vercel","version":"58.4.4"}');
    await writeFile(join(root, 'node_modules/vercel/dist/vc.js'), 'entry'); await writeFile(join(root, 'invocation-profiles/vercel-g0-readonly/1.json'), '{}');
    await symlink('/etc/passwd', join(root, 'node_modules/vercel/dist/escape'));
    const f = fixture(); f.descriptor.bundleRoot = root; f.descriptor.bundleRealpath = root;
    await assert.rejects(validateProviderToolBundleFilesystem({ descriptor: f.descriptor, manifest: f.manifest, expectedProvider: 'vercel', collectorUid: 999999 }), (error) => error?.code === 'TOOL_SYMLINK_FORBIDDEN');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('descriptor contains no credential path/value or ambient-session detail', () => {
  for (const provider of Object.keys(POLICIES)) {
    const text = canonicalProviderToolJson(descriptor(provider));
    assert.doesNotMatch(text, /credential|token|cookie|authorization|home|sessionpath/iu);
    assert.match(text, /standard_os_user_session/u);
  }
});
