import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { CHALLENGE_VERSION, LIVE_EVIDENCE_VERSION, POSTGRES_SQL_DIGEST, POSTGRES_SQL_QUERY_ID, liveCanonicalJson } from './provider-provenance-live-core.mjs';
import { KEYRING_VERSION, OPERATION_PLANS_VERSION } from './provider-provenance-live-collector-core.mjs';

const CLI = resolve(dirname(new URL(import.meta.url).pathname), 'provider-provenance-live.mjs');
const CANARY = 'TICKET274_SECRET_CANARY_DO_NOT_DISCLOSE';
const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const hex = (character) => `sha256:${character.repeat(64)}`;
const source = (character) => character.repeat(40);
const delay = (milliseconds) => new Promise((accept) => setTimeout(accept, milliseconds));

function runCli(args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: options.cwd,
      env: { ...process.env, PATH: options.path ?? process.env.PATH, TICKET274_SECRET: CANARY, WORDLE_PROVIDER_TEST_SEAM: CANARY },
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = []; const stderr = []; let settled = false;
    const timeoutMs = options.testTimeoutMs ?? 20_000;
    const timer = setTimeout(() => {
      if (settled) return; settled = true;
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { child.kill('SIGKILL'); }
      reject(new Error(`shipped CLI exceeded ${timeoutMs}ms test watchdog`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk)); child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
    child.on('close', (code, signal) => { clearTimeout(timer); if (!settled) { settled = true; accept({ code, signal, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }); } });
  });
}
function response(result) { return JSON.parse((result.code === 0 ? result.stdout : result.stderr).trim()); }
function assertSecretFree(value) { assert.equal(String(value).includes(CANARY), false); }

function makeChallenge(runId, now = Date.now()) {
  const expectedIdentities = {}; const expectedArtifacts = {}; const postgresqlSubjects = {}; const operations = [];
  for (const environment of ['preview', 'production']) {
    const short = environment === 'preview' ? 'pre' : 'prod';
    expectedIdentities[environment] = {
      vercel: { projectId: `vercel-project-${short}`, environmentId: `vercel-env-${short}`, deploymentId: `vercel-deployment-${short}` },
      railway: { projectId: `railway-project-${short}`, environmentId: `railway-env-${short}`, serviceId: `railway-service-${short}`, deploymentId: `railway-deployment-${short}` },
      postgresql: { projectId: `pg-project-${short}`, environmentId: `pg-env-${short}`, serviceId: `pg-service-${short}`, deploymentId: `pg-deployment-${short}` },
    };
    expectedArtifacts[environment] = {
      vercel: { deploymentId: `vercel-deployment-${short}`, sourceGitSha: source(short === 'pre' ? 'a' : 'b'), artifactDigest: hex(short === 'pre' ? '1' : '2') },
      railway: { deploymentId: `railway-deployment-${short}`, sourceGitSha: source(short === 'pre' ? 'c' : 'd'), artifactDigest: hex(short === 'pre' ? '3' : '4') },
    };
    postgresqlSubjects[environment] = { ...expectedIdentities[environment].postgresql, clusterId: `pg-cluster-${short}`, databaseId: `pg-database-${short}`, databaseName: `wordle_${short}`, schemaName: 'public', schemaDigest: hex(short === 'pre' ? '5' : '6'), endpointId: `pg-endpoint-${short}`, connectionMode: 'direct' };
    for (const [provider, methods] of Object.entries({ vercel: ['vercel-control-plane'], railway: ['railway-control-plane'], postgresql: ['railway-control-plane', 'postgres-direct-sql'] })) {
      for (const method of methods) operations.push({ operationId: `op:${environment}:${provider}:${method}`, environment, provider, method, targetHost: provider === 'vercel' ? 'api.vercel.com' : method === 'postgres-direct-sql' ? `direct-${short}.railway.internal` : 'backboard.railway.app' });
    }
  }
  return {
    schemaVersion: CHALLENGE_VERSION, challengeId: `challenge-${runId}`, runId, nonce: `nonce-${runId}`, collectorKeyId: `collector-${runId}`,
    issuedAt: new Date(now - 15_000).toISOString(), expiresAt: new Date(now + 240_000).toISOString(),
    expectedIdentities, expectedArtifacts, postgresqlSubjects, operations,
  };
}
function fieldProvenance(method) {
  const fields = ['projectId', 'environmentId', 'serviceId', 'deploymentId', 'clusterId', 'databaseId', 'databaseName', 'schemaName', 'schemaDigest', 'endpointId', 'connectionMode'];
  return Object.fromEntries(fields.map((field) => [field, method === 'railway-control-plane' ? (['schemaName', 'schemaDigest'].includes(field) ? 'challenge' : method) : (['databaseName', 'schemaName', 'schemaDigest'].includes(field) ? method : field === 'connectionMode' ? 'connection-configuration' : 'challenge')]));
}
function outputsFor(challenge) {
  const outputs = {};
  for (const operation of challenge.operations) {
    const environment = operation.environment;
    if (operation.provider !== 'postgresql') outputs[operation.operationId] = {
      identity: challenge.expectedIdentities[environment][operation.provider], artifact: challenge.expectedArtifacts[environment][operation.provider],
      variables: [{ name: operation.provider === 'vercel' ? 'APP_ENV' : 'DATABASE_URL', required: true, state: 'non-empty' }],
    };
    else {
      const subject = challenge.postgresqlSubjects[environment];
      outputs[operation.operationId] = {
        identity: challenge.expectedIdentities[environment].postgresql, variables: [{ name: 'DATABASE_URL', required: true, state: 'non-empty' }],
        observation: {
          observationId: `observation-${environment}-${operation.method}`, physicalNodeId: `one-honest-node-${environment}`, subject,
          fieldProvenance: fieldProvenance(operation.method),
          facts: operation.method === 'railway-control-plane' ? { endpointClassification: 'direct' } : {
            endpointClassification: 'direct', queryId: POSTGRES_SQL_QUERY_ID, queryDigest: POSTGRES_SQL_DIGEST,
            databaseName: subject.databaseName, schemaName: subject.schemaName, schemaDigest: subject.schemaDigest,
            serverAddressDigest: hex(environment === 'preview' ? '7' : '8'), serverPort: 5432, isInRecovery: false,
          },
        },
      };
    }
  }
  return outputs;
}
function adapterSource({ outputs, version, log, behavior = {} }) {
  return `#!${process.execPath}\n` +
    `import { appendFileSync, writeFileSync } from 'node:fs'; import { spawn } from 'node:child_process';\n` +
    `const version=${JSON.stringify(version)}, outputs=${JSON.stringify(outputs)}, log=${JSON.stringify(log)}, behavior=${JSON.stringify(behavior)};\n` +
    `if(process.argv[2]==='--version'){process.stdout.write(version+'\\n');process.exit(0)}\n` +
    `const argv=process.argv.slice(2), id=argv[argv.indexOf('--operation-id')+1]; appendFileSync(log,JSON.stringify({argv,env:process.env})+'\\n',{mode:384});\n` +
    `if(id===behavior.fail){process.stderr.write('${CANARY}');process.exit(17)}\n` +
    `if(id===behavior.timeout){spawn(process.execPath,['-e',${JSON.stringify("setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],'descendant-survived'),600)")},behavior.marker]);setInterval(()=>{},1000)}\n` +
    `if(id===behavior.stdoutOverflow){process.stdout.write('x'.repeat(200000));process.exit(0)}\n` +
    `if(id===behavior.stderrOverflow){process.stderr.write('${CANARY}'.repeat(10000));setInterval(()=>{},1000)}\n` +
    `if(id===behavior.malformed){process.stdout.write(behavior.raw);process.exit(0)}\n` +
    `process.stderr.write('${CANARY}'); process.stdout.write(JSON.stringify(outputs[id]));\n`;
}

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ticket274-')); await chmod(root, 0o700);
  const protectedRoot = join(root, `protected;${CANARY}`); const bin = join(root, 'controlled-bin'); const output = join(root, 'output'); const replay = join(root, 'replay'); const pathBin = join(root, 'hostile-path');
  await Promise.all([protectedRoot, bin, output, replay, pathBin].map((path) => mkdir(path, { mode: 0o700 })));
  const runId = options.runId ?? `run-ticket274-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const challenge = makeChallenge(runId); const outputs = structuredClone(outputsFor(challenge)); options.mutateOutputs?.(outputs, challenge);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const policy = { expectedChallengeId: challenge.challengeId, expectedRunId: challenge.runId, expectedNonce: challenge.nonce, expectedCollectorKeyId: challenge.collectorKeyId };
  const keyring = { schemaVersion: KEYRING_VERSION, keys: [{ keyId: challenge.collectorKeyId, publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(), notBefore: new Date(Date.now() - 60_000).toISOString(), notAfter: new Date(Date.now() + 600_000).toISOString(), revokedAt: null }] };
  const log = join(root, 'adapter-argv.jsonl'); const marker = join(root, 'descendant-marker'); const version = 'wordle-controlled-provider 3.0.0';
  const executables = {};
  for (const name of ['vercel', 'railway', 'postgresql']) {
    const path = join(bin, `${name}-provider`); const bytes = Buffer.from(adapterSource({ outputs, version, log, behavior: { ...options.behavior, marker } }));
    await writeFile(path, bytes, { mode: 0o500 }); await chmod(path, 0o500);
    executables[name] = { path, realpath: path, sha256: sha(bytes), version, uid: process.getuid(), mode: 0o500 };
  }
  const plans = { schemaVersion: OPERATION_PLANS_VERSION, executables, limits: { timeoutMs: options.timeoutMs ?? 1000, versionTimeoutMs: 500, stdoutBytes: options.stdoutBytes ?? 65536, stderrBytes: options.stderrBytes ?? 1024 } };
  const files = { challenge: join(protectedRoot, 'challenge.json'), policy: join(protectedRoot, 'policy.json'), plans: join(protectedRoot, 'plans.json'), key: join(protectedRoot, `signing-${CANARY}.pem`), keyring: join(protectedRoot, 'keyring.json') };
  async function protectedWrite(path, value) { await writeFile(path, typeof value === 'string' || Buffer.isBuffer(value) ? value : `${JSON.stringify(value)}\n`, { mode: 0o600 }); await chmod(path, 0o600); }
  await Promise.all([protectedWrite(files.challenge, challenge), protectedWrite(files.policy, policy), protectedWrite(files.plans, plans), protectedWrite(files.key, privateKey.export({ format: 'pem', type: 'pkcs8' })), protectedWrite(files.keyring, keyring)]);
  await writeFile(join(pathBin, 'vercel-provider'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(join(root, 'path-substitution'))},'bad')`, { mode: 0o700 });
  const collectArgs = ['collect', '--challenge', files.challenge, '--policy', files.policy, '--plans', files.plans, '--signing-key', files.key, '--output-dir', output];
  const verifyArgs = ['verify', '--output-dir', output, '--run-id', runId, '--policy', files.policy, '--keyring', files.keyring, '--replay-dir', replay];
  return { root, protectedRoot, bin, output, replay, pathBin, challenge, policy, plans, keyring, files, log, marker, runId, collectArgs, verifyArgs, protectedWrite, cleanup: () => rm(root, { recursive: true, force: true }) };
}
async function collectFailure(setup, expectedCode) {
  const result = await runCli(setup.collectArgs, { path: setup.pathBin }); assert.equal(result.code, 1); assert.equal(response(result).code, expectedCode); assertSecretFree(result.stdout + result.stderr);
  assert.equal((await readdir(setup.output)).some((name) => name.endsWith('.commit.json')), false); return result;
}

async function honestRoundTrip(setup) {
  const collected = await runCli(setup.collectArgs, { path: setup.pathBin }); assert.equal(collected.code, 0, collected.stderr); assert.deepEqual(response(collected), { ok: true, command: 'collect', runId: setup.runId, commitManifest: join(setup.output, `${setup.runId}.commit.json`) });
  const files = (await readdir(setup.output)).sort(); assert.deepEqual(files, ['challenge', 'commit', 'evidence', 'inventory', 'receipt'].map((part) => `${setup.runId}.${part}.json`).sort());
  for (const name of files) assert.equal((await stat(join(setup.output, name))).mode & 0o777, 0o600);
  const inventory = JSON.parse(await readFile(join(setup.output, `${setup.runId}.inventory.json`), 'utf8')); const receipt = JSON.parse(await readFile(join(setup.output, `${setup.runId}.receipt.json`), 'utf8'));
  assert.equal(inventory.schemaVersion, 'wordle-provider-inventory/v3'); assert.equal(receipt.schemaVersion, 'wordle-provider-receipt/v3');
  for (const environment of ['preview', 'production']) {
    const observations = inventory.environments[environment].postgresql.observations;
    assert.deepEqual(observations.map((entry) => entry.method).sort(), ['postgres-direct-sql', 'railway-control-plane']);
    assert.equal(new Set(observations.map((entry) => entry.physicalNodeId)).size, 1);
  }
  const verified = await runCli(setup.verifyArgs); assert.equal(verified.code, 0, verified.stderr); assert.equal(response(verified).replayConsumed, true);
  const replay = await runCli(setup.verifyArgs); assert.equal(replay.code, 1); assert.equal(response(replay).code, 'CHALLENGE_REPLAY');
  const published = await Promise.all(files.map((name) => readFile(join(setup.output, name), 'utf8'))); assertSecretFree(collected.stdout + collected.stderr + verified.stdout + verified.stderr + replay.stdout + replay.stderr + published.join(''));
}

test('shipped CLI performs collect -> Ed25519 sign -> commit-last flat bundle -> v3 verify/receipt/inventory -> replay consume', async () => {
  const setup = await fixture(); try {
    await honestRoundTrip(setup);
    const calls = (await readFile(setup.log, 'utf8')).trim().split('\n').map(JSON.parse); assert.equal(calls.length, 8);
    assert.equal(calls.every(({ env }) => Object.keys(env).sort().join('|') === 'LANG|LC_ALL|PATH' && env.PATH === '/usr/bin:/bin'), true);
    assert.equal(calls.every(({ argv }) => argv[0] === 'collect' && argv.includes('--format') && argv.includes(LIVE_EVIDENCE_VERSION)), true);
    assert.equal(calls.filter(({ argv }) => argv.includes('--query-id')).length, 2); assert.equal(await lstat(setup.output).then((entry) => entry.mode & 0o777), 0o700);
    await assert.rejects(readFile(join(setup.root, 'path-substitution')));
  } finally { await setup.cleanup(); }
});

test('absolute pinned executable rejects wrong digest, mutation, symlink, permissive mode, version and ignores hostile PATH', async (t) => {
  for (const [name, mutate, code] of [
    ['wrong digest', (s) => { s.plans.executables.vercel.sha256 = hex('f'); }, 'EXECUTABLE_DIGEST_MISMATCH'],
    ['mutated bytes', async (s) => { await chmod(s.plans.executables.vercel.path, 0o700); await writeFile(s.plans.executables.vercel.path, '\n', { flag: 'a' }); await chmod(s.plans.executables.vercel.path, 0o500); }, 'EXECUTABLE_DIGEST_MISMATCH'],
    ['wrong realpath', (s) => { s.plans.executables.vercel.realpath = `${s.plans.executables.vercel.path}.substituted`; }, 'EXECUTABLE_POLICY_MISMATCH'],
    ['wrong owner', (s) => { s.plans.executables.vercel.uid += 1; }, 'EXECUTABLE_POLICY_MISMATCH'],
    ['symlink', async (s) => { const original = s.plans.executables.vercel.path; const moved = `${original}.real`; await import('node:fs/promises').then(({ rename }) => rename(original, moved)); await symlink(moved, original); }, 'EXECUTABLE_NOT_REGULAR'],
    ['directory substitution', async (s) => { await rm(s.plans.executables.vercel.path); await mkdir(s.plans.executables.vercel.path, { mode: 0o500 }); }, 'EXECUTABLE_NOT_REGULAR'],
    ['permissive mode', async (s) => chmod(s.plans.executables.vercel.path, 0o522), 'EXECUTABLE_POLICY_MISMATCH'],
    ['unsupported version', (s) => { s.plans.executables.vercel.version = 'unsupported 99'; }, 'EXECUTABLE_VERSION_MISMATCH'],
  ]) await t.test(name, async () => { const setup = await fixture(); try { await mutate(setup); await setup.protectedWrite(setup.files.plans, setup.plans); await collectFailure(setup, code); } finally { await setup.cleanup(); } });
});

test('fixed shell-free argv remains literal and cannot trigger metacharacter path side effects', async () => {
  const setup = await fixture(); try {
    await honestRoundTrip(setup); const calls = (await readFile(setup.log, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.every(({ argv }) => argv.some((value) => value.startsWith('op:'))), true);
    assert.equal((await readdir(setup.protectedRoot)).some((name) => name.startsWith('challenge')), true);
    await assert.rejects(readFile(join(setup.root, 'touch')));
  } finally { await setup.cleanup(); }
});

test('shell metacharacters in operation data are rejected before any executable is invoked', async () => {
  const setup = await fixture(); try {
    setup.challenge.operations[0].operationId = 'op:preview:vercel;touch';
    await setup.protectedWrite(setup.files.challenge, setup.challenge);
    await collectFailure(setup, 'INVALID_ID');
    await assert.rejects(readFile(setup.log));
    await assert.rejects(readFile(join(setup.root, 'touch')));
  } finally { await setup.cleanup(); }
});

test('mixed, stale, substituted run/challenge/policy and unsupported/fixture schemas fail before publication', async (t) => {
  for (const [name, change, code] of [
    ['run id', (s) => { s.challenge.runId = 'run-substituted-ticket274'; }, 'PROTECTED_CHALLENGE_MISMATCH'],
    ['nonce', (s) => { s.challenge.nonce = 'nonce-substituted-ticket274'; }, 'PROTECTED_CHALLENGE_MISMATCH'],
    ['stale', (s) => { s.challenge.issuedAt = new Date(Date.now() - 300000).toISOString(); s.challenge.expiresAt = new Date(Date.now() - 60000).toISOString(); }, 'EXPIRED_CHALLENGE'],
    ['unsupported', (s) => { s.challenge.schemaVersion = 'wordle-provider-challenge/v99'; }, 'UNSUPPORTED_CHALLENGE'],
    ['fixture/live separation', (s) => { s.challenge.schemaVersion = 'wordle-provider-inventory/v2'; }, 'UNSUPPORTED_CHALLENGE'],
    ['policy substitution', (s) => { s.policy.expectedCollectorKeyId = 'collector-attacker-ticket274'; }, 'PROTECTED_CHALLENGE_MISMATCH'],
  ]) await t.test(name, async () => { const setup = await fixture(); try { await change(setup); await setup.protectedWrite(setup.files.challenge, setup.challenge); await setup.protectedWrite(setup.files.policy, setup.policy); await collectFailure(setup, code); } finally { await setup.cleanup(); } });
});

test('partial operation failure, timeout with descendant kill, and independent stdout/stderr overflow publish no commit', async (t) => {
  const probe = async (name, options, expectedCode, after) => t.test(name, async () => { const setup = await fixture(options); try { await collectFailure(setup, expectedCode); await after?.(setup); } finally { await setup.cleanup(); } });
  await probe('partial failure', { behavior: { fail: 'op:preview:railway:railway-control-plane' } }, 'OPERATION_FAILED');
  await probe('stdout independently bounded', { behavior: { stdoutOverflow: 'op:preview:vercel:vercel-control-plane' }, stdoutBytes: 256 }, 'STDOUT_LIMIT');
  await probe('stderr independently bounded and redacted', { behavior: { stderrOverflow: 'op:preview:vercel:vercel-control-plane' }, stderrBytes: 64 }, 'STDERR_LIMIT');
  await probe('timeout kills descendant process group', { behavior: { timeout: 'op:preview:vercel:vercel-control-plane' }, timeoutMs: 100 }, 'PROCESS_TIMEOUT', async (setup) => { await delay(900); await assert.rejects(readFile(setup.marker)); });
});

test('malformed, duplicate-key, deep, trailing and oversized adapter JSON fail closed without raw output', async (t) => {
  const deep = `${'['.repeat(33)}0${']'.repeat(33)}`;
  for (const [name, raw, code] of [['malformed', '{', 'ADAPTER_OUTPUT_JSON'], ['duplicate', '{"identity":{},"identity":{}}', 'DUPLICATE_JSON_KEY'], ['deep', deep, 'JSON_DEPTH'], ['trailing', '{} trailing', 'ADAPTER_OUTPUT_JSON']]) {
    await t.test(name, async () => { const setup = await fixture({ behavior: { malformed: 'op:preview:vercel:vercel-control-plane', raw } }); try { await collectFailure(setup, code); } finally { await setup.cleanup(); } });
  }
  await t.test('oversized', async () => { const setup = await fixture({ behavior: { stdoutOverflow: 'op:preview:vercel:vercel-control-plane' }, stdoutBytes: 256 }); try { await collectFailure(setup, 'STDOUT_LIMIT'); } finally { await setup.cleanup(); } });
});

test('protected challenge/policy/plans/key/keyring and 0700 roots reject modes and symlinks; rotation/revocation fail verify', async (t) => {
  for (const [name, target, mutate, command, code] of [
    ['permissive challenge', 'challenge', (path) => chmod(path, 0o640), 'collect', 'PROTECTED_FILE_POLICY'],
    ['symlink signing key', 'key', async (path) => { const real = `${path}.real`; await writeFile(real, await readFile(path), { mode: 0o600 }); await rm(path); await symlink(real, path); }, 'collect', 'PROTECTED_FILE_POLICY'],
    ['permissive output root', 'output', (path) => chmod(path, 0o755), 'collect', 'OUTPUT_DIRECTORY_POLICY'],
  ]) await t.test(name, async () => { const setup = await fixture(); try { await mutate(target === 'output' ? setup.output : setup.files[target]); await collectFailure(setup, code); } finally { await setup.cleanup(); } });
  for (const [name, target] of [['permissive keyring', 'keyring'], ['permissive verify policy', 'policy']]) await t.test(name, async () => {
    const setup = await fixture(); try {
      const collected = await runCli(setup.collectArgs); assert.equal(collected.code, 0, collected.stderr);
      await chmod(setup.files[target], 0o640);
      const result = await runCli(setup.verifyArgs); assert.equal(result.code, 1); assert.equal(response(result).code, 'PROTECTED_FILE_POLICY'); assertSecretFree(result.stderr);
    } finally { await setup.cleanup(); }
  });
  await t.test('permissive replay root', async () => {
    const setup = await fixture(); try {
      const collected = await runCli(setup.collectArgs); assert.equal(collected.code, 0, collected.stderr); await chmod(setup.replay, 0o755);
      const result = await runCli(setup.verifyArgs); assert.equal(result.code, 1); assert.equal(response(result).code, 'OUTPUT_DIRECTORY_POLICY'); assertSecretFree(result.stderr);
    } finally { await setup.cleanup(); }
  });
  for (const [name, change, code] of [
    ['revoked key', (s) => { s.keyring.keys[0].revokedAt = new Date().toISOString(); }, 'COLLECTOR_KEY_INACTIVE'],
    ['rotated unapproved key', (s) => { s.keyring.keys[0].keyId = 'collector-rotated-ticket274'; }, 'COLLECTOR_KEY_NOT_APPROVED'],
    ['duplicate key id', (s) => { s.keyring.keys.push(structuredClone(s.keyring.keys[0])); }, 'COLLECTOR_KEY_NOT_APPROVED'],
  ]) await t.test(name, async () => { const setup = await fixture(); try { const collected = await runCli(setup.collectArgs); assert.equal(collected.code, 0); change(setup); await setup.protectedWrite(setup.files.keyring, setup.keyring); const result = await runCli(setup.verifyArgs); assert.equal(result.code, 1); assert.equal(response(result).code, code); assertSecretFree(result.stderr); } finally { await setup.cleanup(); } });
});

test('commit-last publication rejects partials, extras, occupied names and concurrent publishers', async (t) => {
  await t.test('occupied canonical name leaves no commit', async () => { const setup = await fixture(); try { await writeFile(join(setup.output, `${setup.runId}.inventory.json`), 'occupied\n', { mode: 0o600 }); await collectFailure(setup, 'BUNDLE_ALREADY_COMMITTED'); assert.equal(await readFile(join(setup.output, `${setup.runId}.inventory.json`), 'utf8'), 'occupied\n'); } finally { await setup.cleanup(); } });
  await t.test('partial and extra flat publications cannot verify', async () => { const setup = await fixture(); try { await writeFile(join(setup.output, `${setup.runId}.challenge.json`), '{}\n', { mode: 0o600 }); let result = await runCli(setup.verifyArgs); assert.equal(result.code, 1); assert.equal(response(result).code, 'BUNDLE_MANIFEST_MISMATCH'); await writeFile(join(setup.output, `${setup.runId}.extra.json`), '{}\n', { mode: 0o600 }); result = await runCli(setup.verifyArgs); assert.equal(result.code, 1); assert.equal(response(result).code, 'BUNDLE_MANIFEST_MISMATCH'); } finally { await setup.cleanup(); } });
  await t.test('concurrent collectors produce exactly one committed run', async () => { const setup = await fixture(); try { const results = await Promise.all([runCli(setup.collectArgs), runCli(setup.collectArgs)]); assert.deepEqual(results.map((entry) => entry.code).sort(), [0, 1]); assert.equal((await readdir(setup.output)).filter((name) => name.endsWith('.commit.json')).length, 1); const verified = await runCli(setup.verifyArgs); assert.equal(verified.code, 0, verified.stderr); } finally { await setup.cleanup(); } });
});

test('one-node PostgreSQL hostile method/scope/schema/pooler and duplicate observation negatives fail through CLI', async (t) => {
  for (const [name, mutate, code] of [
    ['duplicate observation id', (outputs) => { outputs['op:preview:postgresql:postgres-direct-sql'].observation.observationId = outputs['op:preview:postgresql:railway-control-plane'].observation.observationId; }, 'DUPLICATE_OBSERVATION_ID'],
    ['method identity disagreement', (outputs) => { outputs['op:preview:postgresql:postgres-direct-sql'].identity = { ...outputs['op:preview:postgresql:postgres-direct-sql'].identity, deploymentId: 'different-deployment' }; }, 'POSTGRES_METHOD_DISAGREEMENT'],
    ['scope disagreement', (outputs) => { outputs['op:preview:postgresql:postgres-direct-sql'].observation.subject.endpointId = 'other-endpoint-ticket274'; }, 'POSTGRES_SCOPE_MISMATCH'],
    ['schema disagreement', (outputs) => { outputs['op:preview:postgresql:postgres-direct-sql'].observation.facts.schemaName = 'other_schema'; }, 'SQL_SCHEMA_PROOF_MISMATCH'],
    ['pooler forbidden', (outputs) => { outputs['op:preview:postgresql:railway-control-plane'].observation.facts.endpointClassification = 'pooler'; }, 'POSTGRES_POOLER_FORBIDDEN'],
    ['SQL digest mismatch', (outputs) => { outputs['op:preview:postgresql:postgres-direct-sql'].observation.facts.queryDigest = hex('9'); }, 'SQL_CONTRACT_MISMATCH'],
  ]) await t.test(name, async () => { const setup = await fixture({ mutateOutputs: mutate }); try { await collectFailure(setup, code); } finally { await setup.cleanup(); } });
});

test('production CLI rejects fixture/test seams and proves transport isolation: collector has no HTTP adapter', async () => {
  const setup = await fixture(); try {
    const extraFlag = await runCli([...setup.collectArgs, '--test-adapter', setup.bin]); assert.equal(extraFlag.code, 1); assert.equal(response(extraFlag).code, 'INVALID_ARGUMENTS');
    setup.plans.testRunner = CANARY; await setup.protectedWrite(setup.files.plans, setup.plans); await collectFailure(setup, 'UNKNOWN_FIELD');
    const source = await readFile(resolve(dirname(CLI), 'provider-provenance-live-collector-core.mjs'), 'utf8');
    assert.equal(/\bfetch\s*\(|node:https|node:http|https:\/\//u.test(source), false);
    assertSecretFree(extraFlag.stdout + extraFlag.stderr);
  } finally { await setup.cleanup(); }
});
