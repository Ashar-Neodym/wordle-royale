import type { ComputePlacementDeltasInput } from './rating-formula.ts';
import type { MatchDeltaResult, PlayerDeltaResult, RatingConfig, RatingPlayerInput } from './types.ts';

const Q = Math.log(10) / 400;
const GLICKO_SCALE = 173.7178;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function actualScore(playerRank: number, opponentRank: number): number {
  if (playerRank < opponentRank) return 1;
  if (playerRank === opponentRank) return 0.5;
  return 0;
}

function placementRank(placements: string[][]): Map<string, number> {
  const ranks = new Map<string, number>();
  placements.forEach((group, index) => {
    for (const id of group) ranks.set(id, index);
  });
  return ranks;
}

function assertUniquePlayers(players: RatingPlayerInput[], placements: string[][]): void {
  const ids = new Set<string>();
  for (const player of players) {
    if (ids.has(player.id)) throw new Error(`Duplicate player id: ${player.id}`);
    ids.add(player.id);
  }
  const placed = new Set<string>();
  for (const group of placements) {
    if (group.length === 0) throw new Error('Placement groups must not be empty');
    for (const id of group) {
      if (!ids.has(id)) throw new Error(`Placement references unknown player: ${id}`);
      if (placed.has(id)) throw new Error(`Player appears in multiple placement groups: ${id}`);
      placed.add(id);
    }
  }
  if (placed.size !== ids.size) throw new Error('Every player must appear exactly once in placements');
}

function preMatchRatingDeviation(config: RatingConfig, player: RatingPlayerInput): number {
  const initial = config.initialRatingDeviation ?? 350;
  const established = config.establishedRatingDeviation ?? 80;
  const min = config.minimumRatingDeviation ?? 50;
  const max = config.maximumRatingDeviation ?? 350;
  const base = player.ratingDeviation ?? (player.matchesPlayed < config.provisionalMatches ? initial : established);
  const inactiveSteps = Math.max(0, Math.floor((player.inactiveDays ?? 0) / 30));
  const inflated = base + inactiveSteps * (config.inactivityRdPer30Days ?? 0);
  return clamp(inflated, min, max);
}

function g(rd: number): number {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
}

function expected(playerRating: number, opponentRating: number, opponentRd: number): number {
  return 1 / (1 + 10 ** ((g(opponentRd) * (opponentRating - playerRating)) / 400));
}

function nextRd(config: RatingConfig, rd: number, dSquaredInverse: number): number {
  const min = config.minimumRatingDeviation ?? 50;
  const max = config.maximumRatingDeviation ?? 350;
  const dSquared = dSquaredInverse > 0 ? 1 / (Q * Q * dSquaredInverse) : GLICKO_SCALE * GLICKO_SCALE;
  const updated = Math.sqrt(1 / ((1 / (rd * rd)) + (1 / dSquared)));
  return Math.round(clamp(updated, min, max));
}

export function computeGlickoDeltas(input: ComputePlacementDeltasInput): MatchDeltaResult {
  const { config, players, placements } = input;
  if (players.length < 2) throw new Error('At least two players are required');
  assertUniquePlayers(players, placements);

  const rankById = placementRank(placements);
  const rdById = new Map(players.map((player) => [player.id, preMatchRatingDeviation(config, player)]));
  const results: PlayerDeltaResult[] = [];

  for (const player of players) {
    const playerRank = rankById.get(player.id);
    if (playerRank === undefined) throw new Error(`Missing rank for player ${player.id}`);

    const rd = rdById.get(player.id)!;
    let weightedOutcome = 0;
    let information = 0;
    const expectedByOpponent: Record<string, number> = {};
    const actualByOpponent: Record<string, number> = {};

    for (const opponent of players) {
      if (opponent.id === player.id) continue;
      const opponentRank = rankById.get(opponent.id);
      if (opponentRank === undefined) throw new Error(`Missing rank for player ${opponent.id}`);
      const opponentRd = rdById.get(opponent.id)!;
      const expectation = expected(player.rating, opponent.rating, opponentRd);
      const actual = actualScore(playerRank, opponentRank);
      const gOpponent = g(opponentRd);
      expectedByOpponent[opponent.id] = Number(expectation.toFixed(6));
      actualByOpponent[opponent.id] = actual;
      weightedOutcome += gOpponent * (actual - expectation);
      information += gOpponent * gOpponent * expectation * (1 - expectation);
    }

    const provisionalApplied = player.matchesPlayed < config.provisionalMatches;
    const cap = provisionalApplied ? config.provisionalDeltaCap : config.establishedDeltaCap;
    const rdMultiplier = clamp(rd / (config.establishedRatingDeviation ?? 80), 0.7, provisionalApplied ? 1.8 : 1.5);
    const rawDelta = config.establishedK * rdMultiplier * (weightedOutcome / (players.length - 1));
    const roundedDeltaBeforeCap = Math.round(rawDelta);
    const cappedDelta = clamp(roundedDeltaBeforeCap, -cap, cap);
    const flooredNewRating = Math.max(config.ratingFloor, player.rating + cappedDelta);
    const delta = flooredNewRating - player.rating;

    results.push({
      id: player.id,
      oldRating: player.rating,
      rawDelta: Number(rawDelta.toFixed(6)),
      roundedDeltaBeforeCap,
      delta,
      newRating: flooredNewRating,
      kApplied: Math.round(config.establishedK * rdMultiplier),
      cap,
      capApplied: cappedDelta !== roundedDeltaBeforeCap || delta !== cappedDelta,
      provisionalApplied,
      matchesPlayedBefore: player.matchesPlayed,
      matchesPlayedAfter: player.matchesPlayed + 1,
      ratingDeviationBefore: rd,
      ratingDeviationAfter: nextRd(config, rd, information),
      expectedByOpponent,
      actualByOpponent,
    });
  }

  return {
    configName: config.name,
    players: results,
    totalDelta: results.reduce((sum, player) => sum + player.delta, 0),
  };
}
