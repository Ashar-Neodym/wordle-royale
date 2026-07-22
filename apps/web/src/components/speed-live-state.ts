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
export type SpeedMutationKind = 'ready' | 'guess' | 'forfeit';
export type SpeedPostSettlement = 'pending' | 'definitive' | 'uncertain';
export type SpeedRecoveryEvidence = Readonly<{
  successful: boolean;
  snapshot: SpeedMatchSnapshot | null;
  anchor: ServerClockAnchor | null;
}>;

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

export function createNonRegressingServerClockAnchor(
  previous: ServerClockAnchor | null,
  incomingServerTime: string,
  monotonicAtReceiptMs: number,
): ServerClockAnchor | null {
  const incomingServerEpochMs = Date.parse(incomingServerTime);
  if (!Number.isFinite(incomingServerEpochMs) || !Number.isFinite(monotonicAtReceiptMs)) return null;
  const serverEpochMs = previous
    ? Math.max(incomingServerEpochMs, anchoredServerNow(previous, monotonicAtReceiptMs))
    : incomingServerEpochMs;
  return { serverEpochMs, monotonicAtSnapshotMs: monotonicAtReceiptMs };
}

export function speedDeadline(snapshot: SpeedMatchSnapshot): string | null {
  if (snapshot.state === 'waiting_ready') return snapshot.readyDeadlineAt;
  if (snapshot.state === 'waiting_invitation' && 'invitationExpiresAt' in snapshot) return snapshot.invitationExpiresAt;
  if (snapshot.state === 'waiting_opponent_ready') return snapshot.readyDeadlineAt;
  if (snapshot.state === 'countdown') return snapshot.startsAt;
  if (snapshot.state === 'in_progress' || snapshot.state === 'finalizing') return snapshot.deadlineAt;
  return null;
}

export function speedReadyOperationConfirmed(snapshot: SpeedMatchSnapshot, clientRequestId: string): boolean {
  if (snapshot.readiness.viewerReadyOperationId !== null) {
    return snapshot.readiness.viewerReadyOperationId === clientRequestId;
  }
  return snapshot.readiness.viewerReady
    && (snapshot.state === 'countdown' || snapshot.state === 'in_progress');
}

const SPEED_LIFECYCLE_RANK: Record<SpeedMatchSnapshot['state'], number> = {
  waiting_ready: 0,
  waiting_invitation: 0,
  waiting_opponent_ready: 1,
  countdown: 2,
  in_progress: 3,
  finalizing: 4,
  completed: 5,
  voided: 5,
};

const SPEED_READINESS_PHASE_RANK: Record<SpeedMatchSnapshot['readiness']['phase'], number> = {
  legacy: 0,
  invitation: 0,
  opponent_ready: 1,
  locked: 2,
};

function hasConsistentReadiness(snapshot: SpeedMatchSnapshot): boolean {
  const readiness = snapshot.readiness;
  if (readiness.viewerReady) {
    if (readiness.readyCount < 1 || readiness.viewerReadyAt === null) return false;
  } else if (readiness.viewerReadyAt !== null || readiness.viewerReadyOperationId !== null) {
    return false;
  }

  if (snapshot.readyLifecycleVersion === 'speed_ready_v1_match_created_20s') {
    return readiness.phase === 'legacy';
  }

  const expectedPhase = readiness.readyCount === 0
    ? 'invitation'
    : readiness.readyCount === 1
      ? 'opponent_ready'
      : 'locked';
  if (readiness.phase !== expectedPhase) return false;
  if (snapshot.state === 'waiting_invitation') return readiness.phase === 'invitation';
  if (snapshot.state === 'waiting_opponent_ready') return readiness.phase === 'opponent_ready';
  if (snapshot.state === 'countdown' || snapshot.state === 'in_progress' || snapshot.state === 'finalizing') {
    return readiness.phase === 'locked';
  }
  return true;
}

function preservesEstablishedValue<T>(current: T | null, next: T | null): boolean {
  return current === null || current === next;
}

function preservesAcceptedGuessTruth(current: SpeedMatchSnapshot, next: SpeedMatchSnapshot): boolean {
  if (next.myState.acceptedGuesses.length < current.myState.acceptedGuesses.length) return false;
  const nextOperations = new Map(next.myState.acceptedGuesses.map((guess) => [guess.clientRequestId, guess]));
  return current.myState.acceptedGuesses.every((guess) => {
    const candidate = nextOperations.get(guess.clientRequestId);
    return candidate !== undefined
      && candidate.guess === guess.guess
      && candidate.guessNumber === guess.guessNumber
      && candidate.submittedAt === guess.submittedAt
      && JSON.stringify(candidate.feedback) === JSON.stringify(guess.feedback);
  });
}

function preservesMonotonicSnapshotTruth(current: SpeedMatchSnapshot, next: SpeedMatchSnapshot): boolean {
  if (current.mode !== next.mode
    || current.rulesetVersion !== next.rulesetVersion
    || current.readyLifecycleVersion !== next.readyLifecycleVersion) return false;
  if ((current.state === 'completed' || current.state === 'voided') && next.state !== current.state) return false;
  if (SPEED_READINESS_PHASE_RANK[next.readiness.phase] < SPEED_READINESS_PHASE_RANK[current.readiness.phase]) return false;
  if (next.readiness.readyCount < current.readiness.readyCount) return false;
  if (current.readiness.viewerReady && !next.readiness.viewerReady) return false;
  if (!preservesEstablishedValue(current.readiness.viewerReadyAt, next.readiness.viewerReadyAt)) return false;
  if (!preservesEstablishedValue(current.readiness.viewerReadyOperationId, next.readiness.viewerReadyOperationId)) return false;
  if (!preservesAcceptedGuessTruth(current, next)) return false;
  if (next.opponentProgress.acceptedGuessCount < current.opponentProgress.acceptedGuessCount) return false;
  if (current.opponentProgress.terminal && !next.opponentProgress.terminal) return false;
  if (!preservesEstablishedValue(current.myState.terminalReason, next.myState.terminalReason)) return false;
  if (!preservesEstablishedValue(current.myState.guessesUsed, next.myState.guessesUsed)) return false;
  if (!preservesEstablishedValue(current.myState.solveElapsedMs, next.myState.solveElapsedMs)) return false;
  if (!preservesEstablishedValue(current.myState.result, next.myState.result)) return false;
  if (!preservesEstablishedValue(current.startsAt, next.startsAt)) return false;
  if (!preservesEstablishedValue(current.deadlineAt, next.deadlineAt)) return false;
  if (!preservesEstablishedValue(current.readyDeadlineAt, next.readyDeadlineAt)) return false;
  if ('invitationExpiresAt' in current && 'invitationExpiresAt' in next) {
    if (current.invitationExpiresAt !== next.invitationExpiresAt) return false;
    if (!preservesEstablishedValue(current.readyWindowStartedAt, next.readyWindowStartedAt)) return false;
  }
  return true;
}

function hasStrictSnapshotProgress(current: SpeedMatchSnapshot, next: SpeedMatchSnapshot): boolean {
  if (SPEED_LIFECYCLE_RANK[next.state] > SPEED_LIFECYCLE_RANK[current.state]) return true;
  if (next.readiness.readyCount > current.readiness.readyCount) return true;
  if (!current.readiness.viewerReady && next.readiness.viewerReady) return true;
  if (current.readiness.viewerReadyAt === null && next.readiness.viewerReadyAt !== null) return true;
  if (current.readiness.viewerReadyOperationId === null && next.readiness.viewerReadyOperationId !== null) return true;
  if (next.myState.acceptedGuesses.length > current.myState.acceptedGuesses.length) return true;
  if (next.opponentProgress.acceptedGuessCount > current.opponentProgress.acceptedGuessCount) return true;
  if (!current.opponentProgress.terminal && next.opponentProgress.terminal) return true;
  if (current.myState.terminalReason === null && next.myState.terminalReason !== null) return true;
  if (current.myState.guessesUsed === null && next.myState.guessesUsed !== null) return true;
  if (current.myState.solveElapsedMs === null && next.myState.solveElapsedMs !== null) return true;
  if (current.myState.result === null && next.myState.result !== null) return true;
  if (current.startsAt === null && next.startsAt !== null) return true;
  if (current.deadlineAt === null && next.deadlineAt !== null) return true;
  if (current.readyDeadlineAt === null && next.readyDeadlineAt !== null) return true;
  if ('readyWindowStartedAt' in current && 'readyWindowStartedAt' in next
    && current.readyWindowStartedAt === null && next.readyWindowStartedAt !== null) return true;
  return false;
}

export function speedSnapshotsEquivalent(
  current: SpeedMatchSnapshot | null,
  next: SpeedMatchSnapshot,
): boolean {
  return current !== null && JSON.stringify(current) === JSON.stringify(next);
}

export function shouldApplySpeedSnapshot(
  current: SpeedMatchSnapshot | null,
  next: SpeedMatchSnapshot,
  currentGeneration = 0,
  nextGeneration = currentGeneration,
): boolean {
  if (!hasConsistentReadiness(next)) return false;
  if (!current) return true;
  if (current.matchId !== next.matchId || current.roundId !== next.roundId) return false;
  if (nextGeneration < currentGeneration) return false;
  if (SPEED_LIFECYCLE_RANK[next.state] < SPEED_LIFECYCLE_RANK[current.state]) return false;
  if (!preservesMonotonicSnapshotTruth(current, next)) return false;
  const currentTime = Date.parse(current.serverTime);
  const nextTime = Date.parse(next.serverTime);
  if (!Number.isFinite(currentTime) || !Number.isFinite(nextTime) || nextTime < currentTime) return false;
  return nextTime > currentTime || hasStrictSnapshotProgress(current, next);
}

export function speedSnapshotHasGuessOperation(snapshot: SpeedMatchSnapshot, clientRequestId: string): boolean {
  return snapshot.myState.acceptedGuesses.some((entry) => entry.clientRequestId === clientRequestId);
}

function authoritativeDeadlineOpen(
  snapshot: SpeedMatchSnapshot,
  anchor: ServerClockAnchor,
  monotonicNowMs: number,
): boolean {
  const deadline = speedDeadline(snapshot);
  if (!deadline) return false;
  const deadlineTime = Date.parse(deadline);
  return Number.isFinite(deadlineTime) && anchoredServerNow(anchor, monotonicNowMs) < deadlineTime;
}

export function speedRetryIsSafe(
  kind: SpeedMutationKind,
  clientRequestId: string,
  postSettlement: SpeedPostSettlement,
  recovery: SpeedRecoveryEvidence,
  monotonicNowMs: number,
): boolean {
  if (postSettlement !== 'definitive' || !recovery.successful || !recovery.snapshot || !recovery.anchor) return false;
  const snapshot = recovery.snapshot;
  if (!authoritativeDeadlineOpen(snapshot, recovery.anchor, monotonicNowMs)) return false;
  if (kind === 'ready') {
    const waiting = snapshot.state === 'waiting_ready'
      || snapshot.state === 'waiting_invitation'
      || snapshot.state === 'waiting_opponent_ready';
    return waiting && !snapshot.readiness.viewerReady && !speedReadyOperationConfirmed(snapshot, clientRequestId);
  }
  if (kind === 'guess') {
    return snapshot.state === 'in_progress'
      && !snapshot.myState.terminalReason
      && !speedSnapshotHasGuessOperation(snapshot, clientRequestId);
  }
  // Public state does not expose persisted forfeit operation identity.
  return false;
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
      ? { eyebrow: 'Ready', title: 'Waiting for your opponent', message: `Legacy server ready window: ${seconds}s remaining. Refreshing will not reset it.` }
      : { eyebrow: 'Ready check', title: 'Ready for Speed?', message: `Confirm within ${seconds}s. Missing the legacy server deadline ends this match as a no-contest.` };
  }
  if (snapshot.state === 'waiting_invitation') {
    return {
      eyebrow: 'Invitation',
      title: 'Accept your Speed invitation',
      message: `${seconds}s remain in the delivery and acceptance phase. The 20-second opponent-ready window has not started yet.`,
    };
  }
  if (snapshot.state === 'waiting_opponent_ready') {
    return snapshot.readiness.viewerReady
      ? { eyebrow: 'Ready confirmed', title: 'Waiting for your opponent', message: `The server-owned 20-second ready window is active: ${seconds}s remaining.` }
      : { eyebrow: 'Opponent ready', title: 'Your opponent is ready', message: `Your opponent is ready. Confirm within ${seconds}s of the first server-committed acknowledgement.` };
  }
  if (snapshot.state === 'countdown') return { eyebrow: 'Starting', title: String(seconds), message: 'Server-synchronized countdown. Input opens only after the authoritative reveal.' };
  if (snapshot.state === 'in_progress') return { eyebrow: seconds <= 10 ? 'Time critical' : 'Speed round', title: `${seconds}s`, message: 'The server deadline is authoritative. Network latency cannot extend this clock.' };
  if (snapshot.state === 'finalizing') return { eyebrow: 'Finalizing', title: 'Checking the server result', message: 'The browser does not decide expiry, placement, or rating.' };
  if (snapshot.state === 'voided') return { eyebrow: 'No contest', title: 'Match voided', message: 'No Speed rating is applied to a void or pre-reveal ready expiry.' };
  return { eyebrow: 'Complete', title: 'Speed result ready', message: 'Final placement and Speed rating come from the server result.' };
}
