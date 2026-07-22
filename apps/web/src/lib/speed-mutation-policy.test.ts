import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SPEED_MUTATION_POLICY,
  raceSpeedOperation,
  runSpeedBrowserMutation,
} from './speed-mutation-policy.ts';

describe('hosted Speed mutation budgets', () => {
  it('preserves strict lifecycle-derived margins and useful early recovery', () => {
    const policy = SPEED_MUTATION_POLICY;
    assert.deepEqual(policy, {
      backendLifecycleMs: 24_000,
      apiProxyMs: 26_000,
      serverActionMs: 30_000,
      browserEnvelopeMs: 35_000,
      softUncertainMs: 8_000,
      recoveryReadTimeoutMs: 12_000,
      recoveryReadAttempts: 2,
      recoveryRetryDelayMs: 250,
    });
    assert.ok(policy.backendLifecycleMs < policy.apiProxyMs);
    assert.ok(policy.apiProxyMs < policy.serverActionMs);
    assert.ok(policy.serverActionMs < policy.browserEnvelopeMs);
    assert.ok(policy.softUncertainMs + policy.recoveryReadTimeoutMs * policy.recoveryReadAttempts + policy.recoveryRetryDelayMs < policy.browserEnvelopeMs);
  });

  it('starts one read-only recovery at the soft threshold while the POST remains single-flight', async () => {
    let settleMutation!: (value: string) => void;
    const mutation = new Promise<string>((resolve) => { settleMutation = resolve; });
    const timers: Array<{ ms: number; callback: () => void }> = [];
    const cleared: unknown[] = [];
    let mutationCalls = 0;
    let recoveryCalls = 0;
    let uncertainCalls = 0;

    const resultPromise = runSpeedBrowserMutation({
      mutate: () => { mutationCalls += 1; return mutation; },
      recover: async () => { recoveryCalls += 1; },
      onSoftUncertain: () => { uncertainCalls += 1; },
      schedule: (callback, ms) => { const timer = { callback, ms }; timers.push(timer); return timer; },
      cancel: (timer) => { cleared.push(timer); },
    });

    assert.deepEqual(timers.map(({ ms }) => ms), [8_000, 35_000]);
    timers[0]?.callback();
    await Promise.resolve();
    assert.equal(mutationCalls, 1);
    assert.equal(recoveryCalls, 1);
    assert.equal(uncertainCalls, 1);

    settleMutation('confirmed');
    assert.deepEqual(await resultPromise, { kind: 'settled', value: 'confirmed' });
    assert.equal(mutationCalls, 1);
    assert.equal(cleared.length, 2);
  });

  it('returns uncertainty at the browser envelope without replaying or cancelling the original mutation', async () => {
    const timers: Array<{ ms: number; callback: () => void }> = [];
    let calls = 0;
    let settle!: (value: string) => void;
    const resultPromise = runSpeedBrowserMutation({
      mutate: async () => { calls += 1; return await new Promise<string>((resolve) => { settle = resolve; }); },
      recover: async () => undefined,
      onSoftUncertain: () => undefined,
      schedule: (callback, ms) => { const timer = { callback, ms }; timers.push(timer); return timer; },
      cancel: () => undefined,
    });
    timers.find(({ ms }) => ms === 35_000)?.callback();
    const outcome = await resultPromise;
    assert.equal(outcome.kind, 'timed_out');
    assert.equal(calls, 1);
    if (outcome.kind !== 'timed_out') throw new Error('expected browser uncertainty');
    let postSettled = false;
    void outcome.settlement.then(() => { postSettled = true; });
    await Promise.resolve();
    assert.equal(postSettled, false, 'browser uncertainty is independent from POST settlement');
    settle('late confirmation');
    assert.deepEqual(await outcome.settlement, { status: 'fulfilled', value: 'late confirmation' });
  });

  it('bounds a server action independently without replaying its operation', async () => {
    const timers: Array<{ ms: number; callback: () => void }> = [];
    let calls = 0;
    const resultPromise = raceSpeedOperation(
      () => { calls += 1; return new Promise<string>(() => undefined); },
      30_000,
      (callback, ms) => { const timer = { callback, ms }; timers.push(timer); return timer; },
      () => undefined,
    );
    timers[0]?.callback();
    assert.equal((await resultPromise).kind, 'timed_out');
    assert.equal(calls, 1);
  });
});
