import type { z } from 'zod';
import type {
  createStandard1v1TicketRequestSchema,
  currentStandard1v1TicketSchema,
  matchmakingOpponentSchema,
  matchmakingTicketStateSchema,
  standard1v1TicketSchema,
} from './schemas.ts';

export type MatchmakingTicketState = z.infer<typeof matchmakingTicketStateSchema>;
export type CreateStandard1v1TicketRequest = z.infer<typeof createStandard1v1TicketRequestSchema>;
export type MatchmakingOpponent = z.infer<typeof matchmakingOpponentSchema>;
export type Standard1v1Ticket = z.infer<typeof standard1v1TicketSchema>;
export type CurrentStandard1v1Ticket = z.infer<typeof currentStandard1v1TicketSchema>;
