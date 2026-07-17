import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { localFixtureUsers } from '../src/auth/current-user.service.ts';
import { StandardDictionaryService } from '../src/dictionary/standard-dictionary.service.ts';
import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';

const enabled = process.env.RUN_SPEED_POSTGRES_INTEGRATION === '1';
const suite = enabled ? describe : describe.skip;

suite('Ticket 158 PostgreSQL Speed queue and gameplay', () => {
  const client = new PrismaClient();
  const prisma = { client } as unknown as PrismaService;
  const ratings = new GameplayPersistenceService(prisma);
  const operational = { assertAvailable: async () => {} } as any;
  const speed = new SpeedGameplayService(prisma, ratings, operational);
  const dictionary = new StandardDictionaryService(prisma);
  const matchmaking = new MatchmakingService(prisma, ratings, dictionary, undefined, speed);

  before(async () => {
    await client.$connect();
  });

  beforeEach(async () => {
    await client.matchMutationRequest.deleteMany();
    await client.ratingEvent.deleteMany();
    await client.scoreBreakdown.deleteMany();
    await client.guessAttempt.deleteMany();
    await client.matchmakingTicket.deleteMany();
    await client.matchParticipant.deleteMany();
    await client.matchRound.deleteMany();
    await client.match.deleteMany();
    await client.auditLog.deleteMany();
    await client.ratingProfile.deleteMany({ where: { mode: 'speed_1v1' } });
  });

  after(async () => {
    await client.$disconnect();
  });

  const request = (clientRequestId: string) => ({ mode: 'speed_1v1' as const, rated: true, allowProvisionalOpponent: true, clientRequestId });

  async function dictionaryReleaseId(): Promise<string> {
    const release = await client.dictionaryRelease.findFirst({ orderBy: { version: 'desc' } });
    assert.ok(release);
    return release.id;
  }

  async function createMatch(key: string): Promise<{ matchId: string; roundId: string }> {
    const releaseId = await dictionaryReleaseId();
    return await client.$transaction(async (tx) => await speed.createSpeedMatch({
      dictionaryReleaseId: releaseId,
      participantUserIds: [localFixtureUsers.playerOne, localFixtureUsers.guestPlayer],
      idempotencyKey: key,
    }, tx));
  }

  async function revealMatch(key: string): Promise<{ matchId: string; roundId: string; answer: string }> {
    const created = await createMatch(key);
    await speed.markReady(created.matchId, localFixtureUsers.playerOne, `${key}-ready-one`);
    await speed.markReady(created.matchId, localFixtureUsers.guestPlayer, `${key}-ready-two`);
    const startedAt = new Date(Date.now() - 1_000);
    await client.match.update({ where: { id: created.matchId }, data: { startedAt, status: 'active' } });
    const round = await client.matchRound.update({ where: { id: created.roundId }, data: { startedAt, deadlineAt: new Date(startedAt.getTime() + 75_000) } });
    const answer = await client.dictionaryWord.findFirst({
      where: { dictionaryReleaseId: round.dictionaryReleaseId, kind: 'answer' },
      orderBy: { normalizedWord: 'asc' },
    });
    assert.ok(answer);
    return { ...created, answer: answer.normalizedWord };
  }

  it('pairs only Speed tickets, creates one pending shared puzzle, and rejects cross-mode activity', async () => {
    const first = await matchmaking.joinSpeedQueueWithResult(localFixtureUsers.playerOne, request('speed-queue-one'));
    assert.equal(first.ticket.state, 'queued');
    const second = await matchmaking.joinSpeedQueueWithResult(localFixtureUsers.guestPlayer, request('speed-queue-two'));
    assert.equal(second.ticket.state, 'matched');
    const current = await matchmaking.getCurrentSpeedTicket(localFixtureUsers.playerOne);
    assert.equal(current?.state, 'matched');
    assert.equal(current?.matchedMatchId, second.ticket.matchedMatchId);

    const match = await client.match.findUnique({ where: { id: second.ticket.matchedMatchId! }, include: { rounds: true, participants: true } });
    assert.equal(match?.rankedMode, 'speed_1v1');
    assert.equal(match?.status, 'pending');
    assert.equal(match?.rulesetVersion, 'speed_1v1_v1_75s');
    assert.equal(match?.rounds[0]?.startedAt, null);
    assert.equal(match?.participants.length, 2);

    await assert.rejects(
      matchmaking.joinStandardQueue(localFixtureUsers.playerOne, { mode: 'standard_1v1', rated: true, allowProvisionalOpponent: true, clientRequestId: 'cross-mode' }),
      (error: any) => error?.response?.code === 'ranked_activity_conflict',
    );
  });

  it('uses one shared readiness countdown, durable idempotency, DB-clock guess ordering, and spoiler-safe snapshots', async () => {
    const game = await revealMatch('speed-gameplay');
    const alternate = await client.dictionaryWord.findFirst({
      where: { dictionaryReleaseId: (await client.matchRound.findUnique({ where: { id: game.roundId } }))!.dictionaryReleaseId, normalizedWord: { not: game.answer }, kind: { in: ['answer', 'guess'] } },
      orderBy: { normalizedWord: 'asc' },
    });
    assert.ok(alternate);
    const accepted = await speed.submitGuess({
      matchId: game.matchId,
      roundId: game.roundId,
      userId: localFixtureUsers.playerOne,
      guess: alternate.normalizedWord,
      clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      clientSubmittedAt: '2000-01-01T00:00:00.000Z',
    });
    assert.equal(accepted.accepted, true);
    const replay = await speed.submitGuess({
      matchId: game.matchId,
      roundId: game.roundId,
      userId: localFixtureUsers.playerOne,
      guess: alternate.normalizedWord,
      clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    });
    assert.deepEqual(replay, accepted);
    const repeated = await speed.submitGuess({
      matchId: game.matchId,
      roundId: game.roundId,
      userId: localFixtureUsers.playerOne,
      guess: alternate.normalizedWord,
      clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    });
    assert.equal(repeated.accepted, true);
    const solved = await speed.submitGuess({
      matchId: game.matchId,
      roundId: game.roundId,
      userId: localFixtureUsers.playerOne,
      guess: game.answer,
      clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    });
    assert.equal(solved.accepted, true);
    const viewerSnapshot = await speed.getSnapshot(game.matchId, localFixtureUsers.playerOne);
    assert.deepEqual(viewerSnapshot.myState.acceptedGuesses.map((guess) => [guess.guess, guess.clientRequestId]), [
      [alternate.normalizedWord, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'],
      [alternate.normalizedWord, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'],
      [game.answer, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'],
    ]);
    const reconnectedSpeed = new SpeedGameplayService(prisma, ratings, operational);
    const reconnectedSnapshot = await reconnectedSpeed.getSnapshot(game.matchId, localFixtureUsers.playerOne);
    assert.deepEqual(reconnectedSnapshot.myState.acceptedGuesses.map((guess) => guess.clientRequestId), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    ]);
    await assert.rejects(
      speed.submitGuess({ matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.playerOne, guess: 'zzzzz', clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' }),
      (error: any) => error?.response?.code === 'idempotency_key_conflict',
    );

    const opponentSnapshot = await speed.getSnapshot(game.matchId, localFixtureUsers.guestPlayer);
    assert.equal(opponentSnapshot.opponentProgress.acceptedGuessCount, 3);
    assert.equal(opponentSnapshot.opponentProgress.terminal, true);
    assert.equal(JSON.stringify(opponentSnapshot).includes(game.answer), false);
    assert.equal(opponentSnapshot.myState.acceptedGuesses.length, 0);
  });

  it('serializes simultaneous final guesses into exactly one terminal adjudication', async () => {
    const game = await revealMatch('speed-concurrent-final');
    const [first, second] = await Promise.all([
      speed.submitGuess({ matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.playerOne, guess: game.answer, clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' }),
      speed.submitGuess({ matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.guestPlayer, guess: game.answer, clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' }),
    ]);
    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    const match = await client.match.findUnique({ where: { id: game.matchId }, include: { participants: true } });
    assert.equal(match?.status, 'completed');
    assert.ok(match?.adjudicatedAt);
    assert.equal(match?.participants.filter((participant) => participant.result !== null).length, 2);
    assert.equal(await client.matchMutationRequest.count({ where: { matchId: game.matchId, kind: 'speed_guess' } }), 2);
    assert.equal(await client.ratingEvent.count({ where: { matchId: game.matchId, algorithmConfigVersion: 'speed_1v1_glicko_v1', type: 'apply' } }), 2);
    const result = await ratings.getRankedMatchResult(game.matchId);
    assert.equal(result.rankedMode, 'speed_1v1');
    assert.equal(result.rulesetVersion, 'speed_1v1_v1_75s');
    assert.equal(result.ratingAlgorithmConfigVersion, 'speed_1v1_glicko_v1');
    const standingResults = result.finalStandings.map((standing) => standing.result).sort();
    assert.equal(
      JSON.stringify(standingResults) === JSON.stringify(['draw', 'draw'])
        || JSON.stringify(standingResults) === JSON.stringify(['loss', 'win']),
      true,
      'concurrent server receipts must resolve to either a same-bucket draw or one deterministic bucket winner',
    );
  });

  it('reconciles ready timeout to no-contest and post-reveal forfeit to a rated loss', async () => {
    const waiting = await createMatch('speed-ready-timeout');
    await client.match.update({ where: { id: waiting.matchId }, data: { readyDeadlineAt: new Date(Date.now() - 1_000) } });
    const voided = await speed.getSnapshot(waiting.matchId, localFixtureUsers.playerOne);
    assert.equal(voided.state, 'voided');
    assert.equal(voided.myState.result, 'void');
    assert.equal(await client.ratingEvent.count({ where: { matchId: waiting.matchId, type: 'apply' } }), 0);

    const game = await revealMatch('speed-forfeit');
    const forfeited = await speed.forfeit(game.matchId, localFixtureUsers.playerOne, 'forfeit-one');
    assert.equal(forfeited.state, 'completed');
    assert.equal(forfeited.myState.result, 'loss');
    assert.equal(await client.ratingEvent.count({ where: { matchId: game.matchId, algorithmConfigVersion: 'speed_1v1_glicko_v1', type: 'apply' } }), 2);
    const opponent = await speed.getSnapshot(game.matchId, localFixtureUsers.guestPlayer);
    assert.equal(opponent.myState.result, 'win');
  });

  it('rejects after the hard deadline without consuming an attempt and reconciles terminal rows', async () => {
    const game = await revealMatch('speed-deadline');
    const expiredStart = new Date(Date.now() - 76_000);
    await client.match.update({ where: { id: game.matchId }, data: { startedAt: expiredStart } });
    await client.matchRound.update({ where: { id: game.roundId }, data: { startedAt: expiredStart, deadlineAt: new Date(expiredStart.getTime() + 75_000) } });
    const result = await speed.submitGuess({
      matchId: game.matchId,
      roundId: game.roundId,
      userId: localFixtureUsers.playerOne,
      guess: game.answer,
      clientRequestId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    });
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.reason, 'deadline_passed');
    assert.equal(await client.guessAttempt.count({ where: { matchId: game.matchId } }), 0);
    const match = await client.match.findUnique({ where: { id: game.matchId }, include: { participants: true } });
    assert.equal(match?.status, 'completed');
    assert.equal(match?.participants.every((participant) => participant.terminalReason === 'deadline_timeout'), true);
    assert.equal(await client.ratingEvent.count({ where: { matchId: game.matchId, algorithmConfigVersion: 'speed_1v1_glicko_v1', type: 'apply' } }), 2);
  });
});
