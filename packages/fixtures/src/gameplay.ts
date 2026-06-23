import type { GameplayFixture } from './types.js';
import { fixtureUsers } from './users.js';

const baseRound = {
  id: 'round_1',
  roundNumber: 1,
  state: 'active',
  startsAt: '2026-06-22T12:00:00.000Z',
  endsAt: '2026-06-22T12:02:00.000Z',
  serverNow: '2026-06-22T12:00:42.000Z',
  dictionaryVersion: 'fixture-en-5-v1',
} as const;

export const gameplayFixtures = {
  activeRound: {
    matchId: 'match_active_round',
    state: 'in_progress',
    round: baseRound,
    connection: 'live',
    maxGuesses: 6,
    wordLength: 5,
    localUserId: fixtureUsers.ashar.id,
    players: [
      { userId: fixtureUsers.ashar.id, state: 'active', score: 0, validGuessCount: 1, guesses: [{ guess: 'CRANE', state: 'accepted', feedback: ['absent', 'present', 'absent', 'correct', 'absent'] }] },
      { userId: fixtureUsers.luna.id, state: 'active', score: 0, validGuessCount: 0, guesses: [] },
    ],
  },
  invalidWord: {
    matchId: 'match_invalid_word',
    state: 'in_progress',
    round: baseRound,
    connection: 'live',
    maxGuesses: 6,
    wordLength: 5,
    localUserId: fixtureUsers.ashar.id,
    players: [
      { userId: fixtureUsers.ashar.id, state: 'active', score: 0, validGuessCount: 1, guesses: [
        { guess: 'CRANE', state: 'accepted', feedback: ['absent', 'present', 'absent', 'correct', 'absent'] },
        { guess: 'ZZZZZ', state: 'rejected', feedback: ['invalid', 'invalid', 'invalid', 'invalid', 'invalid'], errorCode: 'WORD_NOT_IN_LIST' },
      ] },
    ],
  },
  pendingSubmit: {
    matchId: 'match_pending_submit',
    state: 'in_progress',
    round: baseRound,
    connection: 'live',
    maxGuesses: 6,
    wordLength: 5,
    localUserId: fixtureUsers.ashar.id,
    players: [
      { userId: fixtureUsers.ashar.id, state: 'active', score: 0, validGuessCount: 1, guesses: [
        { guess: 'CRANE', state: 'accepted', feedback: ['absent', 'present', 'absent', 'correct', 'absent'] },
        { guess: 'LIGHT', state: 'pending', feedback: ['pending', 'pending', 'pending', 'pending', 'pending'] },
      ] },
    ],
  },
  solvedRound: {
    matchId: 'match_solved_round',
    state: 'round_intermission',
    round: { ...baseRound, state: 'completed' },
    connection: 'live',
    maxGuesses: 6,
    wordLength: 5,
    localUserId: fixtureUsers.ashar.id,
    players: [
      { userId: fixtureUsers.ashar.id, state: 'solved', score: 171, validGuessCount: 3, solveTimeMs: 74100, guesses: [
        { guess: 'CRANE', state: 'accepted', feedback: ['absent', 'present', 'absent', 'correct', 'absent'] },
        { guess: 'PLANT', state: 'accepted', feedback: ['absent', 'absent', 'present', 'correct', 'absent'] },
        { guess: 'CROWN', state: 'accepted', feedback: ['correct', 'correct', 'correct', 'correct', 'correct'] },
      ] },
    ],
  },
  failedRound: {
    matchId: 'match_failed_round',
    state: 'round_intermission',
    round: { ...baseRound, state: 'completed' },
    connection: 'live',
    maxGuesses: 6,
    wordLength: 5,
    localUserId: fixtureUsers.ruby.id,
    players: [{ userId: fixtureUsers.ruby.id, state: 'failed', score: 0, validGuessCount: 6, guesses: [] }],
  },
  timedOut: {
    matchId: 'match_timed_out',
    state: 'round_intermission',
    round: { ...baseRound, state: 'completed' },
    connection: 'live',
    maxGuesses: 6,
    wordLength: 5,
    localUserId: fixtureUsers.luna.id,
    players: [{ userId: fixtureUsers.luna.id, state: 'timed_out', score: 0, validGuessCount: 2, guesses: [] }],
  },
  reconnecting: {
    matchId: 'match_reconnecting',
    state: 'in_progress',
    round: baseRound,
    connection: 'reconnecting',
    maxGuesses: 6,
    wordLength: 5,
    localUserId: fixtureUsers.ashar.id,
    players: [{ userId: fixtureUsers.ashar.id, state: 'disconnected', score: 0, validGuessCount: 1, guesses: [] }],
  },
  resyncing: {
    matchId: 'match_resyncing',
    state: 'in_progress',
    round: baseRound,
    connection: 'resyncing',
    maxGuesses: 6,
    wordLength: 5,
    localUserId: fixtureUsers.ashar.id,
    players: [{ userId: fixtureUsers.ashar.id, state: 'active', score: 40, validGuessCount: 2, guesses: [] }],
  },
} as const satisfies Record<string, GameplayFixture>;
