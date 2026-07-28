import { z } from 'zod';

export const idSchema = z.string().uuid();
export const timestampSchema = z.string().datetime({ offset: true });
export const idempotencyKeySchema = z.string().uuid();
export const requestIdSchema = z.string().min(1);

export const requestMetadataSchema = z.object({
  requestId: requestIdSchema,
});

export const paginationRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const paginationResponseSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
});

export const validationErrorIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const validationErrorDetailsSchema = z.object({
  issues: z.array(validationErrorIssueSchema),
});

export const errorDetailSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const errorEnvelopeSchema = z.object({
  data: z.null(),
  error: errorDetailSchema,
  requestId: requestIdSchema,
});

export function successEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    error: z.null(),
    requestId: requestIdSchema,
  }).strict();
}

export const unknownSuccessEnvelopeSchema = successEnvelopeSchema(z.unknown());

export function listEnvelopeDataSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    pagination: paginationResponseSchema,
  });
}

export function listEnvelopeSchema<T extends z.ZodType>(itemSchema: T) {
  return successEnvelopeSchema(listEnvelopeDataSchema(itemSchema));
}

export const readinessDependencyStatusSchema = z.enum(['ok', 'degraded', 'unavailable', 'not_checked_stub']);

export const readinessDependencySchema = z.object({
  status: readinessDependencyStatusSchema,
  checkedAt: timestampSchema.optional(),
  latencyMs: z.number().nonnegative().optional(),
  message: z.string().min(1).optional(),
});

export const readinessDependenciesSchema = z.record(z.string(), readinessDependencySchema);

export const readinessStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unavailable']),
  service: z.string().min(1),
  environment: z.string().min(1),
  revision: z.string().regex(/^(?:[a-f0-9]{7,64}|development|unavailable)$/),
  checkedAt: timestampSchema,
  dependencies: readinessDependenciesSchema,
});

export const canonicalApiServiceSchema = z.literal('wordle-royale-api');
export const deploymentRevisionSchema = z.string().regex(/^(?:[a-f0-9]{7,64}|development|unavailable)$/);

export const apiHealthPayloadSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unavailable']),
  service: canonicalApiServiceSchema,
  environment: z.string().min(1),
  timestamp: timestampSchema,
  uptimeSeconds: z.number().finite().nonnegative(),
  revision: deploymentRevisionSchema,
}).strict();

export const apiReadinessPayloadSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unavailable']),
  service: canonicalApiServiceSchema,
  environment: z.string().min(1),
  revision: deploymentRevisionSchema,
  checkedAt: timestampSchema,
  dependencies: z.object({
    database: readinessDependencySchema,
    applicationSchema: readinessDependencySchema,
    standardDictionary: readinessDependencySchema,
    speedRuntime: readinessDependencySchema,
    speedLifecycleActivation: readinessDependencySchema,
    redis: readinessDependencySchema,
  }).strict(),
}).strict();

const rankedModeCommonSchema = z.object({
  provisionalGames: z.number().int().nonnegative(),
  defaultRating: z.number().int().positive(),
  defaultRatingDeviation: z.number().int().positive(),
  notes: z.string().min(1),
});

const standardRankedModeSchema = rankedModeCommonSchema.extend({
  id: z.literal('standard_1v1'), label: z.literal('Standard'), players: z.literal('1v1'),
  rated: z.literal(true), enabled: z.literal(true),
}).strict();

const classicRankedModeSchema = rankedModeCommonSchema.extend({
  id: z.literal('classic_1v1'), label: z.literal('Classic'), players: z.literal('1v1'),
  rated: z.literal(true), enabled: z.literal(false),
}).strict();

const multiplayerRankedModeSchema = rankedModeCommonSchema.extend({
  id: z.literal('multiplayer_lobby'), label: z.literal('Multiplayer / Lobby'), players: z.literal('2-4'),
  rated: z.literal(true), enabled: z.literal(false),
}).strict();

export const speedRankedModeAuthoritySchema = rankedModeCommonSchema.extend({
  id: z.literal('speed_1v1'), label: z.literal('Speed / Blitz'), players: z.literal('1v1'),
  rated: z.literal(true), enabled: z.boolean(), queueEnabled: z.boolean(),
  rulesetVersion: z.literal('speed_1v1_v1_75s'),
  readyLifecycleVersion: z.enum(['speed_ready_v1_match_created_20s', 'speed_ready_v2_first_ack_90s']).optional(),
  unavailableReason: z.enum(['lifecycle_activation_draining', 'speed_temporarily_unavailable']).optional(),
  ratingAlgorithmConfigVersion: z.literal('speed_1v1_glicko_v1'),
  timeControl: z.object({
    roundTimeSeconds: z.literal(75), invitationWindowSeconds: z.literal(90), readyWindowSeconds: z.literal(20),
    readyWindowStartsOn: z.literal('first_valid_ready_acknowledgement'), countdownSeconds: z.literal(3),
    maxGuesses: z.literal(6), solveTimeBucketMs: z.literal(100), tieBreaker: z.literal('server_solve_time_bucket'),
  }).strict().optional(),
}).strict();

export const rankedModesPayloadSchema = z.object({
  modes: z.array(z.union([
    standardRankedModeSchema,
    speedRankedModeAuthoritySchema,
    classicRankedModeSchema,
    multiplayerRankedModeSchema,
  ])).length(4),
}).strict().superRefine((payload, context) => {
  for (const id of ['standard_1v1', 'speed_1v1', 'classic_1v1', 'multiplayer_lobby'] as const) {
    if (payload.modes.filter((mode) => mode.id === id).length !== 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['modes'], message: `Expected exactly one canonical ${id} row.` });
    }
  }
});

export const clientRequestSchema = z.object({
  clientRequestId: idempotencyKeySchema,
});
