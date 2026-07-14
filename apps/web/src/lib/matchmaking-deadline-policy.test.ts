import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { MATCHMAKING_LIFECYCLE_MS } from '../../../api/src/matchmaking/matchmaking-lifecycle.ts';
import { runMatchmakingOperationWithDeadline } from '../components/standard-queue-state.ts';
import {
  cancelStandard1v1Ticket,
  createStandard1v1Ticket,
  getCurrentStandard1v1Ticket,
  getStandard1v1Ticket,
} from './api-client.ts';
import {
  MATCHMAKING_DEADLINE_POLICY,
  MATCHMAKING_OPERATIONS,
  matchmakingDeadlinePolicyFor,
} from './matchmaking-deadline-policy.ts';

describe('cross-layer matchmaking deadline policy', () => {
  it('binds directly to the enforced backend lifecycle and preserves every strict margin', () => {
    const policy = MATCHMAKING_DEADLINE_POLICY;

    assert.equal(policy.backendLifecycleMs, MATCHMAKING_LIFECYCLE_MS);
    assert.equal(policy.backendLifecycleMs, 90_000);
    assert.equal(policy.apiProxyMs, 95_000);
    assert.equal(policy.serverActionMaxMs, 100_000);
    assert.equal(policy.browserMs, 110_000);
    assert.ok(policy.backendLifecycleMs < policy.apiProxyMs);
    assert.ok(policy.apiProxyMs < policy.serverActionMaxMs);
    assert.ok(policy.serverActionMaxMs < policy.browserMs);
    assert.ok(policy.apiProxyMs - policy.backendLifecycleMs >= policy.minimumApiOverheadMs);
    assert.ok(policy.serverActionMaxMs - policy.apiProxyMs >= policy.minimumServerOverheadMs);
    assert.ok(policy.browserMs - policy.serverActionMaxMs >= policy.minimumBrowserOverheadMs);
    assert.equal(policy.serverActionMaxMs, policy.serverActionMaxDurationSeconds * 1000);
  });

  it('applies the same bounded lifecycle-derived policy to every Standard operation', () => {
    assert.deepEqual(MATCHMAKING_OPERATIONS, ['join', 'reconnect', 'current_ticket', 'cancel']);
    for (const operation of MATCHMAKING_OPERATIONS) {
      assert.equal(matchmakingDeadlinePolicyFor(operation), MATCHMAKING_DEADLINE_POLICY);
      assert.ok(matchmakingDeadlinePolicyFor(operation).browserMs < Number.POSITIVE_INFINITY);
    }
  });

  it('behaviorally schedules the API proxy deadline for join, reconnect, current-ticket, and cancel', async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const scheduled: number[] = [];
    globalThis.fetch = async () => new Response(null, {
      status: 204,
      headers: { 'x-request-id': 'ticket-146-test' },
    });
    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      scheduled.push(Number(timeout));
      return originalSetTimeout(handler, timeout, ...args);
    }) as typeof globalThis.setTimeout;
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:1';

    try {
      await createStandard1v1Ticket({
        clientRequestId: 'ticket-146-join',
        mode: 'standard_1v1',
        rated: true,
      });
      await getCurrentStandard1v1Ticket();
      await getStandard1v1Ticket('ticket-146-current');
      await cancelStandard1v1Ticket('ticket-146-cancel');
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
      if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }

    assert.deepEqual(
      scheduled.filter((milliseconds) => milliseconds === MATCHMAKING_DEADLINE_POLICY.apiProxyMs),
      [95_000, 95_000, 95_000, 95_000],
    );
  });

  it('behaviorally schedules the bounded browser deadline for every Standard operation', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const scheduled: number[] = [];
    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      scheduled.push(Number(timeout));
      return originalSetTimeout(handler, 0, ...args);
    }) as typeof globalThis.setTimeout;

    try {
      for (const operation of MATCHMAKING_OPERATIONS) {
        await assert.rejects(
          runMatchmakingOperationWithDeadline(operation, new Promise<never>(() => undefined)),
          /timed out/,
        );
      }
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }

    assert.deepEqual(scheduled, [110_000, 110_000, 110_000, 110_000]);
  });

  it('keeps the statically analyzable Next route maximum equal to the policy', () => {
    const playPage = readFileSync(new URL('../app/play/page.tsx', import.meta.url), 'utf8');
    const maxDurationMatch = /^export const maxDuration = (\d+);$/m.exec(playPage);
    assert.ok(maxDurationMatch);
    assert.equal(Number(maxDurationMatch[1]), MATCHMAKING_DEADLINE_POLICY.serverActionMaxDurationSeconds);
  });
});
