import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { calculateRoundScore, isSolved, scoreGuess, validateGuess } from '@wordle-royale/game-engine';
import { acceptedGuessResultSchema, currentRankedMatchStateResponseDataSchema, defaultProvisionalGames, defaultRankedMode, defaultRating, rankedMatchResultSummarySchema, rankedMatchStartResponseDataSchema, ratingEventContractSchema, rejectedGuessResultSchema, speedCompletionReasonSchema } from '@wordle-royale/contracts';
import type { AcceptedGuessResult, CurrentRankedMatchStateResponseData, GuessResult, RankedMatchResultSummary, RankedMatchStartResponseData, RatingEventContract, RejectedGuessResult } from '@wordle-royale/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.ts';
import {
  calculateStandard1v1Settlement,
  STANDARD_1V1_INITIAL_RATING_DEVIATION,
  STANDARD_1V1_RATING_ALGORITHM,
  STANDARD_1V1_RATING_ALGORITHM_VERSION,
} from '../rating/standard-1v1-rating.ts';
import {
  calculateSpeed1v1Settlement,
  SPEED_1V1_RATING_ALGORITHM,
  SPEED_1V1_RATING_ALGORITHM_VERSION,
  validateSpeedAdjudication,
} from '../rating/speed-1v1-rating.ts';
import { SPEED_1V1_ADJUDICATION_VERSION, SPEED_1V1_RULESET_VERSION } from './speed-1v1-rules.ts';

const ANSWER_SALT_REF = 'fixture-local-v1';
const ROUND_TIME_MS = 120_000;
const MAX_ATTEMPTS = 6;

type DictionaryWordKind = 'answer' | 'guess' | 'banned';

type DictionaryWordRecord = {
  id: string;
  dictionaryReleaseId: string;
  normalizedWord: string;
  kind: DictionaryWordKind;
};

type MatchRoundRecord = {
  id: string;
  matchId: string;
  dictionaryReleaseId: string;
  roundNumber: number;
  answerWordHash: string;
  answerWordSaltRef?: string | null;
  maxAttempts: number;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
};

type MatchParticipantRecord = {
  id: string;
  matchId: string;
  userId: string;
  seatNumber: number;
  outcome: string;
  placement?: number | null;
  finalScore: number;
  result?: 'win' | 'loss' | 'draw' | 'void' | null;
  terminalReason?: string | null;
  guessesUsed?: number | null;
  solveTimeBucket?: number | null;
  solveElapsedMs?: number | null;
};

export interface StartRankedMatchInput {
  dictionaryReleaseId: string;
  participantUserIds: string[];
  idempotencyKey: string;
  lobbyId?: string | null;
  rankedMode?: 'standard_1v1' | 'speed_1v1';
  now?: Date;
}

export interface StartRankedMatchResult {
  matchId: string;
  roundId: string;
  dictionaryReleaseId: string;
  participantCount: number;
  mode: 'ranked';
  status: 'active';
}

export interface SubmitGuessInput {
  matchId: string;
  roundId: string;
  participantId: string;
  guess: string;
  clientRequestId: string;
  now?: Date;
}

export interface FinalizeRankedMatchRatingsInput {
  matchId: string;
  reason?: 'all_players_final' | 'timeout' | 'forfeit' | 'abandoned' | 'voided';
  now?: Date;
}

export interface CompleteRankedMatchInput extends FinalizeRankedMatchRatingsInput {}

function finalizeReasonFromPersistedSpeedCompletion(completionReason: string | null | undefined): NonNullable<FinalizeRankedMatchRatingsInput['reason']> {
  const authoritativeReason = speedCompletionReasonSchema.safeParse(completionReason);
  if (!authoritativeReason.success) {
    throw new BadRequestException({
      code: 'speed_completion_identity_invalid',
      message: 'Completed Speed results require a recognized persisted completion identity.',
    });
  }

  switch (authoritativeReason.data) {
    case 'all_players_terminal': return 'all_players_final';
    case 'deadline': return 'timeout';
    case 'forfeit': return 'forfeit';
    case 'ready_timeout':
    case 'operator_void': return 'voided';
  }
}

export interface DevTerminalizeParticipantInput {
  matchId: string;
  userId: string;
  outcome: 'solved' | 'failed' | 'abandoned' | 'voided' | string;
  finalScore: number;
  now?: Date;
}

type MatchRecord = {
  id: string;
  mode: string;
  rankedMode?: string | null;
  status: string;
  algorithmConfigVersion?: string | null;
  rulesetVersion?: string | null;
  adjudicationVersion?: string | null;
  adjudicatedAt?: Date | string | null;
  completionReason?: string | null;
  completedAt?: Date | string | null;
};

type MatchReportRecord = {
  matchId: string;
  publicSummary?: unknown;
};

type RatingProfileRecord = {
  id: string;
  userId: string;
  mode: string;
  rating: number;
  matchesPlayed: number;
  provisionalRemaining: number;
  peakRating?: number;
  ratingDeviation?: number;
  ratingVolatility?: number | null;
  lastRatedAt?: Date | string | null;
  algorithm: string;
  algorithmConfigVersion: string;
};

type RatingEventRecord = {
  id: string;
  ratingProfileId: string;
  matchId?: string | null;
  participantId?: string | null;
  type: string;
  idempotencyKey: string;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  algorithm: string;
  algorithmConfigVersion: string;
  metadata?: unknown;
  voidedByEventId?: string | null;
  reversalOfEventId?: string | null;
  createdAt: Date | string;
};

type FinalStandingDraft = {
  participant: MatchParticipantRecord;
  placement: number;
  placementGroup: number;
};

function hashAnswer(dictionaryReleaseId: string, normalizedWord: string, saltRef = ANSWER_SALT_REF): string {
  return createHash('sha256').update(`${saltRef}:${dictionaryReleaseId}:${normalizedWord}`).digest('hex');
}

function iso(value: Date): string {
  return value.toISOString();
}

function elapsedMs(startedAt: Date | string | null | undefined, now: Date): number {
  if (!startedAt) return 0;
  const started = startedAt instanceof Date ? startedAt : new Date(startedAt);
  return Math.max(0, now.getTime() - started.getTime());
}

function elapsedDays(startedAt: Date | string | null | undefined, now: Date): number {
  return Math.floor(elapsedMs(startedAt, now) / 86_400_000);
}

function ratingIdempotencyKey(matchId: string, algorithmVersion: string): string {
  return `rating:${matchId}:${algorithmVersion}`;
}

function buildFinalStandings(participants: MatchParticipantRecord[]): FinalStandingDraft[] {
  const sorted = [...participants].sort((left, right) => {
    const leftAbandoned = left.outcome === 'abandoned';
    const rightAbandoned = right.outcome === 'abandoned';
    if (leftAbandoned !== rightAbandoned) return leftAbandoned ? 1 : -1;
    const scoreDelta = (right.finalScore ?? 0) - (left.finalScore ?? 0);
    if (scoreDelta !== 0) return scoreDelta;
    return left.seatNumber - right.seatNumber;
  });
  let priorScore: number | null = null;
  let priorAbandoned: boolean | null = null;
  let priorPlacement = 0;
  let placementGroup = 0;
  return sorted.map((participant, index) => {
    const score = participant.finalScore ?? 0;
    const abandoned = participant.outcome === 'abandoned';
    if (priorScore === null || score !== priorScore || abandoned !== priorAbandoned) {
      priorPlacement = index + 1;
      placementGroup += 1;
      priorScore = score;
      priorAbandoned = abandoned;
    }
    return { participant, placement: priorPlacement, placementGroup };
  });
}

function buildSpeedFinalStandings(participants: MatchParticipantRecord[]): FinalStandingDraft[] {
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

function placementDelta(placement: number, participantCount: number): number {
  if (participantCount <= 1) return 0;
  const midpoint = (participantCount + 1) / 2;
  return Math.round((midpoint - placement) * 32 / (participantCount - 1));
}

function buildResultActions(matchId: string, standings: Array<{ placement: number; totalScore: number }>): RankedMatchResultSummary['resultActions'] {
  const sharePlacements = standings
    .slice(0, 4)
    .map((standing) => `#${standing.placement} ${standing.totalScore} pts`)
    .join(', ');
  return {
    rematch: {
      available: false,
      reason: 'not_implemented',
      label: 'Create rematch lobby',
    },
    share: {
      spoilerSafe: true,
      text: `I finished a ranked Wordle Royale match: ${sharePlacements}.`,
      path: `/matches/${matchId}`,
    },
    links: {
      matchHref: `/matches/${matchId}`,
      historyHref: '/history',
      leaderboardHref: '/leaderboard',
      nextRankedHref: '/lobbies?mode=ranked&status=waiting',
      profileHrefTemplate: '/profile/{handle}',
    },
  };
}

function isTerminalParticipantOutcome(outcome: string): boolean {
  return outcome === 'solved' || outcome === 'failed' || outcome === 'abandoned' || outcome === 'voided';
}

async function upsertRatingProfile(tx: any, userId: string, algorithmVersion: string, mode: string = defaultRankedMode): Promise<RatingProfileRecord> {
  const existing = await tx.ratingProfile.findUnique({
    where: { userId_mode_algorithmConfigVersion: { userId, mode, algorithmConfigVersion: algorithmVersion } },
  }) as RatingProfileRecord | null;
  if (existing) return existing;

  const glicko1v1 = algorithmVersion === STANDARD_1V1_RATING_ALGORITHM_VERSION || algorithmVersion === SPEED_1V1_RATING_ALGORITHM_VERSION;
  return await tx.ratingProfile.create({
    data: {
      userId,
      mode,
      rating: defaultRating,
      matchesPlayed: 0,
      provisionalRemaining: defaultProvisionalGames,
      ratingDeviation: STANDARD_1V1_INITIAL_RATING_DEVIATION,
      algorithm: glicko1v1 ? STANDARD_1V1_RATING_ALGORITHM : 'placement_mmr_v1',
      algorithmConfigVersion: algorithmVersion,
      status: 'active',
    },
  }) as RatingProfileRecord;
}

function eventMetadata(event: RatingEventRecord): {
  logicalEventId?: string;
  logicalIdempotencyKey?: string;
  userId?: string;
  placement?: number;
  placementGroup?: number;
  provisional?: boolean;
  ratingDeviationBefore?: number;
  ratingDeviationAfter?: number;
} {
  return typeof event.metadata === 'object' && event.metadata !== null ? event.metadata as Record<string, never> : {};
}

function ratingEventFromRows(matchId: string, idempotencyKey: string, events: RatingEventRecord[]): RatingEventContract {
  const orderedEvents = [...events].sort((left, right) => {
    const leftMetadata = eventMetadata(left);
    const rightMetadata = eventMetadata(right);
    const placementDelta = (leftMetadata.placement ?? Number.MAX_SAFE_INTEGER) - (rightMetadata.placement ?? Number.MAX_SAFE_INTEGER);
    if (placementDelta !== 0) return placementDelta;
    const groupDelta = (leftMetadata.placementGroup ?? Number.MAX_SAFE_INTEGER) - (rightMetadata.placementGroup ?? Number.MAX_SAFE_INTEGER);
    if (groupDelta !== 0) return groupDelta;
    const userDelta = (leftMetadata.userId ?? '').localeCompare(rightMetadata.userId ?? '');
    if (userDelta !== 0) return userDelta;
    const participantDelta = (left.participantId ?? '').localeCompare(right.participantId ?? '');
    return participantDelta !== 0 ? participantDelta : left.id.localeCompare(right.id);
  });
  const firstEvent = orderedEvents[0];
  if (!firstEvent) {
    throw new BadRequestException({ code: 'rating_event_missing', message: 'Rating event rows were expected but none were found.' });
  }
  const firstMetadata = eventMetadata(firstEvent);
  const createdAt = firstEvent.createdAt instanceof Date ? firstEvent.createdAt.toISOString() : new Date(firstEvent.createdAt).toISOString();
  return ratingEventContractSchema.parse({
    eventId: firstMetadata.logicalEventId ?? firstEvent.id,
    matchId,
    kind: firstEvent.algorithmConfigVersion === STANDARD_1V1_RATING_ALGORITHM_VERSION
      ? 'standard_1v1_glicko_v1'
      : firstEvent.algorithmConfigVersion === SPEED_1V1_RATING_ALGORITHM_VERSION
        ? 'speed_1v1_glicko_v1'
        : 'placement_mmr_v1',
    status: 'applied',
    idempotencyKey: firstMetadata.logicalIdempotencyKey ?? idempotencyKey,
    algorithmVersion: firstEvent.algorithmConfigVersion === STANDARD_1V1_RATING_ALGORITHM_VERSION
      ? STANDARD_1V1_RATING_ALGORITHM_VERSION
      : firstEvent.algorithmConfigVersion === SPEED_1V1_RATING_ALGORITHM_VERSION
        ? SPEED_1V1_RATING_ALGORITHM_VERSION
        : 'placement_mmr_v1',
    defaultRating,
    participants: orderedEvents.map((event) => {
      const metadata = eventMetadata(event);
      return {
        userId: metadata.userId,
        ratingBefore: event.ratingBefore,
        ratingAfter: event.ratingAfter,
        ratingDelta: event.delta,
        placement: metadata.placement,
        placementGroup: metadata.placementGroup,
        provisional: metadata.provisional ?? false,
        ...(metadata.ratingDeviationBefore === undefined ? {} : { ratingDeviationBefore: metadata.ratingDeviationBefore }),
        ...(metadata.ratingDeviationAfter === undefined ? {} : { ratingDeviationAfter: metadata.ratingDeviationAfter }),
      };
    }),
    createdAt,
    appliedAt: createdAt,
  });
}

@Injectable()
export class GameplayPersistenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async startRankedMatch(input: StartRankedMatchInput, client: any = this.prisma.client): Promise<StartRankedMatchResult> {
    if (input.participantUserIds.length < 2) {
      throw new BadRequestException({ code: 'not_enough_players', message: 'Ranked matches require at least two participants.' });
    }

    const now = input.now ?? new Date();
    const answerWords = await this.loadDictionaryWords(input.dictionaryReleaseId, 'answer', client);
    const answer = answerWords[0];
    if (!answer) {
      throw new BadRequestException({ code: 'dictionary_missing_answers', message: 'Dictionary release has no answer words.' });
    }

    const match = await client.match.create({
      data: {
        lobbyId: input.lobbyId ?? null,
        dictionaryReleaseId: input.dictionaryReleaseId,
        mode: 'ranked',
        rankedMode: input.rankedMode ?? null,
        status: 'active',
        algorithmConfigVersion: input.rankedMode === 'standard_1v1'
          ? STANDARD_1V1_RATING_ALGORITHM_VERSION
          : input.rankedMode === 'speed_1v1'
            ? SPEED_1V1_RATING_ALGORITHM_VERSION
            : 'placement_mmr_v1',
        idempotencyKey: input.idempotencyKey,
        startedAt: now,
      },
    });

    await client.matchParticipant.createMany({
      data: input.participantUserIds.map((userId, index) => ({
        matchId: match.id,
        userId,
        seatNumber: index + 1,
        outcome: 'pending',
        finalScore: 0,
      })),
      skipDuplicates: true,
    });

    const round = await client.matchRound.create({
      data: {
        matchId: match.id,
        dictionaryReleaseId: input.dictionaryReleaseId,
        roundNumber: 1,
        answerWordHash: hashAnswer(input.dictionaryReleaseId, answer.normalizedWord),
        answerWordSaltRef: ANSWER_SALT_REF,
        maxAttempts: MAX_ATTEMPTS,
        startedAt: now,
      },
    });

    return {
      matchId: match.id,
      roundId: round.id,
      dictionaryReleaseId: input.dictionaryReleaseId,
      participantCount: input.participantUserIds.length,
      mode: 'ranked',
      status: 'active',
    };
  }

  async submitGuess(input: SubmitGuessInput): Promise<GuessResult> {
    const now = input.now ?? new Date();
    const round = await (this.prisma.client as any).matchRound.findUnique({ where: { id: input.roundId } }) as MatchRoundRecord | null;
    if (!round || round.matchId !== input.matchId) {
      throw new NotFoundException({ code: 'round_not_found', message: 'Round was not found for match.' });
    }
    if (round.completedAt) {
      throw new BadRequestException({ code: 'round_already_completed', message: 'Round already completed.' });
    }

    const participant = await (this.prisma.client as any).matchParticipant.findUnique({ where: { id: input.participantId } }) as MatchParticipantRecord | null;
    if (!participant || participant.matchId !== input.matchId) {
      throw new NotFoundException({ code: 'participant_not_found', message: 'Participant was not found for match.' });
    }

    const words = await this.loadDictionaryWords(round.dictionaryReleaseId, ['answer', 'guess', 'banned']);
    const answer = this.resolveAnswer(round, words);
    const guessWords = words.filter((word) => word.kind === 'guess' || word.kind === 'answer').map((word) => word.normalizedWord);
    const bannedWords = words.filter((word) => word.kind === 'banned').map((word) => word.normalizedWord);
    const validation = validateGuess({ guess: input.guess, wordLength: 5, validGuesses: guessWords, bannedWords });

    if (!validation.valid) {
      const rejected: RejectedGuessResult = rejectedGuessResultSchema.parse({
        accepted: false,
        valid: false,
        clientRequestId: input.clientRequestId,
        reason: validation.reason,
        attemptConsumed: false,
        playerRoundState: 'active',
      });
      return rejected;
    }

    const priorAttempts = await (this.prisma.client as any).guessAttempt.count({
      where: { roundId: input.roundId, participantId: input.participantId },
    }) as number;
    if (priorAttempts >= (round.maxAttempts ?? MAX_ATTEMPTS)) {
      throw new BadRequestException({ code: 'max_attempts_exhausted', message: 'Participant has no attempts remaining.' });
    }

    const attemptNumber = priorAttempts + 1;
    const feedback = scoreGuess(answer.normalizedWord, validation.normalized);
    const solved = isSolved(feedback);
    const score = calculateRoundScore({
      solved,
      validGuessCount: attemptNumber,
      roundTimeMs: ROUND_TIME_MS,
      elapsedMs: elapsedMs(round.startedAt, now),
    });
    const playerRoundState = solved ? 'solved' : attemptNumber >= (round.maxAttempts ?? MAX_ATTEMPTS) ? 'failed' : 'active';
    let roundState = playerRoundState === 'solved' ? 'completed' : 'active';

    await (this.prisma.client as any).guessAttempt.create({
      data: {
        matchId: input.matchId,
        roundId: input.roundId,
        participantId: input.participantId,
        dictionaryReleaseId: round.dictionaryReleaseId,
        attemptNumber,
        normalizedGuess: validation.normalized,
        feedback,
        serverValidation: { valid: true, source: 'server_authoritative_game_engine_v1' },
        scoreDelta: score.total,
        submittedAt: now,
        idempotencyKey: input.clientRequestId,
      },
    });

    await (this.prisma.client as any).scoreBreakdown.create({
      data: {
        matchId: input.matchId,
        roundId: input.roundId,
        participantId: input.participantId,
        category: 'round_score',
        points: score.total,
        details: score,
      },
    });

    if (playerRoundState !== 'active') {
      await (this.prisma.client as any).matchParticipant.update({
        where: { id: input.participantId },
        data: { outcome: playerRoundState, finalScore: score.total },
      });
    }

    if (playerRoundState !== 'active') {
      const matchCompleted = await this.completeRoundAndMatchIfAllParticipantsTerminal(input.matchId, input.roundId, now);
      if (matchCompleted) {
        roundState = 'completed';
      }
    }

    if (roundState === 'completed') {
      await (this.prisma.client as any).matchRound.update({ where: { id: input.roundId }, data: { completedAt: now } });
    }

    const accepted: AcceptedGuessResult = acceptedGuessResultSchema.parse({
      accepted: true,
      valid: true,
      clientRequestId: input.clientRequestId,
      guessNumber: attemptNumber,
      feedback,
      playerRoundState,
      roundState,
      score: score.total,
      serverReceivedAt: iso(now),
    });
    return accepted;
  }


  private async completeRoundAndMatchIfAllParticipantsTerminal(matchId: string, roundId: string, now: Date): Promise<boolean> {
    const participants = await (this.prisma.client as any).matchParticipant.findMany?.({ where: { matchId } }) as MatchParticipantRecord[] | undefined;
    if (!participants || participants.length === 0 || !participants.every((participant) => isTerminalParticipantOutcome(participant.outcome))) {
      return false;
    }

    await (this.prisma.client as any).matchRound.update?.({ where: { id: roundId }, data: { completedAt: now } });
    await (this.prisma.client as any).match.update?.({ where: { id: matchId }, data: { status: 'completed', completedAt: now } });
    return true;
  }

  async finalizeRankedMatchRatings(input: FinalizeRankedMatchRatingsInput): Promise<RankedMatchResultSummary> {
    const now = input.now ?? new Date();
    const reason = input.reason ?? 'all_players_final';
    const client = this.prisma.client as any;
    const run = async (tx: any) => this.finalizeRankedMatchRatingsInTransaction(tx, input.matchId, reason, now);
    if (typeof client.$transaction === 'function') {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await client.$transaction(run, { isolationLevel: 'Serializable' });
        } catch (error) {
          const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
          if ((code === 'P2002' || code === 'P2034') && attempt < 3) continue;
          throw error;
        }
      }
      throw new Error('Rating settlement retry loop exhausted unexpectedly.');
    }
    return await run(client);
  }

  async completeRankedMatch(input: CompleteRankedMatchInput): Promise<RankedMatchResultSummary> {
    const now = input.now ?? new Date();
    const reason = input.reason ?? 'all_players_final';
    const client = this.prisma.client as any;

    const run = async (tx: any) => {
      const match = await tx.match.findUnique({ where: { id: input.matchId } }) as MatchRecord | null;
      if (!match) {
        throw new NotFoundException({ code: 'match_not_found', message: 'Match was not found.' });
      }
      if (match.mode !== 'ranked') {
        throw new BadRequestException({ code: 'match_not_ranked', message: 'Only ranked matches can be completed through this endpoint.' });
      }

      if (reason === 'voided') {
        const existingRatingEvents = await tx.ratingEvent.findMany({ where: { matchId: input.matchId, type: 'apply' } }) as RatingEventRecord[];
        if (existingRatingEvents.length > 0) {
          throw new BadRequestException({
            code: 'match_already_rated',
            message: 'Already-rated matches require a future explicit rating reversal flow instead of void completion.',
          });
        }
        await tx.match.update({
          where: { id: input.matchId },
          data: { status: 'voided', voidedAt: now, voidReason: 'Match voided before rating finalization.' },
        });
        await tx.matchParticipant.updateMany?.({ where: { matchId: input.matchId, outcome: 'pending' }, data: { outcome: 'voided' } });
        return await this.finalizeRankedMatchRatingsInTransaction(tx, input.matchId, reason, now);
      }

      if (match.status !== 'completed') {
        const participants = await tx.matchParticipant.findMany({ where: { matchId: input.matchId } }) as MatchParticipantRecord[];
        const incompleteParticipants = participants.filter((participant) => !isTerminalParticipantOutcome(participant.outcome));
        if (participants.length < 2 || incompleteParticipants.length > 0) {
          throw new BadRequestException({
            code: 'match_not_ready_for_completion',
            message: 'Ranked match cannot be completed until every participant has a terminal outcome.',
            details: { pendingParticipantCount: incompleteParticipants.length },
          });
        }
      }

      return await this.finalizeRankedMatchRatingsInTransaction(tx, input.matchId, reason, now);
    };

    if (typeof client.$transaction === 'function') {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await client.$transaction(run, { isolationLevel: 'Serializable' });
        } catch (error) {
          const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
          if ((code === 'P2002' || code === 'P2034') && attempt < 3) continue;
          throw error;
        }
      }
      throw new Error('Ranked completion retry loop exhausted unexpectedly.');
    }
    return await run(client);
  }

  async getRankedMatchResult(matchId: string): Promise<RankedMatchResultSummary> {
    const match = await (this.prisma.client as any).match.findUnique({ where: { id: matchId } }) as MatchRecord | null;
    if (!match) {
      throw new NotFoundException({ code: 'match_not_found', message: 'Match was not found.' });
    }
    if (match.mode !== 'ranked') {
      throw new BadRequestException({ code: 'match_not_ranked', message: 'Only ranked matches produce result summaries.' });
    }
    const terminalSpeedResult = match.rankedMode === 'speed_1v1' && match.status === 'voided' && Boolean(match.adjudicatedAt);
    if (match.status !== 'completed' && !terminalSpeedResult) {
      throw new BadRequestException({
        code: 'match_result_not_ready',
        message: 'Result summary is only available after ranked match completion.',
      });
    }

    const report = await (this.prisma.client as any).matchReport.findUnique?.({ where: { matchId } }) as MatchReportRecord | null;
    if (report?.publicSummary && match.rankedMode !== 'speed_1v1') {
      return rankedMatchResultSummarySchema.parse(report.publicSummary);
    }

    const reason = match.rankedMode === 'speed_1v1'
      ? finalizeReasonFromPersistedSpeedCompletion(match.completionReason)
      : 'all_players_final';
    return await this.finalizeRankedMatchRatings({ matchId, reason });
  }

  async finalizeRankedMatchRatingsInTransaction(
    tx: any,
    matchId: string,
    reason: NonNullable<FinalizeRankedMatchRatingsInput['reason']>,
    now: Date,
  ): Promise<RankedMatchResultSummary> {
    const match = await tx.match.findUnique({ where: { id: matchId } }) as MatchRecord | null;
    if (!match) {
      throw new NotFoundException({ code: 'match_not_found', message: 'Match was not found.' });
    }
    if (match.mode !== 'ranked') {
      throw new BadRequestException({ code: 'match_not_ranked', message: 'Only ranked matches produce rating events.' });
    }

    const algorithmVersion = match.algorithmConfigVersion ?? 'placement_mmr_v1';
    if (algorithmVersion !== 'placement_mmr_v1' && algorithmVersion !== STANDARD_1V1_RATING_ALGORITHM_VERSION && algorithmVersion !== SPEED_1V1_RATING_ALGORITHM_VERSION) {
      throw new BadRequestException({ code: 'unsupported_rating_algorithm', message: 'Unsupported rating algorithm.' });
    }
    const expectedMode = algorithmVersion === STANDARD_1V1_RATING_ALGORITHM_VERSION
      ? 'standard_1v1'
      : algorithmVersion === SPEED_1V1_RATING_ALGORITHM_VERSION
        ? 'speed_1v1'
        : null;
    if (expectedMode && match.rankedMode !== expectedMode) {
      throw new BadRequestException({ code: 'ranked_mode_algorithm_mismatch', message: `Rating algorithm ${algorithmVersion} does not match ranked mode ${match.rankedMode ?? 'none'}.` });
    }
    if (algorithmVersion === SPEED_1V1_RATING_ALGORITHM_VERSION && (
      match.rulesetVersion !== SPEED_1V1_RULESET_VERSION
      || match.adjudicationVersion !== SPEED_1V1_ADJUDICATION_VERSION
      || !match.adjudicatedAt
      || !match.completionReason
      || !['completed', 'voided'].includes(match.status)
    )) {
      throw new BadRequestException({ code: 'speed_settlement_unavailable', message: 'Speed rating settlement requires a completed authoritative Speed adjudication.' });
    }

    const participants = await tx.matchParticipant.findMany({ where: { matchId }, orderBy: [{ finalScore: 'desc' }, { seatNumber: 'asc' }] }) as MatchParticipantRecord[];
    if (participants.length < 2 || (algorithmVersion === SPEED_1V1_RATING_ALGORITHM_VERSION && participants.length !== 2)) {
      throw new BadRequestException({ code: 'not_enough_players', message: algorithmVersion === SPEED_1V1_RATING_ALGORITHM_VERSION ? 'Speed rating settlement requires exactly two participants.' : 'Ranked rating finalization requires at least two participants.' });
    }

    const speedNoContest = algorithmVersion === SPEED_1V1_RATING_ALGORITHM_VERSION
      && participants.some((participant) => participant.result === 'void' || participant.terminalReason === 'no_contest' || participant.terminalReason === 'operator_void');
    const standings = algorithmVersion === SPEED_1V1_RATING_ALGORITHM_VERSION && !speedNoContest
      ? buildSpeedFinalStandings(participants)
      : buildFinalStandings(participants);
    const idempotencyKey = ratingIdempotencyKey(matchId, algorithmVersion);
    const existingEvents = await tx.ratingEvent.findMany({
      where: { matchId, algorithmConfigVersion: algorithmVersion, type: 'apply' },
      orderBy: { createdAt: 'asc' },
    }) as RatingEventRecord[];

    const shouldSkipRating = reason === 'voided' || match.status === 'voided' || speedNoContest || participants.some((participant) => participant.outcome === 'voided');
    if (existingEvents.length > 0) {
      if ((algorithmVersion === STANDARD_1V1_RATING_ALGORITHM_VERSION || algorithmVersion === SPEED_1V1_RATING_ALGORITHM_VERSION) && existingEvents.length !== 2) {
        throw new BadRequestException({
          code: 'incomplete_1v1_rating_settlement',
          message: '1v1 rating settlement is incomplete and requires operator repair.',
        });
      }
      const existingReport = await tx.matchReport.findUnique?.({ where: { matchId } }) as MatchReportRecord | null | undefined;
      if (existingReport?.publicSummary && match.rankedMode !== 'speed_1v1') {
        return rankedMatchResultSummarySchema.parse(existingReport.publicSummary);
      }
      const existingRatingEvent = ratingEventFromRows(matchId, idempotencyKey, existingEvents);
      return await this.persistRankedMatchResultSummary(tx, matchId, reason, now, standings, existingRatingEvent);
    }

    if (shouldSkipRating) {
      return await this.persistRankedMatchResultSummary(tx, matchId, reason, now, standings, null);
    }

    if (algorithmVersion === SPEED_1V1_RATING_ALGORITHM_VERSION) {
      const ratingEvent = await this.applySpeed1v1Settlement(tx, matchId, now, standings, idempotencyKey);
      return await this.persistRankedMatchResultSummary(tx, matchId, reason, now, standings, ratingEvent);
    }

    if (algorithmVersion === STANDARD_1V1_RATING_ALGORITHM_VERSION) {
      const ratingEvent = await this.applyStandard1v1Settlement(tx, matchId, now, standings, idempotencyKey);
      return await this.persistRankedMatchResultSummary(tx, matchId, reason, now, standings, ratingEvent);
    }

    const logicalEventId = randomUUID();
    const ratingParticipants = [] as RatingEventContract['participants'];

    for (const standing of standings) {
      const profile = await upsertRatingProfile(tx, standing.participant.userId, algorithmVersion);
      const delta = placementDelta(standing.placement, participants.length);
      const ratingBefore = profile.rating;
      const ratingAfter = ratingBefore + delta;
      const event = await tx.ratingEvent.create({
        data: {
          ratingProfileId: profile.id,
          matchId,
          participantId: standing.participant.id,
          type: 'apply',
          idempotencyKey: `${idempotencyKey}:${standing.participant.id}`,
          ratingBefore,
          ratingAfter,
          delta,
          algorithm: 'placement_mmr_v1',
          algorithmConfigVersion: algorithmVersion,
          metadata: {
            logicalEventId,
            logicalIdempotencyKey: idempotencyKey,
            kind: 'placement_mmr_v1',
            status: 'applied',
            userId: standing.participant.userId,
            placement: standing.placement,
            placementGroup: standing.placementGroup,
            provisional: profile.provisionalRemaining > 0,
          },
          voidedByEventId: null,
          reversalOfEventId: null,
          createdAt: now,
        },
      }) as RatingEventRecord;

      const isAbandon = standing.participant.outcome === 'abandoned';
      const isDraw = standings.length > 1 && standings.every((candidate) => candidate.placementGroup === standing.placementGroup);
      const isWin = !isAbandon && !isDraw && standing.placement === 1;
      const isLoss = !isAbandon && !isDraw && standing.placement !== 1;
      await tx.ratingProfile.update({
        where: { id: profile.id },
        data: {
          rating: ratingAfter,
          matchesPlayed: { increment: 1 },
          provisionalRemaining: { decrement: profile.provisionalRemaining > 0 ? 1 : 0 },
          wins: { increment: isWin ? 1 : 0 },
          losses: { increment: isLoss ? 1 : 0 },
          draws: { increment: isDraw ? 1 : 0 },
          abandons: { increment: isAbandon ? 1 : 0 },
          peakRating: Math.max(profile.rating, ratingAfter),
          lastRatedAt: now,
        },
      });

      ratingParticipants.push({
        userId: standing.participant.userId,
        ratingBefore,
        ratingAfter,
        ratingDelta: event.delta,
        placement: standing.placement,
        placementGroup: standing.placementGroup,
        provisional: profile.provisionalRemaining > 0,
      });
    }

    const ratingEvent = ratingEventContractSchema.parse({
      eventId: logicalEventId,
      matchId,
      kind: 'placement_mmr_v1',
      status: 'applied',
      idempotencyKey,
      algorithmVersion,
      defaultRating,
      participants: ratingParticipants,
      createdAt: iso(now),
      appliedAt: iso(now),
    });

    return await this.persistRankedMatchResultSummary(tx, matchId, reason, now, standings, ratingEvent);
  }

  private async applySpeed1v1Settlement(
    tx: any,
    matchId: string,
    now: Date,
    standings: FinalStandingDraft[],
    idempotencyKey: string,
  ): Promise<RatingEventContract> {
    if (standings.length !== 2) {
      throw new BadRequestException({ code: 'speed_1v1_requires_two_players', message: 'Speed 1v1 rating settlement requires exactly two players.' });
    }
    const outcome = validateSpeedAdjudication(standings.map((standing) => ({
      id: standing.participant.id,
      result: standing.participant.result,
      terminalReason: standing.participant.terminalReason,
      guessesUsed: standing.participant.guessesUsed,
      solveTimeBucket: standing.participant.solveTimeBucket,
    })));
    const profiles = await Promise.all(standings.map((standing) => upsertRatingProfile(
      tx,
      standing.participant.userId,
      SPEED_1V1_RATING_ALGORITHM_VERSION,
      'speed_1v1',
    )));
    const settlement = calculateSpeed1v1Settlement({
      players: standings.map((standing, index) => ({
        id: standing.participant.id,
        rating: profiles[index]?.rating ?? defaultRating,
        ratingDeviation: profiles[index]?.ratingDeviation ?? STANDARD_1V1_INITIAL_RATING_DEVIATION,
        provisionalRemaining: profiles[index]?.provisionalRemaining ?? defaultProvisionalGames,
        inactiveDays: elapsedDays(profiles[index]?.lastRatedAt, now),
      })),
      outcome,
    });

    const logicalEventId = randomUUID();
    const ratingParticipants = [] as RatingEventContract['participants'];
    for (let index = 0; index < standings.length; index += 1) {
      const standing = standings[index]!;
      const profile = profiles[index]!;
      const playerSettlement = settlement.players[index]!;
      const event = await tx.ratingEvent.create({
        data: {
          ratingProfileId: profile.id,
          matchId,
          participantId: standing.participant.id,
          type: 'apply',
          idempotencyKey: `${idempotencyKey}:${standing.participant.id}`,
          ratingBefore: playerSettlement.ratingBefore,
          ratingAfter: playerSettlement.ratingAfter,
          delta: playerSettlement.delta,
          algorithm: SPEED_1V1_RATING_ALGORITHM,
          algorithmConfigVersion: SPEED_1V1_RATING_ALGORITHM_VERSION,
          metadata: {
            logicalEventId,
            logicalIdempotencyKey: idempotencyKey,
            kind: SPEED_1V1_RATING_ALGORITHM_VERSION,
            status: 'applied',
            mode: 'speed_1v1',
            userId: standing.participant.userId,
            placement: standing.placement,
            placementGroup: standing.placementGroup,
            provisional: playerSettlement.provisionalBefore,
            ratingDeviationBefore: playerSettlement.ratingDeviationBefore,
            ratingDeviationAfter: playerSettlement.ratingDeviationAfter,
            expectedScore: playerSettlement.expectedScore,
            actualScore: playerSettlement.actualScore,
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
      }) as RatingEventRecord;

      const isForfeit = standing.participant.terminalReason === 'forfeit';
      const isWin = !outcome.draw && outcome.winnerId === standing.participant.id;
      const isLoss = !outcome.draw && outcome.loserId === standing.participant.id;
      await tx.ratingProfile.update({
        where: { id: profile.id },
        data: {
          rating: playerSettlement.ratingAfter,
          ratingDeviation: playerSettlement.ratingDeviationAfter,
          matchesPlayed: { increment: 1 },
          provisionalRemaining: playerSettlement.provisionalRemainingAfter,
          wins: { increment: isWin ? 1 : 0 },
          losses: { increment: isLoss ? 1 : 0 },
          draws: { increment: outcome.draw ? 1 : 0 },
          abandons: { increment: isForfeit ? 1 : 0 },
          peakRating: Math.max(profile.peakRating ?? profile.rating, playerSettlement.ratingAfter),
          lastRatedAt: now,
        },
      });

      ratingParticipants.push({
        userId: standing.participant.userId,
        ratingBefore: playerSettlement.ratingBefore,
        ratingAfter: playerSettlement.ratingAfter,
        ratingDelta: event.delta,
        placement: standing.placement,
        placementGroup: standing.placementGroup,
        provisional: playerSettlement.provisionalBefore,
        ratingDeviationBefore: playerSettlement.ratingDeviationBefore,
        ratingDeviationAfter: playerSettlement.ratingDeviationAfter,
      });
    }

    return ratingEventContractSchema.parse({
      eventId: logicalEventId,
      matchId,
      kind: SPEED_1V1_RATING_ALGORITHM_VERSION,
      status: 'applied',
      idempotencyKey,
      algorithmVersion: SPEED_1V1_RATING_ALGORITHM_VERSION,
      defaultRating,
      participants: ratingParticipants,
      createdAt: iso(now),
      appliedAt: iso(now),
    });
  }

  private async applyStandard1v1Settlement(
    tx: any,
    matchId: string,
    now: Date,
    standings: FinalStandingDraft[],
    idempotencyKey: string,
  ): Promise<RatingEventContract> {
    if (standings.length !== 2) {
      throw new BadRequestException({ code: 'standard_1v1_requires_two_players', message: 'Standard 1v1 rating settlement requires exactly two players.' });
    }

    const [first, second] = standings;
    if (!first || !second) {
      throw new BadRequestException({ code: 'standard_1v1_requires_two_players', message: 'Standard 1v1 rating settlement requires exactly two players.' });
    }
    const abandoned = standings.filter((standing) => standing.participant.outcome === 'abandoned');
    if (abandoned.length > 1) {
      throw new BadRequestException({ code: 'ambiguous_standard_1v1_abandon', message: 'A double-abandon result must be voided instead of rated.' });
    }
    const isDraw = abandoned.length === 0 && first.placementGroup === second.placementGroup;
    const loser = abandoned[0] ?? (isDraw ? null : second);
    const winner = isDraw ? null : standings.find((standing) => standing.participant.id !== loser?.participant.id) ?? first;

    const profiles = await Promise.all(standings.map((standing) => upsertRatingProfile(
      tx,
      standing.participant.userId,
      STANDARD_1V1_RATING_ALGORITHM_VERSION,
    )));
    const settlement = calculateStandard1v1Settlement({
      players: standings.map((standing, index) => ({
        id: standing.participant.id,
        rating: profiles[index]?.rating ?? defaultRating,
        ratingDeviation: profiles[index]?.ratingDeviation ?? STANDARD_1V1_INITIAL_RATING_DEVIATION,
        provisionalRemaining: profiles[index]?.provisionalRemaining ?? defaultProvisionalGames,
        inactiveDays: elapsedDays(profiles[index]?.lastRatedAt, now),
      })),
      outcome: {
        winnerId: winner?.participant.id ?? null,
        loserId: loser?.participant.id ?? null,
        draw: isDraw,
        abandonedPlayerId: abandoned[0]?.participant.id ?? null,
      },
    });

    const logicalEventId = randomUUID();
    const ratingParticipants = [] as RatingEventContract['participants'];
    for (let index = 0; index < standings.length; index += 1) {
      const standing = standings[index]!;
      const profile = profiles[index]!;
      const playerSettlement = settlement.players[index]!;
      const event = await tx.ratingEvent.create({
        data: {
          ratingProfileId: profile.id,
          matchId,
          participantId: standing.participant.id,
          type: 'apply',
          idempotencyKey: `${idempotencyKey}:${standing.participant.id}`,
          ratingBefore: playerSettlement.ratingBefore,
          ratingAfter: playerSettlement.ratingAfter,
          delta: playerSettlement.delta,
          algorithm: STANDARD_1V1_RATING_ALGORITHM,
          algorithmConfigVersion: STANDARD_1V1_RATING_ALGORITHM_VERSION,
          metadata: {
            logicalEventId,
            logicalIdempotencyKey: idempotencyKey,
            kind: 'standard_1v1_glicko_v1',
            status: 'applied',
            mode: 'standard_1v1',
            userId: standing.participant.userId,
            placement: standing.placement,
            placementGroup: standing.placementGroup,
            provisional: playerSettlement.provisionalBefore,
            ratingDeviationBefore: playerSettlement.ratingDeviationBefore,
            ratingDeviationAfter: playerSettlement.ratingDeviationAfter,
            expectedScore: playerSettlement.expectedScore,
            actualScore: playerSettlement.actualScore,
            roundingPolicy: settlement.roundingPolicy,
            settlementTotalDelta: settlement.totalDelta,
            settlementDriftBound: settlement.driftBound,
            abandoned: standing.participant.outcome === 'abandoned',
          },
          voidedByEventId: null,
          reversalOfEventId: null,
          createdAt: now,
        },
      }) as RatingEventRecord;

      const isAbandon = standing.participant.outcome === 'abandoned';
      const isWin = !isDraw && winner?.participant.id === standing.participant.id;
      const isLoss = !isDraw && loser?.participant.id === standing.participant.id;
      await tx.ratingProfile.update({
        where: { id: profile.id },
        data: {
          rating: playerSettlement.ratingAfter,
          ratingDeviation: playerSettlement.ratingDeviationAfter,
          matchesPlayed: { increment: 1 },
          provisionalRemaining: playerSettlement.provisionalRemainingAfter,
          wins: { increment: isWin ? 1 : 0 },
          losses: { increment: isLoss ? 1 : 0 },
          draws: { increment: isDraw ? 1 : 0 },
          abandons: { increment: isAbandon ? 1 : 0 },
          peakRating: Math.max(profile.peakRating ?? profile.rating, playerSettlement.ratingAfter),
          lastRatedAt: now,
        },
      });

      ratingParticipants.push({
        userId: standing.participant.userId,
        ratingBefore: playerSettlement.ratingBefore,
        ratingAfter: playerSettlement.ratingAfter,
        ratingDelta: event.delta,
        placement: standing.placement,
        placementGroup: standing.placementGroup,
        provisional: playerSettlement.provisionalBefore,
        ratingDeviationBefore: playerSettlement.ratingDeviationBefore,
        ratingDeviationAfter: playerSettlement.ratingDeviationAfter,
      });
    }

    return ratingEventContractSchema.parse({
      eventId: logicalEventId,
      matchId,
      kind: 'standard_1v1_glicko_v1',
      status: 'applied',
      idempotencyKey,
      algorithmVersion: STANDARD_1V1_RATING_ALGORITHM_VERSION,
      defaultRating,
      participants: ratingParticipants,
      createdAt: iso(now),
      appliedAt: iso(now),
    });
  }

  private async persistRankedMatchResultSummary(
    tx: any,
    matchId: string,
    reason: NonNullable<FinalizeRankedMatchRatingsInput['reason']>,
    now: Date,
    standings: FinalStandingDraft[],
    ratingEvent: RatingEventContract | null,
  ): Promise<RankedMatchResultSummary> {
    const match = await tx.match.findUnique({ where: { id: matchId } }) as MatchRecord | null;
    if (!match) {
      throw new NotFoundException({ code: 'match_not_found', message: 'Match was not found.' });
    }
    for (const standing of standings) {
      await tx.matchParticipant.update({
        where: { id: standing.participant.id },
        data: { placement: standing.placement },
      });
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
      ...(match.rankedMode === 'speed_1v1' ? {
        result: standing.participant.result ?? null,
        terminalReason: standing.participant.terminalReason ?? null,
        guessesUsed: standing.participant.guessesUsed ?? null,
        solveElapsedMs: standing.participant.solveElapsedMs ?? null,
      } : {}),
    }));

    const publicCompletionReason = match.rankedMode === 'speed_1v1'
      ? speedCompletionReasonSchema.parse(match.completionReason)
      : reason;
    const summary = rankedMatchResultSummarySchema.parse({
      matchId,
      state: 'completed',
      rankedMode: match.rankedMode ?? null,
      rulesetVersion: match.rulesetVersion ?? null,
      speedCompletionReason: match.rankedMode === 'speed_1v1' ? match.completionReason ?? null : null,
      ratingAlgorithm: match.algorithmConfigVersion === SPEED_1V1_RATING_ALGORITHM_VERSION
        ? SPEED_1V1_RATING_ALGORITHM_VERSION
        : match.algorithmConfigVersion === STANDARD_1V1_RATING_ALGORITHM_VERSION
          ? STANDARD_1V1_RATING_ALGORITHM_VERSION
          : ratingEvent?.algorithmVersion ?? null,
      ratingAlgorithmConfigVersion: match.algorithmConfigVersion ?? ratingEvent?.algorithmVersion ?? null,
      completedAt: iso(completedAt instanceof Date ? completedAt : new Date(completedAt)),
      completionReason: publicCompletionReason,
      finalStandings,
      ratingEvent,
      resultActions: buildResultActions(matchId, finalStandings),
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

  async startRankedMatchFromLobby(input: {
    lobbyId: string;
    clientRequestId: string;
    currentUserId: string;
    dictionaryReleaseId?: string;
  }): Promise<RankedMatchStartResponseData> {
    const lobby = await (this.prisma.client as any).lobby.findUnique({ where: { id: input.lobbyId } }) as { id: string; status: string; settings?: unknown } | null;
    if (!lobby) {
      throw new NotFoundException({ code: 'lobby_not_found', message: 'Lobby was not found.', details: { lobbyId: input.lobbyId } });
    }

    const members = this.readLobbyMemberUserIds(lobby.settings);
    if (!members.includes(input.currentUserId)) {
      throw new ForbiddenException({ code: 'not_lobby_member', message: 'Current local stub user is not a member of this lobby.' });
    }
    if (members.length < 2) {
      throw new BadRequestException({ code: 'not_enough_players', message: 'Ranked matches require at least two lobby members.' });
    }
    await this.ensureLocalStubParticipants(members);

    const dictionaryReleaseId = input.dictionaryReleaseId ?? await this.defaultDictionaryReleaseId();
    const started = await this.startRankedMatch({
      lobbyId: input.lobbyId,
      dictionaryReleaseId,
      participantUserIds: members,
      idempotencyKey: input.clientRequestId,
    });

    await (this.prisma.client as any).lobby.update?.({ where: { id: input.lobbyId }, data: { status: 'in_match' } });
    const snapshot = await this.getMatchSnapshot(started.matchId, input.currentUserId);
    return rankedMatchStartResponseDataSchema.parse({ matchId: started.matchId, roundId: started.roundId, state: 'in_progress', snapshot });
  }

  async getParticipantForUser(matchId: string, userId: string): Promise<MatchParticipantRecord> {
    const participant = await (this.prisma.client as any).matchParticipant.findFirst({ where: { matchId, userId } }) as MatchParticipantRecord | null;
    if (!participant) {
      throw new NotFoundException({ code: 'participant_not_found', message: 'Current local stub user is not a participant in this match.' });
    }
    return participant;
  }

  async devTerminalizeParticipant(input: DevTerminalizeParticipantInput): Promise<CurrentRankedMatchStateResponseData> {
    if (!isTerminalParticipantOutcome(input.outcome)) {
      throw new BadRequestException({
        code: 'invalid_terminal_outcome',
        message: 'Dev terminalization requires a terminal participant outcome.',
        details: { allowedOutcomes: ['solved', 'failed', 'abandoned', 'voided'] },
      });
    }

    const now = input.now ?? new Date();
    const participant = await this.getParticipantForUser(input.matchId, input.userId);
    await (this.prisma.client as any).matchParticipant.update({
      where: { id: participant.id },
      data: { outcome: input.outcome, finalScore: Math.max(0, Math.trunc(input.finalScore)) },
    });

    const rounds = await (this.prisma.client as any).matchRound.findMany({ where: { matchId: input.matchId }, orderBy: { roundNumber: 'desc' }, take: 1 }) as MatchRoundRecord[];
    const round = rounds[0];
    if (round) {
      await this.completeRoundAndMatchIfAllParticipantsTerminal(input.matchId, round.id, now);
    }

    return await this.getMatchSnapshot(input.matchId, input.userId, now);
  }

  async getMatchSnapshot(matchId: string, currentUserId: string, now = new Date()): Promise<CurrentRankedMatchStateResponseData> {
    const match = await (this.prisma.client as any).match.findUnique({ where: { id: matchId } }) as { id: string; status: string; dictionaryReleaseId: string } | null;
    if (!match) {
      throw new NotFoundException({ code: 'match_not_found', message: 'Ranked match was not found.', details: { matchId } });
    }

    const rounds = await (this.prisma.client as any).matchRound.findMany({ where: { matchId }, orderBy: { roundNumber: 'desc' }, take: 1 }) as MatchRoundRecord[];
    const currentRound = rounds[0] ?? null;
    const participants = await (this.prisma.client as any).matchParticipant.findMany({ where: { matchId }, orderBy: { seatNumber: 'asc' } }) as MatchParticipantRecord[];
    const currentParticipant = participants.find((participant) => participant.userId === currentUserId) ?? null;
    const attempts = currentParticipant && currentRound
      ? await (this.prisma.client as any).guessAttempt.findMany({ where: { roundId: currentRound.id, participantId: currentParticipant.id }, orderBy: { attemptNumber: 'asc' } }) as Array<{ normalizedGuess: string; attemptNumber: number; feedback: unknown; scoreDelta: number; submittedAt: Date | string }>
      : [];
    const dictionaryRelease = currentRound
      ? await (this.prisma.client as any).dictionaryRelease.findUnique?.({ where: { id: currentRound.dictionaryReleaseId } }) as { version?: string } | null
      : null;

    const startsAt = currentRound?.startedAt ? new Date(currentRound.startedAt) : now;
    const endsAt = new Date(startsAt.getTime() + ROUND_TIME_MS);
    const myScore = currentParticipant?.finalScore ?? attempts.reduce((total, attempt) => total + (attempt.scoreDelta ?? 0), 0);

    return currentRankedMatchStateResponseDataSchema.parse({
      matchId: match.id,
      state: this.toContractMatchState(match.status),
      serverTime: iso(now),
      currentRound: currentRound ? {
        roundId: currentRound.id,
        roundNumber: currentRound.roundNumber,
        state: currentRound.completedAt ? 'completed' : 'active',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        wordLength: 5,
        maxGuesses: currentRound.maxAttempts ?? MAX_ATTEMPTS,
        dictionaryVersion: dictionaryRelease?.version ?? currentRound.dictionaryReleaseId,
      } : null,
      myState: currentParticipant ? {
        guesses: attempts.map((attempt) => ({
          guess: attempt.normalizedGuess,
          guessNumber: attempt.attemptNumber,
          feedback: attempt.feedback,
          submittedAt: attempt.submittedAt instanceof Date ? attempt.submittedAt.toISOString() : attempt.submittedAt,
        })),
        playerRoundState: currentParticipant.outcome === 'pending' ? 'active' : currentParticipant.outcome,
        score: myScore,
      } : null,
      standings: participants.map((participant) => ({
        userId: participant.userId,
        placement: participant.placement ?? null,
        totalScore: participant.finalScore ?? 0,
        roundsSolved: participant.outcome === 'solved' ? 1 : 0,
        totalValidGuesses: 0,
        totalSolveMs: 0,
      })),
    });
  }

  private readLobbyMemberUserIds(settings: unknown): string[] {
    const value = typeof settings === 'object' && settings !== null ? settings as { members?: Array<{ userId?: unknown }> } : {};
    return (value.members ?? []).map((member) => member.userId).filter((userId): userId is string => typeof userId === 'string');
  }

  private async ensureLocalStubParticipants(userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      const isGuest = userId.startsWith('22222222-');
      const displayName = isGuest ? 'Guest Player' : 'Player One';
      const handle = isGuest ? 'guest_player' : 'player_one';
      await (this.prisma.client as any).userAccount?.upsert?.({
        where: { id: userId },
        update: { displayName, status: 'active' },
        create: { id: userId, email: null, displayName, status: 'active' },
      });
      await (this.prisma.client as any).userProfile?.upsert?.({
        where: { userId },
        update: { publicHandle: handle, avatarUrl: null },
        create: { userId, publicHandle: handle, avatarUrl: null },
      });
    }
  }

  private async defaultDictionaryReleaseId(): Promise<string> {
    const release = await (this.prisma.client as any).dictionaryRelease.findFirst({
      where: { status: { in: ['active', 'draft'] }, wordLength: 5 },
      orderBy: { releasedAt: 'desc' },
    }) as { id: string } | null;
    if (!release) {
      throw new BadRequestException({ code: 'dictionary_release_unavailable', message: 'No active local dictionary release is available for ranked play.' });
    }
    return release.id;
  }

  private toContractMatchState(status: string): CurrentRankedMatchStateResponseData['state'] {
    if (status === 'pending') return 'initializing';
    if (status === 'active') return 'in_progress';
    if (status === 'cancelled') return 'cancelled';
    if (status === 'voided') return 'voided';
    if (status === 'completed') return 'completed';
    return 'in_progress';
  }

  private async loadDictionaryWords(dictionaryReleaseId: string, kind: DictionaryWordKind | DictionaryWordKind[], client: any = this.prisma.client): Promise<DictionaryWordRecord[]> {
    const where = Array.isArray(kind) ? { dictionaryReleaseId, kind: { in: kind } } : { dictionaryReleaseId, kind };
    return await client.dictionaryWord.findMany({ where, orderBy: { normalizedWord: 'asc' } }) as DictionaryWordRecord[];
  }

  private resolveAnswer(round: MatchRoundRecord, words: DictionaryWordRecord[]): DictionaryWordRecord {
    const saltRef = round.answerWordSaltRef ?? ANSWER_SALT_REF;
    const answer = words
      .filter((word) => word.kind === 'answer')
      .find((word) => hashAnswer(round.dictionaryReleaseId, word.normalizedWord, saltRef) === round.answerWordHash);
    if (!answer) {
      throw new BadRequestException({ code: 'answer_unavailable', message: 'Server could not resolve the round answer from dictionary metadata.' });
    }
    return answer;
  }
}

export const gameplayPersistenceInternals = { hashAnswer, ANSWER_SALT_REF };
