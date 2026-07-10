import type { RatingConfig } from './types.ts';

export const CONSERVATIVE_BETA: RatingConfig = {
  name: 'conservative_beta',
  displayName: 'Conservative beta',
  algorithm: 'elo_pairwise',
  ratingScale: 400,
  establishedK: 20,
  provisionalK: 32,
  provisionalMatches: 10,
  establishedDeltaCap: 32,
  provisionalDeltaCap: 48,
  ratingFloor: 100,
  initialRating: 1500,
};

export const BASELINE_V1: RatingConfig = {
  name: 'baseline_v1',
  displayName: 'Baseline V1 candidate',
  algorithm: 'elo_pairwise',
  ratingScale: 400,
  establishedK: 24,
  provisionalK: 36,
  provisionalMatches: 10,
  establishedDeltaCap: 40,
  provisionalDeltaCap: 60,
  ratingFloor: 100,
  initialRating: 1500,
};

export const FAST_CONVERGENCE: RatingConfig = {
  name: 'fast_convergence',
  displayName: 'Fast convergence stress candidate',
  algorithm: 'elo_pairwise',
  ratingScale: 400,
  establishedK: 28,
  provisionalK: 48,
  provisionalMatches: 10,
  establishedDeltaCap: 48,
  provisionalDeltaCap: 72,
  ratingFloor: 100,
  initialRating: 1500,
};

export const BASELINE_GLICKO: RatingConfig = {
  name: 'baseline_glicko',
  displayName: 'Glicko-style internal baseline',
  algorithm: 'glicko_style_internal',
  ratingScale: 400,
  establishedK: 24,
  provisionalK: 36,
  provisionalMatches: 10,
  establishedDeltaCap: 40,
  provisionalDeltaCap: 64,
  ratingFloor: 100,
  initialRating: 1500,
  initialRatingDeviation: 350,
  establishedRatingDeviation: 80,
  minimumRatingDeviation: 50,
  maximumRatingDeviation: 350,
  inactivityRdPer30Days: 25,
};

export const MODE_LADDERS = [
  {
    mode: 'standard_1v1',
    label: 'Standard 1v1',
    players: '1v1',
    ratingConfigName: BASELINE_GLICKO.name,
    startingRating: 1500,
    provisionalMatches: 10,
    adjudication: 'Solver beats non-solver; fewer guesses wins; same guesses draw.',
    notes: 'Primary competitive queue and first MVP ladder.',
  },
  {
    mode: 'speed_1v1',
    label: 'Speed / Blitz 1v1',
    players: '1v1',
    ratingConfigName: BASELINE_GLICKO.name,
    startingRating: 1500,
    provisionalMatches: 10,
    adjudication: 'Fewer guesses wins; same guesses use server-received solve time.',
    notes: 'Separate ladder because time/latency pressure materially changes skill expression.',
  },
  {
    mode: 'classic_1v1',
    label: 'Classic 1v1',
    players: '1v1',
    ratingConfigName: CONSERVATIVE_BETA.name,
    startingRating: 1500,
    provisionalMatches: 10,
    adjudication: 'Fewer guesses wins; same guesses draw; slower time pressure.',
    notes: 'Lower volatility candidate for slower/casual-competitive play.',
  },
  {
    mode: 'multiplayer_lobby',
    label: 'Multiplayer / Lobby',
    players: '2-4',
    ratingConfigName: CONSERVATIVE_BETA.name,
    startingRating: 1500,
    provisionalMatches: 10,
    adjudication: 'Placement converts to pairwise wins/losses/draws with lobby-size averaging.',
    notes: 'Keep separate and feature-flagged until collusion/abuse policy matures.',
  },
] as const;

export const ALL_PARAMETER_SETS = [CONSERVATIVE_BETA, BASELINE_V1, FAST_CONVERGENCE, BASELINE_GLICKO] as const;
