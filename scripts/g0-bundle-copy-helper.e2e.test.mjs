import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { chmodSync, closeSync, openSync, writeSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HELPER = new URL('./g0-bundle-copy-helper.py', import.meta.url).pathname;
const schemaVersion = 'wordle-g0-bundle-copy/v1';
const limits = Object.freeze({ maxPackages: 32, maxNodes: 200, maxPayloadBytes: 64 * 1024 * 1024, maxFileBytes: 64 * 1024 * 1024, maxPathBytes: 1024, maxComponentBytes: 255, maxFrameBytes: 64 * 1024 });
const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  return value;
};
const canonical = (value) => `${JSON.stringify(canonicalValue(value))}\n`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'wordle-copy-'));
  await chmod(base, 0o700);
  const sourceRoot = join(base, 'source');
  const outputParent = join(base, 'outputs');
  await mkdir(sourceRoot, { recursive: true, mode: 0o700 });
  await mkdir(outputParent, { mode: 0o700 });
  return { base, sourceRoot, outputParent };
}
async function pkg(root, relative, files = { 'package.json': '{}\n' }) {
  const dir = join(root, relative);
  await mkdir(dir, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), bytes);
  }
}
function frame(f, selected, installed = selected, natives = [], overrides = {}) {
  return { schemaVersion, sourceRoot: f.sourceRoot, destinationRoot: join(f.outputParent, overrides.destination ?? 'bundle'), selectedPackagePaths: selected, installedPackagePaths: installed, nativeExecutablePaths: natives, limits: { ...limits, ...(overrides.limits ?? {}) } };
}
function run(input) {
  const result = spawnSync('/usr/bin/python3', [HELPER], { input: typeof input === 'string' ? input : canonical(input), encoding: 'utf8', env: {} });
  assert.equal(result.stderr, '');
  return { ...result, body: JSON.parse(result.stdout) };
}
function rejects(input, wanted) {
  const result = run(input);
  assert.notEqual(result.status, 0, result.stdout);
  assert.deepEqual(result.body, { error: wanted });
  assert.doesNotMatch(result.stdout, /\/tmp\/|source|bundle/);
  return result;
}

test('copies complete hoisted, nested, and scoped payloads with canonical hashes and exact modes', async () => {
  const f = await fixture();
  const paths = ['node_modules/@scope/b', 'node_modules/a', 'node_modules/a/node_modules/c'];
  await pkg(f.sourceRoot, paths[0], { 'package.json': '{"name":"@scope/b"}\n', 'lib/b.js': 'b\n' });
  await pkg(f.sourceRoot, paths[1], { 'package.json': '{"name":"a"}\n', 'bin/tool': '#!/bin/sh\n', 'README': 'read me\n' });
  await pkg(f.sourceRoot, paths[2], { 'package.json': '{"name":"c"}\n', 'index.js': 'c\n' });
  await mkdir(join(f.sourceRoot, 'node_modules/a/node_modules/.bin'), { recursive: true });
  await symlink('../c/index.js', join(f.sourceRoot, 'node_modules/a/node_modules/.bin/c'));
  const native = 'node_modules/a/bin/tool';
  const result = run(frame(f, paths, paths, [native]));
  assert.equal(result.status, 0, result.stdout);
  assert.deepEqual(Object.keys(result.body).sort(), ['entries', 'nodeCount', 'packageCount', 'payloadBytes', 'schemaVersion', 'sourceSnapshotSha256']);
  assert.equal(result.body.packageCount, 3);
  assert.equal(result.body.nodeCount, result.body.entries.length);
  assert.deepEqual(result.body.entries.map((entry) => entry.path), [...result.body.entries.map((entry) => entry.path)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
  assert.equal(result.body.entries.some((entry) => entry.path.includes('/.bin')), false);
  const fileEntry = result.body.entries.find((entry) => entry.path === 'node_modules/a/README');
  assert.equal(fileEntry.sha256, `sha256:${sha256(Buffer.from('read me\n'))}`);
  assert.equal(fileEntry.mode, 0o444);
  assert.equal(result.body.entries.find((entry) => entry.path === native).mode, 0o555);
  assert.equal((await lstat(join(f.outputParent, 'bundle/node_modules/a'))).mode & 0o7777, 0o555);
  assert.equal((await lstat(join(f.outputParent, `bundle/${native}`))).mode & 0o7777, 0o555);
  assert.equal(await readFile(join(f.outputParent, 'bundle/node_modules/a/node_modules/c/index.js'), 'utf8'), 'c\n');
});

test('rejects an installed unselected nested package and an untracked nested package', async () => {
  for (const tracked of [true, false]) {
    const f = await fixture();
    await pkg(f.sourceRoot, 'node_modules/a');
    await pkg(f.sourceRoot, 'node_modules/a/node_modules/c');
    const input = frame(f, ['node_modules/a'], tracked ? ['node_modules/a', 'node_modules/a/node_modules/c'] : ['node_modules/a']);
    rejects(input, tracked ? 'UNSELECTED_NESTED_PACKAGE' : 'UNTRACKED_NESTED_PACKAGE');
  }
});

test('rejects source symlinks, hardlinks, FIFO, sparse files, and xattrs when supported', async (t) => {
  const cases = [];
  {
    const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a');
    await symlink('package.json', join(f.sourceRoot, 'node_modules/a/link'));
    cases.push([f, 'SOURCE_NODE_UNSAFE']);
  }
  {
    const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a', { one: 'same' });
    const linked = spawnSync('ln', [join(f.sourceRoot, 'node_modules/a/one'), join(f.sourceRoot, 'node_modules/a/two')]);
    assert.equal(linked.status, 0); cases.push([f, 'SOURCE_NODE_UNSAFE']);
  }
  {
    const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a');
    const fifo = spawnSync('mkfifo', [join(f.sourceRoot, 'node_modules/a/pipe')]);
    assert.equal(fifo.status, 0); cases.push([f, 'SOURCE_NODE_UNSAFE']);
  }
  {
    const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a');
    const fd = openSync(join(f.sourceRoot, 'node_modules/a/sparse'), 'w'); writeSync(fd, Buffer.from([1]), 0, 1, 1024 * 1024); closeSync(fd);
    cases.push([f, 'SOURCE_SPARSE']);
  }
  for (const [f, code] of cases) rejects(frame(f, ['node_modules/a']), code);

  const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a');
  const x = spawnSync('/usr/bin/python3', ['-c', 'import os,sys; os.setxattr(sys.argv[1], b"user.hostile", b"x")', join(f.sourceRoot, 'node_modules/a/package.json')]);
  if (x.status === 0) rejects(frame(f, ['node_modules/a']), 'SOURCE_XATTR');
  else t.diagnostic('xattrs unsupported on fixture filesystem');
});

test('rejects case collisions, existing destination, bad native paths, malformed frames, and bounds', async () => {
  {
    const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a', { Readme: 'a', README: 'b' });
    rejects(frame(f, ['node_modules/a']), 'CASE_COLLISION');
  }
  {
    const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a'); await mkdir(join(f.outputParent, 'bundle'));
    rejects(frame(f, ['node_modules/a']), 'DESTINATION_COLLISION');
  }
  {
    const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a');
    rejects(frame(f, ['node_modules/a'], ['node_modules/a'], ['node_modules/a/missing']), 'NATIVE_PATH_MISSING');
  }
  {
    const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a', { big: '12345' });
    rejects(frame(f, ['node_modules/a'], ['node_modules/a'], [], { limits: { maxFileBytes: 4 } }), 'FILE_LIMIT');
  }
  {
    const f = await fixture(); await pkg(f.sourceRoot, 'node_modules/a');
    const input = frame(f, ['node_modules/a']); input.extra = true;
    rejects(input, 'INPUT_SCHEMA');
    const noncanonical = `${JSON.stringify(input)}\n`;
    rejects(noncanonical, 'INPUT_SCHEMA');
  }
});

test('rapid byte and mode mutation during a large copy never yields an accepted result', async () => {
  const f = await fixture();
  const relative = 'node_modules/a/large.bin';
  await pkg(f.sourceRoot, 'node_modules/a', { 'large.bin': Buffer.alloc(48 * 1024 * 1024, 0x31) });
  const input = canonical(frame(f, ['node_modules/a']));
  const child = spawn('/usr/bin/python3', [HELPER], { stdio: ['pipe', 'pipe', 'pipe'], env: {} });
  child.stdin.end(input);
  const fd = openSync(join(f.sourceRoot, relative), 'r+');
  let bit = 0;
  const timer = setInterval(() => {
    bit ^= 1;
    writeSync(fd, Buffer.from([0x31 + bit]), 0, 1, 1024 * 1024);
    chmodSync(join(f.sourceRoot, relative), bit ? 0o600 : 0o644);
  }, 1);
  const stdout = []; const stderr = [];
  child.stdout.on('data', (x) => stdout.push(x)); child.stderr.on('data', (x) => stderr.push(x));
  const status = await new Promise((resolve) => child.on('close', resolve));
  clearInterval(timer); closeSync(fd);
  assert.notEqual(status, 0, Buffer.concat(stdout).toString());
  assert.equal(Buffer.concat(stderr).length, 0);
  assert.equal(JSON.parse(Buffer.concat(stdout)).error, 'SOURCE_CHANGED');
});

async function waitForPath(path) {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    try { await lstat(path); return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.fail('timed out waiting for copier progress');
}

async function replacementRace(kind) {
  const f = await fixture();
  await pkg(f.sourceRoot, 'node_modules/a', { 'large.bin': Buffer.alloc(48 * 1024 * 1024, 0x31) });
  const child = spawn('/usr/bin/python3', [HELPER], { stdio: ['pipe', 'pipe', 'pipe'], env: {} });
  child.stdin.end(canonical(frame(f, ['node_modules/a'])));
  await waitForPath(join(f.outputParent, 'bundle'));
  if (kind === 'source-root') {
    await rename(f.sourceRoot, `${f.sourceRoot}.old`);
    await mkdir(f.sourceRoot, { mode: 0o700 });
  } else if (kind === 'package') {
    const path = join(f.sourceRoot, 'node_modules/a');
    await rename(path, `${path}.old`);
    await pkg(f.sourceRoot, 'node_modules/a', { 'package.json': '{}\n' });
  } else {
    await rename(f.outputParent, `${f.outputParent}.old`);
    await mkdir(f.outputParent, { mode: 0o700 });
  }
  const stdout = []; const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk)); child.stderr.on('data', (chunk) => stderr.push(chunk));
  const status = await new Promise((resolve) => child.on('close', resolve));
  assert.notEqual(status, 0, Buffer.concat(stdout).toString());
  assert.equal(Buffer.concat(stderr).length, 0);
  assert.equal(JSON.parse(Buffer.concat(stdout)).error, kind === 'destination-parent' ? 'DESTINATION_CHANGED' : 'SOURCE_CHANGED');
}

test('source root, selected package, and destination parent replacement never yields success', async () => {
  for (const kind of ['source-root', 'package', 'destination-parent']) await replacementRace(kind);
});

test('helper has a static narrow capability surface', async () => {
  const source = await readFile(HELPER, 'utf8');
  assert.doesNotMatch(source, /\b(?:subprocess|socket|http|urllib|requests|sudo|npm|provider|session|credential)\b/i);
  assert.doesNotMatch(source, /\b(?:system|popen|execv|spawn|fork|remove|unlink|rmtree)\s*\(/);
  assert.match(source, /O_NOFOLLOW/);
  assert.match(source, /dir_fd=/);
  assert.match(source, /second = \[\]/);
});
