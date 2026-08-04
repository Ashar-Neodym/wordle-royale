import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, readlink, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { isIP } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanCanonicalProviderBundleSourceSnapshot } from './g0-provider-bundle-source-snapshot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = resolve(HERE, '..');
const REGISTRY = 'https://registry.npmjs.org/';
const INPUTS = Object.freeze({
  'package.json': Object.freeze({ path: join(REPOSITORY, 'tools/g0-provider-acquisition/v1/package.json'), sha256: '58fffb1ef8b6b6ff51cba0d9f752ea29dac6830cfaed4c763c7a3bd0f2d9dcde', max: 16 * 1024 }),
  'package-lock.json': Object.freeze({ path: join(REPOSITORY, 'tools/g0-provider-acquisition/v1/package-lock.json'), sha256: 'bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90', max: 256 * 1024 }),
});
const TOOLS = Object.freeze({
  node: Object.freeze({ path: '/home/ashar/.nvm/versions/node/v26.3.0/bin/node', realpath: '/home/ashar/.nvm/versions/node/v26.3.0/bin/node', sha256: '5325ac9da58541494afcc136f0880279a2a853609bf4dae7755e04fb682b6926', version: 'v26.3.0', mode: 0o755, uid: 1000 }),
  npm: Object.freeze({ path: '/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js', realpath: '/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js', sha256: '8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7', version: '11.16.0', mode: 0o755, uid: 1000 }),
  tracer: Object.freeze({ path: '/usr/bin/strace', realpath: '/usr/bin/strace', sha256: '28f957c227012de0b18d1bd7fff2d396cb693ea60ed8013be68de071e84b5001', version: 'strace -- version 6.8', mode: 0o755, uid: 0 }),
});
const NPMRC = Buffer.from('registry=https://registry.npmjs.org/\nalways-auth=false\nignore-scripts=true\naudit=false\nfund=false\nstrict-ssl=true\n', 'utf8');
const EMPTY_NPMRC = Buffer.alloc(0);
const ARGS = Object.freeze(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
const OUTPUT_LIMIT = 16 * 1024 * 1024;
const VERSION_OUTPUT_LIMIT = 1024;
const TIMEOUT_MS = 10 * 60 * 1000;
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const DIR_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;

function fail(code, details) {
  const error = new Error(code);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exact(value, keys) {
  if (!plain(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail('FRESH_ACQUISITION_INPUT_INVALID');
}
function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
function identity(st) {
  return [st.dev, st.ino, st.mode, st.nlink, st.uid, st.gid, st.size, st.ctimeNs, st.mtimeNs].map(String).join(':');
}
async function hashHandle(handle, size, max) {
  if (size < 0n || size > BigInt(max)) fail('PINNED_FILE_SIZE_INVALID');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let offset = 0;
  while (offset < Number(size)) {
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, Number(size) - offset), offset);
    if (!bytesRead) fail('PINNED_FILE_CHANGED');
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return hash.digest('hex');
}
async function holdPinnedFile(declaration, { max = 256 * 1024 * 1024, requireOwner = true } = {}) {
  const named = await lstat(declaration.path, { bigint: true }).catch(() => fail('PINNED_FILE_UNAVAILABLE'));
  if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n || Number(named.mode & 0o7777n) !== declaration.mode
      || (requireOwner && named.uid !== BigInt(declaration.uid)) || await realpath(declaration.path).catch(() => '') !== declaration.realpath) fail('PINNED_FILE_POLICY_MISMATCH');
  const handle = await open(declaration.path, FILE_FLAGS).catch(() => fail('PINNED_FILE_CHANGED'));
  try {
    const held = await handle.stat({ bigint: true });
    if (identity(named) !== identity(held)) fail('PINNED_FILE_CHANGED');
    const sha256 = await hashHandle(handle, held.size, max);
    if (declaration.sha256 && sha256 !== declaration.sha256) fail('PINNED_FILE_HASH_MISMATCH');
    return { handle, identity: identity(held), sha256 };
  } catch (error) { await handle.close(); throw error; }
}
async function holdInput(declaration) {
  return holdPinnedFile({ ...declaration, realpath: declaration.path, mode: 0o644, uid: process.getuid?.() }, { max: declaration.max });
}
async function verifyNamed(declaration, held, requireRealpath = true) {
  const named = await lstat(declaration.path, { bigint: true }).catch(() => fail('PINNED_FILE_CHANGED'));
  const current = await held.handle.stat({ bigint: true }).catch(() => fail('PINNED_FILE_CHANGED'));
  if (identity(named) !== held.identity || identity(current) !== held.identity) fail('PINNED_FILE_CHANGED');
  if (requireRealpath && await realpath(declaration.path).catch(() => '') !== declaration.realpath) fail('PINNED_FILE_CHANGED');
}
async function safeDirectory(path, uid, mode, code) {
  const named = await lstat(path, { bigint: true }).catch(() => fail(code));
  if (!named.isDirectory() || named.isSymbolicLink() || named.uid !== uid || named.nlink < 2n
      || Number(named.mode & 0o7777n) !== mode || await realpath(path).catch(() => '') !== path) fail(code);
  const handle = await open(path, DIR_FLAGS).catch(() => fail(code));
  const held = await handle.stat({ bigint: true });
  if (identity(named) !== identity(held)) { await handle.close(); fail(code); }
  return { handle, identity: identity(held) };
}
async function verifyHeldDirectory(path, handle, uid) {
  const named = await lstat(path, { bigint: true }).catch(() => fail('ACQUISITION_DIRECTORY_CHANGED'));
  const current = await handle.stat({ bigint: true }).catch(() => fail('ACQUISITION_DIRECTORY_CHANGED'));
  if (!named.isDirectory() || named.isSymbolicLink() || named.dev !== current.dev || named.ino !== current.ino
      || named.uid !== uid || current.uid !== uid || named.nlink < 2n || current.nlink < 2n
      || Number(named.mode & 0o7777n) !== 0o700 || Number(current.mode & 0o7777n) !== 0o700) fail('ACQUISITION_DIRECTORY_CHANGED');
}
async function createFileExact(path, bytes, mode) {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode).catch(() => fail('ACQUISITION_FILE_CREATE_FAILED'));
  try {
    await handle.chmod(mode);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, offset);
      if (!bytesWritten) fail('ACQUISITION_FILE_WRITE_FAILED');
      offset += bytesWritten;
    }
    await handle.sync();
    const st = await handle.stat({ bigint: true });
    if (!st.isFile() || st.nlink !== 1n || st.uid !== BigInt(process.getuid()) || Number(st.mode & 0o7777n) !== mode || st.size !== BigInt(bytes.length)) fail('ACQUISITION_FILE_POLICY_MISMATCH');
  } finally { await handle.close(); }
}
async function copyHeldInput(held, target, declaration) {
  const before = await held.handle.stat({ bigint: true });
  const bytes = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await held.handle.read(bytes, offset, bytes.length - offset, offset);
    if (!bytesRead) fail('PINNED_FILE_CHANGED');
    offset += bytesRead;
  }
  if (createHash('sha256').update(bytes).digest('hex') !== declaration.sha256) fail('PINNED_FILE_HASH_MISMATCH');
  await createFileExact(target, bytes, 0o644);
}
function buildEnvironment(paths) {
  return freezeDeep({
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', PATH: '/usr/bin:/bin', HOME: paths.home,
    npm_config_userconfig: paths.userconfig, npm_config_globalconfig: paths.globalconfig,
    npm_config_cache: paths.cache, npm_config_registry: REGISTRY, npm_config_ignore_scripts: 'true',
    npm_config_prefix: paths.prefix, npm_config_platform: 'linux', npm_config_arch: 'x64', npm_config_libc: 'glibc',
    npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false',
    npm_config_progress: 'false', npm_config_loglevel: 'http',
  });
}
function endpoint(line) {
  const family = line.match(/sa_family=(AF_[A-Z0-9_]+)/u)?.[1];
  const port = line.match(/sin6?_port=htons\((\d+)\)/u)?.[1];
  const address = line.match(/inet_pton\(AF_INET6?, "([^"]+)"/u)?.[1] ?? line.match(/sin_addr=inet_addr\("([^"]+)"\)/u)?.[1];
  return { family, port: port === undefined ? undefined : Number(port), address };
}
export function parseFreshAcquisitionEvidence({ traceFiles, npmStderr, resolverAddresses }) {
  if (!Array.isArray(traceFiles) || traceFiles.length === 0 || traceFiles.every((x) => x === '') || traceFiles.some((x) => typeof x !== 'string' || x.length > OUTPUT_LIMIT) || typeof npmStderr !== 'string' || npmStderr.length > OUTPUT_LIMIT) fail('TRACE_INVALID');
  if (!Array.isArray(resolverAddresses) || resolverAddresses.length === 0 || resolverAddresses.some((x) => typeof x !== 'string' || !x)) fail('RESOLVER_INVALID');
  const resolvers = new Set(resolverAddresses);
  const httpLines = npmStderr.split('\n').filter((line) => line.startsWith('npm http '));
  if (httpLines.length === 0) fail('NPM_HTTP_LOG_INVALID');
  let httpRequestCount = 0;
  for (const line of httpLines) {
    const urls = line.match(/https?:\/\/[^\s)]+/gu);
    if (!urls || urls.length !== 1) fail('NPM_HTTP_LOG_INVALID');
    let url; try { url = new URL(urls[0]); } catch { fail('NPM_HTTP_LOG_INVALID'); }
    if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password || /%40[^/]*@/iu.test(urls[0])) fail('NETWORK_ORIGIN_FORBIDDEN');
    httpRequestCount += 1;
  }
  let execCount = 0; let dnsRequestCount = 0; let tlsConnectionCount = 0; let networkSyscallCount = 0;
  const allowedSyscalls = new Set(['execve', 'clone', 'clone3', 'exit', 'exit_group', 'socket', 'connect', 'sendto', 'sendmsg', 'sendmmsg', 'recvfrom', 'recvmsg', 'recvmmsg', 'bind', 'getsockname', 'getsockopt', 'setsockopt', 'shutdown']);
  for (const text of traceFiles) {
    if (/unfinished \.\.\.|<\.\.\. [a-z]+ resumed>|ptrace|Process \d+ attached|strace:/u.test(text)) fail('TRACE_LOSS');
    for (const line of text.split('\n')) {
      if (!line || /^\+\+\+ exited with 0 \+\+\+$/u.test(line) || /^--- SIG/u.test(line)) continue;
      const syscall = line.match(/^([a-z][a-z0-9_]*)\(/u)?.[1];
      if (!syscall || !allowedSyscalls.has(syscall)) fail('TRACE_SYSCALL_UNKNOWN');
      if (/execve\(/u.test(line)) {
        execCount += 1;
        if (execCount !== 1 || !/execve\("\/proc\/self\/fd\/4", \["\/proc\/self\/fd\/4", "\/proc\/self\/fd\/5", "ci"/u.test(line)) fail('CHILD_EXEC_FORBIDDEN');
      }
      if (/\b(fork|vfork)\(/u.test(line) || (/\bclone3?\(/u.test(line) && !/CLONE_THREAD/u.test(line))) fail('CHILD_EXEC_FORBIDDEN');
      if (/\b(socket|connect|sendto|sendmsg|sendmmsg|recvfrom|recvmsg|recvmmsg|bind|getsockname|getsockopt|setsockopt|shutdown)\(/u.test(line)) {
        networkSyscallCount += 1;
        if (/AF_PACKET/u.test(line)) fail('NETWORK_ENDPOINT_FORBIDDEN');
        if (/AF_UNIX|AF_LOCAL/u.test(line)
            && !(/^getsock(?:name|opt)\([12],/u.test(line) || /^socket\(AF_UNIX, SOCK_STREAM\|SOCK_CLOEXEC\|SOCK_NONBLOCK, 0\)/u.test(line)
              || /^connect\(\d+, \{sa_family=AF_UNIX, sun_path="\/var\/run\/nscd\/socket"\}.*ENOENT/u.test(line))) fail('NETWORK_ENDPOINT_FORBIDDEN');
        if (/AF_NETLINK/u.test(line) && !(/NETLINK_ROUTE|RTM_(?:GET|NEW)(?:LINK|ADDR)|NLMSG_|^getsockname|^bind\(\d+, \{sa_family=AF_NETLINK/u.test(line))) fail('NETWORK_ENDPOINT_FORBIDDEN');
        if (/\b(connect|sendto|sendmsg|sendmmsg)\(/u.test(line) && /sa_family=/u.test(line)) {
          const item = endpoint(line);
          if (item.family === 'AF_NETLINK' || item.family === 'AF_UNSPEC' || item.family === 'AF_UNIX') continue;
          if ((item.family !== 'AF_INET' && item.family !== 'AF_INET6') || !item.address) fail('NETWORK_ENDPOINT_MALFORMED');
          if (item.port === 53) { if (!resolvers.has(item.address)) fail('DNS_RESOLVER_FORBIDDEN'); dnsRequestCount += 1; }
          else if (item.port === 443) tlsConnectionCount += 1;
          else if (item.port !== 0) fail('NETWORK_ENDPOINT_FORBIDDEN');
        }
      }
      if (/^\+\+\+ killed/u.test(line) || /^\+\+\+ exited with [^0]/u.test(line)) fail('TRACE_PROCESS_FAILURE');
    }
  }
  if (execCount !== 1 || dnsRequestCount === 0 || tlsConnectionCount === 0) fail('NETWORK_OBSERVATION_INCOMPLETE');
  return freezeDeep({ allowedObservedHttpOrigin: REGISTRY, dnsRequestCount, httpRequestCount, networkSyscallCount, tlsConnectionCount });
}
async function productionExecutor(spec) {
  const oldUmask = process.umask(0o077);
  let child;
  try {
    child = spawn('/proc/self/fd/3', ['-ff', '-qq', '-s', '65535', '-e', 'trace=%network,%process', '-o', spec.tracePrefix, '/proc/self/fd/4', '/proc/self/fd/5', ...spec.args], {
      cwd: spec.cwd, env: spec.env, detached: true, stdio: ['ignore', 'pipe', 'pipe', spec.tracerFd, spec.nodeFd, spec.npmFd], windowsHide: true,
    });
  } finally { process.umask(oldUmask); }
  const stdout = []; const stderr = []; let outputBytes = 0; let overflow = false; let timedOut = false;
  const consume = (list) => (chunk) => { outputBytes += chunk.length; if (outputBytes > OUTPUT_LIMIT) { overflow = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} } else list.push(Buffer.from(chunk)); };
  child.stdout.on('data', consume(stdout)); child.stderr.on('data', consume(stderr));
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, TIMEOUT_MS); timer.unref();
  const outcome = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })); }).finally(() => clearTimeout(timer));
  if (timedOut) fail('ACQUISITION_TIMEOUT'); if (overflow) fail('ACQUISITION_OUTPUT_LIMIT');
  if (outcome.code !== 0 || outcome.signal !== null) fail('NPM_CI_FAILED');
  const names = (await readdir(spec.traceDirectory)).filter((name) => /^npm-trace\.\d+$/u.test(name)).sort();
  if (!names.length || names.length > 256) fail('TRACE_INVALID');
  let traceBytes = 0;
  for (const name of names) {
    const st = await lstat(join(spec.traceDirectory, name), { bigint: true }).catch(() => fail('TRACE_INVALID'));
    if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1n || st.uid !== BigInt(process.getuid()) || Number(st.mode & 0o7777n) !== 0o600) fail('TRACE_INVALID');
    traceBytes += Number(st.size); if (!Number.isSafeInteger(traceBytes) || traceBytes > OUTPUT_LIMIT) fail('ACQUISITION_OUTPUT_LIMIT');
  }
  const traceFiles = await Promise.all(names.map(async (name) => {
    const handle = await open(`/proc/self/fd/${spec.traceDirectoryFd}/${name}`, FILE_FLAGS).catch(() => fail('TRACE_INVALID'));
    try {
      const st = await handle.stat({ bigint: true });
      if (!st.isFile() || st.nlink !== 1n || st.uid !== BigInt(process.getuid()) || Number(st.mode & 0o7777n) !== 0o600) fail('TRACE_INVALID');
      return await handle.readFile({ encoding: 'utf8' });
    } finally { await handle.close(); }
  }));
  return { npmStderr: Buffer.concat(stderr).toString('utf8'), stdoutBytes: Buffer.concat(stdout).length, traceFiles };
}
async function verifyTracer() {
  try { return await holdPinnedFile(TOOLS.tracer, { max: 4 * 1024 * 1024 }); }
  catch { fail('TRACER_POLICY_MISMATCH'); }
}
async function executeVersion(nodeFd, npmFd, npm) {
  const args = npm ? ['/proc/self/fd/4', '--version'] : ['--version'];
  const stdio = npm ? ['ignore', 'pipe', 'pipe', nodeFd, npmFd] : ['ignore', 'pipe', 'pipe', nodeFd];
  const child = spawn('/proc/self/fd/3', args, { env: {}, stdio, windowsHide: true });
  const chunks = []; let size = 0; let overflow = false; let timedOut = false;
  const consume = (chunk) => { size += chunk.length; if (size > VERSION_OUTPUT_LIMIT) { overflow = true; child.kill('SIGKILL'); } else chunks.push(Buffer.from(chunk)); };
  child.stdout.on('data', consume); child.stderr.on('data', consume);
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 5000); timer.unref();
  const outcome = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })); }).finally(() => clearTimeout(timer));
  if (overflow || timedOut || outcome.code !== 0 || outcome.signal !== null) fail('TOOL_VERSION_EXECUTION_FAILED');
  return Buffer.concat(chunks).toString('utf8').trim();
}
async function verifyExecutedVersions(node, npm, tracer) {
  if (await executeVersion(node.handle.fd, npm.handle.fd, false) !== TOOLS.node.version
      || await executeVersion(node.handle.fd, npm.handle.fd, true) !== TOOLS.npm.version
      || (await executeVersion(tracer.handle.fd, undefined, false)).split('\n')[0] !== TOOLS.tracer.version) fail('TOOL_VERSION_MISMATCH');
}
async function holdResolverConfiguration() {
  const path = '/etc/resolv.conf';
  const named = await lstat(path, { bigint: true }).catch(() => fail('RESOLVER_POLICY_MISMATCH'));
  if (!named.isSymbolicLink() || named.uid !== 0n || named.nlink !== 1n) fail('RESOLVER_POLICY_MISMATCH');
  const link = await readlink(path); const target = await realpath(path).catch(() => fail('RESOLVER_POLICY_MISMATCH'));
  const targetStat = await lstat(target, { bigint: true }).catch(() => fail('RESOLVER_POLICY_MISMATCH'));
  const held = await holdPinnedFile({ path: target, realpath: target, mode: Number(targetStat.mode & 0o7777n), uid: Number(targetStat.uid) }, { max: 64 * 1024 });
  const bytes = await held.handle.readFile({ encoding: 'utf8' });
  const addresses = bytes.split('\n').map((line) => line.match(/^\s*nameserver\s+(\S+)\s*(?:#.*)?$/u)?.[1]).filter(Boolean);
  if (addresses.length === 0 || addresses.some((address) => !isIP(address))) { await held.handle.close(); fail('RESOLVER_INVALID'); }
  return { ...held, path, target, link, namedIdentity: identity(named), addresses: [...new Set(addresses)] };
}
async function verifyResolverConfiguration(resolver) {
  const named = await lstat(resolver.path, { bigint: true }).catch(() => fail('RESOLVER_CHANGED'));
  if (identity(named) !== resolver.namedIdentity || await readlink(resolver.path).catch(() => '') !== resolver.link
      || await realpath(resolver.path).catch(() => '') !== resolver.target) fail('RESOLVER_CHANGED');
  const current = await resolver.handle.stat({ bigint: true }).catch(() => fail('RESOLVER_CHANGED'));
  if (identity(current) !== resolver.identity || await hashHandle(resolver.handle, current.size, 64 * 1024) !== resolver.sha256) fail('RESOLVER_CHANGED');
}
async function verifyLockOrigins(handle) {
  const st = await handle.stat({ bigint: true });
  const bytes = Buffer.alloc(Number(st.size)); let offset = 0;
  while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) fail('LOCKFILE_INVALID'); offset += bytesRead; }
  let lock; try { lock = JSON.parse(bytes.toString('utf8')); } catch { fail('LOCKFILE_INVALID'); }
  if (!plain(lock.packages)) fail('LOCKFILE_INVALID');
  for (const entry of Object.values(lock.packages)) if (plain(entry) && entry.resolved !== undefined) {
    if (typeof entry.resolved !== 'string') fail('LOCKFILE_ORIGIN_FORBIDDEN');
    let url; try { url = new URL(entry.resolved); } catch { fail('LOCKFILE_ORIGIN_FORBIDDEN'); }
    if (url.protocol !== 'https:' || url.origin !== 'https://registry.npmjs.org' || url.username || url.password) fail('LOCKFILE_ORIGIN_FORBIDDEN');
  }
}
async function runAcquisition(input, executor, scanner) {
  exact(input, ['workspaceRoot', 'label']);
  const { workspaceRoot, label } = input;
  if ((label !== 'A' && label !== 'B') || typeof workspaceRoot !== 'string' || !isAbsolute(workspaceRoot) || resolve(workspaceRoot) !== workspaceRoot || workspaceRoot === '/') fail('FRESH_ACQUISITION_INPUT_INVALID');
  const uid = BigInt(process.getuid?.()); if (uid !== 1000n) fail('ACQUISITION_UID_MISMATCH');
  const workspace = await safeDirectory(workspaceRoot, uid, 0o700, 'WORKSPACE_UNSAFE');
  const acquisition = join(workspaceRoot, `acquisition-${label}`);
  const held = [];
  let created = false;
  try {
    await mkdir(acquisition, { mode: 0o700 }); created = true;
    const acquisitionHeld = await safeDirectory(acquisition, uid, 0o700, 'ACQUISITION_DIRECTORY_UNSAFE'); held.push(acquisitionHeld.handle);
    const paths = { acquisition }; const directoryHandles = new Map([['acquisition', acquisitionHeld.handle]]);
    for (const name of ['source', 'home', 'cache', 'config', 'trace', 'prefix']) {
      paths[name] = join(acquisition, name); await mkdir(paths[name], { mode: 0o700 });
      const item = await safeDirectory(paths[name], uid, 0o700, 'ACQUISITION_DIRECTORY_UNSAFE'); held.push(item.handle); directoryHandles.set(name, item.handle);
    }
    paths.userconfig = join(paths.config, 'user.npmrc'); paths.globalconfig = join(paths.config, 'global.npmrc');
    await createFileExact(paths.userconfig, NPMRC, 0o600); await createFileExact(paths.globalconfig, EMPTY_NPMRC, 0o600);
    const packageInput = await holdInput(INPUTS['package.json']); const lockInput = await holdInput(INPUTS['package-lock.json']); held.push(packageInput.handle, lockInput.handle);
    await copyHeldInput(packageInput, join(paths.source, 'package.json'), INPUTS['package.json']);
    await copyHeldInput(lockInput, join(paths.source, 'package-lock.json'), INPUTS['package-lock.json']);
    const sourcePackage = await holdPinnedFile({ ...INPUTS['package.json'], path: join(paths.source, 'package.json'), realpath: join(paths.source, 'package.json'), mode: 0o644, uid: Number(uid) }, { max: INPUTS['package.json'].max });
    const sourceLock = await holdPinnedFile({ ...INPUTS['package-lock.json'], path: join(paths.source, 'package-lock.json'), realpath: join(paths.source, 'package-lock.json'), mode: 0o644, uid: Number(uid) }, { max: INPUTS['package-lock.json'].max }); held.push(sourcePackage.handle, sourceLock.handle);
    await verifyLockOrigins(sourceLock.handle);
    const node = await holdPinnedFile(TOOLS.node); const npm = await holdPinnedFile(TOOLS.npm); held.push(node.handle, npm.handle);
    const tracer = await verifyTracer(); held.push(tracer.handle);
    const resolver = await holdResolverConfiguration(); held.push(resolver.handle);
    await verifyExecutedVersions(node, npm, tracer);
    const env = buildEnvironment(paths);
    const args = [...ARGS, `--registry=${REGISTRY}`, `--userconfig=${paths.userconfig}`, `--cache=${paths.cache}`];
    const execution = await executor(freezeDeep({ args, cwd: paths.source, env, tracerFd: tracer.handle.fd, nodeFd: node.handle.fd, npmFd: npm.handle.fd, traceDirectory: paths.trace, traceDirectoryFd: directoryHandles.get('trace').fd, tracePrefix: join(paths.trace, 'npm-trace') }));
    const networkSummary = parseFreshAcquisitionEvidence({ ...execution, resolverAddresses: resolver.addresses });
    await verifyExecutedVersions(node, npm, tracer); await verifyResolverConfiguration(resolver); await verifyLockOrigins(sourceLock.handle);
    await verifyNamed(TOOLS.node, node); await verifyNamed(TOOLS.npm, npm);
    await verifyNamed(TOOLS.tracer, tracer);
    for (const [name, handle] of directoryHandles) await verifyHeldDirectory(paths[name], handle, uid);
    await verifyNamed(INPUTS['package.json'], packageInput, false); await verifyNamed(INPUTS['package-lock.json'], lockInput, false);
    const userConfig = await holdPinnedFile({ path: paths.userconfig, realpath: paths.userconfig, sha256: createHash('sha256').update(NPMRC).digest('hex'), mode: 0o600, uid: Number(uid) }, { max: NPMRC.length });
    const globalConfig = await holdPinnedFile({ path: paths.globalconfig, realpath: paths.globalconfig, sha256: createHash('sha256').update(EMPTY_NPMRC).digest('hex'), mode: 0o600, uid: Number(uid) }, { max: 1 }); held.push(userConfig.handle, globalConfig.handle);
    await verifyNamed({ ...INPUTS['package.json'], path: join(paths.source, 'package.json'), realpath: join(paths.source, 'package.json') }, sourcePackage);
    await verifyNamed({ ...INPUTS['package-lock.json'], path: join(paths.source, 'package-lock.json'), realpath: join(paths.source, 'package-lock.json') }, sourceLock);
    const snapshot = await scanner({ sourceRoot: paths.source });
    const result = {
      status: 'FRESH_ACQUISITION_VALID', label, sourceRoot: paths.source,
      canonicalSourceSnapshotSha256: snapshot.canonicalSourceSnapshotSha256,
      packageJsonSha256: `sha256:${INPUTS['package.json'].sha256}`, packageLockSha256: `sha256:${INPUTS['package-lock.json'].sha256}`,
      toolchain: { node: { path: TOOLS.node.path, realpath: TOOLS.node.realpath, sha256: `sha256:${TOOLS.node.sha256}`, version: TOOLS.node.version }, npm: { path: TOOLS.npm.path, realpath: TOOLS.npm.realpath, sha256: `sha256:${TOOLS.npm.sha256}`, version: TOOLS.npm.version }, tracer: { path: TOOLS.tracer.path, realpath: TOOLS.tracer.realpath, sha256: `sha256:${tracer.sha256}`, version: TOOLS.tracer.version } },
      networkSummary, lifecycleScriptsExecuted: false, credentialsForwarded: false, providerExecuted: false,
    };
    return freezeDeep(result);
  } catch (error) {
    if (created) Object.defineProperty(error, 'privateAcquisitionRetained', { value: acquisition, enumerable: false });
    throw error;
  } finally { await Promise.allSettled(held.reverse().map((handle) => handle.close())); await workspace.handle.close(); }
}
export async function runFreshProviderBundleAcquisition(input) {
  if (arguments.length !== 1) fail('FRESH_ACQUISITION_INPUT_INVALID');
  return runAcquisition(input, productionExecutor, scanCanonicalProviderBundleSourceSnapshot);
}
export function createFreshAcquisitionRunnerForTest(executor, scanner) {
  if (typeof executor !== 'function' || typeof scanner !== 'function') fail('TEST_RUNNER_INVALID');
  return (input) => runAcquisition(input, executor, scanner);
}
