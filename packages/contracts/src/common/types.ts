import { z } from 'zod';
import { errorEnvelopeSchema, idSchema, idempotencyKeySchema, paginationRequestSchema, paginationResponseSchema, requestIdSchema, timestampSchema } from './schemas.ts';

export type Id = z.infer<typeof idSchema>;
export type Timestamp = z.infer<typeof timestampSchema>;
export type RequestId = z.infer<typeof requestIdSchema>;
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
export type PaginationRequest = z.infer<typeof paginationRequestSchema>;
export type PaginationResponse = z.infer<typeof paginationResponseSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
