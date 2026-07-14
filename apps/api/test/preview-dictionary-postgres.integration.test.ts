import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { PREVIEW_DICTIONARY_RELEASE_ID } from '../prisma/dictionary-fixture.ts';
import { StandardDictionaryService } from '../src/dictionary/standard-dictionary.service.ts';
import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';
import { ReadinessService } from '../src/health/readiness.service.ts';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';

const enabled = process.env.RUN_PREVIEW_DICTIONARY_POSTGRES_INTEGRATION === '1';
const playerOne = '13500000-0000-4000-8000-000000000001';
const playerTwo = '13500000-0000-4000-8000-000000000002';
const requestBody = (id: string) => ({
  clientRequestId: id,
  mode: 'standard_1v1' as const,
  rated: true as const,
  allowProvisionalOpponent: true,
});

function bootstrap(): any {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'prisma/bootstrap-preview-dictionary.ts', '--apply', '--json'],
    { cwd: new URL('..', import.meta.url), env: process.env, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  for (const word of ['crane', 'slate', 'adieu', 'xxxxx']) assert.doesNotMatch(result.stdout, new RegExp(`\\b${word}\\b`, 'i'));
  return JSON.parse(result.stdout);
}

function publicDictionaryError(error: unknown) {
  assert.ok(error instanceof ServiceUnavailableException);
  return error.getResponse() as { code: string; message: string };
}

describe('preview dictionary bootstrap and readiness on fresh PostgreSQL', { skip: !enabled }, () => {
  let prismaService: PrismaService;
  let prisma: any;
  let dictionary: StandardDictionaryService;
  let matchmaking: MatchmakingService;
  let readiness: ReadinessService;

  before(async () => {
    prismaService = new PrismaService();
    prisma = prismaService.client as any;
    dictionary = new StandardDictionaryService(prismaService);
    const gameplay = new GameplayPersistenceService(prismaService);
    matchmaking = new MatchmakingService(prismaService, gameplay, dictionary);
    readiness = new ReadinessService(
      prismaService,
      dictionary,
      { checkRedis: async () => ({ status: 'not_checked_stub', checkedAt: new Date().toISOString() }) } as any,
    );
    await prisma.userAccount.createMany({
      data: [
        { id: playerOne, displayName: 'Integration Player One', status: 'active' },
        { id: playerTwo, displayName: 'Integration Player Two', status: 'active' },
      ],
    });
  });

  after(async () => {
    await prismaService?.onModuleDestroy();
  });

  it('fails readiness and all first joins safely before bootstrap without writes', async () => {
    const beforeCounts = {
      ratings: await prisma.ratingProfile.count(),
      tickets: await prisma.matchmakingTicket.count(),
      matches: await prisma.match.count(),
      rounds: await prisma.matchRound.count(),
      participants: await prisma.matchParticipant.count(),
      audits: await prisma.auditLog.count(),
    };
    const ready = await readiness.getReadiness();
    assert.equal(ready.status, 'unavailable');
    assert.equal(ready.dependencies.standardDictionary?.status, 'unavailable');

    for (const requestId of [
      '13500000-0000-4000-8000-000000000009',
      '13500000-0000-4000-8000-000000000010',
    ]) {
      const error = await matchmaking.joinStandardQueue(playerOne, requestBody(requestId)).then(() => null, (failure) => failure);
      assert.deepEqual(publicDictionaryError(error), {
        code: 'dictionary_release_unavailable',
        message: 'No approved dictionary release is available for Standard matchmaking.',
      });
    }

    const attempts = await Promise.allSettled([
      matchmaking.joinStandardQueue(playerOne, requestBody('13500000-0000-4000-8000-000000000011')),
      matchmaking.joinStandardQueue(playerTwo, requestBody('13500000-0000-4000-8000-000000000012')),
    ]);
    for (const attempt of attempts) {
      assert.equal(attempt.status, 'rejected');
      const response = publicDictionaryError((attempt as PromiseRejectedResult).reason);
      assert.deepEqual(response, {
        code: 'dictionary_release_unavailable',
        message: 'No approved dictionary release is available for Standard matchmaking.',
      });
    }
    assert.deepEqual({
      ratings: await prisma.ratingProfile.count(),
      tickets: await prisma.matchmakingTicket.count(),
      matches: await prisma.match.count(),
      rounds: await prisma.matchRound.count(),
      participants: await prisma.matchParticipant.count(),
      audits: await prisma.auditLog.count(),
    }, beforeCounts);
  });

  it('bootstraps only the exact dictionary, is idempotent, and changes readiness to ok', async () => {
    const forbiddenBefore = {
      users: await prisma.userAccount.count(),
      profiles: await prisma.userProfile.count(),
      ratings: await prisma.ratingProfile.count(),
      lobbies: await prisma.lobby.count(),
      matches: await prisma.match.count(),
      tickets: await prisma.matchmakingTicket.count(),
      analytics: await prisma.analyticsEvent.count(),
      audits: await prisma.auditLog.count(),
    };
    const first = bootstrap();
    assert.equal(first.result, 'created');
    assert.equal(first.releaseId, PREVIEW_DICTIONARY_RELEASE_ID);
    assert.deepEqual(first.counts, { answer: 20, guess: 40, banned: 3, total: 63 });
    assert.equal(await prisma.dictionaryRelease.count(), 1);
    assert.equal(await prisma.dictionaryWord.count(), 63);
    assert.deepEqual({
      users: await prisma.userAccount.count(),
      profiles: await prisma.userProfile.count(),
      ratings: await prisma.ratingProfile.count(),
      lobbies: await prisma.lobby.count(),
      matches: await prisma.match.count(),
      tickets: await prisma.matchmakingTicket.count(),
      analytics: await prisma.analyticsEvent.count(),
      audits: await prisma.auditLog.count(),
    }, forbiddenBefore);

    const second = bootstrap();
    assert.equal(second.result, 'unchanged');
    assert.equal(await prisma.dictionaryRelease.count(), 1);
    assert.equal(await prisma.dictionaryWord.count(), 63);
    const ready = await readiness.getReadiness();
    assert.equal(ready.status, 'ok');
    assert.equal(ready.dependencies.standardDictionary?.status, 'ok');
  });

  it('rolls back a pairing if the selected release becomes ineligible, then creates one exact-release match', async () => {
    await matchmaking.joinStandardQueue(playerOne, requestBody('13500000-0000-4000-8000-000000000021'));
    const retiringDictionary = {
      selectStandardDictionary: async (client: any, appEnv?: string, requiredReleaseId?: string) => {
        if (requiredReleaseId) await client.dictionaryRelease.update({ where: { id: requiredReleaseId }, data: { status: 'retired' } });
        return await dictionary.selectStandardDictionary(client, appEnv, requiredReleaseId);
      },
    } as StandardDictionaryService;
    const retiringMatchmaker = new MatchmakingService(
      prismaService,
      new GameplayPersistenceService(prismaService),
      retiringDictionary,
    );

    const error = await retiringMatchmaker
      .joinStandardQueue(playerTwo, requestBody('13500000-0000-4000-8000-000000000022'))
      .then(() => null, (failure) => failure);
    assert.deepEqual(publicDictionaryError(error), {
      code: 'dictionary_release_unavailable',
      message: 'No approved dictionary release is available for Standard matchmaking.',
    });
    assert.equal(await prisma.matchmakingTicket.count(), 1);
    assert.equal(await prisma.match.count(), 0);
    assert.equal((await prisma.dictionaryRelease.findUnique({ where: { id: PREVIEW_DICTIONARY_RELEASE_ID } })).status, 'draft');

    await matchmaking.joinStandardQueue(playerTwo, requestBody('13500000-0000-4000-8000-000000000023'));
    const tickets = await prisma.matchmakingTicket.findMany({ where: { userId: { in: [playerOne, playerTwo] } } });
    const matches = await prisma.match.findMany({ include: { participants: true } });
    assert.equal(tickets.length, 2);
    assert.equal(tickets.filter((ticket: any) => ticket.state === 'matched').length, 2);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].dictionaryReleaseId, PREVIEW_DICTIONARY_RELEASE_ID);
    assert.equal(matches[0].participants.length, 2);
    assert.equal(new Set(matches[0].participants.map((participant: any) => participant.userId)).size, 2);
  });

  it('returns a sanitized timeout and rolls back real PostgreSQL writes when final dictionary revalidation exceeds budget', async () => {
    await prisma.auditLog.deleteMany();
    await prisma.matchRound.deleteMany();
    await prisma.matchParticipant.deleteMany();
    await prisma.matchmakingTicket.deleteMany();
    await prisma.match.deleteMany();
    await prisma.ratingProfile.deleteMany({
      where: { userId: { in: [playerOne, playerTwo] }, mode: 'standard_1v1' },
    });

    await matchmaking.joinStandardQueue(playerOne, requestBody('13500000-0000-4000-8000-000000000031'));
    const beforeCounts = {
      ratings: await prisma.ratingProfile.count(),
      tickets: await prisma.matchmakingTicket.count(),
      matches: await prisma.match.count(),
      rounds: await prisma.matchRound.count(),
      participants: await prisma.matchParticipant.count(),
      audits: await prisma.auditLog.count(),
    };
    assert.deepEqual(beforeCounts, { ratings: 1, tickets: 1, matches: 0, rounds: 0, participants: 0, audits: 1 });

    const delayedDictionary = {
      selectStandardDictionary: async (client: any, appEnv?: string, requiredReleaseId?: string) => {
        if (requiredReleaseId) await client.$executeRawUnsafe('SELECT pg_sleep(7)');
        return await dictionary.selectStandardDictionary(client, appEnv, requiredReleaseId);
      },
    } as StandardDictionaryService;
    const delayedMatchmaker = new MatchmakingService(
      prismaService,
      new GameplayPersistenceService(prismaService),
      delayedDictionary,
    );

    const error = await delayedMatchmaker
      .joinStandardQueue(playerTwo, requestBody('13500000-0000-4000-8000-000000000032'))
      .then(() => null, (failure) => failure);
    assert.ok(error instanceof ServiceUnavailableException);
    assert.deepEqual(error.getResponse(), {
      code: 'matchmaking_transaction_timeout',
      message: 'Matchmaking took too long to complete. Retry the request.',
    });
    assert.equal(JSON.stringify(error.getResponse()).includes('P2028'), false);
    assert.deepEqual({
      ratings: await prisma.ratingProfile.count(),
      tickets: await prisma.matchmakingTicket.count(),
      matches: await prisma.match.count(),
      rounds: await prisma.matchRound.count(),
      participants: await prisma.matchParticipant.count(),
      audits: await prisma.auditLog.count(),
    }, beforeCounts);
  });
});
