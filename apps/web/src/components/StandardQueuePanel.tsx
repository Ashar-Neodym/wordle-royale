'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Standard1v1Ticket } from '../lib/api-client';
import {
  cancelStandard1v1TicketAction,
  createStandard1v1TicketAction,
  getCurrentStandard1v1TicketAction,
  getStandard1v1TicketAction,
  startPreviewDemoSessionAction,
} from '../app/actions';
import styles from './web-shell.module.css';
import {
  hrefForMatchedTicket,
  queueResolutionFromResult,
  runMatchmakingOperationWithDeadline,
  stateFromTicket,
  type QueueUiState,
} from './standard-queue-state';

type SessionState = 'active' | 'signed_out' | 'unavailable';

type StandardQueuePanelProps = {
  sessionState: SessionState;
  sessionError?: string | null;
};

function elapsedSeconds(createdAt: string | undefined, now: number): number {
  if (!createdAt) return 0;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((now - created) / 1000));
}

function queueCopy(state: QueueUiState): { eyebrow: string; title: string; message: string } {
  switch (state) {
    case 'signed_out':
      return { eyebrow: 'Session required', title: 'Start a demo session to queue', message: 'Automatic Standard matchmaking requires an explicit preview session. Public lobbies remain browseable without one.' };
    case 'unavailable':
      return { eyebrow: 'Session check unavailable', title: 'Queue status is unavailable', message: 'The app could not confirm your session or reconnect to the queue. No ticket was created.' };
    case 'reconnecting':
      return { eyebrow: 'Reconnect', title: 'Checking for an active search…', message: 'The server remains authoritative while this page recovers any queued or matched ticket.' };
    case 'joining':
      return { eyebrow: 'Joining', title: 'Creating your Standard ticket…', message: 'Waiting for the server to accept or recover one active ticket.' };
    case 'searching':
      return { eyebrow: 'Searching', title: 'Looking for a Standard opponent', message: 'This ticket is stored by the server. You can refresh safely or cancel before pairing.' };
    case 'cancelling':
      return { eyebrow: 'Cancelling', title: 'Cancelling your search…', message: 'Waiting for the server to confirm that pairing has not already happened.' };
    case 'matched':
      return { eyebrow: 'Matched', title: 'Opponent found', message: 'Opening the shared server-authoritative match now.' };
    case 'cancelled':
      return { eyebrow: 'Cancelled', title: 'Search cancelled', message: 'The server confirmed this ticket is no longer searching. You can start a new search when ready.' };
    case 'timed_out':
      return { eyebrow: 'Timed out', title: 'No opponent found in time', message: 'The server expired this search. Retry to create a new ticket or use the lobby browser below.' };
    case 'error':
      return { eyebrow: 'Queue error', title: 'Search needs attention', message: 'No opponent or queue result is being guessed. Retry the server status check or use lobbies.' };
    default:
      return { eyebrow: 'Standard 1v1', title: 'Find a rated Standard match', message: 'Join the live automatic queue. Rating, pairing, and puzzle selection remain server-authoritative.' };
  }
}

export function StandardQueuePanel({ sessionState, sessionError }: StandardQueuePanelProps): ReactElement {
  const initialState: QueueUiState = sessionState === 'active' ? 'reconnecting' : sessionState;
  const [state, setState] = useState<QueueUiState>(initialState);
  const [ticket, setTicket] = useState<Standard1v1Ticket | null>(null);
  const [error, setError] = useState<string | null>(sessionState === 'unavailable' ? (sessionError ?? 'Session status could not be loaded.') : null);
  const [now, setNow] = useState(() => Date.now());
  const actionAttempt = useRef(0);

  function applyTicket(next: Standard1v1Ticket): void {
    setTicket(next);
    setState(stateFromTicket(next));
    setError(next.state === 'failed' ? 'The server marked this queue ticket as failed.' : null);
  }

  async function reconnect(): Promise<void> {
    const attempt = ++actionAttempt.current;
    setState('reconnecting');
    setError(null);
    try {
      const result = await runMatchmakingOperationWithDeadline('reconnect', getCurrentStandard1v1TicketAction());
      if (attempt !== actionAttempt.current) return;
      const resolution = queueResolutionFromResult(result);
      setTicket(resolution.ticket);
      setState(resolution.state);
      setError(resolution.error);
    } catch (caught) {
      if (attempt !== actionAttempt.current) return;
      setTicket(null);
      setState('error');
      setError(caught instanceof Error ? caught.message : 'Unable to recover queue status.');
    }
  }

  async function joinQueue(): Promise<void> {
    const attempt = ++actionAttempt.current;
    setState('joining');
    setError(null);
    try {
      const result = await runMatchmakingOperationWithDeadline(
        'join',
        createStandard1v1TicketAction(),
        'Joining the queue timed out. A server ticket may still exist; check queue status before retrying.',
      );
      if (attempt !== actionAttempt.current) return;
      if (result.status === 'connected' && result.data) {
        applyTicket(result.data);
        return;
      }
      setState(/not[_\s-]?authenticated|session required/i.test(result.error ?? '') ? 'signed_out' : 'error');
      setError(result.error ?? 'Unable to join the Standard queue.');
    } catch (caught) {
      if (attempt !== actionAttempt.current) return;
      setState('error');
      setError(caught instanceof Error ? caught.message : 'Unable to join the Standard queue.');
    }
  }

  async function cancelQueue(): Promise<void> {
    if (!ticket) return;
    const attempt = ++actionAttempt.current;
    setState('cancelling');
    setError(null);
    try {
      const result = await runMatchmakingOperationWithDeadline(
        'cancel',
        cancelStandard1v1TicketAction(ticket.ticketId),
        'Cancellation timed out. The ticket may still be active; check queue status before trying again.',
      );
      if (attempt !== actionAttempt.current) return;
      if (result.status === 'connected' && result.data) {
        applyTicket(result.data);
        return;
      }
      setState('error');
      setError(result.error ?? 'Unable to confirm queue cancellation. Check status before trying again.');
    } catch (caught) {
      if (attempt !== actionAttempt.current) return;
      setState('error');
      setError(caught instanceof Error ? caught.message : 'Unable to confirm queue cancellation. Check status before trying again.');
    }
  }

  useEffect(() => {
    if (sessionState === 'active') void reconnect();
  }, [sessionState]);

  useEffect(() => () => {
    actionAttempt.current += 1;
  }, []);

  useEffect(() => {
    if (state !== 'searching' || !ticket) return;
    let disposed = false;
    let polling = false;
    const poll = async (): Promise<void> => {
      if (polling) return;
      polling = true;
      try {
        const result = await runMatchmakingOperationWithDeadline(
          'current_ticket',
          getStandard1v1TicketAction(ticket.ticketId),
          'Queue polling timed out. Your server ticket may still be active.',
        );
        if (disposed) return;
        if (result.status === 'connected' && result.data) {
          applyTicket(result.data);
        } else if (result.status === 'unavailable') {
          setState('error');
          setError(result.error ?? 'Queue polling failed. Your server ticket may still be active.');
        }
      } catch (caught) {
        if (disposed) return;
        setState('error');
        setError(caught instanceof Error ? caught.message : 'Queue polling failed. Your server ticket may still be active.');
      } finally {
        polling = false;
      }
    };
    const pollTimer = window.setInterval(() => void poll(), 2000);
    return () => {
      disposed = true;
      window.clearInterval(pollTimer);
    };
  }, [state, ticket?.ticketId]);

  useEffect(() => {
    if (state !== 'searching') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    const matchedHref = hrefForMatchedTicket(ticket);
    if (state !== 'matched' || !matchedHref) return;
    const timer = window.setTimeout(() => {
      window.location.assign(matchedHref);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state, ticket?.matchedMatchId]);

  const copy = queueCopy(state);
  const busy = state === 'joining' || state === 'reconnecting' || state === 'cancelling';
  const elapsed = elapsedSeconds(ticket?.createdAt, now);
  const matchedHref = hrefForMatchedTicket(ticket);

  return (
    <article id="standard-queue" className={styles.queuePanel} aria-live="polite" aria-busy={busy}>
      <div className={styles.queueStatusBlock} role="status">
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h3>{copy.title}</h3>
        <p className={styles.muted}>{copy.message}</p>
        {state === 'searching' ? <p className={styles.queueElapsed}>Elapsed search: {elapsed}s</p> : null}
        {error ? <p className={styles.queueError}>{error}</p> : null}
      </div>

      <div className={styles.queueActions}>
        {state === 'signed_out' ? (
          <form action={startPreviewDemoSessionAction}>
            <input type="hidden" name="redirectTo" value="/play#standard-queue" />
            <button className={styles.primaryButton} type="submit">Start preview demo</button>
          </form>
        ) : null}
        {state === 'idle' || state === 'cancelled' || state === 'timed_out' ? (
          <button className={styles.primaryButton} type="button" onClick={() => void joinQueue()}>{state === 'idle' ? 'Find Standard match' : 'Search again'}</button>
        ) : null}
        {state === 'searching' ? <button className={styles.secondaryButton} type="button" onClick={() => void cancelQueue()}>Cancel search</button> : null}
        {state === 'error' || state === 'unavailable' ? <button className={styles.primaryButton} type="button" onClick={() => void reconnect()}>Check queue status</button> : null}
        {state === 'matched' && matchedHref ? <a className={styles.primaryButton} href={matchedHref}>Open match</a> : null}
        {busy ? <button className={styles.secondaryButton} type="button" disabled>{state === 'joining' ? 'Joining…' : state === 'cancelling' ? 'Cancelling…' : 'Checking…'}</button> : null}
        <a className={styles.secondaryButton} href="/lobbies">Use lobbies</a>
      </div>
      <p className={styles.queueFootnote}>Standard 1v1 is the only automatic rated queue in this preview. Speed, Classic, and Multiplayer are not live matchmaking modes yet.</p>
    </article>
  );
}
