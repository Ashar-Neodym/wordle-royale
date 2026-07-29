#!/usr/bin/env node
import { mkdir, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
// @ts-expect-error no declaration file is emitted for the repository script core
import { canonicalJson, normalizeJsonContentType, receiptFor } from '../../../scripts/auth-activation-preflight-core.mjs';
// @ts-expect-error no declaration file is emitted for the repository script core
import { parseSmokeArgs, readProtectedStdin, runAuthActivationSmoke, SMOKE_RECONCILIATION_SQL } from '../../../scripts/auth-activation-smoke-core.mjs';

async function boundedJsonFile(path: string): Promise<unknown> {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 2 || stat.size > 65_536) throw new Error('input_file_invalid');
    return JSON.parse(await handle.readFile('utf8'));
  } finally { await handle.close(); }
}
async function main() {
  const { approvalPath, preflightPath } = parseSmokeArgs(process.argv.slice(2));
  const [approval, preflight, secrets] = await Promise.all([
    boundedJsonFile(approvalPath), boundedJsonFile(preflightPath), readProtectedStdin(process.stdin),
  ]);
  const api = new URL(approval.origins.api); const db = new PrismaClient(); let baselineRanked: unknown = null; let baselineAttempts: { register: number; login: number } | null = null;
  const reconciliation = { async withReadOnlyTransaction(work: (query: (sql: string, binding?: {runId:string;accountFingerprint:string}) => Promise<unknown>) => Promise<void>) {
    await db.$transaction(async (tx) => {
      let isolated = false;
      const query = async (sql: string, _binding?: {runId:string;accountFingerprint:string}) => {
        if (sql === SMOKE_RECONCILIATION_SQL.isolation) { await tx.$executeRawUnsafe(SMOKE_RECONCILIATION_SQL.isolation); isolated = true; return true; }
        if (!isolated) throw new Error('read_only_transaction_required');
        if (sql === SMOKE_RECONCILIATION_SQL.readOnlyStatus) { const row = (await tx.$queryRawUnsafe<Array<{transaction_read_only:string}>>(SMOKE_RECONCILIATION_SQL.readOnlyStatus))[0]; return { transactionReadOnly: row?.transaction_read_only }; }
        if (sql !== SMOKE_RECONCILIATION_SQL.snapshot) throw new Error('sql_not_allowlisted');
        const account = await tx.userAccount.findUnique({ where: { email: secrets.email.trim().toLowerCase() }, select: { id: true } });
        const [profileCount, credentialCount, sessionCount, activeSessionCount, terminalSessionCount, attemptRows, rank] = await Promise.all([
          account ? tx.userProfile.count({ where: { userId: account.id } }) : 0, account ? tx.passwordCredential.count({ where: { userId: account.id } }) : 0,
          account ? tx.accountSession.count({ where: { userId: account.id } }) : 0, account ? tx.accountSession.count({ where: { userId: account.id, revokedAt: null, expiresAt: { gt: new Date() } } }) : 0,
          account ? tx.accountSession.count({ where: { userId: account.id, OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: new Date() } }] } }) : 0,
          tx.$queryRawUnsafe<Array<{register: bigint; login: bigint; registerBuckets: bigint; loginBuckets: bigint; blocked: bigint}>>(`SELECT coalesce(sum("attemptCount") FILTER (WHERE action LIKE 'register_%'),0) AS register,coalesce(sum("attemptCount") FILTER (WHERE action LIKE 'login_%'),0) AS login,count(*) FILTER (WHERE action LIKE 'register_%') AS "registerBuckets",count(*) FILTER (WHERE action LIKE 'login_%') AS "loginBuckets",count(*) FILTER (WHERE "blockedUntil" IS NOT NULL) AS blocked FROM "AuthRateLimitBucket"`),
          tx.$queryRawUnsafe<Array<Record<string,bigint>>>(`SELECT (SELECT count(*) FROM "MatchmakingTicket") AS tickets,(SELECT count(*) FROM "Match") AS matches,(SELECT count(*) FROM "MatchParticipant") AS participants,(SELECT count(*) FROM "RatingEvent") AS ratings,(SELECT count(*) FROM "GuessAttempt") AS guesses,(SELECT count(*) FROM "MatchRound") AS rounds`).then(rows => rows[0]),
        ]);
        const attempts = attemptRows[0];
        const totals = { register: Number(attempts?.register ?? 0), login: Number(attempts?.login ?? 0) };
        const ranked = Object.fromEntries(Object.entries(rank ?? {}).map(([key, value]) => [key, Number(value)]));
        if (baselineRanked === null) { baselineRanked = ranked; baselineAttempts = totals; }
        const delta = (key: string) => Number(ranked[key] ?? 0) - Number((baselineRanked as Record<string, number>)[key] ?? 0);
        return { accountCount: account ? 1 : 0, profileCount, credentialCount, sessionCount, terminalSessionCount, activeSessionCount, registerAttempts: totals.register - baselineAttempts!.register, loginAttempts: totals.login - baselineAttempts!.login, registerBucketCount: Number(attempts?.registerBuckets ?? 0), loginBucketCount: Number(attempts?.loginBuckets ?? 0), blockedBucketCount: Number(attempts?.blocked ?? 0), ticketWriteCount: delta('tickets'), matchWriteCount: delta('matches') + delta('participants'), gameplayWriteCount: delta('guesses') + delta('rounds'), ratingWriteCount: delta('ratings'), eventWriteCount: 0, catalogFingerprint: receiptFor(baselineRanked) };
      };
      await work(query);
    }, { timeout: 30_000 });
  } };
  const transport = { async request({ method, url, redirect, origin, json, cookie }: Record<string, unknown>) {
    const headers: Record<string,string> = { accept: 'application/json', origin: String(origin) };
    if (json !== undefined) headers['content-type'] = 'application/json'; if (cookie) headers.cookie = String(cookie);
    const requestedUrl = new URL(String(url));
    if (requestedUrl.origin !== api.origin || requestedUrl.protocol !== 'https:') throw new Error('request_authority_invalid');
    const started = performance.now();
    const response = await fetch(requestedUrl, { method: String(method), redirect: 'manual', headers, ...(json === undefined ? {} : { body: JSON.stringify(json) }) });
    const elapsedMs = performance.now() - started; const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 65_536) throw new Error('response_body_oversized');
    let body: unknown = null;
    if (bytes.length) { try { body = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('response_json_invalid'); } }
    const rawCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : []);
    return { method, url, effectiveUrl: response.url, origin, redirect, status: response.status, contentType: normalizeJsonContentType(response.headers.get('content-type')), bodyBytes: bytes.length, setCookie: rawCookies, body, elapsedMs };
  } };
  const consumeApproval = async ({ approvalId, runId, preflightReceipt }: Record<string,string>) => {
    const directory = resolve(process.env.AUTH_SMOKE_CONSUMPTION_DIR ?? '.auth-activation-consumed'); await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = await open(resolve(directory, `${approvalId}.json`), 'wx', 0o600);
    try { await file.writeFile(`${canonicalJson({ approvalId, runId, preflightReceipt, consumed: true })}\n`); await file.sync(); } finally { await file.close(); }
  };
  try { const evidence = await runAuthActivationSmoke({ approval, preflight, secrets, transport, reconciliation, consumeApproval }); process.stdout.write(`${canonicalJson(evidence)}\n`); process.exitCode = evidence.result === 'PASS' ? 0 : 1; }
  finally { secrets.email = secrets.password = secrets.handle = secrets.displayName = ''; await db.$disconnect(); }
}
main().catch(() => { process.stderr.write('{"result":"FAIL","failureCode":"smoke_failed"}\n'); process.exitCode = 1; });
