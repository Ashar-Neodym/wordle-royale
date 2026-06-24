import { z } from 'zod';
import { analyticsConsentEventSchema, authTokenResponseSchema, consentScopeSchema, consentStateSchema, currentUserSchema, handleAvailabilityResponseSchema, loginRequestSchema, publicProfileSchema, registerRequestSchema, sessionSchema, updateConsentRequestSchema, updateProfileRequestSchema, userSchema } from './schemas.ts';

export type ConsentScope = z.infer<typeof consentScopeSchema>;
export type UserDto = z.infer<typeof userSchema>;
export type SessionDto = z.infer<typeof sessionSchema>;
export type PublicProfileDto = z.infer<typeof publicProfileSchema>;
export type CurrentUserDto = z.infer<typeof currentUserSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;
export type HandleAvailabilityResponse = z.infer<typeof handleAvailabilityResponseSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type ConsentStateDto = z.infer<typeof consentStateSchema>;
export type UpdateConsentRequest = z.infer<typeof updateConsentRequestSchema>;
export type AnalyticsConsentEvent = z.infer<typeof analyticsConsentEventSchema>;
