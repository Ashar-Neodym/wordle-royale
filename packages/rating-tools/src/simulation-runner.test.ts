import assert from 'node:assert/strict';
import test from 'node:test';

import { runComparison } from './simulation-runner.ts';
import { ALL_PARAMETER_SETS } from './configs.ts';
import { DEFAULT_SCENARIOS } from './scenarios.ts';

test('comparison reports at least three parameter sets across required scenarios', () => {
  const report = runComparison({ configs: ALL_PARAMETER_SETS, scenarios: DEFAULT_SCENARIOS });

  assert.equal(report.reportVersion, 1);
  assert.equal(report.parameterSets.length >= 3, true);
  assert.equal(report.scenarios.some((scenario) => scenario.id === '1v1_upset'), true);
  assert.equal(report.scenarios.some((scenario) => scenario.id === '1v1_provisional_win'), true);
  assert.equal(report.scenarios.some((scenario) => scenario.playerCount === 4), true);
  assert.equal(report.policyPlaceholders.some((policy) => policy.id === 'void_early_no_meaningful_play'), true);
});

test('comparison is deterministic for report generation', () => {
  const first = runComparison({ configs: ALL_PARAMETER_SETS, scenarios: DEFAULT_SCENARIOS });
  const second = runComparison({ configs: ALL_PARAMETER_SETS, scenarios: DEFAULT_SCENARIOS });

  assert.deepEqual(first, second);
});
