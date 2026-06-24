import test from 'node:test';
import assert from 'node:assert/strict';
import { consentScopeSchema, createLobbyRequestSchema, guessAcceptedEventSchema, matchReportSchema, serverEventNames, shareCardSchema, submitGuessRequestSchema } from '../index.ts';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const matchId = '33333333-3333-4333-8333-333333333333';
const roundId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
const ts = '2026-06-23T00:00:00.000Z';

test('consent scope uses exact training_insights_opt_in spelling', () => {
  assert.equal(consentScopeSchema.parse('training_insights_opt_in'), 'training_insights_opt_in');
  assert.equal(consentScopeSchema.safeParse('training_insight_opt_in').success, false);
});

test('private rated lobbies are rejected for V1', () => {
  const result = createLobbyRequestSchema.safeParse({
    clientRequestId: requestId,
    visibility: 'private',
    rated: true,
    mode: 'standard',
    language: 'en',
    wordLength: 5,
    difficulty: 'medium',
    minPlayers: 2,
    maxPlayers: 2,
    roundsCount: 3,
    roundTimeSeconds: 120,
    scoringPreset: 'standard_v1',
  });

  assert.equal(result.success, false);
});

test('guess submit request contains intent only and no score or answer authority', () => {
  const parsed = submitGuessRequestSchema.parse({
    clientRequestId: requestId,
    matchId,
    roundId,
    guess: 'CRANE',
    clientSubmittedAt: ts,
  });

  assert.equal(parsed.guess, 'crane');
  assert.equal('score' in parsed, false);
  assert.equal('answer' in parsed, false);
});

test('server event names are exported string literals', () => {
  assert.equal(serverEventNames.guessAccepted, 'guess.accepted');
  assert.equal(serverEventNames.sessionResyncResult, 'session.resync_result');
});

test('guess accepted realtime event validates feedback payload', () => {
  const event = guessAcceptedEventSchema.parse({
    type: 'guess.accepted',
    requestId,
    sentAt: ts,
    payload: {
      accepted: true,
      valid: true,
      clientRequestId: requestId,
      guessNumber: 1,
      feedback: [
        { letter: 'c', state: 'correct' },
        { letter: 'r', state: 'present' },
        { letter: 'a', state: 'absent' },
        { letter: 'n', state: 'absent' },
        { letter: 'e', state: 'present' },
      ],
      playerRoundState: 'active',
      roundState: 'active',
      score: 0,
      serverReceivedAt: ts,
    },
  });

  assert.equal(event.payload.feedback.length, 5);
});

test('match report is participant-only capable and includes score breakdown', () => {
  const report = matchReportSchema.parse({
    matchId,
    mode: 'standard',
    rated: true,
    scoringPreset: 'standard_v1',
    language: 'en',
    wordLength: 5,
    maxGuesses: 6,
    roundsCount: 1,
    roundTimeSeconds: 120,
    dictionary: { answerListVersion: 'en-5-answer-v1', validGuessListVersion: 'en-5-guess-v1', bannedListVersion: 'en-5-banned-v1' },
    reportVisibility: 'participants',
    shareCardEnabled: true,
    startedAt: ts,
    completedAt: ts,
    state: 'completed',
    participants: [{ userId: userA, displayName: 'Ashar', handle: 'ashar', placement: 1, outcome: 'won', totalScore: 171, roundsSolved: 1, totalValidGuesses: 3, totalSolveMs: 45000, ratingBefore: 1500, ratingAfter: 1536, ratingDelta: 36 }],
    rounds: [{ roundId, roundNumber: 1, answer: 'crane', answerListVersion: 'en-5-answer-v1', validGuessListVersion: 'en-5-guess-v1', startedAt: ts, endedAt: ts, playerResults: [{ userId: userA, state: 'solved', validGuessCount: 3, solveMs: 45000, roundScore: 171, scoreBreakdown: { base: 100, guessBonus: 40, speedBonus: 31, penalty: 0, adjustment: 0, total: 171, scoringPreset: 'standard_v1' } }] }],
    finalStandings: [{ userId: userA, placement: 1, totalScore: 171, roundsSolved: 1, totalValidGuesses: 3, totalSolveMs: 45000 }],
  });

  assert.equal(report.reportVisibility, 'participants');
  assert.equal(report.rounds[0]!.playerResults[0]!.scoreBreakdown.total, 171);
});

test('share card schema requires spoilerSafe true', () => {
  assert.equal(shareCardSchema.safeParse({ matchId, shareText: 'I won Wordle Royale', imageUrl: null, spoilerSafe: false, reportVisibility: 'participants' }).success, false);
  assert.equal(shareCardSchema.parse({ matchId: userB, shareText: 'I won Wordle Royale', imageUrl: null, spoilerSafe: true, reportVisibility: 'participants' }).spoilerSafe, true);
});
