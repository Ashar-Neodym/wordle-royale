import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { canonicalizeEmail, normalizeDisplayName, normalizeHandle, validatePassword } from '../src/auth/auth-input.js';
import { createDummyPasswordHash, dummyVerifyPassword, hashPassword, parsePasswordHash, verifyPassword } from '../src/auth/password-crypto.js';
import { digestSessionToken, generateSessionToken, parseSessionToken } from '../src/auth/session-token.js';
import { decodeAuthRateLimitKey, validateRuntimeConfig } from '../src/config/runtime-config.js';
import { DurableAuthPersistenceService } from '../src/auth/durable-auth-persistence.service.js';

const generatedPassword = () => `${randomBytes(12).toString('base64url')}!Aa9`;

test('canonical email normalizes NFC, case, ASCII outer whitespace, and IDN domains', () => {
  assert.equal(canonicalizeEmail('  ALICE+tag@Exämple.COM\t'), 'alice+tag@xn--exmple-cua.com');
  assert.equal(canonicalizeEmail('e\u0301@EXAMPLE.com'), 'é@example.com');
});

test('canonical email rejects malformed, bounded, whitespace, controls, and collisions normalize equally', () => {
  assert.equal(canonicalizeEmail(' Alice@Example.COM '), canonicalizeEmail('alice@example.com'));
  for (const bad of ['a b@example.com', 'a@@example.com', '@example.com', 'a@', 'a@.example.com', `a\0@example.com`, `${'é'.repeat(65)}@example.com`]) {
    assert.throws(() => canonicalizeEmail(bad), /invalid email/);
  }
});

test('handle, display name, and password validation lock public bounds', () => {
  assert.equal(normalizeHandle(' Player_1 '), 'player_1');
  for (const value of ['ab', 'admin', 'WR_owner', 'has-dash']) assert.throws(() => normalizeHandle(value));
  assert.equal(normalizeDisplayName('  E\u0301lodie  '), 'Élodie');
  assert.throws(() => normalizeDisplayName('x'.repeat(41)));
  assert.equal(validatePassword('twelve-chars!'), 'twelve-chars!');
  for (const value of ['short', `safe-enough\0`, '😀'.repeat(65)]) assert.throws(() => validatePassword(value));
});

test('scrypt hashes are versioned, salted, bounded, and timing-safe verification succeeds', async () => {
  const password = generatedPassword();
  const [first, second] = await Promise.all([hashPassword(password), hashPassword(password)]);
  assert.notEqual(first, second);
  assert.deepEqual({ salt: parsePasswordHash(first).salt.length, key: parsePasswordHash(first).key.length }, { salt: 32, key: 64 });
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(`${password}x`, first), false);
});

test('malformed or attacker-selected password hash parameters fail closed before KDF', async () => {
  for (const malformed of ['', '$wr$scrypt$v=2$ln=17,r=8,p=1$a$b', '$wr$scrypt$v=1$ln=30,r=8,p=1$a$b', `${'$wr$scrypt$v=1$ln=17,r=8,p=1$'}${'a'.repeat(500)}`]) {
    assert.throws(() => parsePasswordHash(malformed));
    assert.equal(await verifyPassword('anything', malformed), false);
  }
});

test('dummy verification always returns generic false after a real valid verifier path', async () => {
  const dummy = await createDummyPasswordHash();
  assert.equal(await dummyVerifyPassword(generatedPassword(), dummy), false);
  assert.equal(parsePasswordHash(dummy).key.length, 64);
});

test('opaque session tokens have exact entropy, format, parser bounds, uniqueness, and digest', () => {
  const tokens = new Set(Array.from({ length: 64 }, generateSessionToken));
  assert.equal(tokens.size, 64);
  const token = [...tokens][0]!;
  assert.equal(token.length, 47);
  assert.equal(parseSessionToken(token).length, 32);
  assert.equal(digestSessionToken(token), createHash('sha256').update(token).digest('hex'));
  assert.match(digestSessionToken(token), /^[a-f0-9]{64}$/u);
  for (const malformed of ['', token.slice(0, -1), `wr2.${token.slice(4)}`, `${token}x`, 'wr1.'.concat('*'.repeat(43))]) {
    assert.throws(() => parseSessionToken(malformed));
  }
});

test('service and runtime session timing bounds fail closed on strict integers', () => {
  const fakeDb = {} as ConstructorParameters<typeof DurableAuthPersistenceService>[0];
  let cryptoEvents = 0;
  assert.doesNotThrow(() => new DurableAuthPersistenceService(fakeDb, { enabled: false, cryptoObserver: () => cryptoEvents++ }));
  assert.equal(cryptoEvents, 0, 'disabled construction must not start a dummy scrypt');
  for (const options of [
    { sessionTtlMs: 3_599_999 }, { sessionTtlMs: 2_592_000_001 },
    { lastSeenIntervalMs: 299_999 }, { sessionTtlMs: 3_600_000, lastSeenIntervalMs: 3_600_001 },
  ]) assert.throws(() => new DurableAuthPersistenceService(fakeDb, { enabled: false, ...options }));
  assert.doesNotThrow(() => new DurableAuthPersistenceService(fakeDb, { enabled: false, sessionTtlMs: 3_600_000, lastSeenIntervalMs: 300_000 }));

  for (const config of [
    { ACCOUNT_SESSION_TTL_SECONDS: '3600.0' }, { ACCOUNT_SESSION_TTL_SECONDS: '3599' },
    { ACCOUNT_SESSION_TTL_SECONDS: '2592001' }, { ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS: '3e2' },
    { ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS: '299' },
    { ACCOUNT_SESSION_TTL_SECONDS: '3600', ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS: '3601' },
  ]) assert.throws(() => validateRuntimeConfig(config));
  const edge = validateRuntimeConfig({ ACCOUNT_SESSION_TTL_SECONDS: '3600', ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS: '300' });
  assert.equal(edge.ACCOUNT_SESSION_TTL_SECONDS, '3600');
});

test('runtime rate-limit key accepts only canonical base64url encoding of exactly 32 bytes', () => {
  const encoded = randomBytes(32).toString('base64url');
  assert.deepEqual(decodeAuthRateLimitKey(encoded), Buffer.from(encoded, 'base64url'));
  for (const bad of ['', 'a'.repeat(32), 'a'.repeat(42), 'a'.repeat(44), `${encoded}=`, '*'.repeat(43)]) {
    assert.throws(() => decodeAuthRateLimitKey(bad), /AUTH_RATE_LIMIT_KEY/u);
  }
  assert.doesNotThrow(() => validateRuntimeConfig({
    APP_ENV: 'local', AUTH_MODE: 'session_required', DURABLE_AUTH_ENABLED: 'true',
    AUTH_RATE_LIMIT_KEY: encoded, PUBLIC_WEB_URL: 'https://web.example.test',
  }));
});

test('Prisma auth models contain digests/verifiers but no raw secret columns', async () => {
  const schema = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'));
  assert.match(schema, /model PasswordCredential/);
  assert.match(schema, /model AccountSession/);
  assert.doesNotMatch(schema, /^\s*(password|token|rawToken)\s+/gmu);
  assert.match(schema, /passwordHash\s+String\s+@db\.Text/);
  assert.match(schema, /tokenHash\s+String\s+@unique\s+@db\.Char\(64\)/);
});
