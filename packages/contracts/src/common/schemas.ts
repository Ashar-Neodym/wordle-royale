import { z } from 'zod';

export const idSchema = z.string().uuid();
export const timestampSchema = z.string().datetime({ offset: true });
export const idempotencyKeySchema = z.string().uuid();
export const requestIdSchema = z.string().min(1);

export const paginationRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const paginationResponseSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
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

export const clientRequestSchema = z.object({
  clientRequestId: idempotencyKeySchema,
});
