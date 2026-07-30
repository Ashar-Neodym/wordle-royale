#!/usr/bin/env node
import { open } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
// @ts-expect-error no declaration file is emitted for the repository script core
import { canonicalJson, normalizeJsonContentType } from '../../../scripts/auth-activation-preflight-core.mjs';
// @ts-expect-error no declaration file is emitted for the repository script core
import { parseSmokeArgs, readProtectedStdin, runAuthActivationSmoke } from '../../../scripts/auth-activation-smoke-core.mjs';
// @ts-expect-error shared plain ESM reconciliation is used by production and integration
import { createAuthSmokeReconciliation } from '../../../scripts/auth-activation-reconciliation.mjs';
// @ts-expect-error shared plain ESM durable consumption is exercised directly
import { consumeApprovalDurably } from '../../../scripts/auth-activation-consumption.mjs';

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
  const api = new URL(approval.origins.api); const web = new URL(approval.origins.web); const db = new PrismaClient();
  const rateLimitKey = Buffer.from(process.env.AUTH_RATE_LIMIT_KEY ?? '', 'base64url');
  const clientIp = process.env.AUTH_SMOKE_CLIENT_IP ?? '';
  const reconciliation = createAuthSmokeReconciliation({ db, secrets, rateLimitKey, clientIp });
  const transport = { async request({ method, url, redirect, origin, json, cookie, deadlineMs, retryLimit }: Record<string, unknown>) {
    const headers: Record<string,string> = { accept: 'application/json', origin: String(origin) };
    if (json !== undefined) headers['content-type'] = 'application/json'; if (cookie) headers.cookie = String(cookie); headers['x-forwarded-for'] = clientIp;
    const requestedUrl = new URL(String(url));
    if (![api.origin, web.origin].includes(requestedUrl.origin) || requestedUrl.protocol !== 'https:' || retryLimit !== 0) throw new Error('request_authority_invalid');
    const started = performance.now();
    const response = await fetch(requestedUrl, { method: String(method), redirect: 'manual', headers, signal: AbortSignal.timeout(Number(deadlineMs)), ...(json === undefined ? {} : { body: JSON.stringify(json) }) });
    const elapsedMs = performance.now() - started; const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 65_536) throw new Error('response_body_oversized');
    let body: unknown = null;
    if (bytes.length) { try { body = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('response_json_invalid'); } }
    const rawCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : []);
    return { method, url, effectiveUrl: response.url, origin, redirect, status: response.status, contentType: normalizeJsonContentType(response.headers.get('content-type')), bodyBytes: bytes.length, setCookie: rawCookies, body, elapsedMs, attempts: 1 };
  } };
  const consumeApproval = async (binding: Record<string,string>) => consumeApprovalDurably(process.env.AUTH_SMOKE_CONSUMPTION_DIR ?? '/var/lib/wordle-royale/auth-smoke-consumed', binding);
  try { const evidence = await runAuthActivationSmoke({ approval, preflight, secrets, transport, reconciliation, consumeApproval }); process.stdout.write(`${canonicalJson(evidence)}\n`); process.exitCode = evidence.result === 'PASS' ? 0 : 1; }
  finally { secrets.email = secrets.password = secrets.handle = secrets.displayName = ''; await db.$disconnect(); }
}
main().catch(() => { process.stderr.write('{"result":"FAIL","failureCode":"smoke_failed"}\n'); process.exitCode = 1; });
