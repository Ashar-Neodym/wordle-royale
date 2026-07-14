import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';
import { localFixtureUsers } from '../src/auth/current-user.service.ts';
import { StandardDictionaryService } from '../src/dictionary/standard-dictionary.service.ts';
import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';
import { isRecognizedMatchmakingTicketUniqueError } from '../src/matchmaking/matchmaking-lifecycle.ts';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';


const enabled = process.env.RUN_MATCHMAKING_POSTGRES_INTEGRATION === '1';
const playerOneRequestId = '13000000-0000-4000-8000-000000000001';
const guestRequestId = '13000000-0000-4000-8000-000000000002';
const joinBody = (clientRequestId: string) => ({
  clientRequestId,
  mode: 'standard_1v1' as const,
  rated: true,
  allowProvisionalOpponent: true,
});

describe('real PostgreSQL concurrent cold-profile matchmaking', { skip: !enabled }, () => {
  let app: INestApplication;
  let prisma: any;

  before(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService).client as any;

  });

  after(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await prisma.ratingEvent.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.guessAttempt.deleteMany();
    await prisma.matchRound.deleteMany();
    await prisma.matchParticipant.deleteMany();
    await prisma.matchmakingTicket.deleteMany();
    await prisma.match.deleteMany();
    await prisma.ratingProfile.deleteMany({
      where: {
        userId: { in: [localFixtureUsers.playerOne, localFixtureUsers.guestPlayer] },
        mode: 'standard_1v1',
        algorithmConfigVersion: 'standard_1v1_glicko_v1',
      },
    });
  });

  it('recognizes real Prisma metadata for the active-ticket partial unique index', async () => {
    const ticketData = (idempotencyKey: string) => ({
      userId: localFixtureUsers.playerOne,
      mode: 'standard_1v1' as const,
      rated: true,
      state: 'queued' as const,
      ratingAtQueue: 1_500,
      provisionalAtQueue: true,
      allowProvisionalOpponent: true,
      searchMinRating: 1_400,
      searchMaxRating: 1_600,
      expansionStep: 0,
      idempotencyKey,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await prisma.matchmakingTicket.create({ data: ticketData('14500000-0000-4000-8000-000000000010') });

    await assert.rejects(
      prisma.matchmakingTicket.create({ data: ticketData('14500000-0000-4000-8000-000000000011') }),
      (error: unknown) => isRecognizedMatchmakingTicketUniqueError(error),
    );
  });

  it('retries both first joins and creates exactly one shared non-self match', async () => {
    const [playerJoin, guestJoin] = await Promise.all([
      request(app.getHttpServer())
        .post('/matchmaking/standard-1v1/tickets')
        .set('x-wordle-dev-user-id', localFixtureUsers.playerOne)
        .send(joinBody(playerOneRequestId)),
      request(app.getHttpServer())
        .post('/matchmaking/standard-1v1/tickets')
        .set('x-wordle-dev-user-id', localFixtureUsers.guestPlayer)
        .send(joinBody(guestRequestId)),
    ]);

    assert.equal(playerJoin.status, 201, JSON.stringify(playerJoin.body));
    assert.equal(guestJoin.status, 201, JSON.stringify(guestJoin.body));

    const [playerCurrent, guestCurrent] = await Promise.all([
      request(app.getHttpServer())
        .get('/matchmaking/standard-1v1/tickets/current')
        .set('x-wordle-dev-user-id', localFixtureUsers.playerOne),
      request(app.getHttpServer())
        .get('/matchmaking/standard-1v1/tickets/current')
        .set('x-wordle-dev-user-id', localFixtureUsers.guestPlayer),
    ]);

    assert.equal(playerCurrent.status, 200, JSON.stringify(playerCurrent.body));
    assert.equal(guestCurrent.status, 200, JSON.stringify(guestCurrent.body));
    assert.equal(playerCurrent.body.data.state, 'matched');
    assert.equal(guestCurrent.body.data.state, 'matched');
    assert.ok(playerCurrent.body.data.matchedMatchId);
    assert.equal(playerCurrent.body.data.matchedMatchId, guestCurrent.body.data.matchedMatchId);

    const tickets = await prisma.matchmakingTicket.findMany({
      where: {
        userId: { in: [localFixtureUsers.playerOne, localFixtureUsers.guestPlayer] },
        mode: 'standard_1v1',
      },
    });
    const matches = await prisma.match.findMany({
      where: { id: playerCurrent.body.data.matchedMatchId, rankedMode: 'standard_1v1' },
      include: { participants: true },
    });

    assert.equal(tickets.length, 2);
    assert.equal(tickets.filter((ticket: any) => ticket.state === 'matched').length, 2);
    assert.equal(new Set(tickets.map((ticket: any) => ticket.userId)).size, 2);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].participants.length, 2);
    assert.equal(new Set(matches[0].participants.map((participant: any) => participant.userId)).size, 2);
    assert.deepEqual(
      new Set(matches[0].participants.map((participant: any) => participant.userId)),
      new Set([localFixtureUsers.playerOne, localFixtureUsers.guestPlayer]),
    );
  });

  it('pairs two six-second-delayed cold joins without duplicates or self-pairing', async () => {
    const prismaService = app.get(PrismaService);
    const dictionary = app.get(StandardDictionaryService);
    const delayedDictionary = {
      selectStandardDictionary: async (client: any, appEnv?: string, requiredReleaseId?: string) => {
        await client.$executeRawUnsafe('SELECT pg_sleep(6)');
        return await dictionary.selectStandardDictionary(client, appEnv, requiredReleaseId);
      },
    } as StandardDictionaryService;
    const delayedMatchmaking = new MatchmakingService(
      prismaService,
      new GameplayPersistenceService(prismaService),
      delayedDictionary,
    );
    const startedAt = Date.now();

    const [playerJoin, guestJoin] = await Promise.all([
      delayedMatchmaking.joinStandardQueue(localFixtureUsers.playerOne, joinBody('14500000-0000-4000-8000-000000000001')),
      delayedMatchmaking.joinStandardQueue(localFixtureUsers.guestPlayer, joinBody('14500000-0000-4000-8000-000000000002')),
    ]);

    assert.ok(Date.now() - startedAt >= 5_900);
    assert.ok(playerJoin.ticketId);
    assert.ok(guestJoin.ticketId);
    const tickets = await prisma.matchmakingTicket.findMany({
      where: { userId: { in: [localFixtureUsers.playerOne, localFixtureUsers.guestPlayer] }, mode: 'standard_1v1' },
    });
    const sharedMatchId = tickets[0]?.matchedMatchId;
    const matches = await prisma.match.findMany({
      where: { rankedMode: 'standard_1v1' },
      include: { participants: true },
    });
    assert.equal(tickets.length, 2);
    assert.equal(tickets.filter((ticket: any) => ticket.state === 'matched').length, 2);
    assert.ok(sharedMatchId);
    assert.ok(tickets.every((ticket: any) => ticket.matchedMatchId === sharedMatchId));
    assert.equal(matches.length, 1);
    assert.equal(matches[0].participants.length, 2);
    assert.equal(new Set(matches[0].participants.map((participant: any) => participant.userId)).size, 2);
    assert.deepEqual(
      new Set(matches[0].participants.map((participant: any) => participant.userId)),
      new Set([localFixtureUsers.playerOne, localFixtureUsers.guestPlayer]),
    );
  });
});
