import {
  calculateStandard1v1Settlement,
  STANDARD_1V1_RATING_ALGORITHM,
} from './standard-1v1-rating.ts';
import type {
  Standard1v1Adjudication,
  Standard1v1RatingPlayer,
  Standard1v1SettlementResult,
} from './standard-1v1-rating.ts';

export const SPEED_1V1_RATING_ALGORITHM = STANDARD_1V1_RATING_ALGORITHM;
export const SPEED_1V1_RATING_ALGORITHM_VERSION = 'speed_1v1_glicko_v1' as const;

export type SpeedParticipantResult = 'win' | 'loss' | 'draw' | 'void';

export interface PersistedSpeedParticipantAdjudication {
  id: string;
  result: SpeedParticipantResult | null | undefined;
  terminalReason: string | null | undefined;
  guessesUsed: number | null | undefined;
  solveTimeBucket: number | null | undefined;
}

export interface Speed1v1SettlementResult extends Omit<Standard1v1SettlementResult, 'algorithmVersion'> {
  algorithmVersion: typeof SPEED_1V1_RATING_ALGORITHM_VERSION;
}

function expectedResultPair(participants: readonly PersistedSpeedParticipantAdjudication[]): ['win', 'loss'] | ['loss', 'win'] | ['draw', 'draw'] {
  const [first, second] = participants;
  if (!first || !second) throw new Error('Speed 1v1 adjudication requires exactly two participants');

  if (first.terminalReason === 'forfeit' || second.terminalReason === 'forfeit') {
    if (first.terminalReason === 'forfeit' && second.terminalReason === 'forfeit') {
      throw new Error('Double-forfeit Speed adjudication is not rateable');
    }
    return first.terminalReason === 'forfeit' ? ['loss', 'win'] : ['win', 'loss'];
  }

  const firstSolved = first.terminalReason === 'solved';
  const secondSolved = second.terminalReason === 'solved';
  if (firstSolved !== secondSolved) return firstSolved ? ['win', 'loss'] : ['loss', 'win'];
  if (!firstSolved && !secondSolved) return ['draw', 'draw'];

  if (!first.guessesUsed || !second.guessesUsed || first.solveTimeBucket === null || first.solveTimeBucket === undefined || second.solveTimeBucket === null || second.solveTimeBucket === undefined) {
    throw new Error('Solved Speed adjudication requires guesses and server solve-time buckets');
  }
  if (first.guessesUsed !== second.guessesUsed) return first.guessesUsed < second.guessesUsed ? ['win', 'loss'] : ['loss', 'win'];
  if (first.solveTimeBucket !== second.solveTimeBucket) return first.solveTimeBucket < second.solveTimeBucket ? ['win', 'loss'] : ['loss', 'win'];
  return ['draw', 'draw'];
}

export function validateSpeedAdjudication(participants: readonly PersistedSpeedParticipantAdjudication[]): Standard1v1Adjudication {
  if (participants.length !== 2 || new Set(participants.map((participant) => participant.id)).size !== 2) {
    throw new Error('Speed 1v1 adjudication requires exactly two distinct participants');
  }
  if (participants.some((participant) => participant.result === 'void' || participant.terminalReason === 'no_contest' || participant.terminalReason === 'operator_void')) {
    throw new Error('Void/no-contest Speed adjudication is not rateable');
  }

  const expected = expectedResultPair(participants);
  const actual = participants.map((participant) => participant.result);
  if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
    throw new Error('Persisted Speed adjudication is inconsistent with authoritative terminal timing fields');
  }
  if (expected[0] === 'draw') {
    return { winnerId: null, loserId: null, draw: true, abandonedPlayerId: null };
  }
  const winnerIndex = expected[0] === 'win' ? 0 : 1;
  const loserIndex = winnerIndex === 0 ? 1 : 0;
  return {
    winnerId: participants[winnerIndex]!.id,
    loserId: participants[loserIndex]!.id,
    draw: false,
    abandonedPlayerId: participants[loserIndex]!.terminalReason === 'forfeit' ? participants[loserIndex]!.id : null,
  };
}

export function calculateSpeed1v1Settlement(input: {
  players: readonly Standard1v1RatingPlayer[];
  outcome: Standard1v1Adjudication;
}): Speed1v1SettlementResult {
  const settlement = calculateStandard1v1Settlement(input);
  return { ...settlement, algorithmVersion: SPEED_1V1_RATING_ALGORITHM_VERSION };
}
