import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  G2_ADAPTER_ENVELOPE_SCHEMA, G2_OPERATION_PLAN_SCHEMA, G2_SEMANTIC_OPERATIONS,
  collectG2BackupRestoreEvidence,
} from './g2-backup-restore-evidence-collector-core.mjs';
import { evaluateG2BackupRestoreReadiness, g2CanonicalJson, g2Sha256 } from './g2-backup-restore-readiness-core.mjs';
import { buildSyntheticG2Bundle } from './g2-backup-restore-synthetic-fixture.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const otherKey = generateKeyPairSync('ed25519');
const signCanonical = () => 'ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
const template = () => buildSyntheticG2Bundle({ signCanonical });
const payloadField = Object.freeze({
  'provider-policy-observation':'providerPolicyObservation', 'rpo-rto-measurement':'rpoRtoMeasurement',
  'completed-backup-artifact':'backupArtifact', 'isolated-restore-drill':'restoreDrill',
  'production-no-mutation':'productionNoMutation', 'cleanup-absence-observation':'cleanup', 'retention-observation':'retention',
});
function operationPlan(challenge, policy) {
  const executable = (index) => ({ path:`/opt/wordle/bin/g2-adapter-${index}`, realpath:`/opt/wordle/bin/g2-adapter-${index}`, sha256:`sha256:${String(index + 1).repeat(64)}`, version:`g2-adapter-${index} 1.0.0`, uid:1000, mode:0o500 });
  return {
    schemaVersion:G2_OPERATION_PLAN_SCHEMA, challengeId:challenge.challengeId, runId:challenge.runId, nonce:challenge.nonce,
    keyId:challenge.collectorKeyId, challengeDigest:g2Sha256(g2CanonicalJson(challenge)), policyDigest:g2Sha256(g2CanonicalJson(policy)),
    operations:G2_SEMANTIC_OPERATIONS.map((semanticOperation,index)=>({ semanticOperation, executable:executable(index) })),
    limits:{ timeoutMs:1000, versionTimeoutMs:500, stdoutBytes:65536, stderrBytes:1024 },
  };
}
function envelope(bundle, semanticOperation) {
  const plan = operationPlan(bundle.challenge,bundle.policy);
  return {
    schemaVersion:G2_ADAPTER_ENVELOPE_SCHEMA, semanticOperation, adapterVersion:'synthetic-g2-adapter/1.0.0',
    challengeId:bundle.challenge.challengeId, runId:bundle.challenge.runId, nonce:bundle.challenge.nonce,
    collectorKeyId:bundle.challenge.collectorKeyId, challengeDigest:plan.challengeDigest, policyDigest:plan.policyDigest,
    attestedAt:bundle.evidence.observedAt, payload:structuredClone(bundle.evidence[payloadField[semanticOperation]]),
  };
}
function fakeRunner(bundle, mutate) {
  const calls=[];
  return { shellFree:true, calls, async run(spec) {
    calls.push(spec); const semanticOperation=spec.argv[spec.argv.indexOf('--semantic-operation')+1];
    let value=envelope(bundle,semanticOperation); const changed=mutate?.(value,semanticOperation,calls.length); if (changed !== undefined) value=changed;
    return { exitCode:0, stdout:Buffer.from(JSON.stringify(value)), stderr:Buffer.from('never publish this stderr') };
  } };
}
async function collect({ mutate, runner, planMutate, key=privateKey, expectedPublicKey=publicKey, clock=Date.parse('2026-07-31T12:04:00.000Z') }={}) {
  const bundle=template(); const plan=operationPlan(bundle.challenge,bundle.policy); planMutate?.(plan);
  return collectG2BackupRestoreEvidence({ challenge:bundle.challenge, policy:bundle.policy, operationPlan:plan, signingKey:key, collectorPublicKey:expectedPublicKey, childRunner:runner ?? fakeRunner(bundle,mutate), clock:()=>clock });
}
const rejects = async (options, codes) => assert.rejects(() => collect(options), (error) => (Array.isArray(codes)?codes:[codes]).includes(error.code));

test('positive collector executes exactly seven fixed shell-free calls in semantic order and is accepted by Wave AH', async () => {
  const source=template(); const runner=fakeRunner(source); const result=await collect({runner});
  assert.equal(runner.calls.length,7);
  for (const [index,call] of runner.calls.entries()) {
    assert.deepEqual(Object.keys(call).sort(),['argv','executable','limits','shell']); assert.equal(call.shell,false);
    assert.equal(call.argv[0],'collect'); assert.equal(call.argv[call.argv.indexOf('--semantic-operation')+1],G2_SEMANTIC_OPERATIONS[index]);
    assert.deepEqual(call.argv.slice(-2),['--format','json']);
    assert.equal(call.argv.some((value)=>/^--(?:argv|url|host|sql|token|cleanup|mutation)/iu.test(value)),false);
    assert.equal(call.executable.path,`/opt/wordle/bin/g2-adapter-${index}`); assert.equal(call.executable.mode,0o500);
  }
  assert.equal(result.inventory.runId,source.challenge.runId); assert.equal(result.eligibility.decision,'eligible_to_request_G2_approval');
  for (const field of ['hostedMutationAuthorized','g1Authorized','g2Authorized','backupExecutionAuthorized','restoreExecutionAuthorized','productionMutationAuthorized']) assert.equal(result.eligibility[field],false);
  const evaluated=evaluateG2BackupRestoreReadiness({ challenge:result.challenge,evidence:result.evidence,providerReceipt:result.providerReceipt,collectorPublicKey:publicKey,policy:source.policy,now:Date.parse('2026-07-31T12:04:00.000Z') });
  assert.equal(evaluated.receiptDigest,result.eligibility.receiptDigest);
  assert.equal(g2CanonicalJson(result).includes('never publish this stderr'),false);
});

test('every operation failure aborts with a sanitized error and no raw stdout/stderr', async () => {
  for (const failed of G2_SEMANTIC_OPERATIONS) {
    const bundle=template(); const runner=fakeRunner(bundle); runner.run=async function(spec) { this.calls.push(spec); const operation=spec.argv[spec.argv.indexOf('--semantic-operation')+1]; if(operation===failed){ const error=new Error('credential stderr canary'); error.code='PROCESS_TIMEOUT'; throw error; } return fakeRunner(bundle).run(spec); };
    await assert.rejects(()=>collect({runner}),(error)=>error.code==='PROCESS_TIMEOUT'&&!error.message.includes('canary'));
  }
});

test('plan is closed, exactly ordered/bound, executable-pinned, globally bounded, and has no caller operation options', async () => {
  await rejects({planMutate:(p)=>{p.argv=['--host','evil'];}},'UNKNOWN_FIELD');
  await rejects({planMutate:(p)=>{delete p.nonce;}},'OMITTED_FIELD');
  await rejects({planMutate:(p)=>{p.operations[1].semanticOperation=p.operations[0].semanticOperation;}},'OPERATION_ORDER_INVALID');
  await rejects({planMutate:(p)=>{p.operations.reverse();}},'OPERATION_ORDER_INVALID');
  await rejects({planMutate:(p)=>{p.challengeDigest=`sha256:${'f'.repeat(64)}`;}},'OPERATION_PLAN_BINDING_MISMATCH');
  await rejects({planMutate:(p)=>{p.policyDigest=`sha256:${'e'.repeat(64)}`;}},'OPERATION_PLAN_BINDING_MISMATCH');
  await rejects({planMutate:(p)=>{p.operations[0].executable.path='relative';}},'EXECUTABLE_PATH_NOT_ABSOLUTE');
  await rejects({planMutate:(p)=>{p.operations[0].executable.mode=0o555;}},'INVALID_EXECUTABLE_POLICY');
  await rejects({planMutate:(p)=>{p.limits.stdoutBytes=1024*1024+1;}},'INVALID_LIMIT');
  await rejects({runner:{shellFree:false,run:async()=>{throw new Error('must not run');}}},'SHELL_FREE_CHILD_RUNNER_REQUIRED');
});

test('adapter envelopes reject malformed, unknown, omitted, duplicate semantic, mixed bindings, oversized and nonzero outputs', async () => {
  await rejects({mutate:(v,_op,n)=>n===1?{...v,unknown:true}:v},'UNKNOWN_FIELD');
  await rejects({mutate:(v,_op,n)=>{if(n===1)delete v.nonce;return v;}},'OMITTED_FIELD');
  await rejects({mutate:(v,_op,n)=>n===2?{...v,semanticOperation:G2_SEMANTIC_OPERATIONS[0]}:v},'SEMANTIC_OPERATION_MISMATCH');
  await rejects({mutate:(v,_op,n)=>n===3?{...v,runId:'run-mixed-evidence'}:v},'ADAPTER_BINDING_MISMATCH');
  const bundle=template(); await rejects({runner:{shellFree:true,async run(){return{exitCode:0,stdout:Buffer.from('{bad json'),stderr:Buffer.alloc(0)}}}},'ADAPTER_OUTPUT_JSON');
  await rejects({runner:{shellFree:true,async run(){return{exitCode:1,stdout:Buffer.from(JSON.stringify(envelope(bundle,G2_SEMANTIC_OPERATIONS[0]))),stderr:Buffer.from('secret')}}}},'OPERATION_FAILED');
  await rejects({runner:{shellFree:true,async run(){return{exitCode:0,stdout:Buffer.alloc(1024*1024+1),stderr:Buffer.alloc(0)}}}},'ADAPTER_OUTPUT_SIZE');
});

test('recursive raw/secret fields and credential-shaped values are rejected before signing', async () => {
  await rejects({mutate:(v,_op,n)=>{if(n===1)v.payload.nested={rawCredential:'x'};return v;}},['UNKNOWN_FIELD','SECRET_OR_RAW_FIELD_FORBIDDEN']);
  await rejects({mutate:(v,op)=>{if(op==='completed-backup-artifact')v.payload.sourceProof.unexpected=true;return v;}},'UNKNOWN_FIELD');
  await rejects({mutate:(v,op)=>{if(op==='completed-backup-artifact')delete v.payload.sourceProof.dataDigest;return v;}},'OMITTED_FIELD');
  await rejects({mutate:(v,_op,n)=>{if(n===1)v.payload.provider='Bearer abc.def.ghi';return v;}},'SECRET_OR_CREDENTIAL_VALUE_FORBIDDEN');
  await rejects({mutate:(v,_op,n)=>{if(n===1)v.payload.provider='postgresql://user:password@host/db';return v;}},'SECRET_OR_CREDENTIAL_VALUE_FORBIDDEN');
});

test('source, artifact, destination, run and identity mixing fail closed', async () => {
  await rejects({mutate:(v,op)=>{if(op==='completed-backup-artifact')v.payload.sourceGitSha='f'.repeat(40);return v;}},'BACKUP_SOURCE_BINDING_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='completed-backup-artifact')v.payload.runId='run-other';return v;}},'MIXED_RUN_EVIDENCE');
  await rejects({mutate:(v,op)=>{if(op==='isolated-restore-drill')v.payload.artifactDigest=`sha256:${'9'.repeat(64)}`;return v;}},'ARTIFACT_DRILL_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='isolated-restore-drill')v.payload.destinationIdentity.databaseId='db-production';return v;}},'RESTORE_DESTINATION_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='production-no-mutation')v.payload.identity.projectId='project-preview';return v;}},'PRODUCTION_IDENTITY_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='cleanup-absence-observation')v.payload.destinationIdentity.endpointId='endpoint-production';return v;}},'CLEANUP_IDENTITY_MISMATCH');
});

test('proof digest/count/integrity disagreement and restore status/isolation fail closed', async () => {
  await rejects({mutate:(v,op)=>{if(op==='isolated-restore-drill')v.payload.restoredProof.dataDigest=`sha256:${'a'.repeat(64)}`;return v;}},'RESTORE_PROOF_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='isolated-restore-drill')v.payload.restoredProof.constraintsDigest=`sha256:${'b'.repeat(64)}`;return v;}},'CONSTRAINTS_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='isolated-restore-drill')v.payload.restoredProof.counts.rows='41999';return v;}},'RESTORE_COUNT_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='completed-backup-artifact')v.payload.sourceProof.integrityChecksComplete=false;return v;}},'INTEGRITY_PROOF_INCOMPLETE');
  await rejects({mutate:(v,op)=>{if(op==='isolated-restore-drill')v.payload.isolated=false;return v;}},'RESTORE_NOT_ISOLATED');
  await rejects({mutate:(v,op)=>{if(op==='isolated-restore-drill')v.payload.status='failed';return v;}},'RESTORE_NOT_SUCCESSFUL');
});

test('canonical challenge/production time bounds and backup/restore causality fail closed', async () => {
  await rejects({mutate:(v,_op,n)=>{if(n===1)v.attestedAt='2026-07-31T12:00:00Z';return v;}},'INVALID_TIMESTAMP');
  await rejects({mutate:(v,_op,n)=>{if(n===1)v.attestedAt='2026-07-31T12:04:01.000Z';return v;}},'ADAPTER_TIME_OUTSIDE_WINDOW');
  await rejects({mutate:(v,op)=>{if(op==='completed-backup-artifact')v.payload.completedAt='2026-07-31T12:00:00.000Z';return v;}},'BACKUP_TIME_ORDER_INVALID');
  await rejects({mutate:(v,op)=>{if(op==='isolated-restore-drill')v.payload.startedAt='2026-07-31T12:00:00.000Z';return v;}},'RESTORE_TIME_ORDER_INVALID');
  await rejects({clock:Date.parse('2026-07-31T12:00:10.000Z')},'ADAPTER_TIME_OUTSIDE_WINDOW');
});

test('RPO/RTO arithmetic, representation and inclusive policy bounds are enforced', async () => {
  await rejects({mutate:(v,op)=>{if(op==='rpo-rto-measurement')v.payload.claimedRpoMs='999';return v;}},'CLAIMED_RPO_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='rpo-rto-measurement')v.payload.claimedRtoMs='2001';return v;}},'CLAIMED_RTO_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='rpo-rto-measurement')v.payload.claimedRpoMs='01';return v;}},'INVALID_MILLISECONDS');
  const bounded=template(); bounded.policy.providerPolicy.maximumRpoMs='1000'; bounded.policy.providerPolicy.maximumRtoMs='2000'; bounded.challenge.providerPolicyDigest=g2Sha256(g2CanonicalJson(bounded.policy.providerPolicy));
  const runner=fakeRunner(bounded); const result=await collectG2BackupRestoreEvidence({challenge:bounded.challenge,policy:bounded.policy,operationPlan:operationPlan(bounded.challenge,bounded.policy),signingKey:privateKey,collectorPublicKey:publicKey,childRunner:runner,clock:()=>Date.parse('2026-07-31T12:04:00.000Z')});
  assert.equal(result.inventory.recomputedRpoMs,'1000'); assert.equal(result.inventory.recomputedRtoMs,'2000');
});

test('production no-mutation, aggregate cleanup exact absence, and retention semantics fail closed', async () => {
  await rejects({mutate:(v,op)=>{if(op==='production-no-mutation')v.payload.mutationCount='1';return v;}},'PRODUCTION_MUTATION_OBSERVED');
  await rejects({mutate:(v,op)=>{if(op==='production-no-mutation')v.payload.windowCompletedAt='2026-07-31T12:00:25.000Z';return v;}},['PRODUCTION_WINDOW_INADEQUATE','EVIDENCE_TIME_OUTSIDE_WINDOW']);
  await rejects({mutate:(v,op)=>{if(op==='cleanup-absence-observation')v.payload.resourceLookup='present';return v;}},'CLEANUP_RESOURCE_PRESENT');
  await rejects({mutate:(v,op)=>{if(op==='cleanup-absence-observation')v.payload.checkedAt='2026-07-31T12:00:24.000Z';return v;}},['CLEANUP_TIME_ORDER_INVALID','CLEANUP_NOT_AGGREGATE_OBSERVATION','EVIDENCE_TIME_OUTSIDE_WINDOW']);
  await rejects({mutate:(v,op)=>{if(op==='retention-observation')v.payload.artifactId='backup-artifact-other';return v;}},'RETENTION_ARTIFACT_MISMATCH');
  await rejects({mutate:(v,op)=>{if(op==='retention-observation')v.payload.retainedUntil='2026-07-31T12:01:00.000Z';return v;}},'RETENTION_WINDOW_INADEQUATE');
});

test('Ed25519 key type/match and evidence/receipt signature paths fail closed', async () => {
  await rejects({expectedPublicKey:otherKey.publicKey},'COLLECTOR_KEY_MISMATCH');
  const rsa=generateKeyPairSync('rsa',{modulusLength:2048}); await rejects({key:rsa.privateKey,expectedPublicKey:rsa.publicKey},'INVALID_SIGNING_KEY');
  const result=await collect(); const source=template();
  const evidenceTamper=structuredClone(result); evidenceTamper.evidence.backupArtifact.artifactId='backup-artifact-tampered';
  assert.throws(()=>evaluateG2BackupRestoreReadiness({challenge:evidenceTamper.challenge,evidence:evidenceTamper.evidence,providerReceipt:evidenceTamper.providerReceipt,collectorPublicKey:publicKey,policy:source.policy,now:Date.parse('2026-07-31T12:04:00.000Z')}));
  const receiptTamper=structuredClone(result); receiptTamper.providerReceipt.signature=receiptTamper.evidence.signature;
  assert.throws(()=>evaluateG2BackupRestoreReadiness({challenge:receiptTamper.challenge,evidence:receiptTamper.evidence,providerReceipt:receiptTamper.providerReceipt,collectorPublicKey:publicKey,policy:source.policy,now:Date.parse('2026-07-31T12:04:00.000Z')}),(error)=>['INVALID_PROVIDER_RECEIPT_SIGNATURE','INVALID_RECEIPT_SIGNATURE'].includes(error.code));
});
