import { spawn } from 'node:child_process';
import { closeSync, lstatSync, mkdtempSync, readSync, realpathSync, rmSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { TextDecoder } from 'node:util';
import { canonicalProviderToolJson, validateProviderToolDescriptor } from './g0-provider-tool-bundle.mjs';

const MAX_DESCRIPTOR_BYTES = 4096;
const MAX_JSON_DEPTH = 16;
const OUTER_ENV = Object.freeze({ LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin', TZ: 'UTC' });
const CHILD_CONSTANTS = Object.freeze({
  CI: '1', NO_COLOR: '1', VERCEL_TELEMETRY_DISABLED: '1', VERCEL_UPDATE_CHECK_DISABLED: '1',
  RAILWAY_TELEMETRY_DISABLED: '1', RAILWAY_NO_UPDATE_CHECK: '1',
  SUPABASE_TELEMETRY_DISABLED: '1', SUPABASE_UPDATE_CHECK_DISABLED: '1',
});
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const plain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; };
const exact = (value, keys, code) => {
  if (!plain(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail(code);
};

// JSON.parse silently accepts duplicate member names. This small parser does not,
// and also gives the two wire boundaries one shared depth/trailing-data policy.
export function parseStrictJsonBytes(bytes, { maxBytes = 1_048_576, maxDepth = MAX_JSON_DEPTH } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maxBytes || !Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 64) fail('JSON_SIZE_INVALID');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('JSON_UTF8_INVALID'); }
  let at = 0;
  const ws = () => { while (/[\x20\t\r\n]/u.test(text[at] ?? '')) at += 1; };
  const string = () => {
    if (text[at] !== '"') fail('JSON_SYNTAX_INVALID');
    const start = at++;
    while (at < text.length) {
      const c = text[at++];
      if (c === '"') { try { return JSON.parse(text.slice(start, at)); } catch { fail('JSON_SYNTAX_INVALID'); } }
      if (c === '\\') { const escaped = text[at++]; if (!escaped || !/["\\/bfnrtu]/u.test(escaped)) fail('JSON_SYNTAX_INVALID'); if (escaped === 'u') { if (!/^[a-fA-F0-9]{4}$/u.test(text.slice(at, at + 4))) fail('JSON_SYNTAX_INVALID'); at += 4; } }
      else if (c.charCodeAt(0) < 0x20) fail('JSON_SYNTAX_INVALID');
    }
    fail('JSON_SYNTAX_INVALID');
  };
  const value = (depth) => {
    if (depth > maxDepth) fail('JSON_DEPTH_INVALID');
    ws(); const c = text[at];
    if (c === '"') return string();
    if (c === '{') {
      at += 1; ws(); const out = {}; const seen = new Set();
      if (text[at] === '}') { at += 1; return out; }
      while (true) {
        ws(); const key = string(); if (seen.has(key)) fail('JSON_DUPLICATE_KEY'); seen.add(key);
        ws(); if (text[at++] !== ':') fail('JSON_SYNTAX_INVALID'); Object.defineProperty(out, key, { value: value(depth + 1), enumerable: true, configurable: true, writable: true }); ws();
        if (text[at] === '}') { at += 1; return out; } if (text[at++] !== ',') fail('JSON_SYNTAX_INVALID');
      }
    }
    if (c === '[') {
      at += 1; ws(); const out = []; if (text[at] === ']') { at += 1; return out; }
      while (true) { out.push(value(depth + 1)); ws(); if (text[at] === ']') { at += 1; return out; } if (text[at++] !== ',') fail('JSON_SYNTAX_INVALID'); }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) if (text.startsWith(literal, at)) { at += literal.length; return result; }
    const match = text.slice(at).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (!match) fail('JSON_SYNTAX_INVALID'); at += match[0].length; const number = Number(match[0]); if (!Number.isFinite(number)) fail('JSON_NUMBER_INVALID'); return number;
  };
  const result = value(1); ws(); if (at !== text.length) fail('JSON_TRAILING_DATA'); return result;
}

export function readPinnedToolDescriptor({ fd = 3, expectedProvider, expectedInvocationProfile } = {}) {
  if (!Number.isInteger(fd) || fd < 0 || typeof expectedProvider !== 'string' || typeof expectedInvocationProfile !== 'string') fail('TOOL_DESCRIPTOR_EXPECTATION_INVALID');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const chunk = Buffer.alloc(Math.min(1024, MAX_DESCRIPTOR_BYTES + 1 - length));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) { chunk.fill(0); break; }
      chunks.push(chunk.subarray(0, count)); length += count;
      if (length > MAX_DESCRIPTOR_BYTES) fail('TOOL_DESCRIPTOR_SIZE_INVALID');
    }
  } catch (error) { if (error?.code?.startsWith?.('TOOL_')) throw error; fail('TOOL_DESCRIPTOR_UNAVAILABLE'); }
  finally { try { closeSync(fd); } catch {} }
  const wire = Buffer.concat(chunks, length); for (const chunk of chunks) chunk.fill(0);
  try {
    if (wire.length < 3 || wire.at(-1) !== 0x0a) fail('TOOL_DESCRIPTOR_NON_CANONICAL');
    const descriptor = parseStrictJsonBytes(wire.subarray(0, -1), { maxBytes: MAX_DESCRIPTOR_BYTES });
    validateProviderToolDescriptor(descriptor, expectedProvider);
    if (descriptor.invocationProfile !== expectedInvocationProfile) fail('TOOL_DESCRIPTOR_IDENTITY_MISMATCH');
    const canonical = Buffer.from(`${canonicalProviderToolJson(descriptor)}\n`, 'utf8');
    try { if (!wire.equals(canonical)) fail('TOOL_DESCRIPTOR_NON_CANONICAL'); } finally { canonical.fill(0); }
    return deepFreeze(descriptor);
  } finally { wire.fill(0); }
}

function pathParts(path) { const parts = []; let current = path; while (true) { parts.push(current); if (current === sep) return parts.reverse(); current = dirname(current); } }
export function validateHomeSnapshot({ home, effectiveUid, nodes } = {}) {
  if (typeof home !== 'string' || home.includes('\0') || !isAbsolute(home) || resolve(home) !== home || !Number.isInteger(effectiveUid) || !Array.isArray(nodes)) fail('HOME_POLICY_MISMATCH');
  const wanted = pathParts(home); if (nodes.length !== wanted.length) fail('HOME_POLICY_MISMATCH');
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]; exact(node, ['path', 'realpath', 'type', 'uid', 'mode', 'dev', 'ino'], 'HOME_POLICY_MISMATCH');
    if (node.path !== wanted[i] || node.realpath !== node.path || node.type !== 'directory' || ![0, effectiveUid].includes(node.uid) || (node.mode & 0o022) !== 0) fail('HOME_POLICY_MISMATCH');
  }
  if (nodes.at(-1).uid !== effectiveUid) fail('HOME_POLICY_MISMATCH'); return Object.freeze({ home, effectiveUid, nodes });
}
function homeSnapshot(home, effectiveUid) {
  if (typeof home !== 'string' || home.includes('\0') || !isAbsolute(home) || resolve(home) !== home || !Number.isInteger(effectiveUid)) fail('HOME_POLICY_MISMATCH');
  const nodes = pathParts(home).map((path) => {
    let named; try { named = lstatSync(path, { bigint: false }); } catch { fail('HOME_UNAVAILABLE'); }
    if (!named.isDirectory() || named.isSymbolicLink()) fail('HOME_POLICY_MISMATCH');
    let canonical; try { canonical = realpathSync(path); } catch { fail('HOME_UNAVAILABLE'); }
    return { path, realpath: canonical, type: 'directory', uid: named.uid, mode: named.mode & 0o7777, dev: named.dev, ino: named.ino };
  });
  return validateHomeSnapshot({ home, effectiveUid, nodes });
}
export function resolveVerifiedHome({ getUserInfo = userInfo, getEffectiveUid = () => process.geteuid?.() ?? process.getuid?.() } = {}) {
  let info, uid; try { info = getUserInfo(); uid = getEffectiveUid(); } catch { fail('HOME_UNAVAILABLE'); }
  if (!info || typeof info.homedir !== 'string' || !Number.isInteger(uid)) fail('HOME_UNAVAILABLE');
  return homeSnapshot(info.homedir, uid);
}
function snapshotsEqual(a, b) { return canonicalProviderToolJson(a) === canonicalProviderToolJson(b); }

function createPrivateCwd(effectiveUid) {
  let cwd;
  try {
    cwd = mkdtempSync('/tmp/wordle-g0-adapter-'); const s = lstatSync(cwd);
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== effectiveUid || (s.mode & 0o7777) !== 0o700 || realpathSync(cwd) !== cwd) fail('ADAPTER_CWD_INVALID');
    return cwd;
  } catch (error) {
    if (cwd) { try { rmSync(cwd, { recursive: true, force: true }); } catch {} }
    if (error?.code === 'ADAPTER_CWD_INVALID') throw error; fail('ADAPTER_CWD_INVALID');
  }
}

function removePrivateCwd(cwd) {
  try { rmSync(cwd, { recursive: true, force: true }); } catch { fail('ADAPTER_CLEANUP_FAILED'); }
}

export function assertCleanOuterEnvironment(ambient = process.env) {
  if (!ambient || typeof ambient !== 'object') fail('AMBIENT_ENV_FORBIDDEN');
  if (Object.keys(ambient).sort().join('\0') !== Object.keys(OUTER_ENV).sort().join('\0')) fail('AMBIENT_ENV_FORBIDDEN');
  for (const [key, value] of Object.entries(OUTER_ENV)) if (ambient[key] !== value) fail('AMBIENT_ENV_FORBIDDEN');
}
export function buildSanitizedChildEnvironment(home) {
  if (typeof home !== 'string' || !isAbsolute(home) || resolve(home) !== home) fail('HOME_POLICY_MISMATCH');
  return Object.freeze({ ...OUTER_ENV, ...CHILD_CONSTANTS, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), XDG_DATA_HOME: join(home, '.local/share'), XDG_STATE_HOME: join(home, '.local/state') });
}

function validateSchema(value, schema, depth = 1) {
  if (depth > MAX_JSON_DEPTH || !plain(schema) || typeof schema.type !== 'string') fail('CHILD_SCHEMA_INVALID');
  if (schema.type === 'object') {
    exact(schema, ['type', 'fields'], 'ADAPTER_PROFILE_INVALID'); if (!plain(schema.fields) || !plain(value)) fail('CHILD_SCHEMA_INVALID');
    exact(value, Object.keys(schema.fields), 'CHILD_SCHEMA_INVALID'); const out = {};
    for (const key of Object.keys(schema.fields)) out[key] = validateSchema(value[key], schema.fields[key], depth + 1); return Object.freeze(out);
  }
  if (schema.type === 'array') {
    exact(schema, ['type', 'items', 'maxItems'], 'ADAPTER_PROFILE_INVALID'); if (!Array.isArray(value) || !Number.isInteger(schema.maxItems) || schema.maxItems < 0 || value.length > schema.maxItems) fail('CHILD_SCHEMA_INVALID');
    return Object.freeze(value.map((item) => validateSchema(item, schema.items, depth + 1)));
  }
  if (schema.type === 'string') {
    const keys = Object.keys(schema).sort().join('|'); if (!['enum|type', 'maxLength|pattern|type'].includes(keys)) fail('ADAPTER_PROFILE_INVALID');
    if (typeof value !== 'string' || value.includes('\0')) fail('CHILD_SCHEMA_INVALID');
    if (schema.enum) { if (!Array.isArray(schema.enum) || !schema.enum.includes(value)) fail('CHILD_SCHEMA_INVALID'); }
    else if (!Number.isInteger(schema.maxLength) || value.length > schema.maxLength || typeof schema.pattern !== 'string' || !(new RegExp(schema.pattern, 'u')).test(value)) fail('CHILD_SCHEMA_INVALID'); return value;
  }
  if (schema.type === 'boolean') { exact(schema, ['type'], 'ADAPTER_PROFILE_INVALID'); if (typeof value !== 'boolean') fail('CHILD_SCHEMA_INVALID'); return value; }
  if (schema.type === 'integer') { exact(schema, ['type', 'min', 'max'], 'ADAPTER_PROFILE_INVALID'); if (!Number.isSafeInteger(value) || value < schema.min || value > schema.max) fail('CHILD_SCHEMA_INVALID'); return value; }
  fail('ADAPTER_PROFILE_INVALID');
}

function validateOutputSchema(schema, depth = 1) {
  if (depth > MAX_JSON_DEPTH || !plain(schema) || typeof schema.type !== 'string') fail('ADAPTER_PROFILE_INVALID');
  if (schema.type === 'object') {
    exact(schema, ['type', 'fields'], 'ADAPTER_PROFILE_INVALID');
    if (!plain(schema.fields) || Object.keys(schema.fields).length < 1) fail('ADAPTER_PROFILE_INVALID');
    for (const child of Object.values(schema.fields)) validateOutputSchema(child, depth + 1);
    return;
  }
  if (schema.type === 'array') {
    exact(schema, ['type', 'items', 'maxItems'], 'ADAPTER_PROFILE_INVALID');
    if (!Number.isInteger(schema.maxItems) || schema.maxItems < 0 || schema.maxItems > 10_000) fail('ADAPTER_PROFILE_INVALID');
    validateOutputSchema(schema.items, depth + 1); return;
  }
  if (schema.type === 'string') {
    const keys = Object.keys(schema).sort().join('|');
    if (!['enum|type', 'maxLength|pattern|type'].includes(keys)) fail('ADAPTER_PROFILE_INVALID');
    if (schema.enum) {
      if (!Array.isArray(schema.enum) || schema.enum.length < 1 || schema.enum.some((x) => typeof x !== 'string' || x.includes('\0'))) fail('ADAPTER_PROFILE_INVALID');
    } else {
      if (!Number.isInteger(schema.maxLength) || schema.maxLength < 0 || schema.maxLength > 1_048_576 || typeof schema.pattern !== 'string' || schema.pattern.length > 1024) fail('ADAPTER_PROFILE_INVALID');
      try { new RegExp(schema.pattern, 'u'); } catch { fail('ADAPTER_PROFILE_INVALID'); }
    }
    return;
  }
  if (schema.type === 'boolean') { exact(schema, ['type'], 'ADAPTER_PROFILE_INVALID'); return; }
  if (schema.type === 'integer') {
    exact(schema, ['type', 'min', 'max'], 'ADAPTER_PROFILE_INVALID');
    if (!Number.isSafeInteger(schema.min) || !Number.isSafeInteger(schema.max) || schema.min > schema.max) fail('ADAPTER_PROFILE_INVALID'); return;
  }
  fail('ADAPTER_PROFILE_INVALID');
}

async function boundedChild({ executable, argv, env, cwd, timeoutMs, stdoutBytes, stderrBytes }) {
  return new Promise((resolvePromise, rejectPromise) => {
    let child; try { child = spawn(executable, argv, { shell: false, detached: true, cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch { fail('CHILD_SPAWN_FAILED'); }
    const stdout = Buffer.alloc(stdoutBytes), stderr = Buffer.alloc(stderrBytes); let stdoutLength = 0, stderrLength = 0, settled = false, timer, abortError;
    const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} try { child.kill('SIGKILL'); } catch {} };
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (error) { stdout.fill(0); stderr.fill(0); rejectPromise(error); } else resolvePromise({ ...value, stdout, stderr, stdoutLength, stderrLength }); };
    const abort = (code) => { if (!abortError) { abortError = Object.assign(new Error(code), { code }); kill(); } };
    const append = (target, kind) => (chunk) => {
      if (abortError) return; const used = kind === 'stdout' ? stdoutLength : stderrLength;
      if (used + chunk.length > target.length) { abort('CHILD_OUTPUT_LIMIT'); return; }
      chunk.copy(target, used); if (kind === 'stdout') stdoutLength += chunk.length; else stderrLength += chunk.length;
    };
    child.stdout.on('data', append(stdout, 'stdout')); child.stderr.on('data', append(stderr, 'stderr'));
    child.on('error', () => finish(abortError ?? Object.assign(new Error('CHILD_SPAWN_FAILED'), { code: 'CHILD_SPAWN_FAILED' })));
    child.on('close', (code, signal) => abortError ? finish(abortError) : finish(null, { code, signal }));
    timer = setTimeout(() => abort('CHILD_TIMEOUT'), timeoutMs); timer.unref?.();
  });
}

function validateOperations(operations) {
  if (!plain(operations) || Object.keys(operations).length < 1) fail('ADAPTER_PROFILE_INVALID');
  for (const [operationId, operation] of Object.entries(operations)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/u.test(operationId)) fail('ADAPTER_PROFILE_INVALID');
    exact(operation, ['runtime', 'args', 'schema'], 'ADAPTER_PROFILE_INVALID');
    if (!['node_entrypoint', 'native_binary'].includes(operation.runtime) || !Array.isArray(operation.args) || operation.args.length > 64 || operation.args.some((x) => typeof x !== 'string' || x.length > 4096 || x.includes('\0'))) fail('ADAPTER_PROFILE_INVALID');
    validateOutputSchema(operation.schema);
  }
  return deepFreeze(operations);
}

export function createSanitizedProviderRuntime({ expectedProvider, expectedInvocationProfile, operations, descriptorFd = 3, ambientEnv = process.env, limits = {}, clock = () => new Date() } = {}) {
  assertCleanOuterEnvironment(ambientEnv); const profile = validateOperations(operations);
  const descriptor = readPinnedToolDescriptor({ fd: descriptorFd, expectedProvider, expectedInvocationProfile }); // closes FD 3 before home checks or spawn
  const homeState = resolveVerifiedHome(); const env = buildSanitizedChildEnvironment(homeState.home);
  const timeoutMs = limits.timeoutMs ?? 10_000, stdoutBytes = limits.stdoutBytes ?? 262_144, stderrBytes = limits.stderrBytes ?? 16_384;
  if (![timeoutMs, stdoutBytes, stderrBytes].every((x) => Number.isInteger(x) && x >= 1 && x <= 1_048_576)) fail('ADAPTER_LIMITS_INVALID');
  let closed = false, active = 0;
  const runOperation = async (operationId) => {
    if (closed || typeof operationId !== 'string' || !Object.hasOwn(profile, operationId)) fail('OPERATION_FORBIDDEN');
    const operation = profile[operationId]; let executable, argv;
    if (operation.runtime === 'node_entrypoint') { executable = descriptor.runtime.path; argv = [join(descriptor.bundleRoot, descriptor.entrypoint), ...operation.args]; }
    else { if (!descriptor.nativeBinary) fail('OPERATION_FORBIDDEN'); executable = join(descriptor.bundleRoot, descriptor.nativeBinary.path); argv = [...operation.args]; }
    const cwd = createPrivateCwd(homeState.effectiveUid); active += 1; let result;
    try {
      result = await boundedChild({ executable, argv, env, cwd, timeoutMs, stdoutBytes, stderrBytes });
      if (result.signal !== null || result.code !== 0) fail('CHILD_NONZERO'); if (result.stderrLength !== 0) fail('CHILD_STDERR_FORBIDDEN');
      const parsed = parseStrictJsonBytes(result.stdout.subarray(0, result.stdoutLength), { maxBytes: stdoutBytes }); return validateSchema(parsed, operation.schema);
    } finally {
      if (result) { result.stdout.fill(0); result.stderr.fill(0); }
      active -= 1; removePrivateCwd(cwd);
    }
  };
  return Object.freeze({
    runOperation,
    async runAccountChecked({ beforeOperation, observationOperations, afterOperation } = {}) {
      if (!Array.isArray(observationOperations) || observationOperations.length < 1) fail('OPERATION_FORBIDDEN');
      const before = await runOperation(beforeOperation); if (typeof before.accountId !== 'string') fail('ACCOUNT_IDENTITY_INVALID');
      const observations = []; for (const id of observationOperations) observations.push(await runOperation(id));
      const after = await runOperation(afterOperation); if (after.accountId !== before.accountId) fail('ACCOUNT_IDENTITY_CHANGED');
      return Object.freeze({ accountId: before.accountId, observations: Object.freeze(observations) });
    },
    assertObservationWindow({ issuedAt, observationDeadline } = {}) {
      const canonicalTime = (value) => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) fail('OBSERVATION_WINDOW_INVALID');
        const milliseconds = Date.parse(value); if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) fail('OBSERVATION_WINDOW_INVALID'); return milliseconds;
      };
      const issued = canonicalTime(issuedAt), deadline = canonicalTime(observationDeadline), observed = clock();
      if (!(observed instanceof Date) || !Number.isFinite(observed.getTime()) || issued > observed.getTime() || observed.getTime() > deadline) fail('OBSERVATION_WINDOW_INVALID'); return observed.toISOString();
    },
    close() {
      if (!closed) {
        if (active !== 0) fail('OPERATION_IN_PROGRESS'); closed = true;
        const after = homeSnapshot(homeState.home, homeState.effectiveUid); if (!snapshotsEqual(homeState, after)) fail('HOME_CHANGED');
      }
    },
  });
}

export async function writeSanitizedEnvelope(envelope, output = process.stdout) {
  if (!plain(envelope)) fail('ENVELOPE_INVALID'); const bytes = Buffer.from(`${canonicalProviderToolJson(envelope)}\n`, 'utf8');
  if (bytes.length > 1_048_576) { bytes.fill(0); fail('ENVELOPE_INVALID'); }
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      try { output.write(bytes, (error) => error ? rejectPromise(error) : resolvePromise()); } catch { rejectPromise(new Error('ENVELOPE_WRITE_FAILED')); }
    });
  } catch { fail('ENVELOPE_WRITE_FAILED'); } finally { bytes.fill(0); }
}

export async function runSanitizedAdapterMain(main) {
  try { if (typeof main !== 'function') fail('ADAPTER_MAIN_INVALID'); await main(); } catch { process.exitCode = 1; }
}
