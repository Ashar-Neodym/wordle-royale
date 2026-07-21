import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  forfeitSpeedMatch,
  getSpeedMatchStateForRecovery,
  markSpeedMatchReady,
  submitSpeedGuess,
} from './api-client.ts';
import { SPEED_MUTATION_POLICY } from './speed-mutation-policy.ts';

function success(data: unknown = {}): Response {
  return new Response(JSON.stringify({ data, error: null, requestId: 'ticket-178' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Speed API mutation and recovery budgets', () => {
  it('applies the 26-second API budget to ready, guess, and forfeit without changing generic policy', async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    const scheduled: number[] = [];
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return success(); };
    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      scheduled.push(timeout ?? 0);
      return originalSetTimeout(handler, timeout, ...args);
    }) as typeof globalThis.setTimeout;
    try {
      await markSpeedMatchReady('match-178', { clientRequestId: 'ready-178' });
      await submitSpeedGuess({ clientRequestId: 'guess-178', matchId: 'match-178', roundId: 'round-178', guess: 'crane' });
      await forfeitSpeedMatch('match-178', { clientRequestId: 'forfeit-178' });
      assert.equal(calls, 3);
      assert.deepEqual(scheduled, [26_000, 26_000, 26_000]);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('uses two 12-second recovery reads with a 250ms delay after a transient failure', async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    const scheduled: number[] = [];
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('hosted recovery transport failure');
      return success({ state: 'waiting_invitation' });
    };
    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      scheduled.push(timeout ?? 0);
      return originalSetTimeout(handler, timeout === SPEED_MUTATION_POLICY.recoveryRetryDelayMs ? 0 : timeout, ...args);
    }) as typeof globalThis.setTimeout;
    try {
      const result = await getSpeedMatchStateForRecovery('match-178');
      assert.equal(result.status, 'connected');
      assert.equal(calls, 2);
      assert.deepEqual(scheduled, [12_000, 250, 12_000]);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('never automatically replays failed Speed mutations', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new TypeError('dropped response'); };
    try {
      for (const mutation of [
        () => markSpeedMatchReady('match-178', { clientRequestId: 'ready-178' }),
        () => submitSpeedGuess({ clientRequestId: 'guess-178', matchId: 'match-178', roundId: 'round-178', guess: 'crane' }),
        () => forfeitSpeedMatch('match-178', { clientRequestId: 'forfeit-178' }),
      ]) {
        const before = calls;
        const result = await mutation();
        assert.equal(result.status, 'unavailable');
        assert.equal(calls - before, 1);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
