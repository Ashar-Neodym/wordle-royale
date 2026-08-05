import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateProviderBundleArtifacts } from './g0-provider-bundle-artifact-core.mjs';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import { getProviderToolArtifactPolicy, validateProviderToolBundleForExecution } from './g0-provider-tool-bundle.mjs';

const SAMPLE = `sha256:${'a'.repeat(64)}`;
const SNAPSHOT = `sha256:${'b'.repeat(64)}`;
const code = (wanted, fn) => assert.throws(fn, (error) => error?.code === wanted, `expected ${wanted}`);
const rejectCode = (wanted, promise) => assert.rejects(promise, (error) => error?.code === wanted, `expected ${wanted}`);
const rawCompare = (a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path));

function copier(provider) {
  const policy = getProviderToolArtifactPolicy(provider);
  const profile = generateProviderBundleProfile(provider);
  const files = new Map([
    ['package-lock.json', policy.lockfileSha256],
    [policy.entrypoint, policy.entrypointSha256],
    [`node_modules/${policy.package}/package.json`, SAMPLE],
    [profile.relativePath, profile.sha256],
  ]);
  if (policy.native) {
    files.set(policy.native.path, policy.native.sha256);
    files.set(`node_modules/${policy.native.package}/package.json`, policy.native.package === policy.package ? SAMPLE : `sha256:${'c'.repeat(64)}`);
  }
  const dirs = new Set(['.']);
  for (const path of files.keys()) {
    let parent = path;
    while (parent.includes('/')) { parent = parent.slice(0, parent.lastIndexOf('/')); dirs.add(parent); }
  }
  const entries = [...dirs].map((path) => ({ path, type: 'directory', mode: 0o555 }));
  entries.push(...[...files].map(([path, sha256]) => ({ path, type: 'file', mode: path === policy.native?.path ? 0o555 : 0o444, sha256 })));
  entries.sort(rawCompare);
  return { schemaVersion: 'wordle-g0-bundle-copy/v2', packageCount: 1, nodeCount: entries.length, payloadBytes: 123, entries, sourceSnapshotSha256: SNAPSHOT };
}
const build = (provider) => generateProviderBundleArtifacts({ provider, copierResult: copier(provider) });

const EXPECTED = {
  vercel: { root: '/opt/wordle-royale/g0-provider-tools/vercel-58.4.4', manifest: 'sha256:554583b017f2c026b6b2d4681ad90c35144ec2fc087cb7cfbf6b4fc54536223e', descriptor: 'sha256:53e19027e6f4d2cbb6f54c77016cb59d7d9ea59e650074b6ab501695f0fcbd5c' },
  railway: { root: '/opt/wordle-royale/g0-provider-tools/railway-5.30.1', manifest: 'sha256:d30c339910d6b2e3bb0f7100ab343c1b37e1dbe587e9c36c2ec427484c944142', descriptor: 'sha256:eb96f7b3d7ea280ab1ceec3a055a75cf3f932788afe92c42377cf47cdff682fa' },
  supabase: { root: '/opt/wordle-royale/g0-provider-tools/supabase-2.110.0', manifest: 'sha256:5fb947288d20aa0c40d9d3a5b0cd8e32f483aa395453897880b9856703663009', descriptor: 'sha256:7a5b91c18522d66f3af93afd5c500cc1c5426fa7d44ebd741f1c8c7f0d19c267' },
};

test('all providers produce canonical closed artifacts at exact compiled roots', () => {
  for (const provider of Object.keys(EXPECTED)) {
    const artifact = build(provider);
    assert.equal(artifact.finalRoot, EXPECTED[provider].root);
    assert.equal(artifact.descriptor.bundleRoot, EXPECTED[provider].root);
    assert.equal(artifact.descriptor.bundleRealpath, EXPECTED[provider].root);
    assert.equal(artifact.manifestBytes.at(-1), 0x0a);
    assert.equal(artifact.descriptorBytes.at(-1), 0x0a);
    assert.equal(artifact.manifestSha256, EXPECTED[provider].manifest);
    assert.equal(artifact.descriptorSha256, EXPECTED[provider].descriptor);
    assert.equal(artifact.bundleTreeSha256, artifact.manifestSha256);
    assert.equal(Object.isFrozen(artifact), true);
    assert.equal(Object.isFrozen(artifact.manifest.entries), true);
    const first = artifact.manifestBytes; first[0] ^= 1;
    assert.notEqual(first[0], artifact.manifestBytes[0]);
    assert.doesNotMatch(artifact.descriptorBytes.toString(), /\/tmp\/|\/home\/|sourceSnapshot/u);
  }
});

test('copy result, order, exact entry shape, modes, required pins and bounds fail closed', () => {
  const attacks = [
    ['ARTIFACT_COPY_RESULT_INVALID', (c) => { c.extra = true; }],
    ['ARTIFACT_COPY_RESULT_INVALID', (c) => { c.nodeCount += 1; }],
    ['ARTIFACT_ENTRY_ORDER_INVALID', (c) => { c.entries.reverse(); }],
    ['ARTIFACT_ENTRY_INVALID', (c) => { c.entries[0].owner = 'user'; }],
    ['ARTIFACT_MODE_INVALID', (c) => { c.entries[0].mode = 0o755; }],
    ['ARTIFACT_LOCKFILE_PIN_MISMATCH', (c) => { c.entries.find((x) => x.path === 'package-lock.json').sha256 = SAMPLE; }],
    ['ARTIFACT_PROFILE_PIN_MISMATCH', (c) => { c.entries.find((x) => x.type === 'file' && x.path.includes('invocation-profiles')).sha256 = SAMPLE; }],
    ['ARTIFACT_ENTRYPOINT_PIN_MISMATCH', (c) => { const p = getProviderToolArtifactPolicy('vercel'); c.entries.find((x) => x.path === p.entrypoint).sha256 = SAMPLE; }],
  ];
  for (const [wanted, attack] of attacks) { const value = copier('vercel'); attack(value); code(wanted, () => generateProviderBundleArtifacts({ provider: 'vercel', copierResult: value })); }
  for (const [field, wanted] of [['packageCount', 'ARTIFACT_PACKAGE_LIMIT'], ['nodeCount', 'ARTIFACT_COPY_RESULT_INVALID'], ['payloadBytes', 'ARTIFACT_PAYLOAD_LIMIT']]) {
    const value = copier('railway'); value[field] = field === 'packageCount' ? 25 : field === 'nodeCount' ? 321 : 32 * 1024 * 1024 + 1;
    code(wanted, () => generateProviderBundleArtifacts({ provider: 'railway', copierResult: value }));
  }
  const native = copier('supabase'); native.entries.find((x) => x.path.endsWith('/bin/supabase')).sha256 = SAMPLE;
  code('ARTIFACT_NATIVE_PIN_MISMATCH', () => generateProviderBundleArtifacts({ provider: 'supabase', copierResult: native }));
});

test('compiled policy is recursively read-only and caller cannot select roots or caps', () => {
  const policy = getProviderToolArtifactPolicy('vercel');
  assert.equal(Object.isFrozen(policy), true); assert.equal(Object.isFrozen(policy.runtime), true); assert.equal(Object.isFrozen(policy.limits), true);
  code('ARTIFACT_INPUT_INVALID', () => generateProviderBundleArtifacts({ provider: 'vercel', copierResult: copier('vercel'), finalRoot: '/tmp/evil' }));
  code('ARTIFACT_INPUT_INVALID', () => generateProviderBundleArtifacts({ provider: 'vercel', copierResult: copier('vercel'), maxManifestBytes: Infinity }));
});

test('Vercel alone can compile a canonical manifest above the former 1 MiB ceiling', () => {
  const value = copier('vercel');
  const parents = ['zz', `zz/${'a'.repeat(240)}`, `zz/${'a'.repeat(240)}/${'b'.repeat(240)}`, `zz/${'a'.repeat(240)}/${'b'.repeat(240)}/${'c'.repeat(240)}`];
  for (const path of parents) value.entries.push({ path, type: 'directory', mode: 0o555 });
  const leafParent = parents.at(-1);
  for (let i = 0; i < 1_100; i += 1) value.entries.push({
    path: `${leafParent}/${String(i).padStart(4, '0')}-${'x'.repeat(175)}`,
    type: 'file', mode: 0o444, sha256: SAMPLE,
  });
  value.entries.sort(rawCompare); value.nodeCount = value.entries.length;
  const artifact = generateProviderBundleArtifacts({ provider: 'vercel', copierResult: value });
  assert.ok(artifact.manifestBytes.length > 1024 * 1024);
  assert.ok(artifact.manifestBytes.length < getProviderToolArtifactPolicy('vercel').limits.maxManifestBytes);
});

test('production manifest byte caps are provider-indexed and checked before tree inspection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wordle-an3-cap-'));
  try {
    for (const provider of ['vercel', 'railway', 'supabase']) {
      const policy = getProviderToolArtifactPolicy(provider);
      const descriptor = structuredClone(build(provider).descriptor);
      descriptor.bundleRoot = join(dir, provider); descriptor.bundleRealpath = descriptor.bundleRoot;
      await writeFile(`${descriptor.bundleRoot}.tree-manifest.json`, Buffer.alloc(policy.limits.maxManifestBytes + 1, 0x20));
      await rejectCode('TOOL_MANIFEST_SIZE_INVALID', validateProviderToolBundleForExecution({ descriptor, expectedProvider: provider, betweenSnapshots: () => { throw new Error('must not run'); } }));
    }
    const large = Buffer.alloc(1_048_577, 0x20);
    const vercelDescriptor = structuredClone(build('vercel').descriptor);
    vercelDescriptor.bundleRoot = join(dir, 'vercel-under-cap'); vercelDescriptor.bundleRealpath = vercelDescriptor.bundleRoot;
    await writeFile(`${vercelDescriptor.bundleRoot}.tree-manifest.json`, large);
    await rejectCode('TOOL_MANIFEST_INVALID', validateProviderToolBundleForExecution({ descriptor: vercelDescriptor, expectedProvider: 'vercel' }));
    const railwayDescriptor = structuredClone(build('railway').descriptor);
    railwayDescriptor.bundleRoot = join(dir, 'railway-same-bytes'); railwayDescriptor.bundleRealpath = railwayDescriptor.bundleRoot;
    await writeFile(`${railwayDescriptor.bundleRoot}.tree-manifest.json`, large);
    await rejectCode('TOOL_MANIFEST_SIZE_INVALID', validateProviderToolBundleForExecution({ descriptor: railwayDescriptor, expectedProvider: 'railway' }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('artifact core has static pure imports and no ambient/filesystem/process capabilities', async () => {
  const source = await readFile(new URL('./g0-provider-bundle-artifact-core.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/from '([^']+)'/gu)].map((x) => x[1]), ['node:crypto', './g0-provider-bundle-profile.mjs', './g0-provider-tool-bundle.mjs']);
  assert.doesNotMatch(source, /node:(?:fs|net|http|https|dns|tls|child_process)|\bprocess(?:\.env)?\b|\b(?:fetch|spawn|exec|fork)\s*\(|\bimport\s*\(|\brequire\s*\(/u);
});
