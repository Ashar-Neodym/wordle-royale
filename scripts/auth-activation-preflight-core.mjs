import { createHash, timingSafeEqual } from 'node:crypto';
import { validateInventory as validateProviderInventory, verifyReceipt as verifyProviderReceipt } from './provider-provenance-core.mjs';
import { LIVE_INVENTORY_VERSION, consumeLiveNonce, validateLiveInventory, validateLiveReceipt, verifyLiveBundle } from './provider-provenance-live-core.mjs';
import { APPLICATION_MANIFEST_DIGEST, APPLICATION_MODEL_TABLES } from './complete-database-fingerprint.mjs';

const SHA = /^[a-f0-9]{40,64}$/u;
const RECEIPT = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const FP = /^[a-f0-9]{16,64}$/u;
const ISO_MAX_SKEW_MS = 30_000;
const MAX_EVIDENCE_BYTES = 64 * 1024;
export const MAX_PUBLIC_BODY_BYTES = 64 * 1024;
export const MIGRATIONS = Object.freeze([
  '20260623000000_initial_schema',
  '20260709000000_mode_aware_rating_profiles',
  '20260710000000_standard_1v1_matchmaking',
  '20260716000000_speed_1v1_gameplay',
  '20260717000000_speed_ready_lifecycle_v2',
  '20260718000000_speed_lifecycle_activation_gate',
  '20260719000000_railway_inventory_operator',
  '20260728000000_durable_auth_foundations',
  '20260728010000_auth_rate_limit_bucket',
]);
const PHASES = Object.freeze(['dormant','closed','canary']);
const INVENTORY_KEYS = ['schemaVersion','activationPhase','runId','sourceSha','artifactSha','provider','deployments','origins','replicas','config','migrations','database','source','expiresAt'];
const PROVIDER = ['projectId','environmentId','apiServiceId','webServiceId','databaseId','previewEnvironmentId','previewDatabaseId'];
const DEPLOY = ['apiDeploymentId','apiRevision','webDeploymentId','webRevision'];
const ORIGINS = ['api','web','previewApi','previewWeb'];
const REPLICAS = ['expected','observed','observedReplicaId'];
const SOURCE = ['kind','observedAt'];
const CONFIG = ['authMode','durableAuth','registrationMode','appEnvironment','nodeEnvironment','secureCookie','hostOnlyCookie','proxyHops','requiredKeysPresent','keyFingerprint','configFingerprint'];
const DATABASE = ['identityFingerprint','databaseHostFingerprint','schemaStatus','remediationConflictCount'];
const PROOF = ['health','readiness','rankedModes','webIdentity','previewIsolation','databaseReadOnly','zeroWrite','providerDerived'];
const EVIDENCE_KEYS = ['schemaVersion','result','activationPhase','runId','sourceSha','artifactSha','providerInventory','providerReceipt','provider','deployments','origins','replicas','config','migrations','database','proof','source','expiresAt'];
const EVIDENCE_FORBIDDEN = /(password|secret|token|cookieValue|connection|databaseUrl|email|address|canaryDigest|answer|authorization|rawHost|originHeader)/iu;
export const PREFLIGHT_SQL = Object.freeze({
  isolation: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
  readOnlyStatus: 'SHOW transaction_read_only',
  snapshot: 'SELECT auth_activation_readonly_snapshot_v1()',
  migrations: 'SELECT auth_activation_complete_migration_status_v1()',
  identity: 'SELECT auth_activation_database_identity_v2()',
  schema: 'SELECT auth_activation_schema_readiness_v1()',
});

export class ActivationFailure extends Error { constructor(code) { super(code); this.name = 'ActivationFailure'; this.code = code; } }
const fail = (ok, code) => { if (!ok) throw new ActivationFailure(code); };
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
export function exact(v, keys, code) { fail(object(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|'), code); }
function scalarSafe(v, path = '') {
  if (Array.isArray(v)) return v.forEach((x, i) => scalarSafe(x, `${path}.${i}`));
  if (object(v)) return Object.entries(v).forEach(([k, x]) => { fail(!EVIDENCE_FORBIDDEN.test(k), `forbidden_field:${path}.${k}`); scalarSafe(x, `${path}.${k}`); });
  fail(v === null || ['string','number','boolean'].includes(typeof v), `non_json_value:${path}`);
  if (typeof v === 'string') fail(v.length <= 256 && !/postgres(?:ql)?:|@[A-Za-z0-9.-]+|set-cookie|bearer\s/iu.test(v), `unsafe_value:${path}`);
}
export function normalizeJsonContentType(raw) {
  if (typeof raw !== 'string') return raw ?? null;
  const parts = raw.split(';').map((part) => part.trim().toLowerCase());
  if (parts.shift() !== 'application/json') return raw.trim().toLowerCase();
  if (parts.length === 0) return 'application/json';
  if (parts.length === 1 && parts[0] === 'charset=utf-8') return 'application/json';
  return raw.trim().toLowerCase();
}
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (object(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export const receiptFor = (v) => createHash('sha256').update(canonicalJson(v)).digest('hex');
function equalReceipt(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !RECEIPT.test(a) || !RECEIPT.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function origin(raw, label) {
  fail(typeof raw === 'string', `${label}_origin_invalid`);
  let u; try { u = new URL(raw); } catch { throw new ActivationFailure(`${label}_origin_invalid`); }
  fail(u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash && raw === u.origin, `${label}_origin_noncanonical`);
  return raw;
}
function fresh(observedAt, expiresAt, now, code) {
  const observed = Date.parse(observedAt), expires = Date.parse(expiresAt);
  fail(Number.isFinite(observed) && Number.isFinite(expires) && expires > observed && expires - observed <= 15 * 60_000 && now >= observed - ISO_MAX_SKEW_MS && now < expires, code);
}
function validateMigrationSet(v) {
  fail(Array.isArray(v) && v.length === MIGRATIONS.length && MIGRATIONS.every((x, i) => v[i]?.id === x && v[i]?.status === 'applied' && object(v[i]) && Object.keys(v[i]).sort().join('|') === 'id|status'), 'migration_status_invalid');
}
export function validateInventory(v, now = Date.now()) {
  exact(v, INVENTORY_KEYS, 'inventory_schema_invalid');
  fail(v.schemaVersion === 3 && PHASES.includes(v.activationPhase) && ID.test(v.runId) && SHA.test(v.sourceSha) && SHA.test(v.artifactSha), 'inventory_identity_invalid');
  exact(v.provider, PROVIDER, 'provider_schema_invalid'); exact(v.deployments, DEPLOY, 'deployment_schema_invalid'); exact(v.origins, ORIGINS, 'origin_schema_invalid');
  exact(v.replicas, REPLICAS, 'replica_schema_invalid'); exact(v.source, SOURCE, 'inventory_source_schema_invalid'); exact(v.config, CONFIG, 'config_schema_invalid'); exact(v.database, DATABASE, 'database_schema_invalid');
  fail(v.source.kind === 'provider-read-only', 'inventory_source_untrusted');
  for (const value of Object.values(v.provider)) fail(typeof value === 'string' && ID.test(value), 'provider_identity_invalid');
  for (const value of Object.values(v.deployments)) fail(typeof value === 'string' && (ID.test(value) || SHA.test(value)), 'deployment_identity_invalid');
  for (const [k, value] of Object.entries(v.origins)) origin(value, k);
  fail(new Set(Object.values(v.origins)).size === 4 && v.provider.environmentId !== v.provider.previewEnvironmentId && v.provider.databaseId !== v.provider.previewDatabaseId, 'preview_topology_not_distinct');
  fail(v.replicas.expected === 1 && v.replicas.observed === 1 && typeof v.replicas.observedReplicaId === 'string' && ID.test(v.replicas.observedReplicaId), 'replica_count_not_one');
  const c = v.config;
  fail(c.authMode === 'session_required' && c.appEnvironment === 'production' && c.nodeEnvironment === 'production', 'runtime_state_invalid');
  const expectedRuntime = v.activationPhase === 'dormant'
    ? { durableAuth: false, registrationMode: 'closed' }
    : { durableAuth: true, registrationMode: v.activationPhase };
  fail(c.durableAuth === expectedRuntime.durableAuth && c.registrationMode === expectedRuntime.registrationMode, 'activation_phase_runtime_mismatch');
  fail(c.secureCookie === true && c.hostOnlyCookie === true && Number.isInteger(c.proxyHops) && c.proxyHops >= 1 && c.proxyHops <= 3, 'cookie_proxy_config_invalid');
  fail(Array.isArray(c.requiredKeysPresent) && c.requiredKeysPresent.length === 2 && new Set(c.requiredKeysPresent).size === 2 && ['AUTH_RATE_LIMIT_KEY','DATABASE_URL'].every((x) => c.requiredKeysPresent.includes(x)), 'required_key_presence_invalid');
  fail(FP.test(c.keyFingerprint) && FP.test(c.configFingerprint), 'config_fingerprint_invalid');
  validateMigrationSet(v.migrations);
  fail(FP.test(v.database.identityFingerprint) && RECEIPT.test(v.database.databaseHostFingerprint) && v.database.schemaStatus === 'ok' && v.database.remediationConflictCount === 0, 'database_readiness_invalid');
  fresh(v.source.observedAt, v.expiresAt, now, 'evidence_stale');
  scalarSafe(v); fail(Buffer.byteLength(canonicalJson(v)) <= MAX_EVIDENCE_BYTES, 'inventory_oversized');
  return structuredClone(v);
}
export function verifyInventoryReceipt(raw, suppliedReceipt, now = Date.now()) {
  const inventory = validateInventory(raw, now);
  fail(equalReceipt(receiptFor(inventory), suppliedReceipt), 'inventory_receipt_mismatch');
  return inventory;
}

function providerComposition(raw, providerInventory) {
  const production = providerInventory.environments.production;
  const preview = providerInventory.environments.preview;
  const productionDatabase = providerInventory.schemaVersion === LIVE_INVENTORY_VERSION ? production.postgresql.subject : production.postgresql.observations[0];
  const previewDatabase = providerInventory.schemaVersion === LIVE_INVENTORY_VERSION ? preview.postgresql.subject : preview.postgresql.observations[0];
  const expected = {
    runId: providerInventory.schemaVersion === LIVE_INVENTORY_VERSION ? providerInventory.runId : providerInventory.nonce,
    sourceSha: production.railway.artifact.sourceGitSha,
    artifactSha: production.railway.artifact.artifactDigest.slice('sha256:'.length),
    provider: {
      projectId: production.railway.identity.projectId,
      environmentId: production.railway.identity.environmentId,
      apiServiceId: production.railway.identity.serviceId,
      webServiceId: production.vercel.identity.projectId,
      databaseId: productionDatabase.databaseId,
      previewEnvironmentId: preview.railway.identity.environmentId,
      previewDatabaseId: previewDatabase.databaseId,
    },
    deployments: {
      apiDeploymentId: production.railway.identity.deploymentId,
      apiRevision: production.railway.artifact.sourceGitSha,
      webDeploymentId: production.vercel.identity.deploymentId,
      webRevision: production.vercel.artifact.sourceGitSha,
    },
    observedAt: providerInventory.collectedAt,
  };
  fail(raw.runId === expected.runId && raw.sourceSha === expected.sourceSha && raw.artifactSha === expected.artifactSha, 'provider_operational_identity_mismatch');
  fail(canonicalJson(raw.provider) === canonicalJson(expected.provider), 'provider_operational_resource_mismatch');
  fail(canonicalJson(raw.deployments) === canonicalJson(expected.deployments), 'provider_operational_deployment_mismatch');
  fail(raw.source.observedAt === expected.observedAt, 'provider_operational_time_mismatch');
}

export function verifyAuthenticatedProviderEvidence({ operationalInventory, providerEvidenceLane, providerInventory, providerReceipt, nativeEvidence, expectedNonce, expectedIdentities, providerReceiptKey, liveChallenge = undefined, collectorPublicKey = undefined, replayGuard = undefined, expectedChallengeId = undefined, expectedRunId = undefined, expectedCollectorKeyId = undefined, now = Date.now() }) {
  if (providerEvidenceLane === 'fixture-v2-test-only') {
    fail(typeof expectedNonce === 'string' && object(expectedIdentities) && providerReceiptKey instanceof Uint8Array && providerReceiptKey.byteLength >= 32, 'provider_verification_inputs_invalid');
    fail(verifyProviderReceipt(providerInventory, providerReceipt, providerReceiptKey, nativeEvidence, { now, expectedNonce, expectedIdentities }), 'provider_provenance_verification_failed');
  } else {
    fail(providerEvidenceLane === 'production-live-v3' && object(liveChallenge) && collectorPublicKey, 'production_provider_v3_required');
    try {
      verifyLiveBundle({ challenge: liveChallenge, evidence: nativeEvidence, inventory: providerInventory, receipt: providerReceipt, collectorPublicKey, now, expectedChallengeId, expectedRunId, expectedNonce, expectedCollectorKeyId, consumeReplay: false });
    } catch { throw new ActivationFailure('provider_provenance_verification_failed'); }
  }
  const inventory = validateInventory(operationalInventory, now);
  providerComposition(inventory, providerInventory);
  if (providerEvidenceLane === 'production-live-v3') {
    try { consumeLiveNonce(replayGuard, liveChallenge.nonce); } catch { throw new ActivationFailure('provider_provenance_verification_failed'); }
  }
  return inventory;
}

const dependencyKeys = ['status','checkedAt','message'];
function validateDependency(v, code, extra = []) { const keys=Object.keys(v ?? {}); const expected=[...dependencyKeys,...extra]; fail(keys.every(k=>expected.includes(k)||k==='latencyMs')&&expected.every(k=>keys.includes(k)),code); fail(['ok','degraded','unavailable','not_checked_stub'].includes(v.status)&&Number.isFinite(Date.parse(v.checkedAt))&&typeof v.message==='string'&&(v.latencyMs===undefined||(typeof v.latencyMs==='number'&&v.latencyMs>=0)),code); }
function validateHealth(v) { exact(v,['status','service','environment','timestamp','uptimeSeconds','revision'],'health_schema_invalid'); fail(v.status==='ok'&&v.service==='wordle-royale-api'&&v.environment==='production'&&Number.isFinite(Date.parse(v.timestamp))&&typeof v.uptimeSeconds==='number'&&v.uptimeSeconds>=0&&SHA.test(v.revision),'health_schema_invalid'); }
function validateReady(v, preview = false, dormant = false) {
  exact(v,['status','service','environment','revision','checkedAt','dependencies'],'ready_schema_invalid');
  exact(v.dependencies,['database','applicationSchema','durableAuth','standardDictionary','speedRuntime','speedLifecycleActivation','redis'],'ready_dependencies_schema_invalid');
  for (const key of ['database','applicationSchema','standardDictionary','speedRuntime','speedLifecycleActivation','redis']) validateDependency(v.dependencies[key], 'ready_dependency_schema_invalid');
  validateDependency(v.dependencies.durableAuth,'ready_auth_schema_invalid', preview || dormant ? ['registrationMode'] : ['registrationMode','keyFingerprint','configFingerprint','expectedReplicaCount']);
  fail(v.status==='ok'&&v.service==='wordle-royale-api'&&v.environment==='production'&&SHA.test(v.revision)&&Number.isFinite(Date.parse(v.checkedAt)),'ready_schema_invalid');
}
const commonMode = ['id','label','players','rated','enabled','provisionalGames','defaultRating','defaultRatingDeviation','notes'];
function validateModes(v) {
  exact(v,['modes'],'ranked_schema_invalid'); fail(Array.isArray(v.modes)&&v.modes.length===4,'ranked_schema_invalid');
  const ids = new Set();
  for (const mode of v.modes) { const speed=mode?.id==='speed_1v1'; const allowed=speed?[...commonMode,'queueEnabled','rulesetVersion','readyLifecycleVersion','ratingAlgorithmConfigVersion','timeControl']:commonMode; exact(mode,allowed,'ranked_mode_schema_invalid'); fail(typeof mode.id==='string'&&!ids.has(mode.id)&&typeof mode.enabled==='boolean'&&typeof mode.rated==='boolean','ranked_mode_schema_invalid'); ids.add(mode.id); if(speed) exact(mode.timeControl,['roundTimeSeconds','invitationWindowSeconds','readyWindowSeconds','readyWindowStartsOn','countdownSeconds','maxGuesses','solveTimeBucketMs','tieBreaker'],'ranked_time_control_schema_invalid'); }
  fail(['standard_1v1','speed_1v1','classic_1v1','multiplayer_lobby'].every(x=>ids.has(x)),'ranked_modes_invalid');
}
function validateWeb(v) { exact(v,['revision','appEnvironment','mode','registrationMode'],'web_identity_schema_invalid'); fail(SHA.test(v.revision)&&v.appEnvironment==='production'&&['disabled','durable'].includes(v.mode)&&(v.registrationMode===null||['closed','canary','open'].includes(v.registrationMode)),'web_identity_invalid'); }
function assertResponse(response, expectedOrigin, path, schema) {
  fail(response?.method === 'GET', 'public_non_get'); fail(response.redirected === false, 'public_redirect');
  fail(response.url === `${expectedOrigin}${path}`, 'public_authority_mismatch'); fail(response.status === 200, 'public_status_invalid');
  fail(response.contentType === 'application/json', 'public_content_type_invalid');
  fail(Number.isInteger(response.bodyBytes) && response.bodyBytes >= 0 && response.bodyBytes <= MAX_PUBLIC_BODY_BYTES, 'public_body_oversized');
  fail(Buffer.byteLength(canonicalJson(response.body)) <= MAX_PUBLIC_BODY_BYTES, 'public_body_oversized');
  exact(response.body,['data','meta'],'public_envelope_schema_invalid'); exact(response.body.meta,['requestId','timestamp'],'public_meta_schema_invalid'); fail(typeof response.body.meta.requestId==='string'&&Number.isFinite(Date.parse(response.body.meta.timestamp)),'public_meta_schema_invalid');
  schema(response.body.data); scalarSafe(response.body, 'public'); return response.body.data;
}
function assertWebResponse(response, originValue) {
  fail(response?.method==='GET'&&response.redirected===false,'public_redirect'); fail(response.url===`${originValue}/.well-known/wordle-identity`&&response.status===200,'web_authority_mismatch'); fail(response.contentType==='application/json','public_content_type_invalid'); fail(Number.isInteger(response.bodyBytes)&&response.bodyBytes<=MAX_PUBLIC_BODY_BYTES&&Buffer.byteLength(canonicalJson(response.body))<=MAX_PUBLIC_BODY_BYTES,'public_body_oversized'); validateWeb(response.body); scalarSafe(response.body,'web'); return response.body;
}
function validateCompleteSnapshot(snapshot) {
  exact(snapshot,['schemaVersion','manifestDigest','modelCount','totalCount','stateDigest','models'],'complete_fingerprint_schema_invalid');
  fail(snapshot.schemaVersion===1&&snapshot.manifestDigest===APPLICATION_MANIFEST_DIGEST&&snapshot.modelCount===APPLICATION_MODEL_TABLES.length&&RECEIPT.test(snapshot.stateDigest),'complete_fingerprint_manifest_drift');
  fail(Array.isArray(snapshot.models)&&snapshot.models.length===APPLICATION_MODEL_TABLES.length,'complete_fingerprint_manifest_drift');
  let total=0;
  snapshot.models.forEach((entry,index)=>{
    exact(entry,['model','table','count','digest'],'complete_fingerprint_model_invalid');
    const [model,table]=APPLICATION_MODEL_TABLES[index];
    fail(entry.model===model&&entry.table===table&&Number.isSafeInteger(entry.count)&&entry.count>=0&&RECEIPT.test(entry.digest),'complete_fingerprint_model_invalid');
    total+=entry.count;
  });
  fail(Number.isSafeInteger(total)&&snapshot.totalCount===total,'complete_fingerprint_count_invalid');
  fail(snapshot.stateDigest===receiptFor(snapshot.models),'complete_fingerprint_state_digest_invalid');
}
function equalSnapshot(a,b){validateCompleteSnapshot(a);validateCompleteSnapshot(b);return canonicalJson(a)===canonicalJson(b);}
export async function runActivationPreflight({ operationalInventory, providerEvidenceLane, providerInventory, providerReceipt, nativeEvidence, expectedNonce, expectedIdentities, providerReceiptKey, liveChallenge = undefined, collectorPublicKey = undefined, replayGuard = undefined, expectedChallengeId = undefined, expectedRunId = undefined, expectedCollectorKeyId = undefined, publicAdapter, databaseAdapter, now = () => Date.now() }) {
  const startedAt=now();
  // Production claims require a verified live v3 bundle. The legacy v2 path is
  // reachable only through the explicit fixture-v2-test-only lane.
  const inventory=verifyAuthenticatedProviderEvidence({operationalInventory,providerEvidenceLane,providerInventory,providerReceipt,nativeEvidence,expectedNonce,expectedIdentities,providerReceiptKey,liveChallenge,collectorPublicKey,replayGuard,expectedChallengeId,expectedRunId,expectedCollectorKeyId,now:startedAt});
  fail(publicAdapter&&typeof publicAdapter.get==='function'&&databaseAdapter&&typeof databaseAdapter.withReadOnlyTransaction==='function'&&typeof databaseAdapter.withReadOnlyObservation==='function','adapter_missing');
  let proof, before;
  await databaseAdapter.withReadOnlyTransaction(async(query)=>{
    const allowed=new Set(Object.values(PREFLIGHT_SQL)); let statements=0;
    const q=async(sql)=>{fail(allowed.has(sql),'sql_not_allowlisted'); statements++; return query(sql);};
    await q(PREFLIGHT_SQL.isolation); const readOnly=await q(PREFLIGHT_SQL.readOnlyStatus); fail(readOnly?.transactionReadOnly==='on','transaction_read_only_off');
    before=await q(PREFLIGHT_SQL.snapshot); validateCompleteSnapshot(before);
    const [healthR,readyR,modesR,previewR,webR]=await Promise.all([
      publicAdapter.get(`${inventory.origins.api}/healthz`),publicAdapter.get(`${inventory.origins.api}/readyz`),publicAdapter.get(`${inventory.origins.api}/ranked/modes`),publicAdapter.get(`${inventory.origins.previewApi}/readyz`),publicAdapter.get(`${inventory.origins.web}/.well-known/wordle-identity`),
    ]);
    const health=assertResponse(healthR,inventory.origins.api,'/healthz',validateHealth),ready=assertResponse(readyR,inventory.origins.api,'/readyz',(x)=>validateReady(x,false,inventory.activationPhase==='dormant')),modes=assertResponse(modesR,inventory.origins.api,'/ranked/modes',validateModes),preview=assertResponse(previewR,inventory.origins.previewApi,'/readyz',(x)=>validateReady(x,true)),web=assertWebResponse(webR,inventory.origins.web);
    fail(health.revision===inventory.deployments.apiRevision,'health_revision_mismatch'); const auth=ready.dependencies.durableAuth;
    const authMatchesPhase = inventory.activationPhase === 'dormant'
      ? auth.status==='not_checked_stub'&&auth.registrationMode==='closed'&&!('keyFingerprint' in auth)&&!('configFingerprint' in auth)&&!('expectedReplicaCount' in auth)
      : auth.status==='ok'&&auth.registrationMode===inventory.config.registrationMode&&auth.keyFingerprint===inventory.config.keyFingerprint&&auth.configFingerprint===inventory.config.configFingerprint&&auth.expectedReplicaCount===1;
    fail(ready.revision===inventory.deployments.apiRevision&&authMatchesPhase,'auth_readiness_phase_mismatch');
    fail(modes.modes.find(x=>x.id==='standard_1v1')?.enabled===true&&modes.modes.find(x=>x.id==='speed_1v1')?.enabled===true,'ranked_modes_invalid');
    fail(preview.revision!==inventory.deployments.apiRevision&&preview.dependencies.durableAuth.status==='not_checked_stub','preview_readiness_invalid');
    const webMatchesPhase = inventory.activationPhase === 'dormant'
      ? web.mode==='disabled'&&web.registrationMode===null
      : web.mode==='durable'&&web.registrationMode===inventory.config.registrationMode;
    fail(web.revision===inventory.deployments.webRevision,'web_revision_mismatch'); fail(webMatchesPhase,'web_identity_phase_mismatch');
    const migrations=await q(PREFLIGHT_SQL.migrations),identity=await q(PREFLIGHT_SQL.identity),schema=await q(PREFLIGHT_SQL.schema);
    fail(statements===6,'transaction_statement_accounting_invalid'); validateMigrationSet(migrations); fail(canonicalJson(migrations)===canonicalJson(inventory.migrations),'database_migration_mismatch');
    fail(identity?.identityFingerprint===inventory.database.identityFingerprint,'database_identity_mismatch'); fail(identity?.databaseHostFingerprint===inventory.database.databaseHostFingerprint,'database_host_mismatch');
    fail(schema?.status===inventory.database.schemaStatus&&schema?.remediationConflictCount===0,'database_schema_mismatch');
  });
  let after;
  await databaseAdapter.withReadOnlyObservation(async(query)=>{
    let statements=0;
    await query(PREFLIGHT_SQL.isolation); statements++;
    const readOnly=await query(PREFLIGHT_SQL.readOnlyStatus); statements++; fail(readOnly?.transactionReadOnly==='on','observation_transaction_read_only_off');
    after=await query(PREFLIGHT_SQL.snapshot); statements++; validateCompleteSnapshot(after);
    fail(statements===3,'observation_statement_accounting_invalid');
  });
  fail(equalSnapshot(before,after),'zero_write_observation_mismatch');
  proof={health:'ok',readiness:'ok',rankedModes:['speed_1v1','standard_1v1'],webIdentity:'ok',previewIsolation:'ok',databaseReadOnly:true,zeroWrite:true,providerDerived:true};
  const evidence={schemaVersion:3,result:'PASS',activationPhase:inventory.activationPhase,runId:inventory.runId,sourceSha:inventory.sourceSha,artifactSha:inventory.artifactSha,providerInventory:structuredClone(providerInventory),providerReceipt:structuredClone(providerReceipt),provider:inventory.provider,deployments:inventory.deployments,origins:inventory.origins,replicas:inventory.replicas,config:inventory.config,migrations:inventory.migrations,database:inventory.database,proof,source:inventory.source,expiresAt:inventory.expiresAt};
  scalarSafe({...evidence,providerInventory:null,providerReceipt:null}); fail(Buffer.byteLength(canonicalJson(evidence))<=MAX_EVIDENCE_BYTES,'evidence_oversized'); return {evidence,receipt:receiptFor(evidence)};
}
export function verifyPreflightReceipt(preflight, now=Date.now()) {
  exact(preflight,['evidence','receipt'],'preflight_artifact_schema_invalid'); exact(preflight.evidence,EVIDENCE_KEYS,'preflight_evidence_schema_invalid');
  fail(preflight.evidence.schemaVersion===3&&preflight.evidence.result==='PASS'&&PHASES.includes(preflight.evidence.activationPhase),'preflight_not_pass');
  exact(preflight.evidence.proof,PROOF,'preflight_proof_schema_invalid'); fail(Object.values(preflight.evidence.proof).every(v=>v===true||v==='ok'||Array.isArray(v)),'preflight_proof_invalid');
  const operationalInventory={schemaVersion:3,activationPhase:preflight.evidence.activationPhase,runId:preflight.evidence.runId,sourceSha:preflight.evidence.sourceSha,artifactSha:preflight.evidence.artifactSha,provider:preflight.evidence.provider,deployments:preflight.evidence.deployments,origins:preflight.evidence.origins,replicas:preflight.evidence.replicas,config:preflight.evidence.config,migrations:preflight.evidence.migrations,database:preflight.evidence.database,source:preflight.evidence.source,expiresAt:preflight.evidence.expiresAt};
  validateInventory(operationalInventory,now);
  const providerInventoryValid = preflight.evidence.providerInventory?.schemaVersion === LIVE_INVENTORY_VERSION
    ? validateLiveInventory(preflight.evidence.providerInventory).valid
    : validateProviderInventory(preflight.evidence.providerInventory).valid;
  fail(providerInventoryValid,'preflight_provider_inventory_invalid');
  if (preflight.evidence.providerInventory.schemaVersion === LIVE_INVENTORY_VERSION) fail(validateLiveReceipt(preflight.evidence.providerReceipt).valid,'preflight_provider_receipt_invalid');
  fail(preflight.evidence.providerReceipt?.inventoryDigest===`sha256:${receiptFor(preflight.evidence.providerInventory)}`,'preflight_provider_receipt_mismatch');
  providerComposition(operationalInventory,preflight.evidence.providerInventory);
  fail(Buffer.byteLength(canonicalJson(preflight.evidence))<=MAX_EVIDENCE_BYTES,'evidence_oversized'); fail(equalReceipt(receiptFor(preflight.evidence),preflight.receipt),'preflight_receipt_mismatch'); return structuredClone(preflight);
}
export function parsePreflightArgs(args) {
  fail(!args.includes('--apply'),'apply_forbidden');
  const names=['operational-inventory','provider-inventory','provider-receipt','native-evidence','expected-identities','expected-nonce','provider-receipt-key'];
  const optionalNames=['output'];
  fail(args.length===names.length*2||args.length===(names.length+optionalNames.length)*2,'arguments_invalid');
  const parsed={};
  for(let i=0;i<args.length;i+=2){const flag=args[i],value=args[i+1],name=flag?.slice(2);fail(flag?.startsWith('--')&&[...names,...optionalNames].includes(name)&&!Object.hasOwn(parsed,name)&&typeof value==='string'&&!value.startsWith('-'),'arguments_invalid');parsed[name]=value;}
  fail(names.every(name=>Object.hasOwn(parsed,name)),'arguments_invalid');
  return {operationalInventoryPath:parsed['operational-inventory'],providerInventoryPath:parsed['provider-inventory'],providerReceiptPath:parsed['provider-receipt'],nativeEvidencePath:parsed['native-evidence'],expectedIdentitiesPath:parsed['expected-identities'],expectedNonce:parsed['expected-nonce'],providerReceiptKeyPath:parsed['provider-receipt-key'],outputPath:parsed.output};
}

export const ROLLBACK_ORDER = Object.freeze(['web-writes-off','registration-closed','sessions-revoked','zero-active-sessions-proven','api-durable-off','code-rollback']);
export function validateRollbackOrder(steps) {
  fail(Array.isArray(steps)&&steps.length===ROLLBACK_ORDER.length&&steps.every((step,index)=>step===ROLLBACK_ORDER[index]),'rollback_order_invalid');
  return [...steps];
}
