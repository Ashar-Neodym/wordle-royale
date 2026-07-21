import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { defaultProvisionalGames, defaultRating, speed1v1TicketSchema, standard1v1TicketSchema } from '@wordle-royale/contracts';
import type { CreateSpeed1v1TicketRequest, Speed1v1Ticket, Standard1v1Ticket } from '@wordle-royale/contracts';
import { StandardDictionaryService } from '../dictionary/standard-dictionary.service.ts';
import type { StandardDictionarySelection } from '../dictionary/standard-dictionary.service.ts';
import { GameplayPersistenceService } from '../gameplay/gameplay-persistence.service.ts';
import { SpeedGameplayService } from '../gameplay/speed-gameplay.service.ts';
import { SpeedLifecycleActivationService } from '../gameplay/speed-lifecycle-activation.service.ts';
import { SPEED_LIFECYCLE_CONTROL_PROTOCOL, SPEED_LIFECYCLE_V1 } from '../gameplay/speed-lifecycle-activation.constants.ts';
import type { SpeedCreationAuthority } from '../gameplay/speed-lifecycle-activation.types.ts';
import { SpeedOperationalReadinessService } from '../health/speed-operational-readiness.service.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { STANDARD_1V1_RATING_ALGORITHM, STANDARD_1V1_RATING_ALGORITHM_VERSION } from '../rating/standard-1v1-rating.ts';
import { speedQueueEnabled, standardQueueEnabled } from './matchmaking-config.ts';
import {
  defaultMatchmakingLifecycleDependencies,
  isPrismaUniqueConstraintError,
  isRecognizedMatchmakingTicketUniqueError,
  isRetryableTransactionError,
  isTransactionExpiryError,
  MatchmakingRecoveryPendingError,
  MATCHMAKING_LIFECYCLE_DEPENDENCIES,
  recognizedMatchmakingTicketUniqueError,
  runMatchmakingLifecycle,
} from './matchmaking-lifecycle.ts';
import type { MatchmakingLifecycleCallbacks, MatchmakingLifecycleDependencies, MatchmakingTransactionInvoker } from './matchmaking-lifecycle.ts';
import { matchmakingTransactionBudget } from './matchmaking-transaction-budget.ts';
import type { MatchmakingTransactionBudget } from './matchmaking-transaction-budget.ts';

const QUEUE_TTL_MS = 60_000;
const INITIAL_RATING_WINDOW = 100;
const ACTIVE_STATES = ['queued', 'matched'] as const;
const TICKET_INCLUDE = { matchedOpponent: { include: { profile: true } } } as const;

type AutomaticQueueMode = 'standard_1v1' | 'speed_1v1';
type QueueRequestInput = { clientRequestId: string; mode: string; rated: boolean; allowProvisionalOpponent: boolean };
type AutomaticTicketDto = Standard1v1Ticket | Speed1v1Ticket;
type QueuePolicy = {
  mode: AutomaticQueueMode;
  algorithm: string;
  algorithmConfigVersion: string;
  enabled: () => boolean;
  disabledCode: 'standard_1v1_queue_disabled' | 'speed_1v1_queue_disabled';
  label: 'Standard' | 'Speed';
};

const QUEUE_POLICIES: Record<AutomaticQueueMode, QueuePolicy> = {
  standard_1v1: {
    mode: 'standard_1v1',
    algorithm: STANDARD_1V1_RATING_ALGORITHM,
    algorithmConfigVersion: STANDARD_1V1_RATING_ALGORITHM_VERSION,
    enabled: standardQueueEnabled,
    disabledCode: 'standard_1v1_queue_disabled',
    label: 'Standard',
  },
  speed_1v1: {
    mode: 'speed_1v1',
    algorithm: 'glicko_style_internal',
    algorithmConfigVersion: 'speed_1v1_glicko_v1',
    enabled: speedQueueEnabled,
    disabledCode: 'speed_1v1_queue_disabled',
    label: 'Speed',
  },
};

type TicketRecord = {
  id: string;
  userId: string;
  mode: AutomaticQueueMode;
  rated: true;
  state: 'queued' | 'matched' | 'consumed' | 'cancelled' | 'timed_out' | 'failed';
  ratingAtQueue: number;
  provisionalAtQueue: boolean;
  allowProvisionalOpponent: boolean;
  searchMinRating: number;
  searchMaxRating: number;
  expansionStep: number;
  matchedMatchId: string | null;
  matchedOpponentUserId: string | null;
  matchedOpponentRatingAtQueue: number | null;
  matchedOpponentProvisionalAtQueue: boolean | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
  cancelledAt: Date | string | null;
  timedOutAt: Date | string | null;
  readyLifecycleVersion: string | null;
  matchedOpponent?: {
    id: string;
    displayName: string;
    profile?: { publicHandle?: string | null } | null;
  } | null;
};

type RatingProfileRecord = {
  rating: number;
  provisionalRemaining: number;
};

type LockedCandidate = { id: string };

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : asDate(value).toISOString();
}

function queueWindow(createdAt: Date | string, rating: number, now: Date) {
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - asDate(createdAt).getTime()) / 1000));
  const expansionStep = elapsedSeconds >= 30 ? 3 : elapsedSeconds >= 20 ? 2 : elapsedSeconds >= 10 ? 1 : 0;
  const radius = expansionStep === 3 ? 400 : expansionStep === 2 ? 300 : expansionStep === 1 ? 200 : INITIAL_RATING_WINDOW;
  return { expansionStep, minRating: rating - radius, maxRating: rating + radius };
}

@Injectable()
export class MatchmakingService {
  private readonly transactionBudget: MatchmakingTransactionBudget;
  private readonly lifecycleDependencies: MatchmakingLifecycleDependencies;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GameplayPersistenceService) private readonly gameplay: GameplayPersistenceService,
    @Inject(StandardDictionaryService) private readonly dictionary: StandardDictionaryService,
    @Optional() @Inject(MATCHMAKING_LIFECYCLE_DEPENDENCIES) lifecycleDependencies?: MatchmakingLifecycleDependencies,
    @Optional() @Inject(SpeedGameplayService) private readonly speedGameplay?: SpeedGameplayService,
    @Optional() @Inject(SpeedOperationalReadinessService) private readonly speedOperational?: SpeedOperationalReadinessService,
    @Optional() @Inject(SpeedLifecycleActivationService) private readonly speedActivation?: SpeedLifecycleActivationService,
  ) {
    this.transactionBudget = matchmakingTransactionBudget();
    this.lifecycleDependencies = lifecycleDependencies ?? defaultMatchmakingLifecycleDependencies();
  }

  async joinStandardQueue(userId: string, input: QueueRequestInput, now?: Date): Promise<Standard1v1Ticket> {
    return (await this.joinStandardQueueWithResult(userId, input, now)).ticket;
  }

  async joinStandardQueueWithResult(userId: string, input: QueueRequestInput, now?: Date): Promise<{ ticket: Standard1v1Ticket; created: boolean }> {
    const result = await this.joinAutomaticQueue(userId, input, QUEUE_POLICIES.standard_1v1, now);
    return result as { ticket: Standard1v1Ticket; created: boolean };
  }

  async joinSpeedQueueWithResult(userId: string, input: CreateSpeed1v1TicketRequest, now?: Date): Promise<{ ticket: Speed1v1Ticket; created: boolean }> {
    await this.assertSpeedOperational();
    const result = await this.joinAutomaticQueue(userId, input, QUEUE_POLICIES.speed_1v1, now);
    return result as { ticket: Speed1v1Ticket; created: boolean };
  }

  async getCurrentTicket(userId: string, now?: Date): Promise<Standard1v1Ticket | null> {
    return await this.getCurrentAutomaticTicket(userId, QUEUE_POLICIES.standard_1v1, now) as Standard1v1Ticket | null;
  }

  async getCurrentSpeedTicket(userId: string, now?: Date): Promise<Speed1v1Ticket | null> {
    await this.assertSpeedDependencies();
    return await this.getCurrentAutomaticTicket(userId, QUEUE_POLICIES.speed_1v1, now) as Speed1v1Ticket | null;
  }

  async getTicket(userId: string, ticketId: string, now?: Date): Promise<Standard1v1Ticket> {
    return await this.getAutomaticTicket(userId, ticketId, QUEUE_POLICIES.standard_1v1, now) as Standard1v1Ticket;
  }

  async getSpeedTicket(userId: string, ticketId: string, now?: Date): Promise<Speed1v1Ticket> {
    await this.assertSpeedDependencies();
    return await this.getAutomaticTicket(userId, ticketId, QUEUE_POLICIES.speed_1v1, now) as Speed1v1Ticket;
  }

  async cancelTicket(userId: string, ticketId: string, now?: Date): Promise<Standard1v1Ticket> {
    return await this.cancelAutomaticTicket(userId, ticketId, QUEUE_POLICIES.standard_1v1, now) as Standard1v1Ticket;
  }

  async cancelSpeedTicket(userId: string, ticketId: string, now?: Date): Promise<Speed1v1Ticket> {
    await this.assertSpeedDependencies();
    return await this.cancelAutomaticTicket(userId, ticketId, QUEUE_POLICIES.speed_1v1, now) as Speed1v1Ticket;
  }

  private async joinAutomaticQueue(
    userId: string,
    input: QueueRequestInput,
    policy: QueuePolicy,
    now?: Date,
  ): Promise<{ ticket: AutomaticTicketDto; created: boolean }> {
    this.assertLiveRequest(input, policy);

    return await this.runLifecycle({
      initial: async (tx, context) => {
        const attemptNow = now && context.attempt === 1 ? now : context.attemptNow;
        const authority = await this.creationAuthority(tx, policy);
        const dictionary = await this.requireDictionary(tx);
        await this.lockUserActivity(tx, userId);
        await this.expireQueuedTickets(tx, attemptNow);
        await this.releaseCompletedMatchedTickets(tx, userId, attemptNow);

        const replay = await tx.matchmakingTicket.findUnique({
          where: { userId_mode_idempotencyKey: { userId, mode: policy.mode, idempotencyKey: input.clientRequestId } },
          include: TICKET_INCLUDE,
        }) as TicketRecord | null;
        if (replay) return { ticket: this.toDto(await this.attemptPair(tx, replay, attemptNow, dictionary, policy, authority)), created: false };

        const active = await this.findActiveTicket(tx, userId);
        if (active) {
          if (active.mode !== policy.mode) throw this.rankedActivityConflict(active.mode);
          await this.writeAudit(tx, userId, 'matchmaking_duplicate_active_ticket', active.id, null, { state: active.state, mode: policy.mode });
          return { ticket: this.toDto(await this.attemptPair(tx, active, attemptNow, dictionary, policy, authority)), created: false };
        }
        if (await this.hasActiveRankedMatch(tx, userId)) throw this.rankedActivityConflict('active_match');

        const profile = await this.findOrCreateRatingProfile(tx, userId, policy) as RatingProfileRecord;
        const provisional = profile.provisionalRemaining > 0;
        const expiresAt = new Date(attemptNow.getTime() + QUEUE_TTL_MS);
        let ticket: TicketRecord;
        try {
          ticket = await tx.matchmakingTicket.create({
            data: {
              userId,
              mode: policy.mode,
              rated: true,
              state: 'queued',
              ratingAtQueue: profile.rating,
              provisionalAtQueue: provisional,
              allowProvisionalOpponent: input.allowProvisionalOpponent,
              searchMinRating: profile.rating - INITIAL_RATING_WINDOW,
              searchMaxRating: profile.rating + INITIAL_RATING_WINDOW,
              expansionStep: 0,
              idempotencyKey: input.clientRequestId,
              expiresAt,
              readyLifecycleVersion: authority?.activeVersion ?? null,
            },
            include: TICKET_INCLUDE,
          }) as TicketRecord;
        } catch (error) {
          if (isRecognizedMatchmakingTicketUniqueError(error)) throw recognizedMatchmakingTicketUniqueError(error);
          if (isPrismaUniqueConstraintError(error)) {
            throw new ConflictException({ code: 'matchmaking_ticket_conflict', message: 'The matchmaking ticket could not be created because of a conflicting queue record.' });
          }
          throw error;
        }
        await this.writeAudit(tx, userId, 'matchmaking_queued', ticket.id, null, { mode: policy.mode, ratingAtQueue: profile.rating, provisional });
        return { ticket: this.toDto(await this.attemptPair(tx, ticket, attemptNow, dictionary, policy, authority)), created: true };
      },
      recoverUnique: async (tx, context) => {
        const attemptNow = now && context.attempt === 1 ? now : context.attemptNow;
        const authority = await this.creationAuthority(tx, policy);
        const dictionary = await this.requireDictionary(tx);
        await this.lockUserActivity(tx, userId);
        const replay = await tx.matchmakingTicket.findUnique({
          where: { userId_mode_idempotencyKey: { userId, mode: policy.mode, idempotencyKey: input.clientRequestId } },
          include: TICKET_INCLUDE,
        }) as TicketRecord | null;
        const active = replay ?? await this.findActiveTicket(tx, userId);
        if (!active) throw new MatchmakingRecoveryPendingError();
        if (active.mode !== policy.mode) throw this.rankedActivityConflict(active.mode);
        return { ticket: this.toDto(await this.attemptPair(tx, active, attemptNow, dictionary, policy, authority)), created: false };
      },
    });
  }

  private async getCurrentAutomaticTicket(userId: string, policy: QueuePolicy, now?: Date): Promise<AutomaticTicketDto | null> {
    return await this.runLifecycle({ initial: async (tx, context) => {
      const attemptNow = now && context.attempt === 1 ? now : context.attemptNow;
      await this.lockUserActivity(tx, userId);
      await this.expireQueuedTickets(tx, attemptNow, userId);
      await this.releaseCompletedMatchedTickets(tx, userId, attemptNow);
      const ticket = await this.findActiveTicket(tx, userId, policy.mode);
      if (!ticket) return null;
      const authority = await this.optionalCreationAuthority(tx, policy);
      return this.toDto(await this.attemptPair(tx, ticket, attemptNow, undefined, policy, authority));
    } });
  }

  private async getAutomaticTicket(userId: string, ticketId: string, policy: QueuePolicy, now?: Date): Promise<AutomaticTicketDto> {
    return await this.runLifecycle({ initial: async (tx, context) => {
      const attemptNow = now && context.attempt === 1 ? now : context.attemptNow;
      await this.lockUserActivity(tx, userId);
      await this.expireQueuedTickets(tx, attemptNow, userId);
      await this.releaseCompletedMatchedTickets(tx, userId, attemptNow);
      const ticket = await tx.matchmakingTicket.findFirst({ where: { id: ticketId, userId, mode: policy.mode }, include: TICKET_INCLUDE }) as TicketRecord | null;
      if (!ticket) throw new NotFoundException({ code: 'ticket_not_found', message: 'Matchmaking ticket was not found.' });
      const authority = await this.optionalCreationAuthority(tx, policy);
      return this.toDto(await this.attemptPair(tx, ticket, attemptNow, undefined, policy, authority));
    } });
  }

  private async cancelAutomaticTicket(userId: string, ticketId: string, policy: QueuePolicy, now?: Date): Promise<AutomaticTicketDto> {
    return await this.runLifecycle({ initial: async (tx, context) => {
      const attemptNow = now && context.attempt === 1 ? now : context.attemptNow;
      await this.lockUserActivity(tx, userId);
      await this.lockTicket(tx, ticketId);
      let ticket = await tx.matchmakingTicket.findFirst({ where: { id: ticketId, userId, mode: policy.mode }, include: TICKET_INCLUDE }) as TicketRecord | null;
      if (!ticket) throw new NotFoundException({ code: 'ticket_not_found', message: 'Matchmaking ticket was not found.' });
      if (ticket.state === 'matched' || ticket.state === 'consumed') {
        throw new ConflictException({ code: 'ticket_already_matched', message: 'A matched ticket cannot be cancelled; enter or leave the match through gameplay.', details: { ticketId, matchedMatchId: ticket.matchedMatchId } });
      }
      if (ticket.state !== 'queued') return this.toDto(ticket);
      if (asDate(ticket.expiresAt).getTime() <= attemptNow.getTime()) {
        ticket = await tx.matchmakingTicket.update({ where: { id: ticket.id }, data: { state: 'timed_out', timedOutAt: attemptNow }, include: TICKET_INCLUDE }) as TicketRecord;
        return this.toDto(ticket);
      }
      ticket = await tx.matchmakingTicket.update({ where: { id: ticket.id }, data: { state: 'cancelled', cancelledAt: attemptNow }, include: TICKET_INCLUDE }) as TicketRecord;
      await this.writeAudit(tx, userId, 'matchmaking_cancelled', ticket.id, null, { mode: policy.mode });
      return this.toDto(ticket);
    } });
  }

  private assertLiveRequest(input: QueueRequestInput, policy: QueuePolicy): void {
    if (!policy.enabled()) throw new ServiceUnavailableException({ code: policy.disabledCode, message: `The ${policy.label} 1v1 queue is currently disabled.` });
    if (input.mode !== policy.mode) throw new BadRequestException({ code: 'unsupported_matchmaking_mode', message: `Only ${policy.mode} is accepted on this queue route.`, details: { requestedMode: input.mode } });
    if (!input.rated) throw new BadRequestException({ code: 'rated_required', message: `The ${policy.label} 1v1 queue is rated-only.` });
  }

  private async attemptPair(
    tx: any,
    ticket: TicketRecord,
    now: Date,
    selectedDictionary: StandardDictionarySelection | undefined,
    policy: QueuePolicy,
    authority?: SpeedCreationAuthority,
  ): Promise<TicketRecord> {
    if (ticket.state !== 'queued') return ticket;
    if (policy.mode === 'speed_1v1' && !authority) return ticket;
    const dictionary = selectedDictionary ?? await this.requireDictionary(tx);
    if (asDate(ticket.expiresAt).getTime() <= now.getTime()) {
      return await tx.matchmakingTicket.update({
        where: { id: ticket.id },
        data: { state: 'timed_out', timedOutAt: now },
        include: TICKET_INCLUDE,
      }) as TicketRecord;
    }

    await this.lockTicket(tx, ticket.id);
    const window = queueWindow(ticket.createdAt, ticket.ratingAtQueue, now);
    ticket = await tx.matchmakingTicket.update({
      where: { id: ticket.id },
      data: { searchMinRating: window.minRating, searchMaxRating: window.maxRating, expansionStep: window.expansionStep },
      include: TICKET_INCLUDE,
    }) as TicketRecord;

    const queryCandidate = async (allowRecentOpponent: boolean): Promise<LockedCandidate[]> => await tx.$queryRawUnsafe(
      `SELECT candidate."id"
         FROM "MatchmakingTicket" AS candidate
        WHERE candidate."state" = 'queued'
          AND candidate."mode" = $11::"RankedMode"
          AND ($11::"RankedMode" <> 'speed_1v1'::"RankedMode"
               OR COALESCE(candidate."readyLifecycleVersion", $12) = $13)
          AND candidate."rated" = TRUE
          AND candidate."userId" <> $1
          AND candidate."expiresAt" > $2
          AND candidate."ratingAtQueue" BETWEEN $3 AND $4
          AND $5 BETWEEN candidate."searchMinRating" AND candidate."searchMaxRating"
          AND ($6::boolean = TRUE OR candidate."provisionalAtQueue" = FALSE)
          AND (candidate."allowProvisionalOpponent" = TRUE OR $7::boolean = FALSE)
          AND EXISTS (
            SELECT 1
              FROM "RatingProfile" AS candidate_profile
             WHERE candidate_profile."userId" = candidate."userId"
               AND candidate_profile."mode" = $11::"RankedMode"
               AND candidate_profile."status" = 'active'
               AND candidate_profile."algorithmConfigVersion" = $8
          )
          AND (
            NOT EXISTS (
              SELECT 1
                FROM "Match" AS recent_match
                JOIN "MatchParticipant" AS requester_participant
                  ON requester_participant."matchId" = recent_match."id"
                 AND requester_participant."userId" = $1
                JOIN "MatchParticipant" AS candidate_participant
                  ON candidate_participant."matchId" = recent_match."id"
                 AND candidate_participant."userId" = candidate."userId"
               WHERE recent_match."rankedMode" = $11::"RankedMode"
                 AND recent_match."status" IN ('completed', 'voided')
                 AND COALESCE(recent_match."completedAt", recent_match."updatedAt") >= $9
            )
            OR ($10::boolean = TRUE AND candidate."createdAt" <= $2 - INTERVAL '30 seconds')
          )
        ORDER BY ABS(candidate."ratingAtQueue" - $5),
                 CASE WHEN candidate."provisionalAtQueue" = $7::boolean THEN 0 ELSE 1 END,
                 candidate."createdAt" ASC,
                 candidate."id" ASC
        FOR UPDATE OF candidate SKIP LOCKED
        LIMIT 1`,
      ticket.userId,
      now,
      ticket.searchMinRating,
      ticket.searchMaxRating,
      ticket.ratingAtQueue,
      ticket.allowProvisionalOpponent,
      ticket.provisionalAtQueue,
      policy.algorithmConfigVersion,
      new Date(now.getTime() - 12 * 60 * 60 * 1000),
      allowRecentOpponent,
      policy.mode,
      SPEED_LIFECYCLE_V1,
      authority?.activeVersion ?? SPEED_LIFECYCLE_V1,
    ) as LockedCandidate[];
    let repeatCooldownRelaxed = false;
    let candidateRows = await queryCandidate(false);
    if (candidateRows.length === 0 && window.expansionStep >= 3) {
      repeatCooldownRelaxed = true;
      candidateRows = await queryCandidate(true);
    }
    const candidateId = candidateRows[0]?.id;
    if (!candidateId) return ticket;

    const candidate = await tx.matchmakingTicket.findUnique({ where: { id: candidateId } }) as TicketRecord | null;
    if (!candidate || candidate.state !== 'queued' || candidate.userId === ticket.userId) return ticket;
    if (authority) {
      this.assertTicketVersion(authority, ticket.readyLifecycleVersion);
      this.assertTicketVersion(authority, candidate.readyLifecycleVersion);
    }
    // The candidate may still be committing its own join transaction. Do not
    // wait while holding the requester lock: that creates symmetric waits when
    // two first joins select each other. A later status poll can pair them.
    if (!await this.tryLockUserActivity(tx, candidate.userId)) return ticket;

    if (!repeatCooldownRelaxed) {
      const cooldownCutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const recentOpponentMatch = await tx.match.findFirst({
        where: {
          rankedMode: policy.mode,
          status: { in: ['completed', 'voided'] },
          OR: [
            { completedAt: { gte: cooldownCutoff } },
            { completedAt: null, updatedAt: { gte: cooldownCutoff } },
          ],
          AND: [
            { participants: { some: { userId: ticket.userId } } },
            { participants: { some: { userId: candidate.userId } } },
          ],
        },
        select: { id: true },
      }) as { id: string } | null;
      if (recentOpponentMatch) return ticket;
    }

    const ordered = [ticket, candidate].sort((left, right) => {
      const timeDelta = asDate(left.createdAt).getTime() - asDate(right.createdAt).getTime();
      return timeDelta || left.id.localeCompare(right.id);
    });
    await this.lockDictionaryRelease(tx, dictionary.releaseId);
    const dictionaryRelease = await this.dictionary.selectStandardDictionary(tx, undefined, dictionary.releaseId);
    if (!dictionaryRelease) throw this.dictionaryUnavailable();

    // Revalidate both users under their transaction-scoped activity locks at
    // the final creation boundary. This prevents cross-mode queue/match races
    // from creating a second ranked activity for either participant.
    const [requesterActive, candidateActive, requesterInMatch, candidateInMatch] = await Promise.all([
      this.findActiveTicket(tx, ticket.userId),
      this.findActiveTicket(tx, candidate.userId),
      this.hasActiveRankedMatch(tx, ticket.userId),
      this.hasActiveRankedMatch(tx, candidate.userId),
    ]);
    if (requesterActive?.id !== ticket.id || candidateActive?.id !== candidate.id || requesterInMatch || candidateInMatch) return ticket;

    const sortedTicketIds = [ticket.id, candidate.id].sort();
    const idempotencyKey = `matchmaking:${policy.mode}:${sortedTicketIds[0]}:${sortedTicketIds[1]}`;
    const match = policy.mode === 'speed_1v1'
      ? await this.requireSpeedGameplay().createSpeedMatch({
          dictionaryReleaseId: dictionaryRelease.releaseId,
          participantUserIds: ordered.map((entry) => entry.userId),
          idempotencyKey,
          readyLifecycleVersion: authority!.activeVersion,
          activationGeneration: authority!.generation,
        }, tx)
      : await this.gameplay.startRankedMatch({
          dictionaryReleaseId: dictionaryRelease.releaseId,
          participantUserIds: ordered.map((entry) => entry.userId),
          idempotencyKey,
          rankedMode: 'standard_1v1',
          now,
        }, tx);

    const requesterUpdate = await tx.matchmakingTicket.updateMany({
      where: { id: ticket.id, state: 'queued' },
      data: {
        state: 'matched',
        matchedMatchId: match.matchId,
        matchedOpponentUserId: candidate.userId,
        matchedOpponentRatingAtQueue: candidate.ratingAtQueue,
        matchedOpponentProvisionalAtQueue: candidate.provisionalAtQueue,
      },
    });
    const candidateUpdate = await tx.matchmakingTicket.updateMany({
      where: { id: candidate.id, state: 'queued' },
      data: {
        state: 'matched',
        matchedMatchId: match.matchId,
        matchedOpponentUserId: ticket.userId,
        matchedOpponentRatingAtQueue: ticket.ratingAtQueue,
        matchedOpponentProvisionalAtQueue: ticket.provisionalAtQueue,
      },
    });
    if (requesterUpdate.count !== 1 || candidateUpdate.count !== 1) {
      throw new ConflictException({ code: 'matchmaking_pair_race', message: 'The selected queue pair was claimed concurrently; retry matchmaking status.' });
    }

    await this.writeAudit(tx, ticket.userId, 'matchmaking_matched', ticket.id, match.matchId, { opponentUserId: candidate.userId });
    await this.writeAudit(tx, candidate.userId, 'matchmaking_matched', candidate.id, match.matchId, { opponentUserId: ticket.userId });
    return await tx.matchmakingTicket.findUnique({ where: { id: ticket.id }, include: TICKET_INCLUDE }) as TicketRecord;
  }

  private async requireDictionary(tx: any): Promise<StandardDictionarySelection> {
    try {
      const selection = await this.dictionary.selectStandardDictionary(tx);
      if (selection) return selection;
    } catch (error) {
      // Transaction policy belongs to the lifecycle coordinator: expiry is
      // normalized once there, while serialization/deadlock failures enter its retry ledger.
      if (isTransactionExpiryError(error) || isRetryableTransactionError(error)) throw error;
      // Normalize policy, schema, and database lookup failures to one public,
      // spoiler-safe availability error. The transaction rolls back any work.
    }
    throw this.dictionaryUnavailable();
  }

  private dictionaryUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'dictionary_release_unavailable',
      message: 'No approved dictionary release is available for Standard matchmaking.',
    });
  }

  private async findOrCreateRatingProfile(tx: any, userId: string, policy: QueuePolicy): Promise<RatingProfileRecord> {
    const existing = await tx.ratingProfile.findFirst({
      where: { userId, mode: policy.mode, status: 'active', algorithmConfigVersion: policy.algorithmConfigVersion },
      orderBy: { updatedAt: 'desc' },
    }) as RatingProfileRecord | null;
    if (existing) return existing;

    try {
      return await tx.ratingProfile.create({
        data: {
          userId,
          mode: policy.mode,
          rating: defaultRating,
          matchesPlayed: 0,
          provisionalRemaining: defaultProvisionalGames,
          peakRating: defaultRating,
          ratingDeviation: 350,
          algorithm: policy.algorithm,
          algorithmConfigVersion: policy.algorithmConfigVersion,
          status: 'active',
        },
      }) as RatingProfileRecord;
    } catch (error) {
      // Serializable transaction failures must reach the lifecycle coordinator,
      // which owns the shared bounded retry ledger across initial and recovery phases.
      if (isTransactionExpiryError(error) || isRetryableTransactionError(error)) throw error;
      if (!isPrismaUniqueConstraintError(error)) {
        throw new ConflictException({ code: 'rating_profile_unavailable', message: `A ${policy.label} rating profile could not be prepared for matchmaking.` });
      }
      const replay = await tx.ratingProfile.findFirst({
        where: { userId, mode: policy.mode, status: 'active', algorithmConfigVersion: policy.algorithmConfigVersion },
      }) as RatingProfileRecord | null;
      if (!replay) throw error;
      return replay;
    }
  }

  private async expireQueuedTickets(tx: any, now: Date, userId?: string): Promise<void> {
    const where = { state: 'queued', expiresAt: { lte: now }, ...(userId ? { userId } : {}) };
    const expired = await tx.matchmakingTicket.findMany({ where, select: { id: true, userId: true, mode: true } }) as Array<{ id: string; userId: string; mode: AutomaticQueueMode }>;
    if (expired.length === 0) return;
    await tx.matchmakingTicket.updateMany({ where, data: { state: 'timed_out', timedOutAt: now } });
    for (const ticket of expired) {
      await this.writeAudit(tx, ticket.userId, 'matchmaking_timed_out', ticket.id, null, { mode: ticket.mode });
    }
  }

  private async releaseCompletedMatchedTickets(tx: any, userId: string, now: Date): Promise<void> {
    const matched = await tx.matchmakingTicket.findMany({
      where: { userId, state: 'matched' },
      select: { id: true, matchedMatchId: true },
    }) as Array<{ id: string; matchedMatchId: string | null }>;

    for (const ticket of matched) {
      if (!ticket.matchedMatchId) continue;
      const match = await tx.match.findUnique({
        where: { id: ticket.matchedMatchId },
        select: { status: true },
      }) as { status: string } | null;
      if (!match || (match.status !== 'completed' && match.status !== 'voided')) continue;
      const released = await tx.matchmakingTicket.updateMany({
        where: { id: ticket.id, state: 'matched' },
        data: { state: 'consumed', updatedAt: now },
      });
      if (released.count === 1) {
        await this.writeAudit(tx, userId, 'matchmaking_ticket_consumed', ticket.id, ticket.matchedMatchId, { matchStatus: match.status });
      }
    }
  }

  private async findActiveTicket(tx: any, userId: string, mode?: AutomaticQueueMode): Promise<TicketRecord | null> {
    return await tx.matchmakingTicket.findFirst({
      where: { userId, ...(mode ? { mode } : {}), state: { in: [...ACTIVE_STATES] } },
      orderBy: { createdAt: 'desc' },
      include: TICKET_INCLUDE,
    }) as TicketRecord | null;
  }

  private async lockUserActivity(tx: any, userId: string): Promise<void> {
    // Serialize queue changes for the same user without row-locking UserAccount.
    // A UserAccount FOR UPDATE lock conflicts with participant foreign-key checks
    // when two different users pair concurrently and can create a cross-lock deadlock.
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS "lock"', userId);
  }

  private async tryLockUserActivity(tx: any, userId: string): Promise<boolean> {
    const rows = await tx.$queryRawUnsafe(
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS "locked"',
      userId,
    ) as Array<{ locked: boolean }>;
    return rows[0]?.locked === true;
  }

  private async hasActiveRankedMatch(tx: any, userId: string): Promise<boolean> {
    const match = await tx.match.findFirst({
      where: {
        rankedMode: { in: ['standard_1v1', 'speed_1v1'] },
        status: { in: ['pending', 'active'] },
        participants: { some: { userId } },
      },
      select: { id: true },
    }) as { id: string } | null;
    return Boolean(match);
  }

  private rankedActivityConflict(activity: string): ConflictException {
    return new ConflictException({
      code: 'ranked_activity_conflict',
      message: 'Only one active ranked queue ticket or match is allowed at a time.',
      details: { activeActivity: activity },
    });
  }

  private async assertSpeedOperational(): Promise<void> {
    if (this.speedOperational) return await this.speedOperational.assertAvailable();
    if (process.env.NODE_ENV === 'test') return;
    throw new ServiceUnavailableException({ code: 'speed_1v1_unavailable', message: 'Speed 1v1 is temporarily unavailable. Retry later.' });
  }

  private async assertSpeedDependencies(): Promise<void> {
    if (this.speedOperational) return await this.speedOperational.assertDependenciesAvailable();
    if (process.env.NODE_ENV === 'test') return;
    throw new ServiceUnavailableException({ code: 'speed_1v1_unavailable', message: 'Speed 1v1 is temporarily unavailable. Retry later.' });
  }

  private async creationAuthority(tx: any, policy: QueuePolicy): Promise<SpeedCreationAuthority | undefined> {
    if (policy.mode !== 'speed_1v1') return undefined;
    if (this.speedActivation) return await this.speedActivation.lockCreationAuthority(tx);
    if (process.env.NODE_ENV === 'test') return { protocol: SPEED_LIFECYCLE_CONTROL_PROTOCOL, phase: 'v1_open', activeVersion: SPEED_LIFECYCLE_V1, generation: 1n };
    throw new ServiceUnavailableException({ code: 'speed_lifecycle_activation_unavailable', message: 'Speed lifecycle activation is temporarily unavailable.' });
  }

  private async optionalCreationAuthority(tx: any, policy: QueuePolicy): Promise<SpeedCreationAuthority | undefined> {
    if (policy.mode !== 'speed_1v1') return undefined;
    try { return await this.creationAuthority(tx, policy); } catch { return undefined; }
  }

  private assertTicketVersion(authority: SpeedCreationAuthority, version: string | null): void {
    if (this.speedActivation) return this.speedActivation.assertTicketVersion(authority, version);
    if ((version ?? SPEED_LIFECYCLE_V1) !== authority.activeVersion) {
      throw new ServiceUnavailableException({ code: 'speed_lifecycle_version_mismatch', message: 'Speed lifecycle compatibility is temporarily unavailable.' });
    }
  }

  private requireSpeedGameplay(): SpeedGameplayService {
    if (this.speedGameplay) return this.speedGameplay;
    throw new ServiceUnavailableException({ code: 'speed_1v1_queue_disabled', message: 'The Speed 1v1 queue is currently disabled.' });
  }

  private async lockTicket(tx: any, ticketId: string): Promise<void> {
    await tx.$queryRawUnsafe('SELECT "id" FROM "MatchmakingTicket" WHERE "id" = $1 FOR UPDATE', ticketId);
  }

  private async lockDictionaryRelease(tx: any, releaseId: string): Promise<void> {
    await tx.$queryRawUnsafe('SELECT "id" FROM "DictionaryRelease" WHERE "id" = $1 FOR UPDATE', releaseId);
  }

  private async writeAudit(tx: any, userId: string, action: string, ticketId: string, matchId: string | null, metadata: Record<string, unknown>): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        matchId,
        action,
        entityType: 'MatchmakingTicket',
        entityId: ticketId,
        metadata,
      },
    });
  }

  private toDto(ticket: TicketRecord): AutomaticTicketDto {
    const schema = ticket.mode === 'speed_1v1' ? speed1v1TicketSchema : standard1v1TicketSchema;
    return schema.parse({
      ticketId: ticket.id,
      state: ticket.state === 'consumed' ? 'matched' : ticket.state,
      mode: ticket.mode,
      rated: true,
      userId: ticket.userId,
      ratingAtQueue: ticket.ratingAtQueue,
      provisional: ticket.provisionalAtQueue,
      searchWindow: {
        minRating: ticket.searchMinRating,
        maxRating: ticket.searchMaxRating,
        expansionStep: ticket.expansionStep,
      },
      estimatedWaitSeconds: ticket.state === 'queued' ? Math.max(0, Math.ceil((asDate(ticket.expiresAt).getTime() - Date.now()) / 1000)) : null,
      matchedMatchId: ticket.matchedMatchId,
      matchedOpponent: ticket.matchedOpponent ? {
        userId: ticket.matchedOpponent.id,
        displayName: ticket.matchedOpponent.displayName,
        handle: ticket.matchedOpponent.profile?.publicHandle ?? null,
        ratingAtQueue: ticket.matchedOpponentRatingAtQueue ?? defaultRating,
        provisional: ticket.matchedOpponentProvisionalAtQueue ?? true,
      } : null,
      createdAt: iso(ticket.createdAt),
      updatedAt: iso(ticket.updatedAt),
      expiresAt: iso(ticket.expiresAt),
      cancelledAt: iso(ticket.cancelledAt),
      timedOutAt: iso(ticket.timedOutAt),
    });
  }

  private async runLifecycle<T>(callbacks: MatchmakingLifecycleCallbacks<T>): Promise<T> {
    const transaction = (async (callback: (tx: any) => Promise<unknown>, options: unknown) =>
      await (this.prisma.client as any).$transaction(callback, options)) as MatchmakingTransactionInvoker;
    return await runMatchmakingLifecycle(transaction, callbacks, this.transactionBudget, this.lifecycleDependencies);
  }
}
