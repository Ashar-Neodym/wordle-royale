import assert from 'node:assert/strict';
import test from 'node:test';

import { computePlacementDeltas } from './rating-formula.ts';
import { BASELINE_V1 } from './configs.ts';

test('1v1 equal ratings produces baseline +/-12 deltas', () => {
  const result = computePlacementDeltas({
    config: BASELINE_V1,
    players: [
      { id: 'A', rating: 1500, matchesPlayed: 20 },
      { id: 'B', rating: 1500, matchesPlayed: 20 },
    ],
    placements: [['A'], ['B']],
  });

  assert.deepEqual(Object.fromEntries(result.players.map((p) => [p.id, p.delta])), { A: 12, B: -12 });
  assert.equal(result.totalDelta, 0);
});

test('1v1 upset moves more than expected equal-rating win', () => {
  const result = computePlacementDeltas({
    config: BASELINE_V1,
    players: [
      { id: 'A', rating: 1700, matchesPlayed: 20 },
      { id: 'B', rating: 1500, matchesPlayed: 20 },
    ],
    placements: [['B'], ['A']],
  });

  assert.deepEqual(Object.fromEntries(result.players.map((p) => [p.id, p.delta])), { A: -18, B: 18 });
});

test('4-player equal placement averages pairwise deltas to stay comparable with 1v1', () => {
  const result = computePlacementDeltas({
    config: BASELINE_V1,
    players: ['A', 'B', 'C', 'D'].map((id) => ({ id, rating: 1500, matchesPlayed: 20 })),
    placements: [['A'], ['B'], ['C'], ['D']],
  });

  assert.deepEqual(Object.fromEntries(result.players.map((p) => [p.id, p.delta])), {
    A: 12,
    B: 4,
    C: -4,
    D: -12,
  });
});

test('provisional player receives accelerated own delta without over-penalizing opponent', () => {
  const result = computePlacementDeltas({
    config: BASELINE_V1,
    players: [
      { id: 'A', rating: 1500, matchesPlayed: 2 },
      { id: 'B', rating: 1500, matchesPlayed: 20 },
    ],
    placements: [['A'], ['B']],
  });

  assert.deepEqual(Object.fromEntries(result.players.map((p) => [p.id, p.delta])), { A: 18, B: -12 });
  assert.equal(result.players.find((p) => p.id === 'A')?.provisionalApplied, true);
  assert.equal(result.players.find((p) => p.id === 'B')?.provisionalApplied, false);
});

test('delta caps and floor are applied per player', () => {
  const result = computePlacementDeltas({
    config: { ...BASELINE_V1, provisionalDeltaCap: 10, ratingFloor: 1495 },
    players: [
      { id: 'A', rating: 1500, matchesPlayed: 2 },
      { id: 'B', rating: 1500, matchesPlayed: 20 },
    ],
    placements: [['A'], ['B']],
  });

  const byId = Object.fromEntries(result.players.map((p) => [p.id, p]));
  assert.equal(byId.A?.delta, 10);
  assert.equal(byId.A?.capApplied, true);
  assert.equal(byId.B?.newRating, 1495);
});
