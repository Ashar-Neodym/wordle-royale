import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACQUISITION_DECLARATION, validateLockfileV3Object } from './g0-provider-bundle-assembler-core.mjs';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import { createStagingAssemblerForTests } from './g0-provider-bundle-staging-assembler-core.mjs';

const HELPER = new URL('./g0-bundle-copy-helper.py', import.meta.url).pathname;
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const rec = (version, extra = {}) => ({ version, resolved: `https://registry.npmjs.org/x/-/x-${version}.tgz`, integrity: 'sha512-YQ==', ...extra });
const ROOT_PACKAGE = Buffer.from(JSON.stringify({ name: 'wordle-g0-provider-tools', private: true, version: '1.0.0', description: 'fixture', dependencies: ACQUISITION_DECLARATION.dependencies }, null, 2) + '\n');

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'wordle-an2-')); await chmod(base, 0o700);
  const sourceRoot = join(base, 'source'); const outputParent = join(base, 'out');
  await mkdir(sourceRoot, { mode: 0o700 }); await mkdir(outputParent, { mode: 0o700 });
  const packages = {
    '': { name: 'wordle-g0-provider-tools', version: '1.0.0', dependencies: { ...ACQUISITION_DECLARATION.dependencies } },
    'node_modules/@railway/cli': rec('5.30.1'),
    'node_modules/@supabase/cli-linux-x64': rec('2.110.0'),
    'node_modules/supabase': rec('2.110.0', { optionalDependencies: { '@supabase/cli-linux-x64': '2.110.0' } }),
    'node_modules/vercel': rec('58.4.4'),
  };
  const lock = { name: 'wordle-g0-provider-tools', version: '1.0.0', lockfileVersion: 3, requires: true, packages };
  const lockBytes = Buffer.from(`${JSON.stringify(lock)}\n`);
  await writeFile(join(sourceRoot, 'package.json'), ROOT_PACKAGE, { mode: 0o644 });
  await writeFile(join(sourceRoot, 'package-lock.json'), lockBytes, { mode: 0o644 });
  const metadata = [
    ['node_modules/@railway/cli', '@railway/cli', '5.30.1', { 'bin/railway': 'railway-native\n', 'bin/railway.js': 'railway-js\n' }],
    ['node_modules/@supabase/cli-linux-x64', '@supabase/cli-linux-x64', '2.110.0', { 'bin/supabase': 'supabase-native\n' }],
    ['node_modules/supabase', 'supabase', '2.110.0', { 'dist/supabase.js': 'supabase-js\n' }],
    ['node_modules/vercel', 'vercel', '58.4.4', { 'dist/vc.js': 'vercel-js\n' }],
  ];
  for (const [path, name, version, files] of metadata) {
    await mkdir(join(sourceRoot, path), { recursive: true });
    await writeFile(join(sourceRoot, path, 'package.json'), `${JSON.stringify({ name, version })}\n`, { mode: 0o644 });
    for (const [rel, bytes] of Object.entries(files)) { await mkdir(join(sourceRoot, path, rel, '..'), { recursive: true }); await writeFile(join(sourceRoot, path, rel), bytes, { mode: 0o644 }); }
  }
  const helperBytes = await readFile(HELPER);
  const parseLock = (actualLock, actualRoot) => {
    if (!Buffer.from(actualLock).equals(lockBytes)) { const e = new Error('LOCKFILE_HASH_MISMATCH'); e.code = 'LOCKFILE_HASH_MISMATCH'; throw e; }
    if (!Buffer.from(actualRoot).equals(ROOT_PACKAGE)) { const e = new Error('ROOT_PACKAGE_HASH_MISMATCH'); e.code = 'ROOT_PACKAGE_HASH_MISMATCH'; throw e; }
    const parsed = JSON.parse(actualLock); validateLockfileV3Object(parsed); return { lock: parsed };
  };
  const assembler = createStagingAssemblerForTests({ helperSha256: digest(helperBytes), parseLock });
  return { base, sourceRoot, outputParent, lockBytes, assembler };
}
async function mode(path) { return Number((await lstat(path)).mode & 0o7777); }
async function rejectsCode(promise, code) { await assert.rejects(promise, (error) => error?.code === code, `expected ${code}`); }
async function makeFixtureWritable(path) {
  let st; try { st = await lstat(path); } catch { return; }
  if (st.isDirectory()) {
    await chmod(path, 0o700);
    for (const name of await readdir(path)) await makeFixtureWritable(join(path, name));
  } else {
    await chmod(path, 0o600);
  }
}
async function cleanupFixture(path) { await makeFixtureWritable(path); await rm(path, { recursive: true, force: true }); }
async function fakeHelper(base, source) {
  const path = join(base, `helper-${Math.random().toString(16).slice(2)}.py`); await writeFile(path, source); await chmod(path, 0o644);
  return { path, sha256: digest(await readFile(path)) };
}

for (const provider of ['vercel', 'railway', 'supabase']) test(`assembles complete normalized ${provider} fixture closure`, async () => {
  const f = await fixture();
  try {
    const destinationRoot = join(f.outputParent, provider);
    const result = await f.assembler({ provider, sourceRoot: f.sourceRoot, destinationRoot });
    assert.equal(result.status, 'STAGED');
    const profile = generateProviderBundleProfile(provider);
    assert.deepEqual(await readFile(join(destinationRoot, profile.relativePath)), profile.bytes);
    assert.equal(profile.bytes.at(-1), 0x0a); assert.notEqual(profile.bytes.at(-2), 0x0a);
    assert.equal(await mode(join(destinationRoot, 'package-lock.json')), 0o444);
    assert.deepEqual(await readFile(join(destinationRoot, 'package-lock.json')), f.lockBytes);
    if (provider === 'railway') assert.equal(await mode(join(destinationRoot, 'node_modules/@railway/cli/bin/railway')), 0o555);
    if (provider === 'supabase') assert.equal(await mode(join(destinationRoot, 'node_modules/@supabase/cli-linux-x64/bin/supabase')), 0o555);
    assert.equal(await mode(destinationRoot), 0o555);
  } finally { await cleanupFixture(f.base); }
});

test('fails closed on root package/lock drift, malformed package metadata, missing and extraneous physical roots', async () => {
  for (const mutation of ['root', 'lock', 'metadata', 'missing', 'extra']) {
    const f = await fixture();
    try {
      if (mutation === 'root') await writeFile(join(f.sourceRoot, 'package.json'), Buffer.concat([ROOT_PACKAGE, Buffer.from(' ')]));
      if (mutation === 'lock') await writeFile(join(f.sourceRoot, 'package-lock.json'), Buffer.concat([f.lockBytes, Buffer.from(' ')]));
      if (mutation === 'metadata') await writeFile(join(f.sourceRoot, 'node_modules/vercel/package.json'), '{bad\n');
      if (mutation === 'missing') await rm(join(f.sourceRoot, 'node_modules/vercel'), { recursive: true });
      if (mutation === 'extra') { await mkdir(join(f.sourceRoot, 'node_modules/extra')); await writeFile(join(f.sourceRoot, 'node_modules/extra/package.json'), '{"name":"extra","version":"1.0.0"}\n', { mode: 0o644 }); }
      const expected = mutation === 'metadata' ? 'LAYOUT_PACKAGE_JSON_INVALID' : mutation === 'missing' ? 'LAYOUT_MISSING' : mutation === 'extra' ? 'HELPER_FAILED' : mutation === 'root' ? 'ROOT_PACKAGE_HASH_MISMATCH' : 'LOCKFILE_HASH_MISMATCH';
      await rejectsCode(f.assembler({ provider: 'vercel', sourceRoot: f.sourceRoot, destinationRoot: join(f.outputParent, mutation) }), expected);
    } finally { await cleanupFixture(f.base); }
  }
});

test('rejects helper hash and mode drift before execution', async () => {
  const f = await fixture();
  try {
    const badHash = createStagingAssemblerForTests({ helperSha256: `sha256:${'0'.repeat(64)}`, parseLock: f.assembler.parseLock });
    // Recreate only the injected parser because test assemblers expose no ambient production override.
    const parser = (lock) => { const parsed = JSON.parse(lock); validateLockfileV3Object(parsed); return { lock: parsed }; };
    await rejectsCode(createStagingAssemblerForTests({ helperSha256: `sha256:${'0'.repeat(64)}`, parseLock: parser })({ provider: 'vercel', sourceRoot: f.sourceRoot, destinationRoot: join(f.outputParent, 'hash') }), 'TOOLCHAIN_POLICY_MISMATCH');
    await chmod(HELPER, 0o600);
    await rejectsCode(createStagingAssemblerForTests({ helperSha256: digest(await readFile(HELPER)), parseLock: parser })({ provider: 'vercel', sourceRoot: f.sourceRoot, destinationRoot: join(f.outputParent, 'mode') }), 'TOOLCHAIN_POLICY_MISMATCH');
    await chmod(HELPER, 0o644);
    void badHash;
  } finally { await chmod(HELPER, 0o644); await cleanupFixture(f.base); }
});

test('executes only the held verified helper inode and rejects named replacement before spawn', async () => {
  const f = await fixture();
  const original = await fakeHelper(f.base, await readFile(HELPER));
  const saved = `${original.path}.verified`;
  const marker = join(f.base, 'malicious-executed');
  const malicious = await fakeHelper(f.base, `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("bad")\n`);
  try {
    const parser = (lock) => { const parsed = JSON.parse(lock); validateLockfileV3Object(parsed); return { lock: parsed }; };
    const assembler = createStagingAssemblerForTests({
      helperPath: original.path,
      helperSha256: original.sha256,
      parseLock: parser,
      beforeHelperSpawn: async ({ helperPath }) => {
        assert.equal(helperPath, original.path);
        await rename(original.path, saved);
        await rename(malicious.path, original.path);
      },
    });
    await rejectsCode(assembler({ provider: 'vercel', sourceRoot: f.sourceRoot, destinationRoot: join(f.outputParent, 'replace') }), 'SOURCE_CHANGED');
    await assert.rejects(lstat(marker), (error) => error?.code === 'ENOENT');
  } finally { await cleanupFixture(f.base); }
});

test('detects helper content mutation even when bytes are restored before spawn', async () => {
  const f = await fixture();
  const original = await fakeHelper(f.base, await readFile(HELPER));
  const originalBytes = await readFile(original.path);
  try {
    const parser = (lock) => { const parsed = JSON.parse(lock); validateLockfileV3Object(parsed); return { lock: parsed }; };
    const assembler = createStagingAssemblerForTests({
      helperPath: original.path,
      helperSha256: original.sha256,
      parseLock: parser,
      beforeHelperSpawn: async () => {
        await writeFile(original.path, 'raise SystemExit(99)\n');
        await writeFile(original.path, originalBytes);
        await chmod(original.path, 0o644);
      },
    });
    await rejectsCode(assembler({ provider: 'vercel', sourceRoot: f.sourceRoot, destinationRoot: join(f.outputParent, 'restore') }), 'SOURCE_CHANGED');
  } finally { await cleanupFixture(f.base); }
});

test('forced helper stdin EPIPE settles once without uncaught error or hang', async () => {
  const f = await fixture();
  try {
    const parser = (lock) => { const parsed = JSON.parse(lock); validateLockfileV3Object(parsed); return { lock: parsed }; };
    let boundaryCalls = 0;
    const assembler = createStagingAssemblerForTests({
      helperSha256: digest(await readFile(HELPER)),
      parseLock: parser,
      timeoutMs: 2_000,
      testChildBoundary(child) {
        boundaryCalls += 1;
        child.stdin.destroy(Object.assign(new Error('forced EPIPE'), { code: 'EPIPE' }));
      },
    });
    await rejectsCode(assembler({ provider: 'vercel', sourceRoot: f.sourceRoot, destinationRoot: join(f.outputParent, 'epipe') }), 'HELPER_FAILED');
    assert.equal(boundaryCalls, 1);
    assert.equal((await readdir(f.outputParent)).length, 0);
  } finally { await cleanupFixture(f.base); }
});

test('sanitized helper boundary handles timeout, nonzero, and oversized output without ambient canary', async () => {
  for (const kind of ['timeout', 'nonzero', 'oversize']) {
    const f = await fixture();
    try {
      const sources = {
        timeout: '#!/usr/bin/python3\nimport time\ntime.sleep(5)\n',
        nonzero: '#!/usr/bin/python3\nimport sys\nsys.exit(7)\n',
        oversize: '#!/usr/bin/python3\nprint("x"*4096)\n',
      };
      const helper = await fakeHelper(f.base, sources[kind]);
      const parser = (lock) => { const parsed = JSON.parse(lock); validateLockfileV3Object(parsed); return { lock: parsed }; };
      const assembler = createStagingAssemblerForTests({ helperPath: helper.path, helperSha256: helper.sha256, parseLock: parser, timeoutMs: kind === 'timeout' ? 20 : 5_000, maxOutput: kind === 'oversize' ? 64 : 1024 });
      process.env.WORDLE_SECRET_CANARY = 'MUST_NOT_CROSS_BOUNDARY';
      await rejectsCode(assembler({ provider: 'vercel', sourceRoot: f.sourceRoot, destinationRoot: join(f.outputParent, kind) }), kind === 'timeout' ? 'HELPER_TIMEOUT' : kind === 'oversize' ? 'HELPER_OUTPUT_LIMIT' : 'HELPER_FAILED');
      assert.equal((await readdir(f.outputParent)).length, 0);
    } finally { delete process.env.WORDLE_SECRET_CANARY; await cleanupFixture(f.base); }
  }
});

test('assembler sources expose no network, npm, provider execution, HOME, session, or credential capability', async () => {
  const core = await readFile(new URL('./g0-provider-bundle-staging-assembler-core.mjs', import.meta.url), 'utf8');
  const cli = await readFile(new URL('./g0-provider-bundle-staging-assembler.mjs', import.meta.url), 'utf8');
  for (const source of [core, cli]) {
    assert.doesNotMatch(source, /node:(?:net|http|https|dns|tls)|\b(?:fetch|npm|sudo)\b|process\.env|\bHOME\b|credential|session|g0-(?:vercel|railway|supabase)-readonly-adapter/iu);
  }
  assert.match(core, /env: ENVIRONMENT/u);
  assert.match(core, /\/usr\/bin\/python3/u);
  assert.match(core, /\['-I', '-S', '-B', '\/proc\/self\/fd\/3'\]/u);
  assert.match(core, /O_RDONLY \| constants\.O_NOFOLLOW/u);
  assert.match(core, /\['pipe', 'pipe', 'pipe', helperFd\]/u);
  assert.doesNotMatch(core, /childProcess\([^;\n]*deps\.helperPath/u);
  assert.match(core, /helperFd: helper\.handle\.fd/u);
  assert.match(core, /finally \{ await helper\.handle\.close\(\); \}/u);
  assert.match(core, /assembleProviderBundleStaging\(input, PRODUCTION_DEPS\)/u);
  assert.doesNotMatch(core.match(/const PRODUCTION_DEPS[^\n]+/u)?.[0] ?? '', /beforeHelperSpawn|testChildBoundary/u);
});
