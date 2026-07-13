import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateStandard1v1Settlement, STANDARD_1V1_RATING_ALGORITHM_VERSION } from '../src/rating/standard-1v1-rating.ts';

const established = (id: string, rating = 1500) => ({
  id,
  rating,
  ratingDeviation: 80,
  provisionalRemaining: 0,
});

test('standard 1v1 equal-rating win is deterministic and zero-sum', () => {
  const result = calculateStandard1v1Settlement({
    players: [established('A'), established('B')],
    outcome: { winnerId: 'A', loserId: 'B', draw: false, abandonedPlayerId: null },
  });

  assert.equal(result.algorithmVersion, STANDARD_1V1_RATING_ALGORITHM_VERSION);
  assert.deepEqual(result.players.map((player) => [player.id, player.delta]), [['A', 12], ['B', -12]]);
  assert.equal(result.totalDelta, 0);
});

test('expected higher-rated winner moves less than a lower-rated upset winner', () => {
  const expected = calculateStandard1v1Settlement({
    players: [established('A', 1700), established('B', 1500)],
    outcome: { winnerId: 'A', loserId: 'B', draw: false, abandonedPlayerId: null },
  });
  const upset = calculateStandard1v1Settlement({
    players: [established('A', 1700), established('B', 1500)],
    outcome: { winnerId: 'B', loserId: 'A', draw: false, abandonedPlayerId: null },
  });

  assert.ok(Math.abs(expected.players[0]!.delta) < Math.abs(upset.players[0]!.delta));
  assert.equal(expected.totalDelta, 0);
  assert.equal(upset.totalDelta, 0);
});

test('equal-rating draw is zero and abandon adjudicates as a loss', () => {
  const draw = calculateStandard1v1Settlement({
    players: [established('A'), established('B')],
    outcome: { winnerId: null, loserId: null, draw: true, abandonedPlayerId: null },
  });
  assert.deepEqual(draw.players.map((player) => player.delta), [0, 0]);

  const abandon = calculateStandard1v1Settlement({
    players: [established('A'), established('B')],
    outcome: { winnerId: 'B', loserId: 'A', draw: false, abandonedPlayerId: 'A' },
  });
  assert.deepEqual(abandon.players.map((player) => player.delta), [-12, 12]);
});

test('provisional high-RD player moves faster with bounded non-zero-sum drift', () => {
  const result = calculateStandard1v1Settlement({
    players: [
      { id: 'A', rating: 1500, ratingDeviation: 350, provisionalRemaining: 9 },
      established('B'),
    ],
    outcome: { winnerId: 'A', loserId: 'B', draw: false, abandonedPlayerId: null },
  });

  const a = result.players[0]!;
  const b = result.players[1]!;
  assert.ok(a.delta > Math.abs(b.delta));
  assert.ok(a.delta <= 64);
  assert.ok(Math.abs(result.totalDelta) <= 64);
  assert.ok(a.ratingDeviationAfter < a.ratingDeviationBefore);
  assert.equal(a.provisionalRemainingAfter, 8);
});

test('matches locked baseline_glicko movement and inflates RD after inactivity', () => {
  const baseline = calculateStandard1v1Settlement({
    players: [
      { id: 'A', rating: 1500, ratingDeviation: 350, provisionalRemaining: 10 },
      { id: 'B', rating: 1500, ratingDeviation: 350, provisionalRemaining: 10 },
    ],
    outcome: { winnerId: 'A', loserId: 'B', draw: false, abandonedPlayerId: null },
  });
  assert.deepEqual(baseline.players.map((player) => player.delta), [14, -14]);

  const inactive = calculateStandard1v1Settlement({
    players: [{ ...established('A'), inactiveDays: 90 }, established('B')],
    outcome: { winnerId: 'A', loserId: 'B', draw: false, abandonedPlayerId: null },
  });
  assert.equal(inactive.players[0]!.ratingDeviationBefore, 155);
  assert.ok(inactive.players[0]!.ratingDeviationAfter < 155);
});

test('rejects anything other than exactly two distinct players', () => {
  assert.throws(() => calculateStandard1v1Settlement({
    players: [established('A')],
    outcome: { winnerId: null, loserId: null, draw: true, abandonedPlayerId: null },
  }), /exactly two players/i);
});
