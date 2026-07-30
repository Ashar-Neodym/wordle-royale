import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  CHALLENGE_VERSION, LIVE_COLLECTOR_ID, LIVE_EVIDENCE_VERSION, LIVE_INVENTORY_VERSION, LIVE_RECEIPT_VERSION,
  POSTGRES_SQL_DIGEST, POSTGRES_SQL_QUERY_ID, deriveLiveInventory, liveCanonicalJson, liveSha256,
  validateLiveChallenge, validateLiveInventory, validateLiveReceipt, verifyLiveBundle,
} from './provider-provenance-live-core.mjs';
import { MIGRATIONS, verifyAuthenticatedProviderEvidence } from './auth-activation-preflight-core.mjs';

const NOW = Date.parse('2026-07-30T12:01:00.000Z');
const hex = (c) => `sha256:${c.repeat(64)}`;
const sha = (c) => c.repeat(40);
const clone = structuredClone;
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const policy = { now: NOW, expectedChallengeId: 'challenge-wave-ad-272', expectedRunId: 'run-wave-ad-272', expectedNonce: 'nonce-wave-ad-272', expectedCollectorKeyId: 'collector-key-wave-ad' };
const signature = (value) => `ed25519:${sign(null, Buffer.from(liveCanonicalJson(value)), privateKey).toString('base64')}`;
const variables = [{ name: 'DATABASE_URL', required: true, state: 'non-empty' }];
const fp = (method) => Object.fromEntries(['projectId', 'environmentId', 'serviceId', 'deploymentId', 'clusterId', 'databaseId', 'databaseName', 'schemaName', 'schemaDigest', 'endpointId', 'connectionMode'].map((field) => [field, method === 'railway-control-plane' ? (['schemaName', 'schemaDigest'].includes(field) ? 'challenge' : method) : (['databaseName', 'schemaName', 'schemaDigest'].includes(field) ? method : (field === 'connectionMode' ? 'connection-configuration' : 'challenge'))]));
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
      vercel: { deploymentId: expectedIdentities[env].vercel.deploymentId, sourceGitSha: sha(env === 'preview' ? 'c' : 'd'), artifactDigest: hex(env === 'preview' ? '1' : '5') },
      railway: { deploymentId: expectedIdentities[env].railway.deploymentId, sourceGitSha: sha(env === 'preview' ? 'c' : 'd'), artifactDigest: hex(env === 'preview' ? '3' : '7') },
    };
    postgresqlSubjects[env] = { ...expectedIdentities[env].postgresql, clusterId: `pg-cluster-${short}`, databaseId: `pg-database-${short}`, databaseName: `wordle_${short}`, schemaName: 'public', schemaDigest: hex(short === 'pre' ? 'a' : 'b'), endpointId: `pg-direct-endpoint-${short}`, connectionMode: 'direct' };
    for (const [provider, methods] of Object.entries({ vercel: ['vercel-control-plane'], railway: ['railway-control-plane'], postgresql: ['railway-control-plane', 'postgres-direct-sql'] })) for (const method of methods) operations.push({ operationId: `op-${env}-${provider}-${method}`, environment: env, provider, method, targetHost: provider === 'vercel' ? 'api.vercel.com' : (method === 'postgres-direct-sql' ? `direct-${short}.railway.internal` : 'backboard.railway.app') });
  }
  return { schemaVersion: CHALLENGE_VERSION, challengeId: policy.expectedChallengeId, runId: policy.expectedRunId, nonce: policy.expectedNonce, issuedAt: '2026-07-30T12:00:00.000Z', expiresAt: '2026-07-30T12:05:00.000Z', collectorKeyId: policy.expectedCollectorKeyId, expectedIdentities, expectedArtifacts, postgresqlSubjects, operations };
}
function evidence(c = challenge()) {
  const environments = {}; let digestChar = 0;
  for (const env of ['preview', 'production']) {
    const subject = c.postgresqlSubjects[env]; environments[env] = {};
    for (const provider of ['vercel', 'railway']) {
      const ident = c.expectedIdentities[env][provider]; const method = `${provider}-control-plane`; const op = c.operations.find((x) => x.environment === env && x.provider === provider);
      environments[env][provider] = { identity: clone(ident), artifact: clone(c.expectedArtifacts[env][provider]), variables: provider === 'railway' ? variables : [{ name: 'APP_ENV', required: true, state: 'non-empty' }], provenance: { operationId: op.operationId, method, evidenceDigest: hex((++digestChar).toString(16)), observedAt: '2026-07-30T12:01:00.000Z' } };
    }
    const common = { subject: clone(subject), observedAt: '2026-07-30T12:01:00.000Z', physicalNodeId: `physical-primary-${env}` };
    environments[env].postgresql = { identity: clone(c.expectedIdentities[env].postgresql), variables, observations: [
      { ...common, observationId: `observation-${env}-control`, operationId: c.operations.find((x) => x.environment === env && x.provider === 'postgresql' && x.method === 'railway-control-plane').operationId, method: 'railway-control-plane', evidenceDigest: hex((++digestChar).toString(16)), fieldProvenance: fp('railway-control-plane'), facts: { endpointClassification: 'direct' } },
      { ...common, observationId: `observation-${env}-sql`, operationId: c.operations.find((x) => x.environment === env && x.provider === 'postgresql' && x.method === 'postgres-direct-sql').operationId, method: 'postgres-direct-sql', evidenceDigest: hex((++digestChar).toString(16)), fieldProvenance: fp('postgres-direct-sql'), facts: { endpointClassification: 'direct', queryId: POSTGRES_SQL_QUERY_ID, queryDigest: POSTGRES_SQL_DIGEST, databaseName: subject.databaseName, schemaName: subject.schemaName, schemaDigest: subject.schemaDigest, serverAddressDigest: hex((++digestChar).toString(16)), serverPort: 5432, isInRecovery: false } },
    ] };
  }
  const unsigned = { schemaVersion: LIVE_EVIDENCE_VERSION, collector: LIVE_COLLECTOR_ID, collectorKeyId: c.collectorKeyId, challengeDigest: liveSha256(liveCanonicalJson(c)), challengeId: c.challengeId, runId: c.runId, nonce: c.nonce, collectedAt: '2026-07-30T12:01:00.000Z', expiresAt: c.expiresAt, environments };
  return { ...unsigned, signature: signature(unsigned) };
}
function resign(e) { const unsigned = { ...e }; delete unsigned.signature; e.signature = signature(unsigned); return e; }
function bundle(c = challenge(), e = evidence(c)) {
  const inventory = deriveLiveInventory(e, c, publicKey, policy);
  const unsigned = { schemaVersion: LIVE_RECEIPT_VERSION, collector: LIVE_COLLECTOR_ID, collectorKeyId: c.collectorKeyId, challengeDigest: liveSha256(liveCanonicalJson(c)), evidenceDigest: liveSha256(liveCanonicalJson(e)), inventoryDigest: liveSha256(liveCanonicalJson(inventory)) };
  return { challenge: c, evidence: e, inventory, receipt: { ...unsigned, signature: signature(unsigned) }, collectorPublicKey: publicKey, ...policy };
}
function semanticReject(mutate, codes) {
  const c = challenge(); const e = evidence(c); mutate(e, c); resign(e);
  assert.throws(() => deriveLiveInventory(e, c, publicKey, policy), (error) => codes.includes(error.code), `expected ${codes.join('/')}`);
}
function operationalInventory(providerInventory) {
  const p = providerInventory.environments.production; const v = providerInventory.environments.preview;
  return { schemaVersion: 3, activationPhase: 'canary', runId: providerInventory.runId, sourceSha: p.railway.artifact.sourceGitSha, artifactSha: p.railway.artifact.artifactDigest.slice(7), provider: { projectId: p.railway.identity.projectId, environmentId: p.railway.identity.environmentId, apiServiceId: p.railway.identity.serviceId, webServiceId: p.vercel.identity.projectId, databaseId: p.postgresql.subject.databaseId, previewEnvironmentId: v.railway.identity.environmentId, previewDatabaseId: v.postgresql.subject.databaseId }, deployments: { apiDeploymentId: p.railway.identity.deploymentId, apiRevision: p.railway.artifact.sourceGitSha, webDeploymentId: p.vercel.identity.deploymentId, webRevision: p.vercel.artifact.sourceGitSha }, origins: { api: 'https://api.example.test', web: 'https://web.example.test', previewApi: 'https://preview-api.example.test', previewWeb: 'https://preview-web.example.test' }, replicas: { expected: 1, observed: 1, observedReplicaId: 'api-replica-one' }, config: { authMode: 'session_required', durableAuth: true, registrationMode: 'canary', appEnvironment: 'production', nodeEnvironment: 'production', secureCookie: true, hostOnlyCookie: true, proxyHops: 1, requiredKeysPresent: ['AUTH_RATE_LIMIT_KEY', 'DATABASE_URL'], keyFingerprint: 'a'.repeat(16), configFingerprint: 'b'.repeat(16) }, migrations: MIGRATIONS.map((migrationId) => ({ id: migrationId, status: 'applied' })), database: { identityFingerprint: 'c'.repeat(64), databaseHostFingerprint: 'd'.repeat(64), schemaStatus: 'ok', remediationConflictCount: 0 }, source: { kind: 'provider-read-only', observedAt: providerInventory.collectedAt }, expiresAt: '2026-07-30T12:05:00.000Z' };
}

test('accepts honest one-node PostgreSQL observations with repeated or null physical node IDs', () => {
  const first = bundle(); const verified = verifyLiveBundle({ ...first, replayGuard: { consume: () => true } });
  assert.equal(verified.schemaVersion, LIVE_INVENTORY_VERSION);
  assert.equal(verified.environments.production.postgresql.observations[0].physicalNodeId, verified.environments.production.postgresql.observations[1].physicalNodeId);
  const c = challenge(); const e = evidence(c); e.environments.preview.postgresql.observations[1].physicalNodeId = null; resign(e);
  assert.equal(deriveLiveInventory(e, c, publicKey, policy).environments.preview.postgresql.observations[1].physicalNodeId, null);
});

test('rejects a physical PostgreSQL node shared only across preview and production', () => {
  semanticReject((e) => {
    const previewNodeId = e.environments.preview.postgresql.observations[0].physicalNodeId;
    for (const observation of e.environments.production.postgresql.observations) observation.physicalNodeId = previewNodeId;
  }, ['PREVIEW_PRODUCTION_OVERLAP']);
});

test('production G3 verification is non-consuming so composition can map before durable replay', () => {
  const good = bundle(); let consumed = false; const replayGuard = { consume: () => { consumed = true; return true; }, consumeAsync: async () => { consumed = true; return true; } };
  const input = { operationalInventory: operationalInventory(good.inventory), providerEvidenceLane: 'production-live-v3', providerInventory: good.inventory, providerReceipt: good.receipt, nativeEvidence: good.evidence, liveChallenge: good.challenge, collectorPublicKey: publicKey, replayGuard, ...policy };
  assert.equal(verifyAuthenticatedProviderEvidence(input).runId, good.challenge.runId); assert.equal(consumed, false);
  const hostile = operationalInventory(good.inventory); hostile.provider.databaseId = 'wrong-database';
  assert.throws(() => verifyAuthenticatedProviderEvidence({ ...input, operationalInventory: hostile, replayGuard: { consume: () => { consumed = true; return true; } } }), /provider_operational_resource_mismatch/); assert.equal(consumed, false);
});

test('strict challenge freshness, protected identity/key policy and operation plan reject mutation', () => {
  const c = challenge(); assert.equal(validateLiveChallenge(c, policy).schemaVersion, CHALLENGE_VERSION);
  for (const [mutate, code] of [
    [(x) => { x.extra = true; }, 'UNKNOWN_FIELD'],
    [(x) => { x.schemaVersion = 'wordle-provider-challenge/v0'; }, 'UNSUPPORTED_CHALLENGE'],
    [(x) => { x.expiresAt = '2026-07-30T12:00:30.000Z'; }, 'EXPIRED_CHALLENGE'],
    [(x) => { x.collectorKeyId = 'other-collector-key'; }, 'PROTECTED_CHALLENGE_MISMATCH'],
    [(x) => { x.operations.pop(); }, 'INCOMPLETE_OPERATION_PLAN'],
    [(x) => { x.operations[1].operationId = x.operations[0].operationId; }, 'DUPLICATE_OPERATION_ID'],
  ]) { const hostile = clone(c); mutate(hostile); assert.throws(() => validateLiveChallenge(hostile, policy), (error) => error.code === code); }
  assert.throws(() => validateLiveChallenge(c, { now: NOW }), (error) => error.code === 'PROTECTED_CHALLENGE_POLICY_REQUIRED');
});

test('live lane rejects mixed versions, downgrade evidence and collector signature/key mutation', () => {
  semanticReject((e) => { e.schemaVersion = 'wordle-provider-native-evidence/v1'; }, ['UNSUPPORTED_LIVE_EVIDENCE']);
  semanticReject((e) => { e.collector = 'wordle-royale/provider-provenance@2'; }, ['COLLECTOR_KEY_MISMATCH']);
  semanticReject((e) => { e.environments.production.railway.artifact.artifactDigest = hex('e'); }, ['UNEXPECTED_ARTIFACT']);
  const c = challenge(); const e = evidence(c); e.environments.production.railway.artifact.artifactDigest = hex('e');
  assert.throws(() => deriveLiveInventory(e, c, publicKey, policy), (error) => error.code === 'INVALID_COLLECTOR_SIGNATURE');
  const { publicKey: wrongKey } = generateKeyPairSync('ed25519'); assert.throws(() => deriveLiveInventory(evidence(c), c, wrongKey, policy), (error) => error.code === 'INVALID_COLLECTOR_SIGNATURE');
});

test('rejects every PostgreSQL subject field mutation and field-provenance mutation', () => {
  const values = { projectId: 'hostile-project', environmentId: 'hostile-environment', serviceId: 'hostile-service', deploymentId: 'hostile-deployment', clusterId: 'hostile-cluster', databaseId: 'hostile-database', databaseName: 'hostile_database', schemaName: 'hostile_schema', schemaDigest: hex('f'), endpointId: 'hostile-endpoint', connectionMode: 'pooler' };
  for (const [field, value] of Object.entries(values)) semanticReject((e) => { e.environments.production.postgresql.observations[1].subject[field] = value; }, ['POSTGRES_SCOPE_MISMATCH', 'POSTGRES_POOLER_FORBIDDEN']);
  semanticReject((e) => { e.environments.production.postgresql.observations[1].fieldProvenance.databaseId = 'postgres-direct-sql'; }, ['FIELD_PROVENANCE_INVALID']);
});

test('rejects duplicate observation ID, method, and evidence digest without inferring replica count', () => {
  semanticReject((e) => { e.environments.preview.postgresql.observations[1].observationId = e.environments.preview.postgresql.observations[0].observationId; }, ['DUPLICATE_OBSERVATION_ID']);
  semanticReject((e) => { e.environments.preview.postgresql.observations[1].method = 'railway-control-plane'; }, ['DUPLICATE_OR_INVALID_METHOD']);
  semanticReject((e) => { e.environments.preview.postgresql.observations[1].evidenceDigest = e.environments.preview.postgresql.observations[0].evidenceDigest; }, ['DUPLICATE_EVIDENCE_DIGEST']);
  semanticReject((e) => { e.environments.preview.postgresql.observations[1].operationId = e.environments.preview.postgresql.observations[0].operationId; }, ['OPERATION_PLAN_MISMATCH']);
  semanticReject((e) => { e.environments.preview.postgresql.observations[0].replicaId = 'invented-replica'; }, ['UNKNOWN_FIELD']);
});

test('rejects missing or mutated SQL schema proof, fixed query, primary fact, and pooler confusion', () => {
  semanticReject((e) => { delete e.environments.production.postgresql.observations[1].facts.schemaDigest; }, ['OMITTED_FIELD']);
  semanticReject((e) => { e.environments.production.postgresql.observations[1].facts.schemaDigest = hex('f'); }, ['SQL_SCHEMA_PROOF_MISMATCH']);
  semanticReject((e) => { e.environments.production.postgresql.observations[1].facts.queryDigest = hex('f'); }, ['SQL_CONTRACT_MISMATCH']);
  semanticReject((e) => { e.environments.production.postgresql.observations[1].facts.isInRecovery = true; }, ['SQL_FACTS_INVALID']);
  semanticReject((e) => { e.environments.production.postgresql.observations[0].facts.endpointClassification = 'pooler'; }, ['POSTGRES_POOLER_FORBIDDEN']);
  semanticReject((e) => { e.environments.production.postgresql.observations[1].observedAt = '2026-07-30T11:59:59.000Z'; }, ['EVIDENCE_TIME_OUTSIDE_CHALLENGE']);
});

test('receipt binds exact challenge/evidence/inventory and replay is consumed only after verification', () => {
  const used = new Set(); const replayGuard = { consume: (nonce) => used.has(nonce) ? false : (used.add(nonce), true) }; const good = bundle();
  assert.throws(() => verifyLiveBundle(good), (error) => error.code === 'REPLAY_GUARD_REQUIRED');
  const bad = clone(good); bad.receipt.inventoryDigest = hex('f');
  assert.throws(() => verifyLiveBundle({ ...bad, collectorPublicKey: publicKey, replayGuard }), (error) => error.code === 'RECEIPT_DIGEST_MISMATCH'); assert.equal(used.size, 0);
  verifyLiveBundle({ ...good, replayGuard }); assert.equal(used.has(good.challenge.nonce), true);
  assert.throws(() => verifyLiveBundle({ ...good, replayGuard }), (error) => error.code === 'CHALLENGE_REPLAY');
});

test('inventory and receipt schemas reject downgrade, unknown fields, and digest mutation', () => {
  const good = bundle(); assert.equal(validateLiveInventory(good.inventory).valid, true); assert.equal(validateLiveReceipt(good.receipt).valid, true);
  for (const mutate of [(x) => { x.schemaVersion = 'wordle-provider-inventory/v2'; }, (x) => { x.mock = true; }]) { const hostile = clone(good.inventory); mutate(hostile); assert.equal(validateLiveInventory(hostile).valid, false); }
  for (const mutate of [(x) => { x.schemaVersion = 'wordle-provider-receipt/v2'; }, (x) => { x.evidenceDigest = hex('f'); }, (x) => { x.mock = true; }]) { const hostile = clone(good); mutate(hostile.receipt); assert.throws(() => verifyLiveBundle({ ...hostile, consumeReplay: false })); }
});
