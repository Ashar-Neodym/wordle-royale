import { z } from 'zod';
import { clientRequestSchema, idSchema, timestampSchema } from '../common/schemas.ts';

export const matchmakingTicketStates = ['queued', 'matched', 'cancelled', 'timed_out', 'failed'] as const;
export const matchmakingTicketStateSchema = z.enum(matchmakingTicketStates);

const automaticTicketRequestBaseSchema = clientRequestSchema.extend({
  rated: z.boolean(),
  allowProvisionalOpponent: z.boolean().default(true),
});

export const createStandard1v1TicketRequestSchema = automaticTicketRequestBaseSchema.extend({
  mode: z.enum(['standard_1v1', 'speed_1v1', 'classic_1v1', 'multiplayer_lobby']),
});

export const createSpeed1v1TicketRequestSchema = automaticTicketRequestBaseSchema.extend({
  mode: z.literal('speed_1v1'),
});

export const matchmakingOpponentSchema = z.object({
  userId: idSchema,
  displayName: z.string().min(1),
  handle: z.string().min(1).nullable(),
  ratingAtQueue: z.number().int(),
  provisional: z.boolean(),
});

export const matchmakingTicketBaseSchema = z.object({
  ticketId: idSchema,
  state: matchmakingTicketStateSchema,
  rated: z.literal(true),
  userId: idSchema,
  ratingAtQueue: z.number().int(),
  provisional: z.boolean(),
  searchWindow: z.object({
    minRating: z.number().int(),
    maxRating: z.number().int(),
    expansionStep: z.number().int().min(0).max(4),
  }),
  estimatedWaitSeconds: z.number().int().nonnegative().nullable(),
  matchedMatchId: idSchema.nullable(),
  matchedOpponent: matchmakingOpponentSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  expiresAt: timestampSchema,
  cancelledAt: timestampSchema.nullable(),
  timedOutAt: timestampSchema.nullable(),
});

export const standard1v1TicketSchema = matchmakingTicketBaseSchema.extend({ mode: z.literal('standard_1v1') });
export const speed1v1TicketSchema = matchmakingTicketBaseSchema.extend({ mode: z.literal('speed_1v1') });
export const automaticMatchmakingTicketSchema = z.discriminatedUnion('mode', [standard1v1TicketSchema, speed1v1TicketSchema]);

export const currentStandard1v1TicketSchema = standard1v1TicketSchema.nullable();
export const currentSpeed1v1TicketSchema = speed1v1TicketSchema.nullable();
