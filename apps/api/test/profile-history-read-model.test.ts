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

const currentUserId = '11111111-1111-4111-8111-111111111111';
const guestUserId = '22222222-2222-4222-8222-222222222222';
const emptyUserId = '33333333-3333-4333-8333-333333333333';
const completedMatchId = '44444444-4444-4444-8444-444444444444';
const activeMatchId = '55555555-5555-4555-8555-555555555555';

function createProfileReadPrismaMock() {
  const users = [
    { id: currentUserId, displayName: 'Player One', profile: { publicHandle: 'player_one', avatarUrl: null } },
    { id: guestUserId, displayName: 'Guest Player', profile: { publicHandle: 'guest_player', avatarUrl: null } },
    { id: emptyUserId, displayName: 'Empty Player', profile: { publicHandle: 'empty_player', avatarUrl: null } },
  ];
  const ratingProfiles = [
    { id: 'rating_host', userId: currentUserId, mode: 'standard_1v1', rating: 1516, matchesPlayed: 1, provisionalRemaining: 9, wins: 1, losses: 0, draws: 0, abandons: 0, peakRating: 1516, ratingDeviation: 320, ratingVolatility: null, lastRatedAt: null, algorithm: 'placement_mmr_v1', algorithmConfigVersion: 'placement_mmr_v1', status: 'active' },
    { id: 'rating_guest', userId: guestUserId, mode: 'standard_1v1', rating: 1484, matchesPlayed: 1, provisionalRemaining: 9, wins: 0, losses: 1, draws: 0, abandons: 0, peakRating: 1500, ratingDeviation: 320, ratingVolatility: null, lastRatedAt: null, algorithm: 'placement_mmr_v1', algorithmConfigVersion: 'placement_mmr_v1', status: 'active' },
    { id: 'rating_host_standard', userId: currentUserId, mode: 'standard_1v1', rating: 1514, matchesPlayed: 1, provisionalRemaining: 9, wins: 1, losses: 0, draws: 0, abandons: 0, peakRating: 1514, ratingDeviation: 290, ratingVolatility: null, lastRatedAt: null, algorithm: 'glicko_style_internal', algorithmConfigVersion: 'standard_1v1_glicko_v1', status: 'active' },
    { id: 'rating_guest_standard', userId: guestUserId, mode: 'standard_1v1', rating: 1486, matchesPlayed: 1, provisionalRemaining: 9, wins: 0, losses: 1, draws: 0, abandons: 0, peakRating: 1500, ratingDeviation: 290, ratingVolatility: null, lastRatedAt: null, algorithm: 'glicko_style_internal', algorithmConfigVersion: 'standard_1v1_glicko_v1', status: 'active' },
  ];
  const matches = [
    {
      id: activeMatchId,
      mode: 'ranked',
      status: 'active',
      startedAt: new Date('2026-07-01T11:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-07-01T11:00:00.000Z'),
      answerWordHash: 'should-never-leak',
      participants: [
        { id: 'participant_active_host', matchId: activeMatchId, userId: currentUserId, seatNumber: 1, outcome: 'pending', placement: null, finalScore: 0, user: users[0], ratingEvents: [] },
        { id: 'participant_active_guest', matchId: activeMatchId, userId: guestUserId, seatNumber: 2, outcome: 'pending', placement: null, finalScore: 0, user: users[1], ratingEvents: [] },
      ],
      report: null,
    },
    {
      id: completedMatchId,
      mode: 'ranked',
      status: 'completed',
      startedAt: new Date('2026-07-01T10:00:00.000Z'),
      completedAt: new Date('2026-07-01T10:03:00.000Z'),
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      answerWordHash: 'should-never-leak',
      answerWordSaltRef: 'should-never-leak',
      participants: [
        { id: 'participant_host', matchId: completedMatchId, userId: currentUserId, seatNumber: 1, outcome: 'solved', placement: 1, finalScore: 1000, user: users[0], ratingEvents: [
          { delta: 999, algorithmConfigVersion: 'standard_1v1_glicko_v1', voidedByEventId: 'void_event', metadata: { userId: currentUserId } },
          { delta: 16, algorithmConfigVersion: 'placement_mmr_v1', metadata: { userId: currentUserId } },
          { delta: 14, algorithmConfigVersion: 'standard_1v1_glicko_v1', metadata: { userId: currentUserId } },
        ] },
        { id: 'participant_guest', matchId: completedMatchId, userId: guestUserId, seatNumber: 2, outcome: 'failed', placement: 2, finalScore: 120, user: users[1], ratingEvents: [
          { delta: -16, algorithmConfigVersion: 'placement_mmr_v1', metadata: { userId: guestUserId } },
          { delta: -14, algorithmConfigVersion: 'standard_1v1_glicko_v1', metadata: { userId: guestUserId } },
        ] },
      ],
      report: {
        publicSummary: { safe: true, finalStandings: [] },
        spoilerSafeShare: { matchId: completedMatchId },
      },
    },
  ];

  const client = {
    userAccount: {
      findUnique: async (args: any) => users.find((user) => user.id === args.where.id) ?? null,
      upsert: async () => users[0],
    },
    userProfile: {
      findUnique: async (args: any) => {
        const user = users.find((row) => row.profile.publicHandle === args.where.publicHandle);
        return user ? { ...user.profile, user } : null;
      },
      count: async () => 0,
    },
    ratingProfile: {
      findUnique: async (args: any) => ratingProfiles.find((profile) => profile.userId === args.where.userId_mode_algorithmConfigVersion.userId
        && profile.mode === args.where.userId_mode_algorithmConfigVersion.mode
        && profile.algorithmConfigVersion === args.where.userId_mode_algorithmConfigVersion.algorithmConfigVersion) ?? null,
      findMany: async (args: any) => ratingProfiles.filter((profile) => (!args.where.userId || profile.userId === args.where.userId)
        && (!args.where.mode || profile.mode === args.where.mode)
        && (!args.where.algorithmConfigVersion || profile.algorithmConfigVersion === args.where.algorithmConfigVersion)
        && profile.status === args.where.status),
    },
    match: {
      findMany: async (args: any) => matches
        .filter((match) => match.mode === args.where.mode && match.participants.some((participant) => participant.userId === args.where.participants.some.userId))
        .slice(0, args.take ?? 20),
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
    .useValue(createProfileReadPrismaMock())
    .overrideProvider(RedisReadinessService)
    .useValue({ checkRedis: async () => ({ status: 'ok', checkedAt: new Date().toISOString(), latencyMs: 1 }) })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return app;
}

describe('profile and match history REST read models', () => {
  let app: INestApplication;

  before(async () => {
    app = await createApp();
  });

  after(async () => {
    await app.close();
  });

  it('serves current user rated profile summary with seeded rating and recent matches', async () => {
    const response = await request(app.getHttpServer()).get('/profiles/me/summary').expect(200);

    assert.equal(response.body.error, null);
    assert.equal(response.body.data.userId, currentUserId);
    assert.equal(response.body.data.handle, 'player_one');
    assert.equal(response.body.data.rating.rankedMode, 'standard_1v1');
    assert.equal(response.body.data.rating.rating, 1514);
    assert.equal(response.body.data.rating.matchesPlayed, 1);
    assert.equal(response.body.data.rating.algorithm, 'standard_1v1_glicko_v1');
    assert.equal(response.body.data.rating.algorithmConfigVersion, 'standard_1v1_glicko_v1');
    assert.equal(response.body.data.rating.rank, 1);
    assert.equal(response.body.data.rating.unrated, false);
    assert.equal(response.body.data.recentMatches.length, 2);
    assert.doesNotMatch(JSON.stringify(response.body), /answerWordHash|answerWordSaltRef|should-never-leak/i);
  });

  it('serves an honest empty profile/history state for a seeded user without ranked matches', async () => {
    const profile = await request(app.getHttpServer())
      .get('/profiles/me/summary')
      .set('x-wordle-dev-user-id', emptyUserId)
      .expect(200);

    assert.equal(profile.body.error, null);
    assert.equal(profile.body.data.handle, 'empty_player');
    assert.equal(profile.body.data.rating.rating, 1500);
    assert.equal(profile.body.data.rating.matchesPlayed, 0);
    assert.equal(profile.body.data.rating.unrated, true);
    assert.deepEqual(profile.body.data.recentMatches, []);

    const history = await request(app.getHttpServer())
      .get('/matches/history/me')
      .set('x-wordle-dev-user-id', emptyUserId)
      .expect(200);

    assert.equal(history.body.error, null);
    assert.deepEqual(history.body.data.items, []);
    assert.equal(history.body.data.pagination.nextCursor, null);
  });

  it('serves completed ranked match history with viewer and rating deltas but no spoilers', async () => {
    const response = await request(app.getHttpServer()).get('/matches/history/me?limit=10').expect(200);

    assert.equal(response.body.error, null);
    const completed = response.body.data.items.find((item: any) => item.matchId === completedMatchId);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.ratingAlgorithm, 'standard_1v1_glicko_v1');
    assert.equal(completed.ratingAlgorithmConfigVersion, 'standard_1v1_glicko_v1');
    assert.equal(completed.viewer.userId, currentUserId);
    assert.equal(completed.viewer.placement, 1);
    assert.equal(completed.viewer.ratingDelta, 14);
    assert.deepEqual(completed.participants.map((participant: any) => ({ handle: participant.handle, ratingDelta: participant.ratingDelta })), [
      { handle: 'player_one', ratingDelta: 14 },
      { handle: 'guest_player', ratingDelta: -14 },
    ]);

    const active = response.body.data.items.find((item: any) => item.matchId === activeMatchId);
    assert.equal(active.status, 'active');
    assert.equal(active.viewer.ratingDelta, null);
    assert.doesNotMatch(JSON.stringify(response.body), /answerWordHash|answerWordSaltRef|should-never-leak/i);
  });

  it('requires authentication for current-user profile summary and match history in preview mode', async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    const priorAppEnv = process.env.APP_ENV;
    const priorAuthMode = process.env.AUTH_MODE;
    const priorEnableDevAuth = process.env.ENABLE_DEV_AUTH;
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'preview';
    process.env.AUTH_MODE = 'session_required';
    process.env.ENABLE_DEV_AUTH = 'false';
    try {
      const profile = await request(app.getHttpServer())
        .get('/profiles/me/summary')
        .set('x-wordle-dev-user-id', emptyUserId)
        .expect(401);
      assert.equal(profile.body.data, null);
      assert.equal(profile.body.error.code, 'not_authenticated');
      assert.equal(profile.body.error.details.authMode, 'session_required');

      const history = await request(app.getHttpServer())
        .get('/matches/history/me')
        .set('x-wordle-dev-user-id', emptyUserId)
        .expect(401);
      assert.equal(history.body.data, null);
      assert.equal(history.body.error.code, 'not_authenticated');
    } finally {
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorNodeEnv;
      if (priorAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = priorAppEnv;
      if (priorAuthMode === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = priorAuthMode;
      if (priorEnableDevAuth === undefined) delete process.env.ENABLE_DEV_AUTH; else process.env.ENABLE_DEV_AUTH = priorEnableDevAuth;
    }
  });

  it('serves public profile summary by handle', async () => {
    const response = await request(app.getHttpServer()).get('/profiles/guest_player/summary').expect(200);

    assert.equal(response.body.error, null);
    assert.equal(response.body.data.userId, guestUserId);
    assert.equal(response.body.data.handle, 'guest_player');
    assert.equal(response.body.data.rating.rating, 1486);
    assert.equal(response.body.data.rating.algorithm, 'standard_1v1_glicko_v1');
    assert.equal(response.body.data.recentMatches.length, 2);
  });
});
