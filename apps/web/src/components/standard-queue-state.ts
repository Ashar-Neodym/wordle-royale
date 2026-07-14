import type { ApiClientResult, Standard1v1Ticket } from '../lib/api-client';
import {
  MATCHMAKING_DEADLINE_POLICY,
  matchmakingDeadlinePolicyFor,
  type MatchmakingOperation,
} from '../lib/matchmaking-deadline-policy';

export type QueueUiState =
  | 'signed_out'
  | 'unavailable'
  | 'reconnecting'
  | 'idle'
  | 'joining'
  | 'searching'
  | 'cancelling'
  | 'matched'
  | 'cancelled'
  | 'timed_out'
  | 'error';

export type QueueResolution = {
  state: QueueUiState;
  ticket: Standard1v1Ticket | null;
  error: string | null;
};

export const CLIENT_ACTION_DEADLINE_MS = MATCHMAKING_DEADLINE_POLICY.browserMs;

export function stateFromTicket(ticket: Standard1v1Ticket): QueueUiState {
  if (ticket.state === 'queued') return 'searching';
  if (ticket.state === 'matched') return 'matched';
  if (ticket.state === 'cancelled') return 'cancelled';
  if (ticket.state === 'timed_out') return 'timed_out';
  return 'error';
}

export function queueResolutionFromResult(
  result: ApiClientResult<Standard1v1Ticket>,
  fallbackError = 'Unable to recover queue status.',
): QueueResolution {
  if (result.status === 'connected') {
    if (!result.data) return { state: 'idle', ticket: null, error: null };
    return {
      state: stateFromTicket(result.data),
      ticket: result.data,
      error: result.data.state === 'failed' ? 'The server marked this queue ticket as failed.' : null,
    };
  }

  const error = result.error ?? fallbackError;
  return {
    state: /not[_\s-]?authenticated|session required/i.test(error) ? 'signed_out' : 'error',
    ticket: null,
    error,
  };
}

export async function runWithClientDeadline<T>(
  operation: Promise<T>,
  deadlineMs: number = CLIENT_ACTION_DEADLINE_MS,
  timeoutMessage = 'Queue status check timed out. Your server ticket may still exist; check status again.',
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), deadlineMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function runMatchmakingOperationWithDeadline<T>(
  operation: MatchmakingOperation,
  operationPromise: Promise<T>,
  timeoutMessage?: string,
): Promise<T> {
  return runWithClientDeadline(
    operationPromise,
    matchmakingDeadlinePolicyFor(operation).browserMs,
    timeoutMessage,
  );
}

export function hrefForMatchedTicket(ticket: Standard1v1Ticket | null): string | null {
  if (ticket?.state !== 'matched' || !ticket.matchedMatchId) return null;
  return `/play?matchId=${encodeURIComponent(ticket.matchedMatchId)}#gameplay`;
}
