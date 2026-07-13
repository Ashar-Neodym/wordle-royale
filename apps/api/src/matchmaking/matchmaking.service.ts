import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { defaultProvisionalGames, defaultRating, standard1v1TicketSchema } from '@wordle-royale/contracts';
import type { CreateStandard1v1TicketRequest, Standard1v1Ticket } from '@wordle-royale/contracts';
import { StandardDictionaryService } from '../dictionary/standard-dictionary.service.ts';
import type { StandardDictionarySelection } from '../dictionary/standard-dictionary.service.ts';
import { GameplayPersistenceService } from '../gameplay/gameplay-persistence.service.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { STANDARD_1V1_RATING_ALGORITHM, STANDARD_1V1_RATING_ALGORITHM_VERSION } from '../rating/standard-1v1-rating.ts';
import { standardQueueEnabled } from './matchmaking-config.ts';

const QUEUE_TTL_MS = 60_000;
const INITIAL_RATING_WINDOW = 100;
const ACTIVE_STATES = ['queued', 'matched'] as const;
const TICKET_INCLUDE = { matchedOpponent: { include: { profile: true } } } as const;

type TicketRecord = {
  id: string;
  userId: string;
  mode: 'standard_1v1';
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

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

function isRetryableTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; meta?: { code?: string } };
  if (candidate.code === 'P2034') return true;
  return candidate.code === 'P2010'
    && (candidate.meta?.code === '40001' || candidate.meta?.code === '40P01');
}

@Injectable()
export class MatchmakingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GameplayPersistenceService) private readonly gameplay: GameplayPersistenceService,
    @Inject(StandardDictionaryService) private readonly dictionary: StandardDictionaryService,
  ) {}

  async joinStandardQueue(userId: string, input: CreateStandard1v1TicketRequest, now = new Date()): Promise<Standard1v1Ticket> {
    return (await this.joinStandardQueueWithResult(userId, input, now)).ticket;
  }

  async joinStandardQueueWithResult(
    userId: string,
    input: CreateStandard1v1TicketRequest,
    now = new Date(),
  ): Promise<{ ticket: Standard1v1Ticket; created: boolean }> {
    this.assertLiveRequest(input);

    try {
      return await this.inTransaction(async (tx) => {
        const dictionary = await this.requireDictionary(tx);
        await this.expireQueuedTickets(tx, now);
        await this.releaseCompletedMatchedTickets(tx, userId, now);

        const replay = await tx.matchmakingTicket.findUnique({
          where: { userId_mode_idempotencyKey: { userId, mode: 'standard_1v1', idempotencyKey: input.clientRequestId } },
          include: TICKET_INCLUDE,
        }) as TicketRecord | null;
        if (replay) return { ticket: this.toDto(await this.attemptPair(tx, replay, now, dictionary)), created: false };

        const active = await this.findActiveTicket(tx, userId);
        if (active) {
          await this.writeAudit(tx, userId, 'matchmaking_duplicate_active_ticket', active.id, null, { state: active.state });
          return { ticket: this.toDto(await this.attemptPair(tx, active, now, dictionary)), created: false };
        }

        const profile = await this.findOrCreateRatingProfile(tx, userId) as RatingProfileRecord;
        const provisional = profile.provisionalRemaining > 0;
        const expiresAt = new Date(now.getTime() + QUEUE_TTL_MS);
        const ticket = await tx.matchmakingTicket.create({
          data: {
            userId,
            mode: 'standard_1v1',
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
          },
          include: TICKET_INCLUDE,
        }) as TicketRecord;
        await this.writeAudit(tx, userId, 'matchmaking_queued', ticket.id, null, {
          mode: 'standard_1v1',
          ratingAtQueue: profile.rating,
          provisional,
        });
        return { ticket: this.toDto(await this.attemptPair(tx, ticket, now, dictionary)), created: true };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      return await this.inTransaction(async (tx) => {
        const dictionary = await this.requireDictionary(tx);
        const active = await this.findActiveTicket(tx, userId);
        if (!active) throw error;
        return { ticket: this.toDto(await this.attemptPair(tx, active, now, dictionary)), created: false };
      });
    }
  }

  async getCurrentTicket(userId: string, now = new Date()): Promise<Standard1v1Ticket | null> {
    return await this.inTransaction(async (tx) => {
      await this.expireQueuedTickets(tx, now, userId);
      await this.releaseCompletedMatchedTickets(tx, userId, now);
      const ticket = await this.findActiveTicket(tx, userId);
      if (!ticket) return null;
      return this.toDto(await this.attemptPair(tx, ticket, now));
    });
  }

  async getTicket(userId: string, ticketId: string, now = new Date()): Promise<Standard1v1Ticket> {
    return await this.inTransaction(async (tx) => {
      await this.expireQueuedTickets(tx, now, userId);
      await this.releaseCompletedMatchedTickets(tx, userId, now);
      const ticket = await tx.matchmakingTicket.findFirst({ where: { id: ticketId, userId }, include: TICKET_INCLUDE }) as TicketRecord | null;
      if (!ticket) throw new NotFoundException({ code: 'ticket_not_found', message: 'Matchmaking ticket was not found.' });
      return this.toDto(await this.attemptPair(tx, ticket, now));
    });
  }

  async cancelTicket(userId: string, ticketId: string, now = new Date()): Promise<Standard1v1Ticket> {
    return await this.inTransaction(async (tx) => {
      await this.lockTicket(tx, ticketId);
      let ticket = await tx.matchmakingTicket.findFirst({ where: { id: ticketId, userId }, include: TICKET_INCLUDE }) as TicketRecord | null;
      if (!ticket) throw new NotFoundException({ code: 'ticket_not_found', message: 'Matchmaking ticket was not found.' });

      if (ticket.state === 'matched' || ticket.state === 'consumed') {
        throw new ConflictException({
          code: 'ticket_already_matched',
          message: 'A matched ticket cannot be cancelled; enter or leave the match through gameplay.',
          details: { ticketId, matchedMatchId: ticket.matchedMatchId },
        });
      }
      if (ticket.state !== 'queued') return this.toDto(ticket);
      if (asDate(ticket.expiresAt).getTime() <= now.getTime()) {
        ticket = await tx.matchmakingTicket.update({
          where: { id: ticket.id },
          data: { state: 'timed_out', timedOutAt: now },
          include: TICKET_INCLUDE,
        }) as TicketRecord;
        return this.toDto(ticket);
      }

      ticket = await tx.matchmakingTicket.update({
        where: { id: ticket.id },
        data: { state: 'cancelled', cancelledAt: now },
        include: TICKET_INCLUDE,
      }) as TicketRecord;
      await this.writeAudit(tx, userId, 'matchmaking_cancelled', ticket.id, null, { mode: 'standard_1v1' });
      return this.toDto(ticket);
    });
  }

  private assertLiveRequest(input: CreateStandard1v1TicketRequest): void {
    if (!standardQueueEnabled()) {
      throw new ServiceUnavailableException({ code: 'standard_1v1_queue_disabled', message: 'The Standard 1v1 queue is currently disabled.' });
    }
    if (input.mode !== 'standard_1v1') {
      throw new BadRequestException({
        code: 'unsupported_matchmaking_mode',
        message: 'Only standard_1v1 matchmaking is live.',
        details: { requestedMode: input.mode },
      });
    }
    if (!input.rated) {
      throw new BadRequestException({ code: 'rated_required', message: 'The Standard 1v1 queue is rated-only.' });
    }
  }

  private async attemptPair(tx: any, ticket: TicketRecord, now: Date, selectedDictionary?: StandardDictionarySelection): Promise<TicketRecord> {
    if (ticket.state !== 'queued') return ticket;
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
          AND candidate."mode" = 'standard_1v1'
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
               AND candidate_profile."mode" = 'standard_1v1'
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
               WHERE recent_match."rankedMode" = 'standard_1v1'
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
      STANDARD_1V1_RATING_ALGORITHM_VERSION,
      new Date(now.getTime() - 12 * 60 * 60 * 1000),
      allowRecentOpponent,
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

    if (!repeatCooldownRelaxed) {
      const cooldownCutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const recentOpponentMatch = await tx.match.findFirst({
        where: {
          rankedMode: 'standard_1v1',
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

    const sortedTicketIds = [ticket.id, candidate.id].sort();
    const match = await this.gameplay.startRankedMatch({
      dictionaryReleaseId: dictionaryRelease.releaseId,
      participantUserIds: ordered.map((entry) => entry.userId),
      idempotencyKey: `matchmaking:standard_1v1:${sortedTicketIds[0]}:${sortedTicketIds[1]}`,
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
    } catch {
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

  private async findOrCreateRatingProfile(tx: any, userId: string): Promise<RatingProfileRecord> {
    const existing = await tx.ratingProfile.findFirst({
      where: { userId, mode: 'standard_1v1', status: 'active', algorithmConfigVersion: STANDARD_1V1_RATING_ALGORITHM_VERSION },
      orderBy: { updatedAt: 'desc' },
    }) as RatingProfileRecord | null;
    if (existing) return existing;

    try {
      return await tx.ratingProfile.create({
        data: {
          userId,
          mode: 'standard_1v1',
          rating: defaultRating,
          matchesPlayed: 0,
          provisionalRemaining: defaultProvisionalGames,
          peakRating: defaultRating,
          ratingDeviation: 350,
          algorithm: STANDARD_1V1_RATING_ALGORITHM,
          algorithmConfigVersion: STANDARD_1V1_RATING_ALGORITHM_VERSION,
          status: 'active',
        },
      }) as RatingProfileRecord;
    } catch (error) {
      // Serializable transaction failures must reach inTransaction(), which owns
      // the bounded retry loop. Translating P2034 here makes a recoverable race
      // look like a terminal rating-profile conflict to the API caller.
      if (isRetryableTransactionError(error)) throw error;
      if (!isUniqueConstraintError(error)) {
        throw new ConflictException({ code: 'rating_profile_unavailable', message: 'A Standard rating profile could not be prepared for matchmaking.' });
      }
      const replay = await tx.ratingProfile.findFirst({
        where: { userId, mode: 'standard_1v1', status: 'active', algorithmConfigVersion: STANDARD_1V1_RATING_ALGORITHM_VERSION },
      }) as RatingProfileRecord | null;
      if (!replay) throw error;
      return replay;
    }
  }

  private async expireQueuedTickets(tx: any, now: Date, userId?: string): Promise<void> {
    const where = { state: 'queued', expiresAt: { lte: now }, ...(userId ? { userId } : {}) };
    const expired = await tx.matchmakingTicket.findMany({ where, select: { id: true, userId: true } }) as Array<{ id: string; userId: string }>;
    if (expired.length === 0) return;
    await tx.matchmakingTicket.updateMany({ where, data: { state: 'timed_out', timedOutAt: now } });
    for (const ticket of expired) {
      await this.writeAudit(tx, ticket.userId, 'matchmaking_timed_out', ticket.id, null, { mode: 'standard_1v1' });
    }
  }

  private async releaseCompletedMatchedTickets(tx: any, userId: string, now: Date): Promise<void> {
    const matched = await tx.matchmakingTicket.findMany({
      where: { userId, mode: 'standard_1v1', state: 'matched' },
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

  private async findActiveTicket(tx: any, userId: string): Promise<TicketRecord | null> {
    return await tx.matchmakingTicket.findFirst({
      where: { userId, mode: 'standard_1v1', state: { in: [...ACTIVE_STATES] } },
      orderBy: { createdAt: 'desc' },
      include: TICKET_INCLUDE,
    }) as TicketRecord | null;
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

  private toDto(ticket: TicketRecord): Standard1v1Ticket {
    return standard1v1TicketSchema.parse({
      ticketId: ticket.id,
      state: ticket.state === 'consumed' ? 'matched' : ticket.state,
      mode: 'standard_1v1',
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

  private async inTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await (this.prisma.client as any).$transaction(callback, { isolationLevel: 'Serializable' }) as T;
      } catch (error) {
        if (!isRetryableTransactionError(error)) throw error;
        if (attempt === 3) {
          throw new ServiceUnavailableException({
            code: 'matchmaking_retry_exhausted',
            message: 'Matchmaking was busy resolving concurrent queue activity. Retry the request.',
          });
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 10));
      }
    }
    throw new Error('Unreachable matchmaking transaction retry state.');
  }
}
