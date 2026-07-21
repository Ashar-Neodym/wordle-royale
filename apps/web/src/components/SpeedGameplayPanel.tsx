'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import type { SpeedMatchSnapshot } from '@wordle-royale/contracts';
import type { ApiClientResult, LiveMatchState } from '../lib/api-client';
import { forfeitSpeedMatchAction, getSpeedMatchRecoveryStateAction, getSpeedMatchStateAction, markSpeedMatchReadyAction, submitSpeedGuessAction } from '../app/actions';
import { EmptyTileRow, WordTile } from './WordTile';
import {
  createNonRegressingServerClockAnchor,
  createServerClockAnchor,
  crossedCountdownAnnouncement,
  displayedSeconds,
  remainingSpeedMs,
  retainUncertainGuessRequest,
  reconcileUncertainGuessRequest,
  speedDeadline,
  speedPhaseCopy,
  speedReadyOperationConfirmed,
  speedRetryIsSafe,
  speedSnapshotsEquivalent,
  shouldApplySpeedSnapshot,
  type ServerClockAnchor,
  type SpeedRecoveryEvidence,
  type UncertainGuessRequest,
} from './speed-live-state';
import { runSpeedBrowserMutation } from '../lib/speed-mutation-policy';
import styles from './web-shell.module.css';

type Props = { initialState: ApiClientResult<LiveMatchState> };

function asSpeed(result: ApiClientResult<LiveMatchState>): SpeedMatchSnapshot | null {
  const data = result.status === 'connected' ? result.data : null;
  return data && 'roundId' in data ? data : null;
}

function mutationError(result: { error: string | null; errorCode?: string | null }, fallback: string): string {
  if (result.errorCode === 'invitation_expired') return 'The 90-second invitation and delivery phase expired before readiness was confirmed.';
  if (result.errorCode === 'ready_deadline_passed') return 'The 20-second ready deadline expired. The server will resolve this match as a no-contest.';
  if (result.errorCode === 'deadline_passed') return 'The 75-second server deadline passed before this move arrived. Refreshing cannot extend it.';
  if (result.errorCode === 'participant_terminal') return 'Your Speed run is already terminal. Waiting for the authoritative result.';
  return result.error ?? fallback;
}

type MutationNotice = { state: 'pending' | 'uncertain' | 'confirmed' | 'expired' | 'retry_safe'; message: string };
type StateRead = { generation: number; promise: Promise<SpeedRecoveryEvidence> };
type RetryProof = { kind: 'ready' | 'guess' | 'forfeit'; requestId: string };
type HostedMutationOutcome<T> =
  | { kind: 'settled'; value: T }
  | { kind: 'uncertain' };

function definitivelySettledAction(result: { status: 'connected' | 'unavailable'; errorCode?: string | null }): boolean {
  return result.status === 'connected'
    || (Boolean(result.errorCode) && result.errorCode !== 'speed_server_action_timeout');
}

export function SpeedGameplayPanel({ initialState }: Props): ReactElement {
  const initial = asSpeed(initialState);
  const [snapshot, setSnapshot] = useState<SpeedMatchSnapshot | null>(initial);
  const [anchor, setAnchor] = useState<ServerClockAnchor | null>(() => initial ? createServerClockAnchor(initial.serverTime, 0) : null);
  const [monotonicNow, setMonotonicNow] = useState(0);
  const [error, setError] = useState<string | null>(initial ? null : initialState.error ?? 'Speed state is unavailable.');
  const [busy, setBusy] = useState<'ready' | 'guess' | 'forfeit' | null>(null);
  const [guess, setGuess] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [mutationNotice, setMutationNotice] = useState<MutationNotice | null>(null);
  const [retryProof, setRetryProof] = useState<RetryProof | null>(null);

  const readyRequestId = useRef<string | null>(null);
  const guessRequest = useRef<UncertainGuessRequest | null>(null);
  const forfeitRequestId = useRef<string | null>(null);
  const previousSeconds = useRef<number | null>(null);
  const zeroSyncKey = useRef<string | null>(null);
  const latestSnapshot = useRef<SpeedMatchSnapshot | null>(initial);
  const latestAnchor = useRef<ServerClockAnchor | null>(null);
  const requestGeneration = useRef(0);
  const appliedGeneration = useRef(0);
  const stateReadInFlight = useRef<StateRead | null>(null);

  const nextGeneration = useCallback((): number => {
    requestGeneration.current += 1;
    return requestGeneration.current;
  }, []);

  const apply = useCallback((next: SpeedMatchSnapshot, generation: number): boolean => {
    const receivedAt = performance.now();
    if (!shouldApplySpeedSnapshot(latestSnapshot.current, next, appliedGeneration.current, generation)) return false;
    const nextAnchor = createNonRegressingServerClockAnchor(latestAnchor.current, next.serverTime, receivedAt);
    if (!nextAnchor) return false;
    appliedGeneration.current = generation;
    latestSnapshot.current = next;
    const pendingReady = readyRequestId.current;
    const pendingGuess = guessRequest.current;
    const unresolvedGuess = reconcileUncertainGuessRequest(next, pendingGuess);
    guessRequest.current = unresolvedGuess;
    latestAnchor.current = nextAnchor;
    setSnapshot(next);
    setAnchor(nextAnchor);
    setMonotonicNow(receivedAt);
    if (!pendingGuess || !unresolvedGuess) setError(null);
    if (pendingReady && speedReadyOperationConfirmed(next, pendingReady)) {
      readyRequestId.current = null;
      setRetryProof(null);
      setMutationNotice({ state: 'confirmed', message: 'Ready acknowledgement confirmed by the authoritative server state.' });
    }
    if (pendingGuess && !unresolvedGuess) {
      setGuess('');
      setRetryProof(null);
      setMutationNotice({ state: 'confirmed', message: 'Guess confirmed by its authoritative operation ID.' });
    }
    if (next.state === 'completed' || next.state === 'voided') {
      if (readyRequestId.current) {
        readyRequestId.current = null;
        setRetryProof(null);
        setMutationNotice({ state: 'expired', message: 'The pre-start operation is no longer actionable and was not exactly confirmed.' });
      }
      if (forfeitRequestId.current) {
        setRetryProof(null);
        setMutationNotice({ state: 'uncertain', message: 'The match reached terminal server state, but that alone does not prove the pending forfeit caused it.' });
      }
    }
    return true;
  }, []);

  const refreshState = useCallback(async (recovery = false, minimumGeneration = 0): Promise<SpeedRecoveryEvidence> => {
    const matchId = latestSnapshot.current?.matchId;
    if (!matchId) return { successful: false, snapshot: null, anchor: null };
    const inFlight = stateReadInFlight.current;
    if (inFlight) {
      const evidence = await inFlight.promise;
      if (recovery && inFlight.generation < minimumGeneration) {
        if (stateReadInFlight.current === inFlight) stateReadInFlight.current = null;
        return refreshState(true, minimumGeneration);
      }
      return evidence;
    }
    const generation = nextGeneration();
    const read = (async (): Promise<SpeedRecoveryEvidence> => {
      const result = recovery
        ? await getSpeedMatchRecoveryStateAction(matchId)
        : await getSpeedMatchStateAction(matchId);
      const next = asSpeed(result);
      if (next) {
        const duplicate = speedSnapshotsEquivalent(latestSnapshot.current, next);
        const applied = apply(next, generation);
        if (applied || duplicate) {
          return { successful: true, snapshot: latestSnapshot.current, anchor: latestAnchor.current };
        }
        return { successful: false, snapshot: null, anchor: null };
      }
      setError(result.error ?? 'Could not refresh authoritative Speed state. Your deadline remains unchanged.');
      return { successful: false, snapshot: null, anchor: null };
    })();
    const tracked = { generation, promise: read };
    stateReadInFlight.current = tracked;
    try {
      return await read;
    } finally {
      if (stateReadInFlight.current === tracked) stateReadInFlight.current = null;
    }
  }, [apply, nextGeneration]);

  useEffect(() => {
    if (!snapshot) return;
    const receivedAt = performance.now();
    const initialAnchor = createServerClockAnchor(snapshot.serverTime, receivedAt);
    latestAnchor.current = initialAnchor;
    setAnchor(initialAnchor);
    setMonotonicNow(receivedAt);
  }, []);

  useEffect(() => {
    if (!snapshot || snapshot.state === 'completed' || snapshot.state === 'voided') return;
    let stopped = false;
    let pollTimer: number | undefined;
    const tick = window.setInterval(() => setMonotonicNow(performance.now()), 200);
    const poll = async (): Promise<void> => {
      await refreshState();
      if (!stopped) pollTimer = window.setTimeout(() => void poll(), 1_500);
    };
    pollTimer = window.setTimeout(() => void poll(), 1_500);
    return () => {
      stopped = true;
      window.clearInterval(tick);
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [snapshot?.matchId, snapshot?.state, refreshState]);

  const remainingMs = snapshot && anchor ? remainingSpeedMs(snapshot, anchor, monotonicNow) : 0;
  const seconds = displayedSeconds(remainingMs);

  useEffect(() => {
    if (!snapshot) return;
    const timedStates: SpeedMatchSnapshot['state'][] = ['waiting_ready', 'waiting_invitation', 'waiting_opponent_ready', 'countdown', 'in_progress'];
    if (!timedStates.includes(snapshot.state)) {
      previousSeconds.current = null;
      setAnnouncement('');
      return;
    }
    const threshold = crossedCountdownAnnouncement(previousSeconds.current, seconds);
    previousSeconds.current = seconds;
    if (threshold !== null) setAnnouncement(threshold === 0 ? 'Displayed time reached zero. Checking authoritative server state.' : `${threshold} seconds remaining.`);
    if (seconds === 0 && timedStates.includes(snapshot.state)) {
      const key = `${snapshot.state}:${speedDeadline(snapshot) ?? 'none'}`;
      if (zeroSyncKey.current !== key) { zeroSyncKey.current = key; void refreshState(); }
    }
  }, [seconds, snapshot?.state, snapshot?.serverTime, refreshState]);

  async function runHostedMutation<T>(label: string, mutate: () => Promise<T>): Promise<HostedMutationOutcome<T>> {
    setRetryProof(null);
    setMutationNotice({ state: 'pending', message: `${label} is pending within the 35-second browser operation envelope.` });
    try {
      const outcome = await runSpeedBrowserMutation({
        mutate,
        recover: async () => { await refreshState(true); },
        onSoftUncertain: () => setMutationNotice({ state: 'uncertain', message: `${label} is still pending after 8 seconds. Checking authoritative state without replaying the mutation.` }),
      });
      if (outcome.kind === 'settled') return outcome;
      setMutationNotice({ state: 'uncertain', message: `${label} exceeded the browser envelope, but its POST may still commit. Retry remains disabled.` });
      void outcome.settlement.then(async (settlement) => {
        if (settlement.status === 'fulfilled') await refreshState(true);
      });
      return { kind: 'uncertain' };
    } catch {
      setMutationNotice({ state: 'uncertain', message: `${label} lost its browser/server-action response. Its POST settlement is unknown, so retry remains disabled.` });
      await refreshState(true);
      return { kind: 'uncertain' };
    }
  }

  function retryIsCurrentlySafe(kind: RetryProof['kind'], requestId: string, now: number): boolean {
    if (!retryProof || retryProof.kind !== kind || retryProof.requestId !== requestId) return false;
    return speedRetryIsSafe(kind, requestId, 'definitive', {
      successful: true,
      snapshot: latestSnapshot.current,
      anchor: latestAnchor.current,
    }, now);
  }

  function guardRetryDispatch(kind: RetryProof['kind'], requestId: string): boolean {
    if (retryIsCurrentlySafe(kind, requestId, performance.now())) return true;
    setRetryProof(null);
    setMutationNotice({ state: 'expired', message: 'The authoritative retry deadline is no longer open. No mutation was sent.' });
    setError('Retry was stopped before dispatch because current server-anchored time no longer proves an open deadline.');
    return false;
  }

  async function establishRetrySafety(
    kind: RetryProof['kind'],
    requestId: string,
    result: { status: 'connected' | 'unavailable'; errorCode?: string | null },
  ): Promise<boolean> {
    if (!definitivelySettledAction(result)) return false;
    const settlementFence = nextGeneration();
    const recovery = await refreshState(true, settlementFence);
    const safe = speedRetryIsSafe(kind, requestId, 'definitive', recovery, performance.now());
    if (safe) setRetryProof({ kind, requestId });
    return safe;
  }

  async function markReady(): Promise<void> {
    if (!snapshot || busy) return;
    if (readyRequestId.current && !guardRetryDispatch('ready', readyRequestId.current)) return;
    readyRequestId.current ??= crypto.randomUUID();
    setBusy('ready'); setError(null);
    try {
      const requestId = readyRequestId.current;
      const mutationGeneration = nextGeneration();
      const outcome = await runHostedMutation('Ready acknowledgement', () => markSpeedMatchReadyAction(snapshot.matchId, requestId));
      if (outcome.kind === 'uncertain') {
        setError('Ready confirmation remains uncertain. Retry is disabled while the original POST may still commit.');
        return;
      }
      const result = outcome.value;
      if (result.status === 'connected' && result.data) {
        apply(result.data, mutationGeneration);
        if (speedReadyOperationConfirmed(result.data, requestId)) {
          readyRequestId.current = null;
          setRetryProof(null);
          setMutationNotice({ state: 'confirmed', message: 'Ready acknowledgement confirmed by the server.' });
        }
        return;
      }
      const safe = await establishRetrySafety('ready', requestId, result);
      if (!readyRequestId.current) return;
      const expired = result.errorCode === 'invitation_expired' || result.errorCode === 'ready_deadline_passed';
      if (expired) {
        setMutationNotice({ state: 'expired', message: mutationError(result, '') });
      } else if (safe) {
        setMutationNotice({ state: 'retry_safe', message: 'Ready is authoritatively absent after POST settlement. Retry will reuse the same operation ID.' });
      } else {
        setMutationNotice({ state: 'uncertain', message: 'Ready is not confirmed, but safe retry prerequisites are incomplete. Retry remains disabled.' });
      }
      setError(mutationError(result, safe ? 'Ready was not committed; a same-ID retry is safe.' : 'Ready outcome remains uncertain. Check authoritative state again.'));
    } finally { setBusy(null); }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!snapshot || busy || (!guessRequest.current && !/^[a-zA-Z]{5}$/.test(guess))) return;
    if (guessRequest.current && !guardRetryDispatch('guess', guessRequest.current.id)) return;
    const normalized = guess.toLowerCase();
    const request = retainUncertainGuessRequest(guessRequest.current, normalized, () => crypto.randomUUID());
    guessRequest.current = request;
    setBusy('guess'); setError(null);
    try {
      const outcome = await runHostedMutation('Guess submission', () => submitSpeedGuessAction(snapshot.matchId, snapshot.roundId, request.guess, request.id));
      if (outcome.kind === 'uncertain') {
        setError('Guess outcome remains uncertain. Retry is disabled while the original POST may still commit.');
        return;
      }
      const result = outcome.value;
      if (result.status === 'connected' && result.data) {
        guessRequest.current = null;
        setRetryProof(null);
        setGuess('');
        if (!result.data.accepted) {
          setMutationNotice({ state: 'confirmed', message: 'The server definitively rejected the guess without consuming an attempt.' });
          setError(`Guess rejected: ${result.data.reason.replaceAll('_', ' ')}. No attempt was consumed.`);
        } else {
          setMutationNotice({ state: 'confirmed', message: 'Guess accepted by the server.' });
          await refreshState(true);
        }
        return;
      }
      const safe = await establishRetrySafety('guess', request.id, result);
      if (!guessRequest.current) return;
      if (safe) {
        setMutationNotice({ state: 'retry_safe', message: `“${request.guess.toUpperCase()}” is authoritatively absent after POST settlement. Retry will reuse its operation ID.` });
      } else {
        setMutationNotice({ state: 'uncertain', message: `“${request.guess.toUpperCase()}” is not confirmed, but retry safety is unproven. Retry remains disabled.` });
      }
      setError(mutationError(result, safe ? 'Guess was not committed; a same-ID retry is safe.' : 'Guess outcome remains uncertain. Check authoritative state again.'));
    } finally { setBusy(null); }
  }

  async function forfeit(): Promise<void> {
    if (!snapshot || busy) return;
    if (forfeitRequestId.current && !guardRetryDispatch('forfeit', forfeitRequestId.current)) return;
    forfeitRequestId.current ??= crypto.randomUUID();
    setBusy('forfeit'); setError(null);
    try {
      const requestId = forfeitRequestId.current;
      const mutationGeneration = nextGeneration();
      const outcome = await runHostedMutation('Forfeit request', () => forfeitSpeedMatchAction(snapshot.matchId, requestId));
      if (outcome.kind === 'uncertain') {
        setError('Forfeit outcome remains uncertain. Retry is disabled because public state cannot prove this operation absent.');
        return;
      }
      const result = outcome.value;
      if (result.status === 'connected' && result.data) {
        apply(result.data, mutationGeneration);
        forfeitRequestId.current = null;
        setRetryProof(null);
        setMutationNotice({ state: 'confirmed', message: 'Forfeit confirmed by the exact server response to this operation.' });
        return;
      }
      await establishRetrySafety('forfeit', requestId, result);
      if (forfeitRequestId.current) {
        setMutationNotice({ state: 'uncertain', message: 'Forfeit is not exactly confirmed. Terminal state alone cannot prove it caused the outcome, so retry remains disabled.' });
        setError(mutationError(result, 'Forfeit outcome remains uncertain. Check authoritative state; no retry is exposed.'));
      }
    } finally { setBusy(null); }
  }

  if (!snapshot) {
    return <article id="speed-gameplay" className={styles.errorPanel} aria-live="polite"><strong>Speed state unavailable</strong><p>{error}</p><button className={styles.primaryButton} type="button" onClick={() => window.location.reload()}>Reconnect to match</button></article>;
  }

  const retrySafeRequestId = retryProof && speedRetryIsSafe(
    retryProof.kind,
    retryProof.requestId,
    'definitive',
    { successful: true, snapshot, anchor },
    monotonicNow,
  ) ? retryProof.requestId : null;
  const displayedMutationNotice = mutationNotice?.state === 'retry_safe' && retrySafeRequestId === null
    ? { state: 'expired' as const, message: 'The authoritative retry deadline is no longer open. Retry is disabled.' }
    : mutationNotice;
  const displayedError = mutationNotice?.state === 'retry_safe' && retrySafeRequestId === null
    ? 'Current server-anchored time no longer proves an open retry deadline. No mutation will be sent.'
    : error;
  const phase = speedPhaseCopy(snapshot, seconds);
  const canGuess = snapshot.state === 'in_progress' && seconds > 0 && !snapshot.myState.terminalReason;
  const terminal = snapshot.state === 'completed' || snapshot.state === 'voided';
  const canForfeit = !terminal && snapshot.state !== 'finalizing' && !snapshot.myState.terminalReason;
  const readyActionAvailable = ['waiting_ready', 'waiting_invitation', 'waiting_opponent_ready'].includes(snapshot.state) && !snapshot.readiness.viewerReady;
  return (
    <article id="speed-gameplay" className={`${styles.panelWide} ${styles.speedGameplay}`} aria-busy={busy !== null}>
      <div className={styles.speedPhase} data-urgent={snapshot.state === 'in_progress' && seconds <= 10 ? 'true' : 'false'}>
        <p className={styles.eyebrow}>{phase.eyebrow}</p>
        <h2>{phase.title}</h2>
        <p>{phase.message}</p>
        <p className={styles.muted}>Ready {snapshot.readiness.readyCount}/2 · opponent {snapshot.opponentProgress.acceptedGuessCount}/6 guesses{snapshot.opponentProgress.terminal ? ' · opponent finished' : ''}</p>
      </div>
      <p className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">{announcement}</p>
      {displayedMutationNotice ? <div className={styles.statusStrip} role="status" aria-live="polite" aria-atomic="true" data-state={displayedMutationNotice.state}><strong>{displayedMutationNotice.state.replace('_', ' ')}</strong><span>{displayedMutationNotice.message}</span></div> : null}
      {displayedError ? <div className={styles.errorPanel} role="alert"><strong>Server check needed</strong><p>{displayedError}</p><button className={styles.secondaryButton} type="button" onClick={() => void refreshState(true)}>Check authoritative state</button></div> : null}

      {readyActionAvailable ? <button className={styles.primaryButton} type="button" disabled={busy !== null || seconds === 0 || Boolean(readyRequestId.current && retrySafeRequestId !== readyRequestId.current)} onClick={() => void markReady()}>{busy === 'ready' ? 'Confirming…' : readyRequestId.current ? retrySafeRequestId === readyRequestId.current ? 'Retry same ready request' : 'Awaiting authoritative ready outcome' : snapshot.state === 'waiting_invitation' ? 'Accept and ready up' : 'I’m ready'}</button> : null}

      {snapshot.state === 'countdown' ? <p className={styles.warningText}>Do not rely on browser wall-clock time. This display re-anchors whenever the server sends a fresh snapshot.</p> : null}

      {['in_progress', 'finalizing', 'completed', 'voided'].includes(snapshot.state) ? (
        <div className={styles.gameShellCompact}>
          <div>
            <div className={styles.wordGrid} role="grid" aria-label="Your live Speed guesses with server feedback">
              {snapshot.myState.acceptedGuesses.map((entry) => <div className={styles.wordRow} role="row" key={entry.guessNumber}>{entry.feedback.map((tile, index) => <WordTile key={`${entry.guessNumber}-${index}`} letter={tile.letter} state={tile.state} />)}</div>)}
              {Array.from({ length: Math.max(0, 6 - snapshot.myState.acceptedGuesses.length) }, (_, index) => <div className={styles.wordRow} role="row" key={`speed-empty-${index}`}><EmptyTileRow count={5} /></div>)}
            </div>
            <form className={styles.guessForm} onSubmit={(event) => void submit(event)}>
              <label htmlFor="speed-guess">Your five-letter word</label>
              <div className={styles.guessInputRow}>
                <input id="speed-guess" value={guess} onChange={(event) => setGuess(event.target.value)} inputMode="text" autoComplete="off" maxLength={5} pattern="[A-Za-z]{5}" disabled={!canGuess || busy !== null || guessRequest.current !== null} />
                <button className={styles.primaryButton} disabled={!canGuess || busy !== null || Boolean(guessRequest.current && retrySafeRequestId !== guessRequest.current.id) || (!guessRequest.current && !/^[a-zA-Z]{5}$/.test(guess))}>{busy === 'guess' ? 'Submitting…' : guessRequest.current ? retrySafeRequestId === guessRequest.current.id ? `Retry “${guessRequest.current.guess.toUpperCase()}” with same request` : `Awaiting “${guessRequest.current.guess.toUpperCase()}” outcome` : 'Submit'}</button>
              </div>
              {!canGuess ? <p className={styles.warningText}>{seconds === 0 && snapshot.state === 'in_progress' ? 'Displayed time is zero. Input is paused while the server resolves expiry.' : 'Guessing opens only during the authoritative Speed round.'}</p> : null}
            </form>
          </div>
          <aside className={styles.sidePanel}>
            <h3>Your run</h3>
            <p>{snapshot.myState.acceptedGuesses.length}/6 accepted guesses</p>
            <p>{snapshot.myState.terminalReason ? `Finished: ${snapshot.myState.terminalReason.replaceAll('_', ' ')}` : 'Still playing'}</p>
            <p className={styles.muted}>Opponent words, feedback, and exact solve time remain hidden.</p>
            {canForfeit ? <><button className={styles.dangerButton} type="button" disabled={busy !== null || Boolean(forfeitRequestId.current && retrySafeRequestId !== forfeitRequestId.current)} onClick={() => void forfeit()}>{busy === 'forfeit' ? 'Forfeiting…' : forfeitRequestId.current ? retrySafeRequestId === forfeitRequestId.current ? 'Retry same forfeit' : 'Awaiting authoritative forfeit outcome' : 'Forfeit and concede'}</button><p className={styles.warningText}>After reveal, this immediately awards the opponent a rated win.</p></> : null}
            {terminal ? <button className={styles.primaryButton} type="button" onClick={() => window.location.reload()}>Load authoritative result</button> : null}
          </aside>
        </div>
      ) : null}
    </article>
  );
}
