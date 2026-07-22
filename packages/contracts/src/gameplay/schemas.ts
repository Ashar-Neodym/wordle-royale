import { z } from 'zod';
import { clientRequestSchema, idSchema, timestampSchema } from '../common/schemas.ts';
import { defaultRating, guessRejectReasons, letterFeedbackStates, matchStates, playerRoundStates, rankedMatchCompletionReasons, rankedMatchStartSources, rankedModes, ratingEventKinds, ratingEventStatuses, roundStates, scoringPresets } from './constants.ts';

export const matchStateSchema = z.enum(matchStates);
export const roundStateSchema = z.enum(roundStates);
export const playerRoundStateSchema = z.enum(playerRoundStates);
export const scoringPresetSchema = z.enum(scoringPresets);
export const rankedModeSchema = z.enum(rankedModes);

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
  result: z.enum(['win', 'loss', 'draw', 'void']).nullable().optional(),
  terminalReason: z.enum(['solved', 'max_guesses', 'deadline_timeout', 'forfeit', 'awarded_forfeit_win', 'no_contest', 'operator_void']).nullable().optional(),
  guessesUsed: z.number().int().min(1).max(6).nullable().optional(),
  solveElapsedMs: z.number().int().min(0).max(75_000).nullable().optional(),
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

export const speedRulesetVersionSchema = z.literal('speed_1v1_v1_75s');
export const speedReadyLifecycleVersionSchema = z.enum(['speed_ready_v1_match_created_20s', 'speed_ready_v2_first_ack_90s']);
export const speedMatchStateSchema = z.enum(['waiting_ready', 'waiting_invitation', 'waiting_opponent_ready', 'countdown', 'in_progress', 'finalizing', 'completed', 'voided']);
export const speedTerminalReasonSchema = z.enum(['solved', 'max_guesses', 'deadline_timeout', 'forfeit', 'awarded_forfeit_win', 'no_contest', 'operator_void']);
export const speedParticipantResultSchema = z.enum(['win', 'loss', 'draw', 'void']);
export const speedCompletionReasonSchema = z.enum(['all_players_terminal', 'deadline', 'forfeit', 'ready_timeout', 'invitation_timeout', 'pre_start_cancelled', 'operator_void']);

export const markSpeedMatchReadyRequestSchema = clientRequestSchema;
export const forfeitSpeedMatchRequestSchema = clientRequestSchema;

const speedMatchSnapshotBaseSchema = z.object({
  matchId: idSchema,
  roundId: idSchema,
  mode: z.literal('speed_1v1'),
  rulesetVersion: speedRulesetVersionSchema,
  state: speedMatchStateSchema,
  serverTime: timestampSchema,
  startsAt: timestampSchema.nullable(),
  deadlineAt: timestampSchema.nullable(),
  timeControl: z.object({
    roundTimeMs: z.literal(75_000),
    solveTimeBucketMs: z.literal(100),
    maxGuesses: z.literal(6),
  }),
  myState: z.object({
    acceptedGuesses: z.array(z.object({
      clientRequestId: z.string().uuid(),
      guess: z.string().regex(/^[a-z]{5}$/),
      guessNumber: z.number().int().min(1).max(6),
      feedback: z.array(letterFeedbackSchema).length(5),
      submittedAt: timestampSchema,
    })),
    terminalReason: speedTerminalReasonSchema.nullable(),
    guessesUsed: z.number().int().min(1).max(6).nullable(),
    solveElapsedMs: z.number().int().min(0).max(75_000).nullable(),
    result: speedParticipantResultSchema.nullable(),
  }),
  opponentProgress: z.object({
    acceptedGuessCount: z.number().int().min(0).max(6),
    terminal: z.boolean(),
  }),
});

export const speedMatchSnapshotV1Schema = speedMatchSnapshotBaseSchema.extend({
  readyLifecycleVersion: z.literal('speed_ready_v1_match_created_20s'),
  readyDeadlineAt: timestampSchema,
  readiness: z.object({
    phase: z.literal('legacy'),
    viewerReady: z.boolean(),
    readyCount: z.number().int().min(0).max(2),
    viewerReadyAt: timestampSchema.nullable(),
    viewerReadyOperationId: z.string().min(1).nullable(),
  }),
});

export const speedMatchSnapshotV2Schema = speedMatchSnapshotBaseSchema.extend({
  readyLifecycleVersion: z.literal('speed_ready_v2_first_ack_90s'),
  state: z.enum(['waiting_invitation', 'waiting_opponent_ready', 'countdown', 'in_progress', 'finalizing', 'completed', 'voided']),
  invitationExpiresAt: timestampSchema,
  readyWindowStartedAt: timestampSchema.nullable(),
  readyDeadlineAt: timestampSchema.nullable(),
  readiness: z.object({
    phase: z.enum(['invitation', 'opponent_ready', 'locked']),
    viewerReady: z.boolean(),
    readyCount: z.number().int().min(0).max(2),
    viewerReadyAt: timestampSchema.nullable(),
    viewerReadyOperationId: z.string().min(1).nullable(),
  }),
});

export const speedMatchSnapshotSchema = z.discriminatedUnion('readyLifecycleVersion', [speedMatchSnapshotV1Schema, speedMatchSnapshotV2Schema]);

export const speedRankedModeTimeControlSchema = z.object({
  roundTimeSeconds: z.literal(75),
  invitationWindowSeconds: z.literal(90),
  readyWindowSeconds: z.literal(20),
  readyWindowStartsOn: z.literal('first_valid_ready_acknowledgement'),
  countdownSeconds: z.literal(3),
  maxGuesses: z.literal(6),
  solveTimeBucketMs: z.literal(100),
  tieBreaker: z.literal('server_solve_time_bucket'),
});

export const speedRankedModeIdentitySchema = z.object({
  id: z.literal('speed_1v1'),
  enabled: z.boolean(),
  queueEnabled: z.boolean(),
  rulesetVersion: speedRulesetVersionSchema,
  readyLifecycleVersion: z.enum(['speed_ready_v1_match_created_20s', 'speed_ready_v2_first_ack_90s']).optional(),
  unavailableReason: z.enum(['lifecycle_activation_draining', 'speed_temporarily_unavailable']).optional(),
  ratingAlgorithmConfigVersion: z.literal('speed_1v1_glicko_v1'),
  timeControl: speedRankedModeTimeControlSchema.optional(),
});


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
  ratingDeviationBefore: z.number().min(0).optional(),
  ratingDeviationAfter: z.number().min(0).optional(),
});

export const ratingEventContractSchema = z.object({
  eventId: idSchema,
  matchId: idSchema,
  kind: ratingEventKindSchema,
  status: ratingEventStatusSchema,
  idempotencyKey: z.string().min(1),
  algorithmVersion: z.enum(['placement_mmr_v1', 'standard_1v1_glicko_v1', 'speed_1v1_glicko_v1']),
  defaultRating: z.literal(defaultRating),
  participants: z.array(ratingParticipantDeltaSchema).min(2),
  createdAt: timestampSchema,
  appliedAt: timestampSchema.nullable().optional(),
});

export const rankedMatchResultActionSchema = z.object({
  rematch: z.object({
    available: z.boolean(),
    reason: z.enum(['not_implemented', 'match_not_completed', 'unsupported_match_type']).nullable().optional(),
    label: z.string().min(1).max(80),
  }),
  share: z.object({
    spoilerSafe: z.literal(true),
    text: z.string().min(1).max(280),
    path: z.string().regex(/^\/matches\/[0-9a-f-]{36}$/),
  }),
  links: z.object({
    matchHref: z.string().regex(/^\/matches\/[0-9a-f-]{36}$/),
    historyHref: z.literal('/history'),
    leaderboardHref: z.literal('/leaderboard'),
    nextRankedHref: z.literal('/lobbies?mode=ranked&status=waiting'),
    profileHrefTemplate: z.literal('/profile/{handle}'),
  }),
});

export const rankedMatchResultCompletionReasonSchema = z.union([
  rankedMatchCompletionReasonSchema,
  speedCompletionReasonSchema,
]);

export const rankedMatchResultSummarySchema = z.object({
  matchId: idSchema,
  state: z.literal('completed'),
  rankedMode: rankedModeSchema.nullable().optional(),
  rulesetVersion: z.string().min(1).nullable().optional(),
  speedCompletionReason: speedCompletionReasonSchema.nullable().optional(),
  ratingAlgorithm: z.enum(['placement_mmr_v1', 'standard_1v1_glicko_v1', 'speed_1v1_glicko_v1']).nullable().optional(),
  ratingAlgorithmConfigVersion: z.string().min(1).nullable().optional(),
  completedAt: timestampSchema,
  completionReason: rankedMatchResultCompletionReasonSchema,
  finalStandings: z.array(participantStandingSchema).min(2),
  ratingEvent: ratingEventContractSchema.nullable(),
  resultActions: rankedMatchResultActionSchema,
}).superRefine((summary, context) => {
  if (summary.rankedMode === 'speed_1v1') {
    if (summary.completionReason !== summary.speedCompletionReason) {
      context.addIssue({
        code: 'custom',
        path: ['completionReason'],
        message: 'Speed result completionReason must equal the persisted speedCompletionReason.',
      });
    }
    return;
  }

  if (['all_players_terminal', 'deadline', 'ready_timeout', 'operator_void'].includes(summary.completionReason)) {
    context.addIssue({
      code: 'custom',
      path: ['completionReason'],
      message: 'Speed-only completion reasons require rankedMode speed_1v1.',
    });
  }
  if (summary.speedCompletionReason != null) {
    context.addIssue({
      code: 'custom',
      path: ['speedCompletionReason'],
      message: 'speedCompletionReason is only valid for rankedMode speed_1v1.',
    });
  }
});

export const matchHistoryParticipantSchema = z.object({
  userId: idSchema,
  handle: z.string().regex(/^[a-z0-9_]{3,20}$/).nullable(),
  displayName: z.string().min(1).max(40),
  placement: z.number().int().positive().nullable(),
  outcome: z.enum(['pending', 'solved', 'failed', 'abandoned', 'voided']),
  finalScore: z.number().int().nonnegative(),
  ratingDelta: z.number().int().nullable(),
  result: speedParticipantResultSchema.nullable().optional(),
  terminalReason: speedTerminalReasonSchema.nullable().optional(),
  guessesUsed: z.number().int().min(1).max(6).nullable().optional(),
  solveElapsedMs: z.number().int().min(0).max(75_000).nullable().optional(),
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
  rankedMode: rankedModeSchema.nullable().optional(),
  rulesetVersion: z.string().min(1).nullable().optional(),
  speedCompletionReason: speedCompletionReasonSchema.nullable().optional(),
  status: z.enum(['pending', 'active', 'completed', 'voided', 'cancelled']),
  ratingAlgorithm: z.enum(['placement_mmr_v1', 'standard_1v1_glicko_v1', 'speed_1v1_glicko_v1']).nullable().default(null),
  ratingAlgorithmConfigVersion: z.string().min(1).nullable().default(null),
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
