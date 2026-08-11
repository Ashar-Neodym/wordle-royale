import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';
import { DurableAuthPersistenceService } from '../src/auth/durable-auth-persistence.service.ts';
import { ExternalSessionService } from '../src/auth/external-session.service.ts';
import { ExternalTokenVerifier } from '../src/auth/external-token-verifier.ts';
import { digestSessionToken } from '../src/auth/session-token.ts';
import { externalOidcConfig } from '../src/config/runtime-config.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { ApiExceptionFilter } from '../src/shared/api-exception.filter.ts';

const origin = process.env.PUBLIC_WEB_URL!;
const issuer = process.env.OIDC_ISSUER!;
const audience = process.env.OIDC_AUDIENCE!;
const db = new PrismaClient();
let app: INestApplication;
let signingKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let wrongSigningKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let publicKey: Awaited<ReturnType<typeof generateKeyPair>>['publicKey'];
let verifierCalls = 0;
let barrierRemaining = 0;
let releaseBarrier: (() => void) | undefined;
let barrierPromise: Promise<void> | undefined;

function armVerifierBarrier(parties: number): void {
  barrierRemaining = parties;
  barrierPromise = new Promise<void>((resolve) => { releaseBarrier = resolve; });
}

async function resolveLocalKey() {
  verifierCalls += 1;
  if (barrierRemaining > 0) {
    barrierRemaining -= 1;
    if (barrierRemaining === 0) releaseBarrier?.();
    else await barrierPromise;
  }
  return publicKey;
}

async function tokenFor(subject: string, key = signingKey): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({ sub: subject })
    .setProtectedHeader({ alg: 'RS256', kid: 'local-integration-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
}

async function createApp(): Promise<INestApplication> {
  const config = externalOidcConfig();
  assert.ok(config);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ExternalSessionService)
    .useFactory({
      inject: [PrismaService, DurableAuthPersistenceService],
      factory: (prisma: PrismaService, durableAuth: DurableAuthPersistenceService) => new ExternalSessionService(
        prisma.client as unknown as PrismaClient,
        durableAuth,
        new ExternalTokenVerifier(config, resolveLocalKey),
      ),
    })
    .compile();
  const instance = moduleRef.createNestApplication();
  instance.useGlobalFilters(new ApiExceptionFilter());
  await instance.init();
  return instance;
}

before(async () => {
  const signing = await generateKeyPair('RS256');
  const wrong = await generateKeyPair('RS256');
  signingKey = signing.privateKey;
  publicKey = signing.publicKey;
  wrongSigningKey = wrong.privateKey;
  app = await createApp();
});
after(async () => {
  await app.close();
  await db.$disconnect();
});

function exchange(token: string, body: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .post('/auth/external/session')
    .set('Origin', origin)
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

function cookieFrom(response: request.Response): string {
  const cookies = response.headers['set-cookie'];
  assert.ok(Array.isArray(cookies));
  return cookies[0]!.split(';')[0]!;
}

const validSubject = `valid-${randomUUID()}`;
let validUserId = '';
let validCookie = '';

test('auth readiness is ok against the migrated durable and external identity schema', async () => {
  const response = await request(app.getHttpServer()).get('/readyz').expect(200);
  assert.equal(response.body.data.dependencies.durableAuth.status, 'ok');
  assert.equal(response.body.data.dependencies.durableAuth.registrationMode, 'closed');
  assert.equal(response.body.data.dependencies.durableAuth.message, 'Durable authentication configuration and schema are ready.');
  const externalSchema = await app.get(PrismaService).checkExternalAuthSchema();
  assert.equal(externalSchema.status, 'ok');
  assert.equal(externalSchema.message, 'External authentication identity schema is ready.');

  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" DROP CONSTRAINT "ExternalIdentity_pkey"');
  assert.equal((await app.get(PrismaService).checkExternalAuthSchema()).status, 'unavailable');
  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")');

  await db.$executeRawUnsafe('DROP INDEX "ExternalIdentity_userId_idx"');
  assert.equal((await app.get(PrismaService).checkExternalAuthSchema()).status, 'unavailable');
  await db.$executeRawUnsafe('CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId")');

  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" ALTER COLUMN "createdAt" DROP DEFAULT');
  assert.equal((await app.get(PrismaService).checkExternalAuthSchema()).status, 'unavailable');
  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP');
  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" ALTER COLUMN "createdAt" TYPE TIMESTAMP(2)');
  assert.equal((await app.get(PrismaService).checkExternalAuthSchema()).status, 'unavailable');
  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" ALTER COLUMN "createdAt" TYPE TIMESTAMP(3)');
  await db.$executeRawUnsafe(`ALTER TABLE "ExternalIdentity" ALTER COLUMN "id" SET DEFAULT 'fixture'`);
  assert.equal((await app.get(PrismaService).checkExternalAuthSchema()).status, 'unavailable');
  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" ALTER COLUMN "id" DROP DEFAULT');

  await db.$executeRawUnsafe('DROP INDEX "ExternalIdentity_issuer_subject_key"');
  await db.$executeRawUnsafe('CREATE UNIQUE INDEX "ExternalIdentity_issuer_subject_key" ON "ExternalIdentity"("issuer" DESC, "subject")');
  assert.equal((await app.get(PrismaService).checkExternalAuthSchema()).status, 'unavailable');
  await db.$executeRawUnsafe('DROP INDEX "ExternalIdentity_issuer_subject_key"');
  await db.$executeRawUnsafe('CREATE UNIQUE INDEX "ExternalIdentity_issuer_subject_key" ON "ExternalIdentity"("issuer", "subject")');

  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" DROP CONSTRAINT "ExternalIdentity_userId_fkey"');
  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id")');
  assert.equal((await app.get(PrismaService).checkExternalAuthSchema()).status, 'unavailable');
  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" DROP CONSTRAINT "ExternalIdentity_userId_fkey"');
  await db.$executeRawUnsafe('ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  assert.equal((await app.get(PrismaService).checkExternalAuthSchema()).status, 'ok');
});

test('external exchange enforces exact origin and JSON content type before verifier or writes', async () => {
  const token = await tokenFor(`blocked-${randomUUID()}`);
  const callsBefore = verifierCalls;
  const accountsBefore = await db.userAccount.count();
  await request(app.getHttpServer()).post('/auth/external/session').set('Content-Type', 'application/json').set('Authorization', `Bearer ${token}`).send({}).expect(403);
  await request(app.getHttpServer()).post('/auth/external/session').set('Origin', `${origin}.evil`).set('Content-Type', 'application/json').set('Authorization', `Bearer ${token}`).send({}).expect(403);
  await request(app.getHttpServer()).post('/auth/external/session').set('Origin', origin).set('Content-Type', 'text/plain').set('Authorization', `Bearer ${token}`).send('{}').expect(403);
  assert.equal(verifierCalls, callsBefore);
  assert.equal(await db.userAccount.count(), accountsBefore);
});

test('valid HTTP exchange persists one complete cookie-only external account and cookie authenticates /auth/me', async () => {
  const response = await exchange(await tokenFor(validSubject), { handle: 'oidc_primary', displayName: 'OIDC Primary' }).expect(200);
  validUserId = response.body.data.user.id;
  assert.equal(response.body.data.user.email, null);
  assert.equal(response.body.data.session.provider, 'oidc');
  assert.doesNotMatch(JSON.stringify(response.body), /Bearer|accessToken|refreshToken|tokenHash|wr1\./u);
  validCookie = cookieFrom(response);
  assert.match(validCookie, /^wr_session=wr1\.[A-Za-z0-9_-]{43}$/u);
  assert.match(response.headers['set-cookie']![0]!, /; HttpOnly; SameSite=Lax; Max-Age=3600; Expires=/u);
  assert.doesNotMatch(response.headers['set-cookie']![0]!, /; Secure|Domain=/u);

  assert.equal(await db.userAccount.count(), 1);
  assert.equal(await db.userProfile.count(), 1);
  assert.equal(await db.externalIdentity.count(), 1);
  assert.equal(await db.accountSession.count(), 1);
  const identity = await db.externalIdentity.findUniqueOrThrow({ where: { issuer_subject: { issuer, subject: validSubject } } });
  assert.equal(identity.userId, validUserId);
  const account = await db.userAccount.findUniqueOrThrow({ where: { id: validUserId } });
  assert.equal(account.email, null);
  const me = await request(app.getHttpServer()).get('/auth/me').set('Cookie', validCookie).expect(200);
  assert.equal(me.body.data.id, validUserId);
  assert.equal(me.body.data.email, null);
});

test('same-user cookie re-exchange revokes only the presented session as relogin', async () => {
  const oldToken = validCookie.slice(validCookie.indexOf('=') + 1);
  const response = await exchange(await tokenFor(validSubject)).set('Cookie', validCookie).expect(200);
  const replacement = cookieFrom(response);
  assert.notEqual(replacement, validCookie);
  const old = await db.accountSession.findUniqueOrThrow({ where: { tokenHash: digestSessionToken(oldToken) } });
  assert.ok(old.revokedAt);
  assert.equal(old.revocationReason, 'relogin');
  await request(app.getHttpServer()).get('/auth/me').set('Cookie', validCookie).expect(401);
  await request(app.getHttpServer()).get('/auth/me').set('Cookie', replacement).expect(200);
  validCookie = replacement;
});

test('simultaneous first exchanges for one subject leave one account, profile, identity, and no orphan candidate', async () => {
  const subject = `race-${randomUUID()}`;
  const token = await tokenFor(subject);
  const before = {
    accounts: await db.userAccount.count(),
    profiles: await db.userProfile.count(),
    identities: await db.externalIdentity.count(),
  };
  armVerifierBarrier(2);
  const [left, right] = await Promise.all([
    exchange(token, { handle: 'race_left', displayName: 'Race Left' }),
    exchange(token, { handle: 'race_right', displayName: 'Race Right' }),
  ]);
  assert.equal(left.status, 200);
  assert.equal(right.status, 200);
  assert.equal(left.body.data.user.id, right.body.data.user.id);
  assert.equal(await db.userAccount.count(), before.accounts + 1);
  assert.equal(await db.userProfile.count(), before.profiles + 1);
  assert.equal(await db.externalIdentity.count(), before.identities + 1);
  const identity = await db.externalIdentity.findUniqueOrThrow({ where: { issuer_subject: { issuer, subject } } });
  const profile = await db.userProfile.findUniqueOrThrow({ where: { userId: identity.userId } });
  assert.ok(['race_left', 'race_right'].includes(profile.publicHandle));
  assert.equal(await db.userAccount.count({ where: { externalIdentities: { none: {} } } }), 0);
  assert.equal(await db.userProfile.count({ where: { user: { externalIdentities: { none: {} } } } }), 0);
});

test('handle conflict returns 409 and transaction rolls back new account, profile, and identity', async () => {
  const ownerId = randomUUID();
  await db.userAccount.create({ data: { id: ownerId, email: null, displayName: 'Handle Owner' } });
  await db.userProfile.create({ data: { userId: ownerId, publicHandle: 'already_taken' } });
  const before = {
    accounts: await db.userAccount.count(),
    profiles: await db.userProfile.count(),
    identities: await db.externalIdentity.count(),
  };
  const subject = `conflict-${randomUUID()}`;
  const response = await exchange(await tokenFor(subject), { handle: 'already_taken', displayName: 'Conflict' }).expect(409);
  assert.deepEqual(response.body.error, { code: 'external_identity_conflict', message: 'External account exchange could not be completed.', details: {} });
  assert.equal(await db.userAccount.count(), before.accounts);
  assert.equal(await db.userProfile.count(), before.profiles);
  assert.equal(await db.externalIdentity.count(), before.identities);
  assert.equal(await db.externalIdentity.count({ where: { issuer, subject } }), 0);
});

test('inactive linked account returns the generic invalid-external-token 401', async () => {
  await db.userAccount.update({ where: { id: validUserId }, data: { status: 'disabled' } });
  const response = await exchange(await tokenFor(validSubject)).expect(401);
  assert.deepEqual(response.body.error, { code: 'invalid_external_token', message: 'External token is invalid.', details: {} });
  assert.doesNotMatch(JSON.stringify(response.body), /disabled|inactive|user|subject/u);
});

test('IP rate limit exhausts its real PostgreSQL bucket and blocks before verifier work', async () => {
  await db.authRateLimitBucket.deleteMany();
  const invalidSignature = await tokenFor(`bad-signature-${randomUUID()}`, wrongSigningKey);
  const before = verifierCalls;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await exchange(invalidSignature).expect(401);
    assert.equal(response.body.error.code, 'invalid_external_token');
  }
  assert.equal(verifierCalls, before + 30);
  const blocked = await exchange(invalidSignature).expect(429);
  assert.deepEqual(blocked.body.error, { code: 'auth_rate_limited', message: 'Authentication temporarily unavailable.', details: {} });
  assert.equal(verifierCalls, before + 30);
  const bucket = await db.authRateLimitBucket.findFirstOrThrow({ where: { action: 'external_ip' } });
  assert.equal(bucket.attemptCount, 31);
  assert.ok(bucket.blockedUntil);
});
