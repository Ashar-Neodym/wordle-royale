import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, copyFile, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('..',import.meta.url));
const changed = ['docs/wordle-royale-g0-provisioning-manifest.yaml','package.json','scripts/g0-qualification-core.mjs','scripts/g0-qualification.mjs','scripts/g0-qualification.test.mjs','scripts/g0-qualification-cli.e2e.test.mjs'];
let root, template;
const git = (repo,args) => { const result=spawnSync('/usr/bin/git',['-C',repo,...args],{encoding:'utf8'}); assert.equal(result.status,0,result.stderr); return result.stdout.trim(); };
async function fixture() { const path=join(root,`repo-${Math.random().toString(16).slice(2)}`); git(root,['clone','--quiet','--no-hardlinks',template,path]); git(path,['config','remote.origin.url','git@github.com:Ashar-Neodym/wordle-royale.git']); git(path,['config','user.name','Wave AE Test']); git(path,['config','user.email','wave-ae@example.invalid']); return path; }
function invoke(repo, extra=[], receipt=join(root,`receipt-${Math.random().toString(16).slice(2)}.json`)) {
  const sha=git(repo,['rev-parse','HEAD']); const args=[join(repo,'scripts/g0-qualification.mjs'),'--repo',repo,'--manifest',join(repo,'docs/wordle-royale-g0-provisioning-manifest.yaml'),'--target-sha',sha,'--receipt',receipt,...extra];
  const result=spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,PATH:`${join(root,'canary-bin')}:/usr/bin:/bin`,DATABASE_URL:'postgresql://forbidden-secret@network.invalid/db',VERCEL_TOKEN:'forbidden-token'}});
  return { ...result, receipt, sha, json:JSON.parse((result.status===0?result.stdout:result.stderr).trim()) };
}
async function amend(repo,path,find,replacement) { const full=join(repo,path); const text=await readFile(full,'utf8'); await writeFile(full,text.replace(find,replacement)); git(repo,['add',path]); git(repo,['commit','--quiet','-m','fixture mutation']); }

before(async()=>{
  root=await mkdtemp(join(tmpdir(),'g0-qualification-e2e-')); template=join(root,'template'); git(root,['clone','--quiet','--no-hardlinks',sourceRoot,template]);
  for(const path of changed){ await mkdir(join(template,path,'..'),{recursive:true}); await copyFile(join(sourceRoot,path),join(template,path)); }
  git(template,['config','user.name','G0 Test']); git(template,['config','user.email','g0@example.invalid']); git(template,['config','remote.origin.url','git@github.com:Ashar-Neodym/wordle-royale.git']); git(template,['add',...changed]); if (git(template,['status','--porcelain=v1'])) git(template,['commit','--quiet','-m','fixture Wave AE']);
  const bin=join(root,'canary-bin'); await mkdir(bin); for(const name of ['curl','wget','vercel','railway','supabase']) { const path=join(bin,name); await writeFile(path,'#!/bin/sh\necho NETWORK_OR_PROVIDER_CANARY >&2\nexit 97\n'); await chmod(path,0o755); }
});
after(async()=>rm(root,{recursive:true,force:true}));

test('shipped CLI emits an owner-only local receipt with no provider/network access', async()=>{ const repo=await fixture(), result=invoke(repo); assert.equal(result.status,0,result.stderr); assert.equal(result.json.ok,true); assert.equal(result.json.hostedMutationAuthorized,false); assert.equal(result.json.retryGate,'closed'); assert.match(result.json.providerDefaultPolicyDigest,/^sha256:[0-9a-f]{64}$/u); assert.doesNotMatch(result.stdout+result.stderr,/CANARY|forbidden-secret|forbidden-token/u); const receipt=JSON.parse(await readFile(result.receipt,'utf8')); assert.equal(receipt.targetSha,result.sha); assert.equal(receipt.hostedMutationAuthorized,false); assert.equal(receipt.retryGate,'closed'); assert.equal(receipt.providerDefaultPolicyDigest,result.json.providerDefaultPolicyDigest); assert.equal(receipt.blockers.railwayBackupRestore,'G2_deferred'); assert.equal(receipt.blockers.planAndCost,'human_approval_required'); assert.equal((await lstat(result.receipt)).mode & 0o777,0o600); });
test('artifact and receipt digests are deterministic for identical Git objects', async()=>{ const a=invoke(await fixture()), b=invoke(await fixture()); assert.equal(a.status,0); assert.equal(b.status,0); assert.equal(a.json.sourceArtifactDigest,b.json.sourceArtifactDigest); assert.equal(a.json.manifestDigest,b.json.manifestDigest); assert.equal(a.json.providerDefaultPolicyDigest,b.json.providerDefaultPolicyDigest); assert.equal(a.json.receiptDigest,b.json.receiptDigest); });
test('artifact digest binds path, mode, and content', async()=>{ const base=invoke(await fixture()); const contentRepo=await fixture(); await amend(contentRepo,'README.md','Wordle','wordle'); const content=invoke(contentRepo); const modeRepo=await fixture(); await chmod(join(modeRepo,'README.md'),0o755); git(modeRepo,['add','README.md']); git(modeRepo,['commit','--quiet','-m','mode']); const mode=invoke(modeRepo); const pathRepo=await fixture(); git(pathRepo,['mv','README.md','README-renamed.md']); git(pathRepo,['commit','--quiet','-m','path']); const path=invoke(pathRepo); for(const item of [base,content,mode,path]) assert.equal(item.status,0,item.stderr); assert.equal(new Set([base.json.sourceArtifactDigest,content.json.sourceArtifactDigest,mode.json.sourceArtifactDigest,path.json.sourceArtifactDigest]).size,4); });
test('stale target SHA is rejected', async()=>{ const repo=await fixture(); await writeFile(join(repo,'dirty.txt'),'x'); git(repo,['add','dirty.txt']); git(repo,['commit','--quiet','-m','new head']); const stale=git(repo,['rev-parse','HEAD^']); const receipt=join(root,'stale.json'); const result=spawnSync(process.execPath,[join(repo,'scripts/g0-qualification.mjs'),'--repo',repo,'--manifest',join(repo,'docs/wordle-royale-g0-provisioning-manifest.yaml'),'--target-sha',stale,'--receipt',receipt],{encoding:'utf8'}); assert.equal(result.status,1); assert.equal(JSON.parse(result.stderr).code,'TARGET_SHA_STALE'); });
test('dirty tracked or untracked source is rejected', async()=>{ const repo=await fixture(); await writeFile(join(repo,'untracked-sensitive'),'x'); const result=invoke(repo); assert.equal(result.status,1); assert.equal(result.json.code,'RELEVANT_TREE_DIRTY'); });
test('approval, cost, preview, and gate manifest negatives fail closed', async(t)=>{ const cases=[['approvalId: null','approvalId: leaked','APPROVAL_NOT_NULL'],['railwayCurrentBillingPeriodUsageApprox: 1.3531','railwayCurrentBillingPeriodUsageApprox: 5.0001','COST_POLICY_INVALID'],['mutationAllowed: false','mutationAllowed: true','PREVIEW_PRESERVATION_INVALID'],['hostedMutationAuthorized: false','hostedMutationAuthorized: true','HOSTED_MUTATION_FORBIDDEN']]; for(const [find,repl,code] of cases) await t.test(code,async()=>{ const repo=await fixture(); await amend(repo,'docs/wordle-royale-g0-provisioning-manifest.yaml',find,repl); const result=invoke(repo); assert.equal(result.status,1); assert.equal(result.json.code,code); assert.doesNotMatch(result.stderr,/leaked/u); }); });
test('full manifest policy mutations fail in genuine committed CLI subprocesses', async(t)=>{
  const cases = [
    ['Vercel project count', '  vercel:\n    projectCount: 1', '  vercel:\n    projectCount: 999', 'ZERO_ACTION_POLICY_INVALID'],
    ['private network fence', 'apiAndPostgresPrivateNetwork: true', 'apiAndPostgresPrivateNetwork: false', 'TOPOLOGY_POLICY_INVALID'],
    ['Vercel target plan', 'vercelTargetPlan: Hobby', 'vercelTargetPlan: Enterprise', 'COST_POLICY_INVALID'],
    ['Vercel eligibility reconfirmation', 'vercelEligibilityMustBeReconfirmed: true', 'vercelEligibilityMustBeReconfirmed: false', 'COST_POLICY_INVALID'],
    ['required forbidden action', '  - source image or branch assignment', '  - source image linkage is allowed', 'FORBIDDEN_POLICY_INVALID'],
    ['rollback order step', '  - delete new API service shell', '  - retain new API service shell', 'ROLLBACK_POLICY_INVALID'],
    ['backup blocker reason', 'backup retention, restore destination, RPO/RTO, and restore drill are not yet proven', 'backup retention, restore destination, RPO/RTO, and restore drill are fully proven', 'BLOCKER_CLASSIFICATION_INVALID'],
    ['unknown nested field', '  plannedApiOrigin: null', '  plannedApiOrigin: null\n  futureTopologyPolicy: enabled', 'TOPOLOGY_SCHEMA_INVALID'],
    ['omitted nested field', '  apiReplicasAtDormantDeploy: 1\n', '', 'TOPOLOGY_SCHEMA_INVALID'],
    ['duplicate parser field', 'status: local_qualification_required', 'status: local_qualification_required\nstatus: local_qualification_required', 'MANIFEST_DUPLICATE_KEY'],
  ];
  for (const [name,find,replacement,code] of cases) await t.test(name, async()=>{
    const repo=await fixture();
    await amend(repo,'docs/wordle-royale-g0-provisioning-manifest.yaml',find,replacement);
    const result=invoke(repo);
    assert.equal(result.status,1,result.stdout);
    assert.equal(result.json.code,code);
    assert.equal(await lstat(result.receipt).then(()=>true,()=>false),false,'failure must not publish a receipt');
    assert.doesNotMatch(result.stdout+result.stderr,/NETWORK_OR_PROVIDER_CANARY/u);
  });
});
test('provider-default hostile drift fails in genuine committed CLI subprocesses without secret or provider access', async(t)=>{
  const cases = [
    ['observation authorization','  observationOnly: true','  observationOnly: false'],
    ['reserved domain suffix','      - wordle-royale-production-web.vercel.app','      - wordle-royale-production-web.vercel.app.evil.invalid'],
    ['reserved domain duplicate','      - wordle-royale-production-web.vercel.app','      - wordle-royale-production-web.vercel.app\n      - wordle-royale-production-web.vercel.app'],
    ['metadata missing','      - RAILWAY_SERVICE_NAME\n',''],
    ['metadata extra','      - RAILWAY_SERVICE_NAME','      - RAILWAY_SERVICE_NAME\n      - RAILWAY_GIT_BRANCH'],
    ['metadata duplicate','      - RAILWAY_SERVICE_NAME','      - RAILWAY_SERVICE_NAME\n      - RAILWAY_ENVIRONMENT'],
    ['metadata reorder','      - RAILWAY_ENVIRONMENT\n      - RAILWAY_ENVIRONMENT_ID','      - RAILWAY_ENVIRONMENT_ID\n      - RAILWAY_ENVIRONMENT'],
    ['inspect values','    valuesInspectable: false','    valuesInspectable: true'],
    ['service replica','      numReplicas: null','      numReplicas: 0'],
    ['service region','      regions: []','      regions:\n        - sfo'],
    ['source','      source: null','      source: source-id'],
    ['repository','      repository: null','      repository: owner/repository'],
    ['image','      image: null','      image: image-latest'],
    ['branch','      branch: null','      branch: main'],
    ['deployment','      deployments: 0','      deployments: 1'],
    ['latest deployment','      latestDeployment: null','      latestDeployment: deployment-id'],
    ['active deployment','      activeDeployments: 0','      activeDeployments: 1'],
    ['domain','      domains: 0','      domains: 1'],
    ['URL','      urls: 0','      urls: 1'],
    ['replica','      activeReplicas: 0','      activeReplicas: 1'],
    ['database','      databases: 0','      databases: 1'],
    ['volume','      volumes: 0','      volumes: 1'],
    ['preview drift','    authoredDomains: []','    authoredDomains:\n      - preview.vercel.app'],
    ['unknown secret field','    valuesInspectable: false','    valuesInspectable: false\n    metadataValues: SUPER_SECRET_VALUE_CANARY'],
  ];
  for(const [name,find,replacement] of cases) await t.test(name,async()=>{
    const repo=await fixture(); await amend(repo,'docs/wordle-royale-g0-provisioning-manifest.yaml',find,replacement); const result=invoke(repo);
    assert.equal(result.status,1,result.stdout); assert.match(result.json.code,/^PROVIDER_DEFAULT_(?:SCHEMA|POLICY)_INVALID$/u);
    assert.equal(await lstat(result.receipt).then(()=>true,()=>false),false); assert.doesNotMatch(result.stdout+result.stderr,/NETWORK_OR_PROVIDER_CANARY|SUPER_SECRET_VALUE_CANARY|forbidden-secret|forbidden-token/u);
  });
});
test('Wave AD package downgrade is rejected', async()=>{ const repo=await fixture(); await amend(repo,'package.json','scripts/provider-provenance-live-cli.e2e.test.mjs','scripts/provider-provenance-live.test.mjs'); const result=invoke(repo); assert.equal(result.status,1); assert.equal(result.json.code,'WAVE_AD_PACKAGE_WIRING_INVALID'); });
test('unsupported symlink Git entries are rejected', async()=>{ const repo=await fixture(); await symlink('README.md',join(repo,'linked-readme')); git(repo,['add','linked-readme']); git(repo,['commit','--quiet','-m','symlink']); const result=invoke(repo); assert.equal(result.status,1); assert.equal(result.json.code,'UNSUPPORTED_GIT_ENTRY'); });
test('symlinked repository paths and relative paths are rejected', async()=>{ const repo=await fixture(), alias=join(root,'repo-alias'); await symlink(repo,alias); let result=spawnSync(process.execPath,[join(repo,'scripts/g0-qualification.mjs'),'--repo',alias,'--manifest',join(alias,'docs/wordle-royale-g0-provisioning-manifest.yaml'),'--target-sha',git(repo,['rev-parse','HEAD']),'--receipt',join(root,'alias.json')],{encoding:'utf8'}); assert.equal(JSON.parse(result.stderr).code,'REPOSITORY_SYMLINK_FORBIDDEN'); result=spawnSync(process.execPath,[join(repo,'scripts/g0-qualification.mjs'),'--repo','relative','--manifest','relative','--target-sha','a'.repeat(40),'--receipt','relative'],{encoding:'utf8'}); assert.equal(result.status,1); assert.match(result.stderr,/PATH_NOT_ABSOLUTE/u); });
test('unknown, duplicate, missing args and command-like input are rejected', async()=>{ const repo=await fixture(), cli=join(repo,'scripts/g0-qualification.mjs'); for(const args of [[],['apply'],['--repo',repo,'--repo',repo],['--unknown','x']]) { const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'}); assert.equal(result.status,1); assert.equal(JSON.parse(result.stderr).code,'INVALID_ARGUMENTS'); } });
test('receipt publication is atomic and never overwrites', async()=>{ const repo=await fixture(), receipt=join(root,'immutable.json'); const first=invoke(repo,[],receipt); assert.equal(first.status,0); const before=await readFile(receipt,'utf8'); const second=invoke(repo,[],receipt); assert.equal(second.status,1); assert.equal(second.json.code,'RECEIPT_ALREADY_EXISTS'); assert.equal(await readFile(receipt,'utf8'),before); });
