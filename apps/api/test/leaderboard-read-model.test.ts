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
      id: 'rating_1',
      userId: users[0]!.id,
      mode: 'ranked',
      rating: 1400,
      matchesPlayed: 12,
      provisionalRemaining: 0,
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      status: 'active',
      user: users[0]!,
    },
    {
      id: 'rating_2',
      userId: users[1]!.id,
      mode: 'ranked',
      rating: 1500,
      matchesPlayed: 2,
      provisionalRemaining: 8,
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      status: 'active',
      user: users[1]!,
    },
    {
      id: 'rating_3',
      userId: users[2]!.id,
      mode: 'ranked',
      rating: 1500,
      matchesPlayed: 7,
      provisionalRemaining: 3,
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      status: 'active',
      user: users[2]!,
    },
    {
      id: 'casual_rating',
      userId: users[3]!.id,
      mode: 'casual',
      rating: 2000,
      matchesPlayed: 99,
      provisionalRemaining: 0,
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      status: 'active',
      user: users[3]!,
    },
  ];

  const client = {
    ratingProfile: {
      findMany: async (args: any) => ratingProfiles.filter((profile) => profile.mode === args.where.mode
        && profile.algorithmConfigVersion === args.where.algorithmConfigVersion
        && profile.status === args.where.status),
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
  it('returns deterministic ranked leaderboard rows sorted by rating, matches played, then identity', async () => {
    const service = new LeaderboardReadService({ client: createLeaderboardPrismaMock().client } as any);

    const result = await service.listLeaderboard({ limit: 10 });

    assert.equal(result.algorithmConfigVersion, algorithmConfigVersion);
    assert.deepEqual(result.entries.map((entry) => ({ rank: entry.rank, handle: entry.handle, rating: entry.rating, matchesPlayed: entry.matchesPlayed, provisional: entry.provisional })), [
      { rank: 1, handle: null, rating: 1500, matchesPlayed: 7, provisional: true },
      { rank: 2, handle: 'ada', rating: 1500, matchesPlayed: 2, provisional: true },
      { rank: 3, handle: 'zara', rating: 1400, matchesPlayed: 12, provisional: false },
    ]);
    assert.equal(result.entries.some((entry) => entry.displayName === 'Unrated Local'), false);
  });

  it('returns default unrated profile data for a known handle without a ranked profile', async () => {
    const service = new LeaderboardReadService({ client: createLeaderboardPrismaMock().client } as any);

    const profile = await service.getRatedProfileByHandle('unrated');

    assert.equal(profile.handle, 'unrated');
    assert.equal(profile.displayName, 'Unrated Local');
    assert.equal(profile.rating, 1200);
    assert.equal(profile.matchesPlayed, 0);
    assert.equal(profile.provisional, true);
    assert.equal(profile.unrated, true);
  });
});
