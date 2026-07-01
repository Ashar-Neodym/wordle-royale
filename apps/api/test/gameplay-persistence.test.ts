import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';

const dictionaryReleaseId = 'dict_fixture';
const matchId = 'match_ranked_1';
const roundId = 'round_ranked_1';
const participantOneId = 'participant_user_1';

function createGameplayPrismaMock() {
  const created: {
    match: any[];
    matchRound: any[];
    matchParticipant: any[];
    guessAttempt: any[];
    scoreBreakdown: any[];
  } = {
    match: [],
    matchRound: [],
    matchParticipant: [],
    guessAttempt: [],
    scoreBreakdown: [],
  };

  const dictionaryWords = [
    { id: 'answer_crane', dictionaryReleaseId, normalizedWord: 'crane', kind: 'answer' },
    { id: 'guess_crane', dictionaryReleaseId, normalizedWord: 'crane', kind: 'guess' },
    { id: 'guess_slate', dictionaryReleaseId, normalizedWord: 'slate', kind: 'guess' },
    { id: 'banned_xxxxx', dictionaryReleaseId, normalizedWord: 'xxxxx', kind: 'banned' },
  ];

  const client = {
    dictionaryWord: {
      findMany: async (args: any) => dictionaryWords.filter((word) => {
        if (word.dictionaryReleaseId !== args.where.dictionaryReleaseId) return false;
        if (args.where.kind?.in) return args.where.kind.in.includes(word.kind);
        return word.kind === args.where.kind;
      }),
    },
    match: {
      create: async (args: any) => {
        const row = { id: matchId, createdAt: new Date('2026-06-24T00:00:00.000Z'), updatedAt: new Date('2026-06-24T00:00:00.000Z'), ...args.data };
        created.match.push(row);
        return row;
      },
      findUnique: async () => created.match[0] ?? null,
      update: async (args: any) => {
        const row = { ...created.match[0], ...args.data };
        created.match[0] = row;
        return row;
      },
    },
    matchRound: {
      create: async (args: any) => {
        const row = { id: roundId, createdAt: new Date('2026-06-24T00:00:00.000Z'), ...args.data };
        created.matchRound.push(row);
        return row;
      },
      findUnique: async () => created.matchRound[0] ?? null,
      update: async (args: any) => {
        const row = { ...created.matchRound[0], ...args.data };
        created.matchRound[0] = row;
        return row;
      },
    },
    matchParticipant: {
      createMany: async (args: any) => {
        created.matchParticipant.push(...args.data.map((row: any, index: number) => ({ id: index === 0 ? participantOneId : `participant_user_${index + 1}`, ...row })));
        return { count: args.data.length };
      },
      findUnique: async (args: any) => created.matchParticipant.find((row) => row.id === args.where.id) ?? null,
      findMany: async (args: any) => created.matchParticipant.filter((row) => row.matchId === args.where.matchId),
      update: async (args: any) => {
        const index = created.matchParticipant.findIndex((row) => row.id === args.where.id);
        const row = { ...created.matchParticipant[index], ...args.data };
        created.matchParticipant[index] = row;
        return row;
      },
    },
    guessAttempt: {
      count: async (args: any) => created.guessAttempt.filter((row) => row.roundId === args.where.roundId && row.participantId === args.where.participantId).length,
      create: async (args: any) => {
        const row = { id: `guess_${created.guessAttempt.length + 1}`, submittedAt: new Date('2026-06-24T00:00:03.000Z'), ...args.data };
        created.guessAttempt.push(row);
        return row;
      },
    },
    scoreBreakdown: {
      create: async (args: any) => {
        const row = { id: `score_${created.scoreBreakdown.length + 1}`, createdAt: new Date('2026-06-24T00:00:03.000Z'), ...args.data };
        created.scoreBreakdown.push(row);
        return row;
      },
    },
  };

  return { client, created };
}

describe('GameplayPersistenceService', () => {
  it('starts a ranked match with hashed answer authority and no plaintext answer on the round', async () => {
    const { client, created } = createGameplayPrismaMock();
    const service = new GameplayPersistenceService({ client } as any);

    const result = await service.startRankedMatch({
      dictionaryReleaseId,
      participantUserIds: ['user_1', 'user_2'],
      idempotencyKey: 'ranked-match-key-1',
      now: new Date('2026-06-24T00:00:00.000Z'),
    });

    assert.equal(result.matchId, matchId);
    assert.equal(result.roundId, roundId);
    assert.equal(created.match[0].mode, 'ranked');
    assert.equal(created.match[0].status, 'active');
    assert.equal(created.matchParticipant.length, 2);
    assert.equal(created.matchRound[0].answerWordSaltRef, 'fixture-local-v1');
    assert.equal(typeof created.matchRound[0].answerWordHash, 'string');
    assert.doesNotMatch(JSON.stringify(created.matchRound[0]), /crane/i);
  });

  it('rejects banned guesses without consuming an attempt or leaking feedback', async () => {
    const { client, created } = createGameplayPrismaMock();
    const service = new GameplayPersistenceService({ client } as any);
    await service.startRankedMatch({ dictionaryReleaseId, participantUserIds: ['user_1', 'user_2'], idempotencyKey: 'ranked-match-key-1' });

    const result = await service.submitGuess({
      matchId,
      roundId,
      participantId: participantOneId,
      guess: 'xxxxx',
      clientRequestId: '66666666-6666-4666-8666-666666666666',
      now: new Date('2026-06-24T00:00:03.000Z'),
    });

    assert.equal(result.accepted, false);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'banned_word');
    assert.equal(result.attemptConsumed, false);
    assert.equal(created.guessAttempt.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /crane/i);
  });



  it('naturally completes the round and match after all participants fail by max attempts', async () => {
    const { client, created } = createGameplayPrismaMock();
    const service = new GameplayPersistenceService({ client } as any);
    await service.startRankedMatch({ dictionaryReleaseId, participantUserIds: ['user_1', 'user_2'], idempotencyKey: 'ranked-match-key-1', now: new Date('2026-06-24T00:00:00.000Z') });

    let firstResult: any;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      firstResult = await service.submitGuess({
        matchId,
        roundId,
        participantId: participantOneId,
        guess: 'slate',
        clientRequestId: `88888888-8888-4888-8888-00000000000${attempt}`,
        now: new Date(`2026-06-24T00:00:0${attempt}.000Z`),
      });
    }

    assert.equal(firstResult.accepted, true);
    assert.equal(firstResult.playerRoundState, 'failed');
    assert.equal(firstResult.roundState, 'active');
    assert.equal(created.matchParticipant[0].outcome, 'failed');
    assert.equal(created.match[0].status, 'active');

    let secondResult: any;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      secondResult = await service.submitGuess({
        matchId,
        roundId,
        participantId: 'participant_user_2',
        guess: 'slate',
        clientRequestId: `99999999-9999-4999-9999-00000000000${attempt}`,
        now: new Date(`2026-06-24T00:00:1${attempt}.000Z`),
      });
    }

    assert.equal(secondResult.accepted, true);
    assert.equal(secondResult.playerRoundState, 'failed');
    assert.equal(secondResult.roundState, 'completed');
    assert.equal(created.matchParticipant[1].outcome, 'failed');
    assert.equal(created.matchRound[0].completedAt.toISOString(), '2026-06-24T00:00:16.000Z');
    assert.equal(created.match[0].status, 'completed');
    assert.equal(created.match[0].completedAt.toISOString(), '2026-06-24T00:00:16.000Z');
  });

  it('accepts a solved guess, persists feedback and score server-side, and completes participant and round state', async () => {
    const { client, created } = createGameplayPrismaMock();
    const service = new GameplayPersistenceService({ client } as any);
    await service.startRankedMatch({ dictionaryReleaseId, participantUserIds: ['user_1', 'user_2'], idempotencyKey: 'ranked-match-key-1', now: new Date('2026-06-24T00:00:00.000Z') });

    const result = await service.submitGuess({
      matchId,
      roundId,
      participantId: participantOneId,
      guess: 'crane',
      clientRequestId: '77777777-7777-4777-8777-777777777777',
      now: new Date('2026-06-24T00:00:03.000Z'),
    });

    assert.equal(result.accepted, true);
    assert.equal(result.guessNumber, 1);
    assert.equal(result.playerRoundState, 'solved');
    assert.equal(result.roundState, 'completed');
    assert.ok(result.score > 0);
    assert.deepEqual(result.feedback.map((cell) => cell.state), ['correct', 'correct', 'correct', 'correct', 'correct']);
    assert.equal(created.guessAttempt.length, 1);
    assert.equal(created.guessAttempt[0].normalizedGuess, 'crane');
    assert.equal(created.scoreBreakdown.length, 1);
    assert.equal(created.matchParticipant[0].outcome, 'solved');
    assert.equal(created.matchRound[0].completedAt.toISOString(), '2026-06-24T00:00:03.000Z');
  });
});
