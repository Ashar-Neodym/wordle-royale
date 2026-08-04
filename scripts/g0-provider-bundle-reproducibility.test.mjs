import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { commitReceiptNoReplaceForTests, createProviderBundleReproducibilityForTests, REPRODUCIBILITY_RECEIPT_SCHEMA } from './g0-provider-bundle-reproducibility.mjs';

const REVISION = 'a'.repeat(40);
const H = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const CONTRACT = Object.freeze({
  canonicalSourceSnapshotSha256: H('snapshot'),
  packageJsonSha256: 'sha256:58fffb1ef8b6b6ff51cba0d9f752ea29dac6830cfaed4c763c7a3bd0f2d9dcde',
  packageLockSha256: 'sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90',
  toolchain: {
    node: { path: '/home/ashar/.nvm/versions/node/v26.3.0/bin/node', realpath: '/home/ashar/.nvm/versions/node/v26.3.0/bin/node', sha256: 'sha256:5325ac9da58541494afcc136f0880279a2a853609bf4dae7755e04fb682b6926', version: 'v26.3.0' },
    npm: { path: '/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js', realpath: '/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js', sha256: 'sha256:8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7', version: '11.16.0' },
    tracer: { path: '/usr/bin/strace', realpath: '/usr/bin/strace', sha256: 'sha256:28f957c227012de0b18d1bd7fff2d396cb693ea60ed8013be68de071e84b5001', version: 'strace -- version 6.8' },
  },
});
const NETWORK = Object.freeze({ allowedObservedHttpOrigin: 'https://registry.npmjs.org/', dnsRequestCount: 2, httpRequestCount: 3, networkSyscallCount: 12, tlsConnectionCount: 4 });
const MEMBERS = Object.freeze({
  COMMIT: H('commit'), 'acquisition-record.json': H('acq'), 'bundle.tree-manifest.json': H('manifest'),
  'descriptor.json': H('descriptor'), 'install-plan.json': H('plan'), 'publication-index.json': H('index'),
});

async function setup() {
  const base = await mkdtemp(join(tmpdir(), 'an5b-test-')); await chmod(base, 0o700);
  const workspaceRoot = join(base, 'workspace'); const publicationRootA = join(base, 'pub-a'); const publicationRootB = join(base, 'pub-b'); const receipts = join(base, 'receipts');
  for (const path of [workspaceRoot, publicationRootA, publicationRootB, receipts]) await mkdir(path, { mode: 0o700 });
  const makeAcquisition = async (label) => {
    const root = join(workspaceRoot, `acquisition-${label}`); const source = join(root, 'source'); const cache = join(root, 'cache');
    await mkdir(source, { recursive: true, mode: 0o700 }); await mkdir(cache, { mode: 0o700 }); await mkdir(join(source, 'node_modules/pkg'), { recursive: true, mode: 0o700 });
    await writeFile(join(source, 'package.json'), '{}\n'); await writeFile(join(source, 'package-lock.json'), '{}\n'); await writeFile(join(source, 'node_modules/pkg/index.js'), 'module.exports=1\n');
    await mkdir(join(source, 'node_modules/.bin'), { mode: 0o755 }); await symlink('../pkg/index.js', join(source, 'node_modules/.bin/pkg'));
  };
  await makeAcquisition('A'); await makeAcquisition('B');
  return { base, input: { workspaceRoot, publicationRootA, publicationRootB, receiptPath: join(receipts, 'receipt.json'), sourceRevision: REVISION } };
}
function acquisition(input, mutate = {}) {
  return async ({ workspaceRoot, label }) => ({
    status: 'FRESH_ACQUISITION_VALID', label, sourceRoot: join(workspaceRoot, `acquisition-${label}/source`),
    ...CONTRACT, networkSummary: NETWORK, lifecycleScriptsExecuted: false, credentialsForwarded: false, providerExecuted: false,
    ...(mutate[label] ?? {}),
  });
}
function report(provider, sourceRevision = REVISION, changes = {}) {
  const artifactId = `${provider}-${provider === 'vercel' ? '58.4.4' : provider === 'railway' ? '5.30.1' : '2.110.0'}`;
  return {
    status: 'PUBLICATION_VALID', publicationValid: true, provider, artifactId, publicationId: `${artifactId}-${H(provider).slice(7, 39)}`,
    memberHashes: { ...MEMBERS }, treeSha256: H(`${provider}-tree`), canonicalSourceSnapshotSha256: CONTRACT.canonicalSourceSnapshotSha256,
    sourceRevision, counts: { packageCount: 10, nodeCount: 30, payloadBytes: 500 }, ...changes,
  };
}
function dependencies({ reportMutation, acquisitionMutation, delay = false } = {}) {
  const reports = new Map();
  return {
    acquisitionRunner: async (args) => { if (delay) await new Promise((done) => setTimeout(done, args.label === 'A' ? 15 : 1)); return acquisition(args, acquisitionMutation)(args); },
    publisher: async ({ provider, publicationParent, sourceRevision }) => {
      const label = publicationParent.endsWith('pub-a') ? 'A' : 'B';
      const r = report(provider, sourceRevision, reportMutation?.({ provider, label, boundary: 'publisher' }) ?? {});
      reports.set(`${publicationParent}\0${r.publicationId}`, r);
      return { status: 'PUBLISHED', provider, artifactId: r.artifactId, publicationName: r.publicationId, report: r };
    },
    validator: async ({ publicationParent, publicationName }) => {
      const original = reports.get(`${publicationParent}\0${publicationName}`); const label = publicationParent.endsWith('pub-a') ? 'A' : 'B';
      return { ...original, ...(reportMutation?.({ provider: original.provider, label, boundary: 'validator' }) ?? {}) };
    },
    standaloneScanner: async ({ publicationParent, publicationName }) => {
      const original = reports.get(`${publicationParent}\0${publicationName}`); const label = publicationParent.endsWith('pub-a') ? 'A' : 'B';
      const standalone = { ...original, ...(reportMutation?.({ provider: original.provider, label, boundary: 'standalone' }) ?? {}) };
      const providerNumber = ['vercel', 'railway', 'supabase'].indexOf(original.provider) + 1; const labelNumber = label === 'A' ? 1 : 2;
      return { report: standalone, contentReport: { counts: standalone.counts, memberHashes: standalone.memberHashes, tree: [{ mode: 0o555, path: '.', type: 'directory' }] }, regularFileIdentities: [`${providerNumber}:${labelNumber}`] };
    },
    commitReceiptNoReplace: commitReceiptNoReplaceForTests,
  };
}
async function runFixture(options = {}) {
  const fixture = await setup(); const run = createProviderBundleReproducibilityForTests({ ...dependencies(options), ...(options.hooks ? { hooks: options.hooks } : {}) });
  return { ...fixture, run };
}

for (const delayed of [false, true]) test(`success is canonical and deterministic${delayed ? ' with reversed completion timing' : ''}`, async (t) => {
  const { base, input, run } = await runFixture({ delay: delayed }); t.after(() => rm(base, { recursive: true, force: true }));
  const result = await run(input); assert.equal(result.status, 'REPRODUCED'); assert.ok(Object.isFrozen(result)); assert.deepEqual(result.providers.map((x) => x.provider), ['vercel', 'railway', 'supabase']);
  const bytes = await readFile(input.receiptPath); assert.equal(bytes.at(-1), 10); const receipt = JSON.parse(bytes);
  assert.equal(receipt.schemaVersion, REPRODUCIBILITY_RECEIPT_SCHEMA); assert.equal(receipt.independentScannerCount, 3); assert.equal(receipt.acquisitionCount, 2); assert.equal(receipt.providerBundleCount, 3);
  assert.equal(receipt.hostedMutationAuthorized, false); assert.equal(receipt.privilegedInstallationAuthorized, false); assert.equal(receipt.providerExecutionAuthorized, false); assert.equal(receipt.rootInstallationPerformed, false);
  for (const path of Object.values(input).filter((x) => x.startsWith('/'))) assert.equal(bytes.includes(Buffer.from(path)), false);
  const before = await stat(input.receiptPath, { bigint: true }); const replay = await run(input); const after = await stat(input.receiptPath, { bigint: true });
  assert.equal(replay.status, 'ALREADY_REPRODUCED_IDENTICAL'); assert.equal(`${before.mode}:${before.nlink}:${before.atimeNs}:${before.mtimeNs}:${before.ctimeNs}`, `${after.mode}:${after.nlink}:${after.atimeNs}:${after.mtimeNs}:${after.ctimeNs}`);
  assert.equal(Number(after.mode & 0o7777n), 0o600); assert.equal(after.nlink, 1n);
});

test('rejects acquisition source snapshot, package, lock, and tool mismatches', async (t) => {
  for (const [mutation, code] of [
    [{ B: { canonicalSourceSnapshotSha256: H('other') } }, 'ACQUISITION_CONTRACT_MISMATCH'],
    [{ B: { packageJsonSha256: H('other') } }, 'ACQUISITION_PIN_MISMATCH'],
    [{ B: { packageLockSha256: H('other') } }, 'ACQUISITION_PIN_MISMATCH'],
    [{ B: { toolchain: { ...CONTRACT.toolchain, npm: { ...CONTRACT.toolchain.npm, sha256: H('other') } } } }, 'ACQUISITION_PIN_MISMATCH'],
  ]) {
    const { base, input } = await setup(); t.after(() => rm(base, { recursive: true, force: true }));
    const run = createProviderBundleReproducibilityForTests(dependencies({ acquisitionMutation: mutation }));
    await assert.rejects(run(input), { code });
  }
});

test('rejects aliased source regular-file inodes', async (t) => {
  const { base, input } = await setup(); t.after(() => rm(base, { recursive: true, force: true }));
  const target = join(input.workspaceRoot, 'acquisition-B/source/node_modules/pkg/index.js'); await rm(target); await link(join(input.workspaceRoot, 'acquisition-A/source/node_modules/pkg/index.js'), target);
  const run = createProviderBundleReproducibilityForTests(dependencies()); await assert.rejects(run(input), { code: 'ACQUISITION_HARDLINK_FORBIDDEN' });
});

test('accepts only safe derived node_modules/.bin links and rejects every other source symlink', async (t) => {
  {
    const { base, input } = await setup(); t.after(() => rm(base, { recursive: true, force: true }));
    const bad = join(input.workspaceRoot, 'acquisition-A/source/node_modules/.bin/pkg'); await unlink(bad); await symlink('../../../etc/passwd', bad);
    await assert.rejects(createProviderBundleReproducibilityForTests(dependencies())(input), { code: 'ACQUISITION_BIN_TARGET_INVALID' });
  }
  {
    const { base, input } = await setup(); t.after(() => rm(base, { recursive: true, force: true }));
    await symlink('node_modules/pkg/index.js', join(input.workspaceRoot, 'acquisition-A/source/escape'));
    await assert.rejects(createProviderBundleReproducibilityForTests(dependencies())(input), { code: 'ACQUISITION_SOURCE_SYMLINK_FORBIDDEN' });
  }
});

test('rejects publisher versus independent-validator disagreement', async (t) => {
  const { base, input } = await setup(); t.after(() => rm(base, { recursive: true, force: true }));
  const deps = dependencies(); const validator = deps.validator; deps.validator = async (args) => ({ ...(await validator(args)), treeSha256: H('scanner-other') });
  await assert.rejects(createProviderBundleReproducibilityForTests(deps)(input), { code: 'PUBLISHER_SCANNER_MISMATCH' });
});

for (const [field, value] of [
  ['treeSha256', H('other-tree')], ['memberHashes', { ...MEMBERS, COMMIT: H('other') }], ['counts', { packageCount: 10, nodeCount: 31, payloadBytes: 500 }],
  ['publicationId', 'vercel-58.4.4-' + 'f'.repeat(32)], ['canonicalSourceSnapshotSha256', H('other-snapshot')], ['sourceRevision', 'b'.repeat(40)],
]) test(`rejects provider A/B ${field} mismatch`, async (t) => {
  const { base, input } = await setup(); t.after(() => rm(base, { recursive: true, force: true }));
  const mutate = ({ provider, label }) => provider === 'vercel' && label === 'B' ? { [field]: value } : {};
  await assert.rejects(createProviderBundleReproducibilityForTests(dependencies({ reportMutation: mutate }))(input));
});

test('receipt no-overwrite rejects valid different and invalid existing bytes', async (t) => {
  const { base, input } = await setup(); t.after(() => rm(base, { recursive: true, force: true })); const deps = dependencies(); const run = createProviderBundleReproducibilityForTests(deps);
  await run(input); const changed = { ...input, sourceRevision: 'b'.repeat(40) };
  await assert.rejects(run(changed), { code: 'RECEIPT_COLLISION_DIFFERENT' });
  await rm(input.receiptPath); await writeFile(input.receiptPath, '{}\n', { mode: 0o600 });
  await assert.rejects(run(input), { code: 'RECEIPT_COLLISION_INVALID' });
});

test('link and fsync faults fail closed and preserve a complete linked receipt', async (t) => {
  for (const [point, code] of [['beforeLink', 'RECEIPT_LINK_FAILED'], ['afterLink', 'FAULT_AFTER_LINK'], ['beforeParentFsync', 'RECEIPT_PARENT_FSYNC_FAILED']]) {
    const { base, input } = await setup(); t.after(() => rm(base, { recursive: true, force: true }));
    const hooks = { [point]: () => { const e = new Error(code); e.code = code; throw e; } };
    const run = createProviderBundleReproducibilityForTests({ ...dependencies(), hooks }); await assert.rejects(run(input), { code });
    const exists = await lstat(input.receiptPath).then(() => true, () => false); assert.equal(exists, point !== 'beforeLink');
  }
});

test('receipt parent replacement is detected and replacement preserved', async (t) => {
  const { base, input } = await setup(); t.after(() => rm(base, { recursive: true, force: true })); const parent = join(base, 'receipts'); const moved = join(base, 'held-receipts');
  const hooks = { beforeLink: async () => { await rename(parent, moved); await mkdir(parent, { mode: 0o700 }); } };
  const run = createProviderBundleReproducibilityForTests({ ...dependencies(), hooks }); await assert.rejects(run(input), { code: 'RECEIPT_PARENT_CHANGED' });
  assert.equal((await stat(parent)).isDirectory(), true);
});
