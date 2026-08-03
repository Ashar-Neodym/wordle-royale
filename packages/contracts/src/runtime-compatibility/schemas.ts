import { z } from 'zod';
import { canonicalApiServiceSchema, deploymentRevisionSchema, successEnvelopeSchema } from '../common/schemas.ts';
import {
  MAX_RUNTIME_ENVIRONMENT_LENGTH,
  MAX_SUPPORTED_WEB_AUTHORITY_IDS,
  MAX_WEB_AUTHORITY_ID_LENGTH,
  RUNTIME_COMPATIBILITY_SCHEMA_VERSION,
} from './constants.ts';

export const runtimeEnvironmentSchema = z.string()
  .min(1)
  .max(MAX_RUNTIME_ENVIRONMENT_LENGTH)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);

export const webAuthorityIdSchema = z.string()
  .min(1)
  .max(MAX_WEB_AUTHORITY_ID_LENGTH)
  .regex(/^wordle-royale\/[a-z0-9]+(?:-[a-z0-9]+)*-authority\/[1-9][0-9]*$/);

export const supportedWebAuthorityIdsSchema = z.array(webAuthorityIdSchema)
  .min(1)
  .max(MAX_SUPPORTED_WEB_AUTHORITY_IDS)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Supported web authority IDs must be unique.',
      });
    }
  });

export const runtimeCompatibilityPayloadSchema = z.object({
  schemaVersion: z.literal(RUNTIME_COMPATIBILITY_SCHEMA_VERSION),
  service: canonicalApiServiceSchema,
  environment: runtimeEnvironmentSchema,
  revision: deploymentRevisionSchema,
  supportedWebAuthorityIds: supportedWebAuthorityIdsSchema,
}).strict();

export const runtimeCompatibilityEnvelopeSchema = successEnvelopeSchema(runtimeCompatibilityPayloadSchema);
