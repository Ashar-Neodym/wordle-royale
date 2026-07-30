import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

export const CHALLENGE_VERSION = 'wordle-provider-challenge/v1';
export const LIVE_EVIDENCE_VERSION = 'wordle-provider-live-evidence/v2';
export const LIVE_INVENTORY_VERSION = 'wordle-provider-inventory/v3';
export const LIVE_RECEIPT_VERSION = 'wordle-provider-receipt/v3';
export const LIVE_COLLECTOR_ID = 'wordle-royale/provider-provenance@3';
export const POSTGRES_SQL_QUERY_ID = 'wordle-postgresql-subject-readonly/v1';
export const POSTGRES_SQL = "SELECT current_database() AS database_name, current_schema() AS schema_name, inet_server_addr()::text AS server_address, inet_server_port() AS server_port, pg_is_in_recovery() AS is_in_recovery, (SELECT COALESCE(jsonb_agg(jsonb_build_array(table_name, column_name, ordinal_position, data_type, is_nullable) ORDER BY table_name, ordinal_position), '[]'::jsonb) FROM information_schema.columns WHERE table_schema = current_schema()) AS schema_manifest";
export const POSTGRES_SQL_DIGEST = `sha256:${createHash('sha256').update(POSTGRES_SQL).digest('hex')}`;

const ENVS = ['preview', 'production'];
const PROVIDERS = ['vercel', 'railway', 'postgresql'];
const METHODS = Object.freeze({ vercel: ['vercel-control-plane'], railway: ['railway-control-plane'], postgresql: ['railway-control-plane', 'postgres-direct-sql'] });
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const SIGNATURE = /^ed25519:[A-Za-z0-9+/]+={0,2}$/u;
const SUBJECT_FIELDS = ['projectId', 'environmentId', 'serviceId', 'deploymentId', 'clusterId', 'databaseId', 'databaseName', 'schemaName', 'schemaDigest', 'endpointId', 'connectionMode'];

export class LiveProvenanceError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = 'LiveProvenanceError'; this.code = code; }
}
const fail = (code, detail) => { throw new LiveProvenanceError(code, detail); };
const object = (value, path) => { if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_SHAPE', path); return value; };
function exact(value, keys, path) {
  object(value, path);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.join('|') !== expected.join('|')) fail(actual.some((key) => !expected.includes(key)) ? 'UNKNOWN_FIELD' : 'OMITTED_FIELD', path);
}
const id = (value, path) => { if (typeof value !== 'string' || !ID.test(value)) fail('INVALID_ID', path); return value; };
const digest = (value, path) => { if (typeof value !== 'string' || !SHA256.test(value)) fail('INVALID_DIGEST', path); return value; };
const gitSha = (value, path) => { if (typeof value !== 'string' || !GIT_SHA.test(value)) fail('INVALID_SOURCE_SHA', path); return value; };
function timestamp(value, path) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('INVALID_TIMESTAMP', path);
  return value;
}
export function liveCanonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(liveCanonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${liveCanonicalJson(value[key])}`).join(',')}}`;
  fail('NON_JSON_VALUE', typeof value);
}
export const liveSha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
function assertWindow(issuedAt, expiresAt, now, maxLifetimeMs = 5 * 60_000, futureSkewMs = 30_000) {
  const issued = Date.parse(timestamp(issuedAt, 'challenge.issuedAt')); const expires = Date.parse(timestamp(expiresAt, 'challenge.expiresAt'));
  if (!Number.isFinite(now) || expires <= issued || expires - issued > maxLifetimeMs) fail('INVALID_CHALLENGE_WINDOW', 'issuedAt/expiresAt');
  if (now < issued - futureSkewMs) fail('FUTURE_CHALLENGE', issuedAt);
  if (now >= expires) fail('EXPIRED_CHALLENGE', expiresAt);
}
function identity(raw, provider, path) {
  const fields = provider === 'vercel' ? ['projectId', 'environmentId', 'deploymentId'] : ['projectId', 'environmentId', 'serviceId', 'deploymentId'];
  exact(raw, fields, path); return Object.fromEntries(fields.map((field) => [field, id(raw[field], `${path}.${field}`)]));
}
function subject(raw, path) {
  exact(raw, SUBJECT_FIELDS, path);
  const parsed = Object.fromEntries(SUBJECT_FIELDS.map((field) => [field, field === 'schemaDigest' ? digest(raw[field], `${path}.${field}`) : id(raw[field], `${path}.${field}`)]));
  if (parsed.connectionMode !== 'direct') fail('POSTGRES_POOLER_FORBIDDEN', path);
  return parsed;
}
function operation(raw, path) {
  exact(raw, ['operationId', 'environment', 'provider', 'method', 'targetHost'], path);
  const parsed = { operationId: id(raw.operationId, `${path}.operationId`), environment: raw.environment, provider: raw.provider, method: raw.method, targetHost: raw.targetHost };
  if (!ENVS.includes(parsed.environment) || !PROVIDERS.includes(parsed.provider) || !METHODS[parsed.provider].includes(parsed.method)) fail('INVALID_OPERATION', path);
  if (typeof parsed.targetHost !== 'string' || !HOST.test(parsed.targetHost) || parsed.targetHost === 'localhost') fail('INVALID_TARGET_HOST', path);
  return parsed;
}
export function validateLiveChallenge(challenge, options = {}) {
  exact(challenge, ['schemaVersion', 'challengeId', 'runId', 'nonce', 'issuedAt', 'expiresAt', 'collectorKeyId', 'expectedIdentities', 'expectedArtifacts', 'postgresqlSubjects', 'operations'], 'challenge');
  if (challenge.schemaVersion !== CHALLENGE_VERSION) fail('UNSUPPORTED_CHALLENGE', String(challenge.schemaVersion));
  for (const field of ['challengeId', 'runId', 'nonce', 'collectorKeyId']) id(challenge[field], `challenge.${field}`);
  const now = options.now instanceof Date ? options.now.getTime() : (options.now ?? Date.now()); assertWindow(challenge.issuedAt, challenge.expiresAt, now, options.maxLifetimeMs, options.futureSkewMs);
  for (const [name, expected] of [['expectedChallengeId', challenge.challengeId], ['expectedRunId', challenge.runId], ['expectedNonce', challenge.nonce], ['expectedCollectorKeyId', challenge.collectorKeyId]]) {
    if (typeof options[name] !== 'string') fail('PROTECTED_CHALLENGE_POLICY_REQUIRED', name);
    if (options[name] !== expected) fail('PROTECTED_CHALLENGE_MISMATCH', name);
  }
  exact(challenge.expectedIdentities, ENVS, 'challenge.expectedIdentities'); exact(challenge.expectedArtifacts, ENVS, 'challenge.expectedArtifacts'); exact(challenge.postgresqlSubjects, ENVS, 'challenge.postgresqlSubjects');
  const identities = {}; const artifacts = {}; const subjects = {};
  for (const env of ENVS) {
    exact(challenge.expectedIdentities[env], PROVIDERS, `challenge.expectedIdentities.${env}`); identities[env] = {};
    for (const provider of PROVIDERS) identities[env][provider] = identity(challenge.expectedIdentities[env][provider], provider, `challenge.expectedIdentities.${env}.${provider}`);
    exact(challenge.expectedArtifacts[env], ['vercel', 'railway'], `challenge.expectedArtifacts.${env}`); artifacts[env] = {};
    for (const provider of ['vercel', 'railway']) artifacts[env][provider] = artifact(challenge.expectedArtifacts[env][provider], identities[env][provider].deploymentId, `challenge.expectedArtifacts.${env}.${provider}`);
    subjects[env] = subject(challenge.postgresqlSubjects[env], `challenge.postgresqlSubjects.${env}`);
    for (const field of ['projectId', 'environmentId', 'serviceId', 'deploymentId']) if (subjects[env][field] !== identities[env].postgresql[field]) fail('SUBJECT_IDENTITY_MISMATCH', `${env}.${field}`);
  }
  if (!Array.isArray(challenge.operations) || challenge.operations.length !== 8) fail('INCOMPLETE_OPERATION_PLAN', 'challenge.operations');
  const operations = challenge.operations.map((entry, index) => operation(entry, `challenge.operations[${index}]`));
  if (new Set(operations.map((entry) => entry.operationId)).size !== operations.length) fail('DUPLICATE_OPERATION_ID', 'challenge.operations');
  for (const env of ENVS) for (const provider of PROVIDERS) for (const method of METHODS[provider]) if (operations.filter((entry) => entry.environment === env && entry.provider === provider && entry.method === method).length !== 1) fail('INCOMPLETE_OPERATION_PLAN', `${env}.${provider}.${method}`);
  if (artifacts.preview.vercel.artifactDigest === artifacts.production.vercel.artifactDigest || artifacts.preview.railway.artifactDigest === artifacts.production.railway.artifactDigest) fail('PREVIEW_PRODUCTION_OVERLAP', 'challenge.expectedArtifacts');
  return { ...structuredClone(challenge), expectedIdentities: identities, expectedArtifacts: artifacts, postgresqlSubjects: subjects, operations };
}
function variables(raw, path) {
  if (!Array.isArray(raw)) fail('INVALID_SHAPE', path); const names = new Set();
  return raw.map((entry, index) => { const p = `${path}[${index}]`; exact(entry, ['name', 'required', 'state'], p); if (typeof entry.name !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(entry.name) || names.has(entry.name)) fail('INVALID_VARIABLE', p); names.add(entry.name); if (typeof entry.required !== 'boolean' || !['absent', 'explicitly-empty', 'non-empty', 'masked-unknown'].includes(entry.state)) fail('INVALID_VARIABLE', p); if (entry.required && entry.state !== 'non-empty') fail('REQUIRED_VARIABLE_UNPROVEN', p); return { ...entry }; });
}
function artifact(raw, deploymentId, path) {
  exact(raw, ['deploymentId', 'sourceGitSha', 'artifactDigest'], path);
  if (id(raw.deploymentId, `${path}.deploymentId`) !== deploymentId) fail('DEPLOYMENT_ARTIFACT_MISMATCH', path);
  return { deploymentId, sourceGitSha: gitSha(raw.sourceGitSha, `${path}.sourceGitSha`), artifactDigest: digest(raw.artifactDigest, `${path}.artifactDigest`) };
}
function provenance(raw, expectedOperation, path, seenDigests, challenge, collectedAt) {
  exact(raw, ['operationId', 'method', 'evidenceDigest', 'observedAt'], path);
  if (id(raw.operationId, `${path}.operationId`) !== expectedOperation.operationId || raw.method !== expectedOperation.method) fail('OPERATION_PLAN_MISMATCH', path);
  const evidenceDigest = digest(raw.evidenceDigest, `${path}.evidenceDigest`); if (seenDigests.has(evidenceDigest)) fail('DUPLICATE_EVIDENCE_DIGEST', path); seenDigests.add(evidenceDigest);
  const observedAt = timestamp(raw.observedAt, `${path}.observedAt`);
  if (Date.parse(observedAt) < Date.parse(challenge.issuedAt) || Date.parse(observedAt) > Date.parse(collectedAt) || Date.parse(observedAt) >= Date.parse(challenge.expiresAt)) fail('EVIDENCE_TIME_OUTSIDE_CHALLENGE', `${path}.observedAt`);
  return { operationId: raw.operationId, method: raw.method, evidenceDigest, observedAt };
}
function expectedOperation(challenge, env, provider, method) { return challenge.operations.find((entry) => entry.environment === env && entry.provider === provider && entry.method === method); }
function fieldProvenance(raw, method, path) {
  exact(raw, SUBJECT_FIELDS, path);
  const expected = method === 'railway-control-plane'
    ? Object.fromEntries(SUBJECT_FIELDS.map((field) => [field, ['schemaName', 'schemaDigest'].includes(field) ? 'challenge' : 'railway-control-plane']))
    : Object.fromEntries(SUBJECT_FIELDS.map((field) => [field, ['databaseName', 'schemaName', 'schemaDigest'].includes(field) ? 'postgres-direct-sql' : (field === 'connectionMode' ? 'connection-configuration' : 'challenge')]));
  for (const field of SUBJECT_FIELDS) if (raw[field] !== expected[field]) fail('FIELD_PROVENANCE_INVALID', `${path}.${field}`);
  return { ...raw };
}
function postgresObservation(raw, challenge, env, collectedAt, path, seenIds, seenMethods, seenDigests) {
  exact(raw, ['observationId', 'operationId', 'method', 'evidenceDigest', 'observedAt', 'physicalNodeId', 'subject', 'fieldProvenance', 'facts'], path);
  const observationId = id(raw.observationId, `${path}.observationId`); if (seenIds.has(observationId)) fail('DUPLICATE_OBSERVATION_ID', path); seenIds.add(observationId);
  if (!METHODS.postgresql.includes(raw.method) || seenMethods.has(raw.method)) fail('DUPLICATE_OR_INVALID_METHOD', path); seenMethods.add(raw.method);
  const op = expectedOperation(challenge, env, 'postgresql', raw.method);
  const base = provenance({ operationId: raw.operationId, method: raw.method, evidenceDigest: raw.evidenceDigest, observedAt: raw.observedAt }, op, path, seenDigests, challenge, collectedAt);
  if (raw.physicalNodeId !== null) id(raw.physicalNodeId, `${path}.physicalNodeId`);
  const parsedSubject = subject(raw.subject, `${path}.subject`); if (liveCanonicalJson(parsedSubject) !== liveCanonicalJson(challenge.postgresqlSubjects[env])) fail('POSTGRES_SCOPE_MISMATCH', path);
  const fp = fieldProvenance(raw.fieldProvenance, raw.method, `${path}.fieldProvenance`);
  let facts;
  if (raw.method === 'railway-control-plane') {
    exact(raw.facts, ['endpointClassification'], `${path}.facts`); if (raw.facts.endpointClassification !== 'direct') fail('POSTGRES_POOLER_FORBIDDEN', path); facts = { ...raw.facts };
  } else {
    exact(raw.facts, ['endpointClassification', 'queryId', 'queryDigest', 'databaseName', 'schemaName', 'schemaDigest', 'serverAddressDigest', 'serverPort', 'isInRecovery'], `${path}.facts`);
    if (raw.facts.endpointClassification !== 'direct' || raw.facts.queryId !== POSTGRES_SQL_QUERY_ID || raw.facts.queryDigest !== POSTGRES_SQL_DIGEST) fail('SQL_CONTRACT_MISMATCH', path);
    if (raw.facts.databaseName !== parsedSubject.databaseName || raw.facts.schemaName !== parsedSubject.schemaName || digest(raw.facts.schemaDigest, `${path}.facts.schemaDigest`) !== parsedSubject.schemaDigest) fail('SQL_SCHEMA_PROOF_MISMATCH', path);
    digest(raw.facts.serverAddressDigest, `${path}.facts.serverAddressDigest`); if (!Number.isInteger(raw.facts.serverPort) || raw.facts.serverPort < 1 || raw.facts.serverPort > 65535 || raw.facts.isInRecovery !== false) fail('SQL_FACTS_INVALID', path);
    facts = { ...raw.facts };
  }
  return { observationId, operationId: base.operationId, method: raw.method, evidenceDigest: base.evidenceDigest, observedAt: base.observedAt, physicalNodeId: raw.physicalNodeId, subject: parsedSubject, fieldProvenance: fp, facts };
}
function parseEvidence(evidence, challenge, publicKey) {
  exact(evidence, ['schemaVersion', 'collector', 'collectorKeyId', 'challengeDigest', 'challengeId', 'runId', 'nonce', 'collectedAt', 'expiresAt', 'environments', 'signature'], 'evidence');
  if (evidence.schemaVersion !== LIVE_EVIDENCE_VERSION) fail('UNSUPPORTED_LIVE_EVIDENCE', String(evidence.schemaVersion));
  if (evidence.collector !== LIVE_COLLECTOR_ID || evidence.collectorKeyId !== challenge.collectorKeyId) fail('COLLECTOR_KEY_MISMATCH', 'evidence');
  if (evidence.challengeDigest !== liveSha256(liveCanonicalJson(challenge)) || evidence.challengeId !== challenge.challengeId || evidence.runId !== challenge.runId || evidence.nonce !== challenge.nonce || evidence.expiresAt !== challenge.expiresAt) fail('CHALLENGE_BINDING_MISMATCH', 'evidence');
  const observed = Date.parse(timestamp(evidence.collectedAt, 'evidence.collectedAt')); if (observed < Date.parse(challenge.issuedAt) || observed >= Date.parse(challenge.expiresAt)) fail('EVIDENCE_TIME_OUTSIDE_CHALLENGE', 'evidence.collectedAt');
  if (typeof evidence.signature !== 'string' || !SIGNATURE.test(evidence.signature)) fail('INVALID_COLLECTOR_SIGNATURE', 'evidence.signature');
  const unsigned = { ...evidence }; delete unsigned.signature;
  let key; try { key = publicKey?.type === 'public' ? publicKey : createPublicKey(publicKey); } catch { fail('INVALID_COLLECTOR_KEY', 'publicKey'); }
  if (key.asymmetricKeyType !== 'ed25519' || !verifySignature(null, Buffer.from(liveCanonicalJson(unsigned)), key, Buffer.from(evidence.signature.slice(8), 'base64'))) fail('INVALID_COLLECTOR_SIGNATURE', 'evidence.signature');
  exact(evidence.environments, ENVS, 'evidence.environments'); const environments = {}; const seenDigests = new Set(); const seenObservationIds = new Set();
  for (const env of ENVS) {
    exact(evidence.environments[env], PROVIDERS, `evidence.environments.${env}`); environments[env] = {};
    for (const provider of ['vercel', 'railway']) {
      const path = `evidence.environments.${env}.${provider}`; const raw = evidence.environments[env][provider]; exact(raw, ['identity', 'artifact', 'variables', 'provenance'], path);
      const ident = identity(raw.identity, provider, `${path}.identity`); if (liveCanonicalJson(ident) !== liveCanonicalJson(challenge.expectedIdentities[env][provider])) fail('UNEXPECTED_IDENTITY', path);
      const parsedArtifact = artifact(raw.artifact, ident.deploymentId, `${path}.artifact`); if (liveCanonicalJson(parsedArtifact) !== liveCanonicalJson(challenge.expectedArtifacts[env][provider])) fail('UNEXPECTED_ARTIFACT', path);
      environments[env][provider] = { identity: ident, artifact: parsedArtifact, variables: variables(raw.variables, `${path}.variables`), provenance: provenance(raw.provenance, expectedOperation(challenge, env, provider, METHODS[provider][0]), `${path}.provenance`, seenDigests, challenge, evidence.collectedAt) };
    }
    const path = `evidence.environments.${env}.postgresql`; const raw = evidence.environments[env].postgresql; exact(raw, ['identity', 'variables', 'observations'], path);
    const ident = identity(raw.identity, 'postgresql', `${path}.identity`); if (liveCanonicalJson(ident) !== liveCanonicalJson(challenge.expectedIdentities[env].postgresql)) fail('UNEXPECTED_IDENTITY', path);
    if (!Array.isArray(raw.observations) || raw.observations.length !== 2) fail('POSTGRES_METHODS_REQUIRED', path); const seenMethods = new Set();
    const observations = raw.observations.map((entry, index) => postgresObservation(entry, challenge, env, evidence.collectedAt, `${path}.observations[${index}]`, seenObservationIds, seenMethods, seenDigests));
    environments[env].postgresql = { identity: ident, subject: structuredClone(challenge.postgresqlSubjects[env]), observations, variables: variables(raw.variables, `${path}.variables`) };
  }
  if (seenDigests.size !== 8) fail('EVIDENCE_CARDINALITY_INVALID', 'evidence');
  return environments;
}
export function deriveLiveInventory(evidence, challengeRaw, collectorPublicKey, options = {}) {
  const challenge = validateLiveChallenge(challengeRaw, options); const environments = parseEvidence(evidence, challenge, collectorPublicKey);
  const inventory = { schemaVersion: LIVE_INVENTORY_VERSION, collector: LIVE_COLLECTOR_ID, challengeId: challenge.challengeId, runId: challenge.runId, collectedAt: evidence.collectedAt, environments };
  const validation = validateLiveInventory(inventory); if (!validation.valid) fail(validation.issues[0]?.code ?? 'INVALID_INVENTORY', validation.issues[0]?.message ?? 'inventory');
  return inventory;
}
export function validateLiveInventory(inventory) {
  try {
    exact(inventory, ['schemaVersion', 'collector', 'challengeId', 'runId', 'collectedAt', 'environments'], 'inventory');
    if (inventory.schemaVersion !== LIVE_INVENTORY_VERSION || inventory.collector !== LIVE_COLLECTOR_ID) fail('UNSUPPORTED_INVENTORY', String(inventory.schemaVersion));
    id(inventory.challengeId, 'inventory.challengeId'); id(inventory.runId, 'inventory.runId'); timestamp(inventory.collectedAt, 'inventory.collectedAt'); exact(inventory.environments, ENVS, 'inventory.environments');
    const observationIds = new Set(); const operationIds = new Set(); const evidenceDigests = new Set(); const environmentResources = {};
    for (const env of ENVS) {
      exact(inventory.environments[env], PROVIDERS, `inventory.environments.${env}`); environmentResources[env] = new Set();
      for (const provider of ['vercel', 'railway']) {
        const path = `inventory.environments.${env}.${provider}`; const raw = inventory.environments[env][provider]; exact(raw, ['identity', 'artifact', 'variables', 'provenance'], path);
        const ident = identity(raw.identity, provider, `${path}.identity`); Object.values(ident).forEach((value) => environmentResources[env].add(value)); const parsedArtifact = artifact(raw.artifact, ident.deploymentId, `${path}.artifact`); environmentResources[env].add(parsedArtifact.artifactDigest); variables(raw.variables, `${path}.variables`);
        exact(raw.provenance, ['operationId', 'method', 'evidenceDigest', 'observedAt'], `${path}.provenance`); const operationId = id(raw.provenance.operationId, `${path}.provenance.operationId`); if (operationIds.has(operationId)) fail('DUPLICATE_OPERATION_ID', path); operationIds.add(operationId); if (raw.provenance.method !== METHODS[provider][0]) fail('INVALID_METHOD', path); const d = digest(raw.provenance.evidenceDigest, `${path}.provenance.evidenceDigest`); if (evidenceDigests.has(d)) fail('DUPLICATE_EVIDENCE_DIGEST', path); evidenceDigests.add(d); timestamp(raw.provenance.observedAt, `${path}.provenance.observedAt`);
      }
      const path = `inventory.environments.${env}.postgresql`; const pg = inventory.environments[env].postgresql; exact(pg, ['identity', 'subject', 'observations', 'variables'], path);
      const ident = identity(pg.identity, 'postgresql', `${path}.identity`); const parsedSubject = subject(pg.subject, `${path}.subject`); variables(pg.variables, `${path}.variables`);
      for (const field of ['projectId', 'environmentId', 'serviceId', 'deploymentId']) if (ident[field] !== parsedSubject[field]) fail('SUBJECT_IDENTITY_MISMATCH', `${path}.${field}`);
      Object.values(ident).forEach((value) => environmentResources[env].add(value)); for (const field of ['clusterId', 'databaseId', 'endpointId']) environmentResources[env].add(parsedSubject[field]);
      if (!Array.isArray(pg.observations) || pg.observations.length !== 2) fail('POSTGRES_METHODS_REQUIRED', path); const methods = new Set();
      for (const [index, raw] of pg.observations.entries()) {
        const p = `${path}.observations[${index}]`; exact(raw, ['observationId', 'operationId', 'method', 'evidenceDigest', 'observedAt', 'physicalNodeId', 'subject', 'fieldProvenance', 'facts'], p);
        const oid = id(raw.observationId, `${p}.observationId`); if (observationIds.has(oid)) fail('DUPLICATE_OBSERVATION_ID', p); observationIds.add(oid);
        const operationId = id(raw.operationId, `${p}.operationId`); if (operationIds.has(operationId)) fail('DUPLICATE_OPERATION_ID', p); operationIds.add(operationId); if (!METHODS.postgresql.includes(raw.method) || methods.has(raw.method)) fail('DUPLICATE_OR_INVALID_METHOD', p); methods.add(raw.method);
        const d = digest(raw.evidenceDigest, `${p}.evidenceDigest`); if (evidenceDigests.has(d)) fail('DUPLICATE_EVIDENCE_DIGEST', p); evidenceDigests.add(d); timestamp(raw.observedAt, `${p}.observedAt`); if (raw.physicalNodeId !== null) id(raw.physicalNodeId, `${p}.physicalNodeId`);
        const observedSubject = subject(raw.subject, `${p}.subject`); if (liveCanonicalJson(observedSubject) !== liveCanonicalJson(parsedSubject)) fail('POSTGRES_SCOPE_MISMATCH', p); fieldProvenance(raw.fieldProvenance, raw.method, `${p}.fieldProvenance`);
        if (raw.method === 'railway-control-plane') { exact(raw.facts, ['endpointClassification'], `${p}.facts`); if (raw.facts.endpointClassification !== 'direct') fail('POSTGRES_POOLER_FORBIDDEN', p); }
        else { exact(raw.facts, ['endpointClassification', 'queryId', 'queryDigest', 'databaseName', 'schemaName', 'schemaDigest', 'serverAddressDigest', 'serverPort', 'isInRecovery'], `${p}.facts`); if (raw.facts.endpointClassification !== 'direct' || raw.facts.queryId !== POSTGRES_SQL_QUERY_ID || raw.facts.queryDigest !== POSTGRES_SQL_DIGEST) fail('SQL_CONTRACT_MISMATCH', p); if (raw.facts.databaseName !== parsedSubject.databaseName || raw.facts.schemaName !== parsedSubject.schemaName || digest(raw.facts.schemaDigest, `${p}.facts.schemaDigest`) !== parsedSubject.schemaDigest) fail('SQL_SCHEMA_PROOF_MISMATCH', p); digest(raw.facts.serverAddressDigest, `${p}.facts.serverAddressDigest`); if (!Number.isInteger(raw.facts.serverPort) || raw.facts.serverPort < 1 || raw.facts.serverPort > 65535 || raw.facts.isInRecovery !== false) fail('SQL_FACTS_INVALID', p); }
      }
    }
    for (const value of environmentResources.preview) if (environmentResources.production.has(value)) fail('PREVIEW_PRODUCTION_OVERLAP', value);
    if (evidenceDigests.size !== 8) fail('EVIDENCE_CARDINALITY_INVALID', 'inventory');
    return { valid: true, issues: [] };
  } catch (error) { return { valid: false, issues: [{ code: error instanceof LiveProvenanceError ? error.code : 'INVALID_INVENTORY', message: error instanceof Error ? error.message : 'invalid' }] }; }
}
export function validateLiveReceipt(receipt) {
  try {
    exact(receipt, ['schemaVersion', 'collector', 'collectorKeyId', 'challengeDigest', 'evidenceDigest', 'inventoryDigest', 'signature'], 'receipt');
    if (receipt.schemaVersion !== LIVE_RECEIPT_VERSION || receipt.collector !== LIVE_COLLECTOR_ID) fail('UNSUPPORTED_RECEIPT', String(receipt.schemaVersion));
    id(receipt.collectorKeyId, 'receipt.collectorKeyId');
    for (const field of ['challengeDigest', 'evidenceDigest', 'inventoryDigest']) digest(receipt[field], `receipt.${field}`);
    if (typeof receipt.signature !== 'string' || !SIGNATURE.test(receipt.signature)) fail('INVALID_RECEIPT_SIGNATURE', 'receipt.signature');
    return { valid: true, issues: [] };
  } catch (error) { return { valid: false, issues: [{ code: error instanceof LiveProvenanceError ? error.code : 'INVALID_RECEIPT', message: error instanceof Error ? error.message : 'invalid' }] }; }
}
export function verifyLiveBundle({ challenge, evidence, inventory, receipt, collectorPublicKey, replayGuard, ...options }) {
  const consumeReplay = options.consumeReplay !== false; delete options.consumeReplay;
  if (consumeReplay && (!replayGuard || typeof replayGuard.consume !== 'function')) fail('REPLAY_GUARD_REQUIRED', 'replayGuard');
  const derived = deriveLiveInventory(evidence, challenge, collectorPublicKey, options);
  if (liveCanonicalJson(derived) !== liveCanonicalJson(inventory)) fail('INVENTORY_EVIDENCE_MISMATCH', 'inventory');
  exact(receipt, ['schemaVersion', 'collector', 'collectorKeyId', 'challengeDigest', 'evidenceDigest', 'inventoryDigest', 'signature'], 'receipt');
  if (receipt.schemaVersion !== LIVE_RECEIPT_VERSION || receipt.collector !== LIVE_COLLECTOR_ID || receipt.collectorKeyId !== challenge.collectorKeyId) fail('UNSUPPORTED_RECEIPT', String(receipt.schemaVersion));
  const unsigned = { schemaVersion: receipt.schemaVersion, collector: receipt.collector, collectorKeyId: receipt.collectorKeyId, challengeDigest: digest(receipt.challengeDigest, 'receipt.challengeDigest'), evidenceDigest: digest(receipt.evidenceDigest, 'receipt.evidenceDigest'), inventoryDigest: digest(receipt.inventoryDigest, 'receipt.inventoryDigest') };
  if (unsigned.challengeDigest !== liveSha256(liveCanonicalJson(challenge)) || unsigned.evidenceDigest !== liveSha256(liveCanonicalJson(evidence)) || unsigned.inventoryDigest !== liveSha256(liveCanonicalJson(inventory))) fail('RECEIPT_DIGEST_MISMATCH', 'receipt');
  if (typeof receipt.signature !== 'string' || !SIGNATURE.test(receipt.signature)) fail('INVALID_RECEIPT_SIGNATURE', 'receipt.signature');
  let key; try { key = collectorPublicKey?.type === 'public' ? collectorPublicKey : createPublicKey(collectorPublicKey); } catch { fail('INVALID_COLLECTOR_KEY', 'publicKey'); }
  if (!verifySignature(null, Buffer.from(liveCanonicalJson(unsigned)), key, Buffer.from(receipt.signature.slice(8), 'base64'))) fail('INVALID_RECEIPT_SIGNATURE', 'receipt.signature');
  if (consumeReplay) consumeLiveNonce(replayGuard, challenge.nonce);
  return structuredClone(derived);
}

export function consumeLiveNonce(replayGuard, nonce) {
  if (!replayGuard || typeof replayGuard.consume !== 'function') fail('REPLAY_GUARD_REQUIRED', 'replayGuard');
  if (replayGuard.consume(nonce) !== true) fail('CHALLENGE_REPLAY', 'challenge.nonce');
}
