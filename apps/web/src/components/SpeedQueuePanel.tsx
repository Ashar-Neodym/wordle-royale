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
import { speedMatchedHref, speedQueueResolution, speedQueueState, type SpeedQueueUiState } from './speed-live-state';
import styles from './web-shell.module.css';

type Props = {
  sessionState: 'active' | 'signed_out' | 'unavailable';
  queueEnabled: boolean;
  catalogAvailable: boolean;
};

function copy(state: SpeedQueueUiState): { eyebrow: string; title: string; message: string } {
  switch (state) {
    case 'disabled': return { eyebrow: 'Speed unavailable', title: 'Speed queue is not enabled', message: 'The live mode catalog has not enabled this rated queue. No matchmaking request will be sent.' };
    case 'signed_out': return { eyebrow: 'Session required', title: 'Start a demo session to queue', message: 'Speed matchmaking requires an explicit preview session.' };
    case 'reconnecting': return { eyebrow: 'Speed reconnect', title: 'Checking your Speed search…', message: 'The server may restore a queued or matched Speed ticket after refresh.' };
    case 'joining': return { eyebrow: 'Joining Speed', title: 'Creating one rated Speed ticket…', message: 'A single request identity is retained until the server state is known.' };
    case 'searching': return { eyebrow: 'Speed search', title: 'Looking for a Speed opponent', message: 'This search is independent from Standard and stored by the server.' };
    case 'cancelling': return { eyebrow: 'Cancelling', title: 'Checking cancellation with the server…', message: 'Pairing may win the race; the returned ticket remains authoritative.' };
    case 'matched': return { eyebrow: 'Speed matched', title: 'Opponent found', message: 'Opening the 20-second ready gate and server-owned countdown.' };
    case 'cancelled': return { eyebrow: 'Cancelled', title: 'Speed search cancelled', message: 'The server confirmed this ticket is no longer active.' };
    case 'timed_out': return { eyebrow: 'Expired', title: 'Speed search expired', message: 'Create a new ticket to search again.' };
    case 'error': return { eyebrow: 'Recoverable error', title: 'Speed status needs a fresh server check', message: 'A timeout does not prove whether a ticket exists. Check status before another mutation.' };
    default: return { eyebrow: 'Speed / Blitz', title: 'Find a live rated Speed match', message: '75-second shared puzzle · six guesses · server solve-time tie-break.' };
  }
}

export function SpeedQueuePanel({ sessionState, queueEnabled, catalogAvailable }: Props): ReactElement {
  const initial: SpeedQueueUiState = !catalogAvailable || !queueEnabled ? 'disabled' : sessionState === 'active' ? 'reconnecting' : sessionState === 'unavailable' ? 'error' : sessionState;
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

  const text = copy(state);
  const busy = ['reconnecting', 'joining', 'cancelling'].includes(state);
  return (
    <article id="speed-queue" className={`${styles.queuePanel} ${styles.speedQueuePanel}`} aria-live="polite" aria-busy={busy}>
      <div className={styles.queueStatusBlock} role="status">
        <p className={styles.eyebrow}>{text.eyebrow}</p><h3>{text.title}</h3><p className={styles.muted}>{text.message}</p>
        {state === 'searching' ? <p className={styles.queueElapsed}>Elapsed Speed search: {elapsed}s{ticket?.estimatedWaitSeconds ? ` · estimate ${ticket.estimatedWaitSeconds}s` : ''}</p> : null}
        {error ? <p className={styles.queueError}>{error}</p> : null}
      </div>
      <div className={styles.queueActions}>
        {state === 'signed_out' ? <form action={startPreviewDemoSessionAction}><input type="hidden" name="redirectTo" value="/play#speed-queue" /><button className={styles.primaryButton}>Start preview demo</button></form> : null}
        {state === 'idle' || state === 'cancelled' || state === 'timed_out' ? <button className={styles.primaryButton} type="button" onClick={() => void join()}>{state === 'idle' ? 'Find Speed match' : 'Search Speed again'}</button> : null}
        {state === 'searching' ? <button className={styles.secondaryButton} type="button" onClick={() => void cancel()}>Cancel Speed search</button> : null}
        {state === 'error' ? <button className={styles.primaryButton} type="button" onClick={() => void reconnect()}>Check Speed status</button> : null}
        {state === 'matched' && matchedHref ? <a className={styles.primaryButton} href={matchedHref}>Open Speed match</a> : null}
        {busy ? <button className={styles.secondaryButton} disabled>{state === 'joining' ? 'Joining…' : state === 'cancelling' ? 'Cancelling…' : 'Checking…'}</button> : null}
      </div>
      <p className={styles.queueFootnote}>Speed is advertised as live only when the authoritative mode catalog enables its queue. Classic and Multiplayer are not live yet.</p>
    </article>
  );
}
