import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { chmod, copyFile, mkdtemp, mkdir, writeFile, readFile, stat, access, readdir, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  canonicalJson, sha256, evaluateRetryEligibility, retryConstants, RetryEligibilityError,
  CHALLENGE_SCHEMA, EVIDENCE_SCHEMA, PROVIDER_RECEIPT_SCHEMA, COLLECTOR, TARGET_SHA, QUALIFICATION_DIGEST,
  PRIOR_APPROVAL_ID, PRIOR_APPROVAL_DIGEST, PRIOR_ATTEMPT_DIGEST,
} from './g0-retry-eligibility-core.mjs';

const artifacts = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'g0-retry-sanitized-history');
const artifactPaths = {
  qualification: `${artifacts}/merged-local-qualification.json`,
  priorApproval: `${artifacts}/consumed-single-use-approval.json`,
  priorAttempt: `${artifacts}/rolled-back-attempt.json`,
};
const load = async (path) => JSON.parse(await readFile(path, 'utf8'));
const signed = (value, privateKey) => `ed25519:${sign(null, Buffer.from(canonicalJson(value)), privateKey).toString('base64')}`;
const OLD_TARGET_SHA = 'c1a17f98e555cbf2b291c5a87a6f6311cb8881bb';
const OLD_SOURCE_DIGEST = 'sha256:f5bff020a1de79205bf3b71bf3ae0f7c83f86da43d3457b833edafffba01cf79';
const OLD_QUALIFICATION_DIGEST = 'sha256:4a40fe2bba1d2c20bf15b8b33da1aeccaafff1fe0f34a5d63acea20859e23302';
function recomputeQualificationDigest(qualification) {
  const body = {...qualification}; delete body.receiptDigest;
  qualification.receiptDigest = sha256(canonicalJson(body));
  return qualification;
}
function fixture({ qualification, priorApproval, priorAttempt, now = Date.parse('2026-07-31T12:00:00.000Z'), tombstone = false, mutation = false, railwayCost = '4.9999', vercelCost = '0.0000' }) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const challenge = {
    schemaVersion:CHALLENGE_SCHEMA, challengeId:'challenge-retry-001', runId:'retry-run-001', nonce:'retry-nonce-001', issuedAt:new Date(now - 60_000).toISOString(), expiresAt:new Date(now + 60_000).toISOString(), collectorKeyId:'collector-key-retry-001',
    qualification:{receiptDigest:qualification.receiptDigest,targetSha:qualification.targetSha,sourceArtifactDigest:qualification.sourceArtifactDigest,manifestDigest:qualification.manifestDigest,providerDefaultPolicyDigest:qualification.providerDefaultPolicyDigest},
    priorConsumedApproval:{approvalId:PRIOR_APPROVAL_ID,artifactDigest:sha256(canonicalJson(priorApproval))}, priorAttempt:{artifactDigest:sha256(canonicalJson(priorAttempt))},
    expectedCreatedResources:Object.fromEntries(Object.entries(retryConstants.createdIds).map(([kind,id])=>[kind,{id,name:retryConstants.createdNames[kind]}])), expectedPreviewIds:{...retryConstants.preview},
  };
  const resources = Object.fromEntries(Object.entries(challenge.expectedCreatedResources).map(([kind,value]) => [kind,{...value,idLookup:'absent',nameLookup:'absent',pendingDeletion:false,tombstone:false}]));
  if (tombstone) resources.railwayProject.tombstone = true;
  const evidenceUnsigned = {
    schemaVersion:EVIDENCE_SCHEMA, collector:COLLECTOR, collectorKeyId:challenge.collectorKeyId, challengeDigest:sha256(canonicalJson(challenge)), challengeId:challenge.challengeId, runId:challenge.runId, nonce:challenge.nonce, observedAt:new Date(now - 10_000).toISOString(), expiresAt:challenge.expiresAt,
    observationMode:'provider_control_plane_read_only', providerMutationObserved:mutation,
    accounts:{ vercel:{...retryConstants.accounts.vercel,chargeUsd:vercelCost}, railway:{...retryConstants.accounts.railway} },
    cost:{currency:'USD',subtotalUsd:railwayCost,taxesUsd:'0.0000',feesUsd:'0.0000',creditsUsd:'0.0000',allInUsd:railwayCost},
    preview:{...retryConstants.preview,unchanged:true}, priorCreatedResources:resources,
  };
  const evidence = {...evidenceUnsigned,signature:signed(evidenceUnsigned,privateKey)};
  const inventory={schemaVersion:'wordle-provider-inventory/v3',collector:COLLECTOR,challengeId:challenge.challengeId,runId:challenge.runId,observedAt:evidence.observedAt,accounts:evidence.accounts,cost:evidence.cost,preview:evidence.preview,priorCreatedResources:evidence.priorCreatedResources};
  const providerReceiptUnsigned = { schemaVersion:PROVIDER_RECEIPT_SCHEMA, collector:COLLECTOR, collectorKeyId:challenge.collectorKeyId, challengeDigest:sha256(canonicalJson(challenge)), evidenceDigest:sha256(canonicalJson(evidence)),inventoryDigest:sha256(canonicalJson(inventory)) };
  const providerReceipt = {...providerReceiptUnsigned,signature:signed(providerReceiptUnsigned,privateKey)};
  const policy = { now, expectedChallengeId:challenge.challengeId, expectedRunId:challenge.runId, expectedNonce:challenge.nonce, expectedCollectorKeyId:challenge.collectorKeyId };
  return { qualification, priorApproval, priorAttempt, challenge, evidence, providerReceipt, collectorPublicKey:publicKey, policy, privateKey };
}
async function base() { return { qualification:await load(artifactPaths.qualification), priorApproval:await load(artifactPaths.priorApproval), priorAttempt:await load(artifactPaths.priorAttempt) }; }
function code(fn, expected) { assert.throws(fn, (error) => error instanceof RetryEligibilityError && error.code === expected); }
function resignEvidence(input) {
  const unsigned={...input.evidence}; delete unsigned.signature; input.evidence={...unsigned,signature:signed(unsigned,input.privateKey)};
  const inventory={schemaVersion:'wordle-provider-inventory/v3',collector:COLLECTOR,challengeId:input.challenge.challengeId,runId:input.challenge.runId,observedAt:input.evidence.observedAt,accounts:input.evidence.accounts,cost:input.evidence.cost,preview:input.evidence.preview,priorCreatedResources:input.evidence.priorCreatedResources};
  const receiptUnsigned={schemaVersion:PROVIDER_RECEIPT_SCHEMA,collector:COLLECTOR,collectorKeyId:input.challenge.collectorKeyId,challengeDigest:sha256(canonicalJson(input.challenge)),evidenceDigest:sha256(canonicalJson(input.evidence)),inventoryDigest:sha256(canonicalJson(inventory))};
  input.providerReceipt={...receiptUnsigned,signature:signed(receiptUnsigned,input.privateKey)};
}
function rebindReceipt(input) {
  const inventory={schemaVersion:'wordle-provider-inventory/v3',collector:COLLECTOR,challengeId:input.challenge.challengeId,runId:input.challenge.runId,observedAt:input.evidence.observedAt,accounts:input.evidence.accounts,cost:input.evidence.cost,preview:input.evidence.preview,priorCreatedResources:input.evidence.priorCreatedResources};
  const unsigned={schemaVersion:PROVIDER_RECEIPT_SCHEMA,collector:COLLECTOR,collectorKeyId:input.challenge.collectorKeyId,challengeDigest:sha256(canonicalJson(input.challenge)),evidenceDigest:sha256(canonicalJson(input.evidence)),inventoryDigest:sha256(canonicalJson(inventory))};
  input.providerReceipt={...unsigned,signature:signed(unsigned,input.privateKey)};
}
async function cliInvocation(input, { outputExists = false, policy = {}, raw = {}, env = {}, prepare } = {}) {
  const directory = await mkdtemp(join(tmpdir(),'g0-retry-hostile-')); const files = {};
  for (const key of ['qualification','priorApproval','priorAttempt','challenge','evidence','providerReceipt']) { files[key]=join(directory,`${key}.json`); await writeFile(files[key],raw[key] ?? `${JSON.stringify(input[key])}\n`,{mode:0o600}); }
  files.publicKey=join(directory,'collector.pem'); await writeFile(files.publicKey,input.collectorPublicKey.export({type:'spki',format:'pem'}),{mode:0o600});
  const replay=join(directory,'replay'); await mkdir(replay,{mode:0o700}); const output=join(directory,'receipt.json'); if(outputExists)await writeFile(output,'occupied\n',{mode:0o600});
  const expected={challengeId:input.challenge.challengeId,runId:input.challenge.runId,nonce:input.challenge.nonce,collectorKeyId:input.challenge.collectorKeyId,...policy};
  const args=['--qualification',files.qualification,'--prior-approval',files.priorApproval,'--prior-attempt',files.priorAttempt,'--challenge',files.challenge,'--evidence',files.evidence,'--provider-receipt',files.providerReceipt,'--collector-public-key',files.publicKey,'--expected-challenge-id',expected.challengeId,'--expected-run-id',expected.runId,'--expected-nonce',expected.nonce,'--expected-collector-key-id',expected.collectorKeyId,'--replay-dir',replay,'--output',output];
  const run=(customArgs=args)=>spawnSync(process.execPath,['scripts/g0-retry-eligibility.mjs',...customArgs],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,...env}});
  if (prepare) await prepare({directory,files,replay,output,args});
  return {directory,files,replay,output,args,run,result:run()};
}

test('deterministically emits eligibility-to-request only and binds all immutable artifacts', async () => {
  const artifacts = await base();
  assert.equal(artifacts.qualification.targetSha, TARGET_SHA);
  assert.equal(artifacts.qualification.sourceArtifactDigest, 'sha256:6713e86f13f0f9b3b5522eb8cbc15abb5953af40580102f1e08690e0215533da');
  assert.equal(artifacts.qualification.manifestDigest, 'sha256:e69d3757ec29176d9c0f22b7d4552bf979376b0363605a642ac339c41501d137');
  assert.equal(artifacts.qualification.providerDefaultPolicyDigest, 'sha256:d97ebf644ebc033f982e3ba284b0692ce173222fee42207e8beb14ff76b74e40');
  assert.equal(artifacts.qualification.receiptDigest, QUALIFICATION_DIGEST);
  assert.equal(recomputeQualificationDigest(structuredClone(artifacts.qualification)).receiptDigest, QUALIFICATION_DIGEST);
  assert.equal(sha256(canonicalJson(artifacts.priorApproval)), PRIOR_APPROVAL_DIGEST);
  assert.equal(sha256(canonicalJson(artifacts.priorAttempt)), PRIOR_ATTEMPT_DIGEST);
  assert.equal(artifacts.priorApproval.hostedMutationAuthorized, false);
  const input = fixture(artifacts); const first = evaluateRetryEligibility(input); const second = evaluateRetryEligibility(input);
  assert.deepEqual(first, second); assert.equal(first.decision, 'eligible_to_request_fresh_approval'); assert.equal(first.hostedMutationAuthorized, false); assert.equal(first.freshApprovalRequired, true);
  assert.equal(first.qualification.receiptDigest, QUALIFICATION_DIGEST); assert.equal(first.priorAttempt.exactCreatedResources.railwayServiceInstance.name,'wordle-royale-production-api');
});

test('fresh qualification pins reject stale and partial repins and challenge mismatch', async () => {
  const artifacts = await base();
  {
    const qualification = structuredClone(artifacts.qualification);
    qualification.targetSha = OLD_TARGET_SHA;
    qualification.sourceArtifactDigest = OLD_SOURCE_DIGEST;
    qualification.receiptDigest = OLD_QUALIFICATION_DIGEST;
    code(() => evaluateRetryEligibility(fixture({...artifacts, qualification})), 'QUALIFICATION_TARGET_MISMATCH');
  }
  {
    const qualification = structuredClone(artifacts.qualification);
    qualification.receiptDigest = OLD_QUALIFICATION_DIGEST;
    code(() => evaluateRetryEligibility(fixture({...artifacts, qualification})), 'QUALIFICATION_DIGEST_MISMATCH');
  }
  {
    const qualification = recomputeQualificationDigest({...structuredClone(artifacts.qualification), sourceArtifactDigest:OLD_SOURCE_DIGEST});
    assert.notEqual(qualification.receiptDigest, QUALIFICATION_DIGEST);
    code(() => evaluateRetryEligibility(fixture({...artifacts, qualification})), 'QUALIFICATION_NOT_EXACT_MERGED_RECEIPT');
  }
  {
    const input = fixture(artifacts);
    input.challenge.qualification.receiptDigest = OLD_QUALIFICATION_DIGEST;
    code(() => evaluateRetryEligibility(input), 'CHALLENGE_QUALIFICATION_MISMATCH');
  }
});

test('real recorded Railway tombstone state fails closed', async () => {
  const input = fixture({...await base(),tombstone:true}); code(() => evaluateRetryEligibility(input), 'TOMBSTONE_RAILWAY_REMAINS');
});

test('provider mutation, stale observations, costs, preview drift, and signatures fail closed', async () => {
  const b = await base();
  code(() => evaluateRetryEligibility(fixture({...b,mutation:true})), 'PROVIDER_MUTATION_OBSERVED');
  code(() => evaluateRetryEligibility(fixture({...b,railwayCost:'5.0000'})), 'COST_CAP_NOT_STRICTLY_BELOW');
  code(() => evaluateRetryEligibility(fixture({...b,vercelCost:'0.0100'})), 'VERCEL_CHARGE_NOT_ZERO');
  const stale = fixture(b); stale.policy.now = Date.parse(stale.challenge.expiresAt); code(() => evaluateRetryEligibility(stale), 'EXPIRED_CHALLENGE');
  const drift = fixture(b); drift.evidence.preview.vercelProjectId = 'prj_changedPreviewIdentifier'; code(() => evaluateRetryEligibility(drift), 'PREVIEW_IDENTITY_DRIFT');
  const tamper = fixture(b); tamper.evidence.cost.subtotalUsd = '1.0000'; code(() => evaluateRetryEligibility(tamper), 'COST_ARITHMETIC_INVALID');
});

test('CLI writes 0600 receipt, consumes nonce, and rejects replay', async () => {
  const b = await base(); const now = Date.now(); const input = fixture({...b,now}); const directory = await mkdtemp(join(tmpdir(),'g0-retry-test-'));
  const files = {};
  for (const key of ['qualification','priorApproval','priorAttempt']) { files[key] = join(directory,`${key}.json`); await copyFile(artifactPaths[key],files[key]); await chmod(files[key],0o600); }
  for (const key of ['challenge','evidence','providerReceipt']) { files[key] = join(directory,`${key}.json`); await writeFile(files[key],`${JSON.stringify(input[key])}\n`,{mode:0o600}); }
  files.publicKey = join(directory,'collector-public.pem'); await writeFile(files.publicKey,input.collectorPublicKey.export({type:'spki',format:'pem'}),{mode:0o600});
  const canaries=join(directory,'canaries'), marker=join(directory,'provider-command-ran'); await mkdir(canaries,{mode:0o700});
  for(const command of ['curl','wget','vercel','railway','supabase']) await writeFile(join(canaries,command),`#!/bin/sh\n: > "${marker}"\nexit 99\n`,{mode:0o700});
  const output = join(directory,'eligibility.json'); const replay = join(directory,'replay'); await mkdir(replay,{mode:0o700});
  const args = ['--qualification',files.qualification,'--prior-approval',files.priorApproval,'--prior-attempt',files.priorAttempt,'--challenge',files.challenge,'--evidence',files.evidence,'--provider-receipt',files.providerReceipt,'--collector-public-key',files.publicKey,'--expected-challenge-id',input.challenge.challengeId,'--expected-run-id',input.challenge.runId,'--expected-nonce',input.challenge.nonce,'--expected-collector-key-id',input.challenge.collectorKeyId,'--replay-dir',replay,'--output',output];
  const first = spawnSync(process.execPath,['scripts/g0-retry-eligibility.mjs',...args],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,PATH:canaries}}); assert.equal(first.status,0,first.stderr); assert.equal((await stat(output)).mode & 0o777,0o600); assert.equal(JSON.parse(await readFile(output,'utf8')).decision,'eligible_to_request_fresh_approval'); await assert.rejects(access(marker));
  const replayOutput = join(directory,'replay-output.json'); const secondArgs = [...args]; secondArgs[secondArgs.indexOf(output)] = replayOutput;
  const second = spawnSync(process.execPath,['scripts/g0-retry-eligibility.mjs',...secondArgs],{cwd:process.cwd(),encoding:'utf8'}); assert.equal(second.status,3); assert.equal(JSON.parse(second.stderr).code,'CHALLENGE_REPLAY');
});

test('subprocess rejects duplicate JSON exploit and unsafe protected files without side effects', async (t) => {
  const checkedFailure = async (name, options, expected) => t.test(name, async () => {
    const input=fixture({...await base(),now:Date.now()}); const canaries=await mkdtemp(join(tmpdir(),'g0-retry-canary-')); const marker=join(canaries,'provider-command-ran');
    for(const command of ['curl','wget','vercel','railway','supabase']) await writeFile(join(canaries,command),`#!/bin/sh\n: > "${marker}"\nexit 99\n`,{mode:0o700});
    const invocation=await cliInvocation(input,{...options(input),env:{PATH:canaries}});
    assert.equal(invocation.result.status,2,invocation.result.stderr); assert.equal(JSON.parse(invocation.result.stderr).code,expected);
    await assert.rejects(access(invocation.output)); assert.deepEqual(await readdir(invocation.replay),[]); await assert.rejects(access(marker));
    assert.equal((await readdir(invocation.directory)).some(name=>name.includes('.tmp-')),false); await rm(canaries,{recursive:true,force:true});
  });
  await checkedFailure('replays top-level providerMutationObserved true then false exploit', (input) => {
    const serialized=JSON.stringify(input.evidence); const raw=serialized.replace('"providerMutationObserved":false','"providerMutationObserved":true,"providerMutationObserved":false');
    assert.notEqual(raw,serialized); return {raw:{evidence:raw}};
  }, 'DUPLICATE_JSON_KEY');
  await checkedFailure('rejects a nested duplicate key', (input) => {
    const serialized=JSON.stringify(input.evidence); const raw=serialized.replace('"plan":"Hobby"','"plan":"Pro","plan":"Hobby"');
    assert.notEqual(raw,serialized); return {raw:{evidence:raw}};
  }, 'DUPLICATE_JSON_KEY');
  await checkedFailure('rejects a symlink input', () => ({prepare:async ({files,directory})=>{
    const target=join(directory,'evidence-target.json'); await copyFile(files.evidence,target); await chmod(target,0o600); await rm(files.evidence); await symlink(target,files.evidence);
  }}), 'UNSAFE_INPUT_FILE');
  await checkedFailure('rejects a permissive input mode', () => ({prepare:({files})=>chmod(files.evidence,0o640)}), 'UNSAFE_INPUT_FILE');
});

test('subprocess hostile matrix fails closed with no receipt', async () => {
  const cases=[];
  for(const kind of Object.keys(retryConstants.createdIds)) {
    cases.push([`target id ${kind}`,(x)=>{x.challenge.expectedCreatedResources[kind].id+='x';},'CHALLENGE_CREATED_RESOURCE_MISMATCH',false]);
    cases.push([`target name/recreation ${kind}`,(x)=>{x.evidence.priorCreatedResources[kind].name+='-recreated';},'OBSERVED_RESOURCE_NAME_MISMATCH',true]);
  }
  for(const key of Object.keys(retryConstants.preview)) cases.push([`preview ${key}`,(x)=>{x.evidence.preview[key]+='x';},'PREVIEW_IDENTITY_DRIFT',true]);
  cases.push(
    ['resource survives by id',x=>{x.evidence.priorCreatedResources.vercelProject.idLookup='present';},'PRIOR_RESOURCE_ID_SURVIVES',true],
    ['resource recreated by name',x=>{x.evidence.priorCreatedResources.vercelProject.nameLookup='present';},'PRIOR_RESOURCE_NAME_SURVIVES_OR_RECREATED',true],
    ['pending deletion',x=>{x.evidence.priorCreatedResources.railwayService.pendingDeletion=true;},'PENDING_DELETION_REMAINS',true],
    ['current tombstone shape',x=>{assert.equal(x.priorAttempt.rollback.railwayProviderTombstonePendingPurge,true);x.evidence.priorCreatedResources.railwayProject.tombstone=true;},'TOMBSTONE_RAILWAY_REMAINS',true],
    ['preview preservation',x=>{x.evidence.preview.unchanged=false;},'PREVIEW_PRESERVATION_UNPROVEN',true],
    ['provider mutation',x=>{x.evidence.providerMutationObserved=true;},'PROVIDER_MUTATION_OBSERVED',true],
    ['consumed approval altered',x=>{x.priorApproval.consumed=false;},'PRIOR_APPROVAL_ARTIFACT_MISMATCH',false],
    ['approval reuse/id',x=>{x.challenge.priorConsumedApproval.approvalId='prior-reused-approval';},'CHALLENGE_APPROVAL_MISMATCH',false],
    ['qualification digest',x=>{x.challenge.qualification.receiptDigest='sha256:'+'0'.repeat(64);},'CHALLENGE_QUALIFICATION_MISMATCH',false],
    ['approval digest',x=>{x.challenge.priorConsumedApproval.artifactDigest='sha256:'+'0'.repeat(64);},'CHALLENGE_APPROVAL_DIGEST_MISMATCH',false],
    ['attempt digest',x=>{x.challenge.priorAttempt.artifactDigest='sha256:'+'0'.repeat(64);},'CHALLENGE_ATTEMPT_DIGEST_MISMATCH',false],
    ['stale',x=>{x.challenge.issuedAt=new Date(Date.now()-120000).toISOString();x.challenge.expiresAt=new Date(Date.now()-1000).toISOString();},'EXPIRED_CHALLENGE',false],
    ['future',x=>{x.challenge.issuedAt=new Date(Date.now()+60000).toISOString();x.challenge.expiresAt=new Date(Date.now()+120000).toISOString();},'FUTURE_CHALLENGE',false],
    ['evidence signature',x=>{x.evidence.signature='ed25519:'+Buffer.alloc(64).toString('base64');},'INVALID_COLLECTOR_SIGNATURE','receipt'],
    ['receipt signature',x=>{x.providerReceipt.signature='ed25519:'+Buffer.alloc(64).toString('base64');},'INVALID_PROVIDER_RECEIPT_SIGNATURE',false],
    ['vercel account',x=>{x.evidence.accounts.vercel.teamId='team_wrong';},'VERCEL_ACCOUNT_OR_PLAN_MISMATCH',true],
    ['vercel plan',x=>{x.evidence.accounts.vercel.plan='Pro';},'VERCEL_ACCOUNT_OR_PLAN_MISMATCH',true],
    ['railway account',x=>{x.evidence.accounts.railway.workspaceId='workspace_wrong';},'RAILWAY_ACCOUNT_OR_PLAN_MISMATCH',true],
    ['railway plan',x=>{x.evidence.accounts.railway.plan='Pro';},'RAILWAY_ACCOUNT_OR_PLAN_MISMATCH',true],
    ['missing taxes',x=>{delete x.evidence.cost.taxesUsd;},'OMITTED_FIELD',true],
    ['missing fees',x=>{delete x.evidence.cost.feesUsd;},'OMITTED_FIELD',true],
    ['exact five',x=>{x.evidence.cost.subtotalUsd='5.0000';x.evidence.cost.allInUsd='5.0000';},'COST_CAP_NOT_STRICTLY_BELOW',true],
    ['over five',x=>{x.evidence.cost.subtotalUsd='5.0001';x.evidence.cost.allInUsd='5.0001';},'COST_CAP_NOT_STRICTLY_BELOW',true],
    ['cost arithmetic',x=>{x.evidence.cost.allInUsd='4.0000';},'COST_ARITHMETIC_INVALID',true],
    ['cost malformed',x=>{x.evidence.cost.subtotalUsd='4.99';},'COST_FORMAT_INVALID',true],
    ['secret field',x=>{x.evidence.secret='forbidden';},'SENSITIVE_OR_RAW_PROVIDER_DATA_FORBIDDEN',false],
    ['raw payload',x=>{x.evidence.rawPayload={};},'SENSITIVE_OR_RAW_PROVIDER_DATA_FORBIDDEN',false],
    ['unknown field',x=>{x.evidence.unexpected=true;},'UNKNOWN_FIELD',false],
    ['null object',x=>{x.evidence.accounts=null;},'INVALID_SHAPE',false],
  );
  for(const [label,mutate,expected,resign] of cases){const input=fixture({...await base(),now:Date.now()});mutate(input);if(resign===true)resignEvidence(input);else if(resign==='receipt')rebindReceipt(input);const invocation=await cliInvocation(input);assert.notEqual(invocation.result.status,0,label);assert.equal(JSON.parse(invocation.result.stderr).code,expected,label);await assert.rejects(access(invocation.output),label);assert.equal((await readdir(invocation.directory)).some(name=>name.includes('.tmp-')),false,label);}
});

test('subprocess protects ambient values and output failure does not burn nonce', async () => {
  const input=fixture({...await base(),now:Date.now()});
  for(const [field,value] of [['challengeId','wrong-challenge'],['runId','wrong-run'],['nonce','wrong-nonce'],['collectorKeyId','wrong-key']]){const invocation=await cliInvocation(input,{policy:{[field]:value}});assert.equal(JSON.parse(invocation.result.stderr).code,'PROTECTED_CHALLENGE_MISMATCH');await assert.rejects(access(invocation.output));}
  const blocked=await cliInvocation(input,{outputExists:true});assert.equal(JSON.parse(blocked.result.stderr).code,'OUTPUT_ALREADY_EXISTS');await unlink(blocked.output);const retryOutput=join(blocked.directory,'retry.json');const retryArgs=[...blocked.args];retryArgs[retryArgs.indexOf(blocked.output)]=retryOutput;const retry=blocked.run(retryArgs);assert.equal(retry.status,0,retry.stderr);assert.equal((await stat(retryOutput)).mode&0o777,0o600);assert.equal((await readdir(blocked.directory)).some(name=>name.includes('.tmp-')),false);
});
