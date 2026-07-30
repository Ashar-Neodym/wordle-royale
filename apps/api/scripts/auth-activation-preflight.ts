#!/usr/bin/env node
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error no declaration file is emitted for the repository script core
import { parsePreflightArgs, PREFLIGHT_SQL, runActivationPreflight, canonicalJson, MAX_PUBLIC_BODY_BYTES, normalizeJsonContentType } from '../../../scripts/auth-activation-preflight-core.mjs';
// @ts-expect-error no declaration file is emitted for the repository script core
import { createReplayGuard, loadCommittedBundle, readProtectedJson, verifyCommittedLiveBundle } from '../../../scripts/provider-provenance-live-collector-core.mjs';
// @ts-expect-error no declaration file is emitted for the repository script core
import { completeDatabaseFingerprint } from '../../../scripts/complete-database-fingerprint.mjs';

// Deliberately complete: no WHERE and no LIMIT may hide an unexpected migration.
const MIGRATIONS_SQL = `SELECT coalesce(jsonb_agg(jsonb_build_object('id',migration_name,'status',CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'invalid' END) ORDER BY migration_name),'[]'::jsonb) AS migrations FROM "_prisma_migrations"`;
// pg_control_system() is mandatory. The role requires EXECUTE on this function; absence is a hard blocker.
const IDENTITY_SQL = `SELECT current_database() AS database_name, coalesce(inet_server_addr()::text,'local') AS server_address, inet_server_port() AS server_port, version() AS server_version, (pg_control_system()).system_identifier::text AS system_identifier`;
const REMEDIATION_SQL = `SELECT count(*) AS conflicts FROM "UserAccount" WHERE "email" IS NOT NULL AND ("email" <> lower(btrim("email")) OR "email" !~ '^[ -~]+$')`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_PROTECTED_INPUT_BYTES = 64 * 1024;
async function readProtected(path: string): Promise<Buffer> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || (info.mode & 0o777) !== 0o600 || info.size > MAX_PROTECTED_INPUT_BYTES || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('protected_input_invalid');
    return await handle.readFile();
  } finally { await handle?.close(); }
}
async function writeProtected(path: string, value: string): Promise<void> {
  if (!isAbsolute(path) || resolve(path) !== path || basename(path) === '.' || basename(path) === '..') throw new Error('output_path_invalid');
  const parent = await realpath(dirname(path));
  let directory;
  try {
    directory = await open(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const info = await directory.stat();
    if ((info.mode & 0o777) !== 0o700 || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('output_directory_permissions_invalid');
    const handle = await open(join(parent, basename(path)), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
  } finally { await directory?.close(); }
}
const TEST_OBSERVED_URL_HEADER = 'x-wordle-auth-preflight-observed-url';
function testTransportTarget(rawUrl: string): { targetUrl: string; useMockObservedUrl: boolean } {
  const rawMap = process.env.AUTH_PREFLIGHT_TEST_ORIGIN_MAP;
  if (!rawMap) return { targetUrl: rawUrl, useMockObservedUrl: false };
  if (process.env.NODE_ENV !== 'test' || process.env.RUN_AUTH_PREFLIGHT_CLI_E2E !== '1') throw new Error('test_transport_forbidden');
  let mapping: unknown; try { mapping = JSON.parse(rawMap); } catch { throw new Error('test_transport_invalid'); }
  if (mapping === null || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('test_transport_invalid');
  const requested = new URL(rawUrl); const mapped = (mapping as Record<string, unknown>)[requested.origin];
  if (typeof mapped !== 'string') throw new Error('test_transport_authority_unmapped');
  const target = new URL(mapped);
  if (target.protocol !== 'http:' || !['127.0.0.1','::1','localhost'].includes(target.hostname) || target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error('test_transport_invalid');
  return { targetUrl: `${target.origin}${requested.pathname}${requested.search}`, useMockObservedUrl: true };
}
function directDatabaseHostFingerprint(raw: string | undefined): string {
  if (!raw) throw new Error('database_url_required');
  let url: URL; try { url = new URL(raw); } catch { throw new Error('database_url_invalid'); }
  if (!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('database_url_invalid');
  return sha256(`wordle-auth-db-host-v1\0${url.hostname.toLowerCase()}`);
}
async function boundedJson(response: Response): Promise<{body: unknown; bodyBytes: number}> {
  const reader=response.body?.getReader(); if (!reader) throw new Error('public_body_missing');
  const chunks: Uint8Array[]=[]; let size=0;
  while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>MAX_PUBLIC_BODY_BYTES){await reader.cancel();throw new Error('public_body_oversized');} chunks.push(value); }
  const bytes=Buffer.concat(chunks.map(x=>Buffer.from(x))); let body: unknown; try { body=JSON.parse(bytes.toString('utf8')); } catch { throw new Error('public_json_invalid'); }
  return {body,bodyBytes:size};
}
async function createProductionAdapters() {
  const [{Prisma,PrismaClient},{PrismaService}]=await Promise.all([import('@prisma/client'),import('../src/prisma/prisma.service.ts')]);
  const directHostFingerprint=directDatabaseHostFingerprint(process.env.DATABASE_URL); const prisma=new PrismaClient();
  // Every invocation opens a new transaction. The observation invocation therefore cannot
  // reuse the repeatable-read snapshot held while public GET probes execute.
  const inReadOnlyTransaction=async(work:(query:(sql:string)=>Promise<unknown>)=>Promise<void>)=>{
    await prisma.$transaction(async(tx)=>{let isolated=false; const query=async(sql:string)=>{
      if(sql===PREFLIGHT_SQL.isolation){await tx.$executeRawUnsafe(PREFLIGHT_SQL.isolation);isolated=true;return true;} if(!isolated)throw new Error('read_only_transaction_required');
      if(sql===PREFLIGHT_SQL.readOnlyStatus){const row=(await tx.$queryRawUnsafe<Array<{transaction_read_only:string}>>(PREFLIGHT_SQL.readOnlyStatus))[0];return{transactionReadOnly:row?.transaction_read_only};}
      if(sql===PREFLIGHT_SQL.snapshot)return completeDatabaseFingerprint(tx, Prisma.dmmf.datamodel);
      if(sql===PREFLIGHT_SQL.migrations)return(await tx.$queryRawUnsafe<Array<{migrations:unknown}>>(MIGRATIONS_SQL))[0]?.migrations;
      if(sql===PREFLIGHT_SQL.identity){const row=(await tx.$queryRawUnsafe<Array<Record<string,string|number>>>(IDENTITY_SQL))[0];if(!row?.system_identifier)throw new Error('pg_control_system_execute_required');return{identityFingerprint:sha256(`wordle-auth-db-v2\0${row.database_name}\0${row.server_address}\0${row.server_port}\0${row.server_version}\0${row.system_identifier}`),databaseHostFingerprint:directHostFingerprint};}
      if(sql===PREFLIGHT_SQL.schema){const [schema,conflict]=await Promise.all([new PrismaService().checkDurableAuthSchema(tx as never),tx.$queryRawUnsafe<Array<{conflicts:bigint}>>(REMEDIATION_SQL)]);return{status:schema.status,remediationConflictCount:Number(conflict[0]?.conflicts??-1)};} throw new Error('sql_not_allowlisted');}; await work(query);
    },{isolationLevel:'Serializable',timeout:30_000});
  };
  const databaseAdapter={withReadOnlyTransaction:inReadOnlyTransaction,withReadOnlyObservation:inReadOnlyTransaction};
  const publicAdapter={async get(url:string){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),5_000);try{const transport=testTransportTarget(url);const response=await fetch(transport.targetUrl,{method:'GET',redirect:'manual',headers:{accept:'application/json'},signal:controller.signal});const parsed=await boundedJson(response);return{method:'GET',status:response.status,redirected:response.status>=300&&response.status<400,url:transport.useMockObservedUrl?response.headers.get(TEST_OBSERVED_URL_HEADER):response.url,contentType:normalizeJsonContentType(response.headers.get('content-type')),...parsed};}finally{clearTimeout(timeout);}}};
  return { publicAdapter, databaseAdapter, close: async()=>prisma.$disconnect() };
}

async function createTestAdapters(operationalInventory: unknown) {
  const modulePath=process.env.AUTH_PREFLIGHT_TEST_ADAPTER_MODULE;
  if(!modulePath) return undefined;
  if(process.env.NODE_ENV!=='test'||process.env.RUN_AUTH_PREFLIGHT_CLI_E2E!=='1')throw new Error('test_adapter_forbidden');
  if(!isAbsolute(modulePath)||resolve(modulePath)!==modulePath)throw new Error('test_adapter_invalid');
  await readProtected(modulePath);
  const imported=await import(`${pathToFileURL(modulePath).href}?run=${Date.now()}`);
  if(typeof imported.createPreflightTestAdapters!=='function')throw new Error('test_adapter_invalid');
  const adapters=await imported.createPreflightTestAdapters({operationalInventory});
  if(!adapters||typeof adapters!=='object'||typeof adapters.publicAdapter?.get!=='function'||typeof adapters.databaseAdapter?.withReadOnlyTransaction!=='function'||typeof adapters.databaseAdapter?.withReadOnlyObservation!=='function')throw new Error('test_adapter_invalid');
  return {publicAdapter:adapters.publicAdapter,databaseAdapter:adapters.databaseAdapter,close:typeof adapters.close==='function'?adapters.close:async()=>{}};
}

async function main() {
  const parsed=parsePreflightArgs(process.argv.slice(2));
  const {providerEvidenceLane,operationalInventoryPath,outputPath}=parsed;
  const explicitTest=process.env.NODE_ENV==='test'&&process.env.RUN_AUTH_PREFLIGHT_CLI_E2E==='1';
  const anyTestSeam=Boolean(process.env.AUTH_PREFLIGHT_TEST_ORIGIN_MAP||process.env.AUTH_PREFLIGHT_TEST_ADAPTER_MODULE||process.env.RUN_AUTH_PREFLIGHT_CLI_E2E);
  if(process.env.NODE_ENV==='production'&&anyTestSeam)throw new Error('test_seam_forbidden');
  if(providerEvidenceLane==='fixture-v2-test-only'&&!explicitTest)throw new Error('fixture_v2_forbidden');
  const operationalInventory=await readProtectedJson(operationalInventoryPath,{maxBytes:MAX_PROTECTED_INPUT_BYTES});
  let providerInputs:Record<string,unknown>; let replayGuard:Awaited<ReturnType<typeof createReplayGuard>>|undefined;
  if(providerEvidenceLane==='production-live-v3'){
    const [bundle,policy,keyring]=await Promise.all([
      loadCommittedBundle(parsed.liveOutputRoot,parsed.liveRunId),
      readProtectedJson(parsed.challengePolicyPath,{maxBytes:MAX_PROTECTED_INPUT_BYTES}),
      readProtectedJson(parsed.collectorKeyringPath,{maxBytes:MAX_PROTECTED_INPUT_BYTES}),
    ]);
    const verified=verifyCommittedLiveBundle({bundle,keyring,policy});
    replayGuard=await createReplayGuard(parsed.replayRoot);
    providerInputs={providerEvidenceLane,providerInventory:verified.providerInventory,providerReceipt:verified.providerReceipt,nativeEvidence:verified.nativeEvidence,liveChallenge:verified.liveChallenge,collectorPublicKey:verified.collectorPublicKey,replayGuard,expectedChallengeId:policy.expectedChallengeId,expectedRunId:policy.expectedRunId,expectedNonce:policy.expectedNonce,expectedCollectorKeyId:verified.collectorKeyId};
  }else{
    const [providerInventory,providerReceipt,nativeEvidence,expectedIdentities,providerReceiptKey]=await Promise.all([
      readProtectedJson(parsed.providerInventoryPath,{maxBytes:MAX_PROTECTED_INPUT_BYTES}),readProtectedJson(parsed.providerReceiptPath,{maxBytes:MAX_PROTECTED_INPUT_BYTES}),readProtectedJson(parsed.nativeEvidencePath,{maxBytes:MAX_PROTECTED_INPUT_BYTES}),readProtectedJson(parsed.expectedIdentitiesPath,{maxBytes:MAX_PROTECTED_INPUT_BYTES}),readProtected(parsed.providerReceiptKeyPath),
    ]);
    providerInputs={providerEvidenceLane,providerInventory,providerReceipt,nativeEvidence,expectedIdentities,expectedNonce:parsed.expectedNonce,providerReceiptKey};
  }
  // Cryptographic bundle validation above happens before database code is loaded.
  const adapters=await createTestAdapters(operationalInventory)??await createProductionAdapters();
  try {
    const result=await runActivationPreflight({operationalInventory,...providerInputs,publicAdapter:adapters.publicAdapter,databaseAdapter:adapters.databaseAdapter});
    const output=`${canonicalJson(result)}\n`;if(outputPath)await writeProtected(outputPath,output);else process.stdout.write(output);
  } finally { await adapters.close(); await replayGuard?.close(); }
}
main().catch((error:unknown)=>{const prerequisite=error instanceof Error&&error.message==='pg_control_system_execute_required'?'pg_control_system_execute_required':undefined;process.stderr.write(`${canonicalJson({result:'FAIL',failureCode:prerequisite??'preflight_failed'})}\n`);process.exitCode=1;});
