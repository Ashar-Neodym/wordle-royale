import { z } from 'zod';
import { matchReportParticipantSchema, matchReportRoundSchema, matchReportSchema, reportVisibilitySchema, shareCardSchema } from './schemas.ts';

export type ReportVisibility = z.infer<typeof reportVisibilitySchema>;
export type MatchReportParticipant = z.infer<typeof matchReportParticipantSchema>;
export type MatchReportRound = z.infer<typeof matchReportRoundSchema>;
export type MatchReport = z.infer<typeof matchReportSchema>;
export type ShareCard = z.infer<typeof shareCardSchema>;
