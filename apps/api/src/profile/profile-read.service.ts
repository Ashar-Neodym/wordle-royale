import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { authoritativeRatingAlgorithmByMode, currentProfileSummarySchema, defaultProvisionalGames, defaultRankedMode, defaultRating, defaultRatingDeviation, matchHistoryListSchema, matchHistorySummarySchema, publicProfileSummarySchema, rankedModes } from '@wordle-royale/contracts';
import type { RankedMode } from '@wordle-royale/contracts';
import type { CurrentProfileSummary, MatchHistoryList, MatchHistorySummary, PublicProfileSummary } from '@wordle-royale/contracts';
import { PrismaService } from '../prisma/prisma.service.ts';

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;
const stubCurrentUserId = '11111111-1111-4111-8111-111111111111';
const defaultHandle = 'player_one';
const defaultDisplayName = 'Player One';

type UserWithProfile = {
  id: string;
  displayName?: string | null;
  profile?: { publicHandle?: string | null; avatarUrl?: string | null } | null;
};

type RatingProfileRow = {
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
};

type RatingEventRow = {
  userId?: string;
  delta?: number;
  algorithm?: string;
  algorithmConfigVersion?: string;
  voidedByEventId?: string | null;
  metadata?: unknown;
};

type MatchParticipantWithUser = {
  id: string;
  matchId: string;
  userId: string;
  seatNumber: number;
  outcome: 'pending' | 'solved' | 'failed' | 'abandoned' | 'voided' | string;
  placement?: number | null;
  finalScore: number;
  result?: 'win' | 'loss' | 'draw' | 'void' | null;
  terminalReason?: 'solved' | 'max_guesses' | 'deadline_timeout' | 'forfeit' | 'awarded_forfeit_win' | 'no_contest' | 'operator_void' | null;
  guessesUsed?: number | null;
  solveElapsedMs?: number | null;
  user?: UserWithProfile | null;
  ratingEvents?: RatingEventRow[];
};

type MatchWithParticipants = {
  id: string;
  mode: 'ranked' | 'casual' | string;
  rankedMode?: string | null;
  rulesetVersion?: string | null;
  completionReason?: string | null;
  status: 'pending' | 'active' | 'completed' | 'voided' | 'cancelled' | string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  participants?: MatchParticipantWithUser[];
  report?: { publicSummary?: unknown; spoilerSafeShare?: unknown } | null;
};

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? DEFAULT_HISTORY_LIMIT)) return DEFAULT_HISTORY_LIMIT;
  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_HISTORY_LIMIT)));
}

function displayNameFor(user: UserWithProfile | null | undefined, fallbackHandle: string | null, fallbackUserId: string): string {
  return user?.displayName?.trim() || fallbackHandle || `Player ${fallbackUserId.slice(0, 8)}`;
}

function handleFor(user: UserWithProfile | null | undefined): string | null {
  return user?.profile?.publicHandle?.trim() || null;
}

function effectiveRatingEvent(participant: MatchParticipantWithUser, expectedVersion?: string | null): RatingEventRow | null {
  const events = (participant.ratingEvents ?? []).filter((event) => !event.voidedByEventId);
  if (expectedVersion) return events.find((event) => event.algorithmConfigVersion === expectedVersion) ?? null;
  return events.find((event) => event.algorithmConfigVersion === 'standard_1v1_glicko_v1')
    ?? events.find((event) => event.algorithmConfigVersion === 'speed_1v1_glicko_v1')
    ?? events.find((event) => event.algorithmConfigVersion === 'placement_mmr_v1')
    ?? null;
}

function ratingDeltaFor(participant: MatchParticipantWithUser, expectedVersion?: string | null): number | null {
  const event = effectiveRatingEvent(participant, expectedVersion);
  if (!event) return null;
  if (typeof event.delta === 'number') return event.delta;
  const metadata = typeof event.metadata === 'object' && event.metadata !== null ? event.metadata as { ratingDelta?: unknown } : {};
  return typeof metadata.ratingDelta === 'number' ? metadata.ratingDelta : null;
}

function ratingIdentityFor(participants: MatchParticipantWithUser[], expectedVersion?: string | null): {
  algorithm: 'placement_mmr_v1' | 'standard_1v1_glicko_v1' | 'speed_1v1_glicko_v1' | null;
  algorithmConfigVersion: string | null;
} {
  const events = participants.map((participant) => effectiveRatingEvent(participant, expectedVersion)).filter((event): event is RatingEventRow => event !== null);
  const versions = new Set(events.map((event) => event.algorithmConfigVersion).filter(Boolean));
  if (versions.size !== 1) return { algorithm: null, algorithmConfigVersion: null };
  const event = events[0];
  if (!event?.algorithmConfigVersion) return { algorithm: null, algorithmConfigVersion: null };
  if (event.algorithmConfigVersion === 'standard_1v1_glicko_v1') {
    return { algorithm: 'standard_1v1_glicko_v1', algorithmConfigVersion: event.algorithmConfigVersion };
  }
  if (event.algorithmConfigVersion === 'speed_1v1_glicko_v1') {
    return { algorithm: 'speed_1v1_glicko_v1', algorithmConfigVersion: event.algorithmConfigVersion };
  }
  if (event.algorithmConfigVersion === 'placement_mmr_v1') {
    return { algorithm: 'placement_mmr_v1', algorithmConfigVersion: event.algorithmConfigVersion };
  }
  return { algorithm: null, algorithmConfigVersion: null };
}

function normalizeStatus(status: string): MatchHistorySummary['status'] {
  if (status === 'pending' || status === 'active' || status === 'completed' || status === 'voided' || status === 'cancelled') return status;
  return 'active';
}

function normalizeMode(mode: string): MatchHistorySummary['mode'] {
  return mode === 'casual' ? 'casual' : 'ranked';
}

function normalizeRankedMode(mode: string | undefined): RankedMode {
  if (!mode || mode === 'ranked') return defaultRankedMode;
  if ((rankedModes as readonly string[]).includes(mode)) return mode as RankedMode;
  return defaultRankedMode;
}

function normalizeOutcome(outcome: string): MatchParticipantWithUser['outcome'] {
  if (outcome === 'pending' || outcome === 'solved' || outcome === 'failed' || outcome === 'abandoned' || outcome === 'voided') return outcome;
  return 'pending';
}

@Injectable()
export class ProfileReadService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCurrentProfileSummary(userId = stubCurrentUserId): Promise<CurrentProfileSummary> {
    const user = await this.findUserById(userId);
    const recentMatches = (await this.listCurrentUserMatchHistory({ userId, limit: 5 })).items;
    return currentProfileSummarySchema.parse({
      ...await this.baseProfileSummary(user),
      recentMatches,
    });
  }

  async getPublicProfileSummary(handle: string): Promise<PublicProfileSummary> {
    const profile = await (this.prisma.client as any).userProfile.findUnique({
      where: { publicHandle: handle.trim().toLowerCase() },
      include: { user: true },
    }) as ({ publicHandle: string; avatarUrl?: string | null; user: UserWithProfile } | null);
    if (!profile) {
      throw new NotFoundException({ code: 'profile_not_found', message: 'Profile summary was not found.', details: { handle } });
    }
    const user = { ...profile.user, profile: { publicHandle: profile.publicHandle, avatarUrl: profile.avatarUrl ?? null } };
    const recentMatches = (await this.listCurrentUserMatchHistory({ userId: user.id, limit: 5 })).items;
    return publicProfileSummarySchema.parse({
      ...await this.baseProfileSummary(user),
      recentMatches,
    });
  }

  async listCurrentUserMatchHistory(input: { userId?: string; limit?: number; cursor?: string; mode?: RankedMode }): Promise<MatchHistoryList> {
    const userId = input.userId ?? stubCurrentUserId;
    const limit = normalizeLimit(input.limit);
    const authoritativeAlgorithm = input.mode ? authoritativeRatingAlgorithmByMode[input.mode] : null;
    const rows = await (this.prisma.client as any).match.findMany({
      where: {
        mode: 'ranked',
        ...(input.mode ? {
          rankedMode: input.mode,
          status: { in: ['completed', 'voided'] },
          algorithmConfigVersion: authoritativeAlgorithm?.algorithmConfigVersion ?? '__disabled_mode__',
          ...(input.mode === 'speed_1v1' ? {
            rulesetVersion: 'speed_1v1_v1_75s',
            adjudicatedAt: { not: null },
          } : {}),
        } : {}),
        participants: { some: { userId } },
        ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {}),
      },
      include: {
        participants: {
          include: {
            user: { include: { profile: true } },
            ratingEvents: {
              where: { type: 'apply', voidedByEventId: null },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: [{ placement: 'asc' }, { seatNumber: 'asc' }],
        },
        report: true,
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
    }) as MatchWithParticipants[];

    const page = rows.slice(0, limit);
    const nextRow = rows[limit];
    return matchHistoryListSchema.parse({
      items: page.map((match) => this.toMatchHistorySummary(match, userId)),
      pagination: { nextCursor: nextRow ? isoOrNull(nextRow.createdAt) : null },
    });
  }

  async listProfileMatchHistoryByHandle(handle: string, input: { mode: RankedMode; limit?: number; cursor?: string }): Promise<MatchHistoryList> {
    const profile = await (this.prisma.client as any).userProfile.findUnique({
      where: { publicHandle: handle.trim().toLowerCase() },
      include: { user: true },
    }) as ({ user: UserWithProfile } | null);
    if (!profile) {
      throw new NotFoundException({ code: 'profile_not_found', message: 'Profile summary was not found.', details: { handle } });
    }
    return await this.listCurrentUserMatchHistory({
      userId: profile.user.id,
      mode: input.mode,
      ...(input.limit ? { limit: input.limit } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
  }

  toMatchHistorySummary(match: MatchWithParticipants, viewerUserId: string): MatchHistorySummary {
    const expectedRatingVersion = match.mode === 'ranked'
      ? (match.rankedMode ? authoritativeRatingAlgorithmByMode[normalizeRankedMode(match.rankedMode)]?.algorithmConfigVersion ?? null : null)
      : null;
    const participants = [...(match.participants ?? [])].sort((left, right) => {
      const placementDelta = (left.placement ?? Number.MAX_SAFE_INTEGER) - (right.placement ?? Number.MAX_SAFE_INTEGER);
      if (placementDelta !== 0) return placementDelta;
      return left.seatNumber - right.seatNumber;
    });
    const dataParticipants = participants.map((participant) => {
      const handle = handleFor(participant.user);
      return {
        userId: participant.userId,
        handle,
        displayName: displayNameFor(participant.user, handle, participant.userId),
        placement: participant.placement ?? null,
        outcome: normalizeOutcome(participant.outcome),
        finalScore: Math.max(0, participant.finalScore ?? 0),
        ratingDelta: normalizeStatus(match.status) === 'completed' ? ratingDeltaFor(participant, expectedRatingVersion) : null,
        ...(match.rankedMode === 'speed_1v1' && (match.status === 'completed' || match.status === 'voided') ? {
          result: participant.result ?? null,
          terminalReason: participant.terminalReason ?? null,
          guessesUsed: participant.guessesUsed ?? null,
          solveElapsedMs: participant.solveElapsedMs ?? null,
        } : {}),
      };
    });
    const viewer = dataParticipants.find((participant) => participant.userId === viewerUserId) ?? null;
    const ratingIdentity = ratingIdentityFor(participants, expectedRatingVersion);
    return matchHistorySummarySchema.parse({
      matchId: match.id,
      mode: normalizeMode(match.mode),
      rankedMode: match.rankedMode ? normalizeRankedMode(match.rankedMode) : null,
      rulesetVersion: match.rulesetVersion ?? null,
      speedCompletionReason: match.rankedMode === 'speed_1v1' ? match.completionReason ?? null : null,
      status: normalizeStatus(match.status),
      ratingAlgorithm: ratingIdentity.algorithm,
      ratingAlgorithmConfigVersion: ratingIdentity.algorithmConfigVersion,
      startedAt: isoOrNull(match.startedAt ?? match.createdAt),
      completedAt: isoOrNull(match.completedAt),
      participants: dataParticipants,
      viewer: viewer ? {
        userId: viewer.userId,
        placement: viewer.placement,
        outcome: viewer.outcome,
        finalScore: viewer.finalScore,
        ratingDelta: viewer.ratingDelta,
      } : null,
    });
  }

  private async findUserById(userId: string): Promise<UserWithProfile> {
    const user = await (this.prisma.client as any).userAccount.findUnique?.({ where: { id: userId }, include: { profile: true } }) as UserWithProfile | null;
    if (user) return user;
    if (userId !== stubCurrentUserId) {
      throw new NotFoundException({ code: 'profile_not_found', message: 'Current profile was not found.', details: { userId } });
    }
    return { id: stubCurrentUserId, displayName: defaultDisplayName, profile: { publicHandle: defaultHandle, avatarUrl: null } };
  }

  private async baseProfileSummary(user: UserWithProfile): Promise<Omit<CurrentProfileSummary, 'recentMatches'>> {
    const handle = handleFor(user) ?? defaultHandle;
    const ratingProfiles = await (this.prisma.client as any).ratingProfile.findMany?.({
      where: { userId: user.id, status: 'active' },
      orderBy: [{ mode: 'asc' }],
    }) as RatingProfileRow[] | undefined;
    const profilesByMode = new Map((ratingProfiles ?? [])
      .filter((row) => {
        const mode = normalizeRankedMode(row.mode);
        return row.algorithmConfigVersion === authoritativeRatingAlgorithmByMode[mode]?.algorithmConfigVersion;
      })
      .map((row) => [normalizeRankedMode(row.mode), row]));
    const ratingProfile = profilesByMode.get(defaultRankedMode) ?? null;
    const rank = await this.rankFor(user.id);
    const toRatingSummary = (profile: RatingProfileRow | null, mode: RankedMode, modeRank: number | null) => {
      const mapping = authoritativeRatingAlgorithmByMode[mode];
      return {
        mode: 'ranked' as const,
        rankedMode: mode,
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
        rank: modeRank,
        unrated: !profile,
      };
    };
    const rating = toRatingSummary(ratingProfile, defaultRankedMode, rank);
    return {
      userId: user.id,
      handle,
      displayName: displayNameFor(user, handle, user.id),
      avatarUrl: user.profile?.avatarUrl ?? null,
      rating,
      ratings: rankedModes.map((mode) => toRatingSummary(profilesByMode.get(mode) ?? null, mode, mode === defaultRankedMode ? rank : null)),
    };
  }

  private async rankFor(userId: string): Promise<number | null> {
    const standardMapping = authoritativeRatingAlgorithmByMode.standard_1v1;
    const rows = await (this.prisma.client as any).ratingProfile.findMany?.({
      where: { mode: defaultRankedMode, algorithmConfigVersion: standardMapping.algorithmConfigVersion, status: 'active' },
      orderBy: [{ rating: 'desc' }, { matchesPlayed: 'desc' }, { userId: 'asc' }],
      take: 500,
    }) as RatingProfileRow[] | undefined;
    if (!rows) return null;
    const sorted = rows
      .filter((row) => row.algorithmConfigVersion === standardMapping.algorithmConfigVersion)
      .sort((left, right) => (right.rating - left.rating) || (right.matchesPlayed - left.matchesPlayed) || left.userId.localeCompare(right.userId));
    const index = sorted.findIndex((row) => row.userId === userId);
    return index >= 0 ? index + 1 : null;
  }
}
