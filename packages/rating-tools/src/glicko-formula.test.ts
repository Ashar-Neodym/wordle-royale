import assert from 'node:assert/strict';
import test from 'node:test';

import { computeGlickoDeltas } from './glicko-formula.ts';
import { BASELINE_GLICKO } from './configs.ts';

test('Glicko-style equal established 1v1 stays near Elo baseline but tracks RD', () => {
  const result = computeGlickoDeltas({
    config: BASELINE_GLICKO,
    players: [
      { id: 'A', rating: 1500, matchesPlayed: 20, ratingDeviation: 80 },
      { id: 'B', rating: 1500, matchesPlayed: 20, ratingDeviation: 80 },
    ],
    placements: [['A'], ['B']],
  });

  const byId = Object.fromEntries(result.players.map((player) => [player.id, player]));
  assert.equal(byId.A?.delta, 12);
  assert.equal(byId.B?.delta, -12);
  assert.ok((byId.A?.ratingDeviationAfter ?? 999) < 80);
  assert.equal(result.totalDelta, 0);
});

test('Glicko-style provisional high-RD winner moves faster without uncapped chaos', () => {
  const result = computeGlickoDeltas({
    config: BASELINE_GLICKO,
    players: [
      { id: 'A', rating: 1500, matchesPlayed: 1, ratingDeviation: 350 },
      { id: 'B', rating: 1500, matchesPlayed: 50, ratingDeviation: 60 },
    ],
    placements: [['A'], ['B']],
  });

  const byId = Object.fromEntries(result.players.map((player) => [player.id, player]));
  assert.equal(byId.A?.provisionalApplied, true);
  assert.ok((byId.A?.delta ?? 0) > Math.abs(byId.B?.delta ?? 999));
  assert.ok((byId.A?.delta ?? 999) <= BASELINE_GLICKO.provisionalDeltaCap);
  assert.ok((byId.B?.delta ?? -999) >= -BASELINE_GLICKO.establishedDeltaCap);
});

test('Glicko-style inactivity inflates RD before update', () => {
  const result = computeGlickoDeltas({
    config: BASELINE_GLICKO,
    players: [
      { id: 'A', rating: 1500, matchesPlayed: 20, ratingDeviation: 80, inactiveDays: 120 },
      { id: 'B', rating: 1500, matchesPlayed: 20, ratingDeviation: 80 },
    ],
    placements: [['A'], ['B']],
  });

  const a = result.players.find((player) => player.id === 'A');
  assert.ok(a);
  assert.ok(a.ratingDeviationBefore !== undefined);
  assert.ok(a.ratingDeviationAfter !== undefined);
  assert.ok(a.ratingDeviationBefore > 80);
  assert.ok(a.ratingDeviationAfter >= 80);
  assert.ok(a.delta > 12);
});
