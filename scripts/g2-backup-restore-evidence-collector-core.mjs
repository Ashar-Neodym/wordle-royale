import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { isAbsolute } from 'node:path';
import {
  G2_COLLECTOR, G2_EVIDENCE_SCHEMA, G2_PROVIDER_RECEIPT_SCHEMA,
  deriveG2BackupRestoreInventory, evaluateG2BackupRestoreReadiness,
  g2CanonicalJson, g2Sha256,
} from './g2-backup-restore-readiness-core.mjs';
import { parseG2StrictJson } from './g2-backup-restore-readiness-offline-core.mjs';

export const G2_OPERATION_PLAN_SCHEMA = 'wordle-royale-g2-backup-restore-operation-plan/v1';
export const G2_ADAPTER_ENVELOPE_SCHEMA = 'wordle-royale-g2-backup-restore-adapter-envelope/v1';
export const G2_SEMANTIC_OPERATIONS = Object.freeze([
  'provider-policy-observation',
  'rpo-rto-measurement',
  'completed-backup-artifact',
  'isolated-restore-drill',
  'production-no-mutation',
  'cleanup-absence-observation',
  'retention-observation',
]);

const MAX_JSON_BYTES = 1024 * 1024;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const PAYLOAD_FIELDS = Object.freeze({
  'provider-policy-observation': ['provider','backupMode','retentionMs','observedAt'],
  'rpo-rto-measurement': ['recoveryPointAt','sourceCutoffAt','restoreRequestedAt','verificationCompletedAt','claimedRpoMs','claimedRtoMs'],
  'completed-backup-artifact': ['artifactId','artifactDigest','runId','status','sourceIdentity','sourceGitSha','sourceArtifactDigest','migrationDigest','startedAt','completedAt','sourceProof'],
  'isolated-restore-drill': ['drillId','runId','artifactId','artifactDigest','status','isolated','destinationIdentity','startedAt','completedAt','restoredProof'],
  'production-no-mutation': ['identity','windowStartedAt','windowCompletedAt','mutationCount','confirmed'],
  'cleanup-absence-observation': ['destinationIdentity','checkedAt','resourceLookup','pendingDeletion','tombstone'],
  'retention-observation': ['artifactId','artifactDigest','retainedUntil','minimumRetentionMs'],
});
const EVIDENCE_FIELDS = Object.freeze({
  'provider-policy-observation': 'providerPolicyObservation',
  'rpo-rto-measurement': 'rpoRtoMeasurement',
  'completed-backup-artifact': 'backupArtifact',
  'isolated-restore-drill': 'restoreDrill',
  'production-no-mutation': 'productionNoMutation',
  'cleanup-absence-observation': 'cleanup',
  'retention-observation': 'retention',
});
const AUTHORITY_FIELDS = ['hostedMutationAuthorized','g1Authorized','g2Authorized','backupExecutionAuthorized','restoreExecutionAuthorized','productionMutationAuthorized'];

export class G2EvidenceCollectorError extends Error {
  constructor(code, detail = '') { super(`${code}${detail ? `: ${detail}` : ''}`); this.name = 'G2EvidenceCollectorError'; this.code = code; }
}
const fail = (condition, code, detail = '') => { if (!condition) throw new G2EvidenceCollectorError(code, detail); };
const plain = (value, path) => { fail(value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_SHAPE', path); return value; };
function exact(value, fields, path) {
  plain(value, path); const actual = Object.keys(value).sort(); const expected = [...fields].sort();
  fail(actual.join('|') === expected.join('|'), actual.some((field) => !expected.includes(field)) ? 'UNKNOWN_FIELD' : 'OMITTED_FIELD', path);
}
const same = (actual, expected, code, path) => fail(actual === expected, code, path);
const id = (value, path) => { fail(typeof value === 'string' && ID.test(value), 'INVALID_ID', path); return value; };
const digest = (value, path) => { fail(typeof value === 'string' && SHA.test(value), 'INVALID_DIGEST', path); return value; };
function timestamp(value, path) {
  fail(typeof value === 'string' && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'INVALID_TIMESTAMP', path);
  return value;
}
function now(clock) { const value = clock(); const parsed = value instanceof Date ? value.getTime() : value; fail(Number.isFinite(parsed), 'INVALID_CLOCK'); return parsed; }
function boundedInteger(value, minimum, maximum, path) { fail(Number.isInteger(value) && value >= minimum && value <= maximum, 'INVALID_LIMIT', path); return value; }

// `payload` is the one structural key exception: it names the sanitized semantic
// object, not provider raw output. Its descendants and every string value remain scanned.
function rejectSensitive(value, path = 'input', allowPayloadKey = false) {
  if (typeof value === 'string') {
    fail(!/(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]+=*|(?:postgres(?:ql)?|mysql|redis):\/\/[^\s]+|(?:password|passwd|secret|token|api[_-]?key|authorization|connection[_-]?string|database[_-]?url)\s*[:=]\s*\S+)/iu.test(value), 'SECRET_OR_CREDENTIAL_VALUE_FORBIDDEN', path);
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => rejectSensitive(entry, `${path}[${index}]`, false)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    const payloadException = allowPayloadKey && key === 'payload';
    fail(payloadException || !/(?:raw|stdout|stderr|secret|token|credential|authorization|cookie|password|passwd|private.?key|connection.?string|database.?url)/iu.test(key), 'SECRET_OR_RAW_FIELD_FORBIDDEN', `${path}.${key}`);
    rejectSensitive(entry, `${path}.${key}`, false);
  }
}

function preflightProtectedInputs(challenge, policy, productionNow) {
  rejectSensitive({ challenge, policy }, 'protected');
  exact(challenge, ['schemaVersion','challengeId','runId','nonce','issuedAt','expiresAt','collectorKeyId','repository','sourceGitSha','sourceArtifactDigest','migrationDigest','providerPolicyDigest','identities'], 'challenge');
  exact(policy, ['schemaVersion','repository','sourceGitSha','sourceArtifactDigest','migrationDigest','providerPolicy','identities','expectedChallengeId','expectedRunId','expectedNonce','expectedCollectorKeyId'], 'policy');
  exact(policy.providerPolicy, ['provider','backupMode','minimumRetentionMs','maximumRpoMs','maximumRtoMs'], 'policy.providerPolicy');
  exact(policy.identities, ['sourceProduction','intendedRestore','restoreDestination'], 'policy.identities');
  exact(challenge.identities, ['sourceProduction','intendedRestore','restoreDestination'], 'challenge.identities');
  const identityFields=['provider','accountId','projectId','environmentId','serviceId','databaseId','databaseName','schemaName','endpointId'];
  for (const role of ['sourceProduction','intendedRestore','restoreDestination']) {
    exact(policy.identities[role], identityFields, `policy.identities.${role}`);
    exact(challenge.identities[role], identityFields, `challenge.identities.${role}`);
  }
  const issued=Date.parse(timestamp(challenge.issuedAt,'challenge.issuedAt')); const expires=Date.parse(timestamp(challenge.expiresAt,'challenge.expiresAt'));
  fail(expires>issued && expires-issued<=5*60_000 && productionNow>=issued-30_000 && productionNow<expires, 'INVALID_CHALLENGE_WINDOW');
}

function parsePlan(raw, challenge, policy) {
  exact(raw, ['schemaVersion','challengeId','runId','nonce','keyId','challengeDigest','policyDigest','operations','limits'], 'operationPlan');
  same(raw.schemaVersion, G2_OPERATION_PLAN_SCHEMA, 'UNSUPPORTED_OPERATION_PLAN');
  for (const [field, expected] of [['challengeId',challenge.challengeId],['runId',challenge.runId],['nonce',challenge.nonce],['keyId',challenge.collectorKeyId]]) {
    id(raw[field], `operationPlan.${field}`); same(raw[field], expected, 'OPERATION_PLAN_BINDING_MISMATCH', field);
  }
  same(digest(raw.challengeDigest, 'operationPlan.challengeDigest'), g2Sha256(g2CanonicalJson(challenge)), 'OPERATION_PLAN_BINDING_MISMATCH', 'challengeDigest');
  same(digest(raw.policyDigest, 'operationPlan.policyDigest'), g2Sha256(g2CanonicalJson(policy)), 'OPERATION_PLAN_BINDING_MISMATCH', 'policyDigest');
  fail(Array.isArray(raw.operations) && raw.operations.length === G2_SEMANTIC_OPERATIONS.length, 'INCOMPLETE_OPERATION_PLAN', 'operations');
  const operations = raw.operations.map((entry, index) => {
    const path = `operationPlan.operations[${index}]`; exact(entry, ['semanticOperation','executable'], path);
    same(entry.semanticOperation, G2_SEMANTIC_OPERATIONS[index], 'OPERATION_ORDER_INVALID', path);
    exact(entry.executable, ['path','realpath','sha256','version','uid','mode'], `${path}.executable`);
    const executable = entry.executable;
    fail(typeof executable.path === 'string' && isAbsolute(executable.path) && typeof executable.realpath === 'string' && isAbsolute(executable.realpath), 'EXECUTABLE_PATH_NOT_ABSOLUTE', path);
    digest(executable.sha256, `${path}.executable.sha256`);
    fail(typeof executable.version === 'string' && executable.version.length >= 1 && executable.version.length <= 200 && !/[\r\n\0]/u.test(executable.version), 'INVALID_EXECUTABLE_VERSION', path);
    fail(Number.isInteger(executable.uid) && executable.uid >= 0 && executable.mode === 0o500, 'INVALID_EXECUTABLE_POLICY', path);
    return { semanticOperation: entry.semanticOperation, executable: { ...executable } };
  });
  exact(raw.limits, ['timeoutMs','versionTimeoutMs','stdoutBytes','stderrBytes'], 'operationPlan.limits');
  const limits = {
    timeoutMs: boundedInteger(raw.limits.timeoutMs, 100, 120_000, 'limits.timeoutMs'),
    versionTimeoutMs: boundedInteger(raw.limits.versionTimeoutMs, 100, 10_000, 'limits.versionTimeoutMs'),
    stdoutBytes: boundedInteger(raw.limits.stdoutBytes, 256, MAX_JSON_BYTES, 'limits.stdoutBytes'),
    stderrBytes: boundedInteger(raw.limits.stderrBytes, 0, 64 * 1024, 'limits.stderrBytes'),
  };
  return { operations, limits, challengeDigest: raw.challengeDigest, policyDigest: raw.policyDigest };
}

function argvFor(operation, challenge, plan) {
  return Object.freeze([
    'collect', '--semantic-operation', operation.semanticOperation,
    '--schema-version', G2_ADAPTER_ENVELOPE_SCHEMA,
    '--challenge-id', challenge.challengeId, '--run-id', challenge.runId,
    '--nonce', challenge.nonce, '--collector-key-id', challenge.collectorKeyId,
    '--challenge-digest', plan.challengeDigest, '--policy-digest', plan.policyDigest,
    '--format', 'json',
  ]);
}
function parseAdapterBytes(bytes, path) {
  fail(bytes instanceof Uint8Array && bytes.byteLength > 0 && bytes.byteLength <= MAX_JSON_BYTES, 'ADAPTER_OUTPUT_SIZE', path);
  let decoded; try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new G2EvidenceCollectorError('ADAPTER_OUTPUT_ENCODING', path); }
  let value; try { value = parseG2StrictJson(Buffer.from(decoded)); } catch (error) {
    if (error?.code === 'DUPLICATE_JSON_KEY' || error?.code === 'JSON_DEPTH') throw new G2EvidenceCollectorError(error.code, path);
    throw new G2EvidenceCollectorError('ADAPTER_OUTPUT_JSON', path);
  }
  return plain(value, path);
}
function adapterEnvelope(raw, semanticOperation, challenge, plan, productionNow) {
  const path = `adapter.${semanticOperation}`;
  rejectSensitive(raw, path, true);
  exact(raw, ['schemaVersion','semanticOperation','adapterVersion','challengeId','runId','nonce','collectorKeyId','challengeDigest','policyDigest','attestedAt','payload'], path);
  same(raw.schemaVersion, G2_ADAPTER_ENVELOPE_SCHEMA, 'UNSUPPORTED_ADAPTER_ENVELOPE', path);
  same(raw.semanticOperation, semanticOperation, 'SEMANTIC_OPERATION_MISMATCH', path);
  fail(typeof raw.adapterVersion === 'string' && raw.adapterVersion.length >= 1 && raw.adapterVersion.length <= 200 && !/[\r\n\0]/u.test(raw.adapterVersion), 'INVALID_ADAPTER_VERSION', path);
  for (const [field, expected] of [['challengeId',challenge.challengeId],['runId',challenge.runId],['nonce',challenge.nonce],['collectorKeyId',challenge.collectorKeyId],['challengeDigest',plan.challengeDigest],['policyDigest',plan.policyDigest]]) same(raw[field], expected, 'ADAPTER_BINDING_MISMATCH', `${path}.${field}`);
  const attested = Date.parse(timestamp(raw.attestedAt, `${path}.attestedAt`));
  fail(attested >= Date.parse(challenge.issuedAt) && attested < Date.parse(challenge.expiresAt) && attested <= productionNow, 'ADAPTER_TIME_OUTSIDE_WINDOW', path);
  exact(raw.payload, PAYLOAD_FIELDS[semanticOperation], `${path}.payload`);
  return { payload: structuredClone(raw.payload), attested };
}
function privateAndPublic(signingKey, collectorPublicKey) {
  let privateKey; let expected;
  try { privateKey = signingKey?.type === 'private' ? signingKey : createPrivateKey(signingKey); } catch { throw new G2EvidenceCollectorError('INVALID_SIGNING_KEY'); }
  fail(privateKey.asymmetricKeyType === 'ed25519', 'INVALID_SIGNING_KEY');
  try { expected = collectorPublicKey?.type === 'public' ? collectorPublicKey : createPublicKey(collectorPublicKey); } catch { throw new G2EvidenceCollectorError('INVALID_COLLECTOR_KEY'); }
  fail(expected.asymmetricKeyType === 'ed25519', 'INVALID_COLLECTOR_KEY');
  const derived = createPublicKey(privateKey);
  fail(derived.export({ format:'der', type:'spki' }).equals(expected.export({ format:'der', type:'spki' })), 'COLLECTOR_KEY_MISMATCH');
  return { privateKey, publicKey: expected };
}
const signature = (unsigned, key) => `ed25519:${sign(null, Buffer.from(g2CanonicalJson(unsigned)), key).toString('base64')}`;

/**
 * Semantic collector composition seam shared by the production CLI and unit tests.
 * Production supplies the hardened runner and Date.now; injection remains confined
 * to this pure seam for deterministic semantic tests.
 */
export async function collectG2BackupRestoreEvidence({ challenge, policy, operationPlan, signingKey, collectorPublicKey, childRunner, clock = Date.now }) {
  fail(challenge && policy, 'PROTECTED_INPUT_REQUIRED');
  fail(typeof clock === 'function', 'INVALID_CLOCK');
  preflightProtectedInputs(challenge, policy, now(clock));
  const { privateKey, publicKey } = privateAndPublic(signingKey, collectorPublicKey);
  fail(childRunner && childRunner.shellFree === true && typeof childRunner.run === 'function', 'SHELL_FREE_CHILD_RUNNER_REQUIRED');
  const plan = parsePlan(operationPlan, challenge, policy); const payloads = {}; const attestations = [];
  for (const operation of plan.operations) {
    const spec = Object.freeze({ executable: Object.freeze({ ...operation.executable }), argv: argvFor(operation, challenge, plan), limits: Object.freeze({ ...plan.limits }), shell: false });
    let result;
    try { result = await childRunner.run(spec); } catch (error) {
      const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/u.test(error.code) ? error.code : 'OPERATION_FAILED';
      throw new G2EvidenceCollectorError(code, operation.semanticOperation);
    }
    fail(result && result.exitCode === 0 && result.stdout instanceof Uint8Array, 'OPERATION_FAILED', operation.semanticOperation);
    const parsed = adapterEnvelope(parseAdapterBytes(result.stdout, operation.semanticOperation), operation.semanticOperation, challenge, plan, now(clock));
    payloads[EVIDENCE_FIELDS[operation.semanticOperation]] = parsed.payload; attestations.push(parsed.attested);
  }
  const observedAt = new Date(Math.max(...attestations)).toISOString();
  const unsignedEvidence = {
    schemaVersion:G2_EVIDENCE_SCHEMA, collector:G2_COLLECTOR, collectorKeyId:challenge.collectorKeyId,
    challengeDigest:plan.challengeDigest, challengeId:challenge.challengeId, runId:challenge.runId, nonce:challenge.nonce,
    observedAt, expiresAt:challenge.expiresAt, repository:policy.repository, sourceGitSha:policy.sourceGitSha,
    sourceArtifactDigest:policy.sourceArtifactDigest, migrationDigest:policy.migrationDigest,
    identities:structuredClone(policy.identities), ...payloads,
  };
  rejectSensitive(unsignedEvidence, 'evidence');
  // The AH semantic parser does not authenticate signatures while deriving an
  // inventory, so a deliberately unusable marker lets us validate every nested
  // closed payload and cross-operation invariant before the private key is used.
  deriveG2BackupRestoreInventory({ ...unsignedEvidence, signature:'ed25519:semantic-preflight-only' }, challenge, policy);
  const evidence = { ...unsignedEvidence, signature:signature(unsignedEvidence, privateKey) };
  const inventory = deriveG2BackupRestoreInventory(evidence, challenge, policy);
  const unsignedReceipt = {
    schemaVersion:G2_PROVIDER_RECEIPT_SCHEMA, collector:G2_COLLECTOR, collectorKeyId:challenge.collectorKeyId,
    challengeDigest:plan.challengeDigest, evidenceDigest:g2Sha256(g2CanonicalJson(evidence)), inventoryDigest:g2Sha256(g2CanonicalJson(inventory)),
  };
  const providerReceipt = { ...unsignedReceipt, signature:signature(unsignedReceipt, privateKey) };
  const eligibility = evaluateG2BackupRestoreReadiness({ challenge, evidence, providerReceipt, collectorPublicKey:publicKey, policy, now:now(clock) });
  for (const field of AUTHORITY_FIELDS) fail(eligibility[field] === false, 'AUTHORITY_INVARIANT_VIOLATION', field);
  return { challenge:structuredClone(challenge), evidence, inventory, providerReceipt, eligibility };
}
