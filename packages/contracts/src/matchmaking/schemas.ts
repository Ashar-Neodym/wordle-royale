import { z } from 'zod';
import { clientRequestSchema, idSchema, timestampSchema } from '../common/schemas.ts';
import { rankedModeSchema } from '../gameplay/schemas.ts';

export const matchmakingTicketStates = ['queued', 'matched', 'cancelled', 'timed_out', 'failed'] as const;
export const matchmakingTicketStateSchema = z.enum(matchmakingTicketStates);

export const createStandard1v1TicketRequestSchema = clientRequestSchema.extend({
  mode: rankedModeSchema,
  rated: z.boolean(),
  allowProvisionalOpponent: z.boolean().default(true),
});

export const matchmakingOpponentSchema = z.object({
  userId: idSchema,
  displayName: z.string().min(1),
  handle: z.string().min(1).nullable(),
  ratingAtQueue: z.number().int(),
  provisional: z.boolean(),
});

export const standard1v1TicketSchema = z.object({
  ticketId: idSchema,
  state: matchmakingTicketStateSchema,
  mode: z.literal('standard_1v1'),
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

export const currentStandard1v1TicketSchema = standard1v1TicketSchema.nullable();
