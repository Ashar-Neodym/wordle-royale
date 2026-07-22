import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { localFixtureUsers } from '../src/auth/current-user.service.ts';
import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';

const enabled = process.env.RUN_SPEED_TIMING_POSTGRES_INTEGRATION === '1';
const suite = enabled ? describe : describe.skip;
const base = new Date('2026-07-16T12:00:00.000Z');
const at = (milliseconds: number) => new Date(base.getTime() + milliseconds);

suite('Ticket 177 deterministic PostgreSQL Speed ready lifecycle and timing proof', () => {
  const client = new PrismaClient();
  const prisma = { client } as unknown as PrismaService;
  const ratings = new GameplayPersistenceService(prisma);
  const operational = { assertAvailable: async () => {}, assertDependenciesAvailable: async () => {} } as any;
  const speed = new SpeedGameplayService(prisma, ratings, operational);
  let releaseId: string;
  let answer: string;
  let alternate: string;

  before(async () => {
    await client.$connect();
    await client.$executeRawUnsafe(`UPDATE "SpeedLifecycleActivation" SET "phase"='closing_to_v2', "activeCreationVersion"=NULL, "generation"=2, "targetReleaseId"='ticket-test-release', "expectedReplicaCount"=1, "transitionReason"='disposable_test_activation', "updatedAt"=clock_timestamp() WHERE "key"='speed_1v1'`);
    await client.$executeRawUnsafe(`UPDATE "SpeedLifecycleActivation" SET "phase"='v2_open', "activeCreationVersion"='speed_ready_v2_first_ack_90s', "generation"=3, "transitionReason"='disposable_test_activation', "updatedAt"=clock_timestamp() WHERE "key"='speed_1v1'`);
    await client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "SpeedTimingTestClock" ("id" integer PRIMARY KEY, "now" timestamptz NOT NULL)');
    await client.$executeRawUnsafe('INSERT INTO "SpeedTimingTestClock" ("id", "now") VALUES (1, $1) ON CONFLICT ("id") DO UPDATE SET "now" = EXCLUDED."now"', base);
    const release = await client.dictionaryRelease.findFirst({ orderBy: { version: 'desc' } });
    assert.ok(release);
    releaseId = release.id;
    const words = await client.dictionaryWord.findMany({ where: { dictionaryReleaseId: releaseId, kind: { in: ['answer', 'guess'] } }, orderBy: { normalizedWord: 'asc' } });
    const answerWord = words.find((word) => word.kind === 'answer');
    const alternateWord = words.find((word) => word.normalizedWord !== answerWord?.normalizedWord);
    assert.ok(answerWord && alternateWord);
    answer = answerWord.normalizedWord;
    alternate = alternateWord.normalizedWord;
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
    await setClock(base);
  });

  after(async () => {
    await client.$executeRawUnsafe('DROP TABLE IF EXISTS "SpeedTimingTestClock"');
    await client.$disconnect();
  });

  async function setClock(now: Date): Promise<void> {
    await client.$executeRawUnsafe('UPDATE "SpeedTimingTestClock" SET "now" = $1 WHERE "id" = 1', now);
  }

  async function createMatch(key: string) {
    await setClock(base);
    return await client.$transaction(async (tx) => await speed.createSpeedMatch({
      dictionaryReleaseId: releaseId,
      participantUserIds: [localFixtureUsers.playerOne, localFixtureUsers.guestPlayer],
      idempotencyKey: key,
      readyLifecycleVersion: 'speed_ready_v2_first_ack_90s',
      activationGeneration: 3n,
    }, tx));
  }

  async function revealMatch(key: string) {
    const match = await createMatch(key);
    await setClock(at(1_000));
    await speed.markReady(match.matchId, localFixtureUsers.playerOne, `${key}-ready-one`);
    await setClock(at(2_000));
    const snapshot = await speed.markReady(match.matchId, localFixtureUsers.guestPlayer, `${key}-ready-two`);
    assert.equal(snapshot.startsAt, at(5_000).toISOString());
    assert.equal(snapshot.deadlineAt, at(80_000).toISOString());
    return match;
  }

  async function solve(match: { matchId: string; roundId: string }, userId: string, now: Date, clientRequestId: string) {
    await setClock(now);
    return await speed.submitGuess({ matchId: match.matchId, roundId: match.roundId, userId, guess: answer, clientRequestId });
  }

  it('proves v2 invitation and ready-window exact boundaries using database-owned event times', async () => {
    const invitationBoundary = await createMatch('timing-invitation-boundary');
    const created = await client.match.findUnique({ where: { id: invitationBoundary.matchId } });
    assert.equal(created?.readyLifecycleVersion, 'speed_ready_v2_first_ack_90s');
    assert.equal(created?.invitationExpiresAt?.toISOString(), at(90_000).toISOString());
    assert.equal(created?.readyWindowStartedAt, null);
    assert.equal(created?.readyDeadlineAt, null);

    await setClock(at(90_000));
    const firstReady = await speed.markReady(invitationBoundary.matchId, localFixtureUsers.playerOne, 'timing-invitation-boundary-one');
    assert.equal(firstReady.state, 'waiting_opponent_ready');
    assert.equal(firstReady.readyLifecycleVersion, 'speed_ready_v2_first_ack_90s');
    assert.ok('readyWindowStartedAt' in firstReady);
    assert.equal(firstReady.readyWindowStartedAt, at(90_000).toISOString());
    assert.equal(firstReady.readyDeadlineAt, at(110_000).toISOString());

    await setClock(at(110_000));
    const secondReady = await speed.markReady(invitationBoundary.matchId, localFixtureUsers.guestPlayer, 'timing-invitation-boundary-two');
    assert.equal(secondReady.state, 'countdown');
    assert.equal(secondReady.startsAt, at(113_000).toISOString());
    assert.equal(secondReady.deadlineAt, at(188_000).toISOString());

    const invitationLate = await createMatch('timing-invitation-late');
    await setClock(at(90_001));
    await assert.rejects(
      speed.markReady(invitationLate.matchId, localFixtureUsers.playerOne, 'timing-invitation-late-one'),
      (error: any) => error?.response?.code === 'invitation_expired',
    );
    const expiredInvitation = await client.match.findUnique({ where: { id: invitationLate.matchId } });
    assert.equal(expiredInvitation?.status, 'voided');
    assert.equal(expiredInvitation?.completionReason, 'invitation_timeout');
    assert.equal(await client.ratingEvent.count({ where: { matchId: invitationLate.matchId, type: 'apply' } }), 0);

    const readyLate = await createMatch('timing-ready-late');
    await setClock(at(1_000));
    await speed.markReady(readyLate.matchId, localFixtureUsers.playerOne, 'timing-ready-late-one');
    await setClock(at(21_001));
    await assert.rejects(
      speed.markReady(readyLate.matchId, localFixtureUsers.guestPlayer, 'timing-ready-late-two'),
      (error: any) => error?.response?.code === 'ready_deadline_passed',
    );
    const expiredReady = await client.match.findUnique({ where: { id: readyLate.matchId } });
    assert.equal(expiredReady?.status, 'voided');
    assert.equal(expiredReady?.completionReason, 'ready_timeout');
    assert.equal(await client.ratingEvent.count({ where: { matchId: readyLate.matchId, type: 'apply' } }), 0);
  });

  it('preserves operation-first replay, first-ready timestamps, and hosted-shaped logical delay without wall-clock sleeping', async () => {
    const game = await createMatch('timing-hosted-delay');
    await setClock(at(18_000));
    const first = await speed.markReady(game.matchId, localFixtureUsers.playerOne, '17700000-0000-4000-8000-000000000001');
    assert.equal(first.readiness.viewerReadyOperationId, '17700000-0000-4000-8000-000000000001');
    assert.equal(first.readyDeadlineAt, at(38_000).toISOString());

    await setClock(at(37_000));
    const second = await speed.markReady(game.matchId, localFixtureUsers.guestPlayer, '17700000-0000-4000-8000-000000000002');
    assert.equal(second.state, 'countdown');
    assert.equal(second.startsAt, at(40_000).toISOString());

    const originalReadyAt = (await client.matchParticipant.findFirst({ where: { matchId: game.matchId, userId: localFixtureUsers.playerOne } }))?.readyAt;
    const differentId = await speed.markReady(game.matchId, localFixtureUsers.playerOne, '17700000-0000-4000-8000-000000000003');
    assert.equal(differentId.readiness.viewerReadyOperationId, '17700000-0000-4000-8000-000000000001');
    assert.equal((await client.matchParticipant.findFirst({ where: { matchId: game.matchId, userId: localFixtureUsers.playerOne } }))?.readyAt?.toISOString(), originalReadyAt?.toISOString());
    assert.equal(await client.matchMutationRequest.count({ where: { matchId: game.matchId, participant: { userId: localFixtureUsers.playerOne }, kind: 'speed_ready' } }), 1);

    const expiring = await createMatch('timing-replay-after-expiry');
    await setClock(at(1_000));
    await speed.markReady(expiring.matchId, localFixtureUsers.playerOne, '17700000-0000-4000-8000-000000000004');
    await setClock(at(21_001));
    const terminal = await speed.getSnapshot(expiring.matchId, localFixtureUsers.playerOne);
    assert.equal(terminal.state, 'voided');
    const replay = await speed.markReady(expiring.matchId, localFixtureUsers.playerOne, '17700000-0000-4000-8000-000000000004');
    assert.equal(replay.state, 'voided');
    assert.equal(replay.readiness.viewerReadyOperationId, '17700000-0000-4000-8000-000000000004');
  });

  it('preserves exact countdown and hard-deadline behavior', async () => {
    const game = await revealMatch('timing-round-boundaries');
    await setClock(at(4_999));
    const early = await speed.submitGuess({ matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.playerOne, guess: alternate, clientRequestId: '17000000-0000-4000-8000-000000000001' });
    assert.equal(early.accepted, false);
    if (!early.accepted) assert.equal(early.reason, 'round_not_active');

    await setClock(at(5_000));
    const atStart = await speed.submitGuess({ matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.playerOne, guess: alternate, clientRequestId: '17000000-0000-4000-8000-000000000002' });
    assert.equal(atStart.accepted, true);

    await setClock(at(80_000));
    const atDeadline = await speed.submitGuess({ matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.playerOne, guess: alternate, clientRequestId: '17000000-0000-4000-8000-000000000003' });
    assert.equal(atDeadline.accepted, true);
    const attemptsAtDeadline = await client.guessAttempt.count({ where: { matchId: game.matchId, participant: { userId: localFixtureUsers.playerOne } } });

    await setClock(at(80_001));
    const afterDeadline = await speed.submitGuess({ matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.playerOne, guess: answer, clientRequestId: '17000000-0000-4000-8000-000000000004' });
    assert.equal(afterDeadline.accepted, false);
    if (!afterDeadline.accepted) assert.equal(afterDeadline.reason, 'deadline_passed');
    assert.equal(await client.guessAttempt.count({ where: { matchId: game.matchId, participant: { userId: localFixtureUsers.playerOne } } }), attemptsAtDeadline);
  });

  it('serializes concurrent ready acknowledgements into one immutable reveal and deadline pair', async () => {
    const game = await createMatch('timing-concurrent-ready');
    await setClock(at(2_000));
    await Promise.all([
      speed.markReady(game.matchId, localFixtureUsers.playerOne, 'timing-concurrent-ready-one'),
      speed.markReady(game.matchId, localFixtureUsers.guestPlayer, 'timing-concurrent-ready-two'),
    ]);
    const persistedMatch = await client.match.findUnique({ where: { id: game.matchId } });
    const persistedRound = await client.matchRound.findUnique({ where: { id: game.roundId } });
    assert.equal(persistedMatch?.readyWindowStartedAt?.toISOString(), at(2_000).toISOString());
    assert.equal(persistedMatch?.readyDeadlineAt?.toISOString(), at(22_000).toISOString());
    assert.equal(persistedMatch?.startedAt?.toISOString(), at(5_000).toISOString());
    assert.equal(persistedRound?.startedAt?.toISOString(), at(5_000).toISOString());
    assert.equal(persistedRound?.deadlineAt?.toISOString(), at(80_000).toISOString());
    assert.equal(await client.matchMutationRequest.count({ where: { matchId: game.matchId, kind: 'speed_ready' } }), 2);

    await setClock(at(4_000));
    const reconnected = await speed.getSnapshot(game.matchId, localFixtureUsers.playerOne);
    assert.equal(reconnected.startsAt, persistedMatch?.startedAt?.toISOString());
    assert.equal(reconnected.deadlineAt, persistedRound?.deadlineAt?.toISOString());
  });

  it('keeps legacy null-version pending rows on their original fixed ready deadline without extension', async () => {
    const legacy = await createMatch('timing-legacy-v1');
    await client.match.update({
      where: { id: legacy.matchId },
      data: {
        readyLifecycleVersion: null,
        invitationExpiresAt: null,
        readyWindowStartedAt: null,
        readyDeadlineAt: at(20_000),
      },
    });
    await setClock(at(20_000));
    const boundary = await speed.getSnapshot(legacy.matchId, localFixtureUsers.playerOne);
    assert.equal(boundary.readyLifecycleVersion, 'speed_ready_v1_match_created_20s');
    assert.equal(boundary.state, 'waiting_ready');
    await setClock(at(20_001));
    const expired = await speed.getSnapshot(legacy.matchId, localFixtureUsers.playerOne);
    assert.equal(expired.state, 'voided');
    const persisted = await client.match.findUnique({ where: { id: legacy.matchId } });
    assert.equal(persisted?.completionReason, 'ready_timeout');
    assert.equal(persisted?.invitationExpiresAt, null);
    assert.equal(persisted?.readyDeadlineAt?.toISOString(), at(20_000).toISOString());
  });

  it('proves same-bucket ties and adjacent-bucket winners at the 100 ms edge', async () => {
    const tie = await revealMatch('timing-same-bucket');
    await solve(tie, localFixtureUsers.playerOne, at(10_050), '17000000-0000-4000-8000-000000000011');
    await solve(tie, localFixtureUsers.guestPlayer, at(10_099), '17000000-0000-4000-8000-000000000012');
    const tied = await client.matchParticipant.findMany({ where: { matchId: tie.matchId }, orderBy: { userId: 'asc' } });
    assert.deepEqual(tied.map((participant: any) => participant.solveElapsedMs).sort((left: number, right: number) => left - right), [5_050, 5_099]);
    assert.equal(tied.every((participant: any) => participant.result === 'draw' && participant.solveTimeBucket === 50), true);

    const winner = await revealMatch('timing-adjacent-bucket');
    await solve(winner, localFixtureUsers.playerOne, at(10_099), '17000000-0000-4000-8000-000000000021');
    await solve(winner, localFixtureUsers.guestPlayer, at(10_100), '17000000-0000-4000-8000-000000000022');
    const participants = await client.matchParticipant.findMany({ where: { matchId: winner.matchId } });
    const first = participants.find((participant) => participant.userId === localFixtureUsers.playerOne) as any;
    const second = participants.find((participant) => participant.userId === localFixtureUsers.guestPlayer) as any;
    assert.deepEqual([first.solveElapsedMs, first.solveTimeBucket, first.result], [5_099, 50, 'win']);
    assert.deepEqual([second.solveElapsedMs, second.solveTimeBucket, second.result], [5_100, 51, 'loss']);
  });

  it('proves fewer guesses beats a faster solve and client timestamps cannot alter DB-time outcomes', async () => {
    const game = await revealMatch('timing-guess-priority');
    await setClock(at(6_000));
    await speed.submitGuess({
      matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.guestPlayer,
      guess: alternate, clientRequestId: '17000000-0000-4000-8000-000000000031',
      clientSubmittedAt: '2099-01-01T00:00:00.000Z',
    });
    await setClock(at(7_000));
    await speed.submitGuess({
      matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.guestPlayer,
      guess: answer, clientRequestId: '17000000-0000-4000-8000-000000000032',
      clientSubmittedAt: '1900-01-01T00:00:00.000Z',
    });
    await setClock(at(10_000));
    await speed.submitGuess({
      matchId: game.matchId, roundId: game.roundId, userId: localFixtureUsers.playerOne,
      guess: answer, clientRequestId: '17000000-0000-4000-8000-000000000033',
      clientSubmittedAt: '1800-01-01T00:00:00.000Z',
    });
    const participants = await client.matchParticipant.findMany({ where: { matchId: game.matchId } });
    const fewer = participants.find((participant) => participant.userId === localFixtureUsers.playerOne) as any;
    const faster = participants.find((participant) => participant.userId === localFixtureUsers.guestPlayer) as any;
    assert.deepEqual([fewer.guessesUsed, fewer.solveElapsedMs, fewer.result], [1, 5_000, 'win']);
    assert.deepEqual([faster.guessesUsed, faster.solveElapsedMs, faster.result], [2, 2_000, 'loss']);
  });
});
