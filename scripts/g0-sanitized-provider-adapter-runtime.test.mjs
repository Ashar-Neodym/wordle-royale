import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { closeSync, fstatSync, openSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalProviderToolJson, PROVIDER_TOOL_SCHEMA } from './g0-provider-tool-bundle.mjs';
import {
  assertCleanOuterEnvironment, createSanitizedProviderRuntime, parseStrictJsonBytes,
  hashInvocationProfile, readPinnedToolDescriptor, resolveVerifiedHome, validateHomeSnapshot, writeSanitizedEnvelope,
} from './g0-sanitized-provider-adapter-runtime.mjs';

const HASH = (c) => `sha256:${c.repeat(64)}`;
const CLEAN_ENV = Object.freeze({ LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin', TZ: 'UTC' });
const accountSchema = { type: 'object', fields: { accountId: { type: 'string', maxLength: 80, pattern: '^[A-Za-z0-9_-]+$' } } };
const resultSchema = { type: 'object', fields: { accountId: { type: 'string', maxLength: 80, pattern: '^[A-Za-z0-9_-]+$' }, active: { type: 'boolean' } } };
const DEFAULT_OPERATIONS = {
  before: { runtime: 'node_entrypoint', args: ['before'], schema: accountSchema, resultPolicy: 'json_empty_stderr' },
  observe: { runtime: 'node_entrypoint', args: ['observe'], schema: resultSchema, resultPolicy: 'json_empty_stderr' },
  after: { runtime: 'node_entrypoint', args: ['after'], schema: accountSchema, resultPolicy: 'json_empty_stderr' },
};
function staticPolicyViolations(source) {
  const checks = [
    ['direct network', /(?:from\s*|require\(\s*|import\(\s*)['"](?:node:)?(?:http2?|https|net|tls|dgram|dns|undici)['"]|\bfetch\s*\(|\bcurl\b/iu],
    ['credential variable', /\b(?:authorization|proxy-authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|auth[_-]?token|provider[_-]?token|(?:vercel|railway|supabase)[_-]?(?:access[_-]?)?token)\b/iu],
    ['session filename', /(?:^|[/'"`])(?:\.vercel|\.railway|\.supabase|credentials?\.json|auth\.json|(?:vercel|railway|supabase)\.json)(?:[/'"`]|$)/imu],
    ['arbitrary command api', /\b(?:exec|execFile|fork|spawnSync|execSync|execFileSync)\s*\(|shell\s*:\s*true|export\s+(?:async\s+)?function\s+\w*(?:command|exec|spawn)/iu],
    ['output logging', /console\.(?:log|error|warn|info|debug)|process\.(?:stdout|stderr)\.write\s*\(/iu],
  ];
  return checks.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}
function descriptor(root, operations = DEFAULT_OPERATIONS) {
  return {
    schemaVersion: PROVIDER_TOOL_SCHEMA, distribution: 'official_npm_cli', package: 'vercel', version: '58.4.4', bundleRoot: root, bundleRealpath: root,
    entrypoint: 'node_modules/vercel/dist/vc.js', entrypointSha256: 'sha256:56b16d6893212069398eb30e2d96943421cd8a5ba7ea3372a1dd5743ed23d363',
    packageJsonSha256: HASH('1'), lockfileSha256: 'sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90', treeManifestSha256: HASH('2'),
    runtime: { path: '/usr/bin/node', realpath: '/usr/bin/node', version: 'v18.19.1', sha256: 'sha256:f3f93db342d5ac5bb61656d0599a603a73779e98befd9342171e550002725f4d' },
    sessionMode: 'standard_os_user_session', invocationProfile: 'vercel-g0-readonly/1', invocationProfileSha256: hashInvocationProfile('vercel-g0-readonly/1', operations), nativeBinary: null,
  };
}
async function fdFor(root, bytes) { const path = join(root, `descriptor-${Math.random()}`); await writeFile(path, bytes); return openSync(path, 'r'); }
async function fixture(source) {
  const root = await mkdtemp(join(tmpdir(), 'wordle-am3-')); const entry = join(root, 'node_modules/vercel/dist/vc.js'); await mkdir(join(root, 'node_modules/vercel/dist'), { recursive: true }); await writeFile(entry, source, { mode: 0o500 }); await chmod(entry, 0o500);
  const operations = structuredClone(DEFAULT_OPERATIONS), d = descriptor(root, operations), fd = await fdFor(root, `${canonicalProviderToolJson(d)}\n`);
  return { root, d, fd, operations };
}
const cleanup = async (root) => rm(root, { recursive: true, force: true });

test('strict FD reader accepts only bounded canonical descriptor and closes it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wordle-am3-fd-')); try {
    const d = descriptor(root), good = await fdFor(root, `${canonicalProviderToolJson(d)}\n`);
    assert.equal(readPinnedToolDescriptor({ fd: good, expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1' }).bundleRoot, root);
    assert.throws(() => fstatSync(good), (error) => error?.code === 'EBADF');
    for (const [wire, code] of [
      [`${JSON.stringify({ ...d, extra: true })}\n`, 'TOOL_DESCRIPTOR_INVALID'],
      [`${canonicalProviderToolJson(d)}\ntrailing`, 'TOOL_DESCRIPTOR_NON_CANONICAL'],
      [`${canonicalProviderToolJson(d).replace('"version":"58.4.4"', '"version":"58.4.4","version":"58.4.4"')}\n`, 'JSON_DUPLICATE_KEY'],
      [Buffer.from([0x7b, 0xff, 0x7d, 0x0a]), 'JSON_UTF8_INVALID'],
      ['x'.repeat(4097), 'TOOL_DESCRIPTOR_SIZE_INVALID'],
    ]) {
      const fd = await fdFor(root, wire); assert.throws(() => readPinnedToolDescriptor({ fd, expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1' }), (error) => error?.code === code, code);
    }
    const wrong = await fdFor(root, `${canonicalProviderToolJson(d)}\n`); assert.throws(() => readPinnedToolDescriptor({ fd: wrong, expectedProvider: 'vercel', expectedInvocationProfile: 'railway-g0-readonly/1' }), (error) => error?.code === 'TOOL_DESCRIPTOR_IDENTITY_MISMATCH');
  } finally { await cleanup(root); }
});

test('passwd home policy rejects relative, symlink, wrong uid, writable ancestry and realpath drift', async () => {
  const uid = process.geteuid(); const safe = [
    { path: '/', realpath: '/', type: 'directory', uid: 0, mode: 0o755, dev: 1, ino: 1 },
    { path: '/home', realpath: '/home', type: 'directory', uid: 0, mode: 0o755, dev: 1, ino: 2 },
    { path: '/home/user', realpath: '/home/user', type: 'directory', uid, mode: 0o700, dev: 1, ino: 3 },
  ];
  assert.equal(validateHomeSnapshot({ home: '/home/user', effectiveUid: uid, nodes: safe }).home, '/home/user');
  for (const mutate of [
    (x) => { x.home = 'relative'; }, (x) => { x.nodes.at(-1).realpath = '/elsewhere'; },
    (x) => { x.nodes.at(-1).uid = uid + 1; }, (x) => { x.nodes[1].mode = 0o777; },
  ]) { const input = { home: '/home/user', effectiveUid: uid, nodes: structuredClone(safe) }; mutate(input); assert.throws(() => validateHomeSnapshot(input), (error) => error?.code === 'HOME_POLICY_MISMATCH'); }
  assert.equal(resolveVerifiedHome().home, userInfo().homedir);
  assert.throws(() => resolveVerifiedHome({ getUserInfo: () => ({ homedir: 'relative' }), getEffectiveUid: () => uid }), (error) => error?.code === 'HOME_POLICY_MISMATCH');
  const root = await mkdtemp(join(tmpdir(), 'wordle-am3-home-')); try { await mkdir(join(root, 'real')); await symlink(join(root, 'real'), join(root, 'link')); assert.throws(() => resolveVerifiedHome({ getUserInfo: () => ({ homedir: join(root, 'link') }), getEffectiveUid: () => uid }), (error) => error?.code === 'HOME_POLICY_MISMATCH'); } finally { await cleanup(root); }
});

test('outer environment canaries and overrides fail before descriptor read or spawn', () => {
  assert.doesNotThrow(() => assertCleanOuterEnvironment(CLEAN_ENV));
  for (const canary of [{ CANARY: 'private' }, { PROVIDER_TOKEN: 'private' }, { HOME: '/wrong' }, { HTTPS_PROXY: 'https://private' }]) assert.throws(() => assertCleanOuterEnvironment({ ...CLEAN_ENV, ...canary }), (error) => error?.code === 'AMBIENT_ENV_FORBIDDEN');
  assert.throws(() => assertCleanOuterEnvironment({ ...CLEAN_ENV, PATH: '/evil' }), (error) => error?.code === 'AMBIENT_ENV_FORBIDDEN');
});

test('child gets verified HOME, deterministic allowlisted env, empty private cwd, and no fd3 in child or grandchild', async () => {
  const expectedKeys = [...Object.keys(CLEAN_ENV), 'CI', 'NO_COLOR', 'VERCEL_TELEMETRY_DISABLED', 'VERCEL_UPDATE_CHECK_DISABLED', 'RAILWAY_TELEMETRY_DISABLED', 'RAILWAY_NO_UPDATE_CHECK', 'SUPABASE_TELEMETRY_DISABLED', 'SUPABASE_UPDATE_CHECK_DISABLED', 'HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME'].sort();
  const source = `const{readdirSync,readlinkSync,statSync}=require('fs');const{spawnSync}=require('child_process');const leaked=()=>readdirSync('/proc/self/fd').some(n=>{try{return readlinkSync('/proc/self/fd/'+n).includes('descriptor-')}catch{return false}});const grand=spawnSync('/usr/bin/node',['-e',"const fs=require('fs');const bad=fs.readdirSync('/proc/self/fd').some(n=>{try{return fs.readlinkSync('/proc/self/fd/'+n).includes('descriptor-')}catch{return false}});process.exit(bad?9:0)"],{stdio:'ignore'});const keys=Object.keys(process.env).sort();process.stdout.write(JSON.stringify({accountId:'acct_1',active:!leaked()&&grand.status===0&&readdirSync(process.cwd()).length===0&&(statSync(process.cwd()).mode&511)===448&&process.env.HOME===${JSON.stringify(userInfo().homedir)}&&process.env.XDG_CONFIG_HOME===process.env.HOME+'/.config'&&JSON.stringify(keys)===${JSON.stringify(JSON.stringify(expectedKeys))}&&keys.every(k=>!/(?:CANARY|TOKEN|COOKIE|AUTHORIZATION|URL)/.test(k))}));`;
  const f = await fixture(source); let runtime; try {
    runtime = createSanitizedProviderRuntime({ expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1', descriptorFd: f.fd, ambientEnv: CLEAN_ENV, operations: f.operations });
    assert.deepEqual(await runtime.runOperation('observe'), { accountId: 'acct_1', active: true });
  } finally { runtime?.close(); await cleanup(f.root); }
});

test('descriptor-declared invocation hash must equal the compiled argv and schemas before spawn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wordle-am4-profile-')); const marker = join(root, 'spawned');
  try {
    const entry = join(root, 'node_modules/vercel/dist/vc.js'); await mkdir(join(root, 'node_modules/vercel/dist'), { recursive: true }); await writeFile(entry, `require('fs').writeFileSync(${JSON.stringify(marker)},'x')`, { mode: 0o500 }); await chmod(entry, 0o500);
    const d = descriptor(root); d.invocationProfileSha256 = HASH('3'); const fd = await fdFor(root, `${canonicalProviderToolJson(d)}\n`);
    assert.throws(() => createSanitizedProviderRuntime({ expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1', descriptorFd: fd, ambientEnv: CLEAN_ENV, operations: DEFAULT_OPERATIONS }), (error) => error?.code === 'INVOCATION_PROFILE_DIGEST_MISMATCH');
    await assert.rejects(readFile(marker), (error) => error?.code === 'ENOENT');
  } finally { await cleanup(root); }
});

test('fixed dispatcher forbids arbitrary operation and child/provider data cannot become argv', async () => {
  const f = await fixture(`process.stdout.write(JSON.stringify({accountId:'acct_1',active:true}));`); let runtime; try {
    runtime = createSanitizedProviderRuntime({ expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1', descriptorFd: f.fd, ambientEnv: CLEAN_ENV, operations: f.operations });
    await assert.rejects(runtime.runOperation('deploy --payload PRIVATE'), (error) => error?.code === 'OPERATION_FORBIDDEN');
  } finally { runtime?.close(); await cleanup(f.root); }
});

test('every operation starts in a fresh empty cwd and prior child files are cleaned', async () => {
  const source = `const{readdirSync,writeFileSync}=require('fs');const op=process.argv[2];const empty=readdirSync(process.cwd()).length===0;if(op==='before')writeFileSync('PRIVATE_CHILD_FILE','PRIVATE');process.stdout.write(op==='observe'?JSON.stringify({accountId:'acct_1',active:empty}):JSON.stringify({accountId:'acct_1'}));`;
  const f = await fixture(source); let runtime; try {
    runtime = createSanitizedProviderRuntime({ expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1', descriptorFd: f.fd, ambientEnv: CLEAN_ENV, operations: f.operations });
    assert.deepEqual(await runtime.runOperation('before'), { accountId: 'acct_1' });
    assert.deepEqual(await runtime.runOperation('observe'), { accountId: 'acct_1', active: true });
  } finally { runtime?.close(); await cleanup(f.root); }
});

test('hostile child prompt/nonzero/timeout/oversize/stderr all collapse to fixed errors without raw canaries', async (t) => {
  const cases = [
    ['prompt', `process.stdout.write('PRIVATE_PROMPT>');`, 'JSON_SYNTAX_INVALID', {}],
    ['nonzero', `process.stderr.write('PRIVATE_ERROR');process.exit(7);`, 'CHILD_NONZERO', {}],
    ['timeout', `setInterval(()=>{},1000);`, 'CHILD_TIMEOUT', { timeoutMs: 30 }],
    ['stdout limit', `process.stdout.write('X'.repeat(1000));`, 'CHILD_OUTPUT_LIMIT', { stdoutBytes: 30 }],
    ['stderr forbidden', `process.stderr.write('PRIVATE_STDERR');process.stdout.write('{"accountId":"acct_1","active":true}');`, 'CHILD_STDERR_FORBIDDEN', {}],
    ['stderr limit', `process.stderr.write('X'.repeat(1000));`, 'CHILD_OUTPUT_LIMIT', { stderrBytes: 30 }],
  ];
  for (const [name, source, code, limits] of cases) await t.test(name, async () => {
    const f = await fixture(source); let runtime; try {
      runtime = createSanitizedProviderRuntime({ expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1', descriptorFd: f.fd, ambientEnv: CLEAN_ENV, operations: f.operations, limits });
      await assert.rejects(runtime.runOperation('observe'), (error) => error?.code === code && error.message === code && !error.message.includes('PRIVATE'));
    } finally { runtime?.close(); await cleanup(f.root); }
  });
});

test('strict child parser rejects UTF8, duplicate, trailing, excessive depth and unknown schema keys', async (t) => {
  const cases = [
    ['utf8', `process.stdout.write(Buffer.from([255]));`, 'JSON_UTF8_INVALID'],
    ['duplicate', `process.stdout.write('{"accountId":"acct_1","accountId":"acct_1","active":true}');`, 'JSON_DUPLICATE_KEY'],
    ['trailing', `process.stdout.write('{"accountId":"acct_1","active":true}x');`, 'JSON_TRAILING_DATA'],
    ['depth', `process.stdout.write('['.repeat(18)+'0'+']'.repeat(18));`, 'JSON_DEPTH_INVALID'],
    ['unknown', `process.stdout.write('{"accountId":"acct_1","active":true,"private":"CANARY"}');`, 'CHILD_SCHEMA_INVALID'],
  ];
  for (const [name, source, code] of cases) await t.test(name, async () => {
    const f = await fixture(source); let runtime; try { runtime = createSanitizedProviderRuntime({ expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1', descriptorFd: f.fd, ambientEnv: CLEAN_ENV, operations: f.operations }); await assert.rejects(runtime.runOperation('observe'), (error) => error?.code === code); } finally { runtime?.close(); await cleanup(f.root); }
  });
  assert.throws(() => parseStrictJsonBytes(Buffer.from('{"x":1,"x":2}')), (error) => error?.code === 'JSON_DUPLICATE_KEY');
});

test('account pre/post race detects identity change and observation ceiling is closed', async () => {
  const marker = '/tmp/wordle-am3-account-race'; await rm(marker, { force: true });
  const safeSource = `const op=process.argv[2];process.stdout.write(op==='observe'?JSON.stringify({accountId:'acct_1',active:true}):JSON.stringify({accountId:'acct_1'}));`;
  const f = await fixture(safeSource); let runtime; try {
    runtime = createSanitizedProviderRuntime({ expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1', descriptorFd: f.fd, ambientEnv: CLEAN_ENV, operations: f.operations, clock: () => new Date('2026-08-04T12:00:00.000Z') });
    assert.equal(runtime.assertObservationWindow({ issuedAt: '2026-08-04T11:59:00.000Z', observationDeadline: '2026-08-04T12:01:00.000Z' }), '2026-08-04T12:00:00.000Z');
    assert.throws(() => runtime.assertObservationWindow({ issuedAt: '2026-08-04T12:01:00.000Z', observationDeadline: '2026-08-04T12:02:00.000Z' }), (error) => error?.code === 'OBSERVATION_WINDOW_INVALID');
    assert.deepEqual((await runtime.runAccountChecked({ beforeOperation: 'before', observationOperations: ['observe'], afterOperation: 'after' })).accountId, 'acct_1');
  } finally { runtime?.close(); await cleanup(f.root); await rm(marker, { force: true }); }
  const raceSource = `const{existsSync,writeFileSync}=require('fs');const op=process.argv[2];if(op==='observe')writeFileSync('/tmp/wordle-am3-account-race','');process.stdout.write(op==='observe'?JSON.stringify({accountId:'acct_1',active:true}):JSON.stringify({accountId:op==='after'&&existsSync('/tmp/wordle-am3-account-race')?'acct_2':'acct_1'}));`;
  const changed = await fixture(raceSource); let raced; try {
    raced = createSanitizedProviderRuntime({ expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1', descriptorFd: changed.fd, ambientEnv: CLEAN_ENV, operations: changed.operations });
    await assert.rejects(raced.runAccountChecked({ beforeOperation: 'before', observationOperations: ['observe'], afterOperation: 'after' }), (error) => error?.code === 'ACCOUNT_IDENTITY_CHANGED');
  } finally { raced?.close(); await cleanup(changed.root); await rm(marker, { force: true }); }
});

test('envelope writer retains bytes until async completion and collapses write failures', async () => {
  let retained, callback; const output = { write(bytes, done) { retained = bytes; callback = done; } };
  const pending = writeSanitizedEnvelope({ status: 'blocked', payload: null }, output);
  assert.equal(retained.toString('utf8'), '{"payload":null,"status":"blocked"}\n');
  callback(); await pending; assert.ok(retained.every((byte) => byte === 0));
  await assert.rejects(writeSanitizedEnvelope({ status: 'blocked' }, { write() { throw new Error('PRIVATE_WRITE_ERROR'); } }), (error) => error?.code === 'ENVELOPE_WRITE_FAILED' && error.message === 'ENVELOPE_WRITE_FAILED');
});

test('operation profiles and parser objects fail closed before child execution', async () => {
  const parsed = parseStrictJsonBytes(Buffer.from('{"__proto__":{"polluted":true},"constructor":"safe"}'));
  assert.equal(Object.hasOwn(parsed, '__proto__'), true); assert.equal({}.polluted, undefined);
  const f = await fixture(`process.stdout.write('PRIVATE_SHOULD_NOT_RUN');`); try {
    const malformed = structuredClone(f.operations); malformed.observe.schema.fields.active = { type: 'string', pattern: '[', maxLength: 5 };
    assert.throws(() => createSanitizedProviderRuntime({ expectedProvider: 'vercel', expectedInvocationProfile: 'vercel-g0-readonly/1', descriptorFd: f.fd, ambientEnv: CLEAN_ENV, operations: malformed }), (error) => error?.code === 'ADAPTER_PROFILE_INVALID');
    assert.doesNotThrow(() => fstatSync(f.fd));
  } finally { try { closeSync(f.fd); } catch {} await cleanup(f.root); }
});

test('runtime static policy catches network, credential/session names, command APIs, and output logging', async () => {
  const source = await readFile(new URL('./g0-sanitized-provider-adapter-runtime.mjs', import.meta.url), 'utf8');
  assert.deepEqual(staticPolicyViolations(source), []);
  const forbidden = [
    ["import https from 'node:https'", 'direct network'], ["require('https')", 'direct network'], ['fetch("https://private")', 'direct network'], ['curl --silent', 'direct network'],
    ['const VERCEL_TOKEN="***"', 'credential variable'], ['const p = "/home/u/.vercel/auth.json"', 'session filename'],
    ['execFile("/bin/tool", [])', 'arbitrary command api'], ['spawn(tool, args, { shell: true })', 'arbitrary command api'],
    ['console.error(stderr)', 'output logging'], ['process.stderr.write(buffer)', 'output logging'],
  ];
  for (const [candidate, expected] of forbidden) assert.ok(staticPolicyViolations(candidate).includes(expected), candidate);
  assert.equal((source.match(/\bspawn\s*\(/gu) ?? []).length, 1);
  assert.match(source, /spawn\(executable, argv, \{ shell: false, detached: true, cwd, env, stdio: \['ignore', 'pipe', 'pipe'\] \}\)/u);
  assert.equal(createHash('sha256').update(source).digest('hex').length, 64);
});
