import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseManifest, validateManifest, canonicalJson } from './g0-qualification-core.mjs';

const path = new URL('../docs/wordle-royale-g0-provisioning-manifest.yaml', import.meta.url);
const source = await readFile(path,'utf8');
const valid = () => parseManifest(source);
const rejects = (mutate, code) => assert.throws(() => validateManifest(mutate(valid())), (error) => error.code === code);

test('strict shipped manifest qualifies locally without claiming a source SHA', () => { const manifest=validateManifest(valid()); assert.equal(manifest.status,'local_qualification_required'); assert.equal(manifest.sourceSha,null); });
test('canonical JSON is key-order deterministic', () => assert.equal(canonicalJson({z:1,a:{y:2,x:3}}),'{"a":{"x":3,"y":2},"z":1}'));
test('parser rejects duplicate fields', () => assert.throws(() => parseManifest(source.replace('status: local_qualification_required','status: local_qualification_required\nstatus: local_qualification_required')), /MANIFEST_DUPLICATE_KEY/u));
test('parser rejects aliases and unsupported YAML', () => assert.throws(() => parseManifest(source.replace('principal: ashar','principal: &owner ashar')), /MANIFEST_UNSUPPORTED_YAML/u));
test('unknown top-level fields fail closed', () => { const m=valid(); m.futurePolicy=true; assert.throws(()=>validateManifest(m),/MANIFEST_TOP_LEVEL_SCHEMA_INVALID/u); });
test('stale Wave AD status is rejected', () => rejects((m)=>(m.status='blocked_pending_wave_ad_tooling',m),'MANIFEST_STATUS_INVALID'));
test('tracked source SHA is rejected as self-referential', () => rejects((m)=>(m.sourceSha='a'.repeat(40),m),'MANIFEST_SOURCE_MUST_BE_UNQUALIFIED'));
test('approval fields remain null', () => rejects((m)=>(m.approval.approvalId='secret-approval',m),'APPROVAL_NOT_NULL'));
test('decimal-safe cap rejects tiny overage', () => rejects((m)=>(m.cost.railwayCurrentBillingPeriodUsageApprox='5.0001',m),'COST_POLICY_INVALID'));
test('decimal parser rejects exponent notation', () => rejects((m)=>(m.cost.railwayCurrentBillingPeriodUsageApprox='1e0',m),'COST_INVALID'));
test('paid or overage approvals fail closed', () => rejects((m)=>(m.cost.overageApproved=true,m),'COST_POLICY_INVALID'));
test('preview identity drift is rejected', () => rejects((m)=>(m.previewPreservation.railway.projectId='different-preview-id',m),'PREVIEW_PRESERVATION_INVALID'));
test('preview mutation is rejected', () => rejects((m)=>(m.previewPreservation.mutationAllowed=true,m),'PREVIEW_PRESERVATION_INVALID'));
test('nonzero hosted action is rejected', () => rejects((m)=>(m.productionShells.railway.deployments='1',m),'ZERO_ACTION_POLICY_INVALID'));
test('G2 backup blocker cannot be downgraded', () => rejects((m)=>(m.blockingPrerequisites[2].state='resolved',m),'BLOCKER_CLASSIFICATION_INVALID'));
test('PLAN_AND_COST human fence cannot be removed', () => rejects((m)=>(m.blockingPrerequisites[3].state='resolved_by_wave_ad',m),'BLOCKER_CLASSIFICATION_INVALID'));
test('unknown blocker fields are rejected', () => rejects((m)=>(m.blockingPrerequisites[0].evidence='trust me',m),'BLOCKER_SCHEMA_INVALID'));
test('hosted mutation authorization is impossible', () => rejects((m)=>(m.nextGate.hostedMutationAuthorized=true,m),'HOSTED_MUTATION_FORBIDDEN'));
test('public origins and network actions remain empty', () => rejects((m)=>(m.network.providerGeneratedServingDomainsAllowed=true,m),'NETWORK_POLICY_INVALID'));

const setPath = (object, path, value) => { const parts=path.split('.'); const key=parts.pop(); let target=object; for(const part of parts) target=target[part]; target[key]=value; return object; };
const providerMutations = [
  ['policy','prefix-exact_unavoidable_inert_v1'], ['observationOnly',false], ['mutationAuthorized',true],
  ['vercel.reservedProjectDomainCount','0'], ['vercel.reservedProjectDomains',['wordle-royale-production-web.vercel.app.evil.invalid']],
  ['vercel.servingTargets','1'], ['vercel.customDomains',['wordle.example']], ['vercel.authoredDomains',['wordle-royale-production-web.vercel.app']],
  ['railway.metadataNames',['RAILWAY_ENVIRONMENT_ID','RAILWAY_ENVIRONMENT','RAILWAY_ENVIRONMENT_NAME','RAILWAY_PROJECT_ID','RAILWAY_PROJECT_NAME','RAILWAY_SERVICE_ID','RAILWAY_SERVICE_NAME']],
  ['railway.valuesInspectable',true], ['railway.userAuthoredVariables','1'], ['railway.serviceInstance.numReplicas','0'], ['railway.serviceInstance.regions',[{region:'sfo',replicas:'0'}]],
  ['railway.inertTemplate.regions',[{region:'us-west',replicas:'1'}]], ['railway.inertTemplate.source','source-id'], ['railway.inertTemplate.repository','owner/repository'],
  ['railway.inertTemplate.image','image:latest'], ['railway.inertTemplate.branch','main'], ['railway.inertTemplate.deployments','1'], ['railway.inertTemplate.latestDeployment','deployment-id'],
  ['railway.inertTemplate.activeDeployments','1'], ['railway.inertTemplate.domains','1'], ['railway.inertTemplate.urls','1'], ['railway.inertTemplate.activeReplicas','1'],
  ['railway.inertTemplate.databases','1'], ['railway.inertTemplate.volumes','1'],
];
test('every provider-default field fails closed on a one-field hostile mutation', async(t) => {
  for (const [path,value] of providerMutations) await t.test(path, () => rejects((m)=>setPath(m,`providerDefaults.${path}`,value),'PROVIDER_DEFAULT_POLICY_INVALID'));
});

test('Railway metadata names are an exact ordered seven-name closed set', async(t) => {
  const names=valid().providerDefaults.railway.metadataNames;
  const cases=[
    ['missing',names.slice(0,-1)], ['extra',[...names,'RAILWAY_GIT_BRANCH']], ['duplicate',[...names.slice(0,-1),names[0]]],
    ['reordered',[names[1],names[0],...names.slice(2)]], ['prefix',names.map((name,index)=>index ? name : `${name}_ID`)],
  ];
  for(const [name,value] of cases) await t.test(name,()=>rejects((m)=>(m.providerDefaults.railway.metadataNames=value,m),'PROVIDER_DEFAULT_POLICY_INVALID'));
});

test('reserved Vercel domain accepts no wildcard, prefix, suffix, case, preview, or cardinality variant', async(t) => {
  const cases=['*.vercel.app','wordle-royale-production-web','x.wordle-royale-production-web.vercel.app','wordle-royale-production-web.vercel.app.evil','WORDLE-ROYALE-PRODUCTION-WEB.VERCEL.APP','wordle-royale-production-web-git-main.vercel.app'];
  for(const value of cases) await t.test(value,()=>rejects((m)=>(m.providerDefaults.vercel.reservedProjectDomains=[value],m),'PROVIDER_DEFAULT_POLICY_INVALID'));
  await t.test('duplicate',()=>rejects((m)=>(m.providerDefaults.vercel.reservedProjectDomains=['wordle-royale-production-web.vercel.app','wordle-royale-production-web.vercel.app'],m),'PROVIDER_DEFAULT_POLICY_INVALID'));
});

test('provider-default unknown, missing, and secret-value-shaped fields fail closed', async(t) => {
  const cases=[
    ['top unknown',(m)=>(m.providerDefaults.future=true),'PROVIDER_DEFAULT_SCHEMA_INVALID'],
    ['Vercel unknown',(m)=>(m.providerDefaults.vercel.previewDomains=[]),'PROVIDER_DEFAULT_SCHEMA_INVALID'],
    ['Railway unknown',(m)=>(m.providerDefaults.railway.metadataValues=['SUPER_SECRET_CANARY']),'PROVIDER_DEFAULT_SCHEMA_INVALID'],
    ['service unknown',(m)=>(m.providerDefaults.railway.serviceInstance.activeReplicas=0),'PROVIDER_DEFAULT_SCHEMA_INVALID'],
    ['template unknown',(m)=>(m.providerDefaults.railway.inertTemplate.previewDeployment=null),'PROVIDER_DEFAULT_SCHEMA_INVALID'],
    ['region unknown',(m)=>(m.providerDefaults.railway.inertTemplate.regions[0].url=null),'PROVIDER_DEFAULT_SCHEMA_INVALID'],
    ['missing policy',(m)=>delete m.providerDefaults.policy,'PROVIDER_DEFAULT_SCHEMA_INVALID'],
    ['missing domain',(m)=>delete m.providerDefaults.vercel.reservedProjectDomains,'PROVIDER_DEFAULT_SCHEMA_INVALID'],
    ['missing source',(m)=>delete m.providerDefaults.railway.inertTemplate.source,'PROVIDER_DEFAULT_SCHEMA_INVALID'],
  ];
  for(const [name,mutate,code] of cases) await t.test(name,()=>rejects((m)=>(mutate(m),m),code));
});

test('retry remains closed and requires tombstones, rollback evidence, receipt, cost, and new human approval', () => {
  const gate=validateManifest(valid()).nextGate;
  assert.deepEqual(gate,{ name:'future G0 retry eligibility after repaired local qualification', retryGate:'closed', priorApprovalReusable:false, tombstoneAbsenceRequired:true, exactRollbackEvidenceRequired:true, newReceiptRequired:true, newCostObservationRequired:true, newHumanApprovalRequired:true, hostedMutationAuthorized:false });
});
