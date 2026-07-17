import type { ApiClientResult } from '../lib/api-client';
import type { Speed1v1Ticket, SpeedMatchSnapshot } from '@wordle-royale/contracts';

export type SpeedQueueUiState =
  | 'signed_out'
  | 'disabled'
  | 'reconnecting'
  | 'idle'
  | 'joining'
  | 'searching'
  | 'cancelling'
  | 'matched'
  | 'cancelled'
  | 'timed_out'
  | 'error';

export type ServerClockAnchor = Readonly<{
  serverEpochMs: number;
  monotonicAtSnapshotMs: number;
}>;

export type UncertainGuessRequest = Readonly<{ id: string; guess: string }>;

export function retainUncertainGuessRequest(
  current: UncertainGuessRequest | null,
  normalizedGuess: string,
  createId: () => string,
): UncertainGuessRequest {
  return current ?? { id: createId(), guess: normalizedGuess };
}

export function reconcileUncertainGuessRequest(
  snapshot: SpeedMatchSnapshot,
  current: UncertainGuessRequest | null,
): UncertainGuessRequest | null {
  if (!current) return null;
  return speedSnapshotHasGuessOperation(snapshot, current.id) ? null : current;
}

export function speedQueueState(ticket: Speed1v1Ticket): SpeedQueueUiState {
  if (ticket.state === 'queued') return 'searching';
  if (ticket.state === 'matched') return 'matched';
  if (ticket.state === 'cancelled') return 'cancelled';
  if (ticket.state === 'timed_out') return 'timed_out';
  return 'error';
}

export function speedQueueResolution(result: ApiClientResult<Speed1v1Ticket>): {
  state: SpeedQueueUiState;
  ticket: Speed1v1Ticket | null;
  error: string | null;
} {
  if (result.status === 'connected') {
    if (!result.data) return { state: 'idle', ticket: null, error: null };
    return {
      state: speedQueueState(result.data),
      ticket: result.data,
      error: result.data.state === 'failed' ? 'The server marked this Speed ticket as failed.' : null,
    };
  }
  const error = result.error ?? 'Unable to recover Speed queue status.';
  return {
    state: /not[_\s-]?authenticated|session required/i.test(error) ? 'signed_out' : 'error',
    ticket: null,
    error,
  };
}

export function speedMatchedHref(ticket: Speed1v1Ticket | null): string | null {
  if (ticket?.state !== 'matched' || !ticket.matchedMatchId) return null;
  return `/play?matchId=${encodeURIComponent(ticket.matchedMatchId)}#speed-gameplay`;
}

export function createServerClockAnchor(serverTime: string, monotonicNowMs: number): ServerClockAnchor | null {
  const serverEpochMs = Date.parse(serverTime);
  if (!Number.isFinite(serverEpochMs) || !Number.isFinite(monotonicNowMs)) return null;
  return { serverEpochMs, monotonicAtSnapshotMs: monotonicNowMs };
}

export function anchoredServerNow(anchor: ServerClockAnchor, monotonicNowMs: number): number {
  return anchor.serverEpochMs + Math.max(0, monotonicNowMs - anchor.monotonicAtSnapshotMs);
}

export function speedDeadline(snapshot: SpeedMatchSnapshot): string | null {
  if (snapshot.state === 'waiting_ready') return snapshot.readyDeadlineAt;
  if (snapshot.state === 'countdown') return snapshot.startsAt;
  if (snapshot.state === 'in_progress' || snapshot.state === 'finalizing') return snapshot.deadlineAt;
  return null;
}

export function speedSnapshotHasGuessOperation(snapshot: SpeedMatchSnapshot, clientRequestId: string): boolean {
  return snapshot.myState.acceptedGuesses.some((entry) => entry.clientRequestId === clientRequestId);
}

export function remainingSpeedMs(snapshot: SpeedMatchSnapshot, anchor: ServerClockAnchor, monotonicNowMs: number): number {
  const target = speedDeadline(snapshot);
  if (!target) return 0;
  const targetMs = Date.parse(target);
  if (!Number.isFinite(targetMs)) return 0;
  return Math.max(0, targetMs - anchoredServerNow(anchor, monotonicNowMs));
}

export function displayedSeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

const ANNOUNCEMENT_THRESHOLDS = [30, 10, 5, 0] as const;

export function crossedCountdownAnnouncement(previousSeconds: number | null, nextSeconds: number): number | null {
  if (previousSeconds === null) return ANNOUNCEMENT_THRESHOLDS.includes(nextSeconds as never) ? nextSeconds : null;
  return ANNOUNCEMENT_THRESHOLDS.find((threshold) => previousSeconds > threshold && nextSeconds <= threshold) ?? null;
}

export function speedPhaseCopy(snapshot: SpeedMatchSnapshot, seconds: number): {
  eyebrow: string;
  title: string;
  message: string;
} {
  if (snapshot.state === 'waiting_ready') {
    return snapshot.readiness.viewerReady
      ? { eyebrow: 'Ready', title: 'Waiting for your opponent', message: `Server ready window: ${seconds}s remaining. Refreshing will not reset it.` }
      : { eyebrow: 'Ready check', title: 'Ready for Speed?', message: `Confirm within ${seconds}s. Missing the server deadline ends this match as a no-contest.` };
  }
  if (snapshot.state === 'countdown') return { eyebrow: 'Starting', title: String(seconds), message: 'Server-synchronized countdown. Input opens only after the authoritative reveal.' };
  if (snapshot.state === 'in_progress') return { eyebrow: seconds <= 10 ? 'Time critical' : 'Speed round', title: `${seconds}s`, message: 'The server deadline is authoritative. Network latency cannot extend this clock.' };
  if (snapshot.state === 'finalizing') return { eyebrow: 'Finalizing', title: 'Checking the server result', message: 'The browser does not decide expiry, placement, or rating.' };
  if (snapshot.state === 'voided') return { eyebrow: 'No contest', title: 'Match voided', message: 'No Speed rating is applied to a void or pre-reveal ready expiry.' };
  return { eyebrow: 'Complete', title: 'Speed result ready', message: 'Final placement and Speed rating come from the server result.' };
}
