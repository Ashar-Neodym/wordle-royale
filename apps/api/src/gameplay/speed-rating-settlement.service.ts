import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  defaultProvisionalGames,
  defaultRating,
  rankedMatchResultSummarySchema,
  ratingEventContractSchema,
  speedCompletionReasonSchema,
  type RankedMatchResultSummary,
  type RatingEventContract,
} from '@wordle-royale/contracts';
import { randomUUID } from 'node:crypto';
import {
  calculateSpeed1v1Settlement,
  SPEED_1V1_RATING_ALGORITHM,
  SPEED_1V1_RATING_ALGORITHM_VERSION,
  validateSpeedAdjudication,
} from '../rating/speed-1v1-rating.ts';
import { STANDARD_1V1_INITIAL_RATING_DEVIATION, STANDARD_1V1_RATING_ALGORITHM } from '../rating/standard-1v1-rating.ts';
import { SPEED_1V1_ADJUDICATION_VERSION, SPEED_1V1_RULESET_VERSION } from './speed-1v1-rules.ts';

type SpeedSettlementReason = 'all_players_final' | 'timeout' | 'forfeit' | 'abandoned' | 'voided';
type Participant = {
  id: string;
  userId: string;
  seatNumber: number;
  outcome: string;
  finalScore: number;
  result?: 'win' | 'loss' | 'draw' | 'void' | null;
  terminalReason?: string | null;
  guessesUsed?: number | null;
  solveTimeBucket?: number | null;
  solveElapsedMs?: number | null;
};
type Standing = { participant: Participant; placement: number; placementGroup: number };
type RatingProfile = {
  id: string;
  rating: number;
  provisionalRemaining: number;
  peakRating?: number;
  ratingDeviation?: number;
  lastRatedAt?: Date | string | null;
};
type RatingEventRow = {
  id: string;
  participantId?: string | null;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  algorithmConfigVersion: string;
  metadata?: unknown;
  createdAt: Date | string;
};

function elapsedDays(value: Date | string | null | undefined, now: Date): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Math.floor(Math.max(0, now.getTime() - date.getTime()) / 86_400_000);
}

function metadata(event: RatingEventRow): Record<string, any> {
  return event.metadata && typeof event.metadata === 'object' ? event.metadata as Record<string, any> : {};
}

function standingsFor(participants: Participant[]): Standing[] {
  const outcome = validateSpeedAdjudication(participants.map((participant) => ({
    id: participant.id,
    result: participant.result,
    terminalReason: participant.terminalReason,
    guessesUsed: participant.guessesUsed,
    solveTimeBucket: participant.solveTimeBucket,
  })));
  const sorted = [...participants].sort((left, right) => {
    if (outcome.draw) return left.seatNumber - right.seatNumber;
    if (left.id === outcome.winnerId) return -1;
    if (right.id === outcome.winnerId) return 1;
    return left.seatNumber - right.seatNumber;
  });
  return sorted.map((participant, index) => ({
    participant,
    placement: outcome.draw ? 1 : index + 1,
    placementGroup: outcome.draw ? 1 : index + 1,
  }));
}

function ratingEventFromRows(matchId: string, idempotencyKey: string, events: RatingEventRow[]): RatingEventContract {
  const ordered = [...events].sort((left, right) => {
    const leftMetadata = metadata(left);
    const rightMetadata = metadata(right);
    return (leftMetadata.placement ?? Number.MAX_SAFE_INTEGER) - (rightMetadata.placement ?? Number.MAX_SAFE_INTEGER)
      || (leftMetadata.placementGroup ?? Number.MAX_SAFE_INTEGER) - (rightMetadata.placementGroup ?? Number.MAX_SAFE_INTEGER)
      || String(leftMetadata.userId ?? '').localeCompare(String(rightMetadata.userId ?? ''))
      || String(left.participantId ?? '').localeCompare(String(right.participantId ?? ''))
      || left.id.localeCompare(right.id);
  });
  const first = ordered[0];
  if (!first) throw new BadRequestException({ code: 'rating_event_missing', message: 'Rating event rows were expected but none were found.' });
  const firstMetadata = metadata(first);
  const createdAt = (first.createdAt instanceof Date ? first.createdAt : new Date(first.createdAt)).toISOString();
  return ratingEventContractSchema.parse({
    eventId: firstMetadata.logicalEventId ?? first.id,
    matchId,
    kind: SPEED_1V1_RATING_ALGORITHM_VERSION,
    status: 'applied',
    idempotencyKey: firstMetadata.logicalIdempotencyKey ?? idempotencyKey,
    algorithmVersion: SPEED_1V1_RATING_ALGORITHM_VERSION,
    defaultRating,
    participants: ordered.map((event) => {
      const value = metadata(event);
      return {
        userId: value.userId,
        ratingBefore: event.ratingBefore,
        ratingAfter: event.ratingAfter,
        ratingDelta: event.delta,
        placement: value.placement,
        placementGroup: value.placementGroup,
        provisional: value.provisional ?? false,
        ...(value.ratingDeviationBefore === undefined ? {} : { ratingDeviationBefore: value.ratingDeviationBefore }),
        ...(value.ratingDeviationAfter === undefined ? {} : { ratingDeviationAfter: value.ratingDeviationAfter }),
      };
    }),
    createdAt,
    appliedAt: createdAt,
  });
}

@Injectable()
export class SpeedRatingSettlementService {
  async finalizeInTransaction(tx: any, matchId: string, reason: SpeedSettlementReason, now: Date): Promise<RankedMatchResultSummary> {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException({ code: 'match_not_found', message: 'Match was not found.' });
    if (match.mode !== 'ranked' || match.rankedMode !== 'speed_1v1') {
      throw new BadRequestException({ code: 'ranked_mode_algorithm_mismatch', message: 'Speed settlement requires a ranked Speed match.' });
    }
    if (match.algorithmConfigVersion !== SPEED_1V1_RATING_ALGORITHM_VERSION) {
      throw new BadRequestException({
        code: 'ranked_mode_algorithm_mismatch',
        message: `Rating algorithm ${match.algorithmConfigVersion ?? 'none'} does not match ranked mode speed_1v1.`,
      });
    }
    if (match.rulesetVersion !== SPEED_1V1_RULESET_VERSION
      || match.adjudicationVersion !== SPEED_1V1_ADJUDICATION_VERSION
      || !match.adjudicatedAt
      || !match.completionReason
      || !['completed', 'voided'].includes(match.status)) {
      throw new BadRequestException({ code: 'speed_settlement_unavailable', message: 'Speed rating settlement requires a completed authoritative Speed adjudication.' });
    }

    const participants = await tx.matchParticipant.findMany({
      where: { matchId },
      orderBy: [{ finalScore: 'desc' }, { seatNumber: 'asc' }],
    }) as Participant[];
    if (participants.length !== 2) {
      throw new BadRequestException({ code: 'not_enough_players', message: 'Speed rating settlement requires exactly two participants.' });
    }
    const noContest = participants.some((participant) => participant.result === 'void'
      || participant.terminalReason === 'no_contest'
      || participant.terminalReason === 'operator_void');
    const standings = noContest
      ? [...participants].sort((left, right) => left.seatNumber - right.seatNumber).map((participant, index) => ({ participant, placement: index + 1, placementGroup: index + 1 }))
      : standingsFor(participants);
    const idempotencyKey = `rating:${matchId}:${SPEED_1V1_RATING_ALGORITHM_VERSION}`;
    const existing = await tx.ratingEvent.findMany({
      where: { matchId, algorithmConfigVersion: SPEED_1V1_RATING_ALGORITHM_VERSION, type: 'apply' },
      orderBy: { createdAt: 'asc' },
    }) as RatingEventRow[];
    if (existing.length > 0 && existing.length !== 2) {
      throw new BadRequestException({ code: 'incomplete_1v1_rating_settlement', message: '1v1 rating settlement is incomplete and requires operator repair.' });
    }
    const shouldSkip = reason === 'voided' || match.status === 'voided' || noContest || participants.some((participant) => participant.outcome === 'voided');
    const ratingEvent = existing.length > 0
      ? ratingEventFromRows(matchId, idempotencyKey, existing)
      : shouldSkip
        ? null
        : await this.apply(tx, matchId, now, standings, idempotencyKey);
    return await this.persistSummary(tx, match, matchId, reason, now, standings, ratingEvent);
  }

  reasonFromPersistedCompletion(completionReason: string | null | undefined): SpeedSettlementReason {
    const parsed = speedCompletionReasonSchema.safeParse(completionReason);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'speed_completion_identity_invalid', message: 'Completed Speed results require a recognized persisted completion identity.' });
    }
    if (parsed.data === 'all_players_terminal') return 'all_players_final';
    if (parsed.data === 'deadline') return 'timeout';
    if (parsed.data === 'forfeit') return 'forfeit';
    return 'voided';
  }

  private async profile(tx: any, userId: string): Promise<RatingProfile> {
    const key = { userId, mode: 'speed_1v1', algorithmConfigVersion: SPEED_1V1_RATING_ALGORITHM_VERSION };
    const existing = await tx.ratingProfile.findUnique({ where: { userId_mode_algorithmConfigVersion: key } }) as RatingProfile | null;
    if (existing) return existing;
    return await tx.ratingProfile.create({
      data: {
        userId,
        mode: 'speed_1v1',
        rating: defaultRating,
        matchesPlayed: 0,
        provisionalRemaining: defaultProvisionalGames,
        ratingDeviation: STANDARD_1V1_INITIAL_RATING_DEVIATION,
        algorithm: STANDARD_1V1_RATING_ALGORITHM,
        algorithmConfigVersion: SPEED_1V1_RATING_ALGORITHM_VERSION,
        status: 'active',
      },
    }) as RatingProfile;
  }

  private async apply(tx: any, matchId: string, now: Date, standings: Standing[], idempotencyKey: string): Promise<RatingEventContract> {
    const outcome = validateSpeedAdjudication(standings.map(({ participant }) => ({
      id: participant.id,
      result: participant.result,
      terminalReason: participant.terminalReason,
      guessesUsed: participant.guessesUsed,
      solveTimeBucket: participant.solveTimeBucket,
    })));
    const profiles = await Promise.all(standings.map(({ participant }) => this.profile(tx, participant.userId)));
    const settlement = calculateSpeed1v1Settlement({
      players: standings.map(({ participant }, index) => ({
        id: participant.id,
        rating: profiles[index]?.rating ?? defaultRating,
        ratingDeviation: profiles[index]?.ratingDeviation ?? STANDARD_1V1_INITIAL_RATING_DEVIATION,
        provisionalRemaining: profiles[index]?.provisionalRemaining ?? defaultProvisionalGames,
        inactiveDays: elapsedDays(profiles[index]?.lastRatedAt, now),
      })),
      outcome,
    });
    const eventId = randomUUID();
    const contractParticipants = [] as RatingEventContract['participants'];
    for (let index = 0; index < standings.length; index += 1) {
      const standing = standings[index]!;
      const profile = profiles[index]!;
      const value = settlement.players[index]!;
      const event = await tx.ratingEvent.create({
        data: {
          ratingProfileId: profile.id,
          matchId,
          participantId: standing.participant.id,
          type: 'apply',
          idempotencyKey: `${idempotencyKey}:${standing.participant.id}`,
          ratingBefore: value.ratingBefore,
          ratingAfter: value.ratingAfter,
          delta: value.delta,
          algorithm: SPEED_1V1_RATING_ALGORITHM,
          algorithmConfigVersion: SPEED_1V1_RATING_ALGORITHM_VERSION,
          metadata: {
            logicalEventId: eventId,
            logicalIdempotencyKey: idempotencyKey,
            kind: SPEED_1V1_RATING_ALGORITHM_VERSION,
            status: 'applied',
            mode: 'speed_1v1',
            userId: standing.participant.userId,
            placement: standing.placement,
            placementGroup: standing.placementGroup,
            provisional: value.provisionalBefore,
            ratingDeviationBefore: value.ratingDeviationBefore,
            ratingDeviationAfter: value.ratingDeviationAfter,
            expectedScore: value.expectedScore,
            actualScore: value.actualScore,
            roundingPolicy: settlement.roundingPolicy,
            settlementTotalDelta: settlement.totalDelta,
            settlementDriftBound: settlement.driftBound,
            terminalReason: standing.participant.terminalReason,
            guessesUsed: standing.participant.guessesUsed,
            solveTimeBucket: standing.participant.solveTimeBucket,
            persistedResult: standing.participant.result,
          },
          voidedByEventId: null,
          reversalOfEventId: null,
          createdAt: now,
        },
      });
      const isForfeit = standing.participant.terminalReason === 'forfeit';
      const isWin = !outcome.draw && outcome.winnerId === standing.participant.id;
      const isLoss = !outcome.draw && outcome.loserId === standing.participant.id;
      await tx.ratingProfile.update({
        where: { id: profile.id },
        data: {
          rating: value.ratingAfter,
          ratingDeviation: value.ratingDeviationAfter,
          matchesPlayed: { increment: 1 },
          provisionalRemaining: value.provisionalRemainingAfter,
          wins: { increment: isWin ? 1 : 0 },
          losses: { increment: isLoss ? 1 : 0 },
          draws: { increment: outcome.draw ? 1 : 0 },
          abandons: { increment: isForfeit ? 1 : 0 },
          peakRating: Math.max(profile.peakRating ?? profile.rating, value.ratingAfter),
          lastRatedAt: now,
        },
      });
      contractParticipants.push({
        userId: standing.participant.userId,
        ratingBefore: value.ratingBefore,
        ratingAfter: value.ratingAfter,
        ratingDelta: event.delta,
        placement: standing.placement,
        placementGroup: standing.placementGroup,
        provisional: value.provisionalBefore,
        ratingDeviationBefore: value.ratingDeviationBefore,
        ratingDeviationAfter: value.ratingDeviationAfter,
      });
    }
    return ratingEventContractSchema.parse({
      eventId,
      matchId,
      kind: SPEED_1V1_RATING_ALGORITHM_VERSION,
      status: 'applied',
      idempotencyKey,
      algorithmVersion: SPEED_1V1_RATING_ALGORITHM_VERSION,
      defaultRating,
      participants: contractParticipants,
      createdAt: now.toISOString(),
      appliedAt: now.toISOString(),
    });
  }

  private async persistSummary(
    tx: any,
    match: any,
    matchId: string,
    reason: SpeedSettlementReason,
    now: Date,
    standings: Standing[],
    ratingEvent: RatingEventContract | null,
  ): Promise<RankedMatchResultSummary> {
    for (const standing of standings) {
      await tx.matchParticipant.update({ where: { id: standing.participant.id }, data: { placement: standing.placement } });
    }
    const completedAt = match.completedAt ?? now;
    await tx.match.update({
      where: { id: matchId },
      data: {
        status: match.status === 'voided' ? 'voided' : 'completed',
        completedAt,
        voidReason: reason === 'voided' ? 'Rating not applied because match was voided.' : undefined,
      },
    });
    const finalStandings = standings.map((standing) => ({
      userId: standing.participant.userId,
      placement: standing.placement,
      placementGroup: standing.placementGroup,
      totalScore: standing.participant.finalScore,
      roundsSolved: standing.participant.outcome === 'solved' ? 1 : 0,
      totalValidGuesses: standing.participant.guessesUsed ?? 0,
      totalSolveMs: standing.participant.solveElapsedMs ?? 0,
      ratingBefore: ratingEvent?.participants.find((participant) => participant.userId === standing.participant.userId)?.ratingBefore ?? null,
      ratingAfter: ratingEvent?.participants.find((participant) => participant.userId === standing.participant.userId)?.ratingAfter ?? null,
      ratingDelta: ratingEvent?.participants.find((participant) => participant.userId === standing.participant.userId)?.ratingDelta ?? null,
      result: standing.participant.result ?? null,
      terminalReason: standing.participant.terminalReason ?? null,
      guessesUsed: standing.participant.guessesUsed ?? null,
      solveElapsedMs: standing.participant.solveElapsedMs ?? null,
    }));
    const summary = rankedMatchResultSummarySchema.parse({
      matchId,
      state: 'completed',
      rankedMode: 'speed_1v1',
      rulesetVersion: match.rulesetVersion,
      speedCompletionReason: match.completionReason,
      ratingAlgorithm: SPEED_1V1_RATING_ALGORITHM_VERSION,
      ratingAlgorithmConfigVersion: SPEED_1V1_RATING_ALGORITHM_VERSION,
      completedAt: (completedAt instanceof Date ? completedAt : new Date(completedAt)).toISOString(),
      completionReason: speedCompletionReasonSchema.parse(match.completionReason),
      finalStandings,
      ratingEvent,
      resultActions: {
        rematch: { available: false, reason: 'not_implemented', label: 'Create rematch lobby' },
        share: {
          spoilerSafe: true,
          text: `I finished a ranked Wordle Royale match: ${finalStandings.slice(0, 4).map((standing) => `#${standing.placement} ${standing.totalScore} pts`).join(', ')}.`,
          path: `/matches/${matchId}`,
        },
        links: {
          matchHref: `/matches/${matchId}`,
          historyHref: '/history',
          leaderboardHref: '/leaderboard',
          nextRankedHref: '/lobbies?mode=ranked&status=waiting',
          profileHrefTemplate: '/profile/{handle}',
        },
      },
    });
    await tx.matchReport.upsert({
      where: { matchId },
      create: {
        matchId,
        participantData: { finalStandings },
        publicSummary: summary,
        spoilerSafeShare: { matchId, finalStandings, ratingEvent: ratingEvent ? { idempotencyKey: ratingEvent.idempotencyKey, status: ratingEvent.status } : null },
        generatedAt: now,
      },
      update: {
        participantData: { finalStandings },
        publicSummary: summary,
        spoilerSafeShare: { matchId, finalStandings, ratingEvent: ratingEvent ? { idempotencyKey: ratingEvent.idempotencyKey, status: ratingEvent.status } : null },
        generatedAt: now,
      },
    });
    return summary;
  }
}
