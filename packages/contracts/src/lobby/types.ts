import { z } from 'zod';
import { createLobbyRequestSchema, joinLobbyByCodeRequestSchema, lobbyDtoSchema, lobbySettingsSchema, lobbySettingsValidationSchema, matchmakingTicketSchema, quickJoinRequestSchema, setReadyRequestSchema } from './schemas.ts';

export type LobbySettings = z.infer<typeof lobbySettingsSchema>;
export type LobbySettingsValidation = z.infer<typeof lobbySettingsValidationSchema>;
export type CreateLobbyRequest = z.infer<typeof createLobbyRequestSchema>;
export type JoinLobbyByCodeRequest = z.infer<typeof joinLobbyByCodeRequestSchema>;
export type SetReadyRequest = z.infer<typeof setReadyRequestSchema>;
export type LobbyDto = z.infer<typeof lobbyDtoSchema>;
export type QuickJoinRequest = z.infer<typeof quickJoinRequestSchema>;
export type MatchmakingTicketDto = z.infer<typeof matchmakingTicketSchema>;
