import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SCHEMA_VERSION = 'wordle-provider-inventory/v1';
export const RECEIPT_VERSION = 'wordle-provider-receipt/v1';
export const COLLECTOR_ID = 'wordle-royale/provider-provenance@1';
const ENVIRONMENTS = ['preview', 'production'];
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export class ProvenanceError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'ProvenanceError';
    this.code = code;
  }
}

function fail(code, message) { throw new ProvenanceError(code, message); }
function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', `${path} must be an object`);
  return value;
}
function exactKeys(value, allowed, required, path) {
  object(value, path);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('UNKNOWN_FIELD', `${path}.${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail('OMITTED_FIELD', `${path}.${key}`);
}
function id(value, path) {
  if (typeof value !== 'string' || !ID.test(value)) fail('INVALID_ID', path);
  return value;
}
function digest(value, path) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail('INVALID_DIGEST', path);
  return value;
}
function sha(value, path) {
  if (typeof value !== 'string' || !GIT_SHA.test(value)) fail('INVALID_SOURCE_SHA', path);
  return value;
}

/** RFC-8785-compatible for the JSON subset accepted by this collector. */
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  fail('NON_JSON_VALUE', typeof value);
}
export function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }

function collectVariables(raw, trackedNames, requiredNames, path) {
  if (!Array.isArray(raw)) fail('INVALID_SHAPE', `${path} must be an array`);
  if (![trackedNames, requiredNames].every((names) => Array.isArray(names) && names.every((name) => typeof name === 'string' && /^[A-Z][A-Z0-9_]*$/.test(name)))) fail('INVALID_VARIABLE_POLICY', path);
  if (requiredNames.some((name) => !trackedNames.includes(name))) fail('UNTRACKED_REQUIRED_VARIABLE', path);
  const entries = new Map();
  for (const [index, entry] of raw.entries()) {
    const p = `${path}[${index}]`;
    exactKeys(entry, ['name', 'value', 'masked'], ['name'], p);
    if (typeof entry.name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(entry.name)) fail('INVALID_VARIABLE_NAME', p);
    if (entries.has(entry.name)) fail('DUPLICATE_VARIABLE', entry.name);
    let state;
    if (entry.masked === true) {
      if (Object.hasOwn(entry, 'value')) fail('AMBIGUOUS_MASKED_VALUE', entry.name);
      state = 'masked-unknown';
    } else {
      if (Object.hasOwn(entry, 'masked') && entry.masked !== false) fail('INVALID_MASK_FLAG', entry.name);
      if (!Object.hasOwn(entry, 'value')) fail('OMITTED_PROVIDER_VALUE', entry.name);
      if (entry.value === null) fail('NULL_PROVIDER_VALUE', entry.name);
      if (typeof entry.value !== 'string') fail('INVALID_PROVIDER_VALUE', entry.name);
      state = entry.value.length === 0 ? 'explicitly-empty' : 'non-empty';
    }
    entries.set(entry.name, state);
  }
  const names = [...new Set([...trackedNames, ...entries.keys()])].sort();
  return names.map((name) => ({ name, required: requiredNames.includes(name), state: entries.get(name) ?? 'absent' }));
}

function artifact(raw, path) {
  exactKeys(raw, ['sourceGitSha', 'artifactDigest', 'artifactDigestDerivation', 'manifest'], ['sourceGitSha', 'artifactDigest', 'artifactDigestDerivation', 'manifest'], path);
  const sourceGitSha = sha(raw.sourceGitSha, `${path}.sourceGitSha`);
  const artifactDigest = digest(raw.artifactDigest, `${path}.artifactDigest`);
  if (typeof raw.artifactDigestDerivation !== 'string' || raw.artifactDigestDerivation.length < 8) fail('MISSING_ARTIFACT_DERIVATION', path);
  const m = object(raw.manifest, `${path}.manifest`);
  let manifest;
  if (m.mode === 'digest') {
    exactKeys(m, ['mode', 'digest', 'derivation', 'subjectArtifactDigest'], ['mode', 'digest', 'derivation', 'subjectArtifactDigest'], `${path}.manifest`);
    manifest = { mode: 'digest', digest: digest(m.digest, `${path}.manifest.digest`), derivation: nonempty(m.derivation, `${path}.manifest.derivation`), subjectArtifactDigest: digest(m.subjectArtifactDigest, `${path}.manifest.subjectArtifactDigest`) };
  } else if (m.mode === 'provider-managed-attestation') {
    exactKeys(m, ['mode', 'provider', 'attestationId', 'statementDigest', 'subjectArtifactDigest'], ['mode', 'provider', 'attestationId', 'statementDigest', 'subjectArtifactDigest'], `${path}.manifest`);
    manifest = { mode: m.mode, provider: id(m.provider, `${path}.manifest.provider`), attestationId: id(m.attestationId, `${path}.manifest.attestationId`), statementDigest: digest(m.statementDigest, `${path}.manifest.statementDigest`), subjectArtifactDigest: digest(m.subjectArtifactDigest, `${path}.manifest.subjectArtifactDigest`) };
  } else fail('MANIFEST_AMBIGUITY', `${path}.manifest.mode`);
  if (manifest.subjectArtifactDigest !== artifactDigest) fail('ARTIFACT_MANIFEST_MISMATCH', path);
  return { sourceGitSha, artifactDigest, artifactDigestDerivation: raw.artifactDigestDerivation, manifest };
}
function nonempty(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) fail('EMPTY_FIELD', path);
  return value;
}
function identity(raw, fields, path) {
  exactKeys(raw, fields, fields, path);
  return Object.fromEntries(fields.map((field) => [field, id(raw[field], `${path}.${field}`)]));
}

function vercel(raw, trackedVariables, requiredVariables, env) {
  const path = `providers.vercel.${env}`;
  exactKeys(raw, ['identity', 'artifact', 'variables'], ['identity', 'artifact', 'variables'], path);
  return {
    identity: identity(raw.identity, ['projectId', 'environmentId', 'deploymentId'], `${path}.identity`),
    artifact: artifact(raw.artifact, `${path}.artifact`),
    variables: collectVariables(raw.variables, trackedVariables, requiredVariables, `${path}.variables`),
  };
}
function railway(raw, trackedVariables, requiredVariables, env) {
  const path = `providers.railway.${env}`;
  exactKeys(raw, ['identity', 'artifact', 'variables'], ['identity', 'artifact', 'variables'], path);
  return {
    identity: identity(raw.identity, ['projectId', 'environmentId', 'serviceId', 'deploymentId'], `${path}.identity`),
    artifact: artifact(raw.artifact, `${path}.artifact`),
    variables: collectVariables(raw.variables, trackedVariables, requiredVariables, `${path}.variables`),
  };
}
function postgres(raw, trackedVariables, requiredVariables, env) {
  const path = `providers.postgresql.${env}`;
  exactKeys(raw, ['identity', 'variables', 'observations'], ['identity', 'variables', 'observations'], path);
  if (!Array.isArray(raw.observations) || raw.observations.length < 2) fail('INSUFFICIENT_REPLICAS', path);
  const observations = raw.observations.map((entry, index) => {
    const p = `${path}.observations[${index}]`;
    exactKeys(entry, ['replicaId', 'clusterId', 'databaseId', 'schemaDigest'], ['replicaId', 'clusterId', 'databaseId', 'schemaDigest'], p);
    return { replicaId: id(entry.replicaId, `${p}.replicaId`), clusterId: id(entry.clusterId, `${p}.clusterId`), databaseId: id(entry.databaseId, `${p}.databaseId`), schemaDigest: digest(entry.schemaDigest, `${p}.schemaDigest`) };
  }).sort((a, b) => a.replicaId.localeCompare(b.replicaId));
  if (new Set(observations.map((x) => x.replicaId)).size !== observations.length) fail('DUPLICATE_REPLICA', path);
  for (const field of ['clusterId', 'databaseId', 'schemaDigest']) if (new Set(observations.map((x) => x[field])).size !== 1) fail('REPLICA_DISAGREEMENT', `${path}.${field}`);
  return {
    identity: identity(raw.identity, ['projectId', 'environmentId', 'serviceId', 'deploymentId'], `${path}.identity`),
    observations,
    variables: collectVariables(raw.variables, trackedVariables, requiredVariables, `${path}.variables`),
  };
}

function assertIsolation(inventory) {
  const overlap = [];
  for (const provider of ['vercel', 'railway', 'postgresql']) {
    const preview = inventory.environments.preview[provider];
    const production = inventory.environments.production[provider];
    for (const field of Object.keys(preview.identity)) if (preview.identity[field] === production.identity[field]) overlap.push(`${provider}.${field}`);
    if (provider === 'postgresql') {
      for (const field of ['clusterId', 'databaseId']) if (preview.observations[0][field] === production.observations[0][field]) overlap.push(`${provider}.${field}`);
    }
  }
  if (overlap.length) fail('PREVIEW_PRODUCTION_OVERLAP', overlap.join(', '));
  for (const env of ENVIRONMENTS) {
    const sourceShas = ['vercel', 'railway'].map((provider) => inventory.environments[env][provider].artifact.sourceGitSha);
    if (new Set(sourceShas).size !== 1) fail('MIXED_SOURCE_IDENTITY', env);
  }
}

export function collectInventory(snapshot) {
  exactKeys(snapshot, ['schemaVersion', 'collectedAt', 'trackedVariables', 'requiredVariables', 'providers'], ['schemaVersion', 'collectedAt', 'trackedVariables', 'requiredVariables', 'providers'], 'snapshot');
  if (snapshot.schemaVersion !== 'wordle-provider-snapshot/v1') fail('UNSUPPORTED_SNAPSHOT', String(snapshot.schemaVersion));
  if (typeof snapshot.collectedAt !== 'string' || Number.isNaN(Date.parse(snapshot.collectedAt))) fail('INVALID_TIMESTAMP', 'collectedAt');
  exactKeys(snapshot.requiredVariables, ['vercel', 'railway', 'postgresql'], ['vercel', 'railway', 'postgresql'], 'requiredVariables');
  exactKeys(snapshot.trackedVariables, ['vercel', 'railway', 'postgresql'], ['vercel', 'railway', 'postgresql'], 'trackedVariables');
  exactKeys(snapshot.providers, ['vercel', 'railway', 'postgresql'], ['vercel', 'railway', 'postgresql'], 'providers');
  for (const provider of Object.keys(snapshot.providers)) exactKeys(snapshot.providers[provider], ENVIRONMENTS, ENVIRONMENTS, `providers.${provider}`);
  const environments = {};
  for (const env of ENVIRONMENTS) environments[env] = {
    vercel: vercel(snapshot.providers.vercel[env], snapshot.trackedVariables.vercel, snapshot.requiredVariables.vercel, env),
    railway: railway(snapshot.providers.railway[env], snapshot.trackedVariables.railway, snapshot.requiredVariables.railway, env),
    postgresql: postgres(snapshot.providers.postgresql[env], snapshot.trackedVariables.postgresql, snapshot.requiredVariables.postgresql, env),
  };
  const inventory = { schemaVersion: SCHEMA_VERSION, collector: COLLECTOR_ID, collectedAt: snapshot.collectedAt, environments };
  assertIsolation(inventory);
  return inventory;
}

export function validateInventory(inventory) {
  const issues = [];
  for (const env of ENVIRONMENTS) {
    for (const provider of ['vercel', 'railway', 'postgresql']) {
      for (const variable of inventory.environments[env][provider].variables) {
        if (variable.required && variable.state !== 'non-empty') issues.push({ code: 'REQUIRED_VARIABLE_UNPROVEN', environment: env, provider, name: variable.name, state: variable.state });
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

export function createReceipt(inventory, snapshot, signingKey, keyId) {
  if (!(signingKey instanceof Uint8Array) || signingKey.byteLength < 32) fail('WEAK_RECEIPT_KEY', 'at least 32 bytes required');
  id(keyId, 'keyId');
  const inventoryDigest = sha256(canonicalJson(inventory));
  const evidenceDigest = sha256(canonicalJson(snapshot));
  const unsigned = { schemaVersion: RECEIPT_VERSION, collector: COLLECTOR_ID, keyId, inventoryDigest, evidenceDigest };
  const signature = `hmac-sha256:${createHmac('sha256', signingKey).update(canonicalJson(unsigned)).digest('hex')}`;
  return { ...unsigned, signature };
}

export function verifyReceipt(inventory, receipt, signingKey) {
  exactKeys(receipt, ['schemaVersion', 'collector', 'keyId', 'inventoryDigest', 'evidenceDigest', 'signature'], ['schemaVersion', 'collector', 'keyId', 'inventoryDigest', 'evidenceDigest', 'signature'], 'receipt');
  if (receipt.schemaVersion !== RECEIPT_VERSION || receipt.collector !== COLLECTOR_ID) return false;
  if (receipt.inventoryDigest !== sha256(canonicalJson(inventory))) return false;
  if (typeof receipt.signature !== 'string' || !/^hmac-sha256:[a-f0-9]{64}$/.test(receipt.signature)) return false;
  const unsigned = { schemaVersion: receipt.schemaVersion, collector: receipt.collector, keyId: receipt.keyId, inventoryDigest: receipt.inventoryDigest, evidenceDigest: receipt.evidenceDigest };
  const expected = `hmac-sha256:${createHmac('sha256', signingKey).update(canonicalJson(unsigned)).digest('hex')}`;
  return timingSafeEqual(Buffer.from(receipt.signature), Buffer.from(expected));
}
