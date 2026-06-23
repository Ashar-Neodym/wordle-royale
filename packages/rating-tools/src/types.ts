export type PlayerId = string;

export interface RatingConfig {
  name: string;
  displayName: string;
  ratingScale: number;
  establishedK: number;
  provisionalK: number;
  provisionalMatches: number;
  establishedDeltaCap: number;
  provisionalDeltaCap: number;
  ratingFloor: number;
}

export interface RatingPlayerInput {
  id: PlayerId;
  rating: number;
  matchesPlayed: number;
}

export type PlacementGroups = PlayerId[][];

export interface PlacementScenario {
  id: string;
  title: string;
  description: string;
  mode: '1v1' | 'multiplayer' | 'policy_placeholder';
  playerCount: number;
  players: RatingPlayerInput[];
  placements: PlacementGroups;
  tags: string[];
  policyNote?: string;
}

export interface PlayerDeltaResult {
  id: PlayerId;
  oldRating: number;
  rawDelta: number;
  roundedDeltaBeforeCap: number;
  delta: number;
  newRating: number;
  kApplied: number;
  cap: number;
  capApplied: boolean;
  provisionalApplied: boolean;
  matchesPlayedBefore: number;
  matchesPlayedAfter: number;
  expectedByOpponent: Record<PlayerId, number>;
  actualByOpponent: Record<PlayerId, number>;
}

export interface MatchDeltaResult {
  configName: string;
  players: PlayerDeltaResult[];
  totalDelta: number;
}

export interface ScenarioConfigResult {
  configName: string;
  deltas: Record<PlayerId, number>;
  averageAbsoluteDelta: number;
  maxAbsoluteDelta: number;
  capHits: number;
  totalDelta: number;
}

export interface ScenarioComparisonResult {
  id: string;
  title: string;
  mode: PlacementScenario['mode'];
  playerCount: number;
  tags: string[];
  policyNote?: string;
  configResults: ScenarioConfigResult[];
}

export interface PolicyPlaceholder {
  id: string;
  title: string;
  status: 'not_locked';
  simulationTreatment: string;
  openDecision: string;
}

export interface ComparisonReport {
  reportVersion: 1;
  generatedAt: string;
  algorithm: 'placement_mmr_v1_candidate';
  parameterSets: RatingConfig[];
  scenarios: ScenarioComparisonResult[];
  policyPlaceholders: PolicyPlaceholder[];
  recommendation: string;
}
