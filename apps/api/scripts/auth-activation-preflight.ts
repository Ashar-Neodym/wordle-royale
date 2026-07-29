#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service.ts';
// @ts-expect-error no declaration file is emitted for the repository script core
import { parsePreflightArgs, PREFLIGHT_SQL, runActivationPreflight, canonicalJson, MAX_PUBLIC_BODY_BYTES, normalizeJsonContentType } from '../../../scripts/auth-activation-preflight-core.mjs';

const COUNTS_SQL = `SELECT jsonb_build_object('accountCount',(SELECT count(*) FROM "UserAccount"),'profileCount',(SELECT count(*) FROM "UserProfile"),'credentialCount',(SELECT count(*) FROM "PasswordCredential"),'sessionCount',(SELECT count(*) FROM "AccountSession"),'rateBucketCount',(SELECT count(*) FROM "AuthRateLimitBucket"),'ticketCount',(SELECT count(*) FROM "MatchmakingTicket"),'matchCount',(SELECT count(*) FROM "Match"),'participantCount',(SELECT count(*) FROM "MatchParticipant"),'ratingEventCount',(SELECT count(*) FROM "RatingEvent")) AS snapshot`;
// Deliberately complete: no WHERE and no LIMIT may hide an unexpected migration.
const MIGRATIONS_SQL = `SELECT coalesce(jsonb_agg(jsonb_build_object('id',migration_name,'status',CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'applied' ELSE 'invalid' END) ORDER BY migration_name),'[]'::jsonb) AS migrations FROM "_prisma_migrations"`;
// pg_control_system() is mandatory. The role requires EXECUTE on this function; absence is a hard blocker.
const IDENTITY_SQL = `SELECT current_database() AS database_name, coalesce(inet_server_addr()::text,'local') AS server_address, inet_server_port() AS server_port, version() AS server_version, (pg_control_system()).system_identifier::text AS system_identifier`;
const REMEDIATION_SQL = `SELECT count(*) AS conflicts FROM "UserAccount" WHERE "email" IS NOT NULL AND ("email" <> lower(btrim("email")) OR "email" !~ '^[ -~]+$')`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
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
async function main() {
  const { inventoryPath, inventoryReceiptPath }=parsePreflightArgs(process.argv.slice(2));
  const [inventory,inventoryReceipt]=await Promise.all([readFile(inventoryPath,'utf8').then(JSON.parse),readFile(inventoryReceiptPath,'utf8').then(x=>x.trim())]);
  const directHostFingerprint=directDatabaseHostFingerprint(process.env.DATABASE_URL); const prisma=new PrismaClient();
  const databaseAdapter={async withReadOnlyTransaction(work:(query:(sql:string)=>Promise<unknown>)=>Promise<void>){
    await prisma.$transaction(async(tx)=>{let isolated=false; const query=async(sql:string)=>{
      if(sql===PREFLIGHT_SQL.isolation){await tx.$executeRawUnsafe(PREFLIGHT_SQL.isolation);isolated=true;return true;} if(!isolated)throw new Error('read_only_transaction_required');
      if(sql===PREFLIGHT_SQL.readOnlyStatus){const row=(await tx.$queryRawUnsafe<Array<{transaction_read_only:string}>>(PREFLIGHT_SQL.readOnlyStatus))[0];return{transactionReadOnly:row?.transaction_read_only};}
      if(sql===PREFLIGHT_SQL.snapshot)return(await tx.$queryRawUnsafe<Array<{snapshot:unknown}>>(COUNTS_SQL))[0]?.snapshot;
      if(sql===PREFLIGHT_SQL.migrations)return(await tx.$queryRawUnsafe<Array<{migrations:unknown}>>(MIGRATIONS_SQL))[0]?.migrations;
      if(sql===PREFLIGHT_SQL.identity){const row=(await tx.$queryRawUnsafe<Array<Record<string,string|number>>>(IDENTITY_SQL))[0];if(!row?.system_identifier)throw new Error('pg_control_system_execute_required');return{identityFingerprint:sha256(`wordle-auth-db-v2\0${row.database_name}\0${row.server_address}\0${row.server_port}\0${row.server_version}\0${row.system_identifier}`),databaseHostFingerprint:directHostFingerprint};}
      if(sql===PREFLIGHT_SQL.schema){const [schema,conflict]=await Promise.all([new PrismaService().checkDurableAuthSchema(tx as never),tx.$queryRawUnsafe<Array<{conflicts:bigint}>>(REMEDIATION_SQL)]);return{status:schema.status,remediationConflictCount:Number(conflict[0]?.conflicts??-1)};} throw new Error('sql_not_allowlisted');}; await work(query);
    },{isolationLevel:'Serializable',timeout:30_000});
  }};
  const publicAdapter={async get(url:string){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),5_000);try{const response=await fetch(url,{method:'GET',redirect:'manual',headers:{accept:'application/json'},signal:controller.signal});const parsed=await boundedJson(response);return{method:'GET',status:response.status,redirected:response.status>=300&&response.status<400,url:response.url,contentType:normalizeJsonContentType(response.headers.get('content-type')),...parsed};}finally{clearTimeout(timeout);}}};
  try { const result=await runActivationPreflight({inventory,inventoryReceipt,publicAdapter,databaseAdapter});process.stdout.write(`${canonicalJson(result)}\n`); } finally { await prisma.$disconnect(); }
}
main().catch((error:unknown)=>{const prerequisite=error instanceof Error&&error.message==='pg_control_system_execute_required'?'pg_control_system_execute_required':undefined;process.stderr.write(`${canonicalJson({result:'FAIL',failureCode:prerequisite??'preflight_failed'})}\n`);process.exitCode=1;});
