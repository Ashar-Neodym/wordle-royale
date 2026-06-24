import { z } from 'zod';
import { idSchema, timestampSchema } from '../common/schemas.ts';
import { participantStandingSchema, scoreBreakdownSchema } from '../gameplay/schemas.ts';

export const reportVisibilitySchema = z.enum(['participants', 'public', 'private', 'admin_only']);

export const roundPlayerReportSchema = z.object({
  userId: idSchema,
  state: z.enum(['solved', 'failed', 'timed_out', 'forfeited', 'voided']),
  validGuessCount: z.number().int().nonnegative(),
  solveMs: z.number().int().nonnegative().nullable().optional(),
  roundScore: z.number().int().nonnegative(),
  scoreBreakdown: scoreBreakdownSchema,
});

export const matchReportRoundSchema = z.object({
  roundId: idSchema,
  roundNumber: z.number().int().positive(),
  answer: z.string().regex(/^[a-z]{5}$/),
  answerListVersion: z.string().min(1),
  validGuessListVersion: z.string().min(1),
  startedAt: timestampSchema,
  endedAt: timestampSchema,
  playerResults: z.array(roundPlayerReportSchema),
});

export const matchReportParticipantSchema = z.object({
  userId: idSchema,
  displayName: z.string().min(1),
  handle: z.string().nullable().optional(),
  placement: z.number().int().positive().nullable(),
  placementGroup: z.number().int().positive().nullable().optional(),
  outcome: z.enum(['won', 'lost', 'tied', 'forfeited', 'abandoned', 'voided']),
  totalScore: z.number().int().nonnegative(),
  roundsSolved: z.number().int().nonnegative(),
  totalValidGuesses: z.number().int().nonnegative(),
  totalSolveMs: z.number().int().nonnegative(),
  ratingBefore: z.number().int().nullable().optional(),
  ratingAfter: z.number().int().nullable().optional(),
  ratingDelta: z.number().int().nullable().optional(),
  provisional: z.boolean().nullable().optional(),
});

export const matchReportSchema = z.object({
  matchId: idSchema,
  lobbyId: idSchema.nullable().optional(),
  mode: z.literal('standard'),
  rated: z.boolean(),
  scoringPreset: z.literal('standard_v1'),
  language: z.literal('en'),
  wordLength: z.literal(5),
  maxGuesses: z.literal(6),
  roundsCount: z.number().int().positive(),
  roundTimeSeconds: z.literal(120),
  dictionary: z.object({
    answerListVersion: z.string().min(1),
    validGuessListVersion: z.string().min(1),
    bannedListVersion: z.string().min(1).nullable().optional(),
  }),
  reportVisibility: reportVisibilitySchema,
  shareCardEnabled: z.boolean(),
  startedAt: timestampSchema,
  completedAt: timestampSchema.nullable().optional(),
  state: z.enum(['completed', 'abandoned', 'voided']),
  voidReason: z.string().nullable().optional(),
  participants: z.array(matchReportParticipantSchema),
  rounds: z.array(matchReportRoundSchema),
  finalStandings: z.array(participantStandingSchema),
});

export const shareCardSchema = z.object({
  matchId: idSchema,
  shareText: z.string().min(1).max(280),
  imageUrl: z.string().url().nullable(),
  spoilerSafe: z.literal(true),
  reportVisibility: reportVisibilitySchema,
});
