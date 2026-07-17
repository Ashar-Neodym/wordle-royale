export const SPEED_1V1_RULESET_VERSION = 'speed_1v1_v1_75s' as const;
export const SPEED_1V1_ADJUDICATION_VERSION = 'speed_1v1_adjudication_v1' as const;
export const SPEED_READY_WINDOW_MS = 20_000;
export const SPEED_COUNTDOWN_MS = 3_000;
export const SPEED_ROUND_TIME_MS = 75_000;
export const SPEED_SOLVE_BUCKET_MS = 100;
export const SPEED_MAX_GUESSES = 6;

export type SpeedTerminal = {
  userId: string;
  terminalReason: 'solved' | 'max_guesses' | 'deadline_timeout' | 'forfeit' | 'awarded_forfeit_win' | 'no_contest' | 'operator_void';
  guessesUsed: number | null;
  solveElapsedMs: number | null;
  solveTimeBucket: number | null;
};

export type SpeedAdjudication = {
  winnerUserId: string | null;
  loserUserId: string | null;
  draw: boolean;
  rated: boolean;
  results: Record<string, 'win' | 'loss' | 'draw' | 'void'>;
};

export function speedGuessWithinDeadline(receivedAt: Date, deadlineAt: Date): boolean {
  return receivedAt.getTime() <= deadlineAt.getTime();
}

export function speedSolveElapsedMs(receivedAt: Date, startedAt: Date): number {
  return Math.max(0, Math.min(SPEED_ROUND_TIME_MS, receivedAt.getTime() - startedAt.getTime()));
}

export function speedSolveTimeBucket(elapsedMs: number): number {
  if (!Number.isInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > SPEED_ROUND_TIME_MS) {
    throw new Error('speed_elapsed_out_of_range');
  }
  return Math.floor(elapsedMs / SPEED_SOLVE_BUCKET_MS);
}

function decided(first: SpeedTerminal, second: SpeedTerminal, winner: SpeedTerminal): SpeedAdjudication {
  const loser = winner.userId === first.userId ? second : first;
  return {
    winnerUserId: winner.userId,
    loserUserId: loser.userId,
    draw: false,
    rated: true,
    results: { [winner.userId]: 'win', [loser.userId]: 'loss' },
  };
}

export function adjudicateSpeedParticipants(participants: readonly SpeedTerminal[]): SpeedAdjudication {
  if (participants.length !== 2 || participants[0]!.userId === participants[1]!.userId) {
    throw new Error('speed_requires_two_distinct_participants');
  }
  const [first, second] = participants as readonly [SpeedTerminal, SpeedTerminal];
  if (participants.some((participant) => participant.terminalReason === 'no_contest' || participant.terminalReason === 'operator_void')) {
    return {
      winnerUserId: null,
      loserUserId: null,
      draw: false,
      rated: false,
      results: { [first.userId]: 'void', [second.userId]: 'void' },
    };
  }

  const forfeiter = participants.filter((participant) => participant.terminalReason === 'forfeit');
  if (forfeiter.length === 1) return decided(first, second, forfeiter[0]!.userId === first.userId ? second : first);
  if (forfeiter.length > 1) {
    return { winnerUserId: null, loserUserId: null, draw: false, rated: false, results: { [first.userId]: 'void', [second.userId]: 'void' } };
  }

  const firstSolved = first.terminalReason === 'solved';
  const secondSolved = second.terminalReason === 'solved';
  if (firstSolved !== secondSolved) return decided(first, second, firstSolved ? first : second);
  if (firstSolved && secondSolved) {
    if (first.guessesUsed === null || second.guessesUsed === null || first.solveTimeBucket === null || second.solveTimeBucket === null) {
      throw new Error('speed_solve_fields_missing');
    }
    if (first.guessesUsed !== second.guessesUsed) return decided(first, second, first.guessesUsed < second.guessesUsed ? first : second);
    if (first.solveTimeBucket !== second.solveTimeBucket) return decided(first, second, first.solveTimeBucket < second.solveTimeBucket ? first : second);
  }

  return {
    winnerUserId: null,
    loserUserId: null,
    draw: true,
    rated: true,
    results: { [first.userId]: 'draw', [second.userId]: 'draw' },
  };
}
