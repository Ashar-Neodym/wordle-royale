import { z } from 'zod';
import { clientRequestSchema, idSchema, timestampSchema } from '../common/schemas.ts';
import { difficulties, disabledRatedLobbyReason, gameModes, lobbyMemberRoles, lobbyMemberStates, lobbyStates, lobbyVisibilities, matchmakingStates } from './constants.ts';

export const lobbyVisibilitySchema = z.enum(lobbyVisibilities);
export const lobbyStateSchema = z.enum(lobbyStates);
export const gameModeSchema = z.enum(gameModes);
export const difficultySchema = z.enum(difficulties);

export const lobbySettingsBaseSchema = z.object({
  visibility: lobbyVisibilitySchema,
  rated: z.boolean(),
  mode: gameModeSchema.default('standard'),
  language: z.literal('en').default('en'),
  wordLength: z.literal(5).default(5),
  difficulty: difficultySchema.default('medium'),
  minPlayers: z.number().int().min(2).max(4),
  maxPlayers: z.number().int().min(2).max(4),
  roundsCount: z.number().int().min(1).max(10),
  roundTimeSeconds: z.literal(120),
  scoringPreset: z.literal('standard_v1').default('standard_v1'),
});

export const lobbySettingsSchema = lobbySettingsBaseSchema.refine((value) => value.minPlayers <= value.maxPlayers, { path: ['minPlayers'], message: 'minPlayers must be <= maxPlayers.' });

export const privateRatedLobbyDisabledSchema = z.object({
  allowed: z.literal(false),
  reason: z.literal(disabledRatedLobbyReason),
  message: z.string().min(1),
});

export const lobbySettingsValidationSchema = z.object({
  valid: z.boolean(),
  rankedCompatible: z.boolean(),
  privateRatedLobby: privateRatedLobbyDisabledSchema.optional(),
  errors: z.array(z.object({ field: z.string().min(1), code: z.string().min(1), message: z.string().min(1) })).default([]),
  normalizedSettings: lobbySettingsBaseSchema.partial().default({}),
});

export const createLobbyRequestSchema = lobbySettingsBaseSchema.extend({ clientRequestId: clientRequestSchema.shape.clientRequestId }).superRefine((value, ctx) => {
  if (value.minPlayers > value.maxPlayers) {
    ctx.addIssue({ code: 'custom', message: 'minPlayers must be <= maxPlayers.', path: ['minPlayers'] });
  }
  if (value.visibility === 'private' && value.rated) {
    ctx.addIssue({ code: 'custom', message: 'Private rated lobbies are disabled for V1.', path: ['rated'] });
  }
});

export const joinLobbyByCodeRequestSchema = clientRequestSchema.extend({ code: z.string().regex(/^[A-Z0-9]{4,12}$/) });
export const joinLobbyRequestSchema = clientRequestSchema;
export const leaveLobbyRequestSchema = clientRequestSchema;
export const setReadyRequestSchema = clientRequestSchema.extend({ ready: z.boolean() });

export const lobbyMemberSchema = z.object({
  userId: idSchema,
  displayName: z.string().min(1),
  handle: z.string().nullable().optional(),
  role: z.enum(lobbyMemberRoles),
  state: z.enum(lobbyMemberStates),
  ready: z.boolean(),
  joinedAt: timestampSchema,
});

export const lobbyDtoSchema = z.object({
  id: idSchema,
  code: z.string().regex(/^[A-Z0-9]{4,12}$/),
  hostUserId: idSchema.nullable(),
  state: lobbyStateSchema,
  settings: lobbySettingsSchema,
  rankedCompatible: z.boolean(),
  members: z.array(lobbyMemberSchema),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
});

export const quickJoinRequestSchema = clientRequestSchema.extend({
  rated: z.boolean(),
  mode: gameModeSchema.default('standard'),
  difficulty: difficultySchema.default('medium'),
});

export const matchmakingTicketSchema = z.object({
  ticketId: idSchema,
  state: z.enum(matchmakingStates),
  rated: z.boolean(),
  mode: gameModeSchema,
  difficulty: difficultySchema,
  estimatedWaitSeconds: z.number().int().nonnegative().nullable(),
  expiresAt: timestampSchema,
});
