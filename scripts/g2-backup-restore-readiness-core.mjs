import { liveCanonicalJson, liveSha256, verifyNarrowedLiveV3Envelope, verifyLiveEd25519Signature } from './provider-provenance-live-core.mjs';

export const G2_CHALLENGE_SCHEMA = 'wordle-royale-g2-backup-restore-challenge/v1';
export const G2_EVIDENCE_SCHEMA = 'wordle-royale-g2-backup-restore-evidence/v1';
export const G2_INVENTORY_SCHEMA = 'wordle-royale-g2-backup-restore-inventory/v1';
export const G2_PROVIDER_RECEIPT_SCHEMA = 'wordle-provider-receipt/v3';
export const G2_ELIGIBILITY_SCHEMA = 'wordle-royale-g2-backup-restore-eligibility-receipt/v1';
export const G2_COLLECTOR = 'wordle-royale/provider-provenance@3';
const SHA = /^sha256:[a-f0-9]{64}$/u;
const GIT = /^[a-f0-9]{40}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const UINT = /^(0|[1-9][0-9]*)$/u;
const MAX_MS = 31_536_000_000n;
const IDENTITIES = ['provider','accountId','projectId','environmentId','serviceId','databaseId','databaseName','schemaName','endpointId'];
const AUTHORITY_FIELDS = ['hostedMutationAuthorized','g1Authorized','g2Authorized','backupExecutionAuthorized','restoreExecutionAuthorized','productionMutationAuthorized'];

export class G2ReadinessError extends Error {
  constructor(code, detail = '') { super(`${code}${detail ? `: ${detail}` : ''}`); this.name = 'G2ReadinessError'; this.code = code; }
}
const fail = (condition, code, detail = '') => { if (!condition) throw new G2ReadinessError(code, detail); };
const object = (value, path) => { fail(value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_SHAPE', path); return value; };
function exact(value, keys, path) {
  object(value, path); const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  fail(actual.join('|') === expected.join('|'), actual.some((key) => !expected.includes(key)) ? 'UNKNOWN_FIELD' : 'OMITTED_FIELD', path);
}
const same = (actual, expected, code, path) => fail(actual === expected, code, path);
const id = (value, path) => { fail(typeof value === 'string' && ID.test(value), 'INVALID_ID', path); return value; };
const digest = (value, path) => { fail(typeof value === 'string' && SHA.test(value), 'INVALID_DIGEST', path); return value; };
function timestamp(value, path) {
  fail(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'INVALID_TIMESTAMP', path);
  return value;
}
function milliseconds(value, path) {
  fail(typeof value === 'string' && UINT.test(value), 'INVALID_MILLISECONDS', path);
  const parsed = BigInt(value); fail(parsed <= MAX_MS, 'MILLISECONDS_OUT_OF_RANGE', path); return parsed;
}
function sensitive(value, path = 'input') {
  if (Array.isArray(value)) return value.forEach((entry, index) => sensitive(entry, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    fail(!/(?:raw|payload|secret|token|credential|authorization|cookie|password|private.?key|connection.?string|database.?url)/iu.test(key), 'SENSITIVE_OR_RAW_FIELD_FORBIDDEN', `${path}.${key}`);
    sensitive(entry, `${path}.${key}`);
  }
}
function identity(value, path) {
  exact(value, IDENTITIES, path); const parsed = {};
  for (const field of IDENTITIES) parsed[field] = id(value[field], `${path}.${field}`);
  return parsed;
}
function sameIdentity(actual, expected, code, path) { same(liveCanonicalJson(actual), liveCanonicalJson(expected), code, path); }
function protectedPolicy(raw) {
  sensitive(raw, 'policy');
  exact(raw, ['schemaVersion','repository','sourceGitSha','sourceArtifactDigest','migrationDigest','providerPolicy','identities','expectedChallengeId','expectedRunId','expectedNonce','expectedCollectorKeyId'], 'policy');
  same(raw.schemaVersion, 'wordle-royale-g2-backup-restore-policy/v1', 'UNSUPPORTED_POLICY');
  fail(typeof raw.repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(raw.repository), 'INVALID_REPOSITORY', 'policy.repository'); fail(typeof raw.sourceGitSha === 'string' && GIT.test(raw.sourceGitSha), 'INVALID_SOURCE_SHA');
  digest(raw.sourceArtifactDigest, 'policy.sourceArtifactDigest'); digest(raw.migrationDigest, 'policy.migrationDigest');
  for (const field of ['expectedChallengeId','expectedRunId','expectedNonce','expectedCollectorKeyId']) id(raw[field], `policy.${field}`);
  exact(raw.providerPolicy, ['provider','backupMode','minimumRetentionMs','maximumRpoMs','maximumRtoMs'], 'policy.providerPolicy');
  id(raw.providerPolicy.provider, 'policy.providerPolicy.provider'); same(raw.providerPolicy.backupMode, 'completed_provider_snapshot', 'PROVIDER_POLICY_INADEQUATE');
  const minimumRetentionMs = milliseconds(raw.providerPolicy.minimumRetentionMs, 'policy.providerPolicy.minimumRetentionMs');
  const maximumRpoMs = milliseconds(raw.providerPolicy.maximumRpoMs, 'policy.providerPolicy.maximumRpoMs');
  const maximumRtoMs = milliseconds(raw.providerPolicy.maximumRtoMs, 'policy.providerPolicy.maximumRtoMs');
  exact(raw.identities, ['sourceProduction','intendedRestore','restoreDestination'], 'policy.identities');
  const identities = Object.fromEntries(Object.entries(raw.identities).map(([key, value]) => [key, identity(value, `policy.identities.${key}`)]));
  sameIdentity(identities.intendedRestore, identities.restoreDestination, 'RESTORE_DESTINATION_NOT_INTENDED', 'policy.identities');
  for (const field of ['projectId','environmentId','serviceId','databaseId','endpointId']) fail(identities.sourceProduction[field] !== identities.restoreDestination[field], 'PREVIEW_PRODUCTION_DESTINATION_OVERLAP', field);
  return { ...structuredClone(raw), identities, bounds: { minimumRetentionMs, maximumRpoMs, maximumRtoMs } };
}
function challenge(raw, policy) {
  exact(raw, ['schemaVersion','challengeId','runId','nonce','issuedAt','expiresAt','collectorKeyId','repository','sourceGitSha','sourceArtifactDigest','migrationDigest','providerPolicyDigest','identities'], 'challenge');
  same(raw.schemaVersion, G2_CHALLENGE_SCHEMA, 'UNSUPPORTED_CHALLENGE');
  for (const field of ['challengeId','runId','nonce','collectorKeyId']) { id(raw[field], `challenge.${field}`); same(raw[field], policy[`expected${field[0].toUpperCase()}${field.slice(1)}`], 'PROTECTED_CHALLENGE_MISMATCH', field); }
  timestamp(raw.issuedAt, 'challenge.issuedAt'); timestamp(raw.expiresAt, 'challenge.expiresAt');
  for (const field of ['repository','sourceGitSha','sourceArtifactDigest','migrationDigest']) same(raw[field], policy[field], 'CHALLENGE_SOURCE_BINDING_MISMATCH', field);
  same(raw.providerPolicyDigest, liveSha256(liveCanonicalJson(policy.providerPolicy)), 'CHALLENGE_POLICY_DIGEST_MISMATCH');
  exact(raw.identities, ['sourceProduction','intendedRestore','restoreDestination'], 'challenge.identities');
  for (const role of Object.keys(raw.identities)) sameIdentity(identity(raw.identities[role], `challenge.identities.${role}`), policy.identities[role], 'CHALLENGE_IDENTITY_MISMATCH', role);
  return structuredClone(raw);
}
function counts(value, path) {
  exact(value, ['tables','rows'], path); return { tables: milliseconds(value.tables, `${path}.tables`), rows: milliseconds(value.rows, `${path}.rows`) };
}
function proof(raw, path, policy, sourceCounts) {
  exact(raw, ['schemaDigest','migrationDigest','constraintsDigest','dataDigest','integrityDigest','counts','integrityChecksComplete'], path);
  for (const field of ['schemaDigest','migrationDigest','constraintsDigest','dataDigest','integrityDigest']) digest(raw[field], `${path}.${field}`);
  same(raw.migrationDigest, policy.migrationDigest, 'MIGRATION_DIGEST_MISMATCH', path);
  same(raw.integrityChecksComplete, true, 'INTEGRITY_PROOF_INCOMPLETE', path);
  const parsedCounts = counts(raw.counts, `${path}.counts`);
  if (sourceCounts) {
    same(parsedCounts.tables, sourceCounts.tables, 'RESTORE_COUNT_MISMATCH', path); same(parsedCounts.rows, sourceCounts.rows, 'RESTORE_COUNT_MISMATCH', path);
  }
  return { ...structuredClone(raw), parsedCounts };
}
function parseEvidence(raw, c, policy) {
  sensitive(raw, 'evidence');
  exact(raw, ['schemaVersion','collector','collectorKeyId','challengeDigest','challengeId','runId','nonce','observedAt','expiresAt','repository','sourceGitSha','sourceArtifactDigest','migrationDigest','identities','providerPolicyObservation','backupArtifact','restoreDrill','productionNoMutation','cleanup','retention','signature'], 'evidence');
  same(raw.schemaVersion, G2_EVIDENCE_SCHEMA, 'UNSUPPORTED_EVIDENCE'); same(raw.collector, G2_COLLECTOR, 'WRONG_COLLECTOR');
  for (const field of ['collectorKeyId','challengeId','runId','nonce','expiresAt']) same(raw[field], c[field], 'CHALLENGE_BINDING_MISMATCH', field);
  same(raw.challengeDigest, liveSha256(liveCanonicalJson(c)), 'CHALLENGE_BINDING_MISMATCH', 'challengeDigest'); timestamp(raw.observedAt, 'evidence.observedAt');
  for (const field of ['repository','sourceGitSha','sourceArtifactDigest','migrationDigest']) same(raw[field], policy[field], 'EVIDENCE_SOURCE_BINDING_MISMATCH', field);
  exact(raw.identities, ['sourceProduction','intendedRestore','restoreDestination'], 'evidence.identities');
  for (const role of Object.keys(raw.identities)) sameIdentity(identity(raw.identities[role], `evidence.identities.${role}`), policy.identities[role], 'EVIDENCE_IDENTITY_MISMATCH', role);
  exact(raw.providerPolicyObservation, ['provider','backupMode','retentionMs','observedAt'], 'evidence.providerPolicyObservation');
  same(raw.providerPolicyObservation.provider, policy.providerPolicy.provider, 'PROVIDER_POLICY_MISMATCH'); same(raw.providerPolicyObservation.backupMode, policy.providerPolicy.backupMode, 'PROVIDER_POLICY_MISMATCH');
  const policyRetention = milliseconds(raw.providerPolicyObservation.retentionMs, 'providerPolicyObservation.retentionMs'); timestamp(raw.providerPolicyObservation.observedAt, 'providerPolicyObservation.observedAt');
  fail(policyRetention >= policy.bounds.minimumRetentionMs, 'PROVIDER_RETENTION_INADEQUATE');
  exact(raw.backupArtifact, ['artifactId','artifactDigest','runId','status','sourceIdentity','sourceGitSha','sourceArtifactDigest','migrationDigest','startedAt','completedAt','sourceProof'], 'evidence.backupArtifact');
  id(raw.backupArtifact.artifactId, 'backupArtifact.artifactId'); digest(raw.backupArtifact.artifactDigest, 'backupArtifact.artifactDigest'); same(raw.backupArtifact.runId, c.runId, 'MIXED_RUN_EVIDENCE'); same(raw.backupArtifact.status, 'completed', 'BACKUP_NOT_COMPLETED');
  sameIdentity(identity(raw.backupArtifact.sourceIdentity, 'backupArtifact.sourceIdentity'), policy.identities.sourceProduction, 'BACKUP_SOURCE_IDENTITY_MISMATCH');
  for (const field of ['sourceGitSha','sourceArtifactDigest','migrationDigest']) same(raw.backupArtifact[field], policy[field], 'BACKUP_SOURCE_BINDING_MISMATCH', field);
  const backupStart = Date.parse(timestamp(raw.backupArtifact.startedAt, 'backupArtifact.startedAt')); const backupComplete = Date.parse(timestamp(raw.backupArtifact.completedAt, 'backupArtifact.completedAt')); fail(backupComplete >= backupStart, 'BACKUP_TIME_ORDER_INVALID');
  const sourceProof = proof(raw.backupArtifact.sourceProof, 'backupArtifact.sourceProof', policy);
  exact(raw.restoreDrill, ['drillId','runId','artifactId','artifactDigest','status','isolated','destinationIdentity','startedAt','completedAt','restoredProof'], 'evidence.restoreDrill');
  id(raw.restoreDrill.drillId, 'restoreDrill.drillId'); same(raw.restoreDrill.runId, c.runId, 'MIXED_RUN_EVIDENCE'); same(raw.restoreDrill.artifactId, raw.backupArtifact.artifactId, 'ARTIFACT_DRILL_MISMATCH'); same(raw.restoreDrill.artifactDigest, raw.backupArtifact.artifactDigest, 'ARTIFACT_DRILL_MISMATCH'); same(raw.restoreDrill.status, 'succeeded', 'RESTORE_NOT_SUCCESSFUL'); same(raw.restoreDrill.isolated, true, 'RESTORE_NOT_ISOLATED');
  sameIdentity(identity(raw.restoreDrill.destinationIdentity, 'restoreDrill.destinationIdentity'), policy.identities.restoreDestination, 'RESTORE_DESTINATION_MISMATCH');
  const restoreStart = Date.parse(timestamp(raw.restoreDrill.startedAt, 'restoreDrill.startedAt')); const restoreComplete = Date.parse(timestamp(raw.restoreDrill.completedAt, 'restoreDrill.completedAt')); fail(restoreStart >= backupComplete && restoreComplete >= restoreStart, 'RESTORE_TIME_ORDER_INVALID');
  const restoredProof = proof(raw.restoreDrill.restoredProof, 'restoreDrill.restoredProof', policy, sourceProof.parsedCounts);
  for (const field of ['schemaDigest','migrationDigest','constraintsDigest','dataDigest','integrityDigest']) same(restoredProof[field], sourceProof[field], field === 'constraintsDigest' ? 'CONSTRAINTS_MISMATCH' : 'RESTORE_PROOF_MISMATCH', field);
  exact(raw.productionNoMutation, ['identity','windowStartedAt','windowCompletedAt','mutationCount','confirmed'], 'evidence.productionNoMutation'); sameIdentity(identity(raw.productionNoMutation.identity, 'productionNoMutation.identity'), policy.identities.sourceProduction, 'PRODUCTION_IDENTITY_MISMATCH'); timestamp(raw.productionNoMutation.windowStartedAt, 'productionNoMutation.windowStartedAt'); timestamp(raw.productionNoMutation.windowCompletedAt, 'productionNoMutation.windowCompletedAt'); same(raw.productionNoMutation.mutationCount, '0', 'PRODUCTION_MUTATION_OBSERVED'); same(raw.productionNoMutation.confirmed, true, 'PRODUCTION_NO_MUTATION_UNPROVEN');
  exact(raw.cleanup, ['destinationIdentity','checkedAt','resourceLookup','pendingDeletion','tombstone'], 'evidence.cleanup'); sameIdentity(identity(raw.cleanup.destinationIdentity, 'cleanup.destinationIdentity'), policy.identities.restoreDestination, 'CLEANUP_IDENTITY_MISMATCH'); timestamp(raw.cleanup.checkedAt, 'cleanup.checkedAt'); same(raw.cleanup.resourceLookup, 'absent', 'CLEANUP_RESOURCE_PRESENT'); same(raw.cleanup.pendingDeletion, false, 'CLEANUP_PENDING'); same(raw.cleanup.tombstone, false, 'CLEANUP_TOMBSTONE_REMAINS');
  exact(raw.retention, ['artifactId','artifactDigest','retainedUntil','minimumRetentionMs'], 'evidence.retention'); same(raw.retention.artifactId, raw.backupArtifact.artifactId, 'RETENTION_ARTIFACT_MISMATCH'); same(raw.retention.artifactDigest, raw.backupArtifact.artifactDigest, 'RETENTION_ARTIFACT_MISMATCH'); const retainedUntil = Date.parse(timestamp(raw.retention.retainedUntil, 'retention.retainedUntil')); const declaredRetention = milliseconds(raw.retention.minimumRetentionMs, 'retention.minimumRetentionMs'); same(declaredRetention, policyRetention, 'RETENTION_POLICY_MISMATCH'); fail(BigInt(retainedUntil - backupComplete) >= policy.bounds.minimumRetentionMs, 'RETENTION_WINDOW_INADEQUATE');
  const rpo = BigInt(backupComplete - backupStart); const rto = BigInt(restoreComplete - restoreStart); fail(rpo <= policy.bounds.maximumRpoMs, 'RPO_EXCEEDED'); fail(rto <= policy.bounds.maximumRtoMs, 'RTO_EXCEEDED');
  return { rpo: rpo.toString(), rto: rto.toString() };
}
export function deriveG2BackupRestoreInventory(evidence, challengeRaw, policyRaw) {
  const policy = protectedPolicy(policyRaw); const c = challenge(challengeRaw, policy); const metrics = parseEvidence(evidence, c, policy);
  return { schemaVersion:G2_INVENTORY_SCHEMA, collector:G2_COLLECTOR, challengeId:c.challengeId, runId:c.runId, observedAt:evidence.observedAt, repository:policy.repository, sourceGitSha:policy.sourceGitSha, sourceArtifactDigest:policy.sourceArtifactDigest, migrationDigest:policy.migrationDigest, identities:structuredClone(policy.identities), providerPolicy:structuredClone(evidence.providerPolicyObservation), backupArtifact:structuredClone(evidence.backupArtifact), restoreDrill:structuredClone(evidence.restoreDrill), productionNoMutation:structuredClone(evidence.productionNoMutation), cleanup:structuredClone(evidence.cleanup), retention:structuredClone(evidence.retention), recomputedRpoMs:metrics.rpo, recomputedRtoMs:metrics.rto };
}
function providerReceipt(raw, c, evidence, inventory, key) {
  sensitive(raw, 'providerReceipt'); exact(raw, ['schemaVersion','collector','collectorKeyId','challengeDigest','evidenceDigest','inventoryDigest','signature'], 'providerReceipt');
  same(raw.schemaVersion, G2_PROVIDER_RECEIPT_SCHEMA, 'UNSUPPORTED_PROVIDER_RECEIPT'); same(raw.collector, G2_COLLECTOR, 'WRONG_COLLECTOR'); same(raw.collectorKeyId, c.collectorKeyId, 'COLLECTOR_KEY_MISMATCH'); same(raw.challengeDigest, liveSha256(liveCanonicalJson(c)), 'PROVIDER_RECEIPT_DIGEST_MISMATCH'); same(raw.evidenceDigest, liveSha256(liveCanonicalJson(evidence)), 'PROVIDER_RECEIPT_DIGEST_MISMATCH'); same(raw.inventoryDigest, liveSha256(liveCanonicalJson(inventory)), 'PROVIDER_RECEIPT_DIGEST_MISMATCH');
  const unsigned = { ...raw }; delete unsigned.signature; verifyLiveEd25519Signature(unsigned, raw.signature, key, 'INVALID_PROVIDER_RECEIPT_SIGNATURE');
}
export function evaluateG2BackupRestoreReadiness({ challenge:challengeRaw, evidence, providerReceipt:receipt, collectorPublicKey, policy:policyRaw, now }) {
  sensitive({ challenge:challengeRaw, evidence, providerReceipt:receipt, policy:policyRaw }); const policy = protectedPolicy(policyRaw); const c = challenge(challengeRaw, policy); const inventory = deriveG2BackupRestoreInventory(evidence, c, policyRaw); providerReceipt(receipt, c, evidence, inventory, collectorPublicKey);
  try { verifyNarrowedLiveV3Envelope({ challenge:c, evidence, receipt, collectorPublicKey, policy:{ now, expectedChallengeId:policy.expectedChallengeId, expectedRunId:policy.expectedRunId, expectedNonce:policy.expectedNonce, expectedCollectorKeyId:policy.expectedCollectorKeyId } }); } catch (error) { throw new G2ReadinessError(error?.code ?? 'INVALID_SIGNED_ENVELOPE'); }
  const body = { schemaVersion:G2_ELIGIBILITY_SCHEMA, decision:'eligible_to_request_G2_approval', repository:policy.repository, sourceGitSha:policy.sourceGitSha, sourceArtifactDigest:policy.sourceArtifactDigest, migrationDigest:policy.migrationDigest, challengeId:c.challengeId, runId:c.runId, nonce:c.nonce, collectorKeyId:c.collectorKeyId, challengeDigest:liveSha256(liveCanonicalJson(c)), evidenceDigest:liveSha256(liveCanonicalJson(evidence)), inventoryDigest:liveSha256(liveCanonicalJson(inventory)), providerReceiptDigest:liveSha256(liveCanonicalJson(receipt)), observedAt:evidence.observedAt, expiresAt:evidence.expiresAt, recomputedRpoMs:inventory.recomputedRpoMs, recomputedRtoMs:inventory.recomputedRtoMs, proofs:{providerPolicy:true,completedArtifact:true,isolatedSuccessfulRestore:true,completeSchemaMigrationDataCountIntegrity:true,productionNoMutation:true,cleanupExactAbsence:true,retention:true}, freshApprovalRequired:true, ...Object.fromEntries(AUTHORITY_FIELDS.map((field)=>[field,false])) };
  return { ...body, receiptDigest:liveSha256(liveCanonicalJson(body)) };
}
export const g2CanonicalJson = liveCanonicalJson;
export const g2Sha256 = liveSha256;
