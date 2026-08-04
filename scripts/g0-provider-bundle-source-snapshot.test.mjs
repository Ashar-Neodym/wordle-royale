import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, closeSync, constants, openSync, readlinkSync, renameSync, writeSync } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, truncate, utimes, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanCanonicalProviderBundleSourceSnapshot } from './g0-provider-bundle-source-snapshot.mjs';

const COMMITTED_INPUTS = new URL('../tools/g0-provider-acquisition/v1/', import.meta.url).pathname;
const REVIEWED_INVENTORY = '/home/ashar/.hermes/profiles/athena/tools/wordle-g0-provider-tools';
const roots = [];
after(async () => Promise.allSettled(roots.map((root) => rm(root, { recursive: true, force: true }))));
const code = async (wanted, fn) => assert.rejects(fn, (error) => error?.code === wanted, `expected ${wanted}`);
async function exists(path) { try { return await lstat(path); } catch { return null; } }
function inputRoot() {
  return exists(join(COMMITTED_INPUTS, 'package-lock.json')).then((committed) => committed ? COMMITTED_INPUTS : REVIEWED_INVENTORY);
}
function packageName(path) {
  const parts = path.split('/'); const index = parts.lastIndexOf('node_modules'); const tail = parts.slice(index + 1);
  return tail[0].startsWith('@') ? `${tail[0]}/${tail[1]}` : tail[0];
}
async function fixture() {
  const inputs = await inputRoot();
  if (!await exists(join(inputs, 'package-lock.json')) || !await exists(join(inputs, 'package.json'))
    || !await exists(join(REVIEWED_INVENTORY, 'node_modules'))) return null;
  const parent = await mkdtemp(join(tmpdir(), 'g0-source-snapshot-')); roots.push(parent); await chmod(parent, 0o700);
  const sourceRoot = join(parent, 'source'); await mkdir(sourceRoot, { mode: 0o700 });
  await copyFile(join(inputs, 'package.json'), join(sourceRoot, 'package.json'));
  await copyFile(join(inputs, 'package-lock.json'), join(sourceRoot, 'package-lock.json'));
  const lock = JSON.parse(await readFile(join(inputs, 'package-lock.json'), 'utf8'));
  // Until AN-5 lands committed acquisition trees, derive the reviewed physical
  // package inventory from lock metadata rather than depending on local payloads.
  for (const [path, record] of Object.entries(lock.packages).filter(([path]) => path)) {
    if (!(await exists(join(REVIEWED_INVENTORY, path)))?.isDirectory()) continue;
    const destination = join(sourceRoot, path); await mkdir(destination, { recursive: true });
    await writeFile(join(destination, 'package.json'), JSON.stringify({ name: record.name ?? packageName(path), version: record.version }));
  }
  await mkdir(join(sourceRoot, 'node_modules/vercel/dist/deep'), { recursive: true });
  await writeFile(join(sourceRoot, 'node_modules/vercel/dist/deep/payload.js'), 'payload\n');
  await writeFile(join(sourceRoot, 'node_modules/vercel/dist/deep/empty.txt'), '');
  for (const path of ['node_modules/@railway/cli/bin/railway', 'node_modules/@supabase/cli-linux-x64/bin/supabase']) {
    await mkdir(join(sourceRoot, path, '..'), { recursive: true }); await writeFile(join(sourceRoot, path), 'native\n', { mode: 0o700 });
  }
  await mkdir(join(sourceRoot, 'node_modules/.bin'), { recursive: true });
  await symlink('../vercel/package.json', join(sourceRoot, 'node_modules/.bin/ignored-link'));
  return sourceRoot;
}
async function requiredFixture(t) {
  const sourceRoot = await fixture();
  if (!sourceRoot) t.skip('AN-5 committed inputs absent and reviewed local acquisition inputs unavailable');
  return sourceRoot;
}
async function heldDescriptorMutation(target, mutate, timeoutMs = 5_000, additionallyHeld = []) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const held = new Set();
    for (const name of await readdir('/proc/self/fd')) {
      let linked; try { linked = readlinkSync(`/proc/self/fd/${name}`); } catch { continue; }
      held.add(linked);
    }
    if (held.has(target) && additionallyHeld.every((path) => held.has(path))) { mutate(); return; }
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`scanner did not expose the required held descriptors for ${[target, ...additionallyHeld].join(', ')}`);
}
async function replaceAndRestoreWhenHeld(target, additionallyHeld = []) {
  const outside = await mkdtemp(join(tmpdir(), 'g0-race-replacement-')); roots.push(outside);
  const attacker = join(outside, 'attacker'); const detached = join(outside, 'detached'); const attackerAfter = join(outside, 'attacker-after');
  await mkdir(attacker); await writeFile(join(attacker, 'ATTACKER_BYTES'), 'must never be accepted\n');
  return heldDescriptorMutation(target, () => {
    // Synchronous rename sequence prevents the scanner from merely winning a
    // scheduling race; the held inode remains usable and its named parent drifts.
    renameSync(target, detached); renameSync(attacker, target); renameSync(target, attackerAfter); renameSync(detached, target);
  }, 5_000, additionallyHeld);
}

test('scanner accepts the exact API, all-provider installed union, nested/scoped roots, and normalizes modes', async (t) => {
  const sourceRoot = await requiredFixture(t); if (!sourceRoot) return;
  const result = await scanCanonicalProviderBundleSourceSnapshot({ sourceRoot });
  assert.equal(result.status, 'SOURCE_SNAPSHOT_VALID'); assert.match(result.canonicalSourceSnapshotSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.packageCount, result.snapshot.packagePaths.length); assert.equal(result.nodeCount, result.snapshot.entries.length);
  assert(result.snapshot.packagePaths.includes('node_modules/@railway/cli'));
  const byPath = new Map(result.snapshot.entries.map((entry) => [entry.path, entry]));
  assert.equal(byPath.get('node_modules/vercel').mode, 0o555);
  assert.equal(byPath.get('node_modules/vercel/dist/deep/payload.js').mode, 0o444);
  assert.equal(byPath.get('node_modules/vercel/dist/deep/empty.txt').sha256, 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(byPath.get('node_modules/@railway/cli/bin/railway').mode, 0o555);
  assert.equal(byPath.has('node_modules/.bin'), false);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.snapshot), true);
  const bytes = result.snapshotBytes; bytes[0] ^= 0xff; assert.notDeepEqual(bytes, result.snapshotBytes);
  await utimes(join(sourceRoot, 'node_modules/vercel/dist/deep/payload.js'), new Date(1), new Date(1));
  const again = await scanCanonicalProviderBundleSourceSnapshot({ sourceRoot }); assert.equal(again.canonicalSourceSnapshotSha256, result.canonicalSourceSnapshotSha256);
});

test('scanner rejects caller policy and unsafe roots before acquisition', async () => {
  await code('SOURCE_SNAPSHOT_INPUT_INVALID', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot: '/tmp/x', provider: 'vercel' }));
  await code('SOURCE_SNAPSHOT_INPUT_INVALID', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot: 'relative' }));
  const parent = await mkdtemp(join(tmpdir(), 'g0-source-bad-')); roots.push(parent); const sourceRoot = join(parent, 'source'); await mkdir(sourceRoot, { mode: 0o755 });
  await code('SOURCE_ROOT_UNSAFE', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot }));
});

test('symlink, hardlink, missing, extra and package-json drift fixtures fail closed', async (t) => {
  const mutations = [
    ['SOURCE_SYMLINK_FORBIDDEN', async (root) => { await symlink('package.json', join(root, 'node_modules/vercel/evil')); }],
    ['SOURCE_HARDLINK_FORBIDDEN', async (root) => { const fs = await import('node:fs/promises'); await fs.link(join(root, 'node_modules/vercel/package.json'), join(root, 'node_modules/vercel/hard')); }],
    ['LAYOUT_EXTRANEOUS', async (root) => { await mkdir(join(root, 'node_modules/extra')); await writeFile(join(root, 'node_modules/extra/package.json'), '{"name":"extra","version":"1.0.0"}'); }],
    ['LAYOUT_PACKAGE_JSON_MISMATCH', async (root) => { const path = join(root, 'node_modules/vercel/package.json'); const value = JSON.parse(await readFile(path)); value.version = '0.0.0'; await writeFile(path, JSON.stringify(value)); }],
  ];
  for (const [wanted, mutate] of mutations) {
    const sourceRoot = await requiredFixture(t); if (!sourceRoot) return; await mutate(sourceRoot);
    await code(wanted, () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot }));
  }
  const missing = await requiredFixture(t); if (!missing) return; await rm(join(missing, 'node_modules/vercel'), { recursive: true });
  await code('LAYOUT_MISSING', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot: missing }));
});

test('special FIFO is rejected when the platform supports creating one', async (t) => {
  const sourceRoot = await requiredFixture(t); if (!sourceRoot) return;
  const made = spawnSync('/usr/bin/mkfifo', [join(sourceRoot, 'node_modules/vercel/fifo')], { encoding: 'utf8' });
  if (made.error?.code === 'ENOENT') return t.skip('mkfifo unavailable on this platform');
  assert.equal(made.status, 0, made.stderr);
  await code('SOURCE_SPECIAL_FORBIDDEN', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot }));
});

test('case-colliding payload names are rejected', async (t) => {
  const sourceRoot = await requiredFixture(t); if (!sourceRoot) return;
  await mkdir(join(sourceRoot, 'node_modules/vercel/Case')); await mkdir(join(sourceRoot, 'node_modules/vercel/case'));
  await code('SOURCE_CASE_COLLISION', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot }));
});

test('sparse payload is rejected when the fixture filesystem supports holes', async (t) => {
  const sourceRoot = await requiredFixture(t); if (!sourceRoot) return;
  const sparse = join(sourceRoot, 'node_modules/vercel/sparse'); await writeFile(sparse, 'x'); await truncate(sparse, 8 * 1024 * 1024);
  const st = await lstat(sparse, { bigint: true });
  if (st.blocks * 512n >= st.size) return t.skip('fixture filesystem does not support sparse files');
  await code('SOURCE_SPARSE_FORBIDDEN', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot }));
});

test('descriptor-relative scan rejects nested package and payload directory replace/restore races', async (t) => {
  for (const relative of ['node_modules/vercel', 'node_modules/vercel/dist/deep']) {
    const sourceRoot = await requiredFixture(t); if (!sourceRoot) return; const target = join(sourceRoot, relative);
    const mutation = replaceAndRestoreWhenHeld(target);
    await code('SOURCE_CHANGED', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot })); await mutation;
    assert.equal(await readFile(join(target, relative.endsWith('deep') ? 'payload.js' : 'package.json'), 'utf8').then(Boolean), true);
    assert.equal(await exists(join(target, 'ATTACKER_BYTES')), null);
  }
});

test('descriptor-relative scan rejects source root and source parent replace/restore races with fixed codes', async (t) => {
  const root = await requiredFixture(t); if (!root) return;
  const rootMutation = replaceAndRestoreWhenHeld(root, [join(root, 'node_modules/vercel')]);
  await code('SOURCE_ROOT_CHANGED', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot: root })); await rootMutation;

  const sourceRoot = await requiredFixture(t); if (!sourceRoot) return; const parent = dirname(sourceRoot);
  const parentMutation = replaceAndRestoreWhenHeld(parent, [join(sourceRoot, 'node_modules/vercel')]);
  await code('SOURCE_PARENT_CHANGED', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot })); await parentMutation;
});

test('large held-file byte and mode mutation/restoration is rejected and attacker bytes are never accepted', async (t) => {
  const sourceRoot = await requiredFixture(t); if (!sourceRoot) return;
  const target = join(sourceRoot, 'node_modules/vercel/dist/deep/payload.js');
  await writeFile(target, Buffer.alloc(32 * 1024 * 1024, 0x61), { mode: 0o644 });
  const originalPrefix = Buffer.alloc(14, 0x61);
  const mutation = heldDescriptorMutation(target, () => {
    const fd = openSync(target, constants.O_WRONLY | constants.O_NOFOLLOW);
    try { writeSync(fd, Buffer.from('ATTACKER_BYTES!'), 0, 14, 0); writeSync(fd, originalPrefix, 0, originalPrefix.length, 0); } finally { closeSync(fd); }
    chmodSync(target, 0o600); chmodSync(target, 0o644);
  });
  await code('SOURCE_CHANGED', () => scanCanonicalProviderBundleSourceSnapshot({ sourceRoot })); await mutation;
  assert.deepEqual((await readFile(target)).subarray(0, 14), originalPrefix);
});

test('scanner source is read-only, descriptor-relative, and has no production race hook or ambient path', async () => {
  const source = await readFile(new URL('./g0-provider-bundle-source-snapshot.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:net|http|https|dns|tls|child_process)|\b(?:spawn|exec|fork)\s*\(|process\.env|g0-(?:vercel|railway|supabase)-readonly-adapter/u);
  assert.doesNotMatch(source, /\b(?:writeFile|mkdir|rename|unlink|rm|chmod|chown)\b/u);
  assert.match(source, /O_NOFOLLOW/u); assert.match(source, /SOURCE_SPARSE_FORBIDDEN/u); assert.match(source, /no listxattr\/fgetxattr API/u);
  assert.match(source, /\/proc\/self\/fd/u); assert.doesNotMatch(source, /testHook|diagnostics_channel/u);
  assert.doesNotMatch(source, /lstat\(parentPath/u);
});
