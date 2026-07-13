import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';
import { localFixtureUsers } from '../src/auth/current-user.service.ts';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { RedisReadinessService } from '../src/health/redis-readiness.service.ts';
import { ApiExceptionFilter } from '../src/shared/api-exception.filter.ts';

const releaseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const answerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestOne = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const requestTwo = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const requestThree = 'cccccccc-3333-4333-8333-cccccccccccc';

function createMatchmakingPrismaMock() {
  let ticketSequence = 0;
  let matchSequence = 0;
  let roundSequence = 0;
  let transactionTail = Promise.resolve();
  const controls: { ratingCreateFailure: unknown | null } = { ratingCreateFailure: null };
  const metrics = { transactionAttempts: 0 };

  const users = new Map([
    [localFixtureUsers.playerOne, { id: localFixtureUsers.playerOne, displayName: 'Player One', profile: { publicHandle: 'player_one' } }],
    [localFixtureUsers.guestPlayer, { id: localFixtureUsers.guestPlayer, displayName: 'Guest Player', profile: { publicHandle: 'guest_player' } }],
    [localFixtureUsers.emptyPlayer, { id: localFixtureUsers.emptyPlayer, displayName: 'Empty Player', profile: { publicHandle: 'empty_player' } }],
  ]);
  const ratings = [...users.keys()].map((userId) => ({
    id: `rating-${userId}`,
    userId,
    mode: 'standard_1v1',
    status: 'active',
    rating: 1500,
    provisionalRemaining: 10,
    algorithm: 'glicko2',
    algorithmConfigVersion: 'standard_1v1_glicko_v1',
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
  }));
  const tickets: any[] = [];
  const matches: any[] = [];
  const participants: any[] = [];
  const rounds: any[] = [];
  const audits: any[] = [];

  const hydrate = (ticket: any) => ({
    ...ticket,
    matchedOpponent: ticket.matchedOpponentUserId ? users.get(ticket.matchedOpponentUserId) ?? null : null,
  });

  const matchesWhere = (ticket: any, where: any): boolean => {
    if (!where) return true;
    if (where.id && ticket.id !== where.id) return false;
    if (where.userId && ticket.userId !== where.userId) return false;
    if (where.mode && ticket.mode !== where.mode) return false;
    if (where.state) {
      if (typeof where.state === 'string' && ticket.state !== where.state) return false;
      if (where.state.in && !where.state.in.includes(ticket.state)) return false;
    }
    if (where.expiresAt?.lte && ticket.expiresAt.getTime() > where.expiresAt.lte.getTime()) return false;
    return true;
  };

  const client: any = {
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      metrics.transactionAttempts += 1;
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback(client);
      } finally {
        release();
      }
    },
    $queryRawUnsafe: async (query: string, ...params: any[]) => {
      if (!query.includes('FROM "MatchmakingTicket"') || query.includes('WHERE "id" =')) return [];
      const [userId, now, minRating, maxRating, requesterRating, allowProvisional, requesterProvisional, algorithmVersion, cooldownCutoff, requesterRelaxed] = params;
      return tickets
        .filter((ticket) => ticket.state === 'queued' && ticket.mode === 'standard_1v1' && ticket.rated)
        .filter((ticket) => ticket.userId !== userId && ticket.expiresAt.getTime() > now.getTime())
        .filter((ticket) => ticket.ratingAtQueue >= minRating && ticket.ratingAtQueue <= maxRating)
        .filter((ticket) => requesterRating >= ticket.searchMinRating && requesterRating <= ticket.searchMaxRating)
        .filter((ticket) => allowProvisional || !ticket.provisionalAtQueue)
        .filter((ticket) => ticket.allowProvisionalOpponent || !requesterProvisional)
        .filter((ticket) => ratings.some((profile) => profile.userId === ticket.userId
          && profile.mode === 'standard_1v1'
          && profile.status === 'active'
          && profile.algorithmConfigVersion === algorithmVersion))
        .filter((ticket) => {
          const recentRematch = matches.some((match) => ['completed', 'voided'].includes(match.status)
            && match.rankedMode === 'standard_1v1'
            && (match.completedAt ?? match.updatedAt) >= cooldownCutoff
            && participants.some((entry) => entry.matchId === match.id && entry.userId === userId)
            && participants.some((entry) => entry.matchId === match.id && entry.userId === ticket.userId));
          return !recentRematch || (requesterRelaxed && ticket.createdAt.getTime() <= now.getTime() - 30_000);
        })
        .sort((left, right) => Math.abs(left.ratingAtQueue - requesterRating) - Math.abs(right.ratingAtQueue - requesterRating)
          || Number(left.provisionalAtQueue !== requesterProvisional) - Number(right.provisionalAtQueue !== requesterProvisional)
          || left.createdAt.getTime() - right.createdAt.getTime()
          || left.id.localeCompare(right.id))
        .slice(0, 1)
        .map(({ id }) => ({ id }));
    },
    matchmakingTicket: {
      findUnique: async (args: any) => {
        let ticket;
        if (args.where.id) ticket = tickets.find((row) => row.id === args.where.id);
        else if (args.where.userId_mode_idempotencyKey) {
          const key = args.where.userId_mode_idempotencyKey;
          ticket = tickets.find((row) => row.userId === key.userId && row.mode === key.mode && row.idempotencyKey === key.idempotencyKey);
        }
        return ticket ? hydrate(ticket) : null;
      },
      findFirst: async (args: any) => {
        const found = tickets.filter((row) => matchesWhere(row, args.where)).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
        return found ? hydrate(found) : null;
      },
      findMany: async (args: any) => tickets.filter((row) => matchesWhere(row, args.where)).map((row) => args.select
        ? Object.fromEntries(Object.keys(args.select).map((key) => [key, row[key]]))
        : hydrate(row)),
      create: async (args: any) => {
        if (tickets.some((row) => row.userId === args.data.userId && row.mode === args.data.mode && ['queued', 'matched'].includes(row.state))) {
          throw Object.assign(new Error('active ticket unique constraint'), { code: 'P2002' });
        }
        ticketSequence += 1;
        const id = `10000000-0000-4000-8000-${String(ticketSequence).padStart(12, '0')}`;
        const createdAt = args.data.createdAt ?? new Date(Date.now() + ticketSequence);
        const ticket = {
          id,
          matchedMatchId: null,
          matchedOpponentUserId: null,
          matchedOpponentRatingAtQueue: null,
          matchedOpponentProvisionalAtQueue: null,
          cancelledAt: null,
          timedOutAt: null,
          failedAt: null,
          failureCode: null,
          ...args.data,
          createdAt,
          updatedAt: createdAt,
        };
        tickets.push(ticket);
        return hydrate(ticket);
      },
      update: async (args: any) => {
        const ticket = tickets.find((row) => row.id === args.where.id);
        if (!ticket) throw new Error('ticket not found');
        Object.assign(ticket, args.data, { updatedAt: new Date() });
        return hydrate(ticket);
      },
      updateMany: async (args: any) => {
        const found = tickets.filter((row) => matchesWhere(row, args.where));
        for (const ticket of found) Object.assign(ticket, args.data, { updatedAt: new Date() });
        return { count: found.length };
      },
    },
    ratingProfile: {
      findFirst: async (args: any) => ratings.find((row) => row.userId === args.where.userId
        && row.mode === args.where.mode
        && row.status === args.where.status
        && (!args.where.algorithmConfigVersion || row.algorithmConfigVersion === args.where.algorithmConfigVersion)) ?? null,
      create: async (args: any) => {
        if (controls.ratingCreateFailure) {
          const error = controls.ratingCreateFailure;
          controls.ratingCreateFailure = null;
          throw error;
        }
        const row = { id: `rating-${args.data.userId}`, ...args.data, updatedAt: new Date() };
        ratings.push(row);
        return row;
      },
    },
    dictionaryRelease: {
      findFirst: async () => ({ id: releaseId, status: 'active', wordLength: 5, releasedAt: new Date('2026-07-10T00:00:00.000Z') }),
    },
    dictionaryWord: {
      findMany: async () => [{ id: answerId, dictionaryReleaseId: releaseId, normalizedWord: 'crane', kind: 'answer' }],
    },
    match: {
      findUnique: async (args: any) => matches.find((row) => row.id === args.where.id) ?? null,
      findFirst: async (args: any) => matches.find((row) => row.rankedMode === args.where.rankedMode
        && (args.where.status.in ?? [args.where.status]).includes(row.status)
        && (row.completedAt ?? row.updatedAt) >= args.where.OR[0].completedAt.gte
        && args.where.AND.every((condition: any) => participants.some((entry) => entry.matchId === row.id
          && entry.userId === condition.participants.some.userId))) ?? null,
      create: async (args: any) => {
        const existing = matches.find((row) => row.idempotencyKey === args.data.idempotencyKey);
        if (existing) return existing;
        matchSequence += 1;
        const row = { id: `20000000-0000-4000-8000-${String(matchSequence).padStart(12, '0')}`, ...args.data };
        matches.push(row);
        return row;
      },
    },
    matchParticipant: {
      createMany: async (args: any) => {
        participants.push(...args.data.map((row: any, index: number) => ({ id: `participant-${participants.length + index + 1}`, ...row })));
        return { count: args.data.length };
      },
    },
    matchRound: {
      create: async (args: any) => {
        roundSequence += 1;
        const row = { id: `30000000-0000-4000-8000-${String(roundSequence).padStart(12, '0')}`, ...args.data };
        rounds.push(row);
        return row;
      },
    },
    auditLog: { create: async (args: any) => { audits.push(args.data); return args.data; } },
  };

  return {
    client,
    checkDatabase: async () => ({ status: 'ok', checkedAt: new Date().toISOString(), latencyMs: 1 }),
    checkApplicationSchema: async () => ({ status: 'ok', checkedAt: new Date().toISOString(), latencyMs: 1 }),
    onModuleDestroy: async () => {},
    state: { tickets, matches, participants, rounds, audits, ratings, controls, metrics },
  };
}

async function createApp() {
  const prisma = createMatchmakingPrismaMock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(RedisReadinessService)
    .useValue({ checkRedis: async () => ({ status: 'not_checked_stub', checkedAt: new Date().toISOString() }) })
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return { app, prisma, matchmaking: app.get(MatchmakingService) };
}

const body = (clientRequestId: string, overrides: Record<string, unknown> = {}) => ({
  clientRequestId,
  mode: 'standard_1v1',
  rated: true,
  allowProvisionalOpponent: true,
  ...overrides,
}) as {
  clientRequestId: string;
  mode: 'standard_1v1' | 'speed_1v1' | 'classic_1v1' | 'multiplayer_lobby';
  rated: boolean;
  allowProvisionalOpponent: boolean;
};

describe('database-backed Standard 1v1 matchmaking', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createMatchmakingPrismaMock>;
  let matchmaking: MatchmakingService;

  beforeEach(async () => {
    ({ app, prisma, matchmaking } = await createApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates one durable ticket and returns it for idempotent or duplicate active joins', async () => {
    const first = await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').send(body(requestOne)).expect(201);
    const replay = await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').send(body(requestOne)).expect(200);
    const duplicate = await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').send(body(requestTwo)).expect(200);

    assert.equal(first.body.data.state, 'queued');
    assert.equal(replay.body.data.ticketId, first.body.data.ticketId);
    assert.equal(duplicate.body.data.ticketId, first.body.data.ticketId);
    assert.equal(prisma.state.tickets.length, 1);
    assert.equal(prisma.state.matches.length, 0);
  });

  it('lets the transaction boundary retry a cold-profile P2034 instead of returning a conflict', async () => {
    const profileIndex = prisma.state.ratings.findIndex((profile) => profile.userId === localFixtureUsers.playerOne);
    prisma.state.ratings.splice(profileIndex, 1);
    prisma.state.controls.ratingCreateFailure = Object.assign(new Error('serialization failure'), { code: 'P2034' });

    const joined = await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body(requestOne));

    assert.equal(joined.state, 'queued');
    assert.equal(prisma.state.metrics.transactionAttempts, 2);
    assert.ok(prisma.state.ratings.some((profile) => profile.userId === localFixtureUsers.playerOne
      && profile.algorithmConfigVersion === 'standard_1v1_glicko_v1'));
  });

  it('atomically pairs two authenticated users into one shared server-authoritative match', async () => {
    const first = await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').send(body(requestOne)).expect(201);
    const second = await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').set('x-wordle-dev-user-id', localFixtureUsers.guestPlayer).send(body(requestTwo)).expect(201);
    const firstStatus = await request(app.getHttpServer()).get(`/matchmaking/standard-1v1/tickets/${first.body.data.ticketId}`).expect(200);

    assert.equal(second.body.data.state, 'matched');
    assert.equal(firstStatus.body.data.state, 'matched');
    assert.equal(firstStatus.body.data.matchedMatchId, second.body.data.matchedMatchId);
    assert.equal(prisma.state.matches.length, 1);
    assert.equal(prisma.state.matches[0].rankedMode, 'standard_1v1');
    assert.equal(prisma.state.matches[0].algorithmConfigVersion, 'standard_1v1_glicko_v1');
    assert.equal(prisma.state.participants.length, 2);
    assert.equal(new Set(prisma.state.participants.map((entry) => entry.userId)).size, 2);
    assert.equal(prisma.state.rounds.length, 1);
    assert.equal('normalizedWord' in firstStatus.body.data, false);
    assert.equal('answerWordHash' in firstStatus.body.data, false);
  });

  it('serializes concurrent duplicate joins without duplicate or self pairing', async () => {
    await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body(requestOne));
    const [left, right] = await Promise.all([
      matchmaking.joinStandardQueue(localFixtureUsers.guestPlayer, body(requestTwo)),
      matchmaking.joinStandardQueue(localFixtureUsers.guestPlayer, body(requestThree)),
    ]);

    assert.equal(left.ticketId, right.ticketId);
    assert.equal(left.matchedMatchId, right.matchedMatchId);
    assert.equal(prisma.state.tickets.length, 2);
    assert.equal(prisma.state.matches.length, 1);
    assert.equal(prisma.state.participants.length, 2);
    assert.ok(prisma.state.matches.every((match) => match.id));
    assert.ok(prisma.state.participants.every((participant) => participant.userId !== undefined));
  });

  it('cancels queued tickets idempotently and rejects cancellation after pairing', async () => {
    const queued = await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').send(body(requestOne)).expect(201);
    const cancelled = await request(app.getHttpServer()).delete(`/matchmaking/standard-1v1/tickets/${queued.body.data.ticketId}`).expect(200);
    const replay = await request(app.getHttpServer()).delete(`/matchmaking/standard-1v1/tickets/${queued.body.data.ticketId}`).expect(200);
    assert.equal(cancelled.body.data.state, 'cancelled');
    assert.equal(replay.body.data.state, 'cancelled');

    const next = await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').send(body(requestTwo)).expect(201);
    await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').set('x-wordle-dev-user-id', localFixtureUsers.guestPlayer).send(body(requestThree)).expect(201);
    const conflict = await request(app.getHttpServer()).delete(`/matchmaking/standard-1v1/tickets/${next.body.data.ticketId}`).expect(409);
    assert.equal(conflict.body.error.code, 'ticket_already_matched');
  });

  it('releases completed matched tickets so users can queue again', async () => {
    const first = await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body(requestOne));
    await matchmaking.joinStandardQueue(localFixtureUsers.guestPlayer, body(requestTwo));
    const match = prisma.state.matches[0];
    match.status = 'completed';
    match.completedAt = new Date();

    const replay = await matchmaking.joinStandardQueue(
      localFixtureUsers.playerOne,
      body('90000000-0000-4000-8000-000000000001'),
      new Date(match.completedAt.getTime() + 1_000),
    );

    assert.equal(replay.state, 'queued');
    assert.notEqual(replay.ticketId, first.ticketId);
    assert.equal(prisma.state.tickets.find((ticket) => ticket.id === first.ticketId)?.state, 'consumed');
  });

  it('blocks recent repeat opponents during the strict window and relaxes after both wait 30 seconds', async () => {
    const requeueAt = new Date();
    const initialNow = new Date(requeueAt.getTime() - 2_000);
    await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body(requestOne), initialNow);
    await matchmaking.joinStandardQueue(localFixtureUsers.guestPlayer, body(requestTwo), initialNow);
    const firstMatch = prisma.state.matches[0];
    firstMatch.status = 'completed';
    firstMatch.completedAt = new Date(requeueAt.getTime() - 1_000);

    const firstRequeue = await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body('90000000-0000-4000-8000-000000000002'), requeueAt);
    const secondRequeue = await matchmaking.joinStandardQueue(localFixtureUsers.guestPlayer, body('90000000-0000-4000-8000-000000000003'), requeueAt);
    assert.equal(firstRequeue.state, 'queued');
    assert.equal(secondRequeue.state, 'queued');
    assert.equal(prisma.state.matches.length, 1);

    for (const ticket of prisma.state.tickets.filter((entry) => entry.state === 'queued')) ticket.createdAt = requeueAt;
    const relaxed = await matchmaking.getCurrentTicket(localFixtureUsers.guestPlayer, new Date(requeueAt.getTime() + 31_000));
    assert.equal(relaxed?.state, 'matched');
    assert.equal(prisma.state.matches.length, 2);
  });

  it('prefers a fresh opponent over a closer recent opponent after cooldown relaxation begins', async () => {
    const queuedAt = new Date('2026-07-10T12:00:00.000Z');
    const playerRating = prisma.state.ratings.find((profile) => profile.userId === localFixtureUsers.playerOne)!;
    const guestRating = prisma.state.ratings.find((profile) => profile.userId === localFixtureUsers.guestPlayer)!;
    const emptyRating = prisma.state.ratings.find((profile) => profile.userId === localFixtureUsers.emptyPlayer)!;
    emptyRating.rating = 1550;

    prisma.state.matches.push({
      id: 'recent-voided-match',
      rankedMode: 'standard_1v1',
      status: 'voided',
      completedAt: null,
      updatedAt: new Date(queuedAt.getTime() - 1_000),
    });
    prisma.state.participants.push(
      { matchId: 'recent-voided-match', userId: localFixtureUsers.playerOne },
      { matchId: 'recent-voided-match', userId: localFixtureUsers.guestPlayer },
    );

    await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body(requestOne), queuedAt);
    playerRating.status = 'suspended';
    await matchmaking.joinStandardQueue(localFixtureUsers.guestPlayer, body(requestTwo), queuedAt);
    guestRating.status = 'suspended';
    await matchmaking.joinStandardQueue(localFixtureUsers.emptyPlayer, body(requestThree), queuedAt);
    playerRating.status = 'active';
    guestRating.status = 'active';

    const paired = await matchmaking.getCurrentTicket(localFixtureUsers.playerOne, new Date(queuedAt.getTime() + 31_000));

    assert.equal(paired?.state, 'matched');
    assert.equal(paired?.matchedOpponent?.userId, localFixtureUsers.emptyPlayer);
  });

  it('does not pair a candidate whose Standard rating profile is no longer active', async () => {
    await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body(requestOne));
    prisma.state.ratings.find((profile) => profile.userId === localFixtureUsers.playerOne)!.status = 'suspended';
    const guest = await matchmaking.joinStandardQueue(localFixtureUsers.guestPlayer, body(requestTwo));
    assert.equal(guest.state, 'queued');
    assert.equal(prisma.state.matches.length, 0);
  });

  it('times out stale queued tickets and excludes them from current reconnect state', async () => {
    const startedAt = new Date('2026-07-10T12:00:00.000Z');
    const ticket = await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body(requestOne), startedAt);
    const current = await matchmaking.getCurrentTicket(localFixtureUsers.playerOne, new Date(startedAt.getTime() + 61_000));
    const terminal = await matchmaking.getTicket(localFixtureUsers.playerOne, ticket.ticketId, new Date(startedAt.getTime() + 61_000));

    assert.equal(current, null);
    assert.equal(terminal.state, 'timed_out');
    assert.equal(prisma.state.matches.length, 0);
  });

  it('expands the requester rating window at 10, 20, and 30 seconds', async () => {
    const startedAt = new Date('2026-07-10T12:00:00.000Z');
    const joined = await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body(requestOne), startedAt);
    const persisted = prisma.state.tickets.find((ticket) => ticket.id === joined.ticketId)!;
    persisted.createdAt = startedAt;

    const tenSeconds = await matchmaking.getCurrentTicket(localFixtureUsers.playerOne, new Date(startedAt.getTime() + 10_000));
    const twentySeconds = await matchmaking.getCurrentTicket(localFixtureUsers.playerOne, new Date(startedAt.getTime() + 20_000));
    const thirtySeconds = await matchmaking.getCurrentTicket(localFixtureUsers.playerOne, new Date(startedAt.getTime() + 30_000));

    assert.deepEqual(tenSeconds?.searchWindow, { minRating: 1300, maxRating: 1700, expansionStep: 1 });
    assert.deepEqual(twentySeconds?.searchWindow, { minRating: 1200, maxRating: 1800, expansionStep: 2 });
    assert.deepEqual(thirtySeconds?.searchWindow, { minRating: 1100, maxRating: 1900, expansionStep: 3 });
  });

  it('honors the provisional-opponent filter', async () => {
    await matchmaking.joinStandardQueue(localFixtureUsers.playerOne, body(requestOne, { allowProvisionalOpponent: false }));
    const guest = await matchmaking.joinStandardQueue(localFixtureUsers.guestPlayer, body(requestTwo));

    assert.equal(guest.state, 'queued');
    assert.equal(prisma.state.matches.length, 0);
    assert.equal(prisma.state.tickets.length, 2);
  });

  it('fails unsupported modes and unrated requests explicitly', async () => {
    const unsupported = await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').send(body(requestOne, { mode: 'speed_1v1' })).expect(400);
    const unrated = await request(app.getHttpServer()).post('/matchmaking/standard-1v1/tickets').send(body(requestTwo, { rated: false })).expect(400);
    assert.equal(unsupported.body.error.code, 'unsupported_matchmaking_mode');
    assert.equal(unrated.body.error.code, 'rated_required');
  });
});
