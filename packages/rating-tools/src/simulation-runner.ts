import { ALL_PARAMETER_SETS, MODE_LADDERS } from './configs.ts';
import { computeGlickoDeltas } from './glicko-formula.ts';
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
      const result = config.algorithm === 'glicko_style_internal'
        ? computeGlickoDeltas({ config, players: scenario.players, placements: scenario.placements })
        : computePlacementDeltas({ config, players: scenario.players, placements: scenario.placements });
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
    reportVersion: 2,
    generatedAt: GENERATED_AT,
    algorithm: 'placement_mmr_v1_candidate',
    modeLadders: [...MODE_LADDERS],
    parameterSets: [...configs],
    scenarios: scenarios.map((scenario) => runScenarioAcrossConfigs(scenario, configs)),
    policyPlaceholders: POLICY_PLACEHOLDERS,
    recommendation: 'Recommend baseline_glicko as the internal MVP target for Standard and Speed/Blitz if Ticket 112 can store RD/confidence fields; otherwise ship baseline_v1 Elo-compatible deltas while preserving Glicko-ready columns. Keep Classic conservative and Multiplayer/Lobby feature-flagged until abuse and abandon policy are locked.',
  };
}
