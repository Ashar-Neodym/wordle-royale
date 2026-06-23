import type { RatingConfig } from './types.ts';

export const CONSERVATIVE_BETA: RatingConfig = {
  name: 'conservative_beta',
  displayName: 'Conservative beta',
  ratingScale: 400,
  establishedK: 20,
  provisionalK: 32,
  provisionalMatches: 10,
  establishedDeltaCap: 32,
  provisionalDeltaCap: 48,
  ratingFloor: 100,
};

export const BASELINE_V1: RatingConfig = {
  name: 'baseline_v1',
  displayName: 'Baseline V1 candidate',
  ratingScale: 400,
  establishedK: 24,
  provisionalK: 36,
  provisionalMatches: 10,
  establishedDeltaCap: 40,
  provisionalDeltaCap: 60,
  ratingFloor: 100,
};

export const FAST_CONVERGENCE: RatingConfig = {
  name: 'fast_convergence',
  displayName: 'Fast convergence stress candidate',
  ratingScale: 400,
  establishedK: 28,
  provisionalK: 48,
  provisionalMatches: 10,
  establishedDeltaCap: 48,
  provisionalDeltaCap: 72,
  ratingFloor: 100,
};

export const ALL_PARAMETER_SETS = [CONSERVATIVE_BETA, BASELINE_V1, FAST_CONVERGENCE] as const;
