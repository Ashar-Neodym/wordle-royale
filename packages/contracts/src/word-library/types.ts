import type { z } from 'zod';
import type { wordEntrySchema, wordLibraryManifestSchema, wordListArtifactSchema, validationReportSchema } from './schemas.ts';

export type WordEntry = z.infer<typeof wordEntrySchema>;
export type WordListArtifact = z.infer<typeof wordListArtifactSchema>;
export type WordLibraryManifest = z.infer<typeof wordLibraryManifestSchema>;
export type ValidationReport = z.infer<typeof validationReportSchema>;
