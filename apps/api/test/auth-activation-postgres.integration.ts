import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { parseAuthSessionOperatorArgs, runAuthSessionOperator } from '../scripts/auth-session-operator.ts';

if (process.env.RUN_AUTH_ACTIVATION_POSTGRES_INTEGRATION !== '1') throw new Error('wrapper required');
const db = new PrismaClient();
after(async () => db.$disconnect());
const revision = 'a'.repeat(40);
Object.assign(process.env, {
  NODE_ENV: 'production', APP_ENV: 'production', AUTH_MODE: 'session_required', DURABLE_AUTH_ENABLED: 'true',
  EXPECTED_API_REPLICA_COUNT: '1', GIT_COMMIT_SHA: revision,
});

const rollback = Symbol('rollback');
async function unavailableDuring(sql: string | string[]): Promise<void> {
  await assert.rejects(db.$transaction(async (tx) => {
    for (const statement of typeof sql === 'string' ? [sql] : sql) await tx.$executeRawUnsafe(statement);
    const result = await new PrismaService().checkDurableAuthSchema(tx);
    assert.equal(result.status, 'unavailable');
    throw rollback;
  }), (error) => error === rollback);
  assert.equal((await new PrismaService().checkDurableAuthSchema(db)).status, 'ok');
}

test('real PostgreSQL readiness requires exact tables, columns, indexes, FKs, and enabled triggers', async () => {
  assert.equal((await new PrismaService().checkDurableAuthSchema(db)).status, 'ok');
  await unavailableDuring('ALTER TABLE "AccountSession" RENAME TO "AccountSession_missing"');
  await unavailableDuring('ALTER TABLE "AccountSession" ADD COLUMN "unexpected" TEXT');
  await unavailableDuring('ALTER TABLE "AuthRateLimitBucket" ALTER COLUMN "attemptCount" SET DEFAULT 1');
  await unavailableDuring('DROP INDEX "AccountSession_expiresAt_idx"');
  await unavailableDuring(['DROP INDEX "AccountSession_expiresAt_idx"', 'CREATE INDEX "AccountSession_expiresAt_idx" ON "AccountSession"("createdAt")']);
  await unavailableDuring(['DROP INDEX "AccountSession_tokenHash_key"', 'CREATE UNIQUE INDEX "AccountSession_tokenHash_key" ON "AccountSession"("tokenHash" bpchar_pattern_ops)']);
  await unavailableDuring(['DROP INDEX "AccountSession_tokenHash_key"', 'CREATE UNIQUE INDEX "AccountSession_tokenHash_key" ON "AccountSession"("tokenHash" COLLATE "C")']);
  await unavailableDuring(['DROP INDEX "UserAccount_email_normalized_key"', 'CREATE UNIQUE INDEX "UserAccount_email_normalized_key" ON "UserAccount"(lower("email")) WHERE "email" IS NOT NULL']);
  await unavailableDuring('ALTER TABLE "AccountSession" DROP CONSTRAINT "AccountSession_userId_fkey"');
  await unavailableDuring(['ALTER TABLE "AccountSession" DROP CONSTRAINT "AccountSession_userId_fkey"', 'ALTER TABLE "AccountSession" ADD CONSTRAINT "AccountSession_userId_fkey" FOREIGN KEY ("id") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE']);
  await unavailableDuring('ALTER TABLE "PasswordCredential" DISABLE TRIGGER "PasswordCredential_requires_email"');
  await unavailableDuring(['DROP TRIGGER "PasswordCredential_requires_email" ON "PasswordCredential"', 'CREATE TRIGGER "PasswordCredential_requires_email" BEFORE UPDATE OF "createdAt" ON "PasswordCredential" FOR EACH ROW EXECUTE FUNCTION durable_auth_credential_requires_email()']);
});

test('operator dry-run writes nothing; cleanup is terminal-time correct, retained, and batch bounded', async () => {
  const now = new Date('2026-07-29T12:00:00.000Z');
  const old = new Date('2026-05-01T00:00:00.000Z');
  const recent = new Date('2026-07-20T00:00:00.000Z');
  const future = new Date('2026-08-20T00:00:00.000Z');
  const account = await db.userAccount.create({ data: { email: 'operator-fixture@example.test', displayName: 'Operator Fixture', profile: { create: { publicHandle: `op_${randomUUID().slice(0, 8)}` } }, passwordCredential: { create: { passwordHash: 'retained-test-verifier', updatedAt: now } } } });
  const session = (id: string, expiresAt: Date, revokedAt: Date | null) => ({ id, userId: account.id, tokenHash: randomBytes(32).toString('hex'), createdAt: old, lastSeenAt: old, expiresAt, revokedAt, revocationReason: revokedAt ? 'logout' : null });
  const ids = { expired: randomUUID(), revokedOld: randomUUID(), recentExpiry: randomUUID(), recentRevoke: randomUUID(), active: randomUUID() };
  await db.accountSession.createMany({ data: [
    session(ids.expired, old, null), session(ids.revokedOld, future, old), session(ids.recentExpiry, recent, null),
    session(ids.recentRevoke, old, recent), session(ids.active, future, null),
  ] });
  const base = ['cleanup', '--expected-revision', revision, '--max-sessions', '1', '--retention-days', '30'];
  const before = await db.accountSession.count({ where: { userId: account.id } });
  const dry = await runAuthSessionOperator(parseAuthSessionOperatorArgs(base), db, now);
  assert.deepEqual({ candidateCount: dry.candidateCount, remainingCandidateCount: dry.remainingCandidateCount }, { candidateCount: 1, remainingCandidateCount: 1 });
  assert.equal(await db.accountSession.count({ where: { userId: account.id } }), before);
  for (const expected of [1, 1, 0]) {
    const result = await runAuthSessionOperator(parseAuthSessionOperatorArgs([...base, '--apply', '--reason', 'approved retention cleanup']), db, now);
    assert.equal(result.affectedCount, expected);
    assert.match(String(result.receiptId), /^authop_[a-f0-9]{24}$/u);
    assert.deepEqual(Object.keys(result).sort(), ['affectedCount', 'maxSessions', 'mode', 'operation', 'receiptId', 'result', 'revision']);
  }
  assert.equal(await db.accountSession.findUnique({ where: { id: ids.expired } }), null);
  assert.equal(await db.accountSession.findUnique({ where: { id: ids.revokedOld } }), null, 'old revocation is terminal even when nominal expiry is future');
  assert.ok(await db.accountSession.findUnique({ where: { id: ids.recentRevoke } }), 'recent revocation retains old-expired session');
  assert.ok(await db.userAccount.findUnique({ where: { id: account.id } }));
  assert.ok(await db.userProfile.findUnique({ where: { userId: account.id } }));
  assert.ok(await db.passwordCredential.findUnique({ where: { userId: account.id } }));

  const revoke = ['revoke-all', '--expected-revision', revision, '--max-sessions', '10', '--apply', '--reason', 'approved incident containment'];
  assert.equal((await runAuthSessionOperator(parseAuthSessionOperatorArgs(revoke), db, now)).affectedCount, 1);
  assert.equal((await runAuthSessionOperator(parseAuthSessionOperatorArgs(revoke), db, now)).affectedCount, 0, 'apply is idempotent');
  assert.equal(await db.accountSession.count({ where: { userId: account.id, revokedAt: null, expiresAt: { gt: now } } }), 0);
});

test('operator environment, revision, reason, and bounds fail closed', async () => {
  const before = await db.accountSession.count();
  assert.throws(() => parseAuthSessionOperatorArgs(['revoke-all', '--expected-revision', revision, '--max-sessions', '10001']), /bound_invalid/u);
  assert.throws(() => parseAuthSessionOperatorArgs(['revoke-all', '--expected-revision', revision, '--max-sessions', '1', '--apply']), /reason_invalid/u);
  const input = parseAuthSessionOperatorArgs(['revoke-all', '--expected-revision', 'b'.repeat(40), '--max-sessions', '1']);
  await assert.rejects(runAuthSessionOperator(input, db), /revision_mismatch/u);
  assert.equal(await db.accountSession.count(), before);
});

test('revoke-all locks a deterministic bounded set against a hostile concurrent insert and remains idempotent', async () => {
  const now = new Date('2026-07-29T12:00:00.000Z');
  const future = new Date('2026-08-20T00:00:00.000Z');
  const account = await db.userAccount.create({ data: { email: 'operator-race@example.test', displayName: 'Operator Race' } });
  const makeSession = (id: string) => ({ id, userId: account.id, tokenHash: randomBytes(32).toString('hex'), createdAt: now, lastSeenAt: now, expiresAt: future });
  await db.accountSession.create({ data: makeSession(randomUUID()) });
  await db.$executeRawUnsafe('CREATE FUNCTION ticket253_pause_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$');
  await db.$executeRawUnsafe('CREATE TRIGGER ticket253_pause_revoke BEFORE UPDATE ON "AccountSession" FOR EACH ROW WHEN (NEW."revocationReason" = \'operator_revoke_all\') EXECUTE FUNCTION ticket253_pause_revoke()');
  const other = new PrismaClient();
  const input = parseAuthSessionOperatorArgs(['revoke-all', '--expected-revision', revision, '--max-sessions', '1', '--apply', '--reason', 'hostile concurrency proof']);
  try {
    const operation = runAuthSessionOperator(input, db, now);
    await new Promise((resolve) => setTimeout(resolve, 150));
    let insertFinished = false;
    const concurrentInsert = other.accountSession.create({ data: makeSession(randomUUID()) }).then(() => { insertFinished = true; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(insertFinished, false, 'concurrent writer must wait behind the operator table lock');
    const result = await operation;
    assert.equal(result.affectedCount, 1);
    assert.ok(Number(result.affectedCount) <= input.maxSessions);
    assert.equal('fullyRevoked' in result, false, 'receipt reports only bounded affected rows, never an unprovable full-revoke claim');
    await concurrentInsert;
    assert.equal(await db.accountSession.count({ where: { userId: account.id, revokedAt: null, expiresAt: { gt: now } } }), 1);
  } finally {
    await other.$disconnect();
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS ticket253_pause_revoke ON "AccountSession"');
    await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS ticket253_pause_revoke()');
  }
  assert.equal((await runAuthSessionOperator(input, db, now)).affectedCount, 1);
  assert.equal((await runAuthSessionOperator(input, db, now)).affectedCount, 0, 'post-race retry is idempotent');
});

test('a hostile PostgreSQL serialization failure rolls back and is sanitized', async () => {
  const now = new Date('2026-07-29T12:00:00.000Z');
  const account = await db.userAccount.create({ data: { email: 'operator-conflict@example.test', displayName: 'Operator Conflict' } });
  const id = randomUUID();
  await db.accountSession.create({ data: { id, userId: account.id, tokenHash: randomBytes(32).toString('hex'), createdAt: now, lastSeenAt: now, expiresAt: new Date('2026-08-20T00:00:00.000Z') } });
  await db.$executeRawUnsafe("CREATE FUNCTION ticket253_force_serialization_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'hostile private detail'; END $$");
  await db.$executeRawUnsafe('CREATE TRIGGER ticket253_force_serialization_failure BEFORE UPDATE ON "AccountSession" FOR EACH ROW WHEN (NEW."revocationReason" = \'operator_revoke_all\') EXECUTE FUNCTION ticket253_force_serialization_failure()');
  const input = parseAuthSessionOperatorArgs(['revoke-all', '--expected-revision', revision, '--max-sessions', '1', '--apply', '--reason', 'serialization rollback proof']);
  try {
    await assert.rejects(runAuthSessionOperator(input, db, now), (error: unknown) => {
      assert.equal(error instanceof Error && error.message, 'operator_failed');
      assert.equal(String(error).includes('hostile private detail'), false);
      return true;
    });
    assert.equal((await db.accountSession.findUniqueOrThrow({ where: { id } })).revokedAt, null, 'conflicted transaction must roll back');
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS ticket253_force_serialization_failure ON "AccountSession"');
    await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS ticket253_force_serialization_failure()');
  }
  assert.equal((await runAuthSessionOperator(input, db, now)).affectedCount, 1);
  assert.equal((await runAuthSessionOperator(input, db, now)).affectedCount, 0);
});
