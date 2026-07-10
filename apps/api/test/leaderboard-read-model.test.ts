import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LeaderboardReadService } from '../src/leaderboard/leaderboard-read.service.ts';

const algorithmConfigVersion = 'placement_mmr_v1';

function createLeaderboardPrismaMock() {
  const users = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      displayName: 'Zara Solver',
      profile: { publicHandle: 'zara' },
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      displayName: 'Ada Letters',
      profile: { publicHandle: 'ada' },
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      displayName: 'No Handle',
      profile: null,
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      displayName: 'Unrated Local',
      profile: { publicHandle: 'unrated' },
    },
  ];

  const ratingProfiles = [
    {
      id: 'rating_1_standard',
      userId: users[0]!.id,
      mode: 'standard_1v1',
      rating: 1400,
      matchesPlayed: 12,
      provisionalRemaining: 0,
      wins: 7,
      losses: 4,
      draws: 1,
      abandons: 0,
      peakRating: 1450,
      ratingDeviation: 80,
      ratingVolatility: null,
      lastRatedAt: new Date('2026-07-01T00:00:00.000Z'),
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      status: 'active',
      user: users[0]!,
    },
    {
      id: 'rating_2_standard',
      userId: users[1]!.id,
      mode: 'standard_1v1',
      rating: 1500,
      matchesPlayed: 2,
      provisionalRemaining: 8,
      wins: 2,
      losses: 0,
      draws: 0,
      abandons: 0,
      peakRating: 1510,
      ratingDeviation: 320,
      ratingVolatility: null,
      lastRatedAt: new Date('2026-07-02T00:00:00.000Z'),
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      status: 'active',
      user: users[1]!,
    },
    {
      id: 'rating_3_standard',
      userId: users[2]!.id,
      mode: 'standard_1v1',
      rating: 1500,
      matchesPlayed: 7,
      provisionalRemaining: 3,
      wins: 4,
      losses: 2,
      draws: 1,
      abandons: 0,
      peakRating: 1530,
      ratingDeviation: 180,
      ratingVolatility: null,
      lastRatedAt: null,
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      status: 'active',
      user: users[2]!,
    },
    {
      id: 'rating_2_speed',
      userId: users[1]!.id,
      mode: 'speed_1v1',
      rating: 1625,
      matchesPlayed: 11,
      provisionalRemaining: 0,
      wins: 8,
      losses: 3,
      draws: 0,
      abandons: 0,
      peakRating: 1650,
      ratingDeviation: 75,
      ratingVolatility: null,
      lastRatedAt: new Date('2026-07-03T00:00:00.000Z'),
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      status: 'active',
      user: users[1]!,
    },
  ];

  const client = {
    ratingProfile: {
      findMany: async (args: any) => ratingProfiles.filter((profile) => {
        if (args.where.userId && profile.userId !== args.where.userId) return false;
        if (args.where.mode && profile.mode !== args.where.mode) return false;
        return profile.algorithmConfigVersion === args.where.algorithmConfigVersion
          && profile.status === args.where.status;
      }),
      findUnique: async (args: any) => ratingProfiles.find((profile) => profile.userId === args.where.userId_mode_algorithmConfigVersion.userId
        && profile.mode === args.where.userId_mode_algorithmConfigVersion.mode
        && profile.algorithmConfigVersion === args.where.userId_mode_algorithmConfigVersion.algorithmConfigVersion) ?? null,
    },
    userProfile: {
      findUnique: async (args: any) => {
        const user = users.find((row) => row.profile?.publicHandle === args.where.publicHandle);
        return user?.profile ? { ...user.profile, user } : null;
      },
    },
  };

  return { client };
}

describe('LeaderboardReadService', () => {
  it('returns deterministic standard leaderboard rows sorted by rating, matches played, then identity', async () => {
    const service = new LeaderboardReadService({ client: createLeaderboardPrismaMock().client } as any);

    const result = await service.listLeaderboard({ limit: 10 });

    assert.equal(result.mode, 'standard_1v1');
    assert.equal(result.algorithmConfigVersion, algorithmConfigVersion);
    assert.deepEqual(result.entries.map((entry) => ({ rank: entry.rank, handle: entry.handle, mode: entry.mode, rating: entry.rating, matchesPlayed: entry.matchesPlayed, provisional: entry.provisional })), [
      { rank: 1, handle: null, mode: 'standard_1v1', rating: 1500, matchesPlayed: 7, provisional: true },
      { rank: 2, handle: 'ada', mode: 'standard_1v1', rating: 1500, matchesPlayed: 2, provisional: true },
      { rank: 3, handle: 'zara', mode: 'standard_1v1', rating: 1400, matchesPlayed: 12, provisional: false },
    ]);
    assert.equal(result.entries[0]!.wins, 4);
    assert.equal(result.entries[0]!.ratingDeviation, 180);
    assert.equal(result.entries.some((entry) => entry.displayName === 'Unrated Local'), false);
  });

  it('keeps mode ladders separate for leaderboard and profile reads', async () => {
    const service = new LeaderboardReadService({ client: createLeaderboardPrismaMock().client } as any);

    const speedLeaderboard = await service.listLeaderboard({ mode: 'speed_1v1', limit: 10 });
    assert.equal(speedLeaderboard.mode, 'speed_1v1');
    assert.deepEqual(speedLeaderboard.entries.map((entry) => ({ handle: entry.handle, rating: entry.rating, mode: entry.mode })), [
      { handle: 'ada', rating: 1625, mode: 'speed_1v1' },
    ]);

    const standard = await service.getRatedProfileByHandle('ada', { mode: 'standard_1v1' });
    const speed = await service.getRatedProfileByHandle('ada', { mode: 'speed_1v1' });
    assert.equal(standard.rating, 1500);
    assert.equal(speed.rating, 1625);
    assert.equal(speed.wins, 8);
    assert.equal(speed.peakRating, 1650);
  });

  it('returns all mode rating profiles with unrated defaults for missing modes', async () => {
    const service = new LeaderboardReadService({ client: createLeaderboardPrismaMock().client } as any);

    const ratings = await service.listProfileRatingsByHandle('ada');

    assert.deepEqual(ratings.ratings.map((rating) => rating.mode), ['standard_1v1', 'speed_1v1', 'classic_1v1', 'multiplayer_lobby']);
    assert.equal(ratings.ratings.find((rating) => rating.mode === 'classic_1v1')?.rating, 1500);
    assert.equal(ratings.ratings.find((rating) => rating.mode === 'classic_1v1')?.unrated, true);
    assert.equal(ratings.ratings.find((rating) => rating.mode === 'speed_1v1')?.unrated, false);
  });

  it('returns default unrated profile data for a known handle without a standard profile', async () => {
    const service = new LeaderboardReadService({ client: createLeaderboardPrismaMock().client } as any);

    const profile = await service.getRatedProfileByHandle('unrated');

    assert.equal(profile.handle, 'unrated');
    assert.equal(profile.displayName, 'Unrated Local');
    assert.equal(profile.mode, 'standard_1v1');
    assert.equal(profile.rating, 1500);
    assert.equal(profile.matchesPlayed, 0);
    assert.equal(profile.provisional, true);
    assert.equal(profile.ratingDeviation, 350);
    assert.equal(profile.unrated, true);
  });

  it('describes ranked modes without implying live multiplayer matchmaking is enabled', () => {
    const service = new LeaderboardReadService({ client: createLeaderboardPrismaMock().client } as any);

    const modes = service.listRankedModes().modes;

    assert.deepEqual(modes.map((mode) => mode.id), ['standard_1v1', 'speed_1v1', 'classic_1v1', 'multiplayer_lobby']);
    assert.equal(modes.find((mode) => mode.id === 'multiplayer_lobby')?.enabled, false);
    assert.equal(modes.every((mode) => mode.defaultRating === 1500), true);
    assert.equal(modes.every((mode) => mode.provisionalGames === 10), true);
  });
});
