import type { MatchReportFixture } from './types.js';
import { fixtureUsers } from './users.js';

export const matchReportFixtures = {
  rankedGain: {
    matchId: 'match_ranked_gain',
    rated: true,
    shareCardEnabled: true,
    spoilerSafe: true,
    participants: [
      { userId: fixtureUsers.ashar.id, placement: 1, totalScore: 412, ratingBefore: 1500, ratingAfter: 1536, provisionalBefore: true, provisionalAfter: true },
      { userId: fixtureUsers.luna.id, placement: 2, totalScore: 389, ratingBefore: 1532, ratingAfter: 1518, provisionalBefore: false, provisionalAfter: false },
    ],
  },
  rankedLoss: {
    matchId: 'match_ranked_loss',
    rated: true,
    shareCardEnabled: true,
    spoilerSafe: true,
    participants: [
      { userId: fixtureUsers.ashar.id, placement: 2, totalScore: 280, ratingBefore: 1536, ratingAfter: 1504, provisionalBefore: true, provisionalAfter: true },
      { userId: fixtureUsers.ruby.id, placement: 1, totalScore: 420, ratingBefore: 1478, ratingAfter: 1502, provisionalBefore: false, provisionalAfter: false },
    ],
  },
  casual: {
    matchId: 'match_casual',
    rated: false,
    shareCardEnabled: true,
    spoilerSafe: true,
    participants: [
      { userId: fixtureUsers.freya.id, placement: 1, totalScore: 500 },
      { userId: fixtureUsers.ashar.id, placement: 2, totalScore: 430 },
    ],
  },
} as const satisfies Record<string, MatchReportFixture>;

export const leaderboardFixtures = {
  empty: [],
  populated: [
    { userId: fixtureUsers.freya.id, rank: 1, rating: fixtureUsers.freya.rating, provisional: false },
    { userId: fixtureUsers.luna.id, rank: 2, rating: fixtureUsers.luna.rating, provisional: false },
    { userId: fixtureUsers.ashar.id, rank: null, rating: fixtureUsers.ashar.rating, provisional: true },
  ],
} as const;
