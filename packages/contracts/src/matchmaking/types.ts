import type { z } from 'zod';
import type {
  automaticMatchmakingTicketSchema,
  createSpeed1v1TicketRequestSchema,
  createStandard1v1TicketRequestSchema,
  currentSpeed1v1TicketSchema,
  currentStandard1v1TicketSchema,
  matchmakingOpponentSchema,
  matchmakingTicketBaseSchema,
  matchmakingTicketStateSchema,
  speed1v1TicketSchema,
  standard1v1TicketSchema,
} from './schemas.ts';

export type MatchmakingTicketState = z.infer<typeof matchmakingTicketStateSchema>;
export type MatchmakingTicketBase = z.infer<typeof matchmakingTicketBaseSchema>;
export type CreateStandard1v1TicketRequest = z.infer<typeof createStandard1v1TicketRequestSchema>;
export type CreateSpeed1v1TicketRequest = z.infer<typeof createSpeed1v1TicketRequestSchema>;
export type MatchmakingOpponent = z.infer<typeof matchmakingOpponentSchema>;
export type Standard1v1Ticket = z.infer<typeof standard1v1TicketSchema>;
export type Speed1v1Ticket = z.infer<typeof speed1v1TicketSchema>;
export type AutomaticMatchmakingTicket = z.infer<typeof automaticMatchmakingTicketSchema>;
export type CurrentStandard1v1Ticket = z.infer<typeof currentStandard1v1TicketSchema>;
export type CurrentSpeed1v1Ticket = z.infer<typeof currentSpeed1v1TicketSchema>;
