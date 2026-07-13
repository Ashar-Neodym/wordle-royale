import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ApiClientResult, Standard1v1Ticket } from '../lib/api-client.ts';
import {
  CLIENT_ACTION_DEADLINE_MS,
  hrefForMatchedTicket,
  queueResolutionFromResult,
  runWithClientDeadline,
} from './standard-queue-state.ts';

function ticket(state: Standard1v1Ticket['state'], matchedMatchId: string | null = null): Standard1v1Ticket {
  return {
    ticketId: 'ticket-must-not-be-used-for-routing',
    state,
    mode: 'standard_1v1',
    rated: true,
    userId: 'user-1',
    ratingAtQueue: 1500,
    provisional: true,
    searchWindow: { minRating: 1300, maxRating: 1700, expansionStep: 0 },
    estimatedWaitSeconds: null,
    matchedMatchId,
    createdAt: '2026-07-10T10:00:00.000Z',
    updatedAt: '2026-07-10T10:00:00.000Z',
    expiresAt: '2026-07-10T10:05:00.000Z',
    cancelledAt: null,
    timedOutAt: null,
  };
}

function result(data: Standard1v1Ticket | null): ApiClientResult<Standard1v1Ticket> {
  return { status: 'connected', apiUrl: 'http://api.test', data, requestId: 'request-1', error: null };
}

describe('Standard queue reconnect resolution', () => {
  it('settles an active session with no ticket to idle', () => {
    assert.deepEqual(queueResolutionFromResult(result(null)), { state: 'idle', ticket: null, error: null });
  });

  it('uses server ticket state for queued and matched sessions', () => {
    const queued = ticket('queued');
    const matched = ticket('matched', 'server-match-id');
    assert.deepEqual(queueResolutionFromResult(result(queued)), { state: 'searching', ticket: queued, error: null });
    assert.deepEqual(queueResolutionFromResult(result(matched)), { state: 'matched', ticket: matched, error: null });
  });

  it('settles unauthenticated and transport failures to recoverable states', () => {
    const signedOut: ApiClientResult<Standard1v1Ticket> = {
      status: 'unavailable', apiUrl: 'http://api.test', data: null, requestId: null, error: 'not_authenticated: Session required.',
    };
    const failed: ApiClientResult<Standard1v1Ticket> = {
      status: 'unavailable', apiUrl: 'http://api.test', data: null, requestId: null, error: 'socket closed',
    };
    assert.equal(queueResolutionFromResult(signedOut).state, 'signed_out');
    assert.deepEqual(queueResolutionFromResult(failed), { state: 'error', ticket: null, error: 'socket closed' });
  });

  it('rejects a stalled action at the client deadline', async () => {
    await assert.rejects(
      runWithClientDeadline(new Promise<never>(() => undefined), 10),
      /Queue status check timed out/,
    );
    assert.ok(CLIENT_ACTION_DEADLINE_MS > 0);
  });

  it('builds matched navigation only from matchedMatchId', () => {
    assert.equal(hrefForMatchedTicket(ticket('matched', 'match / from server')), '/play?matchId=match%20%2F%20from%20server#gameplay');
    assert.equal(hrefForMatchedTicket(ticket('matched', null)), null);
    assert.equal(hrefForMatchedTicket(ticket('queued', 'unexpected-match')), null);
  });
});
