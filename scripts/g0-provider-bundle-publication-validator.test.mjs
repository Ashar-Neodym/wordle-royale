import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, chmodSync, closeSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import { canonicalProviderToolJson, getProviderToolArtifactPolicy, validateProviderToolDescriptor } from './g0-provider-tool-bundle.mjs';
import { compileAcquisitionRecord, compileInertInstallPlan } from './g0-provider-bundle-publication-schema.mjs';
import { validateProviderBundlePublication } from './g0-provider-bundle-publication-validator.mjs';

const REVISION = '691495cc5d80c62e1fa18842d0ab269aa173294c';
const SNAPSHOT = `sha256:${'a'.repeat(64)}`;
const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const json = (value) => Buffer.from(`${canonicalProviderToolJson(value)}\n`);
const throwsCode = async (code, operation) => assert.rejects(operation, (error) => { assert.equal(error?.code, code); return true; });
const raw = (a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path));

async function put(path, bytes, mode) { await chmod(path, 0o600).catch((error) => { if (error?.code !== 'ENOENT') throw error; }); await writeFile(path, bytes, { mode }); await chmod(path, mode); }
async function fixture({ racePadBytes = 0 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'an4a-validator-')); await chmod(root, 0o700);
  const parent = join(root, 'publications'); await mkdir(parent, { mode: 0o700 });
  const provider = 'vercel'; const policy = getProviderToolArtifactPolicy(provider); const profile = generateProviderBundleProfile(provider);
  const payload = new Map([
    ['package-lock.json', Buffer.from('{}\n')],
    [policy.entrypoint, Buffer.from('synthetic entrypoint\n')],
    [`node_modules/${policy.package}/package.json`, Buffer.from(JSON.stringify({ name: policy.package, version: policy.version }))],
    [profile.relativePath, profile.bytes],
  ]);
  if (racePadBytes) payload.set('race/nested/pad.bin', Buffer.alloc(racePadBytes, 0x61));
  const dirs = new Set(['.']);
  for (const path of payload.keys()) { let current = path; while (current.includes('/')) { current = current.slice(0, current.lastIndexOf('/')); dirs.add(current); } }
  const entries = [...dirs].map((path) => ({ path, type: 'directory', mode: 0o555 }));
  entries.push(...[...payload].map(([path, bytes]) => ({ path, type: 'file', mode: 0o444, sha256: hash(bytes) }))); entries.sort(raw);
  const manifest = { entries, schemaVersion: 'wordle-royale-provider-tool-tree-manifest/v1' }; const manifestBytes = json(manifest); const manifestHash = hash(manifestBytes);
  const packageHash = hash(payload.get(`node_modules/${policy.package}/package.json`));
  const descriptor = {
    schemaVersion: 'wordle-royale-provider-tool/v1', distribution: policy.distribution, package: policy.package, version: policy.version,
    bundleRoot: policy.finalRoot, bundleRealpath: policy.finalRoot, entrypoint: policy.entrypoint, entrypointSha256: policy.entrypointSha256,
    packageJsonSha256: packageHash, lockfileSha256: policy.lockfileSha256, treeManifestSha256: manifestHash,
    runtime: { path: policy.runtime.path, realpath: policy.runtime.path, version: policy.runtime.version, sha256: policy.runtime.sha256 },
    sessionMode: policy.sessionMode, invocationProfile: policy.invocationProfile, invocationProfileSha256: profile.sha256, nativeBinary: null,
  }; validateProviderToolDescriptor(descriptor, provider);
  const descriptorBytes = json(descriptor); const acquisition = compileAcquisitionRecord({ canonicalSourceSnapshotSha256: SNAPSHOT }); const plan = compileInertInstallPlan({ provider });
  const index = {
    artifactId: 'vercel-58.4.4', canonicalSourceSnapshotSha256: SNAPSHOT,
    members: {
      acquisitionRecord: { mode: 0o400, path: 'acquisition-record.json', sha256: acquisition.sha256 },
      bundle: { path: 'bundle', treeManifestSha256: manifestHash },
      descriptor: { mode: 0o400, path: 'descriptor.json', sha256: hash(descriptorBytes) },
      installPlan: { mode: 0o400, path: 'install-plan.json', sha256: plan.sha256 },
      treeManifest: { mode: 0o400, path: 'bundle.tree-manifest.json', sha256: manifestHash },
    }, schemaVersion: 'wordle-royale-g0-local-publication-index/v1', sourceRevision: REVISION,
  };
  const indexBytes = json(index); const name = `vercel-58.4.4-${hash(indexBytes).slice(7, 39)}`; const container = join(parent, name);
  await mkdir(container, { mode: 0o700 }); const bundle = join(container, 'bundle'); await mkdir(bundle, { mode: 0o755 });
  for (const directory of [...dirs].filter((x) => x !== '.').sort((a, b) => a.split('/').length - b.split('/').length)) await mkdir(join(bundle, ...directory.split('/')), { mode: 0o755 });
  for (const [path, bytes] of payload) await put(join(bundle, ...path.split('/')), bytes, 0o444);
  for (const directory of [...dirs].filter((x) => x !== '.').sort((a, b) => b.split('/').length - a.split('/').length)) await chmod(join(bundle, ...directory.split('/')), 0o555);
  await chmod(bundle, 0o555);
  await put(join(container, 'bundle.tree-manifest.json'), manifestBytes, 0o400);
  await put(join(container, 'descriptor.json'), descriptorBytes, 0o400);
  await put(join(container, 'acquisition-record.json'), acquisition.bytes, 0o400);
  await put(join(container, 'install-plan.json'), plan.bytes, 0o400);
  await put(join(container, 'publication-index.json'), indexBytes, 0o400);
  await put(join(container, 'COMMIT'), json({ publicationIndexSha256: hash(indexBytes), schemaVersion: 'wordle-royale-g0-local-publication-commit/v1' }), 0o400);
  return { root, parent, container, bundle, bundleDirectories: [...dirs].filter((x) => x !== '.'), name, index, indexBytes, manifest, descriptor };
}

async function withFixture(run, options) {
  const f = await fixture(options);
  try { await run(f); } finally {
    await chmod(f.bundle, 0o755).catch(() => {});
    for (const directory of f.bundleDirectories) await chmod(join(f.bundle, ...directory.split('/')), 0o755).catch(() => {});
    await chmod(f.container, 0o700).catch(() => {}); await chmod(f.parent, 0o700).catch(() => {});
    await rm(f.root, { recursive: true, force: true });
  }
}

const immediate = () => new Promise((resolvePromise) => setImmediate(resolvePromise));
async function waitForHeldPath(path) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    for (const descriptor of await readdir('/proc/self/fd')) {
      if (await readlink(`/proc/self/fd/${descriptor}`).catch(() => '') === path) return Number(descriptor);
    }
    await immediate();
  }
  assert.fail(`validator never held descriptor for ${path}`);
}
async function raceFixture(orchestrate, expectedCode) {
  await withFixture(async (f) => {
    const validation = validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name });
    const restore = await orchestrate(f);
    try { await throwsCode(expectedCode, () => validation); } finally { restore?.(); }
  }, { racePadBytes: 32 * 1024 * 1024 });
}

test('production validator has exactly the closed two-field input and derives provider only from the name', async () => {
  await withFixture(async (f) => {
    await throwsCode('PUBLICATION_VALIDATOR_INPUT_INVALID', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name, provider: 'vercel' }));
    await throwsCode('PUBLICATION_NAME_INVALID', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: `evil-${'0'.repeat(32)}` }));
    await throwsCode('PUBLICATION_NAME_INVALID', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: `VERCEL-58.4.4-${'0'.repeat(32)}` }));
  });
});

test('unsafe parent and container owner-only modes fail closed', async () => {
  await withFixture(async (f) => { await chmod(f.parent, 0o755); await throwsCode('PUBLICATION_PARENT_UNSAFE', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { await chmod(f.container, 0o755); await throwsCode('PUBLICATION_DIRECTORY_POLICY', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
});

test('exact seven members, types, single links and local modes are enforced', async () => {
  await withFixture(async (f) => { await put(join(f.container, 'extra'), Buffer.from('x'), 0o400); await throwsCode('PUBLICATION_MEMBERS_INVALID', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { await rm(join(f.container, 'COMMIT')); await throwsCode('PUBLICATION_MEMBERS_INVALID', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { await chmod(join(f.container, 'descriptor.json'), 0o444); await throwsCode('PUBLICATION_FILE_POLICY', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { await rm(join(f.container, 'COMMIT')); await symlink('publication-index.json', join(f.container, 'COMMIT')); await throwsCode('PUBLICATION_SYMLINK_FORBIDDEN', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
});

test('synthetic complete descriptor-relative scanner reaches immutable production lock pin', async () => {
  await withFixture(async (f) => {
    await throwsCode('PUBLICATION_LOCKFILE_PIN_MISMATCH', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name }));
    assert.equal((await lstat(f.bundle)).mode & 0o7777, 0o555);
  });
});

test('tree omission, extra node, nested link, mode and hash disagreement fail before authority is trusted', async () => {
  await withFixture(async (f) => { await chmod(join(f.bundle, 'package-lock.json'), 0o400); await throwsCode('PUBLICATION_FILE_POLICY', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { await chmod(f.bundle, 0o755); await put(join(f.bundle, 'extra'), Buffer.from('x'), 0o444); await chmod(f.bundle, 0o555); await throwsCode('PUBLICATION_MANIFEST_TREE_MISMATCH', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { await chmod(f.bundle, 0o755); await symlink('/etc/passwd', join(f.bundle, 'escape')); await chmod(f.bundle, 0o555); await throwsCode('PUBLICATION_SYMLINK_FORBIDDEN', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { await chmod(f.bundle, 0o755); await rm(join(f.bundle, 'package-lock.json')); await chmod(f.bundle, 0o555); await throwsCode('PUBLICATION_MANIFEST_TREE_MISMATCH', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
});

test('closed plan, index, commit, source revision and descriptor final root fail independently', async () => {
  await withFixture(async (f) => { const plan = JSON.parse((await readFile(join(f.container, 'install-plan.json'))).toString()); plan.privilegedExecutionAuthorized = true; await put(join(f.container, 'install-plan.json'), json(plan), 0o400); await throwsCode('PUBLICATION_PLAN_INVALID', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { const index = structuredClone(f.index); index.sourceRevision = 'A'.repeat(40); await put(join(f.container, 'publication-index.json'), json(index), 0o400); await throwsCode('PUBLICATION_INDEX_INVALID', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { await put(join(f.container, 'COMMIT'), json({ publicationIndexSha256: `sha256:${'0'.repeat(64)}`, schemaVersion: 'wrong' }), 0o400); await throwsCode('PUBLICATION_COMMIT_INVALID', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
  await withFixture(async (f) => { const descriptor = structuredClone(f.descriptor); descriptor.bundleRoot = '/tmp/evil'; descriptor.bundleRealpath = '/tmp/evil'; await put(join(f.container, 'descriptor.json'), json(descriptor), 0o400); await throwsCode('PUBLICATION_DESCRIPTOR_ROOT_INVALID', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name })); });
});

test('name is closed before filesystem access and publication index hash selects the deterministic child', async () => {
  await withFixture(async (f) => { const wrong = `${f.name.slice(0, -1)}${f.name.endsWith('0') ? '1' : '0'}`; await throwsCode('PUBLICATION_FILESYSTEM_CHANGED', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: wrong })); });
});

test('descriptor-relative held nested directory rejects a replace-and-restore before its parent postcheck', async () => {
  await raceFixture(async (f) => {
    const nested = join(f.bundle, 'race', 'nested'); const saved = `${nested}.original`; const attacker = Buffer.from('ATTACKER_NESTED_BYTES');
    await waitForHeldPath(nested);
    chmodSync(join(f.bundle, 'race'), 0o755); renameSync(nested, saved); mkdirSync(nested, { mode: 0o755 });
    writeFileSync(join(nested, 'pad.bin'), attacker, { mode: 0o444 });
    rmSync(nested, { recursive: true }); renameSync(saved, nested); chmodSync(join(f.bundle, 'race'), 0o555);
  }, 'PUBLICATION_FILESYSTEM_CHANGED');
});

test('held publication container rejects replacement and restores the original without accepting attacker bytes', async () => {
  await raceFixture(async (f) => {
    const saved = `${f.container}.original`; await waitForHeldPath(f.container);
    renameSync(f.container, saved); mkdirSync(f.container, { mode: 0o700 });
    writeFileSync(join(f.container, 'descriptor.json'), Buffer.from('ATTACKER_CONTAINER_BYTES'), { mode: 0o400 });
    return () => { rmSync(f.container, { recursive: true, force: true }); renameSync(saved, f.container); };
  }, 'PUBLICATION_CONTAINER_CHANGED');
});

test('held publicationParent rejects replacement and restores the original without accepting attacker bytes', async () => {
  await raceFixture(async (f) => {
    const saved = `${f.parent}.original`; await waitForHeldPath(f.parent);
    renameSync(f.parent, saved); mkdirSync(f.parent, { mode: 0o700 });
    writeFileSync(join(f.parent, 'attacker'), Buffer.from('ATTACKER_PARENT_BYTES'), { mode: 0o400 });
    return () => { rmSync(f.parent, { recursive: true, force: true }); renameSync(saved, f.parent); };
  }, 'PUBLICATION_PARENT_CHANGED');
});

test('large held file byte and mode mutation during scan fails with filesystem changed', async () => {
  await raceFixture(async (f) => {
    const pad = join(f.bundle, 'race', 'nested', 'pad.bin'); await waitForHeldPath(pad);
    for (let turn = 0; turn < 8; turn += 1) await immediate();
    chmodSync(pad, 0o644); const descriptor = openSync(pad, 'r+');
    try { writeSync(descriptor, Buffer.from('ATTACKER_FILE_BYTES'), 0, 19, 1024 * 1024); } finally { closeSync(descriptor); }
    chmodSync(pad, 0o444);
  }, 'PUBLICATION_FILESYSTEM_CHANGED');
});

test('owner O_NOATIME replay preserves representable metadata and access time when supported', async (t) => {
  await withFixture(async (f) => {
    const path = join(f.container, 'descriptor.json');
    if (!constants.O_NOATIME) { t.skip('host does not expose O_NOATIME'); return; }
    await utimes(path, new Date(1_000), new Date());
    let probe; try { probe = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NOATIME); } catch (error) {
      if (['EPERM', 'EINVAL', 'EOPNOTSUPP'].includes(error?.code)) { t.skip(`host does not support owner O_NOATIME: ${error.code}`); return; }
      throw error;
    } finally { await probe?.close(); }
    const before = await lstat(path, { bigint: true });
    await throwsCode('PUBLICATION_LOCKFILE_PIN_MISMATCH', () => validateProviderBundlePublication({ publicationParent: f.parent, publicationName: f.name }));
    const after = await lstat(path, { bigint: true });
    const representable = (value) => [value.dev, value.ino, value.mode, value.nlink, value.uid, value.gid, value.size, value.ctimeNs, value.mtimeNs, value.birthtimeNs];
    assert.deepEqual(representable(after), representable(before));
    assert.equal(after.atimeNs, before.atimeNs);
  });
});

test('validator is static read-only local code with no publisher, mutation, process, network, env, dynamic import, hooks, or caller policy', async () => {
  const source = await readFile(new URL('./g0-provider-bundle-publication-validator.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /g0-provider-bundle-local-publisher|node:child_process|node:(?:net|http|https|dns|tls)|\bprocess\.env\b|\b(?:fetch|spawn|exec|fork|rename|unlink|mkdir|writeFile|chmod|chown|rm)\s*\(|\bimport\s*\(|\brequire\s*\(/u);
  assert.doesNotMatch(source, /betweenSnapshots|assemblyResult|expectedHash|callerPolicy|ownerUid|provider\s*:\s*input/u);
  assert.deepEqual([...source.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)/gmu)].map((x) => x[1]), ['validateProviderBundlePublication']);
});
