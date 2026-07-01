import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { defaultRating } from '@wordle-royale/contracts';
import { PrismaService } from '../prisma/prisma.service.ts';

const DEFAULT_ALGORITHM_CONFIG_VERSION = 'placement_mmr_v1';
const DEFAULT_PROVISIONAL_REMAINING = 10;
const DEFAULT_LEADERBOARD_LIMIT = 20;
const MAX_LEADERBOARD_LIMIT = 100;

type RatingProfileWithUser = {
  id: string;
  userId: string;
  mode: string;
  rating: number;
  matchesPlayed: number;
  provisionalRemaining: number;
  algorithm: string;
  algorithmConfigVersion: string;
  status?: string;
  user?: {
    id: string;
    displayName?: string | null;
    profile?: {
      publicHandle?: string | null;
    } | null;
  } | null;
};

type UserProfileWithUser = {
  publicHandle: string;
  user: {
    id: string;
    displayName?: string | null;
  };
};

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  handle: string | null;
  displayName: string;
  rating: number;
  matchesPlayed: number;
  provisional: boolean;
  provisionalRemaining: number;
  algorithm: 'placement_mmr_v1';
  algorithmConfigVersion: string;
}

export interface LeaderboardResult {
  mode: 'ranked';
  algorithm: 'placement_mmr_v1';
  algorithmConfigVersion: string;
  generatedAt: string;
  entries: LeaderboardEntry[];
}

export interface RatedProfileReadModel {
  userId: string;
  handle: string;
  displayName: string;
  rating: number;
  matchesPlayed: number;
  provisional: boolean;
  provisionalRemaining: number;
  algorithm: 'placement_mmr_v1';
  algorithmConfigVersion: string;
  unrated: boolean;
}

export interface ListLeaderboardInput {
  limit?: number;
  algorithmConfigVersion?: string;
  now?: Date;
}

export interface GetRatedProfileInput {
  algorithmConfigVersion?: string;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? DEFAULT_LEADERBOARD_LIMIT)) return DEFAULT_LEADERBOARD_LIMIT;
  return Math.min(MAX_LEADERBOARD_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LEADERBOARD_LIMIT)));
}

function displayNameFor(profile: RatingProfileWithUser): string {
  return profile.user?.displayName?.trim() || profile.user?.profile?.publicHandle?.trim() || 'Anonymous player';
}

function handleFor(profile: RatingProfileWithUser): string | null {
  return profile.user?.profile?.publicHandle?.trim() || null;
}

function compareLeaderboardRows(left: RatingProfileWithUser, right: RatingProfileWithUser): number {
  const ratingDelta = right.rating - left.rating;
  if (ratingDelta !== 0) return ratingDelta;
  const matchesDelta = right.matchesPlayed - left.matchesPlayed;
  if (matchesDelta !== 0) return matchesDelta;
  const leftIdentity = handleFor(left) ?? displayNameFor(left) ?? left.userId;
  const rightIdentity = handleFor(right) ?? displayNameFor(right) ?? right.userId;
  const identityDelta = leftIdentity.localeCompare(rightIdentity);
  if (identityDelta !== 0) return identityDelta;
  return left.userId.localeCompare(right.userId);
}

function toEntry(profile: RatingProfileWithUser, rank: number): LeaderboardEntry {
  return {
    rank,
    userId: profile.userId,
    handle: handleFor(profile),
    displayName: displayNameFor(profile),
    rating: profile.rating,
    matchesPlayed: profile.matchesPlayed,
    provisional: profile.provisionalRemaining > 0,
    provisionalRemaining: profile.provisionalRemaining,
    algorithm: 'placement_mmr_v1',
    algorithmConfigVersion: profile.algorithmConfigVersion,
  };
}

@Injectable()
export class LeaderboardReadService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listLeaderboard(input: ListLeaderboardInput = {}): Promise<LeaderboardResult> {
    const algorithmConfigVersion = input.algorithmConfigVersion ?? DEFAULT_ALGORITHM_CONFIG_VERSION;
    const limit = normalizeLimit(input.limit);
    const rows = await (this.prisma.client as any).ratingProfile.findMany({
      where: {
        mode: 'ranked',
        algorithmConfigVersion,
        status: 'active',
      },
      include: {
        user: { include: { profile: true } },
      },
      orderBy: [{ rating: 'desc' }, { matchesPlayed: 'desc' }, { userId: 'asc' }],
      take: MAX_LEADERBOARD_LIMIT,
    }) as RatingProfileWithUser[];

    const entries = rows
      .filter((profile) => profile.algorithm === 'placement_mmr_v1')
      .sort(compareLeaderboardRows)
      .slice(0, limit)
      .map((profile, index) => toEntry(profile, index + 1));

    return {
      mode: 'ranked',
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      generatedAt: (input.now ?? new Date()).toISOString(),
      entries,
    };
  }

  async getRatedProfileByHandle(handle: string, input: GetRatedProfileInput = {}): Promise<RatedProfileReadModel> {
    const algorithmConfigVersion = input.algorithmConfigVersion ?? DEFAULT_ALGORITHM_CONFIG_VERSION;
    const normalizedHandle = handle.trim().toLowerCase();
    const profile = await (this.prisma.client as any).userProfile.findUnique({
      where: { publicHandle: normalizedHandle },
      include: { user: true },
    }) as UserProfileWithUser | null;

    if (!profile) {
      throw new NotFoundException({ code: 'profile_not_found', message: 'Rated profile was not found.', details: { handle: normalizedHandle } });
    }

    const ratingProfile = await (this.prisma.client as any).ratingProfile.findUnique({
      where: {
        userId_mode_algorithmConfigVersion: {
          userId: profile.user.id,
          mode: 'ranked',
          algorithmConfigVersion,
        },
      },
    }) as RatingProfileWithUser | null;

    return {
      userId: profile.user.id,
      handle: profile.publicHandle,
      displayName: profile.user.displayName?.trim() || profile.publicHandle,
      rating: ratingProfile?.rating ?? defaultRating,
      matchesPlayed: ratingProfile?.matchesPlayed ?? 0,
      provisional: (ratingProfile?.provisionalRemaining ?? DEFAULT_PROVISIONAL_REMAINING) > 0,
      provisionalRemaining: ratingProfile?.provisionalRemaining ?? DEFAULT_PROVISIONAL_REMAINING,
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      unrated: !ratingProfile,
    };
  }
}
