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
  SPEED_READY_WINDOW_MS,
  SPEED_ROUND_TIME_MS,
  SPEED_SOLVE_BUCKET_MS,
  speedSolveElapsedMs,
  speedGuessWithinDeadline,
  speedSolveTimeBucket,
} from './speed-1v1-rules.ts';

const ANSWER_SALT_REF = 'fixture-local-v1';
const SPEED_RATING_CONFIG_VERSION = 'speed_1v1_glicko_v1';
const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 20_000 } as const;

type CreateSpeedMatchInput = {
  dictionaryReleaseId: string;
  participantUserIds: [string, string] | string[];
  idempotencyKey: string;
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
      if (speedQueueEnabled()) await this.operational.assertAvailable();
      throw error;
    }
  }

  async createSpeedMatch(input: CreateSpeedMatchInput, tx: any): Promise<{ matchId: string; roundId: string; status: 'pending' }> {
    const users = [...new Set(input.participantUserIds)];
    if (users.length !== 2) throw new BadRequestException({ code: 'speed_requires_two_players', message: 'Speed 1v1 requires exactly two distinct players.' });
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
        readyDeadlineAt: addMs(now, SPEED_READY_WINDOW_MS),
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
    await this.operational.assertAvailable();
    return await this.inTransaction(async (tx) => {
      const state = await this.lockState(tx, matchId, userId);
      const now = await this.databaseNow(tx);
      await this.reconcileLocked(tx, state, now);
      const fresh = await this.loadLockedState(tx, matchId, userId);
      if (fresh.match.status === 'voided') throw new ConflictException({ code: 'ready_deadline_passed', message: 'The Speed ready window has passed and the match is a no-contest.' });
      if (fresh.match.adjudicatedAt) return await this.snapshotLocked(tx, fresh, now);

      const hash = requestHash('speed_ready', {});
      const replay = await this.assertMutationReplay(tx, fresh.viewer.id, 'speed_ready', clientRequestId, hash);
      if (replay) return await this.snapshotLocked(tx, fresh, now);
      if (!fresh.viewer.readyAt) {
        await tx.matchParticipant.update({ where: { id: fresh.viewer.id }, data: { readyAt: now, lastServerEventAt: this.effectiveEventAt(now, fresh.round.startedAt, fresh.viewer.lastServerEventAt) } });
      }
      const participants = await tx.matchParticipant.findMany({ where: { matchId }, orderBy: { id: 'asc' } }) as SpeedParticipant[];
      if (!fresh.match.startedAt && participants.length === 2 && participants.every((participant) => participant.readyAt)) {
        const startsAt = addMs(now, SPEED_COUNTDOWN_MS);
        await tx.match.updateMany({
          where: { id: matchId, startedAt: null, status: 'pending' },
          data: { startedAt: startsAt, status: 'active' },
        });
        await tx.matchRound.updateMany({
          where: { id: fresh.round.id, startedAt: null },
          data: { startedAt: startsAt, deadlineAt: addMs(startsAt, SPEED_ROUND_TIME_MS) },
        });
      }
      await this.recordMutation(tx, matchId, fresh.viewer.id, 'speed_ready', clientRequestId, hash, null);
      return await this.snapshotLocked(tx, await this.loadLockedState(tx, matchId, userId), await this.databaseNow(tx));
    });
  }

  async submitGuess(input: { matchId: string; roundId: string; userId: string; guess: string; clientRequestId: string; clientSubmittedAt?: string }): Promise<GuessResult> {
    await this.operational.assertAvailable();
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
    });
  }

  async forfeit(matchId: string, userId: string, clientRequestId: string): Promise<SpeedMatchSnapshot> {
    await this.operational.assertAvailable();
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
        await this.voidNoContest(tx, fresh, now, 'ready_timeout');
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
    });
  }

  async getSnapshot(matchId: string, userId: string): Promise<SpeedMatchSnapshot> {
    await this.operational.assertAvailable();
    return await this.inTransaction(async (tx) => {
      const state = await this.lockState(tx, matchId, userId);
      const now = await this.databaseNow(tx);
      await this.reconcileLocked(tx, state, now);
      return await this.snapshotLocked(tx, await this.loadLockedState(tx, matchId, userId), now);
    });
  }

  async reconcileDue(limit = 25): Promise<number> {
    await this.operational.assertDependenciesAvailable();
    return await this.inTransaction(async (tx) => {
      const due = await tx.$queryRawUnsafe(
        `SELECT match."id"
           FROM "Match" AS match
           LEFT JOIN "MatchRound" AS round ON round."matchId" = match."id" AND round."roundNumber" = 1
          WHERE match."rankedMode" = 'speed_1v1'
            AND match."adjudicatedAt" IS NULL
            AND ((match."status" = 'pending' AND match."readyDeadlineAt" <= clock_timestamp())
              OR (match."status" = 'active' AND round."deadlineAt" <= clock_timestamp()))
          ORDER BY COALESCE(round."deadlineAt", match."readyDeadlineAt"), match."id"
          FOR UPDATE OF match SKIP LOCKED
          LIMIT $1`,
        limit,
      ) as Array<{ id: string }>;
      for (const row of due) {
        const state = await this.lockState(tx, row.id);
        await this.reconcileLocked(tx, state, await this.databaseNow(tx));
      }
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
    if (state.match.status === 'pending' && state.match.readyDeadlineAt && now.getTime() >= state.match.readyDeadlineAt.getTime()) {
      await this.voidNoContest(tx, state, now, 'ready_timeout');
      return;
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

  private async voidNoContest(tx: any, state: any, now: Date, reason: 'ready_timeout' | 'operator_void'): Promise<void> {
    if (state.match.adjudicatedAt) return;
    await tx.matchParticipant.updateMany({
      where: { matchId: state.match.id },
      data: { outcome: 'voided', terminalAt: now, terminalReason: reason === 'ready_timeout' ? 'no_contest' : 'operator_void', result: 'void', lastServerEventAt: now },
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
    const derivedState = state.match.status === 'voided'
      ? 'voided'
      : state.match.status === 'completed'
        ? 'completed'
        : state.match.status === 'pending'
          ? 'waiting_ready'
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
      readyDeadlineAt: state.match.readyDeadlineAt.toISOString(),
      startsAt: state.match.startedAt?.toISOString() ?? null,
      deadlineAt: state.round.deadlineAt?.toISOString() ?? null,
      timeControl: { roundTimeMs: SPEED_ROUND_TIME_MS, solveTimeBucketMs: SPEED_SOLVE_BUCKET_MS, maxGuesses: SPEED_MAX_GUESSES },
      readiness: { viewerReady: Boolean(state.viewer.readyAt), readyCount: state.participants.filter((participant: SpeedParticipant) => participant.readyAt).length },
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
    const deterministicTestClock = process.env.NODE_ENV === 'test'
      && process.env.APP_ENV === 'test'
      && process.env.RUN_SPEED_TIMING_POSTGRES_INTEGRATION === '1';
    const rows = await tx.$queryRawUnsafe(deterministicTestClock
      ? 'SELECT "now" FROM "SpeedTimingTestClock" WHERE "id" = 1'
      : 'SELECT clock_timestamp() AS "now"') as Array<{ now: Date }>;
    const now = rows[0]?.now;
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new ServiceUnavailableException({ code: 'speed_clock_unavailable', message: 'The authoritative Speed clock is unavailable.' });
    return now;
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

  private async inTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await (this.prisma.client as any).$transaction(callback, TX_OPTIONS);
      } catch (error) {
        if (isTransactionExpiryError(error)) throw new ServiceUnavailableException({ code: 'matchmaking_transaction_timeout', message: 'Matchmaking took too long to complete. Retry the request.' });
        if (isRetryableTransactionError(error) && attempt < 3) continue;
        if (isRetryableTransactionError(error)) throw new ServiceUnavailableException({ code: 'speed_gameplay_busy', message: 'Speed gameplay was busy resolving concurrent activity. Retry the request.' });
        throw error;
      }
    }
    throw new ServiceUnavailableException({ code: 'speed_gameplay_busy', message: 'Speed gameplay was busy resolving concurrent activity. Retry the request.' });
  }
}
