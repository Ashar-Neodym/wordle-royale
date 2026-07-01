import { z } from 'zod';
import { clientRequestSchema, idSchema, timestampSchema } from '../common/schemas.ts';
import { defaultRating, guessRejectReasons, letterFeedbackStates, matchStates, playerRoundStates, rankedMatchCompletionReasons, rankedMatchStartSources, ratingEventKinds, ratingEventStatuses, roundStates, scoringPresets } from './constants.ts';

export const matchStateSchema = z.enum(matchStates);
export const roundStateSchema = z.enum(roundStates);
export const playerRoundStateSchema = z.enum(playerRoundStates);
export const scoringPresetSchema = z.enum(scoringPresets);

export const letterFeedbackSchema = z.object({
  letter: z.string().regex(/^[a-z]$/),
  state: z.enum(letterFeedbackStates),
});

export const scoreBreakdownSchema = z.object({
  base: z.number().int().nonnegative(),
  guessBonus: z.number().int().nonnegative(),
  speedBonus: z.number().int().nonnegative(),
  penalty: z.number().int().nonnegative().default(0),
  adjustment: z.number().int().default(0),
  total: z.number().int().nonnegative(),
  scoringPreset: scoringPresetSchema,
});

export const participantStandingSchema = z.object({
  userId: idSchema,
  placement: z.number().int().positive().nullable(),
  placementGroup: z.number().int().positive().nullable().optional(),
  totalScore: z.number().int().nonnegative(),
  roundsSolved: z.number().int().nonnegative(),
  totalValidGuesses: z.number().int().nonnegative(),
  totalSolveMs: z.number().int().nonnegative(),
  ratingBefore: z.number().int().nullable().optional(),
  ratingAfter: z.number().int().nullable().optional(),
  ratingDelta: z.number().int().nullable().optional(),
});

export const roundSnapshotSchema = z.object({
  roundId: idSchema,
  roundNumber: z.number().int().positive(),
  state: roundStateSchema,
  startsAt: timestampSchema,
  endsAt: timestampSchema,
  wordLength: z.literal(5),
  maxGuesses: z.literal(6),
  dictionaryVersion: z.string().min(1).optional(),
});

export const myRoundStateSchema = z.object({
  guesses: z.array(z.object({
    guess: z.string().regex(/^[a-z]{5}$/),
    guessNumber: z.number().int().positive(),
    feedback: z.array(letterFeedbackSchema).length(5),
    submittedAt: timestampSchema,
  })),
  playerRoundState: playerRoundStateSchema,
  score: z.number().int().nonnegative(),
});

export const matchSnapshotSchema = z.object({
  matchId: idSchema,
  state: matchStateSchema,
  serverTime: timestampSchema,
  currentRound: roundSnapshotSchema.nullable(),
  myState: myRoundStateSchema.nullable(),
  standings: z.array(participantStandingSchema),
});

export const submitGuessRequestSchema = clientRequestSchema.extend({
  matchId: idSchema,
  roundId: idSchema,
  guess: z.string().trim().toLowerCase().regex(/^[a-z]{5}$/),
  clientSubmittedAt: timestampSchema.optional(),
});

export const acceptedGuessResultSchema = z.object({
  accepted: z.literal(true),
  valid: z.literal(true),
  clientRequestId: z.string().uuid(),
  guessNumber: z.number().int().positive(),
  feedback: z.array(letterFeedbackSchema).length(5),
  playerRoundState: playerRoundStateSchema,
  roundState: roundStateSchema,
  score: z.number().int().nonnegative(),
  serverReceivedAt: timestampSchema,
});

export const rejectedGuessResultSchema = z.object({
  accepted: z.literal(false),
  valid: z.literal(false),
  clientRequestId: z.string().uuid(),
  reason: z.enum(guessRejectReasons),
  attemptConsumed: z.literal(false),
  playerRoundState: playerRoundStateSchema,
});

export const guessResultSchema = z.discriminatedUnion('accepted', [acceptedGuessResultSchema, rejectedGuessResultSchema]);


export const rankedMatchStartSourceSchema = z.enum(rankedMatchStartSources);
export const rankedMatchCompletionReasonSchema = z.enum(rankedMatchCompletionReasons);
export const ratingEventKindSchema = z.enum(ratingEventKinds);
export const ratingEventStatusSchema = z.enum(ratingEventStatuses);

export const startRankedMatchRequestSchema = clientRequestSchema.extend({
  lobbyId: idSchema.optional(),
  dictionaryReleaseId: idSchema.optional(),
  participantUserIds: z.array(idSchema).min(2).max(4).optional(),
  source: rankedMatchStartSourceSchema.default('lobby'),
}).superRefine((value, ctx) => {
  if (value.source === 'lobby' && !value.lobbyId) {
    ctx.addIssue({ code: 'custom', message: 'lobbyId is required when starting a ranked match from a lobby.', path: ['lobbyId'] });
  }
});

export const rankedMatchStartResponseDataSchema = z.object({
  matchId: idSchema,
  roundId: idSchema,
  state: z.literal('in_progress'),
  snapshot: matchSnapshotSchema,
});

export const currentRankedMatchStateResponseDataSchema = matchSnapshotSchema;

export const completeRankedMatchRequestSchema = clientRequestSchema.extend({
  matchId: idSchema,
  reason: rankedMatchCompletionReasonSchema.default('all_players_final'),
});

export const ratingParticipantDeltaSchema = z.object({
  userId: idSchema,
  ratingBefore: z.number().int().default(defaultRating),
  ratingAfter: z.number().int(),
  ratingDelta: z.number().int(),
  placement: z.number().int().positive(),
  placementGroup: z.number().int().positive().optional(),
  provisional: z.boolean().default(false),
});

export const ratingEventContractSchema = z.object({
  eventId: idSchema,
  matchId: idSchema,
  kind: ratingEventKindSchema,
  status: ratingEventStatusSchema,
  idempotencyKey: z.string().min(1),
  algorithmVersion: z.literal('placement_mmr_v1'),
  defaultRating: z.literal(defaultRating),
  participants: z.array(ratingParticipantDeltaSchema).min(2),
  createdAt: timestampSchema,
  appliedAt: timestampSchema.nullable().optional(),
});

export const rankedMatchResultSummarySchema = z.object({
  matchId: idSchema,
  state: z.literal('completed'),
  completedAt: timestampSchema,
  completionReason: rankedMatchCompletionReasonSchema,
  finalStandings: z.array(participantStandingSchema).min(2),
  ratingEvent: ratingEventContractSchema.nullable(),
});

export const matchHistoryParticipantSchema = z.object({
  userId: idSchema,
  handle: z.string().regex(/^[a-z0-9_]{3,20}$/).nullable(),
  displayName: z.string().min(1).max(40),
  placement: z.number().int().positive().nullable(),
  outcome: z.enum(['pending', 'solved', 'failed', 'abandoned', 'voided']),
  finalScore: z.number().int().nonnegative(),
  ratingDelta: z.number().int().nullable(),
});

export const matchHistoryViewerSchema = z.object({
  userId: idSchema,
  placement: z.number().int().positive().nullable(),
  outcome: z.enum(['pending', 'solved', 'failed', 'abandoned', 'voided']),
  finalScore: z.number().int().nonnegative(),
  ratingDelta: z.number().int().nullable(),
}).nullable();

export const matchHistorySummarySchema = z.object({
  matchId: idSchema,
  mode: z.enum(['ranked', 'casual']),
  status: z.enum(['pending', 'active', 'completed', 'voided', 'cancelled']),
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  participants: z.array(matchHistoryParticipantSchema).min(1),
  viewer: matchHistoryViewerSchema,
});

export const matchHistoryListSchema = z.object({
  items: z.array(matchHistorySummarySchema),
  pagination: z.object({ nextCursor: z.string().min(1).nullable() }),
});

export const matchDetailSummarySchema = z.object({
  matchId: idSchema,
  status: z.enum(['active', 'completed', 'voided', 'cancelled']),
  activeState: currentRankedMatchStateResponseDataSchema.nullable(),
  result: rankedMatchResultSummarySchema.nullable(),
  history: matchHistorySummarySchema,
});
