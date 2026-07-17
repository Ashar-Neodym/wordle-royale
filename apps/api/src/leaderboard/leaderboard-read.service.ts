import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { authoritativeRatingAlgorithmByMode, defaultProvisionalGames, defaultRankedMode, defaultRating, defaultRatingDeviation, rankedModes } from '@wordle-royale/contracts';
import type { RankedMode, SpeedRankedModeTimeControl } from '@wordle-royale/contracts';
import { SpeedOperationalReadinessService } from '../health/speed-operational-readiness.service.ts';
import { PrismaService } from '../prisma/prisma.service.ts';

const DEFAULT_LEADERBOARD_LIMIT = 20;
const MAX_LEADERBOARD_LIMIT = 100;

export type RankedModeId = RankedMode;
type AuthoritativeRatingMapping = (typeof authoritativeRatingAlgorithmByMode)[RankedModeId];
type PublicRatingAlgorithm = NonNullable<AuthoritativeRatingMapping>['algorithm'];

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
  algorithm: PublicRatingAlgorithm;
  algorithmConfigVersion: string;
}

export interface LeaderboardResult {
  mode: RankedModeId;
  algorithm: PublicRatingAlgorithm | null;
  algorithmConfigVersion: string | null;
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
  algorithm: PublicRatingAlgorithm | null;
  algorithmConfigVersion: string | null;
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
  queueEnabled?: boolean;
  rulesetVersion?: string;
  ratingAlgorithmConfigVersion?: string | null;
  timeControl?: SpeedRankedModeTimeControl;
  provisionalGames: number;
  defaultRating: number;
  defaultRatingDeviation: number;
  notes: string;
}

export interface ListLeaderboardInput {
  limit?: number;
  mode?: string;
  now?: Date;
}

export interface GetRatedProfileInput {
  mode?: string;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? DEFAULT_LEADERBOARD_LIMIT)) return DEFAULT_LEADERBOARD_LIMIT;
  return Math.min(MAX_LEADERBOARD_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LEADERBOARD_LIMIT)));
}

export function normalizeRankedMode(mode: string | undefined): RankedModeId {
  if (!mode || mode === 'ranked') return defaultRankedMode;
  if ((rankedModes as readonly string[]).includes(mode)) return mode as RankedModeId;
  throw new BadRequestException({ code: 'unsupported_ranked_mode', message: `Unsupported ranked mode: ${mode}` });
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

function toRatedProfile(profile: RatingProfileWithUser | null, user: UserProfileWithUser, mode: RankedModeId, mapping: AuthoritativeRatingMapping): RatedProfileReadModel {
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
    algorithm: mapping?.algorithm ?? null,
    algorithmConfigVersion: mapping?.algorithmConfigVersion ?? null,
    unrated: !profile,
  };
}

function toEntry(profile: RatingProfileWithUser, rank: number, algorithm: PublicRatingAlgorithm): LeaderboardEntry {
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
    algorithm,
    algorithmConfigVersion: profile.algorithmConfigVersion,
  };
}

@Injectable()
export class LeaderboardReadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(SpeedOperationalReadinessService) private readonly speedOperational?: SpeedOperationalReadinessService,
  ) {}

  async listRankedModes(): Promise<{ modes: RankedModeReadModel[] }> {
    const speedEnabled = (await this.speedOperational?.check())?.available === true;
    return {
      modes: [
        { id: 'standard_1v1', label: 'Standard', players: '1v1', rated: true, enabled: true, provisionalGames: defaultProvisionalGames, defaultRating, defaultRatingDeviation, notes: 'Primary chess-style 1v1 ladder; fewer guesses wins, same guesses draw.' },
        { id: 'speed_1v1', label: 'Speed / Blitz', players: '1v1', rated: true, enabled: speedEnabled, queueEnabled: speedEnabled, rulesetVersion: 'speed_1v1_v1_75s', ratingAlgorithmConfigVersion: 'speed_1v1_glicko_v1', timeControl: { roundTimeSeconds: 75, readyWindowSeconds: 20, countdownSeconds: 3, maxGuesses: 6, solveTimeBucketMs: 100, tieBreaker: 'server_solve_time_bucket' }, provisionalGames: defaultProvisionalGames, defaultRating, defaultRatingDeviation, notes: speedEnabled ? 'Live separate Speed ladder using immutable server-adjudicated outcomes and speed_1v1_glicko_v1.' : 'Speed is unavailable until its feature gate and operational dependencies are ready.' },
        { id: 'classic_1v1', label: 'Classic', players: '1v1', rated: true, enabled: false, provisionalGames: defaultProvisionalGames, defaultRating, defaultRatingDeviation, notes: 'Prepared ladder; settlement is not live and no authoritative algorithm is exposed.' },
        { id: 'multiplayer_lobby', label: 'Multiplayer / Lobby', players: '2-4', rated: true, enabled: false, provisionalGames: defaultProvisionalGames, defaultRating, defaultRatingDeviation, notes: 'Prepared as a separate pairwise-placement ladder; keep disabled until abuse policy is locked.' },
      ],
    };
  }

  async listLeaderboard(input: ListLeaderboardInput = {}): Promise<LeaderboardResult> {
    const limit = normalizeLimit(input.limit);
    const mode = normalizeRankedMode(input.mode);
    const mapping = authoritativeRatingAlgorithmByMode[mode];
    if (!mapping) {
      return {
        mode,
        algorithm: null,
        algorithmConfigVersion: null,
        generatedAt: (input.now ?? new Date()).toISOString(),
        entries: [],
      };
    }
    const rows = await (this.prisma.client as any).ratingProfile.findMany({
      where: {
        mode,
        algorithmConfigVersion: mapping.algorithmConfigVersion,
        status: 'active',
      },
      include: {
        user: { include: { profile: true } },
      },
      orderBy: [{ rating: 'desc' }, { matchesPlayed: 'desc' }, { userId: 'asc' }],
      take: MAX_LEADERBOARD_LIMIT,
    }) as RatingProfileWithUser[];

    const entries = rows
      .filter((profile) => profile.algorithmConfigVersion === mapping.algorithmConfigVersion)
      .sort(compareLeaderboardRows)
      .slice(0, limit)
      .map((profile, index) => toEntry(profile, index + 1, mapping.algorithm));

    return {
      mode,
      algorithm: mapping.algorithm,
      algorithmConfigVersion: mapping.algorithmConfigVersion,
      generatedAt: (input.now ?? new Date()).toISOString(),
      entries,
    };
  }

  async getRatedProfileByHandle(handle: string, input: GetRatedProfileInput = {}): Promise<RatedProfileReadModel> {
    const mode = normalizeRankedMode(input.mode);
    const mapping = authoritativeRatingAlgorithmByMode[mode];
    const profile = await this.findProfile(handle);
    const ratingProfile = mapping
      ? await this.findRatingProfile(profile.user.id, mode, mapping.algorithmConfigVersion)
      : null;
    return toRatedProfile(ratingProfile, profile, mode, mapping);
  }

  async listProfileRatingsByHandle(handle: string, _input: GetRatedProfileInput = {}): Promise<ProfileRatingsReadModel> {
    const profile = await this.findProfile(handle);
    const rows = await (this.prisma.client as any).ratingProfile.findMany({
      where: {
        userId: profile.user.id,
        status: 'active',
      },
      orderBy: [{ mode: 'asc' }],
    }) as RatingProfileWithUser[];
    const byMode = new Map(rows
      .filter((row) => {
        const mode = normalizeRankedMode(row.mode);
        return row.algorithmConfigVersion === authoritativeRatingAlgorithmByMode[mode]?.algorithmConfigVersion;
      })
      .map((row) => [normalizeRankedMode(row.mode), row]));
    return {
      userId: profile.user.id,
      handle: profile.publicHandle,
      displayName: profile.user.displayName?.trim() || profile.publicHandle,
      ratings: rankedModes.map((mode) => {
        const mapping = authoritativeRatingAlgorithmByMode[mode];
        return toRatedProfile(mapping ? byMode.get(mode) ?? null : null, profile, mode, mapping);
      }),
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
    const profile = await (this.prisma.client as any).ratingProfile.findUnique({
      where: {
        userId_mode_algorithmConfigVersion: {
          userId,
          mode,
          algorithmConfigVersion,
        },
      },
    }) as RatingProfileWithUser | null;
    return profile?.status === 'active' ? profile : null;
  }
}
