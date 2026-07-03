import 'reflect-metadata';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module.ts';
import { RedisReadinessService } from '../src/health/redis-readiness.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { ApiExceptionFilter } from '../src/shared/api-exception.filter.ts';

function createLeaderboardApiPrismaMock() {
  const users = [
    { id: '11111111-1111-4111-8111-111111111111', displayName: 'Ada Letters', profile: { publicHandle: 'ada' } },
    { id: '22222222-2222-4222-8222-222222222222', displayName: 'Zara Solver', profile: { publicHandle: 'zara' } },
    { id: '33333333-3333-4333-8333-333333333333', displayName: 'Unrated Local', profile: { publicHandle: 'unrated' } },
  ];
  const ratingProfiles = [
    { id: 'rating_ada', userId: users[0]!.id, mode: 'ranked', rating: 1516, matchesPlayed: 4, provisionalRemaining: 6, algorithm: 'placement_mmr_v1', algorithmConfigVersion: 'placement_mmr_v1', status: 'active', user: users[0]! },
    { id: 'rating_zara', userId: users[1]!.id, mode: 'ranked', rating: 1484, matchesPlayed: 4, provisionalRemaining: 0, algorithm: 'placement_mmr_v1', algorithmConfigVersion: 'placement_mmr_v1', status: 'active', user: users[1]! },
  ];

  const client = {
    ratingProfile: {
      findMany: async (args: any) => ratingProfiles.filter((profile) => profile.mode === args.where.mode
        && profile.algorithmConfigVersion === args.where.algorithmConfigVersion
        && profile.status === args.where.status),
      findUnique: async (args: any) => ratingProfiles.find((profile) => profile.userId === args.where.userId_mode_algorithmConfigVersion.userId
        && profile.mode === args.where.userId_mode_algorithmConfigVersion.mode
        && profile.algorithmConfigVersion === args.where.userId_mode_algorithmConfigVersion.algorithmConfigVersion) ?? null,
    },
    userProfile: {
      findUnique: async (args: any) => {
        const user = users.find((row) => row.profile.publicHandle === args.where.publicHandle);
        return user ? { ...user.profile, user } : null;
      },
    },
  };

  return {
    client,
    checkDatabase: async () => ({ status: 'ok', checkedAt: new Date().toISOString(), latencyMs: 1 }),
    onModuleDestroy: async () => {},
  };
}

async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(createLeaderboardApiPrismaMock())
    .overrideProvider(RedisReadinessService)
    .useValue({ checkRedis: async () => ({ status: 'ok', checkedAt: new Date().toISOString(), latencyMs: 1 }) })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return app;
}

describe('leaderboard REST read models', () => {
  let app: INestApplication;

  before(async () => {
    app = await createApp();
  });

  after(async () => {
    await app.close();
  });

  it('serves a ranked leaderboard envelope sorted by rating', async () => {
    const response = await request(app.getHttpServer()).get('/leaderboard?limit=2').expect(200);

    assert.equal(response.body.error, null);
    assert.equal(response.body.data.algorithm, 'placement_mmr_v1');
    assert.deepEqual(response.body.data.entries.map((entry: any) => ({ rank: entry.rank, handle: entry.handle, rating: entry.rating })), [
      { rank: 1, handle: 'ada', rating: 1516 },
      { rank: 2, handle: 'zara', rating: 1484 },
    ]);
  });

  it('serves default rated profile data for a known unrated handle', async () => {
    const response = await request(app.getHttpServer()).get('/profiles/unrated/rating').expect(200);

    assert.equal(response.body.error, null);
    assert.equal(response.body.data.handle, 'unrated');
    assert.equal(response.body.data.rating, 1200);
    assert.equal(response.body.data.matchesPlayed, 0);
    assert.equal(response.body.data.unrated, true);
    assert.equal(response.body.data.provisional, true);
  });
});
