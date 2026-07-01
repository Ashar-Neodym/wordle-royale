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
  });
}

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
  checkedAt: timestampSchema,
  dependencies: readinessDependenciesSchema,
});

export const clientRequestSchema = z.object({
  clientRequestId: idempotencyKeySchema,
});
