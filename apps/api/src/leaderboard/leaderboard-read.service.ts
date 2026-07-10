import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { defaultProvisionalGames, defaultRankedMode, defaultRating, defaultRatingDeviation, rankedModes } from '@wordle-royale/contracts';
import type { RankedMode } from '@wordle-royale/contracts';
import { PrismaService } from '../prisma/prisma.service.ts';

const DEFAULT_ALGORITHM_CONFIG_VERSION = 'placement_mmr_v1';
const DEFAULT_LEADERBOARD_LIMIT = 20;
const MAX_LEADERBOARD_LIMIT = 100;

export type RankedModeId = RankedMode;

type RatingProfileWithUser = {
  id: string;
  userId: string;
  mode: string;
  rating: number;
  matchesPlayed: number;
  provisionalRemaining: number;
  wins?: number;
  losses?: number;
  draws?: number;
  abandons?: number;
  peakRating?: number;
  ratingDeviation?: number;
  ratingVolatility?: number | null;
  lastRatedAt?: Date | string | null;
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
  mode: RankedModeId;
  rating: number;
  matchesPlayed: number;
  provisional: boolean;
  provisionalRemaining: number;
  wins: number;
  losses: number;
  draws: number;
  abandons: number;
  peakRating: number;
  ratingDeviation: number;
  ratingVolatility: number | null;
  lastRatedAt: string | null;
  algorithm: 'placement_mmr_v1';
  algorithmConfigVersion: string;
}

export interface LeaderboardResult {
  mode: RankedModeId;
  algorithm: 'placement_mmr_v1';
  algorithmConfigVersion: string;
  generatedAt: string;
  entries: LeaderboardEntry[];
}

export interface RatedProfileReadModel {
  userId: string;
  handle: string;
  displayName: string;
  mode: RankedModeId;
  rating: number;
  matchesPlayed: number;
  provisional: boolean;
  provisionalRemaining: number;
  wins: number;
  losses: number;
  draws: number;
  abandons: number;
  peakRating: number;
  ratingDeviation: number;
  ratingVolatility: number | null;
  lastRatedAt: string | null;
  algorithm: 'placement_mmr_v1';
  algorithmConfigVersion: string;
  unrated: boolean;
}

export interface ProfileRatingsReadModel {
  userId: string;
  handle: string;
  displayName: string;
  ratings: RatedProfileReadModel[];
}

export interface RankedModeReadModel {
  id: RankedModeId;
  label: string;
  players: '1v1' | '2-4';
  rated: true;
  enabled: boolean;
  provisionalGames: number;
  defaultRating: number;
  defaultRatingDeviation: number;
  notes: string;
}

export interface ListLeaderboardInput {
  limit?: number;
  mode?: string;
  algorithmConfigVersion?: string;
  now?: Date;
}

export interface GetRatedProfileInput {
  mode?: string;
  algorithmConfigVersion?: string;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? DEFAULT_LEADERBOARD_LIMIT)) return DEFAULT_LEADERBOARD_LIMIT;
  return Math.min(MAX_LEADERBOARD_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LEADERBOARD_LIMIT)));
}

export function normalizeRankedMode(mode: string | undefined): RankedModeId {
  if (!mode || mode === 'ranked') return defaultRankedMode;
  if ((rankedModes as readonly string[]).includes(mode)) return mode as RankedModeId;
  return defaultRankedMode;
}

function displayNameFor(profile: RatingProfileWithUser): string {
  return profile.user?.displayName?.trim() || profile.user?.profile?.publicHandle?.trim() || 'Anonymous player';
}

function handleFor(profile: RatingProfileWithUser): string | null {
  return profile.user?.profile?.publicHandle?.trim() || null;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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

function toRatedProfile(profile: RatingProfileWithUser | null, user: UserProfileWithUser, mode: RankedModeId, algorithmConfigVersion: string): RatedProfileReadModel {
  return {
    userId: user.user.id,
    handle: user.publicHandle,
    displayName: user.user.displayName?.trim() || user.publicHandle,
    mode,
    rating: profile?.rating ?? defaultRating,
    matchesPlayed: profile?.matchesPlayed ?? 0,
    provisional: (profile?.provisionalRemaining ?? defaultProvisionalGames) > 0,
    provisionalRemaining: profile?.provisionalRemaining ?? defaultProvisionalGames,
    wins: profile?.wins ?? 0,
    losses: profile?.losses ?? 0,
    draws: profile?.draws ?? 0,
    abandons: profile?.abandons ?? 0,
    peakRating: profile?.peakRating ?? profile?.rating ?? defaultRating,
    ratingDeviation: profile?.ratingDeviation ?? defaultRatingDeviation,
    ratingVolatility: profile?.ratingVolatility ?? null,
    lastRatedAt: isoOrNull(profile?.lastRatedAt),
    algorithm: 'placement_mmr_v1',
    algorithmConfigVersion,
    unrated: !profile,
  };
}

function toEntry(profile: RatingProfileWithUser, rank: number): LeaderboardEntry {
  return {
    rank,
    userId: profile.userId,
    handle: handleFor(profile),
    displayName: displayNameFor(profile),
    mode: normalizeRankedMode(profile.mode),
    rating: profile.rating,
    matchesPlayed: profile.matchesPlayed,
    provisional: profile.provisionalRemaining > 0,
    provisionalRemaining: profile.provisionalRemaining,
    wins: profile.wins ?? 0,
    losses: profile.losses ?? 0,
    draws: profile.draws ?? 0,
    abandons: profile.abandons ?? 0,
    peakRating: profile.peakRating ?? profile.rating,
    ratingDeviation: profile.ratingDeviation ?? defaultRatingDeviation,
    ratingVolatility: profile.ratingVolatility ?? null,
    lastRatedAt: isoOrNull(profile.lastRatedAt),
    algorithm: 'placement_mmr_v1',
    algorithmConfigVersion: profile.algorithmConfigVersion,
  };
}

@Injectable()
export class LeaderboardReadService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listRankedModes(): { modes: RankedModeReadModel[] } {
    return {
      modes: [
        { id: 'standard_1v1', label: 'Standard', players: '1v1', rated: true, enabled: true, provisionalGames: defaultProvisionalGames, defaultRating, defaultRatingDeviation, notes: 'Primary chess-style 1v1 ladder; fewer guesses wins, same guesses draw.' },
        { id: 'speed_1v1', label: 'Speed / Blitz', players: '1v1', rated: true, enabled: true, provisionalGames: defaultProvisionalGames, defaultRating, defaultRatingDeviation, notes: 'Time-sensitive 1v1 ladder; same-guess tiebreak uses server-authoritative timing when enabled.' },
        { id: 'classic_1v1', label: 'Classic', players: '1v1', rated: true, enabled: true, provisionalGames: defaultProvisionalGames, defaultRating, defaultRatingDeviation, notes: 'Lower-pressure 1v1 ladder prepared for slower rules.' },
        { id: 'multiplayer_lobby', label: 'Multiplayer / Lobby', players: '2-4', rated: true, enabled: false, provisionalGames: defaultProvisionalGames, defaultRating, defaultRatingDeviation, notes: 'Prepared as a separate pairwise-placement ladder; keep disabled until abuse policy is locked.' },
      ],
    };
  }

  async listLeaderboard(input: ListLeaderboardInput = {}): Promise<LeaderboardResult> {
    const algorithmConfigVersion = input.algorithmConfigVersion ?? DEFAULT_ALGORITHM_CONFIG_VERSION;
    const limit = normalizeLimit(input.limit);
    const mode = normalizeRankedMode(input.mode);
    const rows = await (this.prisma.client as any).ratingProfile.findMany({
      where: {
        mode,
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
      mode,
      algorithm: 'placement_mmr_v1',
      algorithmConfigVersion,
      generatedAt: (input.now ?? new Date()).toISOString(),
      entries,
    };
  }

  async getRatedProfileByHandle(handle: string, input: GetRatedProfileInput = {}): Promise<RatedProfileReadModel> {
    const algorithmConfigVersion = input.algorithmConfigVersion ?? DEFAULT_ALGORITHM_CONFIG_VERSION;
    const mode = normalizeRankedMode(input.mode);
    const profile = await this.findProfile(handle);
    const ratingProfile = await this.findRatingProfile(profile.user.id, mode, algorithmConfigVersion);
    return toRatedProfile(ratingProfile, profile, mode, algorithmConfigVersion);
  }

  async listProfileRatingsByHandle(handle: string, input: GetRatedProfileInput = {}): Promise<ProfileRatingsReadModel> {
    const algorithmConfigVersion = input.algorithmConfigVersion ?? DEFAULT_ALGORITHM_CONFIG_VERSION;
    const profile = await this.findProfile(handle);
    const rows = await (this.prisma.client as any).ratingProfile.findMany({
      where: {
        userId: profile.user.id,
        algorithmConfigVersion,
        status: 'active',
      },
      orderBy: [{ mode: 'asc' }],
    }) as RatingProfileWithUser[];
    const byMode = new Map(rows.map((row) => [normalizeRankedMode(row.mode), row]));
    return {
      userId: profile.user.id,
      handle: profile.publicHandle,
      displayName: profile.user.displayName?.trim() || profile.publicHandle,
      ratings: rankedModes.map((mode) => toRatedProfile(byMode.get(mode) ?? null, profile, mode, algorithmConfigVersion)),
    };
  }

  private async findProfile(handle: string): Promise<UserProfileWithUser> {
    const normalizedHandle = handle.trim().toLowerCase();
    const profile = await (this.prisma.client as any).userProfile.findUnique({
      where: { publicHandle: normalizedHandle },
      include: { user: true },
    }) as UserProfileWithUser | null;

    if (!profile) {
      throw new NotFoundException({ code: 'profile_not_found', message: 'Rated profile was not found.', details: { handle: normalizedHandle } });
    }
    return profile;
  }

  private async findRatingProfile(userId: string, mode: RankedModeId, algorithmConfigVersion: string): Promise<RatingProfileWithUser | null> {
    return await (this.prisma.client as any).ratingProfile.findUnique({
      where: {
        userId_mode_algorithmConfigVersion: {
          userId,
          mode,
          algorithmConfigVersion,
        },
      },
    }) as RatingProfileWithUser | null;
  }
}
