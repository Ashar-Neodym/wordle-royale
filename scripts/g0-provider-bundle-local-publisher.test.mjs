import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalPublisherForTests } from './g0-provider-bundle-local-publisher.mjs';
import { cleanupSyntheticFixture, INPUT_REVISION, makeSyntheticDeps } from './g0-provider-bundle-local-publisher-test-support.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'an4-publisher-')); await (await import('node:fs/promises')).chmod(root, 0o700);
  const sourceRoot = join(root, 'source'); const publicationParent = join(root, 'publications');
  await mkdir(sourceRoot, { mode: 0o700 }); await mkdir(publicationParent, { mode: 0o700 });
  return { root, sourceRoot, publicationParent, input: { provider: 'vercel', sourceRoot, publicationParent, sourceRevision: INPUT_REVISION } };
}

test('publishes a complete commit-last publication and identical replay is read-only', async (t) => {
  const f = await fixture(); t.after(() => cleanupSyntheticFixture(f.root));
  const observations = [];
  const deps = await makeSyntheticDeps(); deps.hooks = async ({ point, publicationName }) => {
    if (point === 'afterIndex' || point === 'afterCommit') observations.push([point, await readdir(join(f.publicationParent, (await readdir(f.publicationParent))[0], publicationName))]);
  };
  const publisher = createLocalPublisherForTests(deps);
  const first = await publisher(f.input);
  assert.equal(first.status, 'PUBLISHED'); assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.report));
  assert.equal(observations[0][0], 'afterIndex'); assert.equal(observations[0][1].includes('publication-index.json'), true); assert.equal(observations[0][1].includes('COMMIT'), false);
  assert.equal(observations[1][0], 'afterCommit'); assert.equal(observations[1][1].includes('COMMIT'), true);
  const finalPath = join(f.publicationParent, first.publicationName); const before = await stat(finalPath, { bigint: true });
  const commitBefore = await readFile(join(finalPath, 'COMMIT'));
  const second = await publisher(f.input); const after = await stat(finalPath, { bigint: true });
  assert.equal(second.status, 'ALREADY_PUBLISHED_IDENTICAL'); assert.deepEqual(commitBefore, await readFile(join(finalPath, 'COMMIT')));
  assert.equal(before.ino, after.ino); assert.equal(before.mtimeNs, after.mtimeNs); assert.equal(before.ctimeNs, after.ctimeNs);
  assert.deepEqual((await readdir(f.publicationParent)).sort(), [first.publicationName]);
});

test('valid different and invalid collisions fail without overwriting the final', async (t) => {
  const f = await fixture(); t.after(() => cleanupSyntheticFixture(f.root));
  const first = await createLocalPublisherForTests(await makeSyntheticDeps())(f.input);
  const finalPath = join(f.publicationParent, first.publicationName); const before = await readFile(join(finalPath, 'COMMIT'));
  const different = await makeSyntheticDeps({ publicationParent: f.publicationParent, differentFinal: true });
  await assert.rejects(createLocalPublisherForTests(different)(f.input), { code: 'PUBLICATION_COLLISION_DIFFERENT' });
  assert.deepEqual(await readFile(join(finalPath, 'COMMIT')), before);
  const invalid = await makeSyntheticDeps({ publicationParent: f.publicationParent, invalidFinal: true });
  await assert.rejects(createLocalPublisherForTests(invalid)(f.input), { code: 'PUBLICATION_COLLISION_INVALID' });
  assert.deepEqual(await readFile(join(finalPath, 'COMMIT')), before);
  assert.deepEqual((await readdir(f.publicationParent)).sort(), [first.publicationName]);
});

test('closed production input and owner-only absolute parent policy', async (t) => {
  const f = await fixture(); t.after(() => cleanupSyntheticFixture(f.root)); const publisher = createLocalPublisherForTests(await makeSyntheticDeps());
  await assert.rejects(publisher({ ...f.input, hook: true }), { code: 'PUBLISHER_INPUT_INVALID' });
  await (await import('node:fs/promises')).chmod(f.publicationParent, 0o755);
  await assert.rejects(publisher(f.input), { code: 'PUBLICATION_PARENT_UNSAFE' });
});
