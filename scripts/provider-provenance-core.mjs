import { createHash, createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from 'node:crypto';

export const SCHEMA_VERSION = 'wordle-provider-inventory/v2';
export const RECEIPT_VERSION = 'wordle-provider-receipt/v2';
export const SNAPSHOT_VERSION = 'wordle-provider-native-evidence/v1';
export const COLLECTOR_ID = 'wordle-royale/provider-provenance@2';
export const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
export const DEFAULT_FUTURE_SKEW_MS = 30 * 1000;
const ENVIRONMENTS = ['preview', 'production'];
const PROVIDERS = ['vercel', 'railway', 'postgresql'];
const ADAPTERS = { vercel: 'vercel-native-mock/v1', railway: 'railway-native-mock/v1', postgresql: 'postgresql-native-mock/v1' };
const PUBLIC_KEYS = {
  vercel: '302a300506032b6570032100d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737',
  railway: '302a300506032b6570032100a09aa5f47a6759802ff955f8dc2d2a14a5c99d23be97f864127ff9383455a4f0',
  postgresql: '302a300506032b657003210017cb79fb2b4120f2b1ec65e4198d6e08b28e813feb01e4a400839b85e18080ce',
};
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const SIGNATURE = /^ed25519:[A-Za-z0-9+/]+={0,2}$/;

export class ProvenanceError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.name = 'ProvenanceError'; this.code = code; }
}
function fail(code, message) { throw new ProvenanceError(code, message); }
function object(value, path) { if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', `${path} must be an object`); return value; }
function exactKeys(value, allowed, required, path) {
  object(value, path);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('UNKNOWN_FIELD', `${path}.${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail('OMITTED_FIELD', `${path}.${key}`);
}
function id(value, path) { if (typeof value !== 'string' || !ID.test(value)) fail('INVALID_ID', path); return value; }
function digest(value, path) { if (typeof value !== 'string' || !SHA256.test(value)) fail('INVALID_DIGEST', path); return value; }
function sha(value, path) { if (typeof value !== 'string' || !GIT_SHA.test(value)) fail('INVALID_SOURCE_SHA', path); return value; }
function nonblank(value, path) { if (typeof value !== 'string' || value.trim().length === 0) fail('EMPTY_FIELD', path); return value.trim(); }
function timestamp(value, path) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('INVALID_TIMESTAMP', path);
  return value;
}

/** RFC-8785-compatible for the JSON subset accepted here. */
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  fail('NON_JSON_VALUE', typeof value);
}
export function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }

function freshness(collectedAt, constraints) {
  const observed = Date.parse(timestamp(collectedAt, 'collectedAt'));
  const now = constraints.now instanceof Date ? constraints.now.getTime() : (constraints.now ?? Date.now());
  const maxAgeMs = constraints.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const futureSkewMs = constraints.futureSkewMs ?? DEFAULT_FUTURE_SKEW_MS;
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0 || !Number.isFinite(futureSkewMs) || futureSkewMs < 0) fail('INVALID_FRESHNESS_POLICY', 'now/maxAgeMs/futureSkewMs');
  if (observed < now - maxAgeMs) fail('STALE_EVIDENCE', collectedAt);
  if (observed > now + futureSkewMs) fail('FUTURE_EVIDENCE', collectedAt);
}

function collectVariables(raw, trackedNames, requiredNames, path) {
  if (!Array.isArray(raw)) fail('INVALID_SHAPE', `${path} must be an array`);
  if (![trackedNames, requiredNames].every((names) => Array.isArray(names) && names.every((name) => typeof name === 'string' && /^[A-Z][A-Z0-9_]*$/.test(name)))) fail('INVALID_VARIABLE_POLICY', path);
  if (new Set(trackedNames).size !== trackedNames.length || new Set(requiredNames).size !== requiredNames.length) fail('DUPLICATE_VARIABLE_POLICY', path);
  if (requiredNames.some((name) => !trackedNames.includes(name))) fail('UNTRACKED_REQUIRED_VARIABLE', path);
  const entries = new Map();
  for (const [index, entry] of raw.entries()) {
    const p = `${path}[${index}]`; exactKeys(entry, ['name', 'value', 'masked'], ['name'], p);
    if (typeof entry.name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(entry.name)) fail('INVALID_VARIABLE_NAME', p);
    if (entries.has(entry.name)) fail('DUPLICATE_VARIABLE', entry.name);
    let state;
    if (entry.masked === true) { if (Object.hasOwn(entry, 'value')) fail('AMBIGUOUS_MASKED_VALUE', entry.name); state = 'masked-unknown'; }
    else {
      if (Object.hasOwn(entry, 'masked') && entry.masked !== false) fail('INVALID_MASK_FLAG', entry.name);
      if (!Object.hasOwn(entry, 'value')) fail('OMITTED_PROVIDER_VALUE', entry.name);
      if (entry.value === null) fail('NULL_PROVIDER_VALUE', entry.name);
      if (typeof entry.value !== 'string') fail('INVALID_PROVIDER_VALUE', entry.name);
      state = entry.value.length === 0 ? 'explicitly-empty' : 'non-empty';
    }
    entries.set(entry.name, state);
  }
  return [...new Set([...trackedNames, ...entries.keys()])].sort().map((name) => ({ name, required: requiredNames.includes(name), state: entries.get(name) ?? 'absent' }));
}

function identity(raw, fields, path) { exactKeys(raw, fields, fields, path); return Object.fromEntries(fields.map((field) => [field, id(raw[field], `${path}.${field}`)])); }

function artifact(raw, path, deploymentId, expectedProvider) {
  exactKeys(raw, ['deploymentId', 'sourceGitSha', 'artifactDigest', 'artifactDigestDerivation', 'manifest'], ['deploymentId', 'sourceGitSha', 'artifactDigest', 'artifactDigestDerivation', 'manifest'], path);
  if (id(raw.deploymentId, `${path}.deploymentId`) !== deploymentId) fail('DEPLOYMENT_ARTIFACT_MISMATCH', path);
  const sourceGitSha = sha(raw.sourceGitSha, `${path}.sourceGitSha`);
  const artifactDigest = digest(raw.artifactDigest, `${path}.artifactDigest`);
  const artifactDigestDerivation = nonblank(raw.artifactDigestDerivation, `${path}.artifactDigestDerivation`);
  if (artifactDigestDerivation.length < 8) fail('MISSING_ARTIFACT_DERIVATION', path);
  const m = object(raw.manifest, `${path}.manifest`);
  let manifest;
  if (m.mode === 'digest') {
    exactKeys(m, ['mode', 'digest', 'derivation', 'subjectArtifactDigest', 'subjectDeploymentId'], ['mode', 'digest', 'derivation', 'subjectArtifactDigest', 'subjectDeploymentId'], `${path}.manifest`);
    manifest = { mode: 'digest', digest: digest(m.digest, `${path}.manifest.digest`), derivation: nonblank(m.derivation, `${path}.manifest.derivation`), subjectArtifactDigest: digest(m.subjectArtifactDigest, `${path}.manifest.subjectArtifactDigest`), subjectDeploymentId: id(m.subjectDeploymentId, `${path}.manifest.subjectDeploymentId`) };
  } else if (m.mode === 'provider-managed-attestation') {
    exactKeys(m, ['mode', 'provider', 'attestationId', 'statementDigest', 'subjectArtifactDigest', 'subjectDeploymentId'], ['mode', 'provider', 'attestationId', 'statementDigest', 'subjectArtifactDigest', 'subjectDeploymentId'], `${path}.manifest`);
    manifest = { mode: m.mode, provider: id(m.provider, `${path}.manifest.provider`), attestationId: id(m.attestationId, `${path}.manifest.attestationId`), statementDigest: digest(m.statementDigest, `${path}.manifest.statementDigest`), subjectArtifactDigest: digest(m.subjectArtifactDigest, `${path}.manifest.subjectArtifactDigest`), subjectDeploymentId: id(m.subjectDeploymentId, `${path}.manifest.subjectDeploymentId`) };
    if (expectedProvider && manifest.provider !== expectedProvider) fail('WRONG_ATTESTATION_PROVIDER', path);
  } else fail('MANIFEST_AMBIGUITY', `${path}.manifest.mode`);
  if (manifest.subjectArtifactDigest !== artifactDigest) fail('ARTIFACT_MANIFEST_MISMATCH', path);
  if (manifest.subjectDeploymentId !== deploymentId) fail('DEPLOYMENT_MANIFEST_MISMATCH', path);
  return { deploymentId, sourceGitSha, artifactDigest, artifactDigestDerivation, manifest };
}

function authenticateEnvelope(raw, provider, env, snapshot) {
  const path = `providers.${provider}.${env}`;
  exactKeys(raw, ['adapter', 'collectedAt', 'nonce', 'payload', 'signature'], ['adapter', 'collectedAt', 'nonce', 'payload', 'signature'], path);
  if (raw.adapter !== ADAPTERS[provider]) fail('WRONG_NATIVE_ADAPTER', path);
  if (raw.collectedAt !== snapshot.collectedAt) fail('MIXED_EVIDENCE_TIME', path);
  if (raw.nonce !== snapshot.nonce) fail('NONCE_MISMATCH', path);
  if (typeof raw.signature !== 'string' || !SIGNATURE.test(raw.signature)) fail('INVALID_NATIVE_SIGNATURE', path);
  const signed = { adapter: raw.adapter, collectedAt: raw.collectedAt, nonce: raw.nonce, payload: raw.payload };
  const key = createPublicKey({ key: Buffer.from(PUBLIC_KEYS[provider], 'hex'), format: 'der', type: 'spki' });
  if (!verifySignature(null, Buffer.from(canonicalJson(signed)), key, Buffer.from(raw.signature.slice(8), 'base64'))) fail('UNAUTHENTICATED_NATIVE_EVIDENCE', path);
  return { payload: object(raw.payload, `${path}.payload`), provenance: { adapter: raw.adapter, nativeEvidenceDigest: sha256(canonicalJson(signed)), collectedAt: raw.collectedAt, nonce: raw.nonce } };
}

function adapterPayload(provider, raw, tracked, required, env) {
  const path = `providers.${provider}.${env}.payload`;
  if (provider === 'vercel') {
    exactKeys(raw, ['identity', 'artifact', 'variables'], ['identity', 'artifact', 'variables'], path);
    const ident = identity(raw.identity, ['projectId', 'environmentId', 'deploymentId'], `${path}.identity`);
    return { identity: ident, artifact: artifact(raw.artifact, `${path}.artifact`, ident.deploymentId, provider), variables: collectVariables(raw.variables, tracked, required, `${path}.variables`) };
  }
  if (provider === 'railway') {
    exactKeys(raw, ['identity', 'artifact', 'variables'], ['identity', 'artifact', 'variables'], path);
    const ident = identity(raw.identity, ['projectId', 'environmentId', 'serviceId', 'deploymentId'], `${path}.identity`);
    return { identity: ident, artifact: artifact(raw.artifact, `${path}.artifact`, ident.deploymentId, provider), variables: collectVariables(raw.variables, tracked, required, `${path}.variables`) };
  }
  exactKeys(raw, ['identity', 'variables', 'observations'], ['identity', 'variables', 'observations'], path);
  if (!Array.isArray(raw.observations) || raw.observations.length < 2) fail('INSUFFICIENT_REPLICAS', path);
  const observations = raw.observations.map((entry, index) => {
    const p = `${path}.observations[${index}]`; exactKeys(entry, ['replicaId', 'clusterId', 'databaseId', 'schemaDigest'], ['replicaId', 'clusterId', 'databaseId', 'schemaDigest'], p);
    return { replicaId: id(entry.replicaId, `${p}.replicaId`), clusterId: id(entry.clusterId, `${p}.clusterId`), databaseId: id(entry.databaseId, `${p}.databaseId`), schemaDigest: digest(entry.schemaDigest, `${p}.schemaDigest`) };
  }).sort((a, b) => a.replicaId.localeCompare(b.replicaId));
  if (new Set(observations.map((x) => x.replicaId)).size !== observations.length) fail('DUPLICATE_REPLICA', path);
  for (const field of ['clusterId', 'databaseId', 'schemaDigest']) if (new Set(observations.map((x) => x[field])).size !== 1) fail('REPLICA_DISAGREEMENT', `${path}.${field}`);
  return { identity: identity(raw.identity, ['projectId', 'environmentId', 'serviceId', 'deploymentId'], `${path}.identity`), observations, variables: collectVariables(raw.variables, tracked, required, `${path}.variables`) };
}

function resourceIds(entry, provider) {
  const values = Object.values(entry.identity);
  if (provider === 'postgresql') for (const observation of entry.observations) values.push(observation.replicaId, observation.clusterId, observation.databaseId);
  return values;
}
function assertIsolation(inventory) {
  const preview = new Map();
  for (const provider of PROVIDERS) for (const value of resourceIds(inventory.environments.preview[provider], provider)) preview.set(value, `${provider}:${value}`);
  const overlap = [];
  for (const provider of PROVIDERS) for (const value of resourceIds(inventory.environments.production[provider], provider)) if (preview.has(value)) overlap.push(`${preview.get(value)} / ${provider}:${value}`);
  if (overlap.length) fail('PREVIEW_PRODUCTION_OVERLAP', overlap.join(', '));
  for (const env of ENVIRONMENTS) {
    const sourceShas = ['vercel', 'railway'].map((provider) => inventory.environments[env][provider].artifact.sourceGitSha);
    if (new Set(sourceShas).size !== 1) fail('MIXED_SOURCE_IDENTITY', env);
  }
  const previewArtifacts = new Set(['vercel', 'railway'].map((provider) => inventory.environments.preview[provider].artifact.artifactDigest));
  for (const provider of ['vercel', 'railway']) if (previewArtifacts.has(inventory.environments.production[provider].artifact.artifactDigest)) fail('CROSS_ENV_ARTIFACT_REUSE', provider);
  const allArtifacts = ENVIRONMENTS.flatMap((env) => ['vercel', 'railway'].map((provider) => inventory.environments[env][provider].artifact.artifactDigest));
  if (new Set(allArtifacts).size !== allArtifacts.length) fail('ARTIFACT_DEPLOYMENT_AMBIGUITY', 'artifact digest reused by multiple deployments');
}

function expectedIdentity(actual, expected, provider, env) {
  if (!expected || !expected[env] || !expected[env][provider]) fail('EXPECTED_IDENTITY_REQUIRED', `${env}.${provider}`);
  const wanted = expected[env][provider];
  exactKeys(wanted, Object.keys(actual), Object.keys(actual), `expectedIdentities.${env}.${provider}`);
  for (const [field, value] of Object.entries(actual)) if (wanted[field] !== value) fail('UNEXPECTED_IDENTITY', `${env}.${provider}.${field}`);
}

export function collectInventory(snapshot, constraints = {}) {
  exactKeys(snapshot, ['schemaVersion', 'collectedAt', 'nonce', 'trackedVariables', 'requiredVariables', 'providers'], ['schemaVersion', 'collectedAt', 'nonce', 'trackedVariables', 'requiredVariables', 'providers'], 'snapshot');
  if (snapshot.schemaVersion !== SNAPSHOT_VERSION) fail('UNSUPPORTED_SNAPSHOT', String(snapshot.schemaVersion));
  timestamp(snapshot.collectedAt, 'snapshot.collectedAt'); freshness(snapshot.collectedAt, constraints);
  id(snapshot.nonce, 'snapshot.nonce');
  if (typeof constraints.expectedNonce !== 'string') fail('EXPECTED_NONCE_REQUIRED', 'expectedNonce');
  if (snapshot.nonce !== constraints.expectedNonce) fail('NONCE_MISMATCH', 'snapshot.nonce');
  for (const field of ['requiredVariables', 'trackedVariables', 'providers']) exactKeys(snapshot[field], PROVIDERS, PROVIDERS, field);
  for (const provider of PROVIDERS) exactKeys(snapshot.providers[provider], ENVIRONMENTS, ENVIRONMENTS, `providers.${provider}`);
  const environments = {};
  for (const env of ENVIRONMENTS) {
    environments[env] = {};
    for (const provider of PROVIDERS) {
      const native = authenticateEnvelope(snapshot.providers[provider][env], provider, env, snapshot);
      const collected = adapterPayload(provider, native.payload, snapshot.trackedVariables[provider], snapshot.requiredVariables[provider], env);
      expectedIdentity(collected.identity, constraints.expectedIdentities, provider, env);
      environments[env][provider] = { ...collected, provenance: native.provenance };
    }
  }
  const inventory = { schemaVersion: SCHEMA_VERSION, collector: COLLECTOR_ID, collectedAt: snapshot.collectedAt, nonce: snapshot.nonce, environments };
  assertIsolation(inventory);
  return inventory;
}

function validateVariables(raw, path) {
  if (!Array.isArray(raw)) fail('INVALID_SHAPE', `${path} must be an array`);
  const names = new Set();
  return raw.map((entry, index) => {
    const p = `${path}[${index}]`; exactKeys(entry, ['name', 'required', 'state'], ['name', 'required', 'state'], p);
    if (typeof entry.name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(entry.name) || names.has(entry.name)) fail('INVALID_VARIABLE_NAME', p); names.add(entry.name);
    if (typeof entry.required !== 'boolean') fail('INVALID_REQUIRED_FLAG', p);
    if (!['absent', 'explicitly-empty', 'non-empty', 'masked-unknown'].includes(entry.state)) fail('INVALID_VARIABLE_STATE', p);
    return { ...entry };
  });
}
function parseInventory(inventory) {
  exactKeys(inventory, ['schemaVersion', 'collector', 'collectedAt', 'nonce', 'environments'], ['schemaVersion', 'collector', 'collectedAt', 'nonce', 'environments'], 'inventory');
  if (inventory.schemaVersion !== SCHEMA_VERSION) fail('UNSUPPORTED_INVENTORY', String(inventory.schemaVersion));
  if (inventory.collector !== COLLECTOR_ID) fail('WRONG_COLLECTOR', String(inventory.collector));
  timestamp(inventory.collectedAt, 'inventory.collectedAt'); id(inventory.nonce, 'inventory.nonce');
  exactKeys(inventory.environments, ENVIRONMENTS, ENVIRONMENTS, 'inventory.environments');
  const parsed = { ...inventory, environments: {} };
  for (const env of ENVIRONMENTS) {
    exactKeys(inventory.environments[env], PROVIDERS, PROVIDERS, `inventory.environments.${env}`); parsed.environments[env] = {};
    for (const provider of PROVIDERS) {
      const path = `inventory.environments.${env}.${provider}`; const raw = inventory.environments[env][provider];
      const fields = provider === 'postgresql' ? ['identity', 'observations', 'variables', 'provenance'] : ['identity', 'artifact', 'variables', 'provenance']; exactKeys(raw, fields, fields, path);
      const ids = provider === 'vercel' ? ['projectId', 'environmentId', 'deploymentId'] : ['projectId', 'environmentId', 'serviceId', 'deploymentId'];
      const ident = identity(raw.identity, ids, `${path}.identity`);
      const provenance = raw.provenance; exactKeys(provenance, ['adapter', 'nativeEvidenceDigest', 'collectedAt', 'nonce'], ['adapter', 'nativeEvidenceDigest', 'collectedAt', 'nonce'], `${path}.provenance`);
      if (provenance.adapter !== ADAPTERS[provider]) fail('WRONG_NATIVE_ADAPTER', path);
      digest(provenance.nativeEvidenceDigest, `${path}.provenance.nativeEvidenceDigest`);
      if (timestamp(provenance.collectedAt, `${path}.provenance.collectedAt`) !== inventory.collectedAt || provenance.nonce !== inventory.nonce) fail('MIXED_PROVENANCE', path);
      const entry = { identity: ident, variables: validateVariables(raw.variables, `${path}.variables`), provenance: { ...provenance } };
      if (provider === 'postgresql') {
        if (!Array.isArray(raw.observations) || raw.observations.length < 2) fail('INSUFFICIENT_REPLICAS', path);
        entry.observations = raw.observations.map((o, i) => { const p = `${path}.observations[${i}]`; exactKeys(o, ['replicaId', 'clusterId', 'databaseId', 'schemaDigest'], ['replicaId', 'clusterId', 'databaseId', 'schemaDigest'], p); return { replicaId: id(o.replicaId, p), clusterId: id(o.clusterId, p), databaseId: id(o.databaseId, p), schemaDigest: digest(o.schemaDigest, p) }; });
        if (new Set(entry.observations.map((x) => x.replicaId)).size !== entry.observations.length) fail('DUPLICATE_REPLICA', path);
        for (const f of ['clusterId', 'databaseId', 'schemaDigest']) if (new Set(entry.observations.map((x) => x[f])).size !== 1) fail('REPLICA_DISAGREEMENT', path);
      } else entry.artifact = artifact(raw.artifact, `${path}.artifact`, ident.deploymentId, provider);
      parsed.environments[env][provider] = entry;
    }
  }
  assertIsolation(parsed); return parsed;
}

export function validateInventory(inventory) {
  try {
    const parsed = parseInventory(inventory); const issues = [];
    for (const env of ENVIRONMENTS) for (const provider of PROVIDERS) for (const variable of parsed.environments[env][provider].variables) if (variable.required && variable.state !== 'non-empty') issues.push({ code: 'REQUIRED_VARIABLE_UNPROVEN', environment: env, provider, name: variable.name, state: variable.state });
    return { valid: issues.length === 0, issues };
  } catch (error) { return { valid: false, issues: [{ code: error instanceof ProvenanceError ? error.code : 'INVALID_INVENTORY', message: error instanceof Error ? error.message : 'invalid inventory' }] }; }
}

function assertValidInventory(inventory) { const result = validateInventory(inventory); if (!result.valid && result.issues[0]?.code !== 'REQUIRED_VARIABLE_UNPROVEN') fail(result.issues[0]?.code ?? 'INVALID_INVENTORY', result.issues[0]?.message ?? 'invalid inventory'); }
export function createReceipt(inventory, snapshot, signingKey, keyId, constraints = {}) {
  if (!(signingKey instanceof Uint8Array) || signingKey.byteLength < 32) fail('WEAK_RECEIPT_KEY', 'at least 32 bytes required'); id(keyId, 'keyId'); assertValidInventory(inventory);
  const derived = collectInventory(snapshot, constraints);
  if (canonicalJson(derived) !== canonicalJson(inventory)) fail('INVENTORY_EVIDENCE_MISMATCH', 'inventory was not derived from supplied native evidence');
  const unsigned = { schemaVersion: RECEIPT_VERSION, collector: COLLECTOR_ID, keyId, inventoryDigest: sha256(canonicalJson(inventory)), evidenceDigest: sha256(canonicalJson(snapshot)) };
  return { ...unsigned, signature: `hmac-sha256:${createHmac('sha256', signingKey).update(canonicalJson(unsigned)).digest('hex')}` };
}

export function verifyReceipt(inventory, receipt, signingKey, snapshot, constraints = {}) {
  try {
    assertValidInventory(inventory);
    exactKeys(receipt, ['schemaVersion', 'collector', 'keyId', 'inventoryDigest', 'evidenceDigest', 'signature'], ['schemaVersion', 'collector', 'keyId', 'inventoryDigest', 'evidenceDigest', 'signature'], 'receipt');
    if (receipt.schemaVersion !== RECEIPT_VERSION || receipt.collector !== COLLECTOR_ID) return false;
    id(receipt.keyId, 'receipt.keyId'); digest(receipt.inventoryDigest, 'receipt.inventoryDigest'); digest(receipt.evidenceDigest, 'receipt.evidenceDigest');
    if (!snapshot || receipt.inventoryDigest !== sha256(canonicalJson(inventory)) || receipt.evidenceDigest !== sha256(canonicalJson(snapshot))) return false;
    const derived = collectInventory(snapshot, constraints); if (canonicalJson(derived) !== canonicalJson(inventory)) return false;
    if (typeof receipt.signature !== 'string' || !/^hmac-sha256:[a-f0-9]{64}$/.test(receipt.signature)) return false;
    const unsigned = { schemaVersion: receipt.schemaVersion, collector: receipt.collector, keyId: receipt.keyId, inventoryDigest: receipt.inventoryDigest, evidenceDigest: receipt.evidenceDigest };
    const expected = `hmac-sha256:${createHmac('sha256', signingKey).update(canonicalJson(unsigned)).digest('hex')}`;
    return receipt.signature.length === expected.length && timingSafeEqual(Buffer.from(receipt.signature), Buffer.from(expected));
  } catch { return false; }
}
