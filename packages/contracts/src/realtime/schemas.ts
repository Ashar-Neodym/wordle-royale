import { z } from 'zod';
import { errorDetailSchema, idSchema, requestIdSchema, timestampSchema } from '../common/schemas.ts';
import { guessResultSchema, matchSnapshotSchema, participantStandingSchema, scoreBreakdownSchema, submitGuessRequestSchema } from '../gameplay/schemas.ts';
import { lobbyDtoSchema, matchmakingTicketSchema, setReadyRequestSchema } from '../lobby/schemas.ts';
import { clientEventNames, serverEventNames } from './constants.ts';

export const eventEnvelopeBaseSchema = z.object({
  requestId: requestIdSchema.nullable().optional(),
  sentAt: timestampSchema.optional(),
});

export function eventEnvelopeSchema<TType extends string, TPayload extends z.ZodType>(type: TType, payload: TPayload) {
  return eventEnvelopeBaseSchema.extend({
    type: z.literal(type),
    payload,
  });
}

export const clientEvents = {
  lobbySubscribe: eventEnvelopeSchema(clientEventNames.lobbySubscribe, z.object({ lobbyId: idSchema })),
  lobbySetReady: eventEnvelopeSchema(clientEventNames.lobbySetReady, z.object({ lobbyId: idSchema }).merge(setReadyRequestSchema)),
  lobbyLeave: eventEnvelopeSchema(clientEventNames.lobbyLeave, z.object({ lobbyId: idSchema, clientRequestId: z.string().uuid() })),
  matchmakingSubscribe: eventEnvelopeSchema(clientEventNames.matchmakingSubscribe, z.object({ ticketId: idSchema })),
  matchSubscribe: eventEnvelopeSchema(clientEventNames.matchSubscribe, z.object({ matchId: idSchema })),
  guessSubmit: eventEnvelopeSchema(clientEventNames.guessSubmit, submitGuessRequestSchema),
  sessionResync: eventEnvelopeSchema(clientEventNames.sessionResync, z.object({ activeLobbyId: idSchema.nullable(), activeMatchId: idSchema.nullable(), lastEventId: z.string().optional() })),
} as const;

export const guessAcceptedEventSchema = eventEnvelopeSchema(serverEventNames.guessAccepted, guessResultSchema.refine((value) => value.accepted));
export const guessRejectedEventSchema = eventEnvelopeSchema(serverEventNames.guessRejected, guessResultSchema.refine((value) => !value.accepted));

export const serverEvents = {
  connectionReady: eventEnvelopeSchema(serverEventNames.connectionReady, z.object({ userId: idSchema, serverTime: timestampSchema })),
  connectionStateChanged: eventEnvelopeSchema(serverEventNames.connectionStateChanged, z.object({ state: z.enum(['connected', 'reconnecting', 'resynced', 'offline']), message: z.string().min(1) })),
  lobbySnapshot: eventEnvelopeSchema(serverEventNames.lobbySnapshot, z.object({ lobby: lobbyDtoSchema })),
  lobbyReadyReset: eventEnvelopeSchema(serverEventNames.lobbyReadyReset, z.object({ lobbyId: idSchema, reason: z.literal('settings_changed'), affectedUserIds: z.array(idSchema) })),
  lobbyStartFailed: eventEnvelopeSchema(serverEventNames.lobbyStartFailed, z.object({ lobbyId: idSchema, code: z.string().min(1), message: z.string().min(1) })),
  matchmakingStatus: eventEnvelopeSchema(serverEventNames.matchmakingStatus, matchmakingTicketSchema),
  matchmakingDuplicateQueue: eventEnvelopeSchema(serverEventNames.matchmakingDuplicateQueue, z.object({ existingTicketId: idSchema, state: z.literal('queued') })),
  matchSnapshot: eventEnvelopeSchema(serverEventNames.matchSnapshot, matchSnapshotSchema),
  guessAccepted: guessAcceptedEventSchema,
  guessRejected: guessRejectedEventSchema,
  roundEnded: eventEnvelopeSchema(serverEventNames.roundEnded, z.object({
    roundId: idSchema,
    answer: z.string().regex(/^[a-z]{5}$/),
    standings: z.array(z.object({
      userId: idSchema,
      roundScore: z.number().int().nonnegative(),
      scoreBreakdown: scoreBreakdownSchema,
      totalScore: z.number().int().nonnegative(),
      state: z.enum(['solved', 'failed', 'timed_out', 'forfeited', 'voided']),
      validGuessCount: z.number().int().nonnegative(),
      solveMs: z.number().int().nonnegative().nullable().optional(),
    })),
    nextRoundStartsAt: timestampSchema.nullable(),
  })),
  matchCompleted: eventEnvelopeSchema(serverEventNames.matchCompleted, z.object({ matchId: idSchema, reportUrl: z.string().min(1), reportVisibility: z.enum(['participants', 'public', 'private', 'admin_only']), shareCardAvailable: z.boolean(), finalStandings: z.array(participantStandingSchema) })),
  sessionResyncResult: eventEnvelopeSchema(serverEventNames.sessionResyncResult, z.object({ serverTime: timestampSchema, lobbySnapshot: lobbyDtoSchema.nullable(), matchSnapshot: matchSnapshotSchema.nullable(), activeRouteHint: z.enum(['home', 'lobby', 'match', 'report']).nullable(), inputEnabled: z.boolean(), missedEventsAvailable: z.boolean() })),
  error: eventEnvelopeSchema(serverEventNames.error, errorDetailSchema),
} as const;

export const clientEventNameSchema = z.enum(Object.values(clientEventNames) as [string, ...string[]]);
export const serverEventNameSchema = z.enum(Object.values(serverEventNames) as [string, ...string[]]);
