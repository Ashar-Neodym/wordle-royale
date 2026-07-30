import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, renameSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  KEYRING_VERSION, OPERATION_PLANS_VERSION, collectLiveBundle, commitLiveBundle,
  createReplayGuard, createSecureChildRunner, loadCommittedBundle, resolveCollectorKey, spawnBounded,
  parseStrictJson, readProtectedFile, validateOperationPlans, verifyAndConsumeLiveBundle, verifyCommittedLiveBundle,
} from './provider-provenance-live-collector-core.mjs';
import { CHALLENGE_VERSION, POSTGRES_SQL_DIGEST, POSTGRES_SQL_QUERY_ID, liveCanonicalJson, liveSha256 } from './provider-provenance-live-core.mjs';

const NOW = Date.parse('2026-07-30T12:01:00.000Z');
const hex = (c) => `sha256:${c.repeat(64)}`; const source = (c) => c.repeat(40);
const policy = { expectedChallengeId: 'challenge-ticket-273', expectedRunId: 'run-ticket-273', expectedNonce: 'nonce-ticket-273', expectedCollectorKeyId: 'collector-ticket-273' };
const publicationComponents = ['challenge', 'evidence', 'inventory', 'receipt', 'commit'];
async function assertRunCannotVerify(output, runId = policy.expectedRunId) {
  await assert.rejects(() => loadCommittedBundle(output, runId));
}
function challenge() {
  const expectedIdentities = {}; const expectedArtifacts = {}; const postgresqlSubjects = {}; const operations = [];
  for (const env of ['preview', 'production']) {
    const short = env === 'preview' ? 'pre' : 'prod';
    expectedIdentities[env] = {
      vercel: { projectId: `vercel-project-${short}`, environmentId: `vercel-env-${short}`, deploymentId: `vercel-deployment-${short}` },
      railway: { projectId: `railway-project-${short}`, environmentId: `railway-env-${short}`, serviceId: `railway-service-${short}`, deploymentId: `railway-deployment-${short}` },
      postgresql: { projectId: `pg-project-${short}`, environmentId: `pg-env-${short}`, serviceId: `pg-service-${short}`, deploymentId: `pg-deployment-${short}` },
    };
    expectedArtifacts[env] = {
      vercel: { deploymentId: `vercel-deployment-${short}`, sourceGitSha: source(short === 'pre' ? 'a' : 'b'), artifactDigest: hex(short === 'pre' ? '1' : '2') },
      railway: { deploymentId: `railway-deployment-${short}`, sourceGitSha: source(short === 'pre' ? 'a' : 'b'), artifactDigest: hex(short === 'pre' ? '3' : '4') },
    };
    postgresqlSubjects[env] = { ...expectedIdentities[env].postgresql, clusterId: `pg-cluster-${short}`, databaseId: `pg-database-${short}`, databaseName: `wordle_${short}`, schemaName: 'public', schemaDigest: hex(short === 'pre' ? '5' : '6'), endpointId: `pg-endpoint-${short}`, connectionMode: 'direct' };
    for (const [provider, methods] of Object.entries({ vercel: ['vercel-control-plane'], railway: ['railway-control-plane'], postgresql: ['railway-control-plane', 'postgres-direct-sql'] })) for (const method of methods) operations.push({ operationId: `op-${env}-${provider}-${method}`, environment: env, provider, method, targetHost: provider === 'vercel' ? 'api.vercel.com' : method === 'postgres-direct-sql' ? `direct-${short}.railway.internal` : 'backboard.railway.app' });
  }
  return { schemaVersion: CHALLENGE_VERSION, challengeId: policy.expectedChallengeId, runId: policy.expectedRunId, nonce: policy.expectedNonce, issuedAt: '2026-07-30T12:00:00.000Z', expiresAt: '2026-07-30T12:05:00.000Z', collectorKeyId: policy.expectedCollectorKeyId, expectedIdentities, expectedArtifacts, postgresqlSubjects, operations };
}
const variables = [{ name: 'DATABASE_URL', required: true, state: 'non-empty' }];
const fp = (method) => Object.fromEntries(['projectId', 'environmentId', 'serviceId', 'deploymentId', 'clusterId', 'databaseId', 'databaseName', 'schemaName', 'schemaDigest', 'endpointId', 'connectionMode'].map((field) => [field, method === 'railway-control-plane' ? (['schemaName', 'schemaDigest'].includes(field) ? 'challenge' : method) : (['databaseName', 'schemaName', 'schemaDigest'].includes(field) ? method : field === 'connectionMode' ? 'connection-configuration' : 'challenge')]));
function adapterOutput(c, operation) {
  const env = operation.environment;
  if (operation.provider === 'vercel' || operation.provider === 'railway') return { identity: c.expectedIdentities[env][operation.provider], artifact: c.expectedArtifacts[env][operation.provider], variables: operation.provider === 'vercel' ? [{ name: 'APP_ENV', required: true, state: 'non-empty' }] : variables };
  const subject = c.postgresqlSubjects[env]; const facts = operation.method === 'railway-control-plane' ? { endpointClassification: 'direct' } : { endpointClassification: 'direct', queryId: POSTGRES_SQL_QUERY_ID, queryDigest: POSTGRES_SQL_DIGEST, databaseName: subject.databaseName, schemaName: subject.schemaName, schemaDigest: subject.schemaDigest, serverAddressDigest: hex(env === 'preview' ? '7' : '8'), serverPort: 5432, isInRecovery: false };
  return { identity: c.expectedIdentities[env].postgresql, variables, observation: { observationId: `observation-${env}-${operation.method}`, physicalNodeId: `node-${env}`, subject, fieldProvenance: fp(operation.method), facts } };
}
function plans() {
  const executable = (name) => ({ path: `/opt/wordle/bin/${name}`, realpath: `/opt/wordle/bin/${name}`, sha256: hex('a'), version: `${name} 1.0.0`, uid: process.getuid(), mode: 0o500 });
  return { schemaVersion: OPERATION_PLANS_VERSION, executables: { vercel: executable('vercel-adapter'), railway: executable('railway-adapter'), postgresql: executable('postgres-adapter') }, limits: { timeoutMs: 1000, versionTimeoutMs: 500, stdoutBytes: 65536, stderrBytes: 1024 } };
}
function fakeRunner(c, mutate) {
  const calls = [];
  return { calls, async run(spec) { calls.push(structuredClone(spec)); const operationId = spec.argv[spec.argv.indexOf('--operation-id') + 1]; const operation = c.operations.find((entry) => entry.operationId === operationId); let value = adapterOutput(c, operation); if (mutate) value = mutate(value, operation, calls.length) ?? value; return { exitCode: 0, stdout: Buffer.from(JSON.stringify(value)), stderr: Buffer.alloc(0) }; } };
}
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const keyring = (overrides = {}) => ({ schemaVersion: KEYRING_VERSION, keys: [{ keyId: policy.expectedCollectorKeyId, publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(), notBefore: '2026-07-30T00:00:00.000Z', notAfter: '2026-07-31T00:00:00.000Z', revokedAt: null, ...overrides }] });
const collect = (runner = fakeRunner(challenge())) => { const c = challenge(); return collectLiveBundle({ challenge: c, policy, plans: plans(), signingKey: privateKey, childRunner: runner, clock: () => NOW }); };

test('collector executes exactly eight fixed shell-free adapter plans and emits an asymmetric v3 bundle', async () => {
  const c = challenge(); const runner = fakeRunner(c); const bundle = await collectLiveBundle({ challenge: c, policy, plans: plans(), signingKey: privateKey, childRunner: runner, clock: () => NOW });
  assert.equal(runner.calls.length, 8); assert.equal(bundle.inventory.schemaVersion, 'wordle-provider-inventory/v3'); assert.equal(bundle.receipt.schemaVersion, 'wordle-provider-receipt/v3');
  for (const [index, call] of runner.calls.entries()) {
    assert.deepEqual(Object.keys(call).sort(), ['argv', 'executable', 'limits']); assert.equal(call.argv[0], 'collect'); assert.equal(call.argv.includes(c.operations[index].operationId), true);
    if (c.operations[index].method === 'postgres-direct-sql') assert.deepEqual(call.argv.slice(-6), ['--query-id', POSTGRES_SQL_QUERY_ID, '--query-digest', POSTGRES_SQL_DIGEST, '--transaction', 'read-only']);
  }
  assert.equal(verifyCommittedLiveBundle({ bundle, keyring: keyring(), policy, clock: () => NOW }).inventory.runId, c.runId);
});

test('raw responses are represented only by byte digests and unknown/raw credential fields fail closed', async () => {
  const c = challenge(); const canary = 'TOKEN_SHOULD_NEVER_BE_PUBLISHED'; const runner = fakeRunner(c, (value, _operation, count) => count === 1 ? { ...value, token: canary } : value);
  await assert.rejects(() => collectLiveBundle({ challenge: c, policy, plans: plans(), signingKey: privateKey, childRunner: runner, clock: () => NOW }), (error) => error.code === 'UNKNOWN_FIELD');
  const bundle = await collect(); assert.equal(liveCanonicalJson(bundle).includes(canary), false);
  const first = bundle.evidence.environments.preview.vercel.provenance.evidenceDigest; assert.match(first, /^sha256:[a-f0-9]{64}$/u);
});

test('partial child failure, oversized output and PostgreSQL method disagreement return no usable bundle', async () => {
  const c = challenge(); let calls = 0;
  await assert.rejects(() => collectLiveBundle({ challenge: c, policy, plans: plans(), signingKey: privateKey, clock: () => NOW, childRunner: { async run() { calls += 1; if (calls === 4) { const error = new Error('secret stderr'); error.code = 'PROCESS_TIMEOUT'; throw error; } return fakeRunner(c).run({ argv: ['collect', '--operation-id', c.operations[calls - 1].operationId], executable: {}, limits: {} }); } } }), (error) => error.code === 'PROCESS_TIMEOUT');
  await assert.rejects(() => collectLiveBundle({ challenge: c, policy, plans: plans(), signingKey: privateKey, clock: () => NOW, childRunner: { async run() { return { exitCode: 0, stdout: Buffer.alloc(1024 * 1024 + 1), stderr: Buffer.alloc(0) }; } } }), (error) => error.code === 'ADAPTER_OUTPUT_SIZE');
  const disagreement = fakeRunner(c, (value, operation) => operation.provider === 'postgresql' && operation.method === 'postgres-direct-sql' ? { ...value, identity: { ...value.identity, deploymentId: 'different-deployment' } } : value);
  await assert.rejects(() => collectLiveBundle({ challenge: c, policy, plans: plans(), signingKey: privateKey, childRunner: disagreement, clock: () => NOW }), (error) => error.code === 'POSTGRES_METHOD_DISAGREEMENT');
});

test('keyring enforces approved key IDs, validity, rotation uniqueness and revocation', async () => {
  const bundle = await collect();
  assert.throws(() => verifyCommittedLiveBundle({ bundle, keyring: { ...keyring(), keys: [] }, policy, clock: () => NOW, consumeReplay: false }), (error) => error.code === 'COLLECTOR_KEY_NOT_APPROVED');
  assert.throws(() => verifyCommittedLiveBundle({ bundle, keyring: keyring(), policy: { ...policy, callerOverride: true }, clock: () => NOW }), (error) => error.code === 'UNKNOWN_FIELD');
  assert.throws(() => resolveCollectorKey(keyring({ revokedAt: '2026-07-30T12:02:00.000Z' }), policy.expectedCollectorKeyId, bundle.evidence.collectedAt), (error) => error.code === 'COLLECTOR_KEY_INACTIVE');
  const duplicate = keyring(); duplicate.keys.push(structuredClone(duplicate.keys[0])); assert.throws(() => resolveCollectorKey(duplicate, policy.expectedCollectorKeyId, bundle.evidence.collectedAt), (error) => error.code === 'COLLECTOR_KEY_NOT_APPROVED');
});

test('flat bundle publication is protected and durable replay consumption rejects reuse', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ticket273-')); const output = join(root, 'output'); const replay = join(root, 'replay'); await Promise.all([mkdir(output, { mode: 0o700 }), mkdir(replay, { mode: 0o700 })]);
  try {
    const bundle = await collect(); const committed = await commitLiveBundle(output, bundle);
    const names = ['challenge', 'commit', 'evidence', 'inventory', 'receipt'].map((name) => `${policy.expectedRunId}.${name}.json`).sort();
    assert.equal(committed, join(output, `${policy.expectedRunId}.commit.json`)); assert.deepEqual((await readdir(output)).sort(), names);
    for (const name of await readdir(output)) assert.equal((await stat(join(output, name))).mode & 0o777, 0o600);
    const loaded = await loadCommittedBundle(output, policy.expectedRunId); assert.equal(liveSha256(liveCanonicalJson(loaded)), liveSha256(liveCanonicalJson(bundle)));
    assert.equal((await verifyAndConsumeLiveBundle({ bundle: loaded, keyring: keyring(), policy, replayDirectory: replay, clock: () => NOW })).runId, policy.expectedRunId);
    await assert.rejects(() => verifyAndConsumeLiveBundle({ bundle: loaded, keyring: keyring(), policy, replayDirectory: replay, clock: () => NOW }), (error) => error.code === 'CHALLENGE_REPLAY');
    await assert.rejects(() => commitLiveBundle(output, bundle), (error) => error.code === 'BUNDLE_ALREADY_COMMITTED');
    const occupied = structuredClone(bundle); occupied.challenge.runId = 'run-occupied-file'; const occupiedName = `${occupied.challenge.runId}.challenge.json`; await writeFile(join(output, occupiedName), 'do not replace', { mode: 0o600 });
    await assert.rejects(() => commitLiveBundle(output, occupied), (error) => error.code === 'BUNDLE_ALREADY_COMMITTED'); assert.equal(await readFile(join(output, occupiedName), 'utf8'), 'do not replace');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('directory descriptors anchor flat publication/replay across root replacement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ticket273-anchor-')); const output = join(root, 'output'); const movedOutput = join(root, 'moved-output');
  const replay = join(root, 'replay'); const movedReplay = join(root, 'moved-replay');
  await Promise.all([mkdir(output, { mode: 0o700 }), mkdir(replay, { mode: 0o700 })]);
  try {
    const bundle = await collect(); let swapped = false; const raced = structuredClone(bundle);
    Object.defineProperty(raced.challenge, 'runId', { enumerable: true, get() {
      if (!swapped) { swapped = true; renameSync(output, movedOutput); mkdirSync(output, { mode: 0o700 }); }
      return policy.expectedRunId;
    } });
    await commitLiveBundle(output, raced);
    assert.deepEqual(await readdir(output), []);
    assert.equal((await loadCommittedBundle(movedOutput, policy.expectedRunId)).challenge.runId, policy.expectedRunId);

    const guard = await createReplayGuard(replay); renameSync(replay, movedReplay); mkdirSync(replay, { mode: 0o700 });
    try { assert.equal(await guard.consumeAsync(bundle.challenge.nonce), true); } finally { await guard.close(); }
    assert.deepEqual(await readdir(replay), []);
    const replayName = `${createHash('sha256').update(bundle.challenge.nonce).digest('hex')}.used`;
    assert.deepEqual(await readdir(movedReplay), [replayName]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('every preexisting canonical name fails exclusively, remains untouched, and yields no collector commit', async () => {
  for (const [index, component] of publicationComponents.entries()) {
    const root = await mkdtemp(join(tmpdir(), `ticket273-existing-${component}-`)); const output = join(root, 'output'); await mkdir(output, { mode: 0o700 });
    try {
      const name = `${policy.expectedRunId}.${component}.json`; const bundle = await collect(); await writeFile(join(output, name), 'preexisting\n', { mode: 0o600 });
      await assert.rejects(() => commitLiveBundle(output, bundle), (error) => error.code === 'BUNDLE_ALREADY_COMMITTED');
      assert.equal(await readFile(join(output, name), 'utf8'), 'preexisting\n');
      const retained = publicationComponents.slice(0, index).map((entry) => `${policy.expectedRunId}.${entry}.json`);
      assert.deepEqual((await readdir(output)).sort(), [...retained, name].sort());
      await assertRunCannotVerify(output);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('each post-create name replacement/removal fails closed and retains all published evidence and replacements', async () => {
  for (const action of ['replace', 'remove']) for (const [index, component] of publicationComponents.entries()) {
    const root = await mkdtemp(join(tmpdir(), `ticket273-race-${action}-${component}-`)); const output = join(root, 'output'); await mkdir(output, { mode: 0o700 });
    try {
      const bundle = await collect(); const racedName = `${policy.expectedRunId}.${component}.json`; const detached = join(root, `detached-${component}`); let raced = false;
      await assert.rejects(() => commitLiveBundle(output, bundle, { async afterCreate({ name }) {
        if (name !== racedName) return; raced = true; await rename(join(output, name), detached);
        if (action === 'replace') await writeFile(join(output, name), 'attacker replacement\n', { mode: 0o600 });
      } }), (error) => error.code === 'BUNDLE_PUBLICATION_RACE');
      assert.equal(raced, true); await assertRunCannotVerify(output);
      const retained = publicationComponents.slice(0, index).map((entry) => `${policy.expectedRunId}.${entry}.json`);
      if (action === 'replace') {
        assert.equal(await readFile(join(output, racedName), 'utf8'), 'attacker replacement\n');
        assert.deepEqual((await readdir(output)).sort(), [...retained, racedName].sort());
      } else assert.deepEqual((await readdir(output)).sort(), retained.sort());
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('partial, extra, and digest-mismatched flat bundles are unusable and failed publication retains evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ticket273-partial-')); const output = join(root, 'output'); await mkdir(output, { mode: 0o700 });
  try {
    await writeFile(join(output, 'run-partial.challenge.json'), '{}\n', { mode: 0o600 });
    await assert.rejects(() => loadCommittedBundle(output, 'run-partial'), (error) => error.code === 'BUNDLE_MANIFEST_MISMATCH');

    const broken = await collect(); broken.challenge.runId = 'run-failed-write'; broken.evidence = 1n;
    await assert.rejects(() => commitLiveBundle(output, broken), (error) => error.code === 'NON_JSON_VALUE');
    assert.deepEqual((await readdir(output)).sort(), ['run-failed-write.challenge.json', 'run-partial.challenge.json']);
    await assertRunCannotVerify(output, 'run-failed-write');

    const valid = await collect(); valid.challenge.runId = 'run-digest-tamper'; await commitLiveBundle(output, valid);
    await writeFile(join(output, 'run-digest-tamper.inventory.json'), '{}\n', { mode: 0o600 });
    await assert.rejects(() => loadCommittedBundle(output, valid.challenge.runId), (error) => error.code === 'BUNDLE_MANIFEST_MISMATCH');
    await writeFile(join(output, 'run-digest-tamper.extra.json'), '{}\n', { mode: 0o600 });
    await assert.rejects(() => loadCommittedBundle(output, valid.challenge.runId), (error) => error.code === 'BUNDLE_MANIFEST_MISMATCH');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('production child runner pins realpath/owner/mode/digest/version and enforces process bounds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ticket273-runner-')); const executable = join(root, 'adapter'); const stage = join(root, 'stage');
  try {
    const script = '#!/bin/sh\nif [ "$1" = "--version" ]; then printf "adapter 1.0.0\\n"; else printf "{\\"ok\\":true}"; fi\n'; await writeFile(executable, script, { mode: 0o500 }); await chmod(root, 0o700);
    const digest = liveSha256(await readFile(executable)); const limits = { timeoutMs: 1000, versionTimeoutMs: 500, stdoutBytes: 256, stderrBytes: 64 };
    const runner = createSecureChildRunner({ stagingDirectory: stage }); const result = await runner.run({ executable: { path: executable, realpath: executable, sha256: digest, version: 'adapter 1.0.0', uid: process.getuid(), mode: 0o500 }, argv: ['collect'], limits }); assert.equal(result.stdout.toString(), '{"ok":true}');
    await assert.rejects(() => runner.run({ executable: { path: executable, realpath: executable, sha256: hex('f'), version: 'adapter 1.0.0', uid: process.getuid(), mode: 0o500 }, argv: ['collect'], limits }), (error) => error.code === 'EXECUTABLE_DIGEST_MISMATCH');
    await assert.rejects(() => spawnBounded(process.execPath, ['-e', 'process.stdout.write("x".repeat(300))'], { timeoutMs: 1000, stdoutBytes: 100, stderrBytes: 10 }), (error) => error.code === 'STDOUT_LIMIT');
    await assert.rejects(() => spawnBounded(process.execPath, ['-e', 'process.stderr.write("credential-canary")'], { timeoutMs: 1000, stdoutBytes: 100, stderrBytes: 4 }), (error) => error.code === 'STDERR_LIMIT' && !error.message.includes('canary'));
    await assert.rejects(() => spawnBounded(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100, stdoutBytes: 100, stderrBytes: 10 }), (error) => error.code === 'PROCESS_TIMEOUT');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('strict protected inputs and operation plans reject ambiguity and unsafe filesystem policy', async () => {
  assert.throws(() => parseStrictJson(Buffer.from('{"a":1,"a":2}')), (error) => error.code === 'DUPLICATE_JSON_KEY');
  assert.throws(() => validateOperationPlans({ ...plans(), executables: { ...plans().executables, vercel: { ...plans().executables.vercel, path: 'relative-adapter' } } }), (error) => error.code === 'EXECUTABLE_PATH_NOT_ABSOLUTE');
  assert.throws(() => validateOperationPlans({ ...plans(), executables: { ...plans().executables, railway: { ...plans().executables.railway, mode: 0o522 } } }), (error) => error.code === 'INVALID_EXECUTABLE_POLICY');
  const root = await mkdtemp(join(tmpdir(), 'ticket273-protected-')); const protectedFile = join(root, 'input.json'); const link = join(root, 'link.json');
  try {
    await writeFile(protectedFile, '{}', { mode: 0o600 }); assert.equal((await readProtectedFile(protectedFile)).toString(), '{}');
    await symlink(protectedFile, link); await assert.rejects(() => readProtectedFile(link), (error) => error.code === 'PROTECTED_FILE_POLICY');
    await chmod(protectedFile, 0o640); await assert.rejects(() => readProtectedFile(protectedFile), (error) => error.code === 'PROTECTED_FILE_POLICY');
    await assert.rejects(() => readProtectedFile('relative.json'), (error) => error.code === 'PROTECTED_PATH_NOT_ABSOLUTE');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('evidence and receipt signatures fail closed after bundle tampering', async () => {
  const bundle = await collect(); const evidenceTamper = structuredClone(bundle); evidenceTamper.evidence.environments.preview.vercel.identity.projectId = 'tampered-project';
  assert.throws(() => verifyCommittedLiveBundle({ bundle: evidenceTamper, keyring: keyring(), policy, clock: () => NOW, consumeReplay: false }), (error) => error.code === 'INVALID_COLLECTOR_SIGNATURE');
  const receiptTamper = structuredClone(bundle); receiptTamper.receipt.inventoryDigest = hex('9');
  assert.throws(() => verifyCommittedLiveBundle({ bundle: receiptTamper, keyring: keyring(), policy, clock: () => NOW, consumeReplay: false }), (error) => error.code === 'RECEIPT_DIGEST_MISMATCH');
});
