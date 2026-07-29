'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Speed1v1Ticket } from '@wordle-royale/contracts';
import {
  cancelSpeed1v1TicketAction,
  createSpeed1v1TicketAction,
  getCurrentSpeed1v1TicketAction,
  getSpeed1v1TicketAction,
  startPreviewDemoSessionAction,
} from '../app/actions';
import { runMatchmakingOperationWithDeadline } from './standard-queue-state';
import {
  speedMatchedHref,
  speedQueueCopy,
  speedQueueResolution,
  speedQueueState,
  type SpeedQueueUiState,
} from './speed-live-state';
import styles from './web-shell.module.css';
import { ServerReadRetryButton } from './ServerReadRetryButton';
import { authLimitedPresentation, type AuthPresentationMode } from '../lib/auth-presentation';

type Props = {
  sessionState: 'active' | 'signed_out' | 'unavailable';
  queueEnabled: boolean;
  catalogAvailable: boolean;
  authPresentationMode: AuthPresentationMode;
};

export function SpeedQueuePanel({ sessionState, queueEnabled, catalogAvailable, authPresentationMode }: Props): ReactElement {
  const initial: SpeedQueueUiState = !catalogAvailable ? 'authority_unavailable' : !queueEnabled ? 'disabled' : sessionState === 'active' ? 'reconnecting' : sessionState === 'unavailable' ? 'error' : sessionState;
  const [state, setState] = useState<SpeedQueueUiState>(initial);
  const [ticket, setTicket] = useState<Speed1v1Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const generation = useRef(0);
  const joinRequestId = useRef<string | null>(null);

  function apply(next: Speed1v1Ticket): void {
    setTicket(next);
    setState(speedQueueState(next));
    setError(next.state === 'failed' ? 'The server marked this Speed search as failed.' : null);
    if (next.state !== 'failed') joinRequestId.current = null;
  }

  async function reconnect(): Promise<void> {
    if (!queueEnabled) return;
    const attempt = ++generation.current;
    setState('reconnecting'); setError(null);
    try {
      const result = await runMatchmakingOperationWithDeadline('reconnect', getCurrentSpeed1v1TicketAction());
      if (attempt !== generation.current) return;
      const resolved = speedQueueResolution(result);
      setState(resolved.state); setTicket(resolved.ticket); setError(resolved.error);
      if (result.status === 'connected') joinRequestId.current = null;
    } catch (caught) {
      if (attempt !== generation.current) return;
      setState('error'); setError(caught instanceof Error ? caught.message : 'Unable to reconnect to Speed.');
    }
  }

  async function join(): Promise<void> {
    if (!queueEnabled) return;
    const attempt = ++generation.current;
    joinRequestId.current ??= crypto.randomUUID();
    const requestId = joinRequestId.current;
    setState('joining'); setError(null);
    try {
      const result = await runMatchmakingOperationWithDeadline('join', createSpeed1v1TicketAction(requestId), 'Speed join timed out. The ticket may still exist; check status before retrying.');
      if (attempt !== generation.current) return;
      if (result.status === 'connected' && result.data) apply(result.data);
      else { setState('error'); setError(result.error ?? 'Unable to join Speed. Check status before retrying.'); }
    } catch (caught) {
      if (attempt !== generation.current) return;
      setState('error'); setError(caught instanceof Error ? caught.message : 'Unable to join Speed.');
    }
  }

  async function cancel(): Promise<void> {
    if (!ticket) return;
    const attempt = ++generation.current;
    setState('cancelling'); setError(null);
    try {
      const result = await runMatchmakingOperationWithDeadline('cancel', cancelSpeed1v1TicketAction(ticket.ticketId), 'Speed cancellation timed out. Check status before trying again.');
      if (attempt !== generation.current) return;
      if (result.status === 'connected' && result.data) apply(result.data);
      else { setState('error'); setError(result.error ?? 'Unable to confirm Speed cancellation.'); }
    } catch (caught) {
      if (attempt !== generation.current) return;
      setState('error'); setError(caught instanceof Error ? caught.message : 'Unable to confirm Speed cancellation.');
    }
  }

  useEffect(() => { if (queueEnabled && sessionState === 'active') void reconnect(); }, [queueEnabled, sessionState]);
  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => {
    if (state !== 'searching' || !ticket) return;
    let disposed = false;
    const poll = async (): Promise<void> => {
      const result = await runMatchmakingOperationWithDeadline('current_ticket', getSpeed1v1TicketAction(ticket.ticketId), 'Speed polling timed out. The ticket may still be active.').catch((caught: unknown) => ({ status: 'unavailable' as const, apiUrl: '', data: null, requestId: null, error: caught instanceof Error ? caught.message : 'Speed polling failed.' }));
      if (disposed) return;
      if (result.status === 'connected' && result.data) apply(result.data);
      else if (result.status === 'unavailable') { setState('error'); setError(result.error); }
    };
    const polling = window.setInterval(() => void poll(), 2_000);
    const clock = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(ticket.createdAt)) / 1_000))), 1_000);
    return () => { disposed = true; window.clearInterval(polling); window.clearInterval(clock); };
  }, [state, ticket?.ticketId]);

  const matchedHref = speedMatchedHref(ticket);
  useEffect(() => {
    if (state !== 'matched' || !matchedHref) return;
    const timer = window.setTimeout(() => window.location.assign(matchedHref), 700);
    return () => window.clearTimeout(timer);
  }, [state, matchedHref]);

  const text = speedQueueCopy(state, authPresentationMode);
  const authCopy = authLimitedPresentation(authPresentationMode, 'Speed queue');
  const busy = ['reconnecting', 'joining', 'cancelling'].includes(state);
  return (
    <article id="speed-queue" className={`${styles.queuePanel} ${styles.speedQueuePanel}`} aria-live="polite" aria-busy={busy}>
      <div className={styles.queueStatusBlock} role="status">
        <p className={styles.eyebrow}>{text.eyebrow}</p><h3>{text.title}</h3><p className={styles.muted}>{text.message}</p>
        {state === 'searching' ? <p className={styles.queueElapsed}>Elapsed Speed search: {elapsed}s{ticket?.estimatedWaitSeconds ? ` · estimate ${ticket.estimatedWaitSeconds}s` : ''}</p> : null}
        {error ? <p className={styles.queueError}>{error}</p> : null}
      </div>
      <div className={styles.queueActions}>
        {state === 'authority_unavailable' ? <ServerReadRetryButton label="Retry Speed availability" /> : null}
        {state === 'signed_out' && authCopy.action === 'preview_demo' ? <form action={startPreviewDemoSessionAction}><input type="hidden" name="redirectTo" value="/play#speed-queue" /><button className={styles.primaryButton}>Start preview demo</button></form> : state === 'signed_out' && authCopy.action === 'sign_in' ? <a className={styles.primaryButton} href="/account">Sign in</a> : null}
        {state === 'idle' || state === 'cancelled' || state === 'timed_out' ? <button className={styles.primaryButton} type="button" onClick={() => void join()}>{state === 'idle' ? 'Find Speed match' : 'Search Speed again'}</button> : null}
        {state === 'searching' ? <button className={styles.secondaryButton} type="button" onClick={() => void cancel()}>Cancel Speed search</button> : null}
        {state === 'error' ? <button className={styles.primaryButton} type="button" onClick={() => void reconnect()}>Check Speed status</button> : null}
        {state === 'matched' && matchedHref ? <a className={styles.primaryButton} href={matchedHref}>Open Speed match</a> : null}
        {busy ? <button className={styles.secondaryButton} disabled>{state === 'joining' ? 'Joining…' : state === 'cancelling' ? 'Cancelling…' : 'Checking…'}</button> : null}
      </div>
      <p className={styles.queueFootnote}>Speed is advertised as live only when one API origin, matching web/API revisions, readiness, and the authoritative mode catalog agree. Classic and Multiplayer are not live yet.</p>
    </article>
  );
}
