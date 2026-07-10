import { z } from 'zod';
import { acceptedGuessResultSchema, completeRankedMatchRequestSchema, currentRankedMatchStateResponseDataSchema, guessResultSchema, matchDetailSummarySchema, matchHistoryListSchema, matchHistoryParticipantSchema, matchHistorySummarySchema, matchHistoryViewerSchema, matchSnapshotSchema, participantStandingSchema, rankedModeSchema, rankedMatchResultSummarySchema, rankedMatchStartResponseDataSchema, ratingEventContractSchema, ratingParticipantDeltaSchema, rejectedGuessResultSchema, roundSnapshotSchema, scoreBreakdownSchema, startRankedMatchRequestSchema, submitGuessRequestSchema } from './schemas.ts';

export type RankedMode = z.infer<typeof rankedModeSchema>;
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;
export type ParticipantStanding = z.infer<typeof participantStandingSchema>;
export type RoundSnapshot = z.infer<typeof roundSnapshotSchema>;
export type MatchSnapshot = z.infer<typeof matchSnapshotSchema>;
export type SubmitGuessRequest = z.infer<typeof submitGuessRequestSchema>;
export type AcceptedGuessResult = z.infer<typeof acceptedGuessResultSchema>;
export type RejectedGuessResult = z.infer<typeof rejectedGuessResultSchema>;
export type GuessResult = z.infer<typeof guessResultSchema>;

export type StartRankedMatchRequest = z.infer<typeof startRankedMatchRequestSchema>;
export type RankedMatchStartResponseData = z.infer<typeof rankedMatchStartResponseDataSchema>;
export type CurrentRankedMatchStateResponseData = z.infer<typeof currentRankedMatchStateResponseDataSchema>;
export type CompleteRankedMatchRequest = z.infer<typeof completeRankedMatchRequestSchema>;
export type RatingParticipantDelta = z.infer<typeof ratingParticipantDeltaSchema>;
export type RatingEventContract = z.infer<typeof ratingEventContractSchema>;
export type RankedMatchResultSummary = z.infer<typeof rankedMatchResultSummarySchema>;
export type MatchHistoryParticipant = z.infer<typeof matchHistoryParticipantSchema>;
export type MatchHistoryViewer = z.infer<typeof matchHistoryViewerSchema>;
export type MatchHistorySummary = z.infer<typeof matchHistorySummarySchema>;
export type MatchHistoryList = z.infer<typeof matchHistoryListSchema>;
export type MatchDetailSummary = z.infer<typeof matchDetailSummarySchema>;
