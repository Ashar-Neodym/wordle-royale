import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  consentScopeSchema,
  createLobbyRequestSchema,
  errorEnvelopeSchema,
  guessAcceptedEventSchema,
  listEnvelopeSchema,
  matchReportSchema,
  rankedMatchResultSummarySchema,
  rankedMatchStartResponseDataSchema,
  ratingEventContractSchema,
  readinessStatusSchema,
  serverEventNames,
  shareCardSchema,
  startRankedMatchRequestSchema,
  submitGuessRequestSchema,
  successEnvelopeSchema,
  validationErrorDetailsSchema,
} from '../index.ts';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const matchId = '33333333-3333-4333-8333-333333333333';
const roundId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
const ts = '2026-06-23T00:00:00.000Z';

test('REST success and error envelopes validate request metadata', () => {
  const success = successEnvelopeSchema(z.object({ ok: z.literal(true) })).parse({
    data: { ok: true },
    error: null,
    requestId,
  });

  assert.equal(success.data.ok, true);

  const error = errorEnvelopeSchema.parse({
    data: null,
    error: { code: 'validation_failed', message: 'Request validation failed.', details: { issues: [] } },
    requestId,
  });

  assert.equal(error.error.code, 'validation_failed');
});

test('validation error details use API-compatible issue arrays', () => {
  const details = validationErrorDetailsSchema.parse({
    issues: [{ path: ['body', 'visibility'], code: 'invalid_value', message: 'Invalid option.' }],
  });

  assert.deepEqual(details.issues[0]!.path, ['body', 'visibility']);
});

test('list envelope schema wraps items with pagination metadata', () => {
  const envelope = listEnvelopeSchema(z.object({ id: z.string() })).parse({
    data: { items: [{ id: 'lobby-1' }], pagination: { nextCursor: null } },
    error: null,
    requestId,
  });

  assert.equal(envelope.data.items[0]!.id, 'lobby-1');
  assert.equal(envelope.data.pagination.nextCursor, null);
});

test('readiness status supports dependency placeholders and future live checks', () => {
  const readiness = readinessStatusSchema.parse({
    status: 'ok',
    service: 'wordle-royale-api',
    environment: 'test',
    checkedAt: ts,
    dependencies: {
      database: { status: 'not_checked_stub', message: 'Skeleton readiness only.' },
      redis: { status: 'ok', checkedAt: ts, latencyMs: 3 },
    },
  });

  assert.equal(readiness.dependencies.database!.status, 'not_checked_stub');
  assert.equal(readiness.dependencies.redis!.latencyMs, 3);
});

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

test('ranked match start request requires lobby id for lobby source', () => {
  assert.equal(startRankedMatchRequestSchema.safeParse({ clientRequestId: requestId, source: 'lobby' }).success, false);
  assert.equal(startRankedMatchRequestSchema.parse({ clientRequestId: requestId, lobbyId: matchId, source: 'lobby' }).source, 'lobby');
});

test('ranked match start response wraps server-shaped snapshot without answer leakage', () => {
  const response = rankedMatchStartResponseDataSchema.parse({
    matchId,
    roundId,
    state: 'in_progress',
    snapshot: {
      matchId,
      state: 'in_progress',
      serverTime: ts,
      currentRound: { roundId, roundNumber: 1, state: 'active', startsAt: ts, endsAt: ts, wordLength: 5, maxGuesses: 6, dictionaryVersion: 'en-5-test' },
      myState: { guesses: [], playerRoundState: 'active', score: 0 },
      standings: [{ userId: userA, placement: null, totalScore: 0, roundsSolved: 0, totalValidGuesses: 0, totalSolveMs: 0 }],
    },
  });

  assert.equal(response.snapshot.currentRound!.wordLength, 5);
  assert.equal('answer' in response.snapshot.currentRound!, false);
});

test('rating event contract defaults V1 placement MMR baseline to 1200', () => {
  const event = ratingEventContractSchema.parse({
    eventId: '66666666-6666-4666-8666-666666666666',
    matchId,
    kind: 'placement_mmr_v1',
    status: 'applied',
    idempotencyKey: `rating:${matchId}:placement_mmr_v1`,
    algorithmVersion: 'placement_mmr_v1',
    defaultRating: 1200,
    createdAt: ts,
    appliedAt: ts,
    participants: [
      { userId: userA, ratingBefore: 1200, ratingAfter: 1216, ratingDelta: 16, placement: 1 },
      { userId: userB, ratingBefore: 1200, ratingAfter: 1184, ratingDelta: -16, placement: 2 },
    ],
  });

  assert.equal(event.defaultRating, 1200);
  assert.equal(event.participants[0]!.ratingDelta, 16);
});

test('ranked match result summary includes final standings and nullable rating event', () => {
  const summary = rankedMatchResultSummarySchema.parse({
    matchId,
    state: 'completed',
    completedAt: ts,
    completionReason: 'all_players_final',
    finalStandings: [
      { userId: userA, placement: 1, totalScore: 171, roundsSolved: 1, totalValidGuesses: 3, totalSolveMs: 45000, ratingBefore: 1200, ratingAfter: 1216, ratingDelta: 16 },
      { userId: userB, placement: 2, totalScore: 120, roundsSolved: 1, totalValidGuesses: 5, totalSolveMs: 90000, ratingBefore: 1200, ratingAfter: 1184, ratingDelta: -16 },
    ],
    ratingEvent: null,
  });

  assert.equal(summary.state, 'completed');
  assert.equal(summary.finalStandings.length, 2);
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
