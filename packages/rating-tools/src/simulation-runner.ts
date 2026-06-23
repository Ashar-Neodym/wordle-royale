import { ALL_PARAMETER_SETS } from './configs.ts';
import { computePlacementDeltas, summarizeResult } from './rating-formula.ts';
import { DEFAULT_SCENARIOS, POLICY_PLACEHOLDERS } from './scenarios.ts';
import type { ComparisonReport, PlacementScenario, RatingConfig, ScenarioComparisonResult } from './types.ts';

export interface RunComparisonInput {
  configs?: readonly RatingConfig[];
  scenarios?: readonly PlacementScenario[];
}

const GENERATED_AT = '2026-06-22T00:00:00.000Z';

export function runScenarioAcrossConfigs(scenario: PlacementScenario, configs: readonly RatingConfig[]): ScenarioComparisonResult {
  return {
    id: scenario.id,
    title: scenario.title,
    mode: scenario.mode,
    playerCount: scenario.playerCount,
    tags: scenario.tags,
    ...(scenario.policyNote ? { policyNote: scenario.policyNote } : {}),
    configResults: configs.map((config) => {
      const result = computePlacementDeltas({ config, players: scenario.players, placements: scenario.placements });
      return {
        configName: config.name,
        ...summarizeResult(result),
      };
    }),
  };
}

export function runComparison(input: RunComparisonInput = {}): ComparisonReport {
  const configs = input.configs ?? ALL_PARAMETER_SETS;
  const scenarios = input.scenarios ?? DEFAULT_SCENARIOS;

  return {
    reportVersion: 1,
    generatedAt: GENERATED_AT,
    algorithm: 'placement_mmr_v1_candidate',
    parameterSets: [...configs],
    scenarios: scenarios.map((scenario) => runScenarioAcrossConfigs(scenario, configs)),
    policyPlaceholders: POLICY_PLACEHOLDERS,
    recommendation: 'Start ranked beta with baseline_v1 for 1v1 only; keep 3–4 player ranked feature-flagged until QA and telemetry pass.',
  };
}
