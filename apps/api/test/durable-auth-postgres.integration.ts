import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthRateLimitedError, PostgresAuthRateLimiter } from '../src/auth/auth-rate-limiter.js';
import { DurableAuthPersistenceService, InvalidCredentialsError, RegistrationUnavailableError } from '../src/auth/durable-auth-persistence.service.js';
import { digestSessionToken } from '../src/auth/session-token.js';

const db = new PrismaClient();
after(async () => db.$disconnect());
const key = randomBytes(32);
let clock = new Date('2026-07-28T12:00:00.000Z');
const service = () => new DurableAuthPersistenceService(db, { enabled: true, rateLimitKey: key, now: () => new Date(clock), sessionTtlMs: 3_600_000 });
const password = () => `${randomBytes(12).toString('base64url')}!Aa9`;

test('durable auth requires its HMAC key only when enabled and errors have exact public shapes', () => {
  assert.doesNotThrow(() => new DurableAuthPersistenceService(db, { enabled: false }));
  assert.throws(() => new DurableAuthPersistenceService(db, { enabled: true }), /AUTH_RATE_LIMIT_KEY/u);
  assert.deepEqual({ code: new InvalidCredentialsError().code, message: new InvalidCredentialsError().message }, { code: 'invalid_credentials', message: 'Invalid credentials.' });
  const limited = new AuthRateLimitedError();
  assert.deepEqual({ code: limited.code, message: limited.message }, { code: 'auth_rate_limited', message: 'Authentication temporarily unavailable.' });
  const registration = new RegistrationUnavailableError();
  assert.deepEqual({ code: registration.code, message: registration.message }, { code: 'registration_unavailable', message: 'Registration unavailable.' });
});

test('concurrent registration is atomic, generic, salted, token-digest-only, and restart durable', async () => {
  const secret = password();
  const attempts = await Promise.allSettled(Array.from({ length: 3 }, (_, index) => service().register({
    email: index ? ' RACE@Example.com ' : 'race@example.com', password: secret,
    handle: index ? `race_${index}` : 'race_one', displayName: 'Race User',
  }, `198.51.100.${index}`)));
  const wins = attempts.filter((x): x is PromiseFulfilledResult<Awaited<ReturnType<ReturnType<typeof service>['register']>>> => x.status === 'fulfilled');
  assert.equal(wins.length, 1);
  for (const loss of attempts.filter((x) => x.status === 'rejected')) assert.ok((loss as PromiseRejectedResult).reason instanceof RegistrationUnavailableError);
  const user = await db.userAccount.findUnique({ where: { email: 'race@example.com' }, include: { passwordCredential: true, profile: true, accountSessions: true } });
  assert.ok(user?.passwordCredential && user.profile);
  assert.equal(user.accountSessions.length, 1);
  assert.notEqual(user.passwordCredential.passwordHash, secret);
  assert.equal(user.accountSessions[0]!.tokenHash, digestSessionToken(wins[0]!.value.token));
  const dump = JSON.stringify(user);
  assert.equal(dump.includes(secret), false);
  assert.equal(dump.includes(wins[0]!.value.token), false);
  assert.deepEqual(await service().resolveSession(wins[0]!.value.token), { userId: user.id, sessionId: wins[0]!.value.session.id });
});

test('generic login, malformed verifier, independent devices, exact logout, status and expiry', async () => {
  const secret = password();
  const initial = await service().register({ email: 'devices@example.com', password: secret, handle: 'devices', displayName: 'Devices' }, '203.0.113.1');
  await assert.rejects(service().login({ email: 'unknown@example.com', password: secret }, '203.0.113.2'), InvalidCredentialsError);
  await assert.rejects(service().login({ email: 'devices@example.com', password: `${secret}x` }, '203.0.113.3'), InvalidCredentialsError);
  const one = await service().login({ email: 'devices@example.com', password: secret }, '203.0.113.4');
  const two = await service().login({ email: 'devices@example.com', password: secret }, '203.0.113.5');
  assert.notEqual(one.token, two.token);
  await service().logout(one.token);
  await service().logout(one.token);
  assert.equal(await service().resolveSession(one.token), null);
  assert.ok(await service().resolveSession(two.token));
  const user = await db.userAccount.findUniqueOrThrow({ where: { email: 'devices@example.com' } });
  await db.userAccount.update({ where: { id: user.id }, data: { status: 'disabled' } });
  assert.equal(await service().resolveSession(two.token), null);
  await assert.rejects(service().login({ email: 'devices@example.com', password: secret }, '203.0.113.6'), InvalidCredentialsError);
  await db.userAccount.update({ where: { id: user.id }, data: { status: 'active' } });
  clock = new Date(clock.getTime() + 3_600_001);
  assert.equal(await service().resolveSession(initial.token), null);
  await db.passwordCredential.update({ where: { userId: user.id }, data: { passwordHash: 'malformed' } });
  await assert.rejects(service().login({ email: 'devices@example.com', password: secret }, '203.0.113.7'), InvalidCredentialsError);
});

test('email and IP service consumption is one atomic PostgreSQL transaction', async () => {
  const limiter = new PostgresAuthRateLimiter(db, key, () => new Date(clock));
  const blockedIp = `192.0.2.${Math.floor(Math.random() * 100) + 100}`;
  for (let index = 0; index < 30; index++) await limiter.consume('login_ip', blockedIp, 30);
  const emailBefore = await db.authRateLimitBucket.aggregate({ where: { action: 'login_email' }, _sum: { attemptCount: true } });
  await assert.rejects(service().login({ email: `fresh-${randomUUID()}@example.com`, password: password() }, blockedIp), AuthRateLimitedError);
  const emailAfter = await db.authRateLimitBucket.aggregate({ where: { action: 'login_email' }, _sum: { attemptCount: true } });
  assert.deepEqual(emailAfter._sum, emailBefore._sum, 'blocked IP rolled back the fresh email increment');

  const blockedEmail = `blocked-${randomUUID()}@example.com`;
  for (let index = 0; index < 10; index++) await limiter.consume('login_email', blockedEmail, 10);
  const ipBefore = await db.authRateLimitBucket.aggregate({ where: { action: 'login_ip' }, _sum: { attemptCount: true } });
  await assert.rejects(service().login({ email: blockedEmail, password: password() }, `198.51.100.${Math.floor(Math.random() * 100) + 100}`), AuthRateLimitedError);
  const ipAfter = await db.authRateLimitBucket.aggregate({ where: { action: 'login_ip' }, _sum: { attemptCount: true } });
  assert.deepEqual(ipAfter._sum, ipBefore._sum, 'blocked email neither skipped nor polluted the IP bucket');
});

test('dummy initialization is shared, awaited on both paths, and every login performs one real verify KDF', async () => {
  const events: Array<'dummy_hash' | 'verify'> = [];
  const auth = new DurableAuthPersistenceService(db, { enabled: true, rateLimitKey: key, now: () => new Date(clock), sessionTtlMs: 3_600_000, cryptoObserver: (event) => events.push(event) });
  const secret = password();
  await auth.register({ email: 'kdf-paths@example.com', password: secret, handle: 'kdf_paths', displayName: 'KDF Paths' }, '203.0.113.100');
  events.length = 0;
  await auth.login({ email: 'kdf-paths@example.com', password: secret }, '203.0.113.101');
  await assert.rejects(auth.login({ email: 'missing-kdf@example.com', password: secret }, '203.0.113.102'), InvalidCredentialsError);
  assert.deepEqual(events, ['verify', 'verify']);
});

test('relogin revokes only the presented token and lastSeen writes are throttled', async () => {
  const auth = service();
  const secret = password();
  const first = await auth.register({ email: 'relogin@example.com', password: secret, handle: 'relogin_user', displayName: 'Relogin' }, '203.0.113.110');
  const second = await auth.login({ email: 'relogin@example.com', password: secret }, '203.0.113.111', first.token);
  const old = await db.accountSession.findUniqueOrThrow({ where: { tokenHash: digestSessionToken(first.token) } });
  assert.equal(old.revocationReason, 'relogin');
  assert.ok(old.revokedAt);
  const before = await db.accountSession.findUniqueOrThrow({ where: { tokenHash: digestSessionToken(second.token) } });
  await auth.resolveSession(second.token);
  const unthrottled = await db.accountSession.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(unthrottled.lastSeenAt.getTime(), before.lastSeenAt.getTime());
  clock = new Date(clock.getTime() + 900_001);
  await auth.resolveSession(second.token);
  const touched = await db.accountSession.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(touched.lastSeenAt.getTime(), clock.getTime());
});

test('session cleanup requires old expiry and no recent revocation', async () => {
  const auth = service();
  const secret = password();
  const registered = await auth.register({ email: 'cleanup@example.com', password: secret, handle: 'cleanup_user', displayName: 'Cleanup' }, '203.0.113.120');
  const cutoff = new Date(clock.getTime() - 86_400_000);
  const expired = new Date(cutoff.getTime() - 3_600_000);
  await db.accountSession.update({ where: { id: registered.session.id }, data: { expiresAt: expired, revokedAt: clock, revocationReason: 'logout' } });
  const data = (revokedAt: Date | null) => ({ id: randomUUID(), userId: registered.session.userId, tokenHash: digestSessionToken(`wr1.${randomBytes(32).toString('base64url')}`), createdAt: expired, lastSeenAt: expired, expiresAt: expired, revokedAt, revocationReason: revokedAt ? 'logout' : null });
  const oldRevoked = data(new Date(cutoff.getTime() - 1));
  const unrevoked = data(null);
  await db.accountSession.createMany({ data: [oldRevoked, unrevoked] });
  assert.equal(await auth.cleanupSessions(86_400_000), 2);
  assert.ok(await db.accountSession.findUnique({ where: { id: registered.session.id } }), 'recent revocation protects old-expired row');
  assert.equal(await db.accountSession.findUnique({ where: { id: oldRevoked.id } }), null);
  assert.equal(await db.accountSession.findUnique({ where: { id: unrevoked.id } }), null);
});

test('PostgreSQL limiter is HMAC-only and cannot overshoot under concurrency', async () => {
  const limiter = new PostgresAuthRateLimiter(db, key, () => new Date(clock));
  const results = await Promise.allSettled(Array.from({ length: 40 }, () => limiter.consume('login_ip', '192.0.2.99', 10)));
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 10);
  assert.equal(results.filter((x) => x.status === 'rejected' && x.reason instanceof AuthRateLimitedError).length, 30);
  const rows = await db.authRateLimitBucket.findMany({ where: { action: 'login_ip' } });
  const row = rows.find((x) => x.attemptCount === 40);
  assert.ok(row);
  assert.match(row.keyHash, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(rows).includes('192.0.2.99'), false);
});
