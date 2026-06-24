import { z } from 'zod';
import { acceptedGuessResultSchema, guessResultSchema, matchSnapshotSchema, participantStandingSchema, rejectedGuessResultSchema, roundSnapshotSchema, scoreBreakdownSchema, submitGuessRequestSchema } from './schemas.ts';

export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;
export type ParticipantStanding = z.infer<typeof participantStandingSchema>;
export type RoundSnapshot = z.infer<typeof roundSnapshotSchema>;
export type MatchSnapshot = z.infer<typeof matchSnapshotSchema>;
export type SubmitGuessRequest = z.infer<typeof submitGuessRequestSchema>;
export type AcceptedGuessResult = z.infer<typeof acceptedGuessResultSchema>;
export type RejectedGuessResult = z.infer<typeof rejectedGuessResultSchema>;
export type GuessResult = z.infer<typeof guessResultSchema>;
