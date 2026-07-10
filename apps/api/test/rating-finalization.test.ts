import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';

const matchId = '11111111-1111-4111-8111-111111111111';
const participantOneId = '22222222-2222-4222-8222-222222222221';
const participantTwoId = '22222222-2222-4222-8222-222222222222';
const userOneId = '33333333-3333-4333-8333-333333333331';
const userTwoId = '33333333-3333-4333-8333-333333333332';

function createRatingPrismaMock() {
  const created: {
    match: any[];
    matchParticipant: any[];
    ratingProfile: any[];
    ratingEvent: any[];
    matchReport: any[];
  } = {
    match: [{ id: matchId, mode: 'ranked', status: 'active', algorithmConfigVersion: 'placement_mmr_v1', completedAt: null }],
    matchParticipant: [
      { id: participantOneId, matchId, userId: userOneId, seatNumber: 1, outcome: 'solved', placement: null, finalScore: 820 },
      { id: participantTwoId, matchId, userId: userTwoId, seatNumber: 2, outcome: 'failed', placement: null, finalScore: 120 },
    ],
    ratingProfile: [],
    ratingEvent: [],
    matchReport: [],
  };

  const client: any = {
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(client),
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
      findMany: async (args: any) => created.ratingEvent.filter((row) => {
        if (args.where.matchId && row.matchId !== args.where.matchId) return false;
        if (args.where.algorithmConfigVersion && row.algorithmConfigVersion !== args.where.algorithmConfigVersion) return false;
        if (args.where.type && row.type !== args.where.type) return false;
        return true;
      }),
      create: async (args: any) => {
        const row = { id: `55555555-5555-4555-8555-55555555555${created.ratingEvent.length + 1}`, createdAt: new Date('2026-06-29T00:00:00.000Z'), ...args.data };
        created.ratingEvent.push(row);
        return row;
      },
    },
    matchReport: {
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

    assert.deepEqual(second.ratingEvent, first.ratingEvent);
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
});
