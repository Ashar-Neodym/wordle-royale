import { z } from 'zod';
import { clientRequestSchema, idSchema, timestampSchema } from '../common/schemas.ts';
import { guessRejectReasons, letterFeedbackStates, matchStates, playerRoundStates, roundStates, scoringPresets } from './constants.ts';

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
