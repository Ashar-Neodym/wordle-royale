import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { closeSync, constants, openSync } from 'node:fs';
import {
  chmod, lstat, link, mkdir, mkdtemp, readFile, readdir, rename, symlink, writeFile,
} from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HELPER = new URL('./g0-bundle-publication-helper.py', import.meta.url).pathname;
const SCHEMA = 'wordle-royale-g0-bundle-publication-helper/v1';
const LIMITS = Object.freeze({ maxDepth: 32, maxFrameBytes: 16 * 1024, maxNodes: 1_000 });
const ARTIFACT = 'vercel-58.4.4';
const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
};
const canonical = (value) => `${JSON.stringify(canonicalValue(value))}\n`;
const id = (st) => ({ dev: st.dev.toString(), ino: st.ino.toString() });
const token = () => randomBytes(16).toString('hex');

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'an4b1-'));
  await chmod(base, 0o700);
  const parent = join(base, 'publications');
  await mkdir(parent, { mode: 0o700 });
  return { base, parent, parentId: id(await lstat(parent, { bigint: true })) };
}

async function staged(f, publicationName = `${ARTIFACT}-${token()}`) {
  const scratchName = `.an4-tmp-${token()}`;
  const scratch = join(f.parent, scratchName);
  const container = join(scratch, publicationName);
  await mkdir(scratch, { mode: 0o700 });
  await mkdir(container, { mode: 0o700 });
  await writeFile(join(container, 'payload'), 'immutable bytes\n', { mode: 0o400 });
  return {
    scratchName, scratch, scratchId: id(await lstat(scratch, { bigint: true })),
    publicationName, container, containerId: id(await lstat(container, { bigint: true })),
  };
}

function frame(f, s, action = 'publish') {
  const common = {
    action,
    expectedParentDev: f.parentId.dev,
    expectedParentIno: f.parentId.ino,
    expectedScratchDev: s.scratchId.dev,
    expectedScratchIno: s.scratchId.ino,
    limits: { ...LIMITS },
    schemaVersion: SCHEMA,
    scratchName: s.scratchName,
  };
  return action === 'publish' ? {
    ...common,
    expectedContainerDev: s.containerId.dev,
    expectedContainerIno: s.containerId.ino,
    publicationName: s.publicationName,
  } : common;
}

function invoke(parent, input, extra = {}) {
  const parentFd = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    const result = spawnSync('/usr/bin/python3', [HELPER], {
      input: typeof input === 'string' || Buffer.isBuffer(input) ? input : canonical(input),
      encoding: 'utf8', env: {}, stdio: ['pipe', 'pipe', 'pipe', 'ignore', parentFd], ...extra,
    });
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /^\{[^\n]*\}\n$/);
    return { ...result, body: JSON.parse(result.stdout) };
  } finally {
    closeSync(parentFd);
  }
}

function invokeAsync(parent, input) {
  const parentFd = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY);
  const child = spawn('/usr/bin/python3', [HELPER], {
    env: {}, stdio: ['pipe', 'pipe', 'pipe', 'ignore', parentFd],
  });
  closeSync(parentFd);
  child.stdin.end(typeof input === 'string' ? input : canonical(input));
  const stdout = []; const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  return new Promise((resolve) => child.on('close', (status) => resolve({
    status, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(),
  })));
}

function expectError(result, code) {
  assert.equal(result.status, 1, result.stdout);
  assert.deepEqual(result.body, { error: code });
}

test('move no-replace transfers exact .bundle-work into held container and never replaces bundle', async () => {
  const f = await fixture(); const s = await staged(f);
  const work = join(s.scratch, '.bundle-work'); await mkdir(work, { mode: 0o700 });
  await writeFile(join(work, 'source'), 'source bytes\n', { mode: 0o400 });
  const workId = id(await lstat(work, { bigint: true }));
  const input = {
    action: 'move', expectedContainerDev: s.containerId.dev, expectedContainerIno: s.containerId.ino,
    expectedParentDev: f.parentId.dev, expectedParentIno: f.parentId.ino,
    expectedScratchDev: s.scratchId.dev, expectedScratchIno: s.scratchId.ino,
    expectedSourceDev: workId.dev, expectedSourceIno: workId.ino,
    limits: { ...LIMITS }, publicationName: s.publicationName, schemaVersion: SCHEMA, scratchName: s.scratchName,
  };
  const moved = invoke(f.parent, input); assert.equal(moved.status, 0, moved.stdout); assert.deepEqual(moved.body, { status: 'MOVED' });
  assert.deepEqual(id(await lstat(join(s.container, 'bundle'), { bigint: true })), workId);
  const f2 = await fixture(); const s2 = await staged(f2); const work2 = join(s2.scratch, '.bundle-work');
  await mkdir(work2, { mode: 0o700 }); const work2Id = id(await lstat(work2, { bigint: true }));
  const inserted = join(s2.container, 'bundle'); await mkdir(inserted, { mode: 0o700 }); const insertedId = id(await lstat(inserted, { bigint: true }));
  const collision = invoke(f2.parent, {
    ...input, expectedContainerDev: s2.containerId.dev, expectedContainerIno: s2.containerId.ino,
    expectedParentDev: f2.parentId.dev, expectedParentIno: f2.parentId.ino,
    expectedScratchDev: s2.scratchId.dev, expectedScratchIno: s2.scratchId.ino,
    expectedSourceDev: work2Id.dev, expectedSourceIno: work2Id.ino,
    publicationName: s2.publicationName, scratchName: s2.scratchName,
  });
  assert.equal(collision.status, 2, collision.stdout); assert.deepEqual(collision.body, { status: 'COLLISION' });
  assert.deepEqual(id(await lstat(inserted, { bigint: true })), insertedId);
  assert.deepEqual(id(await lstat(work2, { bigint: true })), work2Id);
});

test('publish uses no-replace and preserves the exact staged container inode', async () => {
  const f = await fixture(); const s = await staged(f);
  const result = invoke(f.parent, frame(f, s));
  assert.equal(result.status, 0, result.stdout);
  assert.deepEqual(result.body, { status: 'PUBLISHED' });
  assert.deepEqual(id(await lstat(join(f.parent, s.publicationName), { bigint: true })), s.containerId);
  assert.equal(await readFile(join(f.parent, s.publicationName, 'payload'), 'utf8'), 'immutable bytes\n');
  await assert.rejects(lstat(s.scratch));
});

test('an existing final is untouched and reported as a collision', async () => {
  const f = await fixture();
  const name = `${ARTIFACT}-${token()}`;
  const final = join(f.parent, name);
  await mkdir(final, { mode: 0o700 });
  await writeFile(join(final, 'sentinel'), 'do not alter\n', { mode: 0o400 });
  const before = await lstat(final, { bigint: true });
  const s = await staged(f, name);
  const result = invoke(f.parent, frame(f, s));
  assert.equal(result.status, 2, result.stdout);
  assert.deepEqual(result.body, { status: 'COLLISION' });
  assert.equal(await readFile(join(final, 'sentinel'), 'utf8'), 'do not alter\n');
  assert.deepEqual(id(await lstat(final, { bigint: true })), id(before));
  assert.deepEqual(id(await lstat(s.scratch, { bigint: true })), s.scratchId);
});

test('two concurrent helpers have exactly one winner and never overwrite', async () => {
  const f = await fixture(); const name = `${ARTIFACT}-${token()}`;
  const first = await staged(f, name); const second = await staged(f, name);
  const results = await Promise.all([
    invokeAsync(f.parent, frame(f, first)), invokeAsync(f.parent, frame(f, second)),
  ]);
  for (const result of results) assert.equal(result.stderr, '');
  assert.deepEqual(results.map((x) => JSON.parse(x.stdout).status).sort(), ['COLLISION', 'PUBLISHED']);
  assert.deepEqual(results.map((x) => x.status).sort(), [0, 2]);
  const winner = id(await lstat(join(f.parent, name), { bigint: true }));
  assert.ok([first.containerId.ino, second.containerId.ino].includes(winner.ino));
});

test('parent, scratch, and container identity replacement fail closed', async () => {
  {
    const f = await fixture(); const s = await staged(f); const input = frame(f, s);
    input.expectedParentIno = (BigInt(input.expectedParentIno) + 1n).toString();
    expectError(invoke(f.parent, input), 'PARENT_IDENTITY_LOST');
  }
  for (const kind of ['scratch', 'container']) {
    const f = await fixture(); const s = await staged(f); const input = frame(f, s);
    const target = kind === 'scratch' ? s.scratch : s.container;
    await rename(target, `${target}.detached`);
    await mkdir(target, { mode: 0o700 });
    expectError(invoke(f.parent, input), kind === 'scratch' ? 'SCRATCH_IDENTITY_LOST' : 'CONTAINER_IDENTITY_LOST');
    assert.ok((await lstat(target)).isDirectory());
  }
});

test('device snapshots are enforced (cross-device publication cannot be accepted)', async () => {
  const f = await fixture(); const s = await staged(f); const input = frame(f, s);
  input.expectedContainerDev = (BigInt(input.expectedContainerDev) + 1n).toString();
  expectError(invoke(f.parent, input), 'CONTAINER_IDENTITY_LOST');
});

test('cleanup removes a normal tree descriptor-relatively', async () => {
  const f = await fixture(); const s = await staged(f);
  await mkdir(join(s.scratch, 'nested/deeper'), { recursive: true, mode: 0o700 });
  await writeFile(join(s.scratch, 'nested/deeper/file'), 'x', { mode: 0o400 });
  const result = invoke(f.parent, frame(f, s, 'cleanup'));
  assert.equal(result.status, 0, result.stdout);
  assert.deepEqual(result.body, { status: 'CLEANED' });
  await assert.rejects(lstat(s.scratch));
});

test('cleanup preserves a replaced scratch and reports identity loss', async () => {
  const f = await fixture(); const s = await staged(f); const input = frame(f, s, 'cleanup');
  await rename(s.scratch, `${s.scratch}.detached`);
  await mkdir(s.scratch, { mode: 0o700 });
  await writeFile(join(s.scratch, 'attacker'), 'preserve me');
  const result = invoke(f.parent, input);
  assert.equal(result.status, 3, result.stdout);
  assert.deepEqual(result.body, { status: 'CLEANUP_IDENTITY_LOST' });
  assert.equal(await readFile(join(s.scratch, 'attacker'), 'utf8'), 'preserve me');
});

test('cleanup preserves symlink, hardlink, and special entries while removing only verified siblings', async (t) => {
  for (const kind of ['symlink', 'hardlink', 'fifo']) {
    const f = await fixture(); const s = await staged(f);
    const hostile = join(s.scratch, `hostile-${kind}`);
    if (kind === 'symlink') await symlink('/dev/null', hostile);
    if (kind === 'hardlink') {
      const outside = join(f.base, 'outside'); await writeFile(outside, 'linked'); await link(outside, hostile);
    }
    if (kind === 'fifo') {
      const made = spawnSync('/usr/bin/mkfifo', [hostile]);
      if (made.status !== 0) { t.diagnostic('mkfifo unavailable'); continue; }
    }
    await writeFile(join(s.scratch, 'ordinary'), 'remove safely');
    const result = invoke(f.parent, frame(f, s, 'cleanup'));
    assert.equal(result.status, 3, result.stdout);
    assert.deepEqual(result.body, { status: 'CLEANUP_IDENTITY_LOST' });
    assert.equal((await lstat(hostile)).isSymbolicLink() || kind !== 'symlink', true);
    await assert.rejects(lstat(join(s.scratch, 'ordinary')));
    assert.ok((await readdir(s.scratch)).includes(`hostile-${kind}`));
  }
});

test('malformed, duplicate-key, noncanonical, unknown-field, and oversized frames fail canonically', async () => {
  const f = await fixture(); const s = await staged(f); const valid = frame(f, s);
  const cases = [
    ['', 'FRAME_INVALID'],
    ['{"action":"publish","action":"cleanup"}\n', 'FRAME_INVALID'],
    [`${JSON.stringify(valid)}\n`, 'FRAME_INVALID'],
    [canonical({ ...valid, surprise: true }), 'INPUT_SCHEMA'],
    [Buffer.alloc(64 * 1024 + 1, 0x20), 'FRAME_INVALID'],
  ];
  for (const [bytes, code] of cases) expectError(invoke(f.parent, bytes), code);
});

test('helper source has a fixed narrow capability surface', async () => {
  const source = await readFile(HELPER, 'utf8');
  assert.doesNotMatch(source, /^\s*(?:import|from)\s+(?:socket|subprocess)\b/m);
  assert.doesNotMatch(source, /\b(?:chown|chmod|sudo|setuid|setgid|system|popen|execv|spawn|fork)\s*\(/i);
  assert.doesNotMatch(source, /os\.rename\s*\(/);
  assert.match(source, /PARENT_FD = 4/);
  assert.match(source, /renameat2/);
  assert.match(source, /RENAME_NOREPLACE/);
  assert.match(source, /dir_fd=/);
});

test('syscall trace shows renameat2 RENAME_NOREPLACE and fsync, with no network or spawned process', async (t) => {
  if (spawnSync('/usr/bin/strace', ['-V']).status !== 0) {
    t.skip('strace unavailable'); return;
  }
  const f = await fixture(); const s = await staged(f); const trace = join(f.base, 'trace');
  const parentFd = openSync(f.parent, constants.O_RDONLY | constants.O_DIRECTORY);
  let result;
  try {
    result = spawnSync('/usr/bin/strace', [
      '-qq', '-o', trace, '-e', 'trace=renameat2,fsync,socket,connect,clone,fork,vfork,execve',
      '/usr/bin/python3', HELPER,
    ], { input: canonical(frame(f, s)), encoding: 'utf8', env: {}, stdio: ['pipe', 'pipe', 'pipe', 'ignore', parentFd] });
  } finally { closeSync(parentFd); }
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, '');
  const calls = await readFile(trace, 'utf8');
  assert.match(calls, /renameat2\([^\n]*RENAME_NOREPLACE\)\s+=\s+0/);
  assert.match(calls, /fsync\(4\)\s+=\s+0/);
  assert.doesNotMatch(calls, /socket\(AF_INET6?\b|connect\([^\n]*sa_family=AF_INET6?\b/);
  assert.doesNotMatch(calls, /\b(?:clone|fork|vfork)\(/);
  // This host's Python loader probes the local nscd AF_UNIX endpoint before
  // user code; that is not a network socket and no successful connection occurs.
  for (const line of calls.split('\n').filter((line) => /\b(?:socket|connect)\(/.test(line))) {
    assert.match(line, /AF_UNIX|ENOENT/, line);
  }
  assert.equal((calls.match(/execve\(/g) ?? []).length, 1, calls);
});
