export const DEFAULT_MATCHMAKING_TRANSACTION_MAX_WAIT_MS = 5_000;
export const DEFAULT_MATCHMAKING_TRANSACTION_TIMEOUT_MS = 20_000;
export const MIN_MATCHMAKING_TRANSACTION_MAX_WAIT_MS = 1_000;
export const MAX_MATCHMAKING_TRANSACTION_MAX_WAIT_MS = 10_000;
export const MIN_MATCHMAKING_TRANSACTION_TIMEOUT_MS = 6_000;
export const MAX_MATCHMAKING_TRANSACTION_TIMEOUT_MS = 30_000;

export type MatchmakingTransactionBudget = {
  maxWait: number;
  timeout: number;
};

export class MatchmakingTransactionConfigError extends Error {
  constructor(variable: string, minimum: number, maximum: number) {
    super(`${variable} must be an integer between ${minimum} and ${maximum} milliseconds.`);
    this.name = 'MatchmakingTransactionConfigError';
  }
}

function boundedInteger(
  env: NodeJS.ProcessEnv,
  variable: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[variable];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new MatchmakingTransactionConfigError(variable, minimum, maximum);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new MatchmakingTransactionConfigError(variable, minimum, maximum);
  }
  return value;
}

export function matchmakingTransactionBudget(env: NodeJS.ProcessEnv = process.env): MatchmakingTransactionBudget {
  return {
    maxWait: boundedInteger(
      env,
      'MATCHMAKING_TRANSACTION_MAX_WAIT_MS',
      DEFAULT_MATCHMAKING_TRANSACTION_MAX_WAIT_MS,
      MIN_MATCHMAKING_TRANSACTION_MAX_WAIT_MS,
      MAX_MATCHMAKING_TRANSACTION_MAX_WAIT_MS,
    ),
    timeout: boundedInteger(
      env,
      'MATCHMAKING_TRANSACTION_TIMEOUT_MS',
      DEFAULT_MATCHMAKING_TRANSACTION_TIMEOUT_MS,
      MIN_MATCHMAKING_TRANSACTION_TIMEOUT_MS,
      MAX_MATCHMAKING_TRANSACTION_TIMEOUT_MS,
    ),
  };
}
