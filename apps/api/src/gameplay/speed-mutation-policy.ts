export const SPEED_MUTATION_LIFECYCLE_MS = 24_000;
export const SPEED_MUTATION_MAX_ATTEMPTS = 3;
export const SPEED_MUTATION_MAX_WAIT_MS = 8_000;
export const SPEED_MUTATION_EXECUTION_MS = 12_000;
export const SPEED_MUTATION_COMPLETION_RESERVE_MS = 1_000;
export const SPEED_MUTATION_MIN_USEFUL_MS = 250;
export const SPEED_MUTATION_PROJECTION_EXECUTION_MS = 8_000;

export function speedMutationAttemptOptions(remainingMs: number) {
  const usable = Math.max(0, remainingMs - SPEED_MUTATION_COMPLETION_RESERVE_MS);
  const maxWait = Math.min(SPEED_MUTATION_MAX_WAIT_MS, Math.max(1, Math.floor(usable / 3)));
  const timeout = Math.min(SPEED_MUTATION_EXECUTION_MS, Math.max(1, usable - maxWait));
  return { isolationLevel: 'Serializable' as const, maxWait, timeout };
}

// Ready is serialized explicitly by the Match row lock. ReadCommitted gives a
// waiter a fresh snapshot after that lock is acquired, avoiding an otherwise
// expected Serializable abort/retry after waiting for the first acknowledgement.
export function speedReadyMutationAttemptOptions(remainingMs: number) {
  const { maxWait, timeout } = speedMutationAttemptOptions(remainingMs);
  return { isolationLevel: 'ReadCommitted' as const, maxWait, timeout };
}

export function speedMutationProjectionOptions(remainingMs: number) {
  const usable = Math.max(0, remainingMs - SPEED_MUTATION_COMPLETION_RESERVE_MS);
  const maxWait = Math.min(SPEED_MUTATION_MAX_WAIT_MS, Math.max(1, Math.floor(usable / 3)));
  const timeout = Math.min(SPEED_MUTATION_PROJECTION_EXECUTION_MS, Math.max(1, usable - maxWait));
  return { isolationLevel: 'RepeatableRead' as const, maxWait, timeout };
}

export function speedMutationRetryDelayMs(attempt: number): number {
  // Bounded jitter avoids synchronized retries and never runs while a lock is held.
  return Math.min(250, 50 + Math.floor(Math.random() * (50 * attempt + 1)));
}
