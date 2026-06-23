import { z } from 'zod';
import { difficultyTiers, validationLevels, wordListStatuses, wordListTypes } from './constants.ts';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const wordEntrySchema = z.object({
  text: z.string().min(1),
  normalizedText: z.string().regex(/^[a-z]{5}$/),
  difficultyTier: z.enum(difficultyTiers).default('medium'),
  difficultyScore: z.number().min(0).max(100).default(50),
  sourceIds: z.array(z.string().min(1)).min(1),
  hasDuplicateLetters: z.boolean().optional(),
});

export const wordListArtifactSchema = z.object({
  listId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(wordListTypes),
  language: z.string().min(2),
  locale: z.string().min(2),
  wordLength: z.literal(5),
  version: z.string().min(1),
  rankedEligible: z.boolean(),
  status: z.enum(wordListStatuses),
  words: z.array(wordEntrySchema),
});

export const listManifestEntrySchema = z.object({
  listId: z.string().min(1),
  count: z.number().int().nonnegative(),
  checksumSha256: sha256Schema,
});

export const wordLibraryManifestSchema = z.object({
  manifestVersion: z.literal(1),
  dictionaryVersion: z.string().min(1),
  language: z.string().min(2),
  locale: z.string().min(2),
  wordLength: z.literal(5),
  policy: z.record(z.string(), z.unknown()),
  lists: z.object({
    answer: listManifestEntrySchema,
    guess: listManifestEntrySchema,
    banned: listManifestEntrySchema,
  }),
  sources: z.array(z.object({
    sourceId: z.string().min(1),
    licenseName: z.string().min(1),
    licenseReviewed: z.boolean(),
  })).min(1),
  validation: z.object({
    passed: z.boolean(),
    reportPath: z.string().min(1),
  }),
  createdAt: z.string().datetime(),
});

export const validationCheckSchema = z.object({
  id: z.string().min(1),
  level: z.enum(validationLevels),
  passed: z.boolean(),
  message: z.string().min(1),
});

export const validationReportSchema = z.object({
  reportVersion: z.literal(1),
  dictionaryVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  passed: z.boolean(),
  summary: z.object({
    answerCount: z.number().int().nonnegative(),
    guessCount: z.number().int().nonnegative(),
    bannedCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
  }),
  checks: z.array(validationCheckSchema),
});
