import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adjudicateSpeedParticipants,
  speedGuessWithinDeadline,
  speedSolveElapsedMs,
  speedSolveTimeBucket,
  type SpeedTerminal,
} from '../src/gameplay/speed-1v1-rules.ts';

const terminal = (userId: string, overrides: Partial<SpeedTerminal>): SpeedTerminal => ({
  userId,
  terminalReason: 'deadline_timeout',
  guessesUsed: null,
  solveElapsedMs: null,
  solveTimeBucket: null,
  ...overrides,
});

describe('Speed 1v1 authoritative rules', () => {
  it('uses inclusive 75-second elapsed time and exact 100ms buckets', () => {
    const start = new Date('2026-07-16T12:00:00.000Z');
    assert.equal(speedSolveElapsedMs(new Date(start.getTime() - 1), start), 0);
    assert.equal(speedSolveElapsedMs(new Date(start.getTime() + 75_000), start), 75_000);
    assert.equal(speedSolveTimeBucket(99), 0);
    assert.equal(speedSolveTimeBucket(100), 1);
    assert.equal(speedSolveTimeBucket(75_000), 750);
    const deadline = new Date(start.getTime() + 75_000);
    assert.equal(speedGuessWithinDeadline(deadline, deadline), true);
    assert.equal(speedGuessWithinDeadline(new Date(deadline.getTime() + 1), deadline), false);
  });

  it('orders solve status, guess count, then bucket', () => {
    const solvedThreeSlow = terminal('a', { terminalReason: 'solved', guessesUsed: 3, solveElapsedMs: 30_000, solveTimeBucket: 300 });
    const failed = terminal('b', { terminalReason: 'deadline_timeout' });
    assert.equal(adjudicateSpeedParticipants([solvedThreeSlow, failed]).winnerUserId, 'a');

    const solvedFourFast = terminal('b', { terminalReason: 'solved', guessesUsed: 4, solveElapsedMs: 1_000, solveTimeBucket: 10 });
    assert.equal(adjudicateSpeedParticipants([solvedThreeSlow, solvedFourFast]).winnerUserId, 'a');

    const solvedThreeFast = terminal('b', { terminalReason: 'solved', guessesUsed: 3, solveElapsedMs: 29_999, solveTimeBucket: 299 });
    assert.equal(adjudicateSpeedParticipants([solvedThreeSlow, solvedThreeFast]).winnerUserId, 'b');
  });

  it('draws equal-guess solves in the same bucket and both failures', () => {
    const first = terminal('a', { terminalReason: 'solved', guessesUsed: 2, solveElapsedMs: 10_001, solveTimeBucket: 100 });
    const second = terminal('b', { terminalReason: 'solved', guessesUsed: 2, solveElapsedMs: 10_099, solveTimeBucket: 100 });
    assert.deepEqual(adjudicateSpeedParticipants([first, second]).results, { a: 'draw', b: 'draw' });
    assert.deepEqual(adjudicateSpeedParticipants([
      terminal('a', { terminalReason: 'max_guesses', guessesUsed: 6 }),
      terminal('b', { terminalReason: 'deadline_timeout' }),
    ]).results, { a: 'draw', b: 'draw' });
  });

  it('makes sole post-reveal forfeit a rated loss and no-contest void', () => {
    const forfeit = adjudicateSpeedParticipants([
      terminal('a', { terminalReason: 'forfeit' }),
      terminal('b', { terminalReason: 'awarded_forfeit_win' }),
    ]);
    assert.deepEqual(forfeit.results, { b: 'win', a: 'loss' });
    assert.equal(forfeit.rated, true);

    const noContest = adjudicateSpeedParticipants([
      terminal('a', { terminalReason: 'no_contest' }),
      terminal('b', { terminalReason: 'no_contest' }),
    ]);
    assert.deepEqual(noContest.results, { a: 'void', b: 'void' });
    assert.equal(noContest.rated, false);
  });
});
