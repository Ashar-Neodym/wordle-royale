import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';
import { ApiExceptionFilter } from '../src/shared/api-exception.filter.ts';
import { digestSessionToken } from '../src/auth/session-token.ts';

const origin = process.env.PUBLIC_WEB_URL!;
const db = new PrismaClient();
let app: INestApplication;
const secret = `${randomBytes(14).toString('base64url')}!Aa9`;
const email = `http-${randomUUID()}@example.com`;
const registerBody = { email, password: secret, handle: `h_${randomUUID().replaceAll('-', '').slice(0, 12)}`, displayName: 'HTTP User' };
let cookie = '';
let userId = '';

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const instance = moduleRef.createNestApplication();
  instance.useGlobalFilters(new ApiExceptionFilter());
  await instance.init();
  return instance;
}

before(async () => { app = await createApp(); });
after(async () => { await app.close(); await db.$disconnect(); });

function jsonPost(path: string) { return request(app.getHttpServer()).post(path).set('Origin', origin).set('Content-Type', 'application/json'); }

test('register is cookie-only with fixed local attributes and strict response contract', async () => {
  const response = await jsonPost('/auth/register').send(registerBody).expect(201);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.data.user.email, email);
  userId = response.body.data.user.id;
  assert.equal(response.body.data.session.provider, 'password');
  assert.deepEqual(Object.keys(response.body.data.session).sort(), ['createdAt', 'expiresAt', 'id', 'provider']);
  assert.doesNotMatch(JSON.stringify(response.body), /accessToken|refreshToken|tokenHash|wr1\./u);
  const cookies = response.headers['set-cookie']; assert.ok(Array.isArray(cookies));
  assert.match(cookies[0]!, /^wr_session=wr1\.[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=3600; Expires=/u);
  assert.doesNotMatch(cookies[0]!, /Domain=|; Secure/u);
  cookie = cookies[0]!.split(';')[0]!;
  const row = await db.accountSession.findUniqueOrThrow({ where: { id: response.body.data.session.id } });
  assert.equal(cookie.includes(row.tokenHash), false);
  assert.match(row.tokenHash, /^[a-f0-9]{64}$/u);
});

test('me resolves PostgreSQL session, ignores forged dev identity, and survives app restart', async () => {
  const first = await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie).set('x-wordle-dev-user-id', '11111111-1111-4111-8111-111111111111').expect(200);
  assert.equal(first.body.data.id, userId);
  await app.close(); app = await createApp();
  const restarted = await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(200);
  assert.equal(restarted.body.data.id, userId);
});

test('all unsafe durable requests reject unapproved origin and non-JSON before writes', async () => {
  const beforeCount = await db.userAccount.count();
  for (const invalidOrigin of [undefined, 'null', 'http://web.example.test', 'https://web.example.test.evil', 'https://web.example.test:444']) {
    let call = request(app.getHttpServer()).post('/auth/register').set('Content-Type', 'application/json');
    if (invalidOrigin) call = call.set('Origin', invalidOrigin);
    const response = await call.send({ ...registerBody, email: `${randomUUID()}@example.com` }).expect(403);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(response.body.error, { code: 'unsafe_request_origin', message: 'Request origin is not allowed.', details: {} });
  }
  await request(app.getHttpServer()).post('/auth/login').set('Origin', origin).set('Content-Type', 'text/plain').send('{}').expect(403);
  assert.equal(await db.userAccount.count(), beforeCount);
});

test('login is generic, creates independent devices, and relogin revokes only presented session', async () => {
  const wrong = await jsonPost('/auth/login').send({ email, password: `${secret}x` }).expect(401);
  const unknown = await jsonPost('/auth/login').send({ email: `missing-${randomUUID()}@example.com`, password: secret }).expect(401);
  assert.deepEqual(wrong.body.error, unknown.body.error);
  const device = await jsonPost('/auth/login').send({ email, password: secret }).expect(200);
  const deviceCookie = device.headers['set-cookie']![0]!.split(';')[0]!;
  assert.notEqual(deviceCookie, cookie);
  assert.equal((await db.accountSession.findMany({ where: { userId, revokedAt: null } })).length, 2);
  const relogin = await jsonPost('/auth/login').set('Cookie', cookie).send({ email, password: secret }).expect(200);
  const oldToken = cookie.slice(cookie.indexOf('=') + 1);
  assert.equal((await db.accountSession.findUniqueOrThrow({ where: { tokenHash: digestSessionToken(oldToken) } })).revocationReason, 'relogin');
  await request(app.getHttpServer()).get('/auth/me').set('Cookie', deviceCookie).expect(200);
  cookie = relogin.headers['set-cookie']![0]!.split(';')[0]!;
});

test('logout is exact, idempotent, clears exact scope, and replay fails', async () => {
  await request(app.getHttpServer()).get('/auth/me').set('Cookie', `${cookie}; wr_session=wr1.${randomBytes(32).toString('base64url')}`).expect(401);
  const invalid = await jsonPost('/auth/logout').set('Cookie', cookie).send({ token: 'forbidden' }).expect(400);
  assert.equal(invalid.headers['cache-control'], 'no-store');
  const response = await jsonPost('/auth/logout').set('Cookie', cookie).send({}).expect(204);
  assert.equal(response.headers['cache-control'], 'no-store');
  const clear = response.headers['set-cookie']; assert.ok(Array.isArray(clear));
  assert.match(clear[0]!, /^wr_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT$/u);
  await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(401);
  await jsonPost('/auth/logout').set('Cookie', cookie).send({}).expect(204);
  await jsonPost('/auth/logout').send({}).expect(204);
});

test('disabled and expired sessions fail with one not-authenticated shape', async () => {
  const login = await jsonPost('/auth/login').send({ email, password: secret }).expect(200);
  const activeCookie = login.headers['set-cookie']![0]!.split(';')[0]!;
  const disabled = await db.userAccount.update({ where: { id: userId }, data: { status: 'disabled' } });
  assert.equal(disabled.status, 'disabled');
  const disabledResponse = await request(app.getHttpServer()).get('/auth/me').set('Cookie', activeCookie).expect(401);
  await db.userAccount.update({ where: { id: userId }, data: { status: 'active' } });
  const token = activeCookie.slice(activeCookie.indexOf('=') + 1);
  await db.accountSession.update({ where: { tokenHash: digestSessionToken(token) }, data: { expiresAt: new Date(0) } });
  const expiredResponse = await request(app.getHttpServer()).get('/auth/me').set('Cookie', activeCookie).expect(401);
  assert.deepEqual(disabledResponse.body.error, expiredResponse.body.error);
});
