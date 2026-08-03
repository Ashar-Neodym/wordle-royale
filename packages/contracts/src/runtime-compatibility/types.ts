import { z } from 'zod';
import {
  runtimeCompatibilityEnvelopeSchema,
  runtimeCompatibilityPayloadSchema,
  runtimeEnvironmentSchema,
  webAuthorityIdSchema,
} from './schemas.ts';

export type RuntimeCompatibilityPayload = z.infer<typeof runtimeCompatibilityPayloadSchema>;
export type RuntimeCompatibilityEnvelope = z.infer<typeof runtimeCompatibilityEnvelopeSchema>;
export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type WebAuthorityId = z.infer<typeof webAuthorityIdSchema>;
