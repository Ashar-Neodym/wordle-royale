import 'reflect-metadata';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ReadinessDependency } from '@wordle-royale/contracts';
import { AppModule } from '../src/app.module.ts';
import { RedisReadinessService } from '../src/health/redis-readiness.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { ApiExceptionFilter } from '../src/shared/api-exception.filter.ts';

const hostUserId = '11111111-1111-4111-8111-111111111111';
const guestUserId = '22222222-2222-4222-8222-222222222222';

type UserRecord = {
  id: string;
  email: string | null;
  displayName: string;
  status: string;
  createdAt: Date;
  profile?: ProfileRecord | null;
};

type ProfileRecord = {
  id: string;
  userId: string;
  publicHandle: string;
  avatarUrl: string | null;
};

type LobbyRecord = {
  id: string;
  code: string;
  hostUserId: string;
  status: string;
  visibility: string;
  mode: string;
  maxPlayers: number;
  settings: unknown;
  createdAt: Date;
};

function createMockPrismaService(databaseStatus: ReadinessDependency = { status: 'ok', checkedAt: new Date().toISOString(), latencyMs: 1 }) {
  let lobbySequence = 0;
  const users = new Map<string, UserRecord>();
  const profiles = new Map<string, ProfileRecord>();
  const lobbies = new Map<string, LobbyRecord>();

  function withProfile(user: UserRecord): UserRecord {
    return { ...user, profile: profiles.get(user.id) ?? null };
  }

  const client = {
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(client),
    userAccount: {
      upsert: async (args: any) => {
        const id = args.where.id;
        const existing = users.get(id);
        if (existing) {
          const updated = { ...existing, ...(args.update ?? {}) };
          users.set(id, updated);
          return args.include?.profile ? withProfile(updated) : updated;
        }
        const created: UserRecord = {
          id,
          email: args.create.email ?? null,
          displayName: args.create.displayName,
          status: args.create.status ?? 'active',
          createdAt: new Date('2026-06-24T00:00:00.000Z'),
        };
        users.set(id, created);
        if (args.create.profile?.create) {
          profiles.set(id, { id: `${id}-profile`, userId: id, ...args.create.profile.create });
        }
        return args.include?.profile ? withProfile(created) : created;
      },
      findUnique: async (args: any) => {
        const found = users.get(args.where.id) ?? null;
        return found && args.include?.profile ? withProfile(found) : found;
      },
    },
    userProfile: {
      upsert: async (args: any) => {
        const userId = args.where.userId;
        const existing = profiles.get(userId);
        if (existing) {
          const updated = { ...existing, ...(args.update ?? {}) };
          profiles.set(userId, updated);
          return updated;
        }
        const created = { id: `${userId}-profile`, ...args.create };
        profiles.set(userId, created);
        return created;
      },
      findUnique: async (args: any) => profiles.get(args.where.userId) ?? null,
      count: async (args: any) => [...profiles.values()].filter((profile) => profile.publicHandle === args.where.publicHandle).length,
    },
    lobby: {
      create: async (args: any) => {
        lobbySequence += 1;
        const id = `33333333-3333-4333-8333-${String(lobbySequence).padStart(12, '0')}`;
        const row: LobbyRecord = { id, createdAt: new Date('2026-06-24T00:00:00.000Z'), ...args.data };
        lobbies.set(id, row);
        return row;
      },
      findMany: async (args: any) => [...lobbies.values()]
        .filter((lobby) => !args.where?.visibility || lobby.visibility === args.where.visibility)
        .filter((lobby) => !args.where?.mode || lobby.mode === args.where.mode)
        .filter((lobby) => {
          const status = args.where?.status;
          if (!status) return true;
          if (Array.isArray(status.in)) return status.in.includes(lobby.status);
          return lobby.status === status;
        })
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, args.take ?? 20),
      findUnique: async (args: any) => {
        if (args.where.id) return lobbies.get(args.where.id) ?? null;
        if (args.where.code) return [...lobbies.values()].find((lobby) => lobby.code === args.where.code) ?? null;
        return null;
      },
      update: async (args: any) => {
        const existing = lobbies.get(args.where.id);
        if (!existing) throw new Error('Mock lobby not found');
        const updated = { ...existing, ...args.data };
        lobbies.set(existing.id, updated);
        return updated;
      },
    },
  };

  return {
    client,
    checkDatabase: async () => databaseStatus,
    onModuleDestroy: async () => {},
  };
}

async function createApp(options: { database?: ReadinessDependency; redis?: ReadinessDependency } = {}) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(createMockPrismaService(options.database))
    .overrideProvider(RedisReadinessService)
    .useValue({ checkRedis: async () => options.redis ?? { status: 'ok', checkedAt: new Date().toISOString(), latencyMs: 1 } })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return app;
}

describe('api skeleton', () => {
  let app: INestApplication;

  before(async () => {
    app = await createApp();
  });

  after(async () => {
    await app.close();
  });

  it('serves health and healthy readiness envelopes with dependency checks', async () => {
    const health = await request(app.getHttpServer()).get('/healthz').expect(200);
    assert.equal(health.body.error, null);
    assert.equal(health.body.data.status, 'ok');
    assert.equal(health.body.data.service, 'wordle-royale-api');
    assert.equal(typeof health.body.requestId, 'string');

    const ready = await request(app.getHttpServer()).get('/readyz').expect(200);
    assert.equal(ready.body.error, null);
    assert.equal(ready.body.data.status, 'ok');
    assert.equal(ready.body.data.dependencies.database.status, 'ok');
    assert.equal(ready.body.data.dependencies.redis.status, 'ok');
  });

  it('serves unhealthy readiness when a dependency check fails', async () => {
    const unhealthy = await createApp({ database: { status: 'unavailable', checkedAt: new Date().toISOString(), latencyMs: 1, message: 'db down' } });
    try {
      const ready = await request(unhealthy.getHttpServer()).get('/readyz').expect(200);
      assert.equal(ready.body.error, null);
      assert.equal(ready.body.data.status, 'unavailable');
      assert.equal(ready.body.data.dependencies.database.status, 'unavailable');
      assert.equal(ready.body.data.dependencies.database.message, 'db down');
    } finally {
      await unhealthy.close();
    }
  });

  it('uses Prisma-backed profile service behavior while auth remains stubbed', async () => {
    const me = await request(app.getHttpServer()).get('/auth/me').expect(200);
    assert.equal(me.body.error, null);
    assert.equal(me.body.data.id, hostUserId);
    assert.equal(me.body.data.profile.handle, 'player_one');

    const update = await request(app.getHttpServer())
      .patch('/profile/me')
      .send({ handle: 'freya_backend', displayName: 'Freya Backend' })
      .expect(200);
    assert.equal(update.body.error, null);
    assert.equal(update.body.data.handle, 'freya_backend');
    assert.equal(update.body.data.displayName, 'Freya Backend');

    const availability = await request(app.getHttpServer()).get('/profile/handles/freya_backend/availability').expect(200);
    assert.equal(availability.body.error, null);
    assert.equal(availability.body.data.available, false);
  });

  it('requires an authenticated session for current-user auth/profile endpoints in preview mode', async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    const priorAppEnv = process.env.APP_ENV;
    const priorAuthMode = process.env.AUTH_MODE;
    const priorEnableDevAuth = process.env.ENABLE_DEV_AUTH;
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'preview';
    process.env.AUTH_MODE = 'session_required';
    process.env.ENABLE_DEV_AUTH = 'false';
    try {
      const me = await request(app.getHttpServer()).get('/auth/me').expect(401);
      assert.equal(me.body.data, null);
      assert.equal(me.body.error.code, 'not_authenticated');
      assert.equal(me.body.error.details.authMode, 'session_required');

      const register = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'preview@example.com', password: 'password123', displayName: 'Preview Player' })
        .expect(401);
      assert.equal(register.body.error.code, 'not_authenticated');
      assert.doesNotMatch(JSON.stringify(register.body), /stub-access-token-not-for-production|stub-refresh-token-not-for-production/i);

      const profile = await request(app.getHttpServer()).get('/profile/me').set('x-wordle-dev-user-id', guestUserId).expect(401);
      assert.equal(profile.body.error.code, 'not_authenticated');

      const update = await request(app.getHttpServer())
        .patch('/profile/me')
        .set('x-wordle-dev-user-id', guestUserId)
        .send({ handle: 'preview_blocked' })
        .expect(401);
      assert.equal(update.body.error.code, 'not_authenticated');

      const lobby = await request(app.getHttpServer())
        .post('/lobbies')
        .set('x-wordle-dev-user-id', guestUserId)
        .send({
          clientRequestId: '77777777-7777-4777-8777-777777777777',
          visibility: 'public',
          rated: false,
          mode: 'standard',
          language: 'en',
          wordLength: 5,
          difficulty: 'medium',
          minPlayers: 2,
          maxPlayers: 4,
          roundsCount: 3,
          roundTimeSeconds: 120,
          scoringPreset: 'standard_v1',
        })
        .expect(401);
      assert.equal(lobby.body.error.code, 'not_authenticated');
    } finally {
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorNodeEnv;
      if (priorAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = priorAppEnv;
      if (priorAuthMode === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = priorAuthMode;
      if (priorEnableDevAuth === undefined) delete process.env.ENABLE_DEV_AUTH; else process.env.ENABLE_DEV_AUTH = priorEnableDevAuth;
    }
  });

  it('starts an explicit preview demo session and uses it for current-user writes without dev fallback', async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    const priorAppEnv = process.env.APP_ENV;
    const priorAuthMode = process.env.AUTH_MODE;
    const priorEnableDevAuth = process.env.ENABLE_DEV_AUTH;
    const priorEnableDevRoutes = process.env.ENABLE_DEV_ROUTES;
    const priorCookieSecure = process.env.COOKIE_SECURE;
    const priorTtl = process.env.PREVIEW_DEMO_SESSION_TTL_SECONDS;
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'preview';
    process.env.AUTH_MODE = 'preview_demo_session';
    process.env.ENABLE_DEV_AUTH = 'false';
    process.env.ENABLE_DEV_ROUTES = 'false';
    process.env.COOKIE_SECURE = 'false';
    delete process.env.PREVIEW_DEMO_SESSION_TTL_SECONDS;
    try {
      const unauthenticated = await request(app.getHttpServer())
        .get('/auth/me')
        .set('x-wordle-dev-user-id', guestUserId)
        .expect(401);
      assert.equal(unauthenticated.body.error.code, 'not_authenticated');
      assert.equal(unauthenticated.body.error.details.authMode, 'preview_demo_session');

      const blockedRegister = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'preview@example.com', password: 'password123', displayName: 'Preview Player' })
        .expect(401);
      assert.equal(blockedRegister.body.error.code, 'not_authenticated');
      assert.doesNotMatch(JSON.stringify(blockedRegister.body), /stub-access-token-not-for-production|stub-refresh-token-not-for-production/i);

      const started = await request(app.getHttpServer()).post('/auth/preview-demo/start').expect(201);
      assert.equal(started.body.error, null);
      assert.equal(started.body.data.mode, 'preview_demo_session');
      assert.match(started.body.data.user.profile.handle, /^demo_[a-f0-9]{8}$/);
      assert.equal(started.body.data.user.email, null);
      assert.equal(started.body.data.session.cookieName, 'wr_preview_demo_session');
      assert.doesNotMatch(JSON.stringify(started.body), /stub-access-token-not-for-production|stub-refresh-token-not-for-production|wr_preview_demo_session=/i);

      const cookies = started.headers['set-cookie'];
      assert.ok(Array.isArray(cookies));
      assert.match(cookies[0], /wr_preview_demo_session=/);
      assert.match(cookies[0], /HttpOnly/);
      assert.match(cookies[0], /SameSite=Lax/);
      const cookie = cookies[0].split(';')[0];

      const me = await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(200);
      assert.equal(me.body.data.id, started.body.data.user.id);
      assert.equal(me.body.data.email, null);
      assert.equal(me.body.data.profile.handle, started.body.data.user.profile.handle);

      const lobby = await request(app.getHttpServer())
        .post('/lobbies')
        .set('Cookie', cookie)
        .set('x-wordle-dev-user-id', guestUserId)
        .send({
          clientRequestId: '12121212-1212-4212-8212-121212121212',
          visibility: 'public',
          rated: false,
          mode: 'standard',
          language: 'en',
          wordLength: 5,
          difficulty: 'medium',
          minPlayers: 2,
          maxPlayers: 4,
          roundsCount: 3,
          roundTimeSeconds: 120,
          scoringPreset: 'standard_v1',
        })
        .expect(201);
      assert.equal(lobby.body.data.hostUserId, started.body.data.user.id);
      assert.notEqual(lobby.body.data.hostUserId, hostUserId);
      assert.notEqual(lobby.body.data.hostUserId, guestUserId);
      assert.equal(lobby.body.data.members[0].handle, started.body.data.user.profile.handle);

      const invalid = await request(app.getHttpServer()).get('/auth/me').set('Cookie', 'wr_preview_demo_session=invalid').expect(401);
      assert.equal(invalid.body.error.code, 'not_authenticated');

      process.env.PREVIEW_DEMO_SESSION_TTL_SECONDS = '-1';
      const expiredStart = await request(app.getHttpServer()).post('/auth/preview-demo/start').expect(201);
      const expiredCookies = expiredStart.headers['set-cookie'];
      if (!Array.isArray(expiredCookies)) assert.fail('Expected preview demo start to set a session cookie.');
      const expiredCookie = expiredCookies[0]!.split(';')[0]!;
      const expired = await request(app.getHttpServer()).get('/auth/me').set('Cookie', expiredCookie).expect(401);
      assert.equal(expired.body.error.code, 'not_authenticated');
    } finally {
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorNodeEnv;
      if (priorAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = priorAppEnv;
      if (priorAuthMode === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = priorAuthMode;
      if (priorEnableDevAuth === undefined) delete process.env.ENABLE_DEV_AUTH; else process.env.ENABLE_DEV_AUTH = priorEnableDevAuth;
      if (priorEnableDevRoutes === undefined) delete process.env.ENABLE_DEV_ROUTES; else process.env.ENABLE_DEV_ROUTES = priorEnableDevRoutes;
      if (priorCookieSecure === undefined) delete process.env.COOKIE_SECURE; else process.env.COOKIE_SECURE = priorCookieSecure;
      if (priorTtl === undefined) delete process.env.PREVIEW_DEMO_SESSION_TTL_SECONDS; else process.env.PREVIEW_DEMO_SESSION_TTL_SECONDS = priorTtl;
    }
  });

  it('rejects malformed lobby creation with the shared error envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/lobbies')
      .send({
        clientRequestId: 'not-a-uuid',
        visibility: 'private',
        rated: true,
        minPlayers: 5,
        maxPlayers: 2,
        roundsCount: 0,
        roundTimeSeconds: 90,
      })
      .expect(400);

    assert.equal(response.body.data, null);
    assert.equal(response.body.error.code, 'validation_failed');
    assert.equal(response.body.error.message, 'Request validation failed.');
    assert.ok(Array.isArray(response.body.error.details.issues));
    assert.ok(response.body.error.details.issues.length >= 1);
    assert.equal(typeof response.body.requestId, 'string');
  });

  it('creates, lists, and joins lobbies through the Prisma-backed lobby service', async () => {
    const create = await request(app.getHttpServer())
      .post('/lobbies')
      .send({
        clientRequestId: '44444444-4444-4444-8444-444444444444',
        visibility: 'public',
        rated: false,
        mode: 'standard',
        language: 'en',
        wordLength: 5,
        difficulty: 'medium',
        minPlayers: 2,
        maxPlayers: 4,
        roundsCount: 3,
        roundTimeSeconds: 120,
        scoringPreset: 'standard_v1',
      })
      .expect(201);

    assert.equal(create.body.error, null);
    assert.equal(create.body.data.settings.visibility, 'public');
    assert.match(create.body.data.code, /^[A-Z0-9]{4,12}$/);

    const list = await request(app.getHttpServer()).get('/lobbies').expect(200);
    assert.equal(list.body.error, null);
    assert.ok(Array.isArray(list.body.data.items));
    assert.equal(list.body.data.pagination.nextCursor, null);
    assert.ok(list.body.data.items.some((lobby: any) => lobby.id === create.body.data.id));

    const join = await request(app.getHttpServer())
      .post(`/lobbies/${create.body.data.id}/join`)
      .send({ clientRequestId: '55555555-5555-4555-8555-555555555555' })
      .expect(201);

    assert.equal(join.body.error, null);
    assert.equal(join.body.data.members.length, 2);
    assert.equal(join.body.data.members[1].userId, guestUserId);

    const joinByCode = await request(app.getHttpServer())
      .post('/lobbies/join-code')
      .send({ clientRequestId: '66666666-6666-4666-8666-666666666666', code: create.body.data.code })
      .expect(201);
    assert.equal(joinByCode.body.data.members.length, 2);
  });

  it('discovers ranked lobbies with filters, join affordance, and start readiness blockers', async () => {
    const ranked = await request(app.getHttpServer())
      .post('/lobbies')
      .send({
        clientRequestId: '77777777-7777-4777-8777-777777777777',
        visibility: 'public',
        rated: true,
        mode: 'standard',
        language: 'en',
        wordLength: 5,
        difficulty: 'medium',
        minPlayers: 2,
        maxPlayers: 2,
        roundsCount: 3,
        roundTimeSeconds: 120,
        scoringPreset: 'standard_v1',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/lobbies')
      .send({
        clientRequestId: '88888888-8888-4888-8888-888888888888',
        visibility: 'public',
        rated: false,
        mode: 'standard',
        language: 'en',
        wordLength: 5,
        difficulty: 'medium',
        minPlayers: 2,
        maxPlayers: 4,
        roundsCount: 3,
        roundTimeSeconds: 120,
        scoringPreset: 'standard_v1',
      })
      .expect(201);

    const openRanked = await request(app.getHttpServer())
      .get('/lobbies?status=waiting&mode=ranked&visibility=public&limit=10')
      .expect(200);

    assert.equal(openRanked.body.error, null);
    assert.ok(openRanked.body.data.items.every((lobby: any) => lobby.mode === 'ranked'));
    const discoveryItem = openRanked.body.data.items.find((lobby: any) => lobby.id === ranked.body.data.id);
    assert.ok(discoveryItem);
    assert.equal(discoveryItem.status, 'waiting');
    assert.equal(discoveryItem.visibility, 'public');
    assert.equal(discoveryItem.playerCount, 1);
    assert.equal(discoveryItem.maxPlayers, 2);
    assert.equal(discoveryItem.canJoin, true);
    assert.equal(discoveryItem.canStart, false);
    assert.equal(discoveryItem.blockerReason, 'waiting_for_players');

    const joined = await request(app.getHttpServer())
      .post(`/lobbies/${ranked.body.data.id}/join`)
      .send({ clientRequestId: '99999999-9999-4999-8999-999999999999' })
      .expect(201);

    assert.equal(joined.body.data.playerCount, 2);
    assert.equal(joined.body.data.canJoin, false);
    assert.equal(joined.body.data.canStart, true);
    assert.equal(joined.body.data.blockerReason, null);

    const startReady = await request(app.getHttpServer())
      .get('/lobbies?status=waiting&mode=ranked&visibility=public&limit=10')
      .expect(200);
    const readyItem = startReady.body.data.items.find((lobby: any) => lobby.id === ranked.body.data.id);
    assert.equal(readyItem.playerCount, 2);
    assert.equal(readyItem.canStart, true);
    assert.equal(readyItem.blockerReason, null);
  });
});
