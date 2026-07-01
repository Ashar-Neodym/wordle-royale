import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { currentProfileSummarySchema, defaultRating, matchHistoryListSchema, matchHistorySummarySchema, publicProfileSummarySchema } from '@wordle-royale/contracts';
import type { CurrentProfileSummary, MatchHistoryList, MatchHistorySummary, PublicProfileSummary } from '@wordle-royale/contracts';
import { PrismaService } from '../prisma/prisma.service.ts';

const DEFAULT_ALGORITHM_CONFIG_VERSION = 'placement_mmr_v1';
const DEFAULT_PROVISIONAL_REMAINING = 10;
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
  algorithm: string;
  algorithmConfigVersion: string;
  status?: string;
};

type RatingEventRow = {
  userId?: string;
  delta?: number;
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
  user?: UserWithProfile | null;
  ratingEvents?: RatingEventRow[];
};

type MatchWithParticipants = {
  id: string;
  mode: 'ranked' | 'casual' | string;
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

function ratingDeltaFor(participant: MatchParticipantWithUser): number | null {
  const event = participant.ratingEvents?.[0];
  if (!event) return null;
  if (typeof event.delta === 'number') return event.delta;
  const metadata = typeof event.metadata === 'object' && event.metadata !== null ? event.metadata as { ratingDelta?: unknown } : {};
  return typeof metadata.ratingDelta === 'number' ? metadata.ratingDelta : null;
}

function normalizeStatus(status: string): MatchHistorySummary['status'] {
  if (status === 'pending' || status === 'active' || status === 'completed' || status === 'voided' || status === 'cancelled') return status;
  return 'active';
}

function normalizeMode(mode: string): MatchHistorySummary['mode'] {
  return mode === 'casual' ? 'casual' : 'ranked';
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

  async listCurrentUserMatchHistory(input: { userId?: string; limit?: number; cursor?: string }): Promise<MatchHistoryList> {
    const userId = input.userId ?? stubCurrentUserId;
    const limit = normalizeLimit(input.limit);
    const rows = await (this.prisma.client as any).match.findMany({
      where: {
        mode: 'ranked',
        participants: { some: { userId } },
        ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {}),
      },
      include: {
        participants: {
          include: {
            user: { include: { profile: true } },
            ratingEvents: { where: { type: 'apply' }, orderBy: { createdAt: 'asc' }, take: 1 },
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

  toMatchHistorySummary(match: MatchWithParticipants, viewerUserId: string): MatchHistorySummary {
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
        ratingDelta: normalizeStatus(match.status) === 'completed' ? ratingDeltaFor(participant) : null,
      };
    });
    const viewer = dataParticipants.find((participant) => participant.userId === viewerUserId) ?? null;
    return matchHistorySummarySchema.parse({
      matchId: match.id,
      mode: normalizeMode(match.mode),
      status: normalizeStatus(match.status),
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
    const ratingProfile = await (this.prisma.client as any).ratingProfile.findUnique?.({
      where: {
        userId_mode_algorithmConfigVersion: {
          userId: user.id,
          mode: 'ranked',
          algorithmConfigVersion: DEFAULT_ALGORITHM_CONFIG_VERSION,
        },
      },
    }) as RatingProfileRow | null;
    const rank = await this.rankFor(user.id);
    return {
      userId: user.id,
      handle,
      displayName: displayNameFor(user, handle, user.id),
      avatarUrl: user.profile?.avatarUrl ?? null,
      rating: {
        mode: 'ranked',
        rating: ratingProfile?.rating ?? defaultRating,
        matchesPlayed: ratingProfile?.matchesPlayed ?? 0,
        provisional: (ratingProfile?.provisionalRemaining ?? DEFAULT_PROVISIONAL_REMAINING) > 0,
        provisionalRemaining: ratingProfile?.provisionalRemaining ?? DEFAULT_PROVISIONAL_REMAINING,
        algorithm: 'placement_mmr_v1',
        algorithmConfigVersion: DEFAULT_ALGORITHM_CONFIG_VERSION,
        rank,
        unrated: !ratingProfile,
      },
    };
  }

  private async rankFor(userId: string): Promise<number | null> {
    const rows = await (this.prisma.client as any).ratingProfile.findMany?.({
      where: { mode: 'ranked', algorithmConfigVersion: DEFAULT_ALGORITHM_CONFIG_VERSION, status: 'active' },
      orderBy: [{ rating: 'desc' }, { matchesPlayed: 'desc' }, { userId: 'asc' }],
      take: 500,
    }) as RatingProfileRow[] | undefined;
    if (!rows) return null;
    const sorted = rows
      .filter((row) => row.algorithm === 'placement_mmr_v1')
      .sort((left, right) => (right.rating - left.rating) || (right.matchesPlayed - left.matchesPlayed) || left.userId.localeCompare(right.userId));
    const index = sorted.findIndex((row) => row.userId === userId);
    return index >= 0 ? index + 1 : null;
  }
}
