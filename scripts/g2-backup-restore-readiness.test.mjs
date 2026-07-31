import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { buildSyntheticG2Bundle } from './g2-backup-restore-synthetic-fixture.mjs';
import { evaluateG2BackupRestoreReadiness, deriveG2BackupRestoreInventory, g2CanonicalJson, g2Sha256 } from './g2-backup-restore-readiness-core.mjs';

const NOW=Date.parse('2026-07-31T12:02:00.000Z');
const clone=(value)=>structuredClone(value);
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const signer=(value)=>`ed25519:${sign(null,Buffer.from(g2CanonicalJson(value)),privateKey).toString('base64')}`;
const make=(options={})=>buildSyntheticG2Bundle({signCanonical:signer,...options});
const evaluate=(bundle,key=publicKey)=>evaluateG2BackupRestoreReadiness({...bundle,collectorPublicKey:key,now:NOW});
const code=(expected)=>(error)=>error?.code===expected;
function resignEvidence(bundle) { const unsigned={...bundle.evidence}; delete unsigned.signature; bundle.evidence.signature=signer(unsigned); }
function resignReceipt(bundle) { const inventory=deriveG2BackupRestoreInventory(bundle.evidence,bundle.challenge,bundle.policy); const unsigned={...bundle.providerReceipt,challengeDigest:g2Sha256(g2CanonicalJson(bundle.challenge)),evidenceDigest:g2Sha256(g2CanonicalJson(bundle.evidence)),inventoryDigest:g2Sha256(g2CanonicalJson(inventory))}; delete unsigned.signature; bundle.providerReceipt={...unsigned,signature:signer(unsigned)}; }

const fixtureRoot=new URL('./fixtures/g2-backup-restore-synthetic/',import.meta.url);
test('independently persisted externally signed sanitized positive fixture verifies',async()=>{const bundle=JSON.parse(await readFile(new URL('externally-signed-positive.json',fixtureRoot),'utf8'));const key=await readFile(new URL('collector-public.pem',fixtureRoot),'utf8');const receipt=evaluate(bundle,key);assert.equal(receipt.decision,'eligible_to_request_G2_approval');assert.equal(receipt.freshApprovalRequired,true);for(const field of ['hostedMutationAuthorized','g1Authorized','g2Authorized','backupExecutionAuthorized','restoreExecutionAuthorized','productionMutationAuthorized'])assert.equal(receipt[field],false);assert.equal(receipt.recomputedRpoMs,'1000');assert.equal(receipt.recomputedRtoMs,'2000');});
test('deterministic receipt and derived inventory',()=>{const b=make();assert.deepEqual(evaluate(b),evaluate(b));assert.equal(deriveG2BackupRestoreInventory(b.evidence,b.challenge,b.policy).schemaVersion,'wordle-royale-g2-backup-restore-inventory/v1');});
test('exact RPO and RTO policy boundaries are eligible',()=>{const b=make({rpoMs:'1000',rtoMs:'2000',maximumRpoMs:'1000',maximumRtoMs:'2000'});const r=evaluate(b);assert.equal(r.recomputedRpoMs,'1000');assert.equal(r.recomputedRtoMs,'2000');});
test('fast backup with an old recovery point fails data-loss RPO',()=>{assert.throws(()=>make({rpoMs:'1001',maximumRpoMs:'1000'}),code('RPO_EXCEEDED'));});
test('fast restore with late verification fails end-to-end RTO',()=>{assert.throws(()=>make({rtoMs:'2001',maximumRtoMs:'2000'}),code('RTO_EXCEEDED'));});
test('RPO uses source cutoff rather than fast backup duration',()=>{const b=make({rpoMs:'1000'});assert.equal(Date.parse(b.evidence.backupArtifact.completedAt)-Date.parse(b.evidence.backupArtifact.startedAt),100);assert.equal(evaluate(b).recomputedRpoMs,'1000');});
test('RTO uses verification completion rather than fast restore duration',()=>{const b=make({rtoMs:'2000'});assert.equal(Date.parse(b.evidence.restoreDrill.completedAt)-Date.parse(b.evidence.restoreDrill.startedAt),100);assert.equal(evaluate(b).recomputedRtoMs,'2000');});
test('reordered recovery point and source cutoff fail',()=>{const b=make();b.evidence.rpoRtoMeasurement.sourceCutoffAt='2026-07-31T12:00:19.999Z';assert.throws(()=>evaluate(b),code('RPO_TIME_ORDER_INVALID'));});
test('reordered restore request and verification fail',()=>{const b=make();b.evidence.rpoRtoMeasurement.verificationCompletedAt='2026-07-31T12:00:20.000Z';assert.throws(()=>evaluate(b),code('RTO_TIME_ORDER_INVALID'));});
test('negative claimed RPO and RTO values fail closed',()=>{for(const field of ['claimedRpoMs','claimedRtoMs']){const b=make();b.evidence.rpoRtoMeasurement[field]='-1';assert.throws(()=>evaluate(b),code('INVALID_MILLISECONDS'));}});
test('claimed RPO must match timestamp recomputation',()=>{const b=make();b.evidence.rpoRtoMeasurement.claimedRpoMs='999';assert.throws(()=>evaluate(b),code('CLAIMED_RPO_MISMATCH'));});
test('claimed RTO must match timestamp recomputation',()=>{const b=make();b.evidence.rpoRtoMeasurement.claimedRtoMs='1999';assert.throws(()=>evaluate(b),code('CLAIMED_RTO_MISMATCH'));});
test('measurement schema rejects unknown fields',()=>{const b=make();b.evidence.rpoRtoMeasurement.backupDurationMs='100';assert.throws(()=>evaluate(b),code('UNKNOWN_FIELD'));});
test('measurement timestamps outside signed evidence window fail',()=>{const b=make();b.evidence.rpoRtoMeasurement.recoveryPointAt='2026-07-31T11:59:59.999Z';assert.throws(()=>evaluate(b),code('EVIDENCE_TIME_OUTSIDE_WINDOW'));});
test('measurement must be causally bound to backup lifecycle',()=>{const b=make();b.evidence.backupArtifact.startedAt='2026-07-31T12:00:20.500Z';assert.throws(()=>evaluate(b),code('BACKUP_TIME_ORDER_INVALID'));});

const policyCases=[
 ['unknown protected policy field','UNKNOWN_FIELD',(b)=>{b.policy.extra=true;}],
 ['omitted protected policy field','OMITTED_FIELD',(b)=>{delete b.policy.migrationDigest;}],
 ['source SHA drift','CHALLENGE_SOURCE_BINDING_MISMATCH',(b)=>{b.policy.sourceGitSha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';}],
 ['source artifact digest drift','CHALLENGE_SOURCE_BINDING_MISMATCH',(b)=>{b.policy.sourceArtifactDigest=`sha256:${'a'.repeat(64)}`;}],
 ['migration digest drift','CHALLENGE_SOURCE_BINDING_MISMATCH',(b)=>{b.policy.migrationDigest=`sha256:${'a'.repeat(64)}`;}],
 ['intended and actual destination mismatch','RESTORE_DESTINATION_NOT_INTENDED',(b)=>{b.policy.identities.intendedRestore.databaseId='db-other';}],
 ['preview/production destination overlap','PREVIEW_PRODUCTION_DESTINATION_OVERLAP',(b)=>{for(const f of ['projectId','environmentId','serviceId','databaseId','endpointId'])b.policy.identities.restoreDestination[f]=b.policy.identities.intendedRestore[f]=b.policy.identities.sourceProduction[f];}],
 ['duplicate logical source/destination identity','PREVIEW_PRODUCTION_DESTINATION_OVERLAP',(b)=>{b.policy.identities.intendedRestore=b.policy.identities.sourceProduction;b.policy.identities.restoreDestination=b.policy.identities.sourceProduction;}],
 ['unsafe integer spelling','INVALID_MILLISECONDS',(b)=>{b.policy.providerPolicy.maximumRpoMs='01';}],
 ['milliseconds overflow','MILLISECONDS_OUT_OF_RANGE',(b)=>{b.policy.providerPolicy.maximumRtoMs='31536000001';}],
 ['milliseconds unit suffix rejected','INVALID_MILLISECONDS',(b)=>{b.policy.providerPolicy.maximumRtoMs='2s';}],
];
for(const [name,expected,mutate] of policyCases)test(name,()=>{const b=make();mutate(b);assert.throws(()=>evaluate(b),code(expected));});

const challengeCases=[
 ['mixed challenge run','PROTECTED_CHALLENGE_MISMATCH',(b)=>{b.challenge.runId='run-other';}],
 ['challenge source identity mutation','CHALLENGE_IDENTITY_MISMATCH',(b)=>{b.challenge.identities.sourceProduction.databaseId='db-other';}],
 ['challenge policy digest mutation','CHALLENGE_POLICY_DIGEST_MISMATCH',(b)=>{b.challenge.providerPolicyDigest=`sha256:${'a'.repeat(64)}`;}],
 ['noncanonical timestamp','INVALID_TIMESTAMP',(b)=>{b.challenge.issuedAt='2026-07-31T12:00:00Z';}],
];
for(const [name,expected,mutate]of challengeCases)test(name,()=>{const b=make();mutate(b);assert.throws(()=>evaluate(b),code(expected));});
test('stale fully rebound signed challenge fails',()=>{const b=make();b.challenge.expiresAt='2026-07-31T12:01:00.000Z';b.evidence.expiresAt=b.challenge.expiresAt;b.evidence.challengeDigest=g2Sha256(g2CanonicalJson(b.challenge));resignEvidence(b);resignReceipt(b);assert.throws(()=>evaluate(b),code('EXPIRED_CHALLENGE'));});
test('fully signed evidence observed after the evaluation clock fails',()=>{const b=make();assert.throws(()=>evaluateG2BackupRestoreReadiness({...b,collectorPublicKey:publicKey,now:Date.parse(b.evidence.observedAt)-1}),code('FUTURE_EVIDENCE'));});

const evidenceCases=[
 ['unknown signed evidence field','UNKNOWN_FIELD',(e)=>{e.unexpected=true;}],
 ['omitted logical evidence field','OMITTED_FIELD',(e)=>{delete e.cleanup;}],
 ['mixed evidence run','CHALLENGE_BINDING_MISMATCH',(e)=>{e.runId='run-other';}],
 ['backup run differs','MIXED_RUN_EVIDENCE',(e)=>{e.backupArtifact.runId='run-other';}],
 ['drill run differs','MIXED_RUN_EVIDENCE',(e)=>{e.restoreDrill.runId='run-other';}],
 ['artifact/drill ID mismatch','ARTIFACT_DRILL_MISMATCH',(e)=>{e.restoreDrill.artifactId='backup-other';}],
 ['artifact/drill digest mismatch','ARTIFACT_DRILL_MISMATCH',(e)=>{e.restoreDrill.artifactDigest=`sha256:${'a'.repeat(64)}`;}],
 ['actual backup incomplete','BACKUP_NOT_COMPLETED',(e)=>{e.backupArtifact.status='started';}],
 ['restore unsuccessful','RESTORE_NOT_SUCCESSFUL',(e)=>{e.restoreDrill.status='failed';}],
 ['restore not isolated','RESTORE_NOT_ISOLATED',(e)=>{e.restoreDrill.isolated=false;}],
 ['row-count-only proof rejected','OMITTED_FIELD',(e)=>{delete e.restoreDrill.restoredProof.integrityDigest;}],
 ['row count mismatch','RESTORE_COUNT_MISMATCH',(e)=>{e.restoreDrill.restoredProof.counts.rows='41999';}],
 ['schema mismatch','RESTORE_PROOF_MISMATCH',(e)=>{e.restoreDrill.restoredProof.schemaDigest=`sha256:${'a'.repeat(64)}`;}],
 ['constraints mismatch','CONSTRAINTS_MISMATCH',(e)=>{e.restoreDrill.restoredProof.constraintsDigest=`sha256:${'a'.repeat(64)}`;}],
 ['migration mismatch','MIGRATION_DIGEST_MISMATCH',(e)=>{e.restoreDrill.restoredProof.migrationDigest=`sha256:${'a'.repeat(64)}`;}],
 ['integrity incomplete','INTEGRITY_PROOF_INCOMPLETE',(e)=>{e.restoreDrill.restoredProof.integrityChecksComplete=false;}],
 ['production mutation','PRODUCTION_MUTATION_OBSERVED',(e)=>{e.productionNoMutation.mutationCount='1';}],
 ['production no-mutation unconfirmed','PRODUCTION_NO_MUTATION_UNPROVEN',(e)=>{e.productionNoMutation.confirmed=false;}],
 ['cleanup present','CLEANUP_RESOURCE_PRESENT',(e)=>{e.cleanup.resourceLookup='present';}],
 ['cleanup pending deletion','CLEANUP_PENDING',(e)=>{e.cleanup.pendingDeletion=true;}],
 ['cleanup tombstone','CLEANUP_TOMBSTONE_REMAINS',(e)=>{e.cleanup.tombstone=true;}],
 ['provider retention too short','PROVIDER_RETENTION_INADEQUATE',(e)=>{e.providerPolicyObservation.retentionMs='1000';}],
 ['declared retention disagreement','RETENTION_POLICY_MISMATCH',(e)=>{e.retention.minimumRetentionMs='86400000';}],
 ['actual retained-until inadequate','RETENTION_WINDOW_INADEQUATE',(e)=>{e.retention.retainedUntil=e.backupArtifact.completedAt;}],
 ['wrong production source identity','BACKUP_SOURCE_IDENTITY_MISMATCH',(e)=>{e.backupArtifact.sourceIdentity.databaseId='db-other';}],
 ['wrong restore destination','RESTORE_DESTINATION_MISMATCH',(e)=>{e.restoreDrill.destinationIdentity.databaseId='db-other';}],
 ['sensitive raw field','SENSITIVE_OR_RAW_FIELD_FORBIDDEN',(e)=>{e.backupArtifact.rawPayload='forbidden';}],
 ['credential-shaped field','SENSITIVE_OR_RAW_FIELD_FORBIDDEN',(e)=>{e.cleanup.databaseUrl='forbidden';}],
 ['decimal count overflow','MILLISECONDS_OUT_OF_RANGE',(e)=>{e.backupArtifact.sourceProof.counts.rows='31536000001';}],
 ['count unit suffix','INVALID_MILLISECONDS',(e)=>{e.backupArtifact.sourceProof.counts.rows='42rows';}],
];
for(const [name,expected,mutate]of evidenceCases)test(name,()=>{const b=make();mutate(b.evidence);assert.throws(()=>evaluate(b),code(expected));});

test('RPO one millisecond over bound fails',()=>{assert.throws(()=>make({rpoMs:'1001',maximumRpoMs:'1000'}),code('RPO_EXCEEDED'));});
test('RTO one millisecond over bound fails',()=>{assert.throws(()=>make({rtoMs:'2001',maximumRtoMs:'2000'}),code('RTO_EXCEEDED'));});
test('tampered evidence signature fails after otherwise valid rechain',()=>{const b=make();b.evidence.signature=b.evidence.signature.replace(/.$/u,'A');resignReceipt(b);assert.throws(()=>evaluate(b),code('INVALID_COLLECTOR_SIGNATURE'));});
test('wrong collector key fails',()=>{const b=make();const other=generateKeyPairSync('ed25519').publicKey;assert.throws(()=>evaluate(b,other),code('INVALID_PROVIDER_RECEIPT_SIGNATURE'));});
test('provider receipt digest mutation fails',()=>{const b=make();b.providerReceipt.inventoryDigest=`sha256:${'a'.repeat(64)}`;assert.throws(()=>evaluate(b),code('PROVIDER_RECEIPT_DIGEST_MISMATCH'));});
test('provider receipt signature mutation fails',()=>{const b=make();b.providerReceipt.signature=b.providerReceipt.signature.replace(/.$/u,'A');assert.throws(()=>evaluate(b),code('INVALID_PROVIDER_RECEIPT_SIGNATURE'));});
test('valid signed evidence mutation reaches source binding guard',()=>{const b=make();b.evidence.sourceGitSha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';resignEvidence(b);assert.throws(()=>evaluate(b),code('EVIDENCE_SOURCE_BINDING_MISMATCH'));});
test('cleanup is the exact aggregate observation and follows verification',()=>{for(const [value,expected] of [['2026-07-31T12:00:23.199Z','CLEANUP_NOT_AGGREGATE_OBSERVATION'],['2026-07-31T12:00:23.000Z','CLEANUP_TIME_ORDER_INVALID']]){const b=make();b.evidence.cleanup.checkedAt=value;assert.throws(()=>evaluate(b),code(expected));}});
test('production no-mutation coverage spans through cleanup and aggregate observation',()=>{for(const mutate of [(e)=>{e.productionNoMutation.windowCompletedAt=e.rpoRtoMeasurement.verificationCompletedAt;},(e)=>{e.productionNoMutation.windowStartedAt=e.backupArtifact.completedAt;}]){const b=make();mutate(b.evidence);assert.throws(()=>evaluate(b),code('PRODUCTION_WINDOW_INADEQUATE'));}});
