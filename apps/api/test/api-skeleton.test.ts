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
        .filter((lobby) => lobby.visibility === args.where.visibility && args.where.status.in.includes(lobby.status))
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
});
