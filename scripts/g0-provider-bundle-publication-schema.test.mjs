import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import { getProviderToolArtifactPolicy } from './g0-provider-tool-bundle.mjs';
import { generateProviderBundleArtifacts } from './g0-provider-bundle-artifact-core.mjs';
import {
  compileAcquisitionRecord, compileCanonicalSourceSnapshot, compileInertInstallPlan,
  compilePublicationCommit, compilePublicationIndex, derivePublicationId,
  hashCanonicalSourceSnapshot, parseAcquisitionRecord, parseCanonicalSourceSnapshot,
  parseInertInstallPlan, parsePublicationCommit, parsePublicationIndex,
  validateCanonicalSourceSnapshot,
} from './g0-provider-bundle-publication-schema.mjs';

const SAMPLE = `sha256:${'a'.repeat(64)}`;
const SOURCE_REVISION = '976b008b2f031af8bd14d1c6685102091e35e82f';
const providers = ['vercel', 'railway', 'supabase'];
const throws = (wanted, fn) => assert.throws(fn, (error) => error?.code === wanted, `expected ${wanted}`);
const raw = (a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path));
function copier(provider) {
  const policy = getProviderToolArtifactPolicy(provider), profile = generateProviderBundleProfile(provider);
  const files = new Map([['package-lock.json', policy.lockfileSha256], [policy.entrypoint, policy.entrypointSha256], [`node_modules/${policy.package}/package.json`, SAMPLE], [profile.relativePath, profile.sha256]]);
  if (policy.native) { files.set(policy.native.path, policy.native.sha256); files.set(`node_modules/${policy.native.package}/package.json`, SAMPLE); }
  const dirs = new Set(['.']); for (const path of files.keys()) { let parent = path; while (parent.includes('/')) { parent = parent.slice(0, parent.lastIndexOf('/')); dirs.add(parent); } }
  const entries = [...dirs].map((path) => ({ path, type: 'directory', mode: 0o555 }));
  entries.push(...[...files].map(([path, sha256]) => ({ path, type: 'file', mode: path === policy.native?.path ? 0o555 : 0o444, sha256 }))); entries.sort(raw);
  return { schemaVersion: 'wordle-g0-bundle-copy/v2', packageCount: 1, nodeCount: entries.length, payloadBytes: 123, entries, sourceSnapshotSha256: `sha256:${'b'.repeat(64)}` };
}
function snapshot() {
  return { entries: [
    { mode: 0o555, path: 'node_modules/a', type: 'directory' },
    { mode: 0o555, path: 'node_modules/a/lib', type: 'directory' },
    { mode: 0o444, path: 'node_modules/a/lib/a.js', sha256: SAMPLE, type: 'file' },
    { mode: 0o555, path: 'node_modules/b', type: 'directory' },
    { mode: 0o444, path: 'node_modules/b/package.json', sha256: SAMPLE, type: 'file' },
  ], packagePaths: ['node_modules/a', 'node_modules/b'], schemaVersion: 'wordle-royale-g0-canonical-source-snapshot/v1', target: { cpu: 'x64', libc: 'glibc', os: 'linux' } };
}
function publication(provider) {
  const source = compileCanonicalSourceSnapshot(snapshot()); const artifact = generateProviderBundleArtifacts({ provider, copierResult: copier(provider) });
  const acquisition = compileAcquisitionRecord({ canonicalSourceSnapshotSha256: source.sha256 });
  const plan = compileInertInstallPlan({ provider });
  const index = compilePublicationIndex({ provider, manifest: artifact.manifest, descriptor: artifact.descriptor, acquisitionRecord: acquisition, installPlan: plan, canonicalSourceSnapshotSha256: source.sha256, sourceRevision: SOURCE_REVISION });
  const commit = compilePublicationCommit({ publicationIndex: index });
  return { source, artifact, acquisition, plan, index, commit };
}
function mutateCanonical(compilation, mutate) { const value = structuredClone(compilation.document); mutate(value); return Buffer.from(`${JSON.stringify(value)}\n`); }

test('all three providers compile deterministic canonical publication metadata and round-trip', () => {
  for (const provider of providers) {
    const a = publication(provider), b = publication(provider);
    for (const member of ['source', 'acquisition', 'plan', 'index', 'commit']) { assert.deepEqual(a[member].bytes, b[member].bytes); assert.equal(a[member].bytes.at(-1), 10); assert.equal(Object.isFrozen(a[member]), true); assert.equal(Object.isFrozen(a[member].document), true); }
    assert.deepEqual(parseCanonicalSourceSnapshot(a.source.bytes), a.source.document);
    assert.deepEqual(parseAcquisitionRecord(a.acquisition.bytes), a.acquisition.document);
    assert.deepEqual(parseInertInstallPlan(a.plan.bytes), a.plan.document);
    assert.deepEqual(parsePublicationIndex(a.index.bytes), a.index.document);
    assert.deepEqual(parsePublicationCommit(a.commit.bytes), a.commit.document);
    assert.match(derivePublicationId(a.index), new RegExp(`^${a.index.document.artifactId}-[a-f0-9]{32}$`, 'u'));
    const changed = a.index.bytes; changed[0] ^= 1; assert.notEqual(changed[0], a.index.bytes[0]);
  }
});

test('source snapshot validates closed complete normalized sorted paths, modes and hashes', () => {
  const good = snapshot(); assert.equal(hashCanonicalSourceSnapshot(good), compileCanonicalSourceSnapshot(good).sha256);
  const attacks = [
    ['SOURCE_SNAPSHOT_INVALID', (x) => { x.extra = true; }],
    ['SOURCE_SNAPSHOT_PATH_INVALID', (x) => { x.entries.reverse(); }],
    ['SOURCE_SNAPSHOT_ENTRY_INVALID', (x) => { x.entries[0].sha256 = SAMPLE; }],
    ['SOURCE_SNAPSHOT_MODE_INVALID', (x) => { x.entries.at(-1).mode = 0o555; }],
    ['SOURCE_SNAPSHOT_PARENT_MISSING', (x) => { x.entries.splice(1, 1); }],
    ['SOURCE_SNAPSHOT_EXCLUDED_PATH', (x) => { x.entries.at(-1).path = 'node_modules/b/.bin'; }],
    ['SOURCE_SNAPSHOT_PATH_INVALID', (x) => { x.entries.at(-1).path = 'node_modules/b/../x'; }],
  ];
  for (const [code, attack] of attacks) { const value = snapshot(); attack(value); throws(code, () => validateCanonicalSourceSnapshot(value)); }
});

test('snapshot caps fail rather than truncate', () => {
  const tooMany = snapshot(); tooMany.entries = Array.from({ length: 20_001 }, (_, i) => ({ mode: 0o444, path: `node_modules/a/${String(i).padStart(5, '0')}`, sha256: SAMPLE, type: 'file' }));
  throws('SOURCE_SNAPSHOT_LIMIT', () => validateCanonicalSourceSnapshot(tooMany));
  const huge = snapshot(); huge.entries = [{ mode: 0o555, path: 'node_modules/a', type: 'directory' }]; huge.packagePaths = ['node_modules/a'];
  for (let i = 0; i < 17_000; i += 1) huge.entries.push({ mode: 0o444, path: `node_modules/a/${String(i).padStart(5, '0')}-${'x'.repeat(220)}`, sha256: SAMPLE, type: 'file' });
  throws('SOURCE_SNAPSHOT_SIZE_LIMIT', () => compileCanonicalSourceSnapshot(huge));
});

test('acquisition compiler fixes every input, toolchain, target, npm and network policy field', () => {
  const record = publication('vercel').acquisition;
  assert.equal(record.document.toolchain.node.version, 'v26.3.0'); assert.equal(record.document.npmPolicy.ignoreScripts, true);
  throws('ACQUISITION_INPUT_INVALID', () => compileAcquisitionRecord({ canonicalSourceSnapshotSha256: record.document.canonicalSourceSnapshotSha256, sourceRoot: '/tmp/evil' }));
  throws('ACQUISITION_RECORD_INVALID', () => parseAcquisitionRecord(mutateCanonical(record, (x) => { x.networkPolicy.ambientCredentialsAllowed = true; })));
});

test('inert plans fix all roots, destinations, sources, modes, authority and policy', () => {
  for (const provider of providers) { const plan = compileInertInstallPlan({ provider }); assert.equal(plan.document.privilegedExecutionAuthorized, false); assert.equal(plan.document.destinations.bundleRoot, getProviderToolArtifactPolicy(provider).finalRoot); }
  throws('INSTALL_PLAN_INPUT_INVALID', () => compileInertInstallPlan({ provider: 'vercel', bundleRoot: '/tmp/evil' }));
  const plan = publication('vercel').plan;
  throws('INSTALL_PLAN_INVALID', () => parseInertInstallPlan(mutateCanonical(plan, (x) => { x.privilegedExecutionAuthorized = true; })));
  for (const [key, value] of [['command', 'sudo provider login'], ['argv', ['--token=x']], ['environment', { AUTH_TOKEN: 'x' }], ['session', 'provider invocation']]) {
    throws('INSTALL_PLAN_FORBIDDEN_CONTENT', () => parseInertInstallPlan(mutateCanonical(plan, (x) => { x[key] = value; })));
  }
});

test('strict parsers reject unknown, missing, duplicate, noncanonical and malformed wire', () => {
  const record = publication('railway').acquisition;
  throws('ACQUISITION_RECORD_INVALID', () => parseAcquisitionRecord(mutateCanonical(record, (x) => { x.unknown = 1; })));
  throws('ACQUISITION_RECORD_INVALID', () => parseAcquisitionRecord(mutateCanonical(record, (x) => { delete x.target; })));
  const canonical = record.bytes.toString('utf8'); const duplicate = canonical.replace('"schemaVersion":', `"schemaVersion":"${record.document.schemaVersion}","schemaVersion":`);
  throws('PUBLICATION_NON_CANONICAL', () => parseAcquisitionRecord(Buffer.from(duplicate)));
  throws('PUBLICATION_NON_CANONICAL', () => parseAcquisitionRecord(Buffer.from(` ${canonical}`)));
  throws('PUBLICATION_UTF8_INVALID', () => parseAcquisitionRecord(Buffer.from([0xff, 0x0a, 0x20])));
});

test('index validates AN-3 artifacts and binds every member without a hash cycle', () => {
  const p = publication('supabase'); assert.equal(p.index.document.members.bundle.treeManifestSha256, p.artifact.manifestSha256); assert.equal(p.index.document.members.treeManifest.sha256, p.artifact.manifestSha256);
  assert.equal(p.index.bytes.includes(Buffer.from('publicationIndexSha256')), false); assert.equal(p.index.bytes.includes(Buffer.from('COMMIT')), false);
  assert.equal(p.commit.document.publicationIndexSha256, p.index.sha256); assert.equal(p.commit.bytes.includes(Buffer.from(p.commit.sha256)), false);
  const descriptor = structuredClone(p.artifact.descriptor); descriptor.bundleRoot = '/tmp/evil'; descriptor.bundleRealpath = '/tmp/evil';
  throws('PUBLICATION_INDEX_BINDING_MISMATCH', () => compilePublicationIndex({ provider: 'supabase', manifest: p.artifact.manifest, descriptor, acquisitionRecord: p.acquisition, installPlan: p.plan, canonicalSourceSnapshotSha256: p.source.sha256, sourceRevision: SOURCE_REVISION }));
});

test('index rejects member mutation, unknown/missing fields and invalid source revision', () => {
  const p = publication('vercel');
  throws('PUBLICATION_INDEX_INVALID', () => parsePublicationIndex(mutateCanonical(p.index, (x) => { x.members.descriptor.mode = 0o444; })));
  throws('PUBLICATION_INDEX_INVALID', () => parsePublicationIndex(mutateCanonical(p.index, (x) => { x.members.commit = {}; })));
  throws('PUBLICATION_INDEX_INPUT_INVALID', () => compilePublicationIndex({ provider: 'vercel', manifest: p.artifact.manifest, descriptor: p.artifact.descriptor, acquisitionRecord: p.acquisition, installPlan: p.plan, canonicalSourceSnapshotSha256: p.source.sha256, sourceRevision: 'A'.repeat(40) }));
});

test('commit parser is exact and publication id binds canonical index bytes', () => {
  const p = publication('railway'), id = derivePublicationId(p.index); const changed = structuredClone(p.index.document); changed.sourceRevision = '1'.repeat(40);
  const changedCompilation = compilePublicationIndex({ provider: 'railway', manifest: p.artifact.manifest, descriptor: p.artifact.descriptor, acquisitionRecord: p.acquisition, installPlan: p.plan, canonicalSourceSnapshotSha256: p.source.sha256, sourceRevision: changed.sourceRevision });
  assert.notEqual(derivePublicationId(changedCompilation), id);
  throws('PUBLICATION_COMMIT_INVALID', () => parsePublicationCommit(mutateCanonical(p.commit, (x) => { x.extra = false; })));
});

test('schema module is pure and has only reviewed static imports', async () => {
  const source = await readFile(new URL('./g0-provider-bundle-publication-schema.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/from '([^']+)'/gu)].map((x) => x[1]), ['node:crypto', './g0-provider-bundle-artifact-core.mjs', './g0-provider-tool-bundle.mjs']);
  assert.doesNotMatch(source, /node:(?:fs|net|http|https|dns|tls|child_process)|\bprocess(?:\.env)?\b|\b(?:fetch|spawn|exec|fork)\s*\(|\bimport\s*\(|\brequire\s*\(/u);
});
