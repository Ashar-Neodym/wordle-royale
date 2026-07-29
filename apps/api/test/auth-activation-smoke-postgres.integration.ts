import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';
// @ts-expect-error The shared executable core is intentionally plain ESM and exercised directly.
import { MIGRATIONS, canonicalJson, receiptFor, runActivationPreflight } from '../../../scripts/auth-activation-preflight-core.mjs';
// @ts-expect-error The shared executable core is intentionally plain ESM and exercised directly.
import { runAuthActivationSmoke, SMOKE_RECONCILIATION_SQL } from '../../../scripts/auth-activation-smoke-core.mjs';

if (process.env.RUN_AUTH_ACTIVATION_SMOKE_POSTGRES !== '1') throw new Error('disposable PostgreSQL wrapper required');

const apiOrigin = 'https://api.auth-smoke.example.test';
const webOrigin = 'https://web.auth-smoke.example.test';
const previewApiOrigin = 'https://preview-api.auth-smoke.example.test';
const previewWebOrigin = 'https://preview-web.auth-smoke.example.test';
const revision = '255b2'.padEnd(40, '0');
const runId = `ticket255-${randomUUID()}`;
const email = `canary-${randomUUID()}@example.test`;
const password = `${randomBytes(24).toString('base64url')}!Aa9`;
const secrets = { email, password, handle: `canary_${randomBytes(6).toString('hex')}`, displayName: 'Activation Canary' };
const rateKey = randomBytes(32);
const rateKeyEncoded = rateKey.toString('base64url');
const canaryDigest = createHmac('sha256', rateKey).update(email.trim().toLowerCase()).digest('base64url');

Object.assign(process.env, {
  NODE_ENV: 'production', APP_ENV: 'production', AUTH_MODE: 'session_required', DURABLE_AUTH_ENABLED: 'true',
  AUTH_RATE_LIMIT_KEY: rateKeyEncoded, AUTH_REGISTRATION_MODE: 'canary', AUTH_REGISTRATION_CANARY_DIGEST: canaryDigest,
  TRUSTED_PROXY_HOPS: '1', EXPECTED_API_REPLICA_COUNT: '1', GIT_COMMIT_SHA: revision,
  ACCOUNT_SESSION_TTL_SECONDS: '3600', ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS: '300',
  PUBLIC_WEB_URL: webOrigin, CORS_ALLOWED_ORIGINS: webOrigin, COOKIE_SECURE: 'true', COOKIE_DOMAIN: '',
  ENABLE_DEV_AUTH: 'false', ENABLE_DEV_ROUTES: 'false', REDIS_REQUIRED: 'false', REDIS_URL: '',
  STANDARD_1V1_QUEUE_ENABLED: 'false', SPEED_1V1_QUEUE_ENABLED: 'true', SPEED_RECONCILER_ENABLED: 'false',
});

const db = new PrismaClient();
let app: INestApplication | undefined;
let localOrigin = '';
let initialCatalogFingerprint = '';
let approvalConsumeCount = 0;
let requestCount = 0;
let registerRequestCount = 0;
const baseline = { ticket: 0, match: 0, gameplay: 0, rating: 0, event: 0 };

function safeHash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function dependency(status = 'ok') { return { status, checkedAt: new Date().toISOString(), message: 'integration observation' }; }
function modeFixture() {
  const common = (id: string, label: string, players: string, enabled: boolean) => ({ id, label, players, rated: true, enabled, provisionalGames: 5, defaultRating: 1500, defaultRatingDeviation: 350, notes: 'integration fixture' });
  return { modes: [
    common('standard_1v1', 'Standard', '1v1', true),
    { ...common('speed_1v1', 'Speed / Blitz', '1v1', true), queueEnabled: true, rulesetVersion: 'speed_1v1_v1_75s', readyLifecycleVersion: 'speed_ready_v1_match_created_20s', ratingAlgorithmConfigVersion: 'speed_1v1_glicko_v1', timeControl: { roundTimeSeconds: 75, invitationWindowSeconds: 90, readyWindowSeconds: 20, readyWindowStartsOn: 'first_valid_ready_acknowledgement', countdownSeconds: 3, maxGuesses: 6, solveTimeBucketMs: 100, tieBreaker: 'server_solve_time_bucket' } },
    common('classic_1v1', 'Classic', '1v1', false), common('multiplayer_lobby', 'Multiplayer / Lobby', '2-4', false),
  ] };
}

async function rawFetch(path: string, init: RequestInit = {}) {
  const started = performance.now();
  const response = await fetch(`${localOrigin}${path}`, { ...init, redirect: 'manual' });
  const text = await response.text();
  let body: unknown = null;
  if (text) body = JSON.parse(text);
  return { response, body, bodyBytes: Buffer.byteLength(text), elapsedMs: performance.now() - started };
}

async function currentDeltas(client: Prisma.TransactionClient | PrismaClient) {
  const [ticket, match, guesses, rounds, scores, mutations, ratings, ratingEvents, analytics, audits] = await Promise.all([
    client.matchmakingTicket.count(), client.match.count(), client.guessAttempt.count(), client.matchRound.count(),
    client.scoreBreakdown.count(), client.matchMutationRequest.count(), client.ratingProfile.count(), client.ratingEvent.count(),
    client.analyticsEvent.count(), client.auditLog.count(),
  ]);
  return {
    ticket: ticket - baseline.ticket,
    match: match - baseline.match,
    gameplay: guesses + rounds + scores + mutations - baseline.gameplay,
    rating: ratings + ratingEvents - baseline.rating,
    event: analytics + audits - baseline.event,
  };
}

async function smokeSnapshot(client: Prisma.TransactionClient) {
  const account = await client.userAccount.findUnique({ where: { email }, select: { id: true } });
  const userId = account?.id;
  const [profileCount, credentialCount, sessions, buckets, deltas] = await Promise.all([
    userId ? client.userProfile.count({ where: { userId } }) : 0,
    userId ? client.passwordCredential.count({ where: { userId } }) : 0,
    userId ? client.accountSession.findMany({ where: { userId }, select: { revokedAt: true, expiresAt: true } }) : [],
    client.authRateLimitBucket.findMany({ select: { action: true, attemptCount: true, blockedUntil: true } }),
    currentDeltas(client),
  ]);
  const now = Date.now();
  const terminal = sessions.filter((s) => s.revokedAt !== null || s.expiresAt.getTime() <= now).length;
  const register = buckets.filter((b) => b.action.startsWith('register_'));
  const login = buckets.filter((b) => b.action.startsWith('login_'));
  return {
    accountCount: account ? 1 : 0, profileCount, credentialCount, sessionCount: sessions.length,
    terminalSessionCount: terminal, activeSessionCount: sessions.length - terminal,
    registerAttempts: register.reduce((n, b) => n + b.attemptCount, 0), loginAttempts: login.reduce((n, b) => n + b.attemptCount, 0),
    registerBucketCount: register.length, loginBucketCount: login.length,
    blockedBucketCount: buckets.filter((b) => b.blockedUntil !== null && b.blockedUntil.getTime() > now).length,
    ticketWriteCount: deltas.ticket, matchWriteCount: deltas.match, gameplayWriteCount: deltas.gameplay,
    ratingWriteCount: deltas.rating, eventWriteCount: deltas.event, catalogFingerprint: initialCatalogFingerprint,
  };
}

const reconciliation = {
  async withReadOnlyTransaction(work: (query: (sql: string, binding?: unknown) => Promise<unknown>) => Promise<void>) {
    await db.$transaction(async (tx) => {
      await work(async (sql) => {
        if (sql === SMOKE_RECONCILIATION_SQL.isolation) { await tx.$executeRawUnsafe(sql); return true; }
        if (sql === SMOKE_RECONCILIATION_SQL.readOnlyStatus) {
          const rows = await tx.$queryRawUnsafe<Array<{ transaction_read_only: string }>>(sql);
          return { transactionReadOnly: rows[0]?.transaction_read_only };
        }
        if (sql === SMOKE_RECONCILIATION_SQL.snapshot) return smokeSnapshot(tx);
        throw new Error('reconciliation SQL is not allowlisted');
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  },
};

before(async () => {
  const releaseId = randomUUID();
  await db.dictionaryRelease.create({ data: {
    id: releaseId, locale: 'en', wordLength: 5, version: `ticket255-${randomUUID()}`, status: 'active',
    sourceLabel: 'ticket255 disposable production-approved fixture',
    sourceMetadata: { fixtureOnly: false, productionApproved: true, validation: { passed: true } },
    artifactSha256: safeHash('ticket255-disposable-dictionary'), answerCount: 1, guessCount: 0, bannedCount: 0, releasedAt: new Date(),
    words: { create: { normalizedWord: 'crane', kind: 'answer', checksum: safeHash('crane') } },
  } });
  const { AppModule } = await import('../src/app.module.ts');
  const { configureTrustedProxy } = await import('../src/main.ts');
  const { ApiExceptionFilter } = await import('../src/shared/api-exception.filter.ts');
  app = await NestFactory.create(AppModule, { logger: false });
  configureTrustedProxy(app);
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert(address && typeof address === 'object');
  localOrigin = `http://127.0.0.1:${address.port}`;
  const counts = await currentDeltas(db);
  baseline.ticket = counts.ticket; baseline.match = counts.match; baseline.gameplay = counts.gameplay; baseline.rating = counts.rating; baseline.event = counts.event;
});

after(async () => {
  password.replaceAll(/./gu, '0');
  await app?.close();
  await db.$disconnect();
});

test('Ticket 255B2 runs the actual smoke core over real Nest HTTP and disposable PostgreSQL', async () => {
  const now = Date.now();
  const observedAt = new Date(now - 1_000).toISOString();
  const expiresAt = new Date(now + 10 * 60_000).toISOString();
  const keyFingerprint = safeHash(rateKey).slice(0, 16);
  const configFingerprint = safeHash('ticket255-real-config').slice(0, 16);
  const databaseIdentity = await db.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database, current_schema() AS schema`;
  const identityFingerprint = safeHash(`${databaseIdentity[0]?.database}:${databaseIdentity[0]?.schema}`);
  const databaseHostFingerprint = safeHash('local-disposable-postgresql');
  const migrations = MIGRATIONS.map((id: string) => ({ id, status: 'applied' }));
  const provider = { projectId: 'local-project', environmentId: 'local-production', apiServiceId: 'local-api', webServiceId: 'mock-web', databaseId: 'disposable-postgres', previewEnvironmentId: 'mock-preview', previewDatabaseId: 'mock-preview-db' };
  const deployments = { apiDeploymentId: 'local-api-deployment', apiRevision: revision, webDeploymentId: 'mock-web-deployment', webRevision: 'b'.repeat(40) };
  const inventory = {
    schemaVersion: 2, runId: `preflight-${runId}`, sourceSha: revision, artifactSha: revision, provider, deployments,
    origins: { api: apiOrigin, web: webOrigin, previewApi: previewApiOrigin, previewWeb: previewWebOrigin },
    replicas: { expected: 1, observed: 1, observedReplicaId: 'local-replica-1' },
    config: { authMode: 'session_required', durableAuth: true, registrationMode: 'canary', appEnvironment: 'production', nodeEnvironment: 'production', secureCookie: true, hostOnlyCookie: true, proxyHops: 1, requiredKeysPresent: ['AUTH_RATE_LIMIT_KEY', 'DATABASE_URL'], keyFingerprint, configFingerprint },
    migrations, database: { identityFingerprint, databaseHostFingerprint, schemaStatus: 'ok', remediationConflictCount: 0 },
    source: { kind: 'provider-read-only', observedAt }, expiresAt,
  };
  let preflightSnapshots = 0;
  const preflightDatabase = {
    async withReadOnlyTransaction(work: (query: (sql: string) => Promise<unknown>) => Promise<void>) {
      await db.$transaction(async (tx) => work(async (sql) => {
        if (sql.startsWith('SET TRANSACTION')) { await tx.$executeRawUnsafe(sql); return true; }
        if (sql === 'SHOW transaction_read_only') { const rows = await tx.$queryRawUnsafe<Array<{ transaction_read_only: string }>>(sql); return { transactionReadOnly: rows[0]?.transaction_read_only }; }
        if (sql.includes('readonly_snapshot')) { preflightSnapshots++; return { accountCount: await tx.userAccount.count() }; }
        if (sql.includes('complete_migration_status')) {
          const rows = await tx.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
          return rows.map((row) => ({ id: row.migration_name, status: row.finished_at !== null && row.rolled_back_at === null ? 'applied' : 'invalid' }));
        }
        if (sql.includes('database_identity')) return { identityFingerprint, databaseHostFingerprint };
        if (sql.includes('schema_readiness')) {
          const rows = await tx.$queryRaw<Array<{ present: string | null }>>`SELECT to_regclass('"UserAccount"')::text AS present`;
          return { status: rows[0]?.present ? 'ok' : 'unavailable', remediationConflictCount: 0 };
        }
        throw new Error('preflight SQL is not allowlisted');
      }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    },
  };
  const mockPublic = {
    async get(url: string) {
      const path = new URL(url).pathname;
      let body: unknown;
      if (url.startsWith(apiOrigin) && path === '/healthz') body = { status: 'ok', service: 'wordle-royale-api', environment: 'production', timestamp: new Date().toISOString(), uptimeSeconds: 1, revision };
      else if (url.startsWith(apiOrigin) && path === '/readyz') body = { status: 'ok', service: 'wordle-royale-api', environment: 'production', revision, checkedAt: new Date().toISOString(), dependencies: { database: dependency(), applicationSchema: dependency(), durableAuth: { ...dependency(), registrationMode: 'canary', keyFingerprint, configFingerprint, expectedReplicaCount: 1 }, standardDictionary: dependency(), speedRuntime: dependency(), speedLifecycleActivation: dependency(), redis: dependency() } };
      else if (url.startsWith(apiOrigin) && path === '/ranked/modes') body = modeFixture();
      else if (url.startsWith(previewApiOrigin) && path === '/readyz') body = { status: 'ok', service: 'wordle-royale-api', environment: 'production', revision: 'c'.repeat(40), checkedAt: new Date().toISOString(), dependencies: { database: dependency(), applicationSchema: dependency(), durableAuth: { ...dependency('not_checked_stub'), registrationMode: 'closed' }, standardDictionary: dependency(), speedRuntime: dependency(), speedLifecycleActivation: dependency(), redis: dependency() } };
      else if (url.startsWith(webOrigin) && path === '/.well-known/wordle-identity') {
        const web = { revision: deployments.webRevision, appEnvironment: 'production', mode: 'durable', registrationMode: 'canary' };
        return { method: 'GET', status: 200, redirected: false, url, body: web, bodyBytes: Buffer.byteLength(JSON.stringify(web)), contentType: 'application/json' };
      } else throw new Error('unexpected mocked identity URL');
      const envelope = { data: body, meta: { requestId: 'ticket255-preflight', timestamp: new Date().toISOString() } };
      return { method: 'GET', status: 200, redirected: false, url, body: envelope, bodyBytes: Buffer.byteLength(JSON.stringify(envelope)), contentType: 'application/json' };
    },
  };
  const preflight = await runActivationPreflight({ inventory, inventoryReceipt: receiptFor(inventory), publicAdapter: mockPublic, databaseAdapter: preflightDatabase });
  assert.equal(preflight.evidence.result, 'PASS');
  assert.equal(preflightSnapshots, 2);

  const actualCatalog = await rawFetch('/ranked/modes');
  assert.equal(actualCatalog.response.status, 200);
  const catalogEnvelope = actualCatalog.body as { data: unknown };
  initialCatalogFingerprint = safeHash(canonicalJson(catalogEnvelope.data));

  const approval = {
    schemaVersion: 1, approvalId: `approval-${randomUUID()}`, runId, preflightReceipt: preflight.receipt,
    artifactSha: preflight.evidence.artifactSha, provider: preflight.evidence.provider, deployments: preflight.evidence.deployments,
    origins: { api: apiOrigin, web: webOrigin }, registrationMode: 'canary',
    accountFingerprint: safeHash(`auth-smoke-account-v1\0${runId}\0${email.trim().toLowerCase()}`),
    approvedAt: new Date(now - 1_000).toISOString(), expiresAt: new Date(now + 20 * 60_000).toISOString(),
  };
  const transport = {
    async request(input: { method: string; url: string; redirect: 'manual'; origin: string; json?: unknown; cookie?: string }) {
      requestCount++;
      const path = new URL(input.url).pathname;
      if (path === '/auth/register') registerRequestCount++;
      const headers: Record<string, string> = { Origin: input.origin, 'X-Forwarded-For': '198.51.100.255', 'X-Request-Id': `ticket255-${requestCount}` };
      if (input.cookie) headers.Cookie = input.cookie;
      let body: string | undefined;
      if (input.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(input.json); }
      const result = await rawFetch(path, { method: input.method, headers, ...(body === undefined ? {} : { body }), redirect: 'manual' });
      const contentTypeHeader = result.response.headers.get('content-type');
      const contentType = contentTypeHeader?.toLowerCase().startsWith('application/json') ? 'application/json' : contentTypeHeader;
      const setCookie = result.response.headers.get('set-cookie');
      return { method: input.method, url: input.url, effectiveUrl: input.url, origin: input.origin, redirect: input.redirect, status: result.response.status, contentType, bodyBytes: result.bodyBytes, setCookie: setCookie ? [setCookie] : [], body: result.body, elapsedMs: result.elapsedMs };
    },
  };
  const consumed = new Set<string>();
  const result = await runAuthActivationSmoke({
    approval, preflight, secrets, transport, reconciliation,
    consumeApproval: async (binding: { approvalId: string }) => { assert.equal(consumed.has(binding.approvalId), false); consumed.add(binding.approvalId); approvalConsumeCount++; },
  });
  assert.equal(result.result, 'PASS', `smoke failed: ${String((result as { failureCode?: string }).failureCode)}`);
  assert.deepEqual(result.statuses, [200,200,200,403,201,200,204,401,403,403,403,401,401,200,200,401,200,204,401,200]);
  assert.equal(result.statuses.length, 20);
  assert.equal(result.sessionsCreated, 3);
  assert.equal(result.approvalConsumed, true);
  assert.equal(approvalConsumeCount, 1);
  assert.equal(registerRequestCount, 1);
  assert.equal(requestCount, 20);
  assert.equal(canonicalJson(result).includes(email), false);
  assert.equal(canonicalJson(result).includes(password), false);
  assert.equal(canonicalJson(result).includes('wr1.'), false);
  const final = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(SMOKE_RECONCILIATION_SQL.isolation);
    return smokeSnapshot(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  assert.deepEqual({ account: final.accountCount, profile: final.profileCount, credential: final.credentialCount, sessions: final.sessionCount, terminal: final.terminalSessionCount, active: final.activeSessionCount }, { account: 1, profile: 1, credential: 1, sessions: 3, terminal: 3, active: 0 });
  assert.deepEqual({ registerAttempts: final.registerAttempts, loginAttempts: final.loginAttempts, registerBuckets: final.registerBucketCount, loginBuckets: final.loginBucketCount, blocked: final.blockedBucketCount }, { registerAttempts: 2, loginAttempts: 8, registerBuckets: 2, loginBuckets: 3, blocked: 0 });
  assert.deepEqual({ tickets: final.ticketWriteCount, matches: final.matchWriteCount, gameplay: final.gameplayWriteCount, rating: final.ratingWriteCount, events: final.eventWriteCount }, { tickets: 0, matches: 0, gameplay: 0, rating: 0, events: 0 });
  console.log('[Ticket255B2] PASS statuses=20 account/profile/credential=1/1/1 sessions=3 terminal=3 active=0 rateAttempts=2/8 rateBuckets=2/3 blocked=0 rankedDeltas=0/0/0/0/0 approval=1 registerDispatch=1 retries=0 leakScan=clean');
});
