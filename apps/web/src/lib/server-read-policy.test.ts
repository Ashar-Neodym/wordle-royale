import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { leaderboardReadFallback, profileReadFallback } from './read-fallback.ts';
import { requestServerReadRetry, serverReadRetryState } from './server-read-retry.ts';
import {
  cancelStandard1v1Ticket,
  completeRankedMatch,
  createStandard1v1Ticket,
  getCurrentProfileSummary,
  getLeaderboard,
  HOSTED_READ_POLICY,
  submitGuess,
} from './api-client.ts';

function connectedLeaderboardResponse(): Response {
  return new Response(JSON.stringify({
    data: {
      mode: 'standard_1v1',
      algorithm: 'standard_1v1_glicko_v1',
      algorithmConfigVersion: 'test',
      generatedAt: '2026-07-14T00:00:00.000Z',
      entries: [],
    },
    error: null,
    requestId: 'ticket-154-read',
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('hosted server-read reliability policy', () => {
  it('accepts a real delayed idempotent read that exceeds the former 1.2-second limit', async () => {
    assert.deepEqual(HOSTED_READ_POLICY, {
      timeoutMs: 5_000,
      maxAttempts: 2,
      retryDelayMs: 200,
    });

    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return await new Promise<Response>((resolve) => {
        setTimeout(() => resolve(connectedLeaderboardResponse()), 1_500);
      });
    };

    try {
      const startedAt = performance.now();
      const result = await getLeaderboard(20);
      const elapsedMs = performance.now() - startedAt;
      assert.equal(result.status, 'connected');
      assert.equal(calls, 1);
      assert.ok(elapsedMs >= 1_400, `expected real elapsed time beyond 1.2s, received ${elapsedMs}ms`);
      assert.ok(elapsedMs < HOSTED_READ_POLICY.timeoutMs);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('recovers when the first transient read fails and the second attempt succeeds', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('first attempt transport failure');
      return connectedLeaderboardResponse();
    };

    try {
      const result = await getLeaderboard(20);
      assert.equal(result.status, 'connected');
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retries one transient read failure, then returns a truthful unavailable result', async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new TypeError('temporary hosted transport failure');
    };
    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      return originalSetTimeout(handler, timeout === HOSTED_READ_POLICY.retryDelayMs ? 0 : timeout, ...args);
    }) as typeof globalThis.setTimeout;

    try {
      const result = await getCurrentProfileSummary();
      assert.equal(result.status, 'unavailable');
      assert.equal(calls, HOSTED_READ_POLICY.maxAttempts);
      assert.match(result.error ?? '', /temporary hosted transport failure/);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('never automatically retries queue or gameplay mutations', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new TypeError('mutation transport failure');
    };

    const mutations = [
      () => createStandard1v1Ticket({
        clientRequestId: '00000000-0000-4000-8000-000000000154',
        mode: 'standard_1v1',
        rated: true,
      }),
      () => cancelStandard1v1Ticket('ticket-154'),
      () => submitGuess({
        clientRequestId: '00000000-0000-4000-8000-000000000155',
        matchId: 'match-154',
        roundId: 'round-154',
        guess: 'crane',
      }),
      () => completeRankedMatch({
        clientRequestId: '00000000-0000-4000-8000-000000000156',
        matchId: 'match-154',
        reason: 'all_players_final',
      }),
    ];

    try {
      for (const mutation of mutations) {
        const before = calls;
        const result = await mutation();
        assert.equal(result.status, 'unavailable');
        assert.equal(calls - before, 1);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('defines truthful profile and leaderboard fallbacks with explicit user retries', () => {
    assert.deepEqual(profileReadFallback(), {
      title: 'Profile unavailable',
      message: 'Live profile data could not be loaded. No fixture player is shown as your account.',
      retryLabel: 'Retry profile',
    });
    assert.deepEqual(leaderboardReadFallback(), {
      title: 'Live leaderboard unavailable',
      message: 'No fixture standings are mixed into this unavailable state.',
      retryLabel: 'Retry live leaderboard',
    });
  });

  it('exposes accessible idle and busy states for real server-read retry controls', () => {
    assert.deepEqual(serverReadRetryState('Retry live leaderboard', false), {
      disabled: false,
      ariaBusy: false,
      visibleLabel: 'Retry live leaderboard',
      statusLabel: '',
    });
    assert.deepEqual(serverReadRetryState('Retry live leaderboard', true), {
      disabled: true,
      ariaBusy: true,
      visibleLabel: 'Retrying…',
      statusLabel: 'Retry live leaderboard requested. Refreshing live server data.',
    });
  });

  it('requests one real reload and rejects a duplicate pending retry', () => {
    let pending = false;
    let reloads = 0;
    const scheduled: Array<() => void> = [];
    const setPending = (value: boolean) => { pending = value; };
    const scheduleReload = (reload: () => void) => { scheduled.push(reload); };
    const reload = () => { reloads += 1; };

    assert.equal(requestServerReadRetry(pending, setPending, scheduleReload, reload), true);
    assert.equal(pending, true);
    assert.equal(scheduled.length, 1);
    assert.equal(requestServerReadRetry(pending, setPending, scheduleReload, reload), false);
    assert.equal(scheduled.length, 1);

    scheduled[0]?.();
    assert.equal(reloads, 1);
  });
});
