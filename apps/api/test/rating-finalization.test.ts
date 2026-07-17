import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';

const matchId = '11111111-1111-4111-8111-111111111111';
const participantOneId = '22222222-2222-4222-8222-222222222221';
const participantTwoId = '22222222-2222-4222-8222-222222222222';
const userOneId = '33333333-3333-4333-8333-333333333331';
const userTwoId = '33333333-3333-4333-8333-333333333332';

function createRatingPrismaMock(options: {
  algorithmConfigVersion?: string;
  rankedMode?: string | null;
  mode?: string;
  speedCompletionReason?: 'all_players_terminal' | 'deadline' | 'forfeit' | 'ready_timeout' | 'operator_void';
  status?: 'completed' | 'voided';
  reverseRatingEventReads?: boolean;
} = {}) {
  const speed = options.algorithmConfigVersion === 'speed_1v1_glicko_v1';
  const created: {
    match: any[];
    matchParticipant: any[];
    ratingProfile: any[];
    ratingEvent: any[];
    matchReport: any[];
  } = {
    match: [{
      id: matchId,
      mode: options.mode ?? 'ranked',
      rankedMode: options.rankedMode ?? null,
      status: speed ? options.status ?? 'completed' : 'active',
      algorithmConfigVersion: options.algorithmConfigVersion ?? 'placement_mmr_v1',
      rulesetVersion: speed ? 'speed_1v1_v1_75s' : null,
      adjudicationVersion: speed ? 'speed_1v1_adjudication_v1' : null,
      adjudicatedAt: speed ? new Date('2026-07-16T00:01:00.000Z') : null,
      completionReason: speed ? options.speedCompletionReason ?? 'all_players_terminal' : null,
      completedAt: speed ? new Date('2026-07-16T00:01:00.000Z') : null,
    }],
    matchParticipant: [
      { id: participantOneId, matchId, userId: userOneId, seatNumber: 1, outcome: 'solved', placement: null, finalScore: 820 },
      { id: participantTwoId, matchId, userId: userTwoId, seatNumber: 2, outcome: 'failed', placement: null, finalScore: 120 },
    ],
    ratingProfile: [],
    ratingEvent: [],
    matchReport: [],
  };

  let transactionTail = Promise.resolve();
  let nonEmptyRatingEventReadCount = 0;
  const client: any = {
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      const prior = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      try {
        return await callback(client);
      } finally {
        release();
      }
    },
    match: {
      findUnique: async (args: any) => created.match.find((row) => row.id === args.where.id) ?? null,
      update: async (args: any) => {
        const index = created.match.findIndex((row) => row.id === args.where.id);
        created.match[index] = { ...created.match[index], ...args.data };
        return created.match[index];
      },
    },
    matchParticipant: {
      findMany: async (args: any) => created.matchParticipant
        .filter((row) => row.matchId === args.where.matchId)
        .sort((a, b) => a.seatNumber - b.seatNumber),
      update: async (args: any) => {
        const index = created.matchParticipant.findIndex((row) => row.id === args.where.id);
        created.matchParticipant[index] = { ...created.matchParticipant[index], ...args.data };
        return created.matchParticipant[index];
      },
    },
    ratingProfile: {
      findUnique: async (args: any) => created.ratingProfile.find((row) => row.userId === args.where.userId_mode_algorithmConfigVersion.userId
        && row.mode === args.where.userId_mode_algorithmConfigVersion.mode
        && row.algorithmConfigVersion === args.where.userId_mode_algorithmConfigVersion.algorithmConfigVersion) ?? null,
      create: async (args: any) => {
        const row = { id: `44444444-4444-4444-8444-44444444444${created.ratingProfile.length + 1}`, status: 'active', wins: 0, losses: 0, draws: 0, abandons: 0, peakRating: args.data.rating, ratingDeviation: 350, ratingVolatility: null, lastRatedAt: null, ...args.data };
        created.ratingProfile.push(row);
        return row;
      },
      update: async (args: any) => {
        const index = created.ratingProfile.findIndex((row) => row.id === args.where.id);
        created.ratingProfile[index] = {
          ...created.ratingProfile[index],
          ...args.data,
          matchesPlayed: typeof args.data.matchesPlayed?.increment === 'number'
            ? created.ratingProfile[index].matchesPlayed + args.data.matchesPlayed.increment
            : args.data.matchesPlayed ?? created.ratingProfile[index].matchesPlayed,
          provisionalRemaining: typeof args.data.provisionalRemaining?.decrement === 'number'
            ? Math.max(0, created.ratingProfile[index].provisionalRemaining - args.data.provisionalRemaining.decrement)
            : args.data.provisionalRemaining ?? created.ratingProfile[index].provisionalRemaining,
          wins: created.ratingProfile[index].wins + (args.data.wins?.increment ?? 0),
          losses: created.ratingProfile[index].losses + (args.data.losses?.increment ?? 0),
          draws: created.ratingProfile[index].draws + (args.data.draws?.increment ?? 0),
          abandons: created.ratingProfile[index].abandons + (args.data.abandons?.increment ?? 0),
        };
        return created.ratingProfile[index];
      },
    },
    ratingEvent: {
      findMany: async (args: any) => {
        const rows = created.ratingEvent.filter((row) => {
          if (args.where.matchId && row.matchId !== args.where.matchId) return false;
          if (args.where.algorithmConfigVersion && row.algorithmConfigVersion !== args.where.algorithmConfigVersion) return false;
          if (args.where.type && row.type !== args.where.type) return false;
          return true;
        });
        if (rows.length > 0 && options.reverseRatingEventReads) {
          nonEmptyRatingEventReadCount += 1;
          return nonEmptyRatingEventReadCount % 2 === 0 ? [...rows].reverse() : rows;
        }
        return rows;
      },
      create: async (args: any) => {
        const row = { id: `55555555-5555-4555-8555-55555555555${created.ratingEvent.length + 1}`, createdAt: new Date('2026-06-29T00:00:00.000Z'), ...args.data };
        created.ratingEvent.push(row);
        return row;
      },
    },
    matchReport: {
      findUnique: async (args: any) => created.matchReport.find((row) => row.matchId === args.where.matchId) ?? null,
      upsert: async (args: any) => {
        const existingIndex = created.matchReport.findIndex((row) => row.matchId === args.where.matchId);
        if (existingIndex >= 0) {
          created.matchReport[existingIndex] = { ...created.matchReport[existingIndex], ...args.update };
          return created.matchReport[existingIndex];
        }
        const row = { id: '66666666-6666-4666-8666-666666666666', ...args.create };
        created.matchReport.push(row);
        return row;
      },
    },
  };

  return { client, created };
}

describe('GameplayPersistenceService rating finalization', () => {
  it('creates default-1500 mode-aware rating events, updates rating profiles, standings, and match report transactionally', async () => {
    const { client, created } = createRatingPrismaMock();
    const service = new GameplayPersistenceService({ client } as any);

    const result = await service.finalizeRankedMatchRatings({
      matchId,
      reason: 'all_players_final',
      now: new Date('2026-06-29T00:00:00.000Z'),
    });

    assert.equal(result.state, 'completed');
    assert.equal(result.ratingEvent?.kind, 'placement_mmr_v1');
    assert.equal(result.ratingEvent?.status, 'applied');
    assert.equal(result.ratingEvent?.idempotencyKey, `rating:${matchId}:placement_mmr_v1`);
    assert.deepEqual(result.ratingEvent?.participants.map((participant) => ({
      userId: participant.userId,
      before: participant.ratingBefore,
      after: participant.ratingAfter,
      delta: participant.ratingDelta,
      placement: participant.placement,
    })), [
      { userId: userOneId, before: 1500, after: 1516, delta: 16, placement: 1 },
      { userId: userTwoId, before: 1500, after: 1484, delta: -16, placement: 2 },
    ]);
    assert.deepEqual(created.ratingProfile.map((profile) => ({ userId: profile.userId, mode: profile.mode, rating: profile.rating, matchesPlayed: profile.matchesPlayed, wins: profile.wins, losses: profile.losses })), [
      { userId: userOneId, mode: 'standard_1v1', rating: 1516, matchesPlayed: 1, wins: 1, losses: 0 },
      { userId: userTwoId, mode: 'standard_1v1', rating: 1484, matchesPlayed: 1, wins: 0, losses: 1 },
    ]);
    assert.equal(created.ratingEvent.length, 2);
    assert.equal(created.ratingEvent[0].type, 'apply');
    assert.equal(created.ratingEvent[0].reversalOfEventId, null);
    assert.equal(created.ratingEvent[0].voidedByEventId, null);
    assert.equal(created.match[0].status, 'completed');
    assert.equal(created.matchReport.length, 1);
    assert.equal(created.matchReport[0].publicSummary.ratingEvent.idempotencyKey, `rating:${matchId}:placement_mmr_v1`);
  });

  it('is idempotent for an already-finalized match and does not apply rating deltas twice', async () => {
    const { client, created } = createRatingPrismaMock();
    const service = new GameplayPersistenceService({ client } as any);

    const first = await service.finalizeRankedMatchRatings({ matchId, reason: 'all_players_final', now: new Date('2026-06-29T00:00:00.000Z') });
    const second = await service.finalizeRankedMatchRatings({ matchId, reason: 'all_players_final', now: new Date('2026-06-29T00:05:00.000Z') });

    assert.deepEqual(second, first);
    assert.equal(created.ratingEvent.length, 2);
    assert.deepEqual(created.ratingProfile.map((profile) => ({ userId: profile.userId, rating: profile.rating, matchesPlayed: profile.matchesPlayed })), [
      { userId: userOneId, rating: 1516, matchesPlayed: 1 },
      { userId: userTwoId, rating: 1484, matchesPlayed: 1 },
    ]);
  });

  it('does not apply rating events for voided matches', async () => {
    const { client, created } = createRatingPrismaMock();
    created.match[0].status = 'voided';
    const service = new GameplayPersistenceService({ client } as any);

    const result = await service.finalizeRankedMatchRatings({ matchId, reason: 'voided', now: new Date('2026-06-29T00:00:00.000Z') });

    assert.equal(result.state, 'completed');
    assert.equal(result.ratingEvent, null);
    assert.equal(created.ratingEvent.length, 0);
    assert.equal(created.ratingProfile.length, 0);
    assert.equal(created.matchReport[0].publicSummary.ratingEvent, null);
  });

  it('settles standard_1v1 with Glicko-ready profile and event fields exactly once', async () => {
    const { client, created } = createRatingPrismaMock({
      algorithmConfigVersion: 'standard_1v1_glicko_v1',
      rankedMode: 'standard_1v1',
    });
    const service = new GameplayPersistenceService({ client } as any);

    const first = await service.finalizeRankedMatchRatings({ matchId, now: new Date('2026-07-10T00:00:00.000Z') });
    const replay = await service.finalizeRankedMatchRatings({ matchId, now: new Date('2026-07-10T00:01:00.000Z') });

    assert.equal(first.ratingEvent?.kind, 'standard_1v1_glicko_v1');
    assert.equal(first.ratingEvent?.algorithmVersion, 'standard_1v1_glicko_v1');
    assert.deepEqual(first.ratingEvent?.participants.map((participant) => participant.ratingDelta), [14, -14]);
    assert.ok((first.ratingEvent?.participants[0]?.ratingDeviationAfter ?? 999) < 350);
    assert.deepEqual(replay, first);
    assert.equal(created.ratingEvent.length, 2);
    assert.deepEqual(created.ratingProfile.map((profile) => ({
      mode: profile.mode,
      algorithm: profile.algorithm,
      rating: profile.rating,
      provisionalRemaining: profile.provisionalRemaining,
      wins: profile.wins,
      losses: profile.losses,
    })), [
      { mode: 'standard_1v1', algorithm: 'glicko_style_internal', rating: 1514, provisionalRemaining: 9, wins: 1, losses: 0 },
      { mode: 'standard_1v1', algorithm: 'glicko_style_internal', rating: 1486, provisionalRemaining: 9, wins: 0, losses: 1 },
    ]);
  });

  it('settles standard_1v1 draws and abandons from server-authoritative outcomes', async () => {
    const drawMock = createRatingPrismaMock({ algorithmConfigVersion: 'standard_1v1_glicko_v1', rankedMode: 'standard_1v1' });
    drawMock.created.matchParticipant[1].finalScore = drawMock.created.matchParticipant[0].finalScore;
    const drawService = new GameplayPersistenceService({ client: drawMock.client } as any);
    const draw = await drawService.finalizeRankedMatchRatings({ matchId });
    assert.deepEqual(draw.ratingEvent?.participants.map((participant) => participant.ratingDelta), [0, 0]);
    assert.deepEqual(drawMock.created.ratingProfile.map((profile) => profile.draws), [1, 1]);

    const abandonMock = createRatingPrismaMock({ algorithmConfigVersion: 'standard_1v1_glicko_v1', rankedMode: 'standard_1v1' });
    abandonMock.created.matchParticipant[0].outcome = 'abandoned';
    abandonMock.created.matchParticipant[0].finalScore = abandonMock.created.matchParticipant[1].finalScore;
    const abandonService = new GameplayPersistenceService({ client: abandonMock.client } as any);
    const abandon = await abandonService.finalizeRankedMatchRatings({ matchId, reason: 'abandoned' });
    assert.equal(abandon.finalStandings[0]?.userId, userTwoId);
    assert.deepEqual(abandonMock.created.ratingProfile.map((profile) => ({ userId: profile.userId, wins: profile.wins, losses: profile.losses, abandons: profile.abandons })), [
      { userId: userTwoId, wins: 1, losses: 0, abandons: 0 },
      { userId: userOneId, wins: 0, losses: 1, abandons: 1 },
    ]);
  });

  it('serializes concurrent standard_1v1 settlement attempts without duplicate events', async () => {
    const { client, created } = createRatingPrismaMock({ algorithmConfigVersion: 'standard_1v1_glicko_v1', rankedMode: 'standard_1v1' });
    const service = new GameplayPersistenceService({ client } as any);

    const [first, second] = await Promise.all([
      service.completeRankedMatch({ matchId, now: new Date('2026-07-10T00:00:00.000Z') }),
      service.completeRankedMatch({ matchId, now: new Date('2026-07-10T00:00:00.000Z') }),
    ]);

    assert.deepEqual(second, first);
    assert.equal(created.ratingEvent.length, 2);
    assert.deepEqual(created.ratingProfile.map((profile) => profile.matchesPlayed), [1, 1]);
  });

  it('settles speed_1v1 exactly once from persisted adjudication without using finalScore ordering', async () => {
    const { client, created } = createRatingPrismaMock({
      algorithmConfigVersion: 'speed_1v1_glicko_v1',
      rankedMode: 'speed_1v1',
    });
    Object.assign(created.matchParticipant[0], {
      result: 'loss', terminalReason: 'solved', guessesUsed: 4, solveTimeBucket: 241, finalScore: 9999,
    });
    Object.assign(created.matchParticipant[1], {
      result: 'win', terminalReason: 'solved', guessesUsed: 4, solveTimeBucket: 240, finalScore: 0,
    });
    const service = new GameplayPersistenceService({ client } as any);

    const first = await service.finalizeRankedMatchRatings({ matchId, now: new Date('2026-07-16T00:00:00.000Z') });
    const replay = await service.finalizeRankedMatchRatings({ matchId, now: new Date('2026-07-16T00:01:00.000Z') });

    assert.equal(first.ratingEvent?.kind, 'speed_1v1_glicko_v1');
    assert.equal(first.finalStandings[0]?.userId, userTwoId);
    assert.deepEqual(first.ratingEvent?.participants.map((participant) => participant.ratingDelta), [14, -14]);
    assert.deepEqual(replay, first);
    assert.equal(created.ratingEvent.length, 2);
    assert.deepEqual(created.ratingProfile.map((profile) => ({ userId: profile.userId, mode: profile.mode, version: profile.algorithmConfigVersion })), [
      { userId: userTwoId, mode: 'speed_1v1', version: 'speed_1v1_glicko_v1' },
      { userId: userOneId, mode: 'speed_1v1', version: 'speed_1v1_glicko_v1' },
    ]);
  });

  it('settles Speed draws and forfeits while skipping void/no-contest adjudications', async () => {
    const drawMock = createRatingPrismaMock({ algorithmConfigVersion: 'speed_1v1_glicko_v1', rankedMode: 'speed_1v1' });
    Object.assign(drawMock.created.matchParticipant[0], { result: 'draw', terminalReason: 'deadline_timeout', guessesUsed: null, solveTimeBucket: null });
    Object.assign(drawMock.created.matchParticipant[1], { result: 'draw', terminalReason: 'deadline_timeout', guessesUsed: null, solveTimeBucket: null });
    const draw = await new GameplayPersistenceService({ client: drawMock.client } as any).finalizeRankedMatchRatings({ matchId });
    assert.deepEqual(draw.ratingEvent?.participants.map((participant) => participant.ratingDelta), [0, 0]);
    assert.deepEqual(drawMock.created.ratingProfile.map((profile) => profile.draws), [1, 1]);

    const forfeitMock = createRatingPrismaMock({ algorithmConfigVersion: 'speed_1v1_glicko_v1', rankedMode: 'speed_1v1' });
    Object.assign(forfeitMock.created.matchParticipant[0], { result: 'loss', terminalReason: 'forfeit', guessesUsed: null, solveTimeBucket: null });
    Object.assign(forfeitMock.created.matchParticipant[1], { result: 'win', terminalReason: 'awarded_forfeit_win', guessesUsed: null, solveTimeBucket: null });
    await new GameplayPersistenceService({ client: forfeitMock.client } as any).finalizeRankedMatchRatings({ matchId, reason: 'forfeit' });
    assert.deepEqual(forfeitMock.created.ratingProfile.map((profile) => ({ userId: profile.userId, wins: profile.wins, losses: profile.losses, abandons: profile.abandons })), [
      { userId: userTwoId, wins: 1, losses: 0, abandons: 0 },
      { userId: userOneId, wins: 0, losses: 1, abandons: 1 },
    ]);

    const voidMock = createRatingPrismaMock({ algorithmConfigVersion: 'speed_1v1_glicko_v1', rankedMode: 'speed_1v1' });
    for (const participant of voidMock.created.matchParticipant) Object.assign(participant, { result: 'void', terminalReason: 'no_contest' });
    const noContest = await new GameplayPersistenceService({ client: voidMock.client } as any).finalizeRankedMatchRatings({ matchId });
    assert.equal(noContest.ratingEvent, null);
    assert.equal(voidMock.created.ratingEvent.length, 0);
    assert.equal(voidMock.created.ratingProfile.length, 0);
  });

  it('keeps persisted Speed forfeit, deadline, and no-contest completion identity immutable across result reads and stale-report repair', async () => {
    const cases = [
      { completionReason: 'forfeit' as const, status: 'completed' as const, result: ['loss', 'win'], terminal: ['forfeit', 'awarded_forfeit_win'], expectedEvents: 2 },
      { completionReason: 'deadline' as const, status: 'completed' as const, result: ['draw', 'draw'], terminal: ['deadline_timeout', 'deadline_timeout'], expectedEvents: 2 },
      { completionReason: 'ready_timeout' as const, status: 'voided' as const, result: ['void', 'void'], terminal: ['no_contest', 'no_contest'], expectedEvents: 0 },
    ];

    for (const scenario of cases) {
      const mock = createRatingPrismaMock({
        algorithmConfigVersion: 'speed_1v1_glicko_v1',
        rankedMode: 'speed_1v1',
        speedCompletionReason: scenario.completionReason,
        status: scenario.status,
        reverseRatingEventReads: true,
      });
      Object.assign(mock.created.matchParticipant[0], { result: scenario.result[0], terminalReason: scenario.terminal[0], guessesUsed: null, solveTimeBucket: null });
      Object.assign(mock.created.matchParticipant[1], { result: scenario.result[1], terminalReason: scenario.terminal[1], guessesUsed: null, solveTimeBucket: null });
      const service = new GameplayPersistenceService({ client: mock.client } as any);

      await service.finalizeRankedMatchRatings({ matchId, reason: scenario.status === 'voided' ? 'voided' : scenario.completionReason === 'deadline' ? 'timeout' : 'forfeit' });
      mock.created.matchReport[0].publicSummary = { ...mock.created.matchReport[0].publicSummary, completionReason: 'all_players_final' };

      const firstRead = await service.getRankedMatchResult(matchId);
      const persistedAfterFirstRead = structuredClone(mock.created.matchReport[0].publicSummary);
      const replay = await service.getRankedMatchResult(matchId);

      assert.equal(firstRead.completionReason, scenario.completionReason);
      assert.equal(firstRead.speedCompletionReason, scenario.completionReason);
      assert.equal(mock.created.match[0].completionReason, scenario.completionReason);
      assert.equal(mock.created.matchReport[0].publicSummary.completionReason, scenario.completionReason);
      assert.deepEqual(replay, firstRead);
      assert.deepEqual(mock.created.matchReport[0].publicSummary, persistedAfterFirstRead);
      assert.equal(mock.created.ratingEvent.length, scenario.expectedEvents);
    }
  });

  it('serializes concurrent Speed settlement attempts without duplicate events', async () => {
    const { client, created } = createRatingPrismaMock({ algorithmConfigVersion: 'speed_1v1_glicko_v1', rankedMode: 'speed_1v1' });
    Object.assign(created.matchParticipant[0], { result: 'win', terminalReason: 'solved', guessesUsed: 3, solveTimeBucket: 200 });
    Object.assign(created.matchParticipant[1], { result: 'loss', terminalReason: 'solved', guessesUsed: 4, solveTimeBucket: 180 });
    const service = new GameplayPersistenceService({ client } as any);

    const [first, replay] = await Promise.all([
      service.finalizeRankedMatchRatings({ matchId }),
      service.finalizeRankedMatchRatings({ matchId }),
    ]);
    assert.deepEqual(replay, first);
    assert.equal(created.ratingEvent.length, 2);
    assert.deepEqual(created.ratingProfile.map((profile) => profile.matchesPlayed), [1, 1]);
  });

  it('fails closed when Speed immutable ruleset or adjudication identity is missing', async () => {
    const { client, created } = createRatingPrismaMock({ algorithmConfigVersion: 'speed_1v1_glicko_v1', rankedMode: 'speed_1v1' });
    Object.assign(created.matchParticipant[0], { result: 'win', terminalReason: 'solved', guessesUsed: 3, solveTimeBucket: 200 });
    Object.assign(created.matchParticipant[1], { result: 'loss', terminalReason: 'deadline_timeout', guessesUsed: null, solveTimeBucket: null });
    created.match[0].rulesetVersion = 'wrong_ruleset';
    await assert.rejects(
      () => new GameplayPersistenceService({ client } as any).finalizeRankedMatchRatings({ matchId }),
      /completed authoritative Speed adjudication/,
    );
    assert.equal(created.ratingEvent.length, 0);

    created.match[0].rulesetVersion = 'speed_1v1_v1_75s';
    created.match[0].adjudicatedAt = null;
    await assert.rejects(
      () => new GameplayPersistenceService({ client } as any).finalizeRankedMatchRatings({ matchId }),
      /completed authoritative Speed adjudication/,
    );
    assert.equal(created.ratingEvent.length, 0);
  });

  it('does not rate unranked matches or mismatched Glicko-tagged matches', async () => {
    const unranked = createRatingPrismaMock({ mode: 'casual' });
    await assert.rejects(
      () => new GameplayPersistenceService({ client: unranked.client } as any).finalizeRankedMatchRatings({ matchId }),
      /Only ranked matches/,
    );
    assert.equal(unranked.created.ratingEvent.length, 0);

    const unsupported = createRatingPrismaMock({ algorithmConfigVersion: 'standard_1v1_glicko_v1', rankedMode: 'speed_1v1' });
    await assert.rejects(
      () => new GameplayPersistenceService({ client: unsupported.client } as any).finalizeRankedMatchRatings({ matchId }),
      /does not match ranked mode/,
    );
    assert.equal(unsupported.created.ratingEvent.length, 0);
  });
});
