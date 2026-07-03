import { z } from 'zod';
import {
  errorDetailSchema,
  errorEnvelopeSchema,
  idSchema,
  idempotencyKeySchema,
  listEnvelopeDataSchema,
  listEnvelopeSchema,
  paginationRequestSchema,
  paginationResponseSchema,
  readinessDependenciesSchema,
  readinessDependencySchema,
  readinessDependencyStatusSchema,
  readinessStatusSchema,
  requestIdSchema,
  requestMetadataSchema,
  successEnvelopeSchema,
  timestampSchema,
  validationErrorDetailsSchema,
  validationErrorIssueSchema,
} from './schemas.ts';

export type Id = z.infer<typeof idSchema>;
export type Timestamp = z.infer<typeof timestampSchema>;
export type RequestId = z.infer<typeof requestIdSchema>;
export type RequestMetadata = z.infer<typeof requestMetadataSchema>;
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
export type PaginationRequest = z.infer<typeof paginationRequestSchema>;
export type PaginationResponse = z.infer<typeof paginationResponseSchema>;
export type ValidationErrorIssue = z.infer<typeof validationErrorIssueSchema>;
export type ValidationErrorDetails = z.infer<typeof validationErrorDetailsSchema>;
export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type SuccessEnvelope<T> = z.infer<ReturnType<typeof successEnvelopeSchema<z.ZodType<T>>>>;
export type ListEnvelopeData<T> = z.infer<ReturnType<typeof listEnvelopeDataSchema<z.ZodType<T>>>>;
export type ListEnvelope<T> = z.infer<ReturnType<typeof listEnvelopeSchema<z.ZodType<T>>>>;
export type ReadinessDependencyStatus = z.infer<typeof readinessDependencyStatusSchema>;
export type ReadinessDependency = z.infer<typeof readinessDependencySchema>;
export type ReadinessDependencies = z.infer<typeof readinessDependenciesSchema>;
export type ReadinessStatus = z.infer<typeof readinessStatusSchema>;
