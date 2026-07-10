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

const hostUserId = '11111111-1111-4111-8111-111111111111';
const guestUserId = '22222222-2222-4222-8222-222222222222';
const lobbyId = '33333333-3333-4333-8333-333333333333';
const matchId = '44444444-4444-4444-8444-444444444444';
const roundId = '55555555-5555-4555-8555-555555555555';
const dictionaryReleaseId = '99999999-9999-4999-8999-999999999999';
const participantOneId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const participantTwoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const voidMatchId = '66666666-6666-4666-8666-666666666666';
const voidParticipantOneId = '77777777-7777-4777-8777-777777777771';
const voidParticipantTwoId = '77777777-7777-4777-8777-777777777772';

function createGameplayRestPrismaMock() {
  const lobby = {
    id: lobbyId,
    status: 'waiting',
    settings: {
      members: [
        { userId: hostUserId, displayName: 'Player One', handle: 'player_one', role: 'host', state: 'joined', ready: true, joinedAt: '2026-06-29T00:00:00.000Z' },
        { userId: guestUserId, displayName: 'Guest Player', handle: 'guest_player', role: 'player', state: 'joined', ready: true, joinedAt: '2026-06-29T00:00:00.000Z' },
      ],
    },
  };
  const created: {
    match: any[];
    matchRound: any[];
    matchParticipant: any[];
    guessAttempt: any[];
    scoreBreakdown: any[];
    ratingProfile: any[];
    ratingEvent: any[];
    matchReport: any[];
  } = { match: [], matchRound: [], matchParticipant: [], guessAttempt: [], scoreBreakdown: [], ratingProfile: [], ratingEvent: [], matchReport: [] };
  const dictionaryRelease = { id: dictionaryReleaseId, version: 'fixture-local-v1', status: 'active', wordLength: 5 };
  const dictionaryWords = [
    { id: 'answer_crane', dictionaryReleaseId, normalizedWord: 'crane', kind: 'answer' },
    { id: 'guess_crane', dictionaryReleaseId, normalizedWord: 'crane', kind: 'guess' },
    { id: 'guess_slate', dictionaryReleaseId, normalizedWord: 'slate', kind: 'guess' },
    { id: 'banned_xxxxx', dictionaryReleaseId, normalizedWord: 'xxxxx', kind: 'banned' },
  ];

  const client = {
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(client),
    lobby: {
      findUnique: async (args: any) => args.where.id === lobbyId ? lobby : null,
      update: async (args: any) => Object.assign(lobby, args.data),
    },
    dictionaryRelease: {
      findFirst: async () => dictionaryRelease,
      findUnique: async () => dictionaryRelease,
    },
    dictionaryWord: {
      findMany: async (args: any) => dictionaryWords.filter((word) => {
        if (word.dictionaryReleaseId !== args.where.dictionaryReleaseId) return false;
        if (args.where.kind?.in) return args.where.kind.in.includes(word.kind);
        return word.kind === args.where.kind;
      }),
    },
    match: {
      create: async (args: any) => {
        const row = { id: matchId, createdAt: new Date('2026-06-29T00:00:00.000Z'), updatedAt: new Date('2026-06-29T00:00:00.000Z'), ...args.data };
        created.match.push(row);
        return row;
      },
      findUnique: async (args: any) => created.match.find((row) => row.id === args.where.id) ?? null,
      update: async (args: any) => {
        const row = created.match.find((item) => item.id === args.where.id);
        Object.assign(row, args.data);
        return row;
      },
    },
    matchRound: {
      create: async (args: any) => {
        const row = { id: roundId, createdAt: new Date('2026-06-29T00:00:00.000Z'), ...args.data };
        created.matchRound.push(row);
        return row;
      },
      findUnique: async (args: any) => created.matchRound.find((row) => row.id === args.where.id) ?? null,
      findMany: async (args: any) => created.matchRound.filter((row) => row.matchId === args.where.matchId).slice(0, args.take ?? 20),
      update: async (args: any) => {
        const row = created.matchRound.find((item) => item.id === args.where.id);
        Object.assign(row, args.data);
        return row;
      },
    },
    matchParticipant: {
      createMany: async (args: any) => {
        created.matchParticipant.push(...args.data.map((row: any, index: number) => ({ id: index === 0 ? participantOneId : participantTwoId, ...row })));
        return { count: args.data.length };
      },
      findUnique: async (args: any) => created.matchParticipant.find((row) => row.id === args.where.id) ?? null,
      findFirst: async (args: any) => created.matchParticipant.find((row) => row.matchId === args.where.matchId && row.userId === args.where.userId) ?? null,
      findMany: async (args: any) => created.matchParticipant.filter((row) => row.matchId === args.where.matchId),
      update: async (args: any) => {
        const row = created.matchParticipant.find((item) => item.id === args.where.id);
        Object.assign(row, args.data);
        return row;
      },
      updateMany: async (args: any) => {
        let count = 0;
        for (const row of created.matchParticipant) {
          if (row.matchId === args.where.matchId && (!args.where.outcome || row.outcome === args.where.outcome)) {
            Object.assign(row, args.data);
            count += 1;
          }
        }
        return { count };
      },
    },
    guessAttempt: {
      count: async (args: any) => created.guessAttempt.filter((row) => row.roundId === args.where.roundId && row.participantId === args.where.participantId).length,
      create: async (args: any) => {
        const row = { id: `guess_${created.guessAttempt.length + 1}`, ...args.data };
        created.guessAttempt.push(row);
        return row;
      },
      findMany: async (args: any) => created.guessAttempt.filter((row) => row.roundId === args.where.roundId && row.participantId === args.where.participantId),
    },
    scoreBreakdown: {
      create: async (args: any) => {
        const row = { id: `score_${created.scoreBreakdown.length + 1}`, ...args.data };
        created.scoreBreakdown.push(row);
        return row;
      },
    },
    ratingProfile: {
      findUnique: async (args: any) => created.ratingProfile.find((row) => row.userId === args.where.userId_mode_algorithmConfigVersion.userId
        && row.mode === args.where.userId_mode_algorithmConfigVersion.mode
        && row.algorithmConfigVersion === args.where.userId_mode_algorithmConfigVersion.algorithmConfigVersion) ?? null,
      create: async (args: any) => {
        const row = { id: `rating_profile_${created.ratingProfile.length + 1}`, status: 'active', wins: 0, losses: 0, draws: 0, abandons: 0, peakRating: args.data.rating, ratingDeviation: 350, ratingVolatility: null, lastRatedAt: null, ...args.data };
        created.ratingProfile.push(row);
        return row;
      },
      update: async (args: any) => {
        const row = created.ratingProfile.find((item) => item.id === args.where.id);
        Object.assign(row, {
          ...args.data,
          matchesPlayed: row.matchesPlayed + (args.data.matchesPlayed?.increment ?? 0),
          provisionalRemaining: Math.max(0, row.provisionalRemaining - (args.data.provisionalRemaining?.decrement ?? 0)),
          wins: row.wins + (args.data.wins?.increment ?? 0),
          losses: row.losses + (args.data.losses?.increment ?? 0),
          draws: row.draws + (args.data.draws?.increment ?? 0),
          abandons: row.abandons + (args.data.abandons?.increment ?? 0),
        });
        return row;
      },
    },
    ratingEvent: {
      findMany: async (args: any) => created.ratingEvent.filter((row) => {
        if (args.where.matchId && row.matchId !== args.where.matchId) return false;
        if (args.where.algorithmConfigVersion && row.algorithmConfigVersion !== args.where.algorithmConfigVersion) return false;
        if (args.where.type && row.type !== args.where.type) return false;
        return true;
      }),
      create: async (args: any) => {
        const row = { id: `rating_event_${created.ratingEvent.length + 1}`, createdAt: new Date('2026-06-29T00:00:00.000Z'), ...args.data };
        created.ratingEvent.push(row);
        return row;
      },
    },
    matchReport: {
      findUnique: async (args: any) => created.matchReport.find((row) => row.matchId === args.where.matchId) ?? null,
      upsert: async (args: any) => {
        const existing = created.matchReport.find((row) => row.matchId === args.where.matchId);
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }
        const row = { id: `match_report_${created.matchReport.length + 1}`, ...args.create };
        created.matchReport.push(row);
        return row;
      },
    },
  };

  return { client, checkDatabase: async () => ({ status: 'ok', checkedAt: new Date().toISOString(), latencyMs: 1 }), onModuleDestroy: async () => {}, created };
}

async function createApp() {
  const prisma = createGameplayRestPrismaMock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(RedisReadinessService)
    .useValue({ checkRedis: async () => ({ status: 'ok', checkedAt: new Date().toISOString(), latencyMs: 1 }) })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return { app, prisma };
}

describe('ranked gameplay REST endpoints', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createGameplayRestPrismaMock>;

  before(async () => {
    ({ app, prisma } = await createApp());
  });

  after(async () => {
    await app.close();
  });

  it('starts a lobby-backed ranked match and returns a spoiler-safe success envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/matches/ranked/start')
      .send({ clientRequestId: '12345678-1234-4234-8234-123456789abc', lobbyId, source: 'lobby' })
      .expect(201);

    assert.equal(response.body.error, null);
    assert.equal(response.body.data.matchId, matchId);
    assert.equal(response.body.data.roundId, roundId);
    assert.equal(response.body.data.state, 'in_progress');
    assert.equal(response.body.data.snapshot.currentRound.roundId, roundId);
    assert.equal(response.body.data.snapshot.standings.length, 2);
    assert.doesNotMatch(JSON.stringify(response.body), /crane|answerWordHash|answerWordSaltRef/i);
  });

  it('rejects route/body match mismatch with the shared error envelope', async () => {
    const response = await request(app.getHttpServer())
      .post(`/matches/${matchId}/rounds/${roundId}/guesses`)
      .send({ clientRequestId: '22345678-1234-4234-8234-123456789abc', matchId: guestUserId, roundId, guess: 'slate' })
      .expect(400);

    assert.equal(response.body.data, null);
    assert.equal(response.body.error.code, 'route_body_mismatch');
  });

  it('submits guesses through server-authoritative scoring and exposes only my safe state', async () => {
    const guess = await request(app.getHttpServer())
      .post(`/matches/${matchId}/rounds/${roundId}/guesses`)
      .send({ clientRequestId: '32345678-1234-4234-8234-123456789abc', matchId, roundId, guess: 'crane' })
      .expect(201);

    assert.equal(guess.body.error, null);
    assert.equal(guess.body.data.accepted, true);
    assert.deepEqual(guess.body.data.feedback.map((cell: any) => cell.state), ['correct', 'correct', 'correct', 'correct', 'correct']);
    assert.ok(guess.body.data.score > 0);
    assert.doesNotMatch(JSON.stringify(guess.body), /answerWordHash|answerWordSaltRef/i);

    const state = await request(app.getHttpServer()).get(`/matches/${matchId}/state`).expect(200);
    assert.equal(state.body.error, null);
    assert.equal(state.body.data.myState.guesses.length, 1);
    assert.equal(state.body.data.myState.guesses[0].guess, 'crane');
    assert.equal(state.body.data.currentRound.state, 'completed');
    assert.doesNotMatch(JSON.stringify(state.body), /answerWordHash|answerWordSaltRef/i);
  });

  it('rejects result and rating finalization while a ranked match is still active/incomplete', async () => {
    const complete = await request(app.getHttpServer())
      .post(`/matches/${matchId}/complete`)
      .send({ clientRequestId: '42345678-1234-4234-8234-123456789abc', matchId, reason: 'all_players_final' })
      .expect(400);

    assert.equal(complete.body.data, null);
    assert.equal(complete.body.error.code, 'match_not_ready_for_completion');

    const result = await request(app.getHttpServer()).get(`/matches/${matchId}/result`).expect(400);
    assert.equal(result.body.error.code, 'match_result_not_ready');
    assert.equal(prisma.created.ratingEvent.length, 0);
    const state = await request(app.getHttpServer()).get(`/matches/${matchId}/state`).expect(200);
    assert.equal('resultActions' in state.body.data, false);
    assert.doesNotMatch(JSON.stringify(state.body.data), /answer|answerWordHash|answerWordSaltRef/i);
  });

  it('exposes guest fixture state through the local dev user switch header', async () => {
    const state = await request(app.getHttpServer())
      .get(`/matches/${matchId}/state`)
      .set('x-wordle-dev-user-id', guestUserId)
      .expect(200);

    assert.equal(state.body.error, null);
    assert.equal(state.body.data.myState.playerRoundState, 'active');
    assert.equal(state.body.data.myState.guesses.length, 0);
    assert.doesNotMatch(JSON.stringify(state.body), /answerWordHash|answerWordSaltRef/i);
  });

  it('rejects dev helper use outside local/dev/test mode', async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    const priorAppEnv = process.env.APP_ENV;
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'production';
    try {
      const response = await request(app.getHttpServer())
        .post(`/matches/dev/${matchId}/users/${guestUserId}/terminalize`)
        .send({ outcome: 'failed', finalScore: 120 })
        .expect(403);

      assert.equal(response.body.data, null);
      assert.equal(response.body.error.code, 'dev_helper_disabled');
    } finally {
      if (priorNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = priorNodeEnv;
      }
      if (priorAppEnv === undefined) {
        delete process.env.APP_ENV;
      } else {
        process.env.APP_ENV = priorAppEnv;
      }
    }
  });

  it('requires an authenticated session for ranked current-user gameplay actions in preview mode', async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    const priorAppEnv = process.env.APP_ENV;
    const priorAuthMode = process.env.AUTH_MODE;
    const priorEnableDevAuth = process.env.ENABLE_DEV_AUTH;
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'preview';
    process.env.AUTH_MODE = 'session_required';
    process.env.ENABLE_DEV_AUTH = 'false';
    try {
      const start = await request(app.getHttpServer())
        .post('/matches/ranked/start')
        .set('x-wordle-dev-user-id', guestUserId)
        .send({ clientRequestId: '82345678-1234-4234-8234-123456789abc', lobbyId, source: 'lobby' })
        .expect(401);
      assert.equal(start.body.error.code, 'not_authenticated');

      const state = await request(app.getHttpServer())
        .get(`/matches/${matchId}/state`)
        .set('x-wordle-dev-user-id', guestUserId)
        .expect(401);
      assert.equal(state.body.error.code, 'not_authenticated');

      const guess = await request(app.getHttpServer())
        .post(`/matches/${matchId}/rounds/${roundId}/guesses`)
        .set('x-wordle-dev-user-id', guestUserId)
        .send({ clientRequestId: '92345678-1234-4234-8234-123456789abc', matchId, roundId, guess: 'slate' })
        .expect(401);
      assert.equal(guess.body.error.code, 'not_authenticated');
    } finally {
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = priorNodeEnv;
      if (priorAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = priorAppEnv;
      if (priorAuthMode === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = priorAuthMode;
      if (priorEnableDevAuth === undefined) delete process.env.ENABLE_DEV_AUTH; else process.env.ENABLE_DEV_AUTH = priorEnableDevAuth;
    }
  });

  it('completes terminal matches, returns rating deltas, and remains idempotent', async () => {
    const terminalize = await request(app.getHttpServer())
      .post(`/matches/dev/${matchId}/users/${guestUserId}/terminalize`)
      .send({ outcome: 'failed', finalScore: 120 })
      .expect(201);

    assert.equal(terminalize.body.error, null);
    assert.equal(terminalize.body.data.myState.playerRoundState, 'failed');

    const first = await request(app.getHttpServer())
      .post(`/matches/${matchId}/complete`)
      .send({ clientRequestId: '52345678-1234-4234-8234-123456789abc', matchId, reason: 'all_players_final' })
      .expect(201);

    assert.equal(first.body.error, null);
    assert.equal(first.body.data.state, 'completed');
    assert.equal(first.body.data.ratingEvent.kind, 'placement_mmr_v1');
    assert.deepEqual(first.body.data.ratingEvent.participants.map((participant: any) => participant.ratingDelta), [16, -16]);
    assert.doesNotMatch(JSON.stringify(first.body), /answerWordHash|answerWordSaltRef|crane/i);

    const result = await request(app.getHttpServer()).get(`/matches/${matchId}/result`).expect(200);
    assert.equal(result.body.error, null);
    assert.deepEqual(result.body.data.ratingEvent, first.body.data.ratingEvent);
    assert.equal(result.body.data.resultActions.share.spoilerSafe, true);
    assert.equal(result.body.data.resultActions.rematch.available, false);
    assert.equal(result.body.data.resultActions.links.matchHref, `/matches/${matchId}`);
    assert.equal(result.body.data.resultActions.links.historyHref, '/history');
    assert.equal(result.body.data.resultActions.links.nextRankedHref, '/lobbies?mode=ranked&status=waiting');
    assert.doesNotMatch(JSON.stringify(result.body.data.resultActions), /answer|answerWordHash|answerWordSaltRef|crane/i);

    const second = await request(app.getHttpServer())
      .post(`/matches/${matchId}/complete`)
      .send({ clientRequestId: '62345678-1234-4234-8234-123456789abc', matchId, reason: 'all_players_final' })
      .expect(201);

    assert.deepEqual(second.body.data.ratingEvent, first.body.data.ratingEvent);
    assert.equal(prisma.created.ratingEvent.filter((event) => event.matchId === matchId).length, 2);
    assert.deepEqual(prisma.created.ratingProfile.map((profile) => ({ userId: profile.userId, mode: profile.mode, rating: profile.rating, matchesPlayed: profile.matchesPlayed })), [
      { userId: hostUserId, mode: 'standard_1v1', rating: 1516, matchesPlayed: 1 },
      { userId: guestUserId, mode: 'standard_1v1', rating: 1484, matchesPlayed: 1 },
    ]);
  });

  it('allows explicit void completion without applying rating rows', async () => {
    prisma.created.match.push({ id: voidMatchId, mode: 'ranked', status: 'active', algorithmConfigVersion: 'placement_mmr_v1', completedAt: null });
    prisma.created.matchParticipant.push(
      { id: voidParticipantOneId, matchId: voidMatchId, userId: hostUserId, seatNumber: 1, outcome: 'pending', placement: null, finalScore: 0 },
      { id: voidParticipantTwoId, matchId: voidMatchId, userId: guestUserId, seatNumber: 2, outcome: 'pending', placement: null, finalScore: 0 },
    );

    const response = await request(app.getHttpServer())
      .post(`/matches/${voidMatchId}/complete`)
      .send({ clientRequestId: '72345678-1234-4234-8234-123456789abc', matchId: voidMatchId, reason: 'voided' })
      .expect(201);

    assert.equal(response.body.error, null);
    assert.equal(response.body.data.completionReason, 'voided');
    assert.equal(response.body.data.ratingEvent, null);
    assert.equal(prisma.created.ratingEvent.filter((event) => event.matchId === voidMatchId).length, 0);
  });
});
