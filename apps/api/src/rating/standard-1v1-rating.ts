export const STANDARD_1V1_RATING_ALGORITHM = 'glicko_style_internal' as const;
export const STANDARD_1V1_RATING_ALGORITHM_VERSION = 'standard_1v1_glicko_v1' as const;
export const STANDARD_1V1_INITIAL_RATING = 1500;
export const STANDARD_1V1_INITIAL_RATING_DEVIATION = 350;
export const STANDARD_1V1_MINIMUM_RATING_DEVIATION = 50;
export const STANDARD_1V1_ESTABLISHED_RATING_DEVIATION = 80;
export const STANDARD_1V1_PROVISIONAL_GAMES = 10;

const Q = Math.log(10) / 400;
const ESTABLISHED_K = 24;
const ESTABLISHED_DELTA_CAP = 40;
const PROVISIONAL_DELTA_CAP = 64;
const RATING_FLOOR = 100;
const INACTIVITY_RD_PER_30_DAYS = 25;

export interface Standard1v1RatingPlayer {
  id: string;
  rating: number;
  ratingDeviation: number;
  provisionalRemaining: number;
  inactiveDays?: number;
}

export interface Standard1v1Adjudication {
  winnerId: string | null;
  loserId: string | null;
  draw: boolean;
  abandonedPlayerId: string | null;
}

export interface Standard1v1PlayerSettlement {
  id: string;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  rawDelta: number;
  ratingDeviationBefore: number;
  ratingDeviationAfter: number;
  provisionalBefore: boolean;
  provisionalRemainingAfter: number;
  expectedScore: number;
  actualScore: number;
  deltaCap: number;
  capApplied: boolean;
}

export interface Standard1v1SettlementResult {
  algorithm: typeof STANDARD_1V1_RATING_ALGORITHM;
  algorithmVersion: typeof STANDARD_1V1_RATING_ALGORITHM_VERSION;
  players: [Standard1v1PlayerSettlement, Standard1v1PlayerSettlement];
  totalDelta: number;
  roundingPolicy: 'independent_nearest_integer';
  driftBound: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function g(ratingDeviation: number): number {
  return 1 / Math.sqrt(1 + (3 * Q * Q * ratingDeviation * ratingDeviation) / (Math.PI * Math.PI));
}

function effectiveRatingDeviation(player: Standard1v1RatingPlayer): number {
  const inactiveSteps = Math.max(0, Math.floor((player.inactiveDays ?? 0) / 30));
  return clamp(
    player.ratingDeviation + inactiveSteps * INACTIVITY_RD_PER_30_DAYS,
    STANDARD_1V1_MINIMUM_RATING_DEVIATION,
    STANDARD_1V1_INITIAL_RATING_DEVIATION,
  );
}

function expectedScore(playerRating: number, opponentRating: number, opponentRatingDeviation: number): number {
  return 1 / (1 + 10 ** ((g(opponentRatingDeviation) * (opponentRating - playerRating)) / 400));
}

function actualScore(playerId: string, outcome: Standard1v1Adjudication): number {
  if (outcome.draw) return 0.5;
  if (outcome.winnerId === playerId) return 1;
  if (outcome.loserId === playerId) return 0;
  throw new Error(`Standard 1v1 outcome does not adjudicate player ${playerId}`);
}

function nextRatingDeviation(currentRatingDeviation: number, opponentRatingDeviation: number, expected: number): number {
  const opponentG = g(opponentRatingDeviation);
  const information = Q * Q * opponentG * opponentG * expected * (1 - expected);
  const updated = Math.sqrt(1 / ((1 / (currentRatingDeviation * currentRatingDeviation)) + information));
  return Math.round(clamp(updated, STANDARD_1V1_MINIMUM_RATING_DEVIATION, STANDARD_1V1_INITIAL_RATING_DEVIATION));
}

function validateOutcome(players: readonly Standard1v1RatingPlayer[], outcome: Standard1v1Adjudication): void {
  const ids = new Set(players.map((player) => player.id));
  if (ids.size !== 2) throw new Error('Standard 1v1 settlement requires exactly two distinct players');
  if (outcome.draw) {
    if (outcome.winnerId !== null || outcome.loserId !== null || outcome.abandonedPlayerId !== null) {
      throw new Error('Draw adjudication cannot include winner, loser, or abandoner');
    }
    return;
  }
  if (!outcome.winnerId || !outcome.loserId || outcome.winnerId === outcome.loserId) {
    throw new Error('Decisive Standard 1v1 adjudication requires distinct winner and loser');
  }
  if (!ids.has(outcome.winnerId) || !ids.has(outcome.loserId)) {
    throw new Error('Standard 1v1 adjudication references an unknown player');
  }
  if (outcome.abandonedPlayerId !== null && outcome.abandonedPlayerId !== outcome.loserId) {
    throw new Error('Abandoning player must be the adjudicated loser');
  }
}

export function calculateStandard1v1Settlement(input: {
  players: readonly Standard1v1RatingPlayer[];
  outcome: Standard1v1Adjudication;
}): Standard1v1SettlementResult {
  if (input.players.length !== 2) throw new Error('Standard 1v1 settlement requires exactly two players');
  validateOutcome(input.players, input.outcome);

  const effectiveRds = input.players.map(effectiveRatingDeviation);
  const settlements = input.players.map((player, index) => {
    const opponent = input.players[index === 0 ? 1 : 0]!;
    const playerRd = effectiveRds[index]!;
    const opponentRd = effectiveRds[index === 0 ? 1 : 0]!;
    const expected = expectedScore(player.rating, opponent.rating, opponentRd);
    const actual = actualScore(player.id, input.outcome);
    const provisionalBefore = player.provisionalRemaining > 0;
    const rdMultiplier = clamp(
      playerRd / STANDARD_1V1_ESTABLISHED_RATING_DEVIATION,
      0.7,
      provisionalBefore ? 1.8 : 1.5,
    );
    const rawDelta = ESTABLISHED_K * rdMultiplier * g(opponentRd) * (actual - expected);
    const rounded = Math.round(rawDelta);
    const deltaCap = provisionalBefore ? PROVISIONAL_DELTA_CAP : ESTABLISHED_DELTA_CAP;
    const cappedDelta = clamp(rounded, -deltaCap, deltaCap);
    const ratingAfter = Math.max(RATING_FLOOR, player.rating + cappedDelta);
    const delta = ratingAfter - player.rating;

    return {
      id: player.id,
      ratingBefore: player.rating,
      ratingAfter,
      delta,
      rawDelta: Number(rawDelta.toFixed(6)),
      ratingDeviationBefore: playerRd,
      ratingDeviationAfter: nextRatingDeviation(playerRd, opponentRd, expected),
      provisionalBefore,
      provisionalRemainingAfter: Math.max(0, player.provisionalRemaining - 1),
      expectedScore: Number(expected.toFixed(6)),
      actualScore: actual,
      deltaCap,
      capApplied: delta !== rounded,
    };
  }) as [Standard1v1PlayerSettlement, Standard1v1PlayerSettlement];

  return {
    algorithm: STANDARD_1V1_RATING_ALGORITHM,
    algorithmVersion: STANDARD_1V1_RATING_ALGORITHM_VERSION,
    players: settlements,
    totalDelta: settlements[0].delta + settlements[1].delta,
    roundingPolicy: 'independent_nearest_integer',
    driftBound: PROVISIONAL_DELTA_CAP,
  };
}
