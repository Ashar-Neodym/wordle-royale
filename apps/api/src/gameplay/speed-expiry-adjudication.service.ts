import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { SpeedRatingSettlementService } from './speed-rating-settlement.service.ts';
import {
  adjudicateSpeedParticipants,
  SPEED_1V1_ADJUDICATION_VERSION,
  SPEED_1V1_RULESET_VERSION,
  SPEED_READY_LIFECYCLE_V1,
  SPEED_READY_LIFECYCLE_V2,
} from './speed-1v1-rules.ts';

export type SpeedParticipant = {
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

@Injectable()
export class SpeedExpiryAdjudicationService {
  constructor(@Inject(SpeedRatingSettlementService) private readonly ratings: SpeedRatingSettlementService) {}

  async reconcileMatch(tx: any, matchId: string): Promise<void> {
    const state = await this.lockState(tx, matchId);
    await this.reconcileLocked(tx, state, await this.databaseNow(tx));
  }

  async reconcileLocked(tx: any, state: any, now: Date): Promise<void> {
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
            data: {
              outcome: 'failed',
              terminalAt: now,
              terminalReason: 'deadline_timeout',
              lastServerEventAt: this.effectiveEventAt(now, state.round.startedAt, participant.lastServerEventAt),
            },
          });
        }
      }
      await this.adjudicateIfReady(tx, state.match.id, state.round.id, now, 'deadline');
    }
  }

  async voidNoContest(
    tx: any,
    state: any,
    now: Date,
    reason: 'ready_timeout' | 'invitation_timeout' | 'pre_start_cancelled' | 'operator_void',
  ): Promise<void> {
    if (state.match.adjudicatedAt) return;
    await tx.matchParticipant.updateMany({
      where: { matchId: state.match.id },
      data: {
        outcome: 'voided',
        terminalAt: now,
        terminalReason: reason === 'operator_void' ? 'operator_void' : 'no_contest',
        result: 'void',
        lastServerEventAt: now,
      },
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
    await this.ratings.finalizeInTransaction(tx, state.match.id, 'voided', now);
  }

  async adjudicateIfReady(
    tx: any,
    matchId: string,
    roundId: string,
    now: Date,
    reason: 'all_players_terminal' | 'deadline' | 'forfeit',
    force = false,
  ): Promise<void> {
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
          outcome: result === 'void'
            ? 'voided'
            : participant.terminalReason === 'solved'
              ? 'solved'
              : participant.terminalReason === 'forfeit'
                ? 'abandoned'
                : participant.outcome,
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
    await this.ratings.finalizeInTransaction(
      tx,
      matchId,
      reason === 'deadline' ? 'timeout' : reason === 'forfeit' ? 'forfeit' : 'all_players_final',
      now,
    );
  }

  effectiveEventAt(dbNow: Date, startedAt?: Date | null, lastEventAt?: Date | null): Date {
    return new Date(Math.max(dbNow.getTime(), startedAt?.getTime() ?? 0, lastEventAt?.getTime() ?? 0));
  }

  lifecycleOf(match: { readyLifecycleVersion?: string | null; readyDeadlineAt?: Date | null }): typeof SPEED_READY_LIFECYCLE_V1 | typeof SPEED_READY_LIFECYCLE_V2 {
    if (match.readyLifecycleVersion === SPEED_READY_LIFECYCLE_V2) return SPEED_READY_LIFECYCLE_V2;
    if (match.readyLifecycleVersion === SPEED_READY_LIFECYCLE_V1 || (!match.readyLifecycleVersion && match.readyDeadlineAt)) {
      return SPEED_READY_LIFECYCLE_V1;
    }
    throw new ConflictException({ code: 'speed_ruleset_mismatch', message: 'The Speed ready lifecycle cannot be interpreted safely.' });
  }

  private async lockState(tx: any, matchId: string): Promise<any> {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Match" WHERE "id" = $1 FOR UPDATE', matchId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "MatchRound" WHERE "matchId" = $1 ORDER BY "roundNumber" FOR UPDATE', matchId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "MatchParticipant" WHERE "matchId" = $1 ORDER BY "id" FOR UPDATE', matchId);
    const match = await tx.match.findUnique({ where: { id: matchId } });
    const round = await tx.matchRound.findFirst({ where: { matchId }, orderBy: { roundNumber: 'asc' } });
    const participants = await tx.matchParticipant.findMany({ where: { matchId }, orderBy: { id: 'asc' } }) as SpeedParticipant[];
    if (!match || match.rankedMode !== 'speed_1v1' || match.rulesetVersion !== SPEED_1V1_RULESET_VERSION || !round || participants.length !== 2) {
      throw new ConflictException({ code: 'speed_ruleset_mismatch', message: 'The Speed match state is incomplete or incompatible.' });
    }
    return { match, round, participants, viewer: participants[0] };
  }

  private async databaseNow(tx: any): Promise<Date> {
    const sql = this.deterministicTestClockEnabled()
      ? 'SELECT "now" FROM "SpeedTimingTestClock" WHERE "id" = 1'
      : 'SELECT clock_timestamp() AS "now"';
    const rows = await tx.$queryRawUnsafe(sql) as Array<{ now: Date }>;
    if (!rows[0]?.now) throw new Error('speed_database_clock_unavailable');
    return rows[0].now;
  }

  private deterministicTestClockEnabled(): boolean {
    return process.env.NODE_ENV === 'test'
      && process.env.APP_ENV === 'test'
      && (process.env.RUN_SPEED_TIMING_POSTGRES_INTEGRATION === '1'
        || process.env.RUN_SPEED_LIFECYCLE_RACE_POSTGRES_INTEGRATION === '1');
  }
}
