import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { acceptedGuessResultSchema, rejectedGuessResultSchema, speedMatchSnapshotSchema } from '@wordle-royale/contracts';
import type { GuessResult, SpeedMatchSnapshot } from '@wordle-royale/contracts';
import { isSolved, scoreGuess, validateGuess } from '@wordle-royale/game-engine';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.ts';
import { SpeedOperationalReadinessService } from '../health/speed-operational-readiness.service.ts';
import { isRetryableTransactionError, isTransactionExpiryError } from '../matchmaking/matchmaking-lifecycle.ts';
import { speedQueueEnabled } from '../matchmaking/matchmaking-config.ts';
import { GameplayPersistenceService } from './gameplay-persistence.service.ts';
import {
  adjudicateSpeedParticipants,
  SPEED_1V1_ADJUDICATION_VERSION,
  SPEED_1V1_RULESET_VERSION,
  SPEED_COUNTDOWN_MS,
  SPEED_MAX_GUESSES,
  SPEED_INVITATION_WINDOW_MS,
  SPEED_READY_LIFECYCLE_V1,
  SPEED_READY_LIFECYCLE_V2,
  SPEED_READY_WINDOW_MS,
  SPEED_ROUND_TIME_MS,
  SPEED_SOLVE_BUCKET_MS,
  speedSolveElapsedMs,
  speedGuessWithinDeadline,
  speedSolveTimeBucket,
} from './speed-1v1-rules.ts';
import {
  SPEED_MUTATION_COMPLETION_RESERVE_MS,
  SPEED_MUTATION_LIFECYCLE_MS,
  SPEED_MUTATION_MAX_ATTEMPTS,
  SPEED_MUTATION_MIN_USEFUL_MS,
  speedMutationAttemptOptions,
  speedMutationRetryDelayMs,
} from './speed-mutation-policy.ts';

const ANSWER_SALT_REF = 'fixture-local-v1';
const SPEED_RATING_CONFIG_VERSION = 'speed_1v1_glicko_v1';

type CreateSpeedMatchInput = {
  dictionaryReleaseId: string;
  participantUserIds: [string, string] | string[];
  idempotencyKey: string;
  readyLifecycleVersion: typeof SPEED_READY_LIFECYCLE_V1 | typeof SPEED_READY_LIFECYCLE_V2;
  activationGeneration: bigint;
};

type SpeedParticipant = {
  id: string;
  userId: string;
  outcome: string;
  readyAt: Date | null;
  lastServerEventAt: Date | null;
  terminalAt: Date | null;
  terminalReason: 'solved' | 'max_guesses' | 'deadline_timeout' | 'forfeit' | 'awarded_forfeit_win' | 'no_contest' | 'operator_void' | null;
  guessesUsed: number | null;
  solveElapsedMs: number | null;
  solveTimeBucket: number | null;
  result: 'win' | 'loss' | 'draw' | 'void' | null;
};

function hashAnswer(dictionaryReleaseId: string, word: string): string {
  return createHash('sha256').update(`${ANSWER_SALT_REF}:${dictionaryReleaseId}:${word}`).digest('hex');
}

function requestHash(kind: string, payload: unknown): string {
  return createHash('sha256').update(JSON.stringify({ kind, payload })).digest('hex');
}

function addMs(value: Date, milliseconds: number): Date {
  return new Date(value.getTime() + milliseconds);
}

@Injectable()
export class SpeedGameplayService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GameplayPersistenceService) private readonly ratings: GameplayPersistenceService,
    @Inject(SpeedOperationalReadinessService) private readonly operational: SpeedOperationalReadinessService,
  ) {}

  async isSpeedMatch(matchId: string): Promise<boolean> {
    try {
      const match = await (this.prisma.client as any).match.findUnique({ where: { id: matchId }, select: { rankedMode: true } }) as { rankedMode: string | null } | null;
      return match?.rankedMode === 'speed_1v1';
    } catch (error) {
      if (speedQueueEnabled()) await this.assertOperationalDependencies();
      throw error;
    }
  }

  async createSpeedMatch(input: CreateSpeedMatchInput, tx: any): Promise<{ matchId: string; roundId: string; status: 'pending' }> {
    const users = [...new Set(input.participantUserIds)];
    if (users.length !== 2) throw new BadRequestException({ code: 'speed_requires_two_players', message: 'Speed 1v1 requires exactly two distinct players.' });
    if (input.activationGeneration < 1n) throw new ServiceUnavailableException({ code: 'speed_lifecycle_activation_unavailable', message: 'Speed lifecycle activation is temporarily unavailable.' });
    const now = await this.databaseNow(tx);
    const answer = await tx.dictionaryWord.findFirst({
      where: { dictionaryReleaseId: input.dictionaryReleaseId, kind: 'answer' },
      orderBy: { normalizedWord: 'asc' },
      select: { normalizedWord: true },
    }) as { normalizedWord: string } | null;
    if (!answer) throw new ServiceUnavailableException({ code: 'dictionary_release_unavailable', message: 'No approved dictionary release is available for Speed matchmaking.' });

    const match = await tx.match.create({
      data: {
        dictionaryReleaseId: input.dictionaryReleaseId,
        mode: 'ranked',
        rankedMode: 'speed_1v1',
        status: 'pending',
        algorithmConfigVersion: SPEED_RATING_CONFIG_VERSION,
        rulesetVersion: SPEED_1V1_RULESET_VERSION,
        readyLifecycleVersion: input.readyLifecycleVersion,
        createdAt: now,
        invitationExpiresAt: input.readyLifecycleVersion === SPEED_READY_LIFECYCLE_V2 ? addMs(now, SPEED_INVITATION_WINDOW_MS) : null,
        readyWindowStartedAt: null,
        readyDeadlineAt: input.readyLifecycleVersion === SPEED_READY_LIFECYCLE_V1 ? addMs(now, SPEED_READY_WINDOW_MS) : null,
        idempotencyKey: input.idempotencyKey,
        startedAt: null,
      },
    });
    await tx.matchParticipant.createMany({
      data: users.map((userId, index) => ({ matchId: match.id, userId, seatNumber: index + 1, outcome: 'pending', finalScore: 0 })),
    });
    const round = await tx.matchRound.create({
      data: {
        matchId: match.id,
        dictionaryReleaseId: input.dictionaryReleaseId,
        roundNumber: 1,
        answerWordHash: hashAnswer(input.dictionaryReleaseId, answer.normalizedWord),
        answerWordSaltRef: ANSWER_SALT_REF,
        maxAttempts: SPEED_MAX_GUESSES,
        startedAt: null,
        deadlineAt: null,
      },
    });
    return { matchId: match.id, roundId: round.id, status: 'pending' };
  }

  async markReady(matchId: string, userId: string, clientRequestId: string): Promise<SpeedMatchSnapshot> {
    const lifecycleStartedAt = performance.now();
    await this.assertMutationAvailable(lifecycleStartedAt);
    const result = await this.inTransaction(async (tx): Promise<{
      snapshot: SpeedMatchSnapshot;
      lateCode?: 'invitation_expired' | 'ready_deadline_passed';
    }> => {
      let state = await this.lockState(tx, matchId, userId);
      const hash = requestHash('speed_ready', {});
      // Operation lookup deliberately precedes clock acquisition/reconciliation:
      // a response-loss replay remains confirmable after a later expiry.
      const replay = await this.assertMutationReplay(tx, state.viewer.id, 'speed_ready', clientRequestId, hash);
      const now = await this.databaseNow(tx);
      if (replay) return { snapshot: await this.snapshotLocked(tx, state, now) };

      await this.reconcileLocked(tx, state, now);
      state = await this.loadLockedState(tx, matchId, userId);
      if (state.match.status === 'voided') {
        const snapshot = await this.snapshotLocked(tx, state, now);
        if (state.match.completionReason === 'pre_start_cancelled' || state.match.completionReason === 'operator_void') {
          return { snapshot };
        }
        const lateCode = state.match.completionReason === 'invitation_timeout'
          ? 'invitation_expired'
          : state.match.completionReason === 'ready_timeout'
            ? 'ready_deadline_passed'
            : undefined;
        return lateCode ? { snapshot, lateCode } : { snapshot };
      }
      if (state.match.adjudicatedAt) return { snapshot: await this.snapshotLocked(tx, state, now) };
      // A new logical id cannot replace the operation that originally marked
      // this participant ready or restart either lifecycle window.
      if (state.viewer.readyAt) return { snapshot: await this.snapshotLocked(tx, state, now) };

      await tx.matchParticipant.update({
        where: { id: state.viewer.id },
        data: { readyAt: now, lastServerEventAt: this.effectiveEventAt(now, state.round.startedAt, state.viewer.lastServerEventAt) },
      });
      if (this.lifecycleOf(state.match) === SPEED_READY_LIFECYCLE_V2 && !state.match.readyWindowStartedAt) {
        await tx.match.update({
          where: { id: matchId },
          data: { readyWindowStartedAt: now, readyDeadlineAt: addMs(now, SPEED_READY_WINDOW_MS) },
        });
      }
      const participants = await tx.matchParticipant.findMany({ where: { matchId }, orderBy: { id: 'asc' } }) as SpeedParticipant[];
      if (!state.match.startedAt && participants.length === 2 && participants.every((participant) => participant.readyAt)) {
        const startsAt = addMs(now, SPEED_COUNTDOWN_MS);
        await tx.match.updateMany({ where: { id: matchId, startedAt: null, status: 'pending' }, data: { startedAt: startsAt, status: 'active' } });
        await tx.matchRound.updateMany({ where: { id: state.round.id, startedAt: null }, data: { startedAt: startsAt, deadlineAt: addMs(startsAt, SPEED_ROUND_TIME_MS) } });
      }
      await this.recordMutation(tx, matchId, state.viewer.id, 'speed_ready', clientRequestId, hash, null);
      return { snapshot: await this.snapshotLocked(tx, await this.loadLockedState(tx, matchId, userId), await this.databaseNow(tx)) };
    }, lifecycleStartedAt);
    if (result.lateCode) {
      throw new ConflictException({
        code: result.lateCode,
        message: result.lateCode === 'invitation_expired' ? 'The Speed invitation has expired.' : 'The Speed ready window has passed.',
      });
    }
    return result.snapshot;
  }

  async submitGuess(input: { matchId: string; roundId: string; userId: string; guess: string; clientRequestId: string; clientSubmittedAt?: string }): Promise<GuessResult> {
    const lifecycleStartedAt = performance.now();
    await this.assertMutationAvailable(lifecycleStartedAt);
    return await this.inTransaction(async (tx) => {
      const state = await this.lockState(tx, input.matchId, input.userId);
      if (state.round.id !== input.roundId) throw new NotFoundException({ code: 'round_not_found', message: 'Round was not found for match.' });
      const now = await this.databaseNow(tx);
      const normalized = input.guess.trim().toLowerCase();
      const hash = requestHash('speed_guess', { roundId: input.roundId, guess: normalized });
      const replay = await this.assertMutationReplay(tx, state.viewer.id, 'speed_guess', input.clientRequestId, hash);
      if (replay) return replay as GuessResult;

      await this.reconcileLocked(tx, state, now);
      const fresh = await this.loadLockedState(tx, input.matchId, input.userId);
      if (fresh.round.deadlineAt && !speedGuessWithinDeadline(now, fresh.round.deadlineAt)) {
        return await this.persistRejected(tx, fresh, input.clientRequestId, hash, 'deadline_passed');
      }
      if (!fresh.round.startedAt || now.getTime() < fresh.round.startedAt.getTime() || fresh.match.status !== 'active') {
        return await this.persistRejected(tx, fresh, input.clientRequestId, hash, 'round_not_active');
      }
      if (!fresh.round.deadlineAt) {
        throw new ConflictException({ code: 'speed_ruleset_mismatch', message: 'The Speed round deadline is missing.' });
      }
      if (fresh.viewer.terminalReason) throw new ConflictException({ code: 'participant_terminal', message: 'This participant has already reached a terminal Speed state.' });

      const words = await tx.dictionaryWord.findMany({
        where: { dictionaryReleaseId: fresh.round.dictionaryReleaseId, kind: { in: ['answer', 'guess', 'banned'] } },
        orderBy: { normalizedWord: 'asc' },
      }) as Array<{ normalizedWord: string; kind: 'answer' | 'guess' | 'banned' }>;
      const answer = words.find((word) => word.kind === 'answer' && hashAnswer(fresh.round.dictionaryReleaseId, word.normalizedWord) === fresh.round.answerWordHash);
      if (!answer) throw new ServiceUnavailableException({ code: 'speed_ruleset_mismatch', message: 'The persisted Speed puzzle cannot be safely interpreted.' });
      const validation = validateGuess({
        guess: normalized,
        wordLength: 5,
        validGuesses: words.filter((word) => word.kind !== 'banned').map((word) => word.normalizedWord),
        bannedWords: words.filter((word) => word.kind === 'banned').map((word) => word.normalizedWord),
      });
      if (!validation.valid) return await this.persistRejected(tx, fresh, input.clientRequestId, hash, validation.reason);

      const priorAttempts = await tx.guessAttempt.count({ where: { roundId: fresh.round.id, participantId: fresh.viewer.id } }) as number;
      if (priorAttempts >= SPEED_MAX_GUESSES) throw new ConflictException({ code: 'participant_terminal', message: 'This participant has no Speed guesses remaining.' });
      const attemptNumber = priorAttempts + 1;
      const feedback = scoreGuess(answer.normalizedWord, validation.normalized);
      const solved = isSolved(feedback);
      const effectiveAt = this.effectiveEventAt(now, fresh.round.startedAt, fresh.viewer.lastServerEventAt);
      await tx.guessAttempt.create({
        data: {
          matchId: input.matchId,
          roundId: input.roundId,
          participantId: fresh.viewer.id,
          dictionaryReleaseId: fresh.round.dictionaryReleaseId,
          attemptNumber,
          normalizedGuess: validation.normalized,
          feedback,
          serverValidation: {
            valid: true,
            source: 'speed_1v1_server_db_clock_v1',
            rulesetVersion: SPEED_1V1_RULESET_VERSION,
            clientSubmittedAt: input.clientSubmittedAt ?? null,
          },
          scoreDelta: 0,
          submittedAt: effectiveAt,
          // GuessAttempt's legacy key is globally unique, while the public
          // Speed idempotency contract is participant-scoped. Namespace the
          // stored key so another participant or later match may safely reuse
          // the same client request UUID.
          idempotencyKey: `speed:${fresh.viewer.id}:${input.clientRequestId}`,
        },
      });
      const terminal = solved || attemptNumber === SPEED_MAX_GUESSES;
      if (terminal) {
        const elapsed = solved ? speedSolveElapsedMs(effectiveAt, fresh.round.startedAt) : null;
        await tx.matchParticipant.update({
          where: { id: fresh.viewer.id },
          data: {
            outcome: solved ? 'solved' : 'failed',
            terminalAt: effectiveAt,
            terminalReason: solved ? 'solved' : 'max_guesses',
            guessesUsed: attemptNumber,
            solveElapsedMs: elapsed,
            solveTimeBucket: elapsed === null ? null : speedSolveTimeBucket(elapsed),
            lastServerEventAt: effectiveAt,
          },
        });
        await this.adjudicateIfReady(tx, input.matchId, fresh.round.id, effectiveAt, 'all_players_terminal');
      } else {
        await tx.matchParticipant.update({ where: { id: fresh.viewer.id }, data: { lastServerEventAt: effectiveAt } });
      }

      const accepted = acceptedGuessResultSchema.parse({
        accepted: true,
        valid: true,
        clientRequestId: input.clientRequestId,
        guessNumber: attemptNumber,
        feedback,
        playerRoundState: solved ? 'solved' : attemptNumber === SPEED_MAX_GUESSES ? 'failed' : 'active',
        roundState: terminal ? 'finalizing' : 'active',
        score: 0,
        serverReceivedAt: effectiveAt.toISOString(),
      });
      await this.recordMutation(tx, input.matchId, fresh.viewer.id, 'speed_guess', input.clientRequestId, hash, accepted);
      return accepted;
    }, lifecycleStartedAt);
  }

  async forfeit(matchId: string, userId: string, clientRequestId: string): Promise<SpeedMatchSnapshot> {
    const lifecycleStartedAt = performance.now();
    await this.assertMutationAvailable(lifecycleStartedAt);
    return await this.inTransaction(async (tx) => {
      const state = await this.lockState(tx, matchId, userId);
      const now = await this.databaseNow(tx);
      const hash = requestHash('speed_forfeit', {});
      const replay = await this.assertMutationReplay(tx, state.viewer.id, 'speed_forfeit', clientRequestId, hash);
      await this.reconcileLocked(tx, state, now);
      let fresh = await this.loadLockedState(tx, matchId, userId);
      if (replay || fresh.match.adjudicatedAt) return await this.snapshotLocked(tx, fresh, now);
      if (fresh.viewer.terminalReason) throw new ConflictException({ code: 'participant_terminal', message: 'A terminal Speed participant cannot forfeit.' });

      if (!fresh.round.startedAt || now.getTime() < fresh.round.startedAt.getTime()) {
        await this.voidNoContest(tx, fresh, now, 'pre_start_cancelled');
      } else {
        const opponent = fresh.participants.find((participant: SpeedParticipant) => participant.id !== fresh.viewer.id)!;
        const effectiveAt = this.effectiveEventAt(now, fresh.round.startedAt, fresh.viewer.lastServerEventAt);
        await tx.matchParticipant.update({ where: { id: fresh.viewer.id }, data: { outcome: 'abandoned', terminalAt: effectiveAt, terminalReason: 'forfeit', lastServerEventAt: effectiveAt } });
        await tx.matchParticipant.update({ where: { id: opponent.id }, data: { terminalAt: effectiveAt, terminalReason: 'awarded_forfeit_win', lastServerEventAt: effectiveAt } });
        await this.adjudicateIfReady(tx, matchId, fresh.round.id, effectiveAt, 'forfeit', true);
      }
      await this.recordMutation(tx, matchId, fresh.viewer.id, 'speed_forfeit', clientRequestId, hash, null);
      fresh = await this.loadLockedState(tx, matchId, userId);
      return await this.snapshotLocked(tx, fresh, now);
    }, lifecycleStartedAt);
  }

  async getSnapshot(matchId: string, userId: string): Promise<SpeedMatchSnapshot> {
    await this.assertOperationalDependencies();
    return await this.inTransaction(async (tx) => {
      const state = await this.lockState(tx, matchId, userId);
      const now = await this.databaseNow(tx);
      await this.reconcileLocked(tx, state, now);
      return await this.snapshotLocked(tx, await this.loadLockedState(tx, matchId, userId), now);
    });
  }

  async reconcileDue(
    limit = 25,
    completionGuard?: () => boolean,
    beforeCommit?: () => Promise<void>,
  ): Promise<number> {
    await this.operational.assertDependenciesAvailable();
    return await this.inReconcilerTransaction(async (tx) => {
      const authoritativeClockSql = this.deterministicTestClockEnabled()
        ? '(SELECT "now" FROM "SpeedTimingTestClock" WHERE "id" = 1)'
        : 'clock_timestamp()';
      const due = await tx.$queryRawUnsafe(
        `WITH authoritative_clock AS (SELECT ${authoritativeClockSql} AS "now")
         SELECT match."id"
           FROM "Match" AS match
           LEFT JOIN "MatchRound" AS round ON round."matchId" = match."id" AND round."roundNumber" = 1
           CROSS JOIN authoritative_clock AS timing
          WHERE match."rankedMode" = 'speed_1v1'
            AND match."adjudicatedAt" IS NULL
            AND ((match."status" = 'pending' AND (
                  (match."readyLifecycleVersion" = 'speed_ready_v2_first_ack_90s'
                    AND match."readyWindowStartedAt" IS NULL
                    AND match."invitationExpiresAt" < timing."now")
               OR (match."readyLifecycleVersion" = 'speed_ready_v2_first_ack_90s'
                    AND match."readyWindowStartedAt" IS NOT NULL
                    AND match."readyDeadlineAt" < timing."now")
               OR (COALESCE(match."readyLifecycleVersion", 'speed_ready_v1_match_created_20s') = 'speed_ready_v1_match_created_20s'
                    AND match."readyDeadlineAt" < timing."now")))
              OR (match."status" = 'active' AND round."deadlineAt" < timing."now"))
          ORDER BY COALESCE(round."deadlineAt", match."readyDeadlineAt", match."invitationExpiresAt"), match."id"
          FOR UPDATE OF match SKIP LOCKED
          LIMIT $1`,
        limit,
      ) as Array<{ id: string }>;
      for (const row of due) {
        const state = await this.lockState(tx, row.id);
        await this.reconcileLocked(tx, state, await this.databaseNow(tx));
      }
      if (beforeCommit) await beforeCommit();
      // The scheduler epoch/generation must still own this pass immediately
      // before commit; otherwise throwing rolls back every expiry transition.
      if (completionGuard && !completionGuard()) throw new Error('obsolete_speed_reconciler_pass');
      return due.length;
    });
  }

  private async persistRejected(tx: any, state: any, clientRequestId: string, hash: string, reason: string): Promise<GuessResult> {
    const rejected = rejectedGuessResultSchema.parse({
      accepted: false,
      valid: false,
      clientRequestId,
      reason,
      attemptConsumed: false,
      playerRoundState: state.viewer.terminalReason === 'solved' ? 'solved' : state.viewer.terminalReason ? 'failed' : 'active',
    });
    await this.recordMutation(tx, state.match.id, state.viewer.id, 'speed_guess', clientRequestId, hash, rejected);
    return rejected;
  }

  private async reconcileLocked(tx: any, state: any, now: Date): Promise<void> {
    if (state.match.adjudicatedAt) return;
    if (state.match.status === 'pending') {
      const lifecycle = this.lifecycleOf(state.match);
      const invitationExpired = lifecycle === SPEED_READY_LIFECYCLE_V2
        && !state.match.readyWindowStartedAt
        && state.match.invitationExpiresAt
        && now.getTime() > state.match.invitationExpiresAt.getTime();
      const readyExpired = ((lifecycle === SPEED_READY_LIFECYCLE_V2 && state.match.readyWindowStartedAt)
        || lifecycle === SPEED_READY_LIFECYCLE_V1)
        && state.match.readyDeadlineAt
        && now.getTime() > state.match.readyDeadlineAt.getTime();
      if (invitationExpired || readyExpired) {
        await this.voidNoContest(tx, state, now, invitationExpired ? 'invitation_timeout' : 'ready_timeout');
        return;
      }
    }
    if (state.match.status === 'active' && state.round.deadlineAt && now.getTime() > state.round.deadlineAt.getTime()) {
      for (const participant of state.participants as SpeedParticipant[]) {
        if (!participant.terminalReason) {
          await tx.matchParticipant.update({
            where: { id: participant.id },
            data: { outcome: 'failed', terminalAt: now, terminalReason: 'deadline_timeout', lastServerEventAt: this.effectiveEventAt(now, state.round.startedAt, participant.lastServerEventAt) },
          });
        }
      }
      await this.adjudicateIfReady(tx, state.match.id, state.round.id, now, 'deadline');
    }
  }

  private async voidNoContest(tx: any, state: any, now: Date, reason: 'ready_timeout' | 'invitation_timeout' | 'pre_start_cancelled' | 'operator_void'): Promise<void> {
    if (state.match.adjudicatedAt) return;
    await tx.matchParticipant.updateMany({
      where: { matchId: state.match.id },
      data: { outcome: 'voided', terminalAt: now, terminalReason: reason === 'operator_void' ? 'operator_void' : 'no_contest', result: 'void', lastServerEventAt: now },
    });
    await tx.matchRound.update({ where: { id: state.round.id }, data: { completedAt: now } });
    await tx.match.update({
      where: { id: state.match.id },
      data: {
        status: 'voided',
        voidedAt: now,
        completedAt: now,
        adjudicatedAt: now,
        adjudicationVersion: SPEED_1V1_ADJUDICATION_VERSION,
        completionReason: reason,
        voidReason: reason,
      },
    });
    await this.ratings.finalizeRankedMatchRatingsInTransaction(tx, state.match.id, 'voided', now);
  }

  private async adjudicateIfReady(tx: any, matchId: string, roundId: string, now: Date, reason: 'all_players_terminal' | 'deadline' | 'forfeit', force = false): Promise<void> {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (match.adjudicatedAt) return;
    const participants = await tx.matchParticipant.findMany({ where: { matchId }, orderBy: { id: 'asc' } }) as SpeedParticipant[];
    if (participants.length !== 2 || (!force && participants.some((participant) => !participant.terminalReason))) return;
    const adjudication = adjudicateSpeedParticipants(participants.map((participant) => ({
      userId: participant.userId,
      terminalReason: participant.terminalReason!,
      guessesUsed: participant.guessesUsed,
      solveElapsedMs: participant.solveElapsedMs,
      solveTimeBucket: participant.solveTimeBucket,
    })));
    for (const participant of participants) {
      const result = adjudication.results[participant.userId]!;
      await tx.matchParticipant.update({
        where: { id: participant.id },
        data: {
          result,
          placement: result === 'win' ? 1 : result === 'loss' ? 2 : result === 'draw' ? 1 : null,
          outcome: result === 'void' ? 'voided' : participant.terminalReason === 'solved' ? 'solved' : participant.terminalReason === 'forfeit' ? 'abandoned' : participant.outcome,
        },
      });
    }
    await tx.matchRound.update({ where: { id: roundId }, data: { completedAt: now } });
    await tx.match.update({
      where: { id: matchId },
      data: {
        status: adjudication.rated ? 'completed' : 'voided',
        completedAt: now,
        ...(adjudication.rated ? {} : { voidedAt: now, voidReason: reason }),
        adjudicatedAt: now,
        adjudicationVersion: SPEED_1V1_ADJUDICATION_VERSION,
        completionReason: reason,
      },
    });
    await this.ratings.finalizeRankedMatchRatingsInTransaction(
      tx,
      matchId,
      reason === 'deadline' ? 'timeout' : reason === 'forfeit' ? 'forfeit' : 'all_players_final',
      now,
    );
  }

  private async lockState(tx: any, matchId: string, userId?: string): Promise<any> {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Match" WHERE "id" = $1 FOR UPDATE', matchId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "MatchRound" WHERE "matchId" = $1 ORDER BY "roundNumber" FOR UPDATE', matchId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "MatchParticipant" WHERE "matchId" = $1 ORDER BY "id" FOR UPDATE', matchId);
    return await this.loadLockedState(tx, matchId, userId);
  }

  private async loadLockedState(tx: any, matchId: string, userId?: string): Promise<any> {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException({ code: 'match_not_found', message: 'Match was not found.' });
    if (match.rankedMode !== 'speed_1v1' || match.rulesetVersion !== SPEED_1V1_RULESET_VERSION) {
      throw new ConflictException({ code: 'speed_ruleset_mismatch', message: 'This match is not compatible with the live Speed ruleset.' });
    }
    const round = await tx.matchRound.findFirst({ where: { matchId }, orderBy: { roundNumber: 'asc' } });
    const participants = await tx.matchParticipant.findMany({ where: { matchId }, orderBy: { id: 'asc' } }) as SpeedParticipant[];
    if (!round || participants.length !== 2) throw new ConflictException({ code: 'speed_ruleset_mismatch', message: 'The Speed match state is incomplete.' });
    const viewer = userId ? participants.find((participant) => participant.userId === userId) : participants[0];
    if (!viewer) throw new ForbiddenException({ code: 'match_participant_required', message: 'Only Speed match participants may access this state.' });
    return { match, round, participants, viewer };
  }

  private async snapshotLocked(tx: any, state: any, now: Date): Promise<SpeedMatchSnapshot> {
    const opponent = state.participants.find((participant: SpeedParticipant) => participant.id !== state.viewer.id) as SpeedParticipant;
    const guesses = await tx.guessAttempt.findMany({
      where: { matchId: state.match.id, participantId: state.viewer.id },
      orderBy: { attemptNumber: 'asc' },
    });
    const guessOperations = await tx.matchMutationRequest.findMany({
      where: { matchId: state.match.id, participantId: state.viewer.id, kind: 'speed_guess' },
      orderBy: { createdAt: 'asc' },
      select: { clientRequestId: true, resultSnapshot: true },
    }) as Array<{ clientRequestId: string; resultSnapshot: unknown }>;
    const operationIdByGuessNumber = new Map<number, string>();
    for (const operation of guessOperations) {
      const result = operation.resultSnapshot;
      if (result && typeof result === 'object' && 'accepted' in result && result.accepted === true && 'guessNumber' in result && typeof result.guessNumber === 'number') {
        operationIdByGuessNumber.set(result.guessNumber, operation.clientRequestId);
      }
    }
    const opponentGuessCount = await tx.guessAttempt.count({ where: { matchId: state.match.id, participantId: opponent.id } });
    const readyOperation = state.viewer.readyAt ? await tx.matchMutationRequest.findFirst({
      where: { matchId: state.match.id, participantId: state.viewer.id, kind: 'speed_ready' },
      orderBy: { createdAt: 'asc' },
      select: { clientRequestId: true },
    }) as { clientRequestId: string } | null : null;
    const lifecycle = this.lifecycleOf(state.match);
    const readyCount = state.participants.filter((participant: SpeedParticipant) => participant.readyAt).length;
    const derivedState = state.match.status === 'voided'
      ? 'voided'
      : state.match.status === 'completed'
        ? 'completed'
        : state.match.status === 'pending'
          ? lifecycle === SPEED_READY_LIFECYCLE_V2
            ? readyCount === 0 ? 'waiting_invitation' : 'waiting_opponent_ready'
            : 'waiting_ready'
          : state.match.startedAt && now.getTime() < state.match.startedAt.getTime()
            ? 'countdown'
            : 'in_progress';
    return speedMatchSnapshotSchema.parse({
      matchId: state.match.id,
      roundId: state.round.id,
      mode: 'speed_1v1',
      rulesetVersion: SPEED_1V1_RULESET_VERSION,
      state: derivedState,
      serverTime: now.toISOString(),
      readyLifecycleVersion: lifecycle,
      ...(lifecycle === SPEED_READY_LIFECYCLE_V2 ? {
        invitationExpiresAt: state.match.invitationExpiresAt.toISOString(),
        readyWindowStartedAt: state.match.readyWindowStartedAt?.toISOString() ?? null,
        readyDeadlineAt: state.match.readyDeadlineAt?.toISOString() ?? null,
      } : { readyDeadlineAt: state.match.readyDeadlineAt.toISOString() }),
      startsAt: state.match.startedAt?.toISOString() ?? null,
      deadlineAt: state.round.deadlineAt?.toISOString() ?? null,
      timeControl: { roundTimeMs: SPEED_ROUND_TIME_MS, solveTimeBucketMs: SPEED_SOLVE_BUCKET_MS, maxGuesses: SPEED_MAX_GUESSES },
      readiness: {
        phase: lifecycle === SPEED_READY_LIFECYCLE_V1 ? 'legacy' : readyCount === 0 ? 'invitation' : readyCount === 1 ? 'opponent_ready' : 'locked',
        viewerReady: Boolean(state.viewer.readyAt),
        readyCount,
        viewerReadyAt: state.viewer.readyAt?.toISOString() ?? null,
        viewerReadyOperationId: readyOperation?.clientRequestId ?? null,
      },
      myState: {
        acceptedGuesses: guesses.map((guess: any) => ({ clientRequestId: operationIdByGuessNumber.get(guess.attemptNumber), guess: guess.normalizedGuess, guessNumber: guess.attemptNumber, feedback: guess.feedback, submittedAt: guess.submittedAt.toISOString() })),
        terminalReason: state.viewer.terminalReason,
        guessesUsed: state.viewer.guessesUsed,
        solveElapsedMs: state.viewer.solveElapsedMs,
        result: state.viewer.result,
      },
      opponentProgress: { acceptedGuessCount: opponentGuessCount, terminal: Boolean(opponent.terminalReason) },
    });
  }

  private effectiveEventAt(dbNow: Date, startedAt?: Date | null, lastEventAt?: Date | null): Date {
    return new Date(Math.max(dbNow.getTime(), startedAt?.getTime() ?? 0, lastEventAt?.getTime() ?? 0));
  }

  private async databaseNow(tx: any): Promise<Date> {
    const rows = await tx.$queryRawUnsafe(this.deterministicTestClockEnabled()
      ? 'SELECT "now" FROM "SpeedTimingTestClock" WHERE "id" = 1'
      : 'SELECT clock_timestamp() AS "now"') as Array<{ now: Date }>;
    const now = rows[0]?.now;
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new ServiceUnavailableException({ code: 'speed_clock_unavailable', message: 'The authoritative Speed clock is unavailable.' });
    return now;
  }

  private deterministicTestClockEnabled(): boolean {
    return process.env.NODE_ENV === 'test'
      && process.env.APP_ENV === 'test'
      && (process.env.RUN_SPEED_TIMING_POSTGRES_INTEGRATION === '1'
        || process.env.RUN_SPEED_LIFECYCLE_RACE_POSTGRES_INTEGRATION === '1');
  }

  private async assertMutationReplay(tx: any, participantId: string, kind: string, clientRequestId: string, hash: string): Promise<unknown | null> {
    const existing = await tx.matchMutationRequest.findUnique({
      where: { participantId_kind_clientRequestId: { participantId, kind, clientRequestId } },
    });
    if (!existing) return null;
    if (existing.requestHash !== hash) throw new ConflictException({ code: 'idempotency_key_conflict', message: 'This request id was already used for different Speed input.' });
    return existing.resultSnapshot ?? {};
  }

  private async recordMutation(tx: any, matchId: string, participantId: string, kind: string, clientRequestId: string, hash: string, resultSnapshot: unknown): Promise<void> {
    await tx.matchMutationRequest.create({ data: { matchId, participantId, kind, clientRequestId, requestHash: hash, resultSnapshot: resultSnapshot ?? undefined } });
  }

  private lifecycleOf(match: { readyLifecycleVersion?: string | null; readyDeadlineAt?: Date | null }): typeof SPEED_READY_LIFECYCLE_V1 | typeof SPEED_READY_LIFECYCLE_V2 {
    if (match.readyLifecycleVersion === SPEED_READY_LIFECYCLE_V2) return SPEED_READY_LIFECYCLE_V2;
    // Null plus a persisted ready deadline is the only supported legacy classifier;
    // it is never upgraded or extended.
    if (match.readyLifecycleVersion === SPEED_READY_LIFECYCLE_V1 || (!match.readyLifecycleVersion && match.readyDeadlineAt)) return SPEED_READY_LIFECYCLE_V1;
    throw new ConflictException({ code: 'speed_ruleset_mismatch', message: 'The Speed ready lifecycle cannot be interpreted safely.' });
  }

  private async assertOperationalDependencies(): Promise<void> {
    const dependencyCheck = (this.operational as any).assertDependenciesAvailable;
    if (typeof dependencyCheck === 'function') {
      await dependencyCheck.call(this.operational);
      return;
    }
    await this.operational.assertAvailable();
  }

  private async assertMutationAvailable(lifecycleStartedAt: number): Promise<void> {
    const remainingMs = SPEED_MUTATION_LIFECYCLE_MS - (performance.now() - lifecycleStartedAt);
    if (remainingMs <= 0) {
      throw new ServiceUnavailableException({ code: 'speed_mutation_lifecycle_timeout', message: 'The Speed mutation lifecycle budget expired.' });
    }
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.assertOperationalDependencies(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new ServiceUnavailableException({
            code: 'speed_mutation_lifecycle_timeout',
            message: 'The Speed mutation lifecycle budget expired.',
          })), remainingMs);
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async inReconcilerTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    // Keep the database work strictly inside the two-second reconciler-health
    // envelope. A timed-out pass fails health closed and is generation-fenced.
    return await (this.prisma.client as any).$transaction(callback, {
      isolationLevel: 'Serializable',
      maxWait: 500,
      timeout: process.env.RUN_SPEED_LIFECYCLE_RACE_POSTGRES_INTEGRATION === '1'
        && this.deterministicTestClockEnabled()
        ? 10_000
        : 1_000,
    });
  }

  private async inTransaction<T>(callback: (tx: any) => Promise<T>, started = performance.now()): Promise<T> {
    for (let attempt = 1; attempt <= SPEED_MUTATION_MAX_ATTEMPTS; attempt += 1) {
      const remaining = SPEED_MUTATION_LIFECYCLE_MS - (performance.now() - started);
      if (remaining < SPEED_MUTATION_COMPLETION_RESERVE_MS + SPEED_MUTATION_MIN_USEFUL_MS) {
        throw new ServiceUnavailableException({ code: 'speed_mutation_lifecycle_timeout', message: 'The Speed mutation lifecycle budget expired.' });
      }
      try {
        return await (this.prisma.client as any).$transaction(callback, speedMutationAttemptOptions(remaining));
      } catch (error) {
        if (isTransactionExpiryError(error)) {
          const after = SPEED_MUTATION_LIFECYCLE_MS - (performance.now() - started);
          if (after < SPEED_MUTATION_COMPLETION_RESERVE_MS + SPEED_MUTATION_MIN_USEFUL_MS) {
            throw new ServiceUnavailableException({ code: 'speed_mutation_lifecycle_timeout', message: 'The Speed mutation lifecycle budget expired.' });
          }
          throw new ServiceUnavailableException({ code: 'speed_mutation_transaction_timeout', message: 'The Speed transaction expired.' });
        }
        if (isRetryableTransactionError(error) && attempt < SPEED_MUTATION_MAX_ATTEMPTS) {
          const delay = speedMutationRetryDelayMs(attempt);
          if (SPEED_MUTATION_LIFECYCLE_MS - (performance.now() - started) <= delay + SPEED_MUTATION_COMPLETION_RESERVE_MS + SPEED_MUTATION_MIN_USEFUL_MS) {
            throw new ServiceUnavailableException({ code: 'speed_mutation_lifecycle_timeout', message: 'The Speed mutation lifecycle budget expired.' });
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        if (isRetryableTransactionError(error)) throw new ServiceUnavailableException({ code: 'speed_gameplay_busy', message: 'Speed gameplay was busy resolving concurrent activity. Retry the request.' });
        throw error;
      }
    }
    throw new ServiceUnavailableException({ code: 'speed_gameplay_busy', message: 'Speed gameplay was busy resolving concurrent activity. Retry the request.' });
  }
}
