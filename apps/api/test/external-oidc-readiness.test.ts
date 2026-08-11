import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { ExternalSessionService, ExternalAuthUnavailableError, ExternalIdentityConflictError } from '../src/auth/external-session.service.ts';
import { ExternalTokenInvalidError, ExternalTokenVerifier } from '../src/auth/external-token-verifier.ts';
import { InvalidCredentialsError, type DurableSessionResult } from '../src/auth/durable-auth-persistence.service.ts';
import { AuthRateLimitedError } from '../src/auth/auth-rate-limiter.ts';
import { generateSessionToken } from '../src/auth/session-token.ts';
import { externalOidcConfig, validateRuntimeConfig, type ExternalOidcConfig } from '../src/config/runtime-config.ts';
import { AuthController } from '../src/auth/auth.controller.ts';

const issuer = 'https://issuer.example.test/';
const audience = 'wordle-api';
const oidcConfig: ExternalOidcConfig = {
  issuer,
  audience,
  jwksUrl: 'https://issuer.example.test/.well-known/jwks.json',
  algorithms: ['RS256'],
};
const activation = {
  APP_ENV: 'local',
  AUTH_MODE: 'session_required',
  DURABLE_AUTH_ENABLED: 'true',
  EXTERNAL_AUTH_MODE: 'oidc',
  OIDC_ISSUER: issuer,
  OIDC_AUDIENCE: audience,
  OIDC_JWKS_URL: oidcConfig.jwksUrl,
  OIDC_ALLOWED_ALGORITHMS: 'RS256',
};

test('external OIDC configuration is disabled without inspecting provider fields', () => {
  assert.equal(externalOidcConfig({ EXTERNAL_AUTH_MODE: 'disabled', OIDC_ISSUER: 'http://bad' }), null);
  assert.equal(externalOidcConfig({}), null);
});

test('external OIDC configuration rejects unknown mode, preview, and incompatible auth activation', () => {
  assert.throws(() => externalOidcConfig({ EXTERNAL_AUTH_MODE: 'unknown' }), /EXTERNAL_AUTH_MODE/u);
  assert.throws(() => externalOidcConfig({ ...activation, APP_ENV: 'preview' }), /forbidden in preview/u);
  assert.throws(() => externalOidcConfig({ ...activation, DURABLE_AUTH_ENABLED: 'false' }), /durable session/u);
  assert.throws(() => externalOidcConfig({ ...activation, DURABLE_AUTH_ENABLED: 'yes' }), /durable session/u);
  assert.throws(() => externalOidcConfig({ ...activation, AUTH_MODE: 'dev_stub' }), /durable session/u);
});

test('external OIDC configuration strictly validates issuer, JWKS, audience, and algorithms', () => {
  for (const patch of [
    { OIDC_ISSUER: '' }, { OIDC_ISSUER: 'not-a-url' }, { OIDC_ISSUER: 'http://issuer.example.test/' }, { OIDC_ISSUER: ` ${issuer}` },
    { OIDC_JWKS_URL: '' }, { OIDC_JWKS_URL: 'relative/jwks' }, { OIDC_JWKS_URL: 'http://issuer.example.test/jwks' }, { OIDC_JWKS_URL: `${oidcConfig.jwksUrl} ` },
    { OIDC_AUDIENCE: '' }, { OIDC_AUDIENCE: 'two audiences' }, { OIDC_AUDIENCE: ' audience' }, { OIDC_AUDIENCE: 'x'.repeat(256) },
    { OIDC_ALLOWED_ALGORITHMS: '' }, { OIDC_ALLOWED_ALGORITHMS: 'HS256' },
    { OIDC_ALLOWED_ALGORITHMS: 'RS256,RS256' }, { OIDC_ALLOWED_ALGORITHMS: 'RS256,HS256' },
  ]) assert.throws(() => externalOidcConfig({ ...activation, ...patch }));

  assert.deepEqual(externalOidcConfig(activation), oidcConfig);
  const rateKey = Buffer.alloc(32, 9).toString('base64url');
  assert.equal(validateRuntimeConfig({
    ...activation,
    AUTH_RATE_LIMIT_KEY: rateKey,
    PUBLIC_WEB_URL: 'https://web.example.test',
  }).EXTERNAL_AUTH_MODE, 'oidc');
});

const fixedNow = new Date('2030-01-01T00:00:00.000Z');
const fixedSeconds = Math.floor(fixedNow.getTime() / 1_000);
const subject = '11111111-1111-4111-8111-111111111111';
type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

async function sign(privateKey: SigningKey, claims: Record<string, unknown> = {}, protectedAlg = 'RS256'): Promise<string> {
  return new SignJWT({
    sub: subject,
    iss: issuer,
    aud: audience,
    iat: fixedSeconds,
    exp: fixedSeconds + 300,
    ...claims,
  })
    .setProtectedHeader({ alg: protectedAlg, kid: 'local-test-key' })
    .sign(privateKey);
}

test('external token verifier accepts a valid locally signed token with zero network', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const verifier = new ExternalTokenVerifier(oidcConfig, async () => publicKey, () => fixedNow);
  assert.deepEqual(await verifier.verify(await sign(privateKey, { sub: 'provider-user-123' })), { issuer, subject: 'provider-user-123' });
});

test('external token verifier deterministically rejects signature, registered-claim, time, and subject failures', async () => {
  const keys = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const verifier = new ExternalTokenVerifier(oidcConfig, async () => keys.publicKey, () => fixedNow);
  const invalid = [
    await sign(other.privateKey),
    await sign(keys.privateKey, { iss: 'https://other.example.test/' }),
    await sign(keys.privateKey, { aud: 'other-api' }),
    await sign(keys.privateKey, { exp: fixedSeconds - 1 }),
    await sign(keys.privateKey, { nbf: fixedSeconds + 60 }),
    await sign(keys.privateKey, { sub: undefined }),
    await sign(keys.privateKey, { sub: 'contains space' }),
    await sign(keys.privateKey, { sub: '\u0000control' }),
    await sign(keys.privateKey, { sub: 'é' }),
    await sign(keys.privateKey, { sub: 'x'.repeat(256) }),
    'not-a-jwt',
    `a.${'x'.repeat(16_384)}.b`,
  ];
  for (const token of invalid) {
    await assert.rejects(verifier.verify(token), (error: unknown) => {
      assert.ok(error instanceof ExternalTokenInvalidError);
      assert.equal(error.code, 'invalid_external_token');
      assert.equal(error.message, 'External token is invalid.');
      assert.equal(error.message.includes(token), false);
      return true;
    });
  }

  const resolverFailure = new ExternalTokenVerifier(oidcConfig, async () => { throw new Error('resolver detail secret-token'); }, () => fixedNow);
  await assert.rejects(resolverFailure.verify(await sign(keys.privateKey)), (error: unknown) => {
    assert.ok(error instanceof ExternalTokenInvalidError);
    assert.equal(error.message, 'External token is invalid.');
    assert.doesNotMatch(error.message, /resolver|secret|token-/u);
    return true;
  });
});

type User = { id: string; email: string | null; displayName: string; status: string };
type Identity = { issuer: string; subject: string; userId: string };

class FakeExternalDb {
  users: User[] = [];
  profiles: Array<{ userId: string; publicHandle: string }> = [];
  identities: Identity[] = [];
  identityCreateFailure: { code: string } | null = null;
  concurrentWinner: Identity | null = null;

  externalIdentity = {
    findUnique: async (args: any) => {
      const key = args.where.issuer_subject as { issuer: string; subject: string };
      const identity = this.identities.find((item) => item.issuer === key.issuer && item.subject === key.subject) ?? this.concurrentWinner;
      if (!identity) return null;
      const user = this.users.find((item) => item.id === identity.userId) ?? { status: 'active' };
      return args.include ? { ...identity, user: { status: user.status } } : { ...identity };
    },
    create: async (args: any) => {
      if (this.identityCreateFailure) throw this.identityCreateFailure;
      this.identities.push({ ...args.data });
      return args.data;
    },
  };
  userAccount = {
    create: async (args: any) => {
      this.users.push({ email: null, ...args.data });
      return args.data;
    },
  };
  userProfile = {
    create: async (args: any) => {
      if (this.profiles.some((profile) => profile.publicHandle === args.data.publicHandle)) throw { code: 'P2002' };
      this.profiles.push({ ...args.data });
      return args.data;
    },
  };

  async $transaction<T>(operation: (tx: this) => Promise<T>): Promise<T> {
    const snapshot = {
      users: this.users.map((item) => ({ ...item })),
      profiles: this.profiles.map((item) => ({ ...item })),
      identities: this.identities.map((item) => ({ ...item })),
    };
    try { return await operation(this); } catch (error) {
      this.users = snapshot.users;
      this.profiles = snapshot.profiles;
      this.identities = snapshot.identities;
      throw error;
    }
  }
}

function verifierFor(identity: { issuer: string; subject: string } = { issuer, subject }) {
  return { verify: async (_token: string) => identity } as unknown as ExternalTokenVerifier;
}

function sessionIssuer(events: string[], error?: Error, rateEvents: string[] = []) {
  return {
    limitExternalIp: async (ip: string) => { rateEvents.push(`ip:${ip}`); },
    limitExternalSubject: async (identityIssuer: string, identitySubject: string) => { rateEvents.push(`subject:${identityIssuer}:${identitySubject}`); },
    issueSessionForUser: async (userId: string, presentedToken?: string): Promise<DurableSessionResult> => {
      events.push(`${userId}:${presentedToken ?? 'none'}`);
      if (error) throw error;
      return { token: 'fixture', session: { id: 'session-id', userId, createdAt: fixedNow, expiresAt: new Date(fixedNow.getTime() + 3_600_000) } };
    },
  };
}

test('external session service fails closed before DB work when verifier is absent', async () => {
  const db = new Proxy({}, { get: () => { throw new Error('DB touched'); } });
  const service = new ExternalSessionService(db as ConstructorParameters<typeof ExternalSessionService>[0], sessionIssuer([]) as ConstructorParameters<typeof ExternalSessionService>[1], null);
  await assert.rejects(service.exchange({ token: 'bearer', clientIp: '203.0.113.10' }), ExternalAuthUnavailableError);
});

test('external session service reuses active identity, rejects inactive identity, and issues only an opaque session', async () => {
  const db = new FakeExternalDb();
  db.users.push({ id: 'existing-user', email: null, displayName: 'Existing', status: 'active' });
  db.identities.push({ issuer, subject, userId: 'existing-user' });
  const issued: string[] = [];
  const rateEvents: string[] = [];
  const service = new ExternalSessionService(db as unknown as ConstructorParameters<typeof ExternalSessionService>[0], sessionIssuer(issued, undefined, rateEvents) as ConstructorParameters<typeof ExternalSessionService>[1], verifierFor());
  const result = await service.exchange({ token: 'verified-token', clientIp: '203.0.113.10', presentedSessionToken: 'old-session' });
  assert.equal(result.created, false);
  assert.deepEqual(issued, ['existing-user:old-session']);
  assert.deepEqual(rateEvents, [`ip:203.0.113.10`, `subject:${issuer}:${subject}`]);
  assert.equal(result.token, 'fixture');
  assert.equal(db.users.length, 1);

  db.users[0]!.status = 'suspended';
  await assert.rejects(service.exchange({ token: 'verified-token', clientIp: '203.0.113.10' }), ExternalTokenInvalidError);
  assert.equal(issued.length, 1);
});

test('external session first creation never links by email and creates identity/profile/account atomically before session issuance', async () => {
  const db = new FakeExternalDb();
  db.users.push({ id: 'email-owner', email: 'same@example.test', displayName: 'Email Owner', status: 'active' });
  const issued: string[] = [];
  const service = new ExternalSessionService(db as unknown as ConstructorParameters<typeof ExternalSessionService>[0], sessionIssuer(issued) as ConstructorParameters<typeof ExternalSessionService>[1], verifierFor());
  const result = await service.exchange({ token: 'verified-token', clientIp: '203.0.113.10', handle: 'new_player', displayName: 'New Player' });
  assert.equal(result.created, true);
  assert.equal(db.users.length, 2);
  assert.equal(db.users[1]!.email, null);
  assert.notEqual(db.users[1]!.id, 'email-owner');
  assert.equal(db.identities[0]!.userId, db.users[1]!.id);
  assert.equal(db.profiles[0]!.userId, db.users[1]!.id);
  assert.deepEqual(issued, [`${db.users[1]!.id}:none`]);
});

test('external session resolves same-identity race to winner without orphaning candidate', async () => {
  const db = new FakeExternalDb();
  db.users.push({ id: 'winner', email: null, displayName: 'Winner', status: 'active' });
  db.identityCreateFailure = { code: 'P2002' };
  db.concurrentWinner = { issuer, subject, userId: 'winner' };
  const issued: string[] = [];
  const service = new ExternalSessionService(db as unknown as ConstructorParameters<typeof ExternalSessionService>[0], sessionIssuer(issued) as ConstructorParameters<typeof ExternalSessionService>[1], verifierFor());
  const result = await service.exchange({ token: 'verified-token', clientIp: '203.0.113.10', handle: 'race_player', displayName: 'Race Player' });
  assert.equal(result.created, false);
  assert.deepEqual(issued, ['winner:none']);
  assert.deepEqual(db.users.map((user) => user.id), ['winner']);
  assert.equal(db.profiles.length, 0);
});

test('external session handle conflict rolls back account/profile and emits a conflict', async () => {
  const db = new FakeExternalDb();
  db.profiles.push({ userId: 'other', publicHandle: 'taken_handle' });
  const service = new ExternalSessionService(db as unknown as ConstructorParameters<typeof ExternalSessionService>[0], sessionIssuer([]) as ConstructorParameters<typeof ExternalSessionService>[1], verifierFor());
  await assert.rejects(service.exchange({ token: 'verified-token', clientIp: '203.0.113.10', handle: 'taken_handle', displayName: 'New Player' }), ExternalIdentityConflictError);
  assert.equal(db.users.length, 0);
  assert.deepEqual(db.profiles, [{ userId: 'other', publicHandle: 'taken_handle' }]);
  assert.equal(db.identities.length, 0);
});

test('external session maps deactivation during issuance to generic invalid token and other session failures to unavailable', async () => {
  const db = new FakeExternalDb();
  db.users.push({ id: 'existing-user', email: null, displayName: 'Existing', status: 'active' });
  db.identities.push({ issuer, subject, userId: 'existing-user' });
  const inactive = new ExternalSessionService(db as unknown as ConstructorParameters<typeof ExternalSessionService>[0], sessionIssuer([], new InvalidCredentialsError()) as ConstructorParameters<typeof ExternalSessionService>[1], verifierFor());
  await assert.rejects(inactive.exchange({ token: 'verified-token', clientIp: '203.0.113.10' }), ExternalTokenInvalidError);
  const failed = new ExternalSessionService(db as unknown as ConstructorParameters<typeof ExternalSessionService>[0], sessionIssuer([], new Error('database detail')) as ConstructorParameters<typeof ExternalSessionService>[1], verifierFor());
  await assert.rejects(failed.exchange({ token: 'verified-token', clientIp: '203.0.113.10' }), ExternalAuthUnavailableError);
});

test('external session controller enforces strict bearer/body and returns canonical cookie response', async () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const sessionId = '33333333-3333-4333-8333-333333333333';
  const calls: unknown[] = [];
  let failure: Error | undefined;
  const externalSessions = { exchange: async (input: unknown) => {
    calls.push(input);
    if (failure) throw failure;
    return { token: 'cookie-value', created: false, session: { id: sessionId, userId, createdAt: fixedNow, expiresAt: new Date(fixedNow.getTime() + 3_600_000) } };
  } };
  const profiles = { getCurrentUser: async () => ({
    id: userId, email: null, status: 'active', role: 'player', createdAt: fixedNow.toISOString(),
    profile: { handle: 'oidc_player', displayName: 'OIDC Player', avatarUrl: null, profileVisibility: 'public' },
  }) };
  const controller = new AuthController(
    profiles as ConstructorParameters<typeof AuthController>[0],
    {} as ConstructorParameters<typeof AuthController>[1],
    {} as ConstructorParameters<typeof AuthController>[2],
    {} as ConstructorParameters<typeof AuthController>[3],
    {} as ConstructorParameters<typeof AuthController>[4],
    externalSessions as ConstructorParameters<typeof AuthController>[5],
  );
  const headers = new Map<string, string | string[]>();
  const response = { setHeader: (name: string, value: string | string[]) => { headers.set(name, value); } };
  const presentedSessionToken = generateSessionToken();
  const request = { ip: '203.0.113.20', headers: { 'x-request-id': 'oidc-request', cookie: `wr_session=${presentedSessionToken}` } };

  for (const authorization of [undefined, 'bearer value', 'Bearer', 'Bearer value extra', ['Bearer value']]) {
    await assert.rejects(controller.externalSession(authorization, {}, request, response), (error: any) => error.getStatus() === 401);
  }
  for (const body of [[], 'body', { unexpected: true }, { handle: 'bad-handle' }, { displayName: '' }]) {
    await assert.rejects(controller.externalSession('Bearer valid-value', body, request, response), (error: any) => error.getStatus() === 400);
  }
  assert.equal(calls.length, 0);

  const result = await controller.externalSession('Bearer valid-value', { handle: ' OIDC_Player ', displayName: ' OIDC Player ' }, request, response);
  assert.deepEqual(calls, [{ token: 'valid-value', clientIp: '203.0.113.20', presentedSessionToken, handle: 'oidc_player', displayName: 'OIDC Player' }]);
  assert.equal(result.requestId, 'oidc-request');
  assert.equal(result.data.session.provider, 'oidc');
  assert.equal(result.data.session.id, sessionId);
  assert.match(String(headers.get('Set-Cookie')), /^wr_session=cookie-value; Path=\/; HttpOnly; SameSite=Lax;/u);
  assert.equal(JSON.stringify(result).includes('cookie-value'), false);

  for (const [error, status] of [[new ExternalTokenInvalidError(), 401], [new ExternalIdentityConflictError(), 409], [new AuthRateLimitedError(), 429], [new ExternalAuthUnavailableError(), 503]] as const) {
    failure = error;
    await assert.rejects(controller.externalSession('Bearer valid-value', {}, request, response), (caught: any) => caught.getStatus() === status);
  }
});

test('Prisma external identity schema, lock, migration, and local URL fallbacks are exact', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /url\s+= env\("DATABASE_URL"\)/u);
  assert.match(schema, /directUrl\s+= env\("DATABASE_DIRECT_URL"\)/u);
  assert.match(schema, /model ExternalIdentity \{[\s\S]*issuer\s+String\s+@db\.VarChar\(2048\)[\s\S]*subject\s+String\s+@db\.VarChar\(255\)[\s\S]*userId\s+String[\s\S]*@@unique\(\[issuer, subject\]\)[\s\S]*@@index\(\[userId\]\)/u);
  assert.match(schema, /user UserAccount @relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/u);
  assert.match(schema, /externalIdentities\s+ExternalIdentity\[\]/u);

  assert.equal(await readFile(new URL('../prisma/migrations/migration_lock.toml', import.meta.url), 'utf8'), 'provider = "postgresql"');
  const migration = await readFile(new URL('../prisma/migrations/20260811000000_external_identity_readiness/migration.sql', import.meta.url), 'utf8');
  const expected = `-- Provider-neutral OIDC identities belong to Wordle accounts. They deliberately
-- have no dependency on a provider-owned auth schema and never link by email.
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "issuer" VARCHAR(2048) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalIdentity_issuer_subject_key" ON "ExternalIdentity"("issuer", "subject");
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;`;
  assert.equal(migration, expected);
  const initialMigration = await readFile(new URL('../prisma/migrations/20260623000000_initial_schema/migration.sql', import.meta.url), 'utf8');
  assert.match(initialMigration, /CREATE TABLE "UserAccount" \(\n    "id" TEXT NOT NULL,/u);
  assert.match(migration, /"userId" TEXT NOT NULL,/u);

  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
  for (const name of ['db:validate', 'db:generate', 'db:migrate:dev', 'db:migrate:deploy']) {
    assert.match(packageJson.scripts[name]!, /DATABASE_URL=/u);
    assert.match(packageJson.scripts[name]!, /DATABASE_DIRECT_URL=/u);
  }
});
