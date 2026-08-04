import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, link, lstat, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalPublisherForTests } from './g0-provider-bundle-local-publisher.mjs';
import { cleanupSyntheticFixture, INPUT_REVISION, makeSyntheticDeps } from './g0-provider-bundle-local-publisher-test-support.mjs';

async function fixture(label = 'fault') {
  const root = await mkdtemp(join(tmpdir(), `an4-${label}-`)); await chmod(root, 0o700);
  const sourceRoot = join(root, 'source'); const publicationParent = join(root, 'publications');
  await mkdir(sourceRoot, { mode: 0o700 }); await mkdir(publicationParent, { mode: 0o700 });
  return { root, sourceRoot, publicationParent, input: { provider: 'vercel', sourceRoot, publicationParent, sourceRevision: INPUT_REVISION } };
}
const fault = () => { throw Object.assign(new Error('FAULT_INJECTED'), { code: 'FAULT_INJECTED' }); };

const points = ['afterScratch', 'afterContainer', 'afterBundle', 'afterManifestSidecar', 'afterDescriptorSidecar', 'afterAcquisitionSidecar', 'afterPlanSidecar', 'afterIndex', 'afterCommit', 'prevalidate', 'prepublish', 'postrename', 'postvalidate'];
test('deterministic commit-last fault matrix exposes no accepted partial', async (t) => {
  for (const point of points) await t.test(point, async (st) => {
    const f = await fixture(point); st.after(() => cleanupSyntheticFixture(f.root));
    const deps = await makeSyntheticDeps(); deps.hooks = { [point]: fault };
    await assert.rejects(createLocalPublisherForTests(deps)(f.input), { code: 'FAULT_INJECTED' });
    const names = await readdir(f.publicationParent);
    if (point === 'postrename' || point === 'postvalidate') {
      assert.equal(names.length, 1); const members = await readdir(join(f.publicationParent, names[0]));
      assert.deepEqual(members.sort(), ['COMMIT', 'acquisition-record.json', 'bundle', 'bundle.tree-manifest.json', 'descriptor.json', 'install-plan.json', 'publication-index.json'].sort());
    } else assert.deepEqual(names, []);
  });
});

test('permanent bundle insertion immediately before helper move is never overwritten', async (t) => {
  const f = await fixture('bundle-move-collision'); t.after(() => cleanupSyntheticFixture(f.root));
  const deps = await makeSyntheticDeps(); const base = deps.helperRunner; let insertedPath; let insertedIno;
  deps.helperRunner = async (value) => {
    if (value.frame.action === 'move') {
      insertedPath = join(f.publicationParent, value.frame.scratchName, value.frame.publicationName, 'bundle');
      await mkdir(insertedPath, { mode: 0o700 }); insertedIno = (await lstat(insertedPath, { bigint: true })).ino;
      return base(value);
    }
    if (value.frame.action === 'cleanup') {
      assert.equal((await lstat(insertedPath, { bigint: true })).ino, insertedIno);
      return 'CLEANUP_IDENTITY_LOST';
    }
    return base(value);
  };
  const error = await createLocalPublisherForTests(deps)(f.input).then(() => null, (value) => value);
  assert.equal(error.code, 'PUBLICATION_BUNDLE_COLLISION'); assert.equal(error.cleanupStatus, 'CLEANUP_IDENTITY_LOST');
  assert.equal((await lstat(insertedPath, { bigint: true })).ino, insertedIno);
});

test('container replacement is preserved and cleanup reports identity loss', async (t) => {
  const f = await fixture('container-replace'); t.after(() => cleanupSyntheticFixture(f.root));
  let replacement;
  const deps = await makeSyntheticDeps(); deps.hooks = { afterBundle: async ({ publicationName }) => {
    const scratch = (await readdir(f.publicationParent)).find((name) => name.startsWith('.an4-tmp-'));
    const original = join(f.publicationParent, scratch, publicationName); await rename(original, `${original}.detached`); await mkdir(original, { mode: 0o700 });
    replacement = original;
  } };
  const error = await createLocalPublisherForTests(deps)(f.input).then(() => null, (value) => value);
  assert.equal(error.code, 'PUBLICATION_CONTAINER_CHANGED'); assert.equal(error.cleanupStatus, 'CLEANUP_IDENTITY_LOST');
  assert.equal((await lstat(replacement)).isDirectory(), true);
});

test('sidecar collision via hardlink is never overwritten or cleanup-deleted', async (t) => {
  const f = await fixture('hardlink'); t.after(() => cleanupSyntheticFixture(f.root)); let linked;
  const deps = await makeSyntheticDeps(); deps.hooks = { afterManifestSidecar: async ({ publicationName }) => {
    const scratch = (await readdir(f.publicationParent)).find((name) => name.startsWith('.an4-tmp-')); const container = join(f.publicationParent, scratch, publicationName);
    linked = join(container, 'descriptor.json'); await link(join(container, 'bundle.tree-manifest.json'), linked);
  } };
  await assert.rejects(createLocalPublisherForTests(deps)(f.input), { code: 'EEXIST' });
  assert.equal((await lstat(linked)).nlink, 2);
});

test('parent replacement is detected while attacker replacement survives', async (t) => {
  const f = await fixture('parent-replace'); t.after(() => cleanupSyntheticFixture(f.root)); const moved = `${f.publicationParent}.held`;
  const deps = await makeSyntheticDeps(); deps.hooks = { afterScratch: async () => { await rename(f.publicationParent, moved); await mkdir(f.publicationParent, { mode: 0o700 }); } };
  const error = await createLocalPublisherForTests(deps)(f.input).then(() => null, (value) => value);
  assert.equal(error.code, 'PUBLICATION_PARENT_CHANGED'); assert.equal((await lstat(f.publicationParent)).isDirectory(), true);
});

test('post-rename parent-sync error reports failure but leaves only complete no-overwrite final', async (t) => {
  const f = await fixture('parent-sync'); t.after(() => cleanupSyntheticFixture(f.root));
  const deps = await makeSyntheticDeps(); const base = deps.helperRunner;
  deps.helperRunner = async (value) => { const status = await base(value); if (value.frame.action === 'publish' && status === 'PUBLISHED') throw Object.assign(new Error('PARENT_FSYNC_FAILED'), { code: 'PARENT_FSYNC_FAILED' }); return status; };
  await assert.rejects(createLocalPublisherForTests(deps)(f.input), { code: 'PARENT_FSYNC_FAILED' });
  const names = (await readdir(f.publicationParent)).filter((name) => !name.startsWith('.an4-tmp-')); assert.equal(names.length, 1);
  assert.equal((await readdir(join(f.publicationParent, names[0]))).includes('COMMIT'), true);
});
