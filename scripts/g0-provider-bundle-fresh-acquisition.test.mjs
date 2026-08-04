import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, rm, lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createFreshAcquisitionRunnerForTest, parseFreshAcquisitionEvidence,
  runFreshProviderBundleAcquisition,
} from './g0-provider-bundle-fresh-acquisition.mjs';

const VALID_TRACE = 'execve("/proc/self/fd/4", ["/proc/self/fd/4", "/proc/self/fd/5", "ci", "--ignore-scripts"], 0x1234 /* 16 vars */) = 0\nsocket(AF_INET, SOCK_DGRAM|SOCK_CLOEXEC|SOCK_NONBLOCK, IPPROTO_IP) = 6\nsendto(6, "dns", 3, MSG_NOSIGNAL, {sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("127.0.0.53")}, 16) = 3\nsocket(AF_INET, SOCK_STREAM|SOCK_CLOEXEC|SOCK_NONBLOCK, IPPROTO_IP) = 7\nconnect(7, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("104.16.24.34")}, 16) = -1 EINPROGRESS\n+++ exited with 0 +++\n';
const VALID_HTTP = 'npm http fetch GET 200 https://registry.npmjs.org/vercel 42ms (cache miss)\n';
const SNAPSHOT = Object.freeze({ canonicalSourceSnapshotSha256: `sha256:${'a'.repeat(64)}` });

async function workspace() {
  const path = await mkdtemp(join(tmpdir(), 'an5a-test-'));
  await chmod(path, 0o700);
  return path;
}
function evidence() { return { npmStderr: VALID_HTTP, traceFiles: [VALID_TRACE] }; }
function fakeScanner() { return SNAPSHOT; }
const parse = (value) => parseFreshAcquisitionEvidence({ ...value, resolverAddresses: ['127.0.0.53'] });

async function withWorkspace(fn) {
  const path = await workspace();
  try { return await fn(path); } finally { await rm(path, { recursive: true, force: true }); }
}

test('closed production API rejects extra keys, labels, and relative workspaces', async () => {
  await assert.rejects(runFreshProviderBundleAcquisition({ workspaceRoot: '.', label: 'A' }), { code: 'FRESH_ACQUISITION_INPUT_INVALID' });
  await assert.rejects(runFreshProviderBundleAcquisition({ workspaceRoot: '/tmp', label: 'a' }), { code: 'FRESH_ACQUISITION_INPUT_INVALID' });
  await assert.rejects(runFreshProviderBundleAcquisition({ workspaceRoot: '/tmp', label: 'A', extra: true }), { code: 'FRESH_ACQUISITION_INPUT_INVALID' });
});

test('fixed executor receives closed environment, exact argv, cwd, and held fd binding', async () => withWorkspace(async (path) => {
  let observed;
  const run = createFreshAcquisitionRunnerForTest(async (spec) => { observed = spec; return evidence(); }, fakeScanner);
  const result = await run({ workspaceRoot: path, label: 'A' });
  assert.equal(result.status, 'FRESH_ACQUISITION_VALID');
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(observed.args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/', `--userconfig=${join(path, 'acquisition-A/config/user.npmrc')}`, `--cache=${join(path, 'acquisition-A/cache')}`]);
  assert.equal(observed.cwd, join(path, 'acquisition-A/source'));
  assert.equal(Number.isInteger(observed.nodeFd) && observed.nodeFd > 2, true);
  assert.equal(Number.isInteger(observed.npmFd) && observed.npmFd > 2, true);
  assert.notEqual(observed.nodeFd, observed.npmFd);
  assert.deepEqual(Object.keys(observed.env).sort(), ['HOME', 'LANG', 'LC_ALL', 'PATH', 'TZ', 'npm_config_arch', 'npm_config_audit', 'npm_config_cache', 'npm_config_fund', 'npm_config_globalconfig', 'npm_config_ignore_scripts', 'npm_config_libc', 'npm_config_loglevel', 'npm_config_platform', 'npm_config_prefix', 'npm_config_progress', 'npm_config_registry', 'npm_config_update_notifier', 'npm_config_userconfig'].sort());
  assert.equal(Object.keys(observed.env).some((key) => /proxy|auth|token|credential|session/iu.test(key)), false);
  assert.equal(observed.env.PATH, '/usr/bin:/bin');
  assert.equal(await readFile(join(path, 'acquisition-A/config/user.npmrc'), 'utf8'), 'registry=https://registry.npmjs.org/\nalways-auth=false\nignore-scripts=true\naudit=false\nfund=false\nstrict-ssl=true\n');
  assert.equal((await lstat(join(path, 'acquisition-A/config/user.npmrc'))).mode & 0o777, 0o600);
  assert.equal((await lstat(join(path, 'acquisition-A/source/package.json'))).mode & 0o777, 0o644);
  assert.equal('traceFiles' in result || 'npmStderr' in result, false);
}));

test('A and B create separate homes/caches/sources and package inodes', async () => withWorkspace(async (path) => {
  const specs = [];
  const run = createFreshAcquisitionRunnerForTest(async (spec) => { specs.push(spec); return evidence(); }, fakeScanner);
  const [a, b] = await Promise.all([run({ workspaceRoot: path, label: 'A' }), run({ workspaceRoot: path, label: 'B' })]);
  assert.notEqual(a.sourceRoot, b.sourceRoot);
  assert.notEqual(specs[0].env.HOME, specs[1].env.HOME);
  assert.notEqual(specs[0].env.npm_config_cache, specs[1].env.npm_config_cache);
  const ai = await lstat(join(a.sourceRoot, 'package-lock.json'));
  const bi = await lstat(join(b.sourceRoot, 'package-lock.json'));
  assert.notDeepEqual([ai.dev, ai.ino], [bi.dev, bi.ino]);
  for (const label of ['A', 'B']) for (const name of ['', 'source', 'home', 'cache', 'config', 'trace']) {
    assert.equal((await lstat(join(path, `acquisition-${label}`, name))).mode & 0o777, 0o700);
  }
}));

test('exclusive acquisition child refuses reuse and preserves existing identity', async () => withWorkspace(async (path) => {
  const run = createFreshAcquisitionRunnerForTest(async () => evidence(), fakeScanner);
  await run({ workspaceRoot: path, label: 'A' });
  const before = await lstat(join(path, 'acquisition-A'));
  await assert.rejects(run({ workspaceRoot: path, label: 'A' }));
  const after = await lstat(join(path, 'acquisition-A'));
  assert.deepEqual([after.dev, after.ino], [before.dev, before.ino]);
}));

test('lossless parser allows repeated syscalls but rejects malformed, credential, and forbidden-origin HTTP logs', () => {
  const repeatedNetworkTrace = VALID_TRACE.replace(/^execve[^\n]*\n/u, '');
  assert.equal(parse({ traceFiles: [VALID_TRACE, repeatedNetworkTrace], npmStderr: VALID_HTTP }).tlsConnectionCount, 2);
  assert.throws(() => parse({ traceFiles: [VALID_TRACE], npmStderr: 'npm http nonsense\n' }), { code: 'NPM_HTTP_LOG_INVALID' });
  assert.equal(parse({ traceFiles: [VALID_TRACE], npmStderr: `${VALID_HTTP}${VALID_HTTP}` }).httpRequestCount, 2);
  assert.throws(() => parse({ traceFiles: [VALID_TRACE], npmStderr: 'npm http fetch GET 200 https://user:pass@registry.npmjs.org/x 1ms\n' }), { code: 'NETWORK_ORIGIN_FORBIDDEN' });
  assert.throws(() => parse({ traceFiles: [VALID_TRACE], npmStderr: 'npm http fetch GET 200 https://evil.example/x 1ms\n' }), { code: 'NETWORK_ORIGIN_FORBIDDEN' });
});

test('process/network parser rejects child exec, non-thread clone, trace loss, odd ports, and AF_UNIX', () => {
  const replace = (from, to) => ({ traceFiles: [VALID_TRACE.replace(from, to)], npmStderr: VALID_HTTP });
  assert.throws(() => parse(replace('+++ exited', 'execve("/bin/sh", ["sh"], 0) = 0\n+++ exited')), { code: 'CHILD_EXEC_FORBIDDEN' });
  assert.throws(() => parse(replace('+++ exited', 'clone(child_stack=0, flags=SIGCHLD) = 9\n+++ exited')), { code: 'CHILD_EXEC_FORBIDDEN' });
  assert.throws(() => parse(replace('+++ exited', '<... connect resumed>) = 0\n+++ exited')), { code: 'TRACE_LOSS' });
  assert.throws(() => parse(replace('htons(443)', 'htons(80)')), { code: 'NETWORK_ENDPOINT_FORBIDDEN' });
  assert.throws(() => parse(replace('AF_INET, SOCK_STREAM', 'AF_UNIX, SOCK_STREAM')), { code: 'NETWORK_ENDPOINT_FORBIDDEN' });
});

test('output bound, timeout, and executor failure remain failures with private tree retained', async () => {
  assert.throws(() => parse({ traceFiles: ['x'.repeat(16 * 1024 * 1024 + 1)], npmStderr: VALID_HTTP }), { code: 'TRACE_INVALID' });
  await withWorkspace(async (path) => {
    const error = Object.assign(new Error('ACQUISITION_TIMEOUT'), { code: 'ACQUISITION_TIMEOUT' });
    const run = createFreshAcquisitionRunnerForTest(async () => { throw error; }, fakeScanner);
    await assert.rejects(run({ workspaceRoot: path, label: 'A' }), (caught) => caught.code === 'ACQUISITION_TIMEOUT' && caught.privateAcquisitionRetained === join(path, 'acquisition-A'));
    assert.equal((await lstat(join(path, 'acquisition-A'))).isDirectory(), true);
  });
});

test('source mutation during executor is detected after apparent successful trace', async () => withWorkspace(async (path) => {
  const run = createFreshAcquisitionRunnerForTest(async (spec) => {
    await chmod(join(spec.cwd, 'package.json'), 0o600);
    return evidence();
  }, fakeScanner);
  await assert.rejects(run({ workspaceRoot: path, label: 'A' }), { code: 'PINNED_FILE_CHANGED' });
}));
