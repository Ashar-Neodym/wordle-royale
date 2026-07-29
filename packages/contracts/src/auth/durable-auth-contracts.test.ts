import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authSessionResponseSchema, authTokenResponseSchema, devStubRegisterRequestSchema, loginRequestSchema, logoutRequestSchema, registerRequestSchema } from './schemas.ts';

const id = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-07-28T00:00:00.000Z';

test('durable auth requests are strict and registration requires a client-selected handle', () => {
  assert.equal(registerRequestSchema.safeParse({ email: 'a@example.com', password: 'correct horse battery', handle: 'player_1', displayName: 'Player' }).success, true);
  assert.equal(registerRequestSchema.safeParse({ email: 'a@example.com', password: 'correct horse battery', displayName: 'Player' }).success, false);
  assert.equal(loginRequestSchema.safeParse({ email: 'a@example.com', password: 'correct horse battery', userId: id }).success, false);
  assert.equal(logoutRequestSchema.safeParse({ token: 'forbidden' }).success, false);
});

test('legacy dev-stub request and token response remain isolated from durable contracts', () => {
  assert.equal(devStubRegisterRequestSchema.safeParse({ email: 'a@example.com', password: 'password123', displayName: 'Player' }).success, true);
  const legacy = authTokenResponseSchema.parse({
    user: { id, email: 'a@example.com', status: 'active', role: 'player', createdAt: timestamp },
    accessToken: 'stub-access-token-not-for-production',
    refreshToken: 'stub-refresh-token-not-for-production',
  });
  assert.deepEqual(Object.keys(legacy).sort(), ['accessToken', 'refreshToken', 'user']);
  assert.equal(authSessionResponseSchema.safeParse(legacy).success, false);
});

test('durable auth response contains user and session metadata but no token transport', () => {
  const response = authSessionResponseSchema.parse({
    user: { id, email: 'a@example.com', status: 'active', role: 'player', createdAt: timestamp, profile: null },
    session: { id, provider: 'password', createdAt: timestamp, expiresAt: timestamp },
  });
  assert.deepEqual(Object.keys(response).sort(), ['session', 'user']);
  assert.deepEqual(Object.keys(response.session).sort(), ['createdAt', 'expiresAt', 'id', 'provider']);
  assert.equal(authSessionResponseSchema.safeParse({ ...response, token: 'forbidden' }).success, false);
  assert.equal(authSessionResponseSchema.safeParse({ ...response, accessToken: 'forbidden' }).success, false);
});
