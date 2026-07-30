import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, MIGRATIONS, receiptFor } from '../../../scripts/auth-activation-preflight-core.mjs';
import { collectInventory, createReceipt } from '../../../scripts/provider-provenance-core.mjs';
import { collectionConstraints, expectedIdentities, validProviderSnapshot } from '../../../scripts/provider-provenance-fixture.mjs';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fallback = new URL('postgresql://wordle@127.0.0.1:5432/wordle_royale_local');
fallback.password = ['wordle','local','password'].join('_');
const base = new URL(process.env.DURABLE_AUTH_TEST_DATABASE_URL ?? fallback);
if (!['localhost','127.0.0.1','::1'].includes(base.hostname)) throw new Error('Ticket 268 requires disposable local PostgreSQL');
const schema = `ticket268_${randomUUID().replaceAll('-','')}`;
const database = new URL(base); database.searchParams.set('schema',schema); database.searchParams.set('application_name',`ticket268_${schema}`);
const admin = new URL(base); admin.search='';
const temporary = await mkdtemp(join(tmpdir(),'ticket268-cli-'));
await chmod(temporary,0o700);
let created=false;
const servers=[];
const sha256=(value)=>createHash('sha256').update(value).digest('hex');
const sync=(command,args,env={})=>{const result=spawnSync(command,args,{cwd:apiRoot,env:{...process.env,...env},encoding:'utf8'});if(result.error)throw result.error;if(result.status!==0)throw new Error(`${command} failed (${result.status})\n${result.stdout}${result.stderr}`);return result.stdout;};
const psql=(sql)=>sync('psql',[admin.toString(),'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',sql]).trim();
const protectedFile=async(name,value)=>{const path=join(temporary,name);await writeFile(path,value,{mode:0o600});await chmod(path,0o600);return path;};
const listen=async(handler)=>{const server=http.createServer(handler);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});servers.push(server);return `http://127.0.0.1:${server.address().port}`;};
const closeServers=async()=>Promise.all(servers.splice(0).map(server=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))));
const envelope=(data)=>({data,meta:{requestId:'ticket268-request',timestamp:new Date().toISOString()}});
const dependency=(status='ok')=>({status,checkedAt:new Date().toISOString(),message:'disposable local proof'});
const commonMode=(id,label,players,enabled)=>({id,label,players,rated:true,enabled,provisionalGames:5,defaultRating:1500,defaultRatingDeviation:350,notes:'ticket268 fixture'});
const modes=()=>({modes:[commonMode('standard_1v1','Standard','1v1',true),{...commonMode('speed_1v1','Speed / Blitz','1v1',true),queueEnabled:true,rulesetVersion:'speed_1v1_v1_75s',readyLifecycleVersion:'speed_ready_v1_match_created_20s',ratingAlgorithmConfigVersion:'speed_1v1_glicko_v1',timeControl:{roundTimeSeconds:75,invitationWindowSeconds:90,readyWindowSeconds:20,readyWindowStartsOn:'first_valid_ready_acknowledgement',countdownSeconds:3,maxGuesses:6,solveTimeBucketMs:100,tieBreaker:'server_solve_time_bucket'}},commonMode('classic_1v1','Classic','1v1',false),commonMode('multiplayer_lobby','Multiplayer / Lobby','2-4',false)]});
let publicFailure=null;
const json=(response,body,observedUrl)=>{const failure=publicFailure&&observedUrl.endsWith('/healthz')?publicFailure:null;if(failure==='timeout')return;const bytes=failure==='oversized'?Buffer.from(JSON.stringify({padding:'x'.repeat(64*1024)})):Buffer.from(JSON.stringify(body));const status=failure==='redirect'?302:200;const headers={'content-type':failure==='content-type'?'text/plain':'application/json','content-length':String(bytes.length),'x-wordle-auth-preflight-observed-url':failure==='authority'?`${observedUrl}-drift`:observedUrl};if(failure==='redirect')headers.location='/redirected';response.writeHead(status,headers);response.end(bytes);};
const spawnCli=(args,env={})=>new Promise((resolve,reject)=>{const childEnv={...process.env,DATABASE_URL:database.toString(),NODE_ENV:'test',RUN_AUTH_PREFLIGHT_CLI_E2E:'1',...env};for(const [key,value] of Object.entries(childEnv))if(value===undefined)delete childEnv[key];const child=spawn('pnpm',['--filter','@wordle-royale/api','auth:activation:preflight',...args],{cwd:workspaceRoot,env:childEnv,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.setEncoding('utf8').on('data',chunk=>stdout+=chunk);child.stderr.setEncoding('utf8').on('data',chunk=>stderr+=chunk);child.once('error',reject);child.once('close',status=>resolve({status,stdout,stderr}));});
const jsonLine=(output)=>JSON.parse(output.trim().split('\n').filter(line=>line.startsWith('{')).at(-1));

try {
  assert.equal(psql('SELECT 1'),'1');
  sync('psql',[admin.toString(),'-X','-v','ON_ERROR_STOP=1','-c',`CREATE SCHEMA "${schema}"`]); created=true;
  sync(fileURLToPath(new URL('../node_modules/.bin/prisma',import.meta.url)),['generate','--schema','prisma/schema.prisma'],{DATABASE_URL:database.toString()});
  sync(fileURLToPath(new URL('../node_modules/.bin/prisma',import.meta.url)),['migrate','deploy','--schema','prisma/schema.prisma'],{DATABASE_URL:database.toString()});
  assert.equal(psql(`SELECT count(*) FROM "${schema}"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`),'9');

  const identityParts=psql(`SELECT current_database(),coalesce(inet_server_addr()::text,'local'),inet_server_port(),version(),(pg_control_system()).system_identifier::text`).split('|');
  assert.equal(identityParts.length,5);
  const databaseIdentity=sha256(`wordle-auth-db-v2\0${identityParts.join('\0')}`);
  const databaseHost=sha256(`wordle-auth-db-host-v1\0${database.hostname.toLowerCase()}`);
  const collectedAt=new Date().toISOString(),nonce=`ticket268-${randomUUID()}`;
  const nativeEvidence=validProviderSnapshot({collectedAt,nonce});
  const identities=expectedIdentities(nativeEvidence),constraints=collectionConstraints(nativeEvidence);
  const providerInventory=collectInventory(nativeEvidence,constraints);
  const receiptKey=randomBytes(48);
  const providerReceipt=createReceipt(providerInventory,nativeEvidence,receiptKey,'ticket268-key',constraints);
  const production=providerInventory.environments.production,preview=providerInventory.environments.preview;
  const apiOrigin='https://api.ticket268.example.test',previewOrigin='https://preview-api.ticket268.example.test',webOrigin='https://web.ticket268.example.test',previewWebOrigin='https://preview-web.ticket268.example.test';
  const operationalInventory={schemaVersion:3,activationPhase:'canary',runId:nonce,sourceSha:production.railway.artifact.sourceGitSha,artifactSha:production.railway.artifact.artifactDigest.slice(7),provider:{projectId:production.railway.identity.projectId,environmentId:production.railway.identity.environmentId,apiServiceId:production.railway.identity.serviceId,webServiceId:production.vercel.identity.projectId,databaseId:production.postgresql.observations[0].databaseId,previewEnvironmentId:preview.railway.identity.environmentId,previewDatabaseId:preview.postgresql.observations[0].databaseId},deployments:{apiDeploymentId:production.railway.identity.deploymentId,apiRevision:production.railway.artifact.sourceGitSha,webDeploymentId:production.vercel.identity.deploymentId,webRevision:production.vercel.artifact.sourceGitSha},origins:{api:apiOrigin,web:webOrigin,previewApi:previewOrigin,previewWeb:previewWebOrigin},replicas:{expected:1,observed:1,observedReplicaId:'ticket268-replica'},config:{authMode:'session_required',durableAuth:true,registrationMode:'canary',appEnvironment:'production',nodeEnvironment:'production',secureCookie:true,hostOnlyCookie:true,proxyHops:1,requiredKeysPresent:['AUTH_RATE_LIMIT_KEY','DATABASE_URL'],keyFingerprint:'b'.repeat(16),configFingerprint:'c'.repeat(16)},migrations:MIGRATIONS.map(id=>({id,status:'applied'})),database:{identityFingerprint:databaseIdentity,databaseHostFingerprint:databaseHost,schemaStatus:'ok',remediationConflictCount:0},source:{kind:'provider-read-only',observedAt:collectedAt},expiresAt:new Date(Date.parse(collectedAt)+10*60_000).toISOString()};
  const files={inventory:await protectedFile('operational.json',JSON.stringify(operationalInventory)),provider:await protectedFile('provider.json',JSON.stringify(providerInventory)),receipt:await protectedFile('receipt.json',JSON.stringify(providerReceipt)),native:await protectedFile('native.json',JSON.stringify(nativeEvidence)),identities:await protectedFile('identities.json',JSON.stringify(identities)),key:await protectedFile('receipt.key',receiptKey)};
  receiptKey.fill(0);
  const argsFor=(overrides={},extra=[])=>['--provider-evidence-lane','fixture-v2-test-only','--operational-inventory',overrides.inventory??files.inventory,'--provider-inventory',overrides.provider??files.provider,'--provider-receipt',overrides.receipt??files.receipt,'--native-evidence',overrides.native??files.native,'--expected-identities',overrides.identities??files.identities,'--expected-nonce',overrides.nonce??nonce,'--provider-receipt-key',overrides.key??files.key,...extra];

  let publicRequests=0,mutateOnRequest=false,mutationDone=false;
  const apiLocal=await listen(async(request,response)=>{publicRequests++;if(mutateOnRequest&&!mutationDone){mutationDone=true;sync('psql',[admin.toString(),'-X','-v','ON_ERROR_STOP=1','-c',`INSERT INTO "${schema}"."AuditLog" (id,action,"entityType") VALUES ('ticket268-drift','public_probe','fixture')`]);}const path=new URL(request.url,'http://local').pathname,observedUrl=`${apiOrigin}${path}`;if(path==='/healthz')return json(response,envelope({status:'ok',service:'wordle-royale-api',environment:'production',timestamp:new Date().toISOString(),uptimeSeconds:1,revision:operationalInventory.deployments.apiRevision}),observedUrl);if(path==='/readyz')return json(response,envelope({status:'ok',service:'wordle-royale-api',environment:'production',revision:operationalInventory.deployments.apiRevision,checkedAt:new Date().toISOString(),dependencies:{database:dependency(),applicationSchema:dependency(),durableAuth:{...dependency(),registrationMode:'canary',keyFingerprint:operationalInventory.config.keyFingerprint,configFingerprint:operationalInventory.config.configFingerprint,expectedReplicaCount:1},standardDictionary:dependency(),speedRuntime:dependency(),speedLifecycleActivation:dependency(),redis:dependency()}}),observedUrl);if(path==='/ranked/modes')return json(response,envelope(modes()),observedUrl);response.writeHead(404).end();});
  const previewLocal=await listen((request,response)=>{publicRequests++;const path=new URL(request.url,'http://local').pathname;json(response,envelope({status:'ok',service:'wordle-royale-api',environment:'production',revision:preview.railway.artifact.sourceGitSha,checkedAt:new Date().toISOString(),dependencies:{database:dependency(),applicationSchema:dependency(),durableAuth:{...dependency('not_checked_stub'),registrationMode:'closed'},standardDictionary:dependency(),speedRuntime:dependency(),speedLifecycleActivation:dependency(),redis:dependency()}}),`${previewOrigin}${path}`);});
  const webLocal=await listen((request,response)=>{publicRequests++;const path=new URL(request.url,'http://local').pathname;json(response,{revision:operationalInventory.deployments.webRevision,appEnvironment:'production',mode:'durable',registrationMode:'canary'},`${webOrigin}${path}`);});
  const originMap=JSON.stringify({[apiOrigin]:apiLocal,[previewOrigin]:previewLocal,[webOrigin]:webLocal});

  const secureOutputDir=join(temporary,'output');await mkdir(secureOutputDir,{mode:0o700});await chmod(secureOutputDir,0o700);
  const outputPath=join(secureOutputDir,'preflight.json');
  const pass=await spawnCli(argsFor({},['--output',outputPath]),{AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});
  assert.equal(pass.status,0,pass.stderr);assert.equal(pass.stdout.trim().split('\n').some(line=>line.startsWith('{')),false,'--output must not duplicate receipt to stdout');
  const outputText=await readFile(outputPath,'utf8'),result=JSON.parse(outputText);
  assert.equal(outputText,`${canonicalJson(result)}\n`);assert.equal(result.receipt,receiptFor(result.evidence));assert.equal(result.evidence.result,'PASS');assert.equal(result.evidence.proof.providerDerived,true);assert.equal(result.evidence.proof.databaseReadOnly,true);assert.equal(result.evidence.proof.zeroWrite,true);assert.equal(result.evidence.database.identityFingerprint,databaseIdentity);assert.equal(result.evidence.database.databaseHostFingerprint,databaseHost);assert.equal(result.evidence.providerReceipt.signature,providerReceipt.signature);
  const outputInfo=await lstat(outputPath);assert.equal(outputInfo.mode&0o777,0o600);assert.equal(outputText.includes(database.password),false);assert.equal(outputText.includes((await readFile(files.key)).toString('base64')),false);assert.equal(outputText.includes('fixture-present-value'),false);
  const existingOutput=await spawnCli(argsFor({},['--output',outputPath]),{AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(existingOutput.status,1,'protected output must never overwrite an existing receipt');assert.equal(await readFile(outputPath,'utf8'),outputText);
  const relativeOutput=await spawnCli(argsFor({},['--output','relative-preflight.json']),{AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(relativeOutput.status,1,'protected output path must be canonical and absolute');

  const missingExplicitFlag=await spawnCli(argsFor(),{RUN_AUTH_PREFLIGHT_CLI_E2E:undefined,AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(missingExplicitFlag.status,1,'NODE_ENV=test alone must not enable the local transport seam');assert.deepEqual(jsonLine(missingExplicitFlag.stderr),{failureCode:'preflight_failed',result:'FAIL'});
  for(const failure of ['redirect','authority','content-type','oversized','timeout']){publicFailure=failure;const rejected=await spawnCli(argsFor(),{AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(rejected.status,1,`shipped CLI must reject public ${failure}`);assert.deepEqual(jsonLine(rejected.stderr),{failureCode:'preflight_failed',result:'FAIL'});}publicFailure=null;

  mutateOnRequest=true;mutationDone=false;
  const drift=await spawnCli(argsFor(),{AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(drift.status,1);assert.deepEqual(jsonLine(drift.stderr),{failureCode:'preflight_failed',result:'FAIL'});assert.equal(mutationDone,true,'public probe must mutate between the two real transactions');mutateOnRequest=false;

  let dbConnections=0;const trap=net.createServer(socket=>{dbConnections++;socket.destroy();});await new Promise((resolve,reject)=>{trap.once('error',reject);trap.listen(0,'127.0.0.1',resolve);});servers.push(trap);
  const trapUrl=new URL(database);trapUrl.port=String(trap.address().port);
  const badReceipt=structuredClone(providerReceipt);badReceipt.signature=`hmac-sha256:${'0'.repeat(64)}`;const badReceiptPath=await protectedFile('wrong-receipt.json',JSON.stringify(badReceipt));
  const badIdentity=structuredClone(identities);badIdentity.production.railway.projectId='wrong-project';const badIdentityPath=await protectedFile('wrong-identities.json',JSON.stringify(badIdentity));
  const unsigned=structuredClone(nativeEvidence);unsigned.providers.railway.production.signature=`ed25519:${Buffer.alloc(64).toString('base64')}`;const unsignedPath=await protectedFile('unsigned-native.json',JSON.stringify(unsigned));
  const plainReceipt=await protectedFile('plain-receipt.txt','not-json');
  const beforePublic=publicRequests;
  for(const candidate of [argsFor({receipt:badReceiptPath}),argsFor({identities:badIdentityPath}),argsFor({native:unsignedPath}),argsFor({receipt:plainReceipt}),argsFor({receipt:join(temporary,'missing-receipt.json')}),argsFor({native:join(temporary,'missing-native-evidence.json')})]){const failed=await spawnCli(candidate,{DATABASE_URL:trapUrl.toString(),AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(failed.status,1);assert.deepEqual(jsonLine(failed.stderr),{failureCode:'preflight_failed',result:'FAIL'});}
  assert.equal(dbConnections,0,'invalid provider evidence must fail before Prisma opens PostgreSQL');assert.equal(publicRequests,beforePublic,'invalid provider evidence must fail before public probes');

  const permissive=join(temporary,'permissive');await mkdir(permissive,{mode:0o755});await chmod(permissive,0o755);
  const rejectedOutput=join(permissive,'receipt.json');const badOutput=await spawnCli(argsFor({},['--output',rejectedOutput]),{AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(badOutput.status,1);await assert.rejects(lstat(rejectedOutput),error=>error?.code==='ENOENT');
  const permissiveInput=await protectedFile('permissive-input.json',JSON.stringify(operationalInventory));await chmod(permissiveInput,0o644);const badMode=await spawnCli(argsFor({inventory:permissiveInput}),{AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(badMode.status,1);
  const productionSeam=await spawnCli(argsFor(),{NODE_ENV:'production',AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(productionSeam.status,1,'local transport seam must fail closed outside explicit tests');
  const malformedArgs=await spawnCli([...argsFor(),'--unknown','value'],{AUTH_PREFLIGHT_TEST_ORIGIN_MAP:originMap});assert.equal(malformedArgs.status,1);

  console.log(`[Ticket268] PASS production package CLI E2E; canonical protected receipt; authenticated provider evidence; local bounded transport; complete fingerprints; two real read-only transactions; invalid evidence pre-adapter counters; negatives; 9 migrations; publicRequests=${publicRequests}`);
} finally {
  await closeServers();
  if(created)sync('psql',[admin.toString(),'-X','-v','ON_ERROR_STOP=1','-c',`DROP SCHEMA IF EXISTS "${schema}" CASCADE`]);
  const remaining=psql(`SELECT count(*) FROM pg_namespace WHERE nspname='${schema}'`);assert.equal(remaining,'0','Ticket 268 disposable schema cleanup must be independently verified');
  await rm(temporary,{recursive:true,force:true});
  let absent=false;try{await lstat(temporary);}catch(error){if(error?.code==='ENOENT')absent=true;}assert.equal(absent,true,'Ticket 268 protected temp tree cleanup must be independently verified');
  console.log(`[Ticket268] cleanup verified schemaAbsent=1 tempAbsent=1 schema=${schema}`);
}
