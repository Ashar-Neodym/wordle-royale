'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import type { SpeedMatchSnapshot } from '@wordle-royale/contracts';
import type { ApiClientResult, LiveMatchState } from '../lib/api-client';
import { forfeitSpeedMatchAction, getSpeedMatchStateAction, markSpeedMatchReadyAction, submitSpeedGuessAction } from '../app/actions';
import { EmptyTileRow, WordTile } from './WordTile';
import {
  createServerClockAnchor,
  crossedCountdownAnnouncement,
  displayedSeconds,
  remainingSpeedMs,
  retainUncertainGuessRequest,
  reconcileUncertainGuessRequest,
  speedDeadline,
  speedPhaseCopy,
  type ServerClockAnchor,
  type UncertainGuessRequest,
} from './speed-live-state';
import styles from './web-shell.module.css';

type Props = { initialState: ApiClientResult<LiveMatchState> };

function asSpeed(result: ApiClientResult<LiveMatchState>): SpeedMatchSnapshot | null {
  const data = result.status === 'connected' ? result.data : null;
  return data && 'roundId' in data ? data : null;
}

function mutationError(result: { error: string | null; errorCode?: string | null }, fallback: string): string {
  if (result.errorCode === 'ready_deadline_passed') return 'The 20-second ready deadline expired. The server will resolve this match as a no-contest.';
  if (result.errorCode === 'deadline_passed') return 'The 75-second server deadline passed before this move arrived. Refreshing cannot extend it.';
  if (result.errorCode === 'participant_terminal') return 'Your Speed run is already terminal. Waiting for the authoritative result.';
  return result.error ?? fallback;
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

  const readyRequestId = useRef<string | null>(null);
  const guessRequest = useRef<UncertainGuessRequest | null>(null);
  const forfeitRequestId = useRef<string | null>(null);
  const previousSeconds = useRef<number | null>(null);
  const zeroSyncKey = useRef<string | null>(null);

  const apply = useCallback((next: SpeedMatchSnapshot): void => {
    const pendingGuess = guessRequest.current;
    const unresolvedGuess = reconcileUncertainGuessRequest(next, pendingGuess);
    guessRequest.current = unresolvedGuess;
    setSnapshot(next);
    setAnchor(createServerClockAnchor(next.serverTime, performance.now()));
    setMonotonicNow(performance.now());
    if (!pendingGuess || !unresolvedGuess) setError(null);
    if (next.readiness.viewerReady) readyRequestId.current = null;
    if (pendingGuess && !unresolvedGuess) setGuess('');
    if (next.state === 'completed' || next.state === 'voided') forfeitRequestId.current = null;
  }, []);

  const refreshState = useCallback(async (): Promise<void> => {
    if (!snapshot) return;
    const result = await getSpeedMatchStateAction(snapshot.matchId);
    const next = asSpeed(result);
    if (next) apply(next);
    else setError(result.error ?? 'Could not refresh authoritative Speed state. Your deadline remains unchanged.');
  }, [snapshot?.matchId, apply]);

  useEffect(() => {
    if (!snapshot) return;
    setAnchor(createServerClockAnchor(snapshot.serverTime, performance.now()));
    setMonotonicNow(performance.now());
  }, []);

  useEffect(() => {
    if (!snapshot || snapshot.state === 'completed' || snapshot.state === 'voided') return;
    const tick = window.setInterval(() => setMonotonicNow(performance.now()), 200);
    const poll = window.setInterval(() => void refreshState(), 1_500);
    return () => { window.clearInterval(tick); window.clearInterval(poll); };
  }, [snapshot?.matchId, snapshot?.state, refreshState]);

  const remainingMs = snapshot && anchor ? remainingSpeedMs(snapshot, anchor, monotonicNow) : 0;
  const seconds = displayedSeconds(remainingMs);

  useEffect(() => {
    if (!snapshot) return;
    if (!['waiting_ready', 'countdown', 'in_progress'].includes(snapshot.state)) {
      previousSeconds.current = null;
      setAnnouncement('');
      return;
    }
    const threshold = crossedCountdownAnnouncement(previousSeconds.current, seconds);
    previousSeconds.current = seconds;
    if (threshold !== null) setAnnouncement(threshold === 0 ? 'Displayed time reached zero. Checking authoritative server state.' : `${threshold} seconds remaining.`);
    if (seconds === 0 && ['waiting_ready', 'countdown', 'in_progress'].includes(snapshot.state)) {
      const key = `${snapshot.state}:${speedDeadline(snapshot) ?? 'none'}`;
      if (zeroSyncKey.current !== key) { zeroSyncKey.current = key; void refreshState(); }
    }
  }, [seconds, snapshot?.state, snapshot?.serverTime, refreshState]);

  async function markReady(): Promise<void> {
    if (!snapshot || busy) return;
    readyRequestId.current ??= crypto.randomUUID();
    setBusy('ready'); setError(null);
    try {
      const result = await markSpeedMatchReadyAction(snapshot.matchId, readyRequestId.current);
      if (result.status === 'connected' && result.data) apply(result.data);
      else { setError(mutationError(result, 'Ready confirmation is uncertain. Check server state, then retry with the same request.')); await refreshState(); }
    } finally { setBusy(null); }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!snapshot || busy || (!guessRequest.current && !/^[a-zA-Z]{5}$/.test(guess))) return;
    const normalized = guess.toLowerCase();
    const request = retainUncertainGuessRequest(guessRequest.current, normalized, () => crypto.randomUUID());
    guessRequest.current = request;
    setBusy('guess'); setError(null);
    try {
      const result = await submitSpeedGuessAction(snapshot.matchId, snapshot.roundId, request.guess, request.id);
      if (result.status === 'connected' && result.data) {
        guessRequest.current = null;
        setGuess('');
        if (!result.data.accepted) setError(`Guess rejected: ${result.data.reason.replaceAll('_', ' ')}. No attempt was consumed.`);
        else await refreshState();
      } else { setError(mutationError(result, 'Guess response is uncertain. Check state before safely retrying the same request.')); await refreshState(); }
    } finally { setBusy(null); }
  }

  async function forfeit(): Promise<void> {
    if (!snapshot || busy) return;
    forfeitRequestId.current ??= crypto.randomUUID();
    setBusy('forfeit'); setError(null);
    try {
      const result = await forfeitSpeedMatchAction(snapshot.matchId, forfeitRequestId.current);
      if (result.status === 'connected' && result.data) apply(result.data);
      else { setError(mutationError(result, 'Forfeit response is uncertain. Check state before retrying the same request.')); await refreshState(); }
    } finally { setBusy(null); }
  }

  if (!snapshot) {
    return <article id="speed-gameplay" className={styles.errorPanel} aria-live="polite"><strong>Speed state unavailable</strong><p>{error}</p><button className={styles.primaryButton} type="button" onClick={() => window.location.reload()}>Reconnect to match</button></article>;
  }

  const phase = speedPhaseCopy(snapshot, seconds);
  const canGuess = snapshot.state === 'in_progress' && seconds > 0 && !snapshot.myState.terminalReason;
  const terminal = snapshot.state === 'completed' || snapshot.state === 'voided';
  const canForfeit = !terminal && snapshot.state !== 'finalizing' && !snapshot.myState.terminalReason;
  return (
    <article id="speed-gameplay" className={`${styles.panelWide} ${styles.speedGameplay}`} aria-busy={busy !== null}>
      <div className={styles.speedPhase} data-urgent={snapshot.state === 'in_progress' && seconds <= 10 ? 'true' : 'false'}>
        <p className={styles.eyebrow}>{phase.eyebrow}</p>
        <h2>{phase.title}</h2>
        <p>{phase.message}</p>
        <p className={styles.muted}>Ready {snapshot.readiness.readyCount}/2 · opponent {snapshot.opponentProgress.acceptedGuessCount}/6 guesses{snapshot.opponentProgress.terminal ? ' · opponent finished' : ''}</p>
      </div>
      <p className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">{announcement}</p>
      {error ? <div className={styles.errorPanel} role="alert"><strong>Server check needed</strong><p>{error}</p><button className={styles.secondaryButton} type="button" onClick={() => void refreshState()}>Check authoritative state</button></div> : null}

      {snapshot.state === 'waiting_ready' && !snapshot.readiness.viewerReady ? <button className={styles.primaryButton} type="button" disabled={busy !== null || seconds === 0} onClick={() => void markReady()}>{busy === 'ready' ? 'Confirming…' : readyRequestId.current ? 'Retry same ready request' : 'I’m ready'}</button> : null}

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
                <button className={styles.primaryButton} disabled={!canGuess || busy !== null || (!guessRequest.current && !/^[a-zA-Z]{5}$/.test(guess))}>{busy === 'guess' ? 'Submitting…' : guessRequest.current ? `Retry “${guessRequest.current.guess.toUpperCase()}” with same request` : 'Submit'}</button>
              </div>
              {!canGuess ? <p className={styles.warningText}>{seconds === 0 && snapshot.state === 'in_progress' ? 'Displayed time is zero. Input is paused while the server resolves expiry.' : 'Guessing opens only during the authoritative Speed round.'}</p> : null}
            </form>
          </div>
          <aside className={styles.sidePanel}>
            <h3>Your run</h3>
            <p>{snapshot.myState.acceptedGuesses.length}/6 accepted guesses</p>
            <p>{snapshot.myState.terminalReason ? `Finished: ${snapshot.myState.terminalReason.replaceAll('_', ' ')}` : 'Still playing'}</p>
            <p className={styles.muted}>Opponent words, feedback, and exact solve time remain hidden.</p>
            {canForfeit ? <><button className={styles.dangerButton} type="button" disabled={busy !== null} onClick={() => void forfeit()}>{busy === 'forfeit' ? 'Forfeiting…' : forfeitRequestId.current ? 'Retry same forfeit' : 'Forfeit and concede'}</button><p className={styles.warningText}>After reveal, this immediately awards the opponent a rated win.</p></> : null}
            {terminal ? <button className={styles.primaryButton} type="button" onClick={() => window.location.reload()}>Load authoritative result</button> : null}
          </aside>
        </div>
      ) : null}
    </article>
  );
}
