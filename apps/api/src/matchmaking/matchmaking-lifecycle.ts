import { performance } from 'node:perf_hooks';
import { ServiceUnavailableException } from '@nestjs/common';
import type { MatchmakingTransactionBudget } from './matchmaking-transaction-budget.ts';

export const MATCHMAKING_LIFECYCLE_MS = 90_000;
export const MATCHMAKING_LIFECYCLE_DEPENDENCIES = Symbol('MATCHMAKING_LIFECYCLE_DEPENDENCIES');
export const MATCHMAKING_COMPLETION_RESERVE_MS = 1_000;
export const MAX_MATCHMAKING_TRANSACTION_ATTEMPTS = 4;
export const MIN_CLAMPED_MAX_WAIT_MS = 250;
export const MIN_CLAMPED_TIMEOUT_MS = 1_000;
export const MATCHMAKING_BACKOFF_BASE_MS = 50;
export const MATCHMAKING_BACKOFF_CAP_MS = 1_000;

export type MatchmakingLifecyclePhase = 'initial' | 'unique_recovery';

export type MatchmakingLifecycleDependencies = {
  monotonicNowMs: () => number;
  wallNow: () => Date;
  random: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

export type MatchmakingAttemptContext = {
  attempt: number;
  attemptNow: Date;
  phase: MatchmakingLifecyclePhase;
};

export type MatchmakingTransactionOptions = {
  isolationLevel: 'Serializable';
  maxWait: number;
  timeout: number;
};

export type MatchmakingTransactionInvoker = <T>(
  callback: (tx: any) => Promise<T>,
  options: MatchmakingTransactionOptions,
) => Promise<T>;

export type MatchmakingLifecycleCallbacks<T> = {
  initial: (tx: any, context: MatchmakingAttemptContext) => Promise<T>;
  recoverUnique?: (tx: any, context: MatchmakingAttemptContext) => Promise<T>;
};

export class RecognizedMatchmakingTicketUniqueError extends Error {
  constructor(public readonly original: unknown) {
    super('Recognized matchmaking ticket uniqueness race.');
    this.name = 'RecognizedMatchmakingTicketUniqueError';
  }
}

export class MatchmakingRecoveryPendingError extends Error {
  constructor() {
    super('The winning active matchmaking ticket is not visible yet.');
    this.name = 'MatchmakingRecoveryPendingError';
  }
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'P2002';
}

export function isRecognizedMatchmakingTicketUniqueError(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error) || typeof error !== 'object' || error === null) return false;
  const metadata = (error as {
    meta?: { target?: unknown; constraint?: unknown; constraint_name?: unknown };
  }).meta;
  if (!metadata) return false;

  const namedTargets = [metadata.target, metadata.constraint, metadata.constraint_name]
    .filter((value): value is string => typeof value === 'string');
  if (namedTargets.some((value) =>
    value === 'MatchmakingTicket_userId_mode_idempotencyKey_key'
    || value === 'matchmaking_ticket_one_active_ranked_per_user'
    || value === 'matchmaking_ticket_one_active_per_user_mode')) return true;

  if (Array.isArray(metadata.target)) {
    const fields = metadata.target.filter((value): value is string => typeof value === 'string');
    const isIdempotencyKey = fields.length === 3
      && fields.includes('userId')
      && fields.includes('mode')
      && fields.includes('idempotencyKey');
    const isActiveTicket = (fields.length === 1 && fields[0] === 'userId')
      || (fields.length === 2 && fields.includes('userId') && fields.includes('mode'));
    return isIdempotencyKey || isActiveTicket;
  }
  return false;
}

export function recognizedMatchmakingTicketUniqueError(error: unknown): RecognizedMatchmakingTicketUniqueError {
  return new RecognizedMatchmakingTicketUniqueError(error);
}

export function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof MatchmakingRecoveryPendingError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: string; meta?: { code?: string } };
  if (candidate.code === 'P2034') return true;
  return candidate.code === 'P2010'
    && (candidate.meta?.code === '40001' || candidate.meta?.code === '40P01');
}

export function isTransactionExpiryError(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'P2028';
}

export function defaultMatchmakingLifecycleDependencies(): MatchmakingLifecycleDependencies {
  return {
    monotonicNowMs: () => performance.now(),
    wallNow: () => new Date(),
    random: () => Math.random(),
    sleep: async (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

function lifecycleTimeout(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'matchmaking_lifecycle_timeout',
    message: 'Matchmaking could not complete within its request deadline. Retry the request.',
  });
}

function transactionTimeout(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'matchmaking_transaction_timeout',
    message: 'Matchmaking took too long to complete. Retry the request.',
  });
}

function retryExhausted(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'matchmaking_retry_exhausted',
    message: 'Matchmaking was busy resolving concurrent queue activity. Retry the request.',
  });
}

function attemptOptions(
  remainingMs: number,
  configured: MatchmakingTransactionBudget,
): MatchmakingTransactionOptions {
  const usableMs = Math.floor(remainingMs - MATCHMAKING_COMPLETION_RESERVE_MS);
  const maxWait = Math.min(configured.maxWait, Math.floor(usableMs / 5));
  const timeout = Math.min(configured.timeout, usableMs - maxWait);
  if (!Number.isFinite(maxWait) || !Number.isFinite(timeout)
    || maxWait < MIN_CLAMPED_MAX_WAIT_MS
    || timeout < MIN_CLAMPED_TIMEOUT_MS
    || maxWait + timeout > usableMs) {
    throw lifecycleTimeout();
  }
  return { isolationLevel: 'Serializable', maxWait, timeout };
}

function nextBackoff(previousBackoffMs: number, random: () => number): number {
  const upper = Math.min(MATCHMAKING_BACKOFF_CAP_MS, previousBackoffMs * 3);
  const sample = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  return MATCHMAKING_BACKOFF_BASE_MS
    + Math.floor(sample * (upper - MATCHMAKING_BACKOFF_BASE_MS + 1));
}

export async function runMatchmakingLifecycle<T>(
  transaction: MatchmakingTransactionInvoker,
  callbacks: MatchmakingLifecycleCallbacks<T>,
  configuredBudget: MatchmakingTransactionBudget,
  dependencies: MatchmakingLifecycleDependencies = defaultMatchmakingLifecycleDependencies(),
): Promise<T> {
  const startedAt = dependencies.monotonicNowMs();
  const deadline = startedAt + MATCHMAKING_LIFECYCLE_MS;
  let attemptsUsed = 0;
  let phase: MatchmakingLifecyclePhase = 'initial';
  let previousBackoffMs = MATCHMAKING_BACKOFF_BASE_MS;

  while (attemptsUsed < MAX_MATCHMAKING_TRANSACTION_ATTEMPTS) {
    const remainingMs = deadline - dependencies.monotonicNowMs();
    const options = attemptOptions(remainingMs, configuredBudget);
    attemptsUsed += 1;
    const context: MatchmakingAttemptContext = {
      attempt: attemptsUsed,
      attemptNow: dependencies.wallNow(),
      phase,
    };
    const callback = phase === 'initial' ? callbacks.initial : callbacks.recoverUnique;
    if (!callback) throw new Error('Matchmaking uniqueness recovery callback is unavailable.');

    try {
      return await transaction((tx) => callback(tx, context), options);
    } catch (error) {
      if (isTransactionExpiryError(error)) throw transactionTimeout();

      const recognizedUnique = error instanceof RecognizedMatchmakingTicketUniqueError;
      if (recognizedUnique && phase === 'initial' && callbacks.recoverUnique) {
        phase = 'unique_recovery';
      } else if (!isRetryableTransactionError(error)
        && !(recognizedUnique && phase === 'unique_recovery')) {
        throw error;
      }

      if (attemptsUsed >= MAX_MATCHMAKING_TRANSACTION_ATTEMPTS) {
        if (dependencies.monotonicNowMs() >= deadline) throw lifecycleTimeout();
        throw retryExhausted();
      }

      const delay = nextBackoff(previousBackoffMs, dependencies.random);
      previousBackoffMs = delay;
      const remainingBeforeSleep = deadline - dependencies.monotonicNowMs();
      const minimumNextEnvelope = MATCHMAKING_COMPLETION_RESERVE_MS
        + MIN_CLAMPED_MAX_WAIT_MS
        + MIN_CLAMPED_TIMEOUT_MS;
      if (remainingBeforeSleep - delay < minimumNextEnvelope) throw lifecycleTimeout();
      await dependencies.sleep(delay);
    }
  }

  throw retryExhausted();
}
