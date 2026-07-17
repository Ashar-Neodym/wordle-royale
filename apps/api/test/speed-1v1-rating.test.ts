import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateSpeed1v1Settlement,
  SPEED_1V1_RATING_ALGORITHM_VERSION,
  validateSpeedAdjudication,
} from '../src/rating/speed-1v1-rating.ts';

const established = (id: string) => ({
  id,
  rating: 1500,
  ratingDeviation: 80,
  provisionalRemaining: 0,
});

test('Speed settlement maps persisted equal-guess server-time winner and stays separate from Standard', () => {
  const outcome = validateSpeedAdjudication([
    { id: 'A', result: 'loss', terminalReason: 'solved', guessesUsed: 4, solveTimeBucket: 241 },
    { id: 'B', result: 'win', terminalReason: 'solved', guessesUsed: 4, solveTimeBucket: 240 },
  ]);
  const settlement = calculateSpeed1v1Settlement({ players: [established('A'), established('B')], outcome });

  assert.equal(settlement.algorithmVersion, SPEED_1V1_RATING_ALGORITHM_VERSION);
  assert.deepEqual(settlement.players.map((player) => [player.id, player.delta]), [['A', -12], ['B', 12]]);
});

test('Speed settlement supports draws, forfeit, timeout, and rejects inconsistent persisted adjudication', () => {
  const draw = validateSpeedAdjudication([
    { id: 'A', result: 'draw', terminalReason: 'deadline_timeout', guessesUsed: null, solveTimeBucket: null },
    { id: 'B', result: 'draw', terminalReason: 'deadline_timeout', guessesUsed: null, solveTimeBucket: null },
  ]);
  assert.equal(draw.draw, true);

  const forfeit = validateSpeedAdjudication([
    { id: 'A', result: 'loss', terminalReason: 'forfeit', guessesUsed: null, solveTimeBucket: null },
    { id: 'B', result: 'win', terminalReason: 'awarded_forfeit_win', guessesUsed: null, solveTimeBucket: null },
  ]);
  assert.equal(forfeit.abandonedPlayerId, 'A');

  assert.throws(() => validateSpeedAdjudication([
    { id: 'A', result: 'win', terminalReason: 'solved', guessesUsed: 4, solveTimeBucket: 241 },
    { id: 'B', result: 'loss', terminalReason: 'solved', guessesUsed: 4, solveTimeBucket: 240 },
  ]), /inconsistent/i);
});

test('Speed void/no-contest is explicitly non-rateable', () => {
  assert.throws(() => validateSpeedAdjudication([
    { id: 'A', result: 'void', terminalReason: 'no_contest', guessesUsed: null, solveTimeBucket: null },
    { id: 'B', result: 'void', terminalReason: 'no_contest', guessesUsed: null, solveTimeBucket: null },
  ]), /not rateable/i);
});
