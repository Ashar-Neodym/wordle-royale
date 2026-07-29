import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Controller, Get, Module, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import test from 'node:test';
import request from 'supertest';
import { decodeAuthRegistrationCanaryDigest, validateRuntimeConfig } from '../src/config/runtime-config.ts';
import { DurableAuthPersistenceService, RegistrationUnavailableError, registrationAllowed } from '../src/auth/durable-auth-persistence.service.ts';
import { DurableUnsafeRequestMiddleware } from '../src/auth/durable-unsafe-request.middleware.ts';
import { configureTrustedProxy } from '../src/main.ts';
import { parseAuthSessionOperatorArgs } from '../scripts/auth-session-operator.ts';

const key = Buffer.alloc(32, 7);
const encodedKey = key.toString('base64url');
const production = {
  NODE_ENV: 'production', APP_ENV: 'production', AUTH_MODE: 'session_required', DURABLE_AUTH_ENABLED: 'true',
  AUTH_RATE_LIMIT_KEY: encodedKey, PUBLIC_WEB_URL: 'https://web.example.test', CORS_ALLOWED_ORIGINS: 'https://web.example.test',
  DATABASE_URL: new URL('postgresql://db.invalid/wordle').toString(), ENABLE_DEV_AUTH: 'false', ENABLE_DEV_ROUTES: 'false', COOKIE_SECURE: 'true',
  TRUSTED_PROXY_HOPS: '1', EXPECTED_API_REPLICA_COUNT: '1',
};

test('durable registration defaults closed and production activation locks proxy hops and one replica', () => {
  assert.equal(validateRuntimeConfig(production).AUTH_REGISTRATION_MODE, 'closed');
  for (const patch of [
    { AUTH_REGISTRATION_MODE: 'other' }, { TRUSTED_PROXY_HOPS: '' }, { TRUSTED_PROXY_HOPS: '33' },
    { EXPECTED_API_REPLICA_COUNT: '2' }, { EXPECTED_API_REPLICA_COUNT: '' },
  ]) assert.throws(() => validateRuntimeConfig({ ...production, ...patch }), /Invalid API runtime configuration/u);
});

test('canary digest is one canonical 32-byte base64url HMAC over canonical email', () => {
  const canonical = 'canary@example.test';
  const digest = createHmac('sha256', key).update(canonical).digest();
  const encoded = digest.toString('base64url');
  assert.deepEqual(decodeAuthRegistrationCanaryDigest(encoded), digest);
  assert.equal(registrationAllowed('  CANARY@EXAMPLE.TEST  ', 'canary', key, digest), true);
  assert.equal(registrationAllowed('other@example.test', 'canary', key, digest), false);
  assert.equal(registrationAllowed(canonical, 'closed', key, digest), false);
  assert.equal(registrationAllowed(canonical, 'open', key), true);
  assert.throws(() => validateRuntimeConfig({ ...production, AUTH_REGISTRATION_MODE: 'canary' }), /CANARY_DIGEST/u);
  assert.equal(validateRuntimeConfig({ ...production, AUTH_REGISTRATION_MODE: 'canary', AUTH_REGISTRATION_CANARY_DIGEST: encoded }).AUTH_REGISTRATION_MODE, 'canary');
  for (const malformed of [`${encoded}=`, Buffer.alloc(31).toString('base64url'), Buffer.alloc(33).toString('base64url')]) {
    assert.throws(() => decodeAuthRegistrationCanaryDigest(malformed), /canonical/u);
  }
});

test('closed and nonmatching canary reject before limiter/database/password work', async () => {
  const db = new Proxy({}, { get: () => { throw new Error('database touched'); } });
  const valid = { email: 'other@example.test', handle: 'player253', displayName: 'Player 253', password: 'valid-password-253!' };
  for (const options of [
    { registrationMode: 'closed' as const },
    { registrationMode: 'canary' as const, registrationCanaryDigest: createHmac('sha256', key).update('canary@example.test').digest() },
  ]) {
    const service = new DurableAuthPersistenceService(db as never, { enabled: true, rateLimitKey: key, ...options });
    await assert.rejects(service.register(valid, '192.0.2.1'), RegistrationUnavailableError);
  }
});

test('durable mutation middleware rejects duplicate, legacy-coexisting, and preview-coexisting credentials before next', () => {
  const before = { ...process.env };
  Object.assign(process.env, { AUTH_MODE: 'session_required', DURABLE_AUTH_ENABLED: 'true', PUBLIC_WEB_URL: 'https://web.example.test' });
  try {
    const middleware = new DurableUnsafeRequestMiddleware();
    const host = '__Host-wr_session=opaque';
    for (const cookie of [`${host}; ${host}`, `${host}; wr_session=legacy`, `${host}; wr_preview_demo_session=preview`]) {
      let next = false;
      assert.throws(() => middleware.use(
        { method: 'POST', originalUrl: '/auth/login', headers: { origin: 'https://web.example.test', 'content-type': 'application/json', cookie } },
        { setHeader() {} },
        () => { next = true; },
      ), /Authentication cookie is not allowed/u);
      assert.equal(next, false);
    }
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in before)) delete process.env[name];
    Object.assign(process.env, before);
  }
});

@Controller()
class IpController { @Get('ip') ip(@Req() req: { ip: string }) { return { ip: req.ip }; } }
@Module({ controllers: [IpController] })
class IpModule {}

test('actual Express trust boundary ignores spoofed XFF values outside one configured hop', async () => {
  const before = { ...process.env };
  const app = await NestFactory.create(IpModule, new ExpressAdapter(), { logger: false });
  try {
    Object.assign(process.env, { APP_ENV: 'production', DURABLE_AUTH_ENABLED: 'true', TRUSTED_PROXY_HOPS: '1' });
    configureTrustedProxy(app);
    await app.init();
    const first = await request(app.getHttpServer()).get('/ip').set('X-Forwarded-For', '203.0.113.10, 198.51.100.8').expect(200);
    const second = await request(app.getHttpServer()).get('/ip').set('X-Forwarded-For', '203.0.113.99, 198.51.100.8').expect(200);
    assert.equal(first.body.ip, '198.51.100.8');
    assert.equal(second.body.ip, first.body.ip);
  } finally {
    await app.close();
    for (const name of Object.keys(process.env)) if (!(name in before)) delete process.env[name];
    Object.assign(process.env, before);
  }
});

test('session operator parser is dry-run by default and rejects unknown/unbounded/weakly-gated apply', () => {
  const revision = 'a'.repeat(40);
  const dry = parseAuthSessionOperatorArgs(['cleanup', '--expected-revision', revision, '--max-sessions', '25', '--retention-days', '30']);
  assert.equal(dry.apply, false);
  assert.equal(dry.maxSessions, 25);
  assert.throws(() => parseAuthSessionOperatorArgs(['revoke-all', '--expected-revision', revision, '--max-sessions', '0']), /bound_invalid/u);
  assert.throws(() => parseAuthSessionOperatorArgs(['revoke-all', '--expected-revision', revision, '--max-sessions', '1', '--apply']), /reason_invalid/u);
  assert.throws(() => parseAuthSessionOperatorArgs(['revoke-all', '--expected-revision', revision, '--max-sessions', '1', '--bogus']), /argument_invalid/u);
  assert.equal(parseAuthSessionOperatorArgs(['revoke-all', '--expected-revision', revision, '--max-sessions', '10', '--apply', '--reason', 'approved containment']).apply, true);
});
