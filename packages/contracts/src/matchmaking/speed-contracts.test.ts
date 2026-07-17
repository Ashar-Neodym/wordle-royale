import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSpeed1v1TicketRequestSchema,
  speedRankedModeIdentitySchema,
  speedMatchSnapshotSchema,
} from '../index.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const timestamp = '2026-07-16T12:00:00.000Z';

describe('Speed 1v1 public contracts', () => {
  it('accepts only rated speed queue requests', () => {
    assert.equal(createSpeed1v1TicketRequestSchema.parse({ clientRequestId: id, mode: 'speed_1v1', rated: true }).mode, 'speed_1v1');
    assert.equal(createSpeed1v1TicketRequestSchema.safeParse({ clientRequestId: id, mode: 'standard_1v1', rated: true }).success, false);
  });

  it('keeps opponent state progress-only and puzzle-safe', () => {
    const snapshot = speedMatchSnapshotSchema.parse({
      matchId: id,
      roundId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      mode: 'speed_1v1',
      rulesetVersion: 'speed_1v1_v1_75s',
      state: 'in_progress',
      serverTime: timestamp,
      readyDeadlineAt: timestamp,
      startsAt: timestamp,
      deadlineAt: timestamp,
      timeControl: { roundTimeMs: 75_000, solveTimeBucketMs: 100, maxGuesses: 6 },
      readiness: { viewerReady: true, readyCount: 2 },
      myState: { acceptedGuesses: [{ clientRequestId: id, guess: 'crane', guessNumber: 1, feedback: [{ letter: 'c', state: 'absent' }, { letter: 'r', state: 'absent' }, { letter: 'a', state: 'absent' }, { letter: 'n', state: 'absent' }, { letter: 'e', state: 'absent' }], submittedAt: timestamp }], terminalReason: null, guessesUsed: null, solveElapsedMs: null, result: null },
      opponentProgress: { acceptedGuessCount: 2, terminal: false },
    });
    assert.deepEqual(Object.keys(snapshot.opponentProgress).sort(), ['acceptedGuessCount', 'terminal']);
    assert.equal(JSON.stringify(snapshot).includes('answer'), false);
    assert.equal(snapshot.myState.acceptedGuesses[0]?.clientRequestId, id);
  });

  it('locks the public Speed catalog identity and time-control wording', () => {
    const speed = speedRankedModeIdentitySchema.parse({
      id: 'speed_1v1', enabled: true, queueEnabled: true,
      rulesetVersion: 'speed_1v1_v1_75s',
      ratingAlgorithmConfigVersion: 'speed_1v1_glicko_v1',
      timeControl: {
        roundTimeSeconds: 75, readyWindowSeconds: 20, countdownSeconds: 3,
        maxGuesses: 6, solveTimeBucketMs: 100,
        tieBreaker: 'server_solve_time_bucket',
      },
    });
    assert.equal(speed.timeControl.roundTimeSeconds, 75);
    assert.equal(speed.timeControl.tieBreaker, 'server_solve_time_bucket');
  });
});
