import { z } from 'zod';
import { idSchema, timestampSchema } from '../common/schemas.ts';
import { defaultRating } from '../gameplay/constants.ts';
import { matchHistorySummarySchema } from '../gameplay/schemas.ts';
import { authProviders, consentScopes, profileVisibilities, userRoles, userStatuses } from './constants.ts';

export const consentScopeSchema = z.enum(consentScopes);

export const userSchema = z.object({
  id: idSchema,
  email: z.string().email().nullable(),
  status: z.enum(userStatuses),
  role: z.enum(userRoles),
  createdAt: timestampSchema,
});

export const sessionSchema = z.object({
  id: idSchema,
  userId: idSchema,
  provider: z.enum(authProviders),
  deviceLabel: z.string().nullable(),
  platform: z.enum(['web', 'ios', 'android']).nullable(),
  expiresAt: timestampSchema,
  createdAt: timestampSchema,
});

export const publicProfileSchema = z.object({
  userId: idSchema,
  handle: z.string().regex(/^[a-z0-9_]{3,20}$/),
  displayName: z.string().min(1).max(40),
  avatarUrl: z.string().url().nullable(),
  profileVisibility: z.enum(profileVisibilities),
  rating: z.number().int().nullable(),
  rank: z.number().int().positive().nullable(),
});

export const profileRatingSummarySchema = z.object({
  mode: z.literal('ranked'),
  rating: z.number().int().default(defaultRating),
  matchesPlayed: z.number().int().nonnegative(),
  provisional: z.boolean(),
  provisionalRemaining: z.number().int().nonnegative(),
  algorithm: z.literal('placement_mmr_v1'),
  algorithmConfigVersion: z.string().min(1),
  rank: z.number().int().positive().nullable(),
  unrated: z.boolean().default(false),
});

export const profileSummarySchema = z.object({
  userId: idSchema,
  handle: z.string().regex(/^[a-z0-9_]{3,20}$/),
  displayName: z.string().min(1).max(40),
  avatarUrl: z.string().url().nullable(),
  rating: profileRatingSummarySchema,
  recentMatches: z.array(matchHistorySummarySchema),
});

export const currentProfileSummarySchema = profileSummarySchema;
export const publicProfileSummarySchema = profileSummarySchema;

export const currentUserSchema = userSchema.extend({
  profile: publicProfileSchema.pick({ handle: true, displayName: true, avatarUrl: true, profileVisibility: true }).nullable(),
});

export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(40),
});

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authTokenResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export const handleAvailabilityResponseSchema = z.object({
  handle: z.string().min(1),
  normalizedHandle: z.string().regex(/^[a-z0-9_]{3,20}$/),
  available: z.boolean(),
});

export const updateProfileRequestSchema = z.object({
  handle: z.string().regex(/^[a-z0-9_]{3,20}$/).optional(),
  displayName: z.string().min(1).max(40).optional(),
  avatarUrl: z.string().url().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one profile field is required.' });

export const consentStateSchema = z.object({
  necessaryGameplayAcknowledgedAt: timestampSchema.nullable(),
  productAnalyticsConsent: z.boolean(),
  trainingInsightsConsent: z.boolean(),
  updatedAt: timestampSchema.nullable(),
});

export const updateConsentRequestSchema = z.object({
  productAnalyticsConsent: z.boolean().optional(),
  trainingInsightsConsent: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one consent field is required.' });

export const analyticsConsentEventSchema = z.object({
  scope: consentScopeSchema,
  granted: z.boolean(),
  updatedAt: timestampSchema,
});
