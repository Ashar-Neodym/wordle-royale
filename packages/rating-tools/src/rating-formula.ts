import type { MatchDeltaResult, PlacementGroups, PlayerDeltaResult, RatingConfig, RatingPlayerInput } from './types.ts';

export interface ComputePlacementDeltasInput {
  config: RatingConfig;
  players: RatingPlayerInput[];
  placements: PlacementGroups;
}

function assertUniquePlayers(players: RatingPlayerInput[], placements: PlacementGroups): void {
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

function placementRank(placements: PlacementGroups): Map<string, number> {
  const ranks = new Map<string, number>();
  placements.forEach((group, index) => {
    for (const id of group) ranks.set(id, index);
  });
  return ranks;
}

function actualScore(playerRank: number, opponentRank: number): number {
  if (playerRank < opponentRank) return 1;
  if (playerRank === opponentRank) return 0.5;
  return 0;
}

function expectedScore(playerRating: number, opponentRating: number, ratingScale: number): number {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / ratingScale));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computePlacementDeltas(input: ComputePlacementDeltasInput): MatchDeltaResult {
  const { config, players, placements } = input;
  if (players.length < 2) throw new Error('At least two players are required');
  assertUniquePlayers(players, placements);

  const rankById = placementRank(placements);
  const playerById = new Map(players.map((player) => [player.id, player]));
  const results: PlayerDeltaResult[] = [];

  for (const player of players) {
    const playerRank = rankById.get(player.id);
    if (playerRank === undefined) throw new Error(`Missing rank for player ${player.id}`);

    let scoreDiffSum = 0;
    const expectedByOpponent: Record<string, number> = {};
    const actualByOpponent: Record<string, number> = {};

    for (const opponent of players) {
      if (opponent.id === player.id) continue;
      const opponentRank = rankById.get(opponent.id);
      if (opponentRank === undefined) throw new Error(`Missing rank for player ${opponent.id}`);
      const expected = expectedScore(player.rating, opponent.rating, config.ratingScale);
      const actual = actualScore(playerRank, opponentRank);
      expectedByOpponent[opponent.id] = Number(expected.toFixed(6));
      actualByOpponent[opponent.id] = actual;
      scoreDiffSum += actual - expected;
    }

    const provisionalApplied = player.matchesPlayed < config.provisionalMatches;
    const kApplied = provisionalApplied ? config.provisionalK : config.establishedK;
    const cap = provisionalApplied ? config.provisionalDeltaCap : config.establishedDeltaCap;
    const rawDelta = kApplied * (scoreDiffSum / (players.length - 1));
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
      kApplied,
      cap,
      capApplied: cappedDelta !== roundedDeltaBeforeCap || delta !== cappedDelta,
      provisionalApplied,
      matchesPlayedBefore: player.matchesPlayed,
      matchesPlayedAfter: player.matchesPlayed + 1,
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

export function summarizeResult(result: MatchDeltaResult): { deltas: Record<string, number>; averageAbsoluteDelta: number; maxAbsoluteDelta: number; capHits: number; totalDelta: number } {
  const deltas = Object.fromEntries(result.players.map((player) => [player.id, player.delta]));
  const abs = result.players.map((player) => Math.abs(player.delta));
  return {
    deltas,
    averageAbsoluteDelta: Number((abs.reduce((sum, value) => sum + value, 0) / abs.length).toFixed(2)),
    maxAbsoluteDelta: Math.max(...abs),
    capHits: result.players.filter((player) => player.capApplied).length,
    totalDelta: result.totalDelta,
  };
}
