import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SpeedExpiryReconcilerService } from '../src/gameplay/speed-expiry-reconciler.service.ts';
import {
  SPEED_RECONCILER_MAX_PASS_MS,
  SPEED_RECONCILER_SUCCESS_FRESHNESS_MS,
  SpeedRuntimeHealthService,
} from '../src/gameplay/speed-runtime-health.service.ts';
import { SpeedOperationalReadinessService } from '../src/health/speed-operational-readiness.service.ts';
import { LeaderboardReadService } from '../src/leaderboard/leaderboard-read.service.ts';

const previousFlag = process.env.SPEED_1V1_QUEUE_ENABLED;

afterEach(() => {
  if (previousFlag === undefined) delete process.env.SPEED_1V1_QUEUE_ENABLED;
  else process.env.SPEED_1V1_QUEUE_ENABLED = previousFlag;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

function operational(runtime: SpeedRuntimeHealthService) {
  return new SpeedOperationalReadinessService({
    checkDatabase: async () => ({ status: 'ok' }),
    checkApplicationSchema: async () => ({ status: 'ok' }),
    checkSpeedReadyLifecycleSchema: async () => ({ status: 'ok' }),
  } as any, {
    checkStandardDictionary: async () => ({ status: 'ok' }),
  } as any, runtime);
}

describe('Tickets 172/174 bounded generation-fenced Speed reconciler health', () => {
  it('rejects timed-out completion evidence and requires a new in-budget success', () => {
    let now = 10_000;
    const runtime = new SpeedRuntimeHealthService(() => now);
    const epoch = runtime.markSchedulerStarted();
    const initial = runtime.markPassStarted(epoch)!;
    assert.equal(runtime.markPassSucceeded(initial), true);
    assert.equal(runtime.isReconcilerReady(), true);

    now += SPEED_RECONCILER_SUCCESS_FRESHNESS_MS + 1;
    assert.equal(runtime.isReconcilerReady(), false, 'stale success must fail closed');

    const refresh = runtime.markPassStarted(epoch)!;
    assert.equal(runtime.markPassSucceeded(refresh), true);
    const timedOut = runtime.markPassStarted(epoch)!;
    now += SPEED_RECONCILER_MAX_PASS_MS + 1;
    assert.equal(runtime.isReconcilerReady(), false, 'hung pass must exceed a bounded budget');
    assert.equal(runtime.isPassCompletionEligible(timedOut), false, 'timed-out generation cannot authorize a database commit');
    assert.equal(runtime.markPassSucceeded(timedOut), false, 'timed-out completion is obsolete evidence');
    assert.equal(runtime.isReconcilerReady(), false, 'obsolete completion cannot revive Speed');

    const recovery = runtime.markPassStarted(epoch)!;
    assert.equal(runtime.markPassSucceeded(recovery), true);
    assert.equal(runtime.isReconcilerReady(), true, 'only a new valid pass restores readiness');
    assert.equal(runtime.markSchedulerStopped(epoch), true);
    assert.equal(runtime.isReconcilerReady(), false);
  });

  it('preserves single-flight through timeout and recovers only after obsolete work settles', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    let now = 20_000;
    let behavior: 'success' | 'failure' | 'hang' = 'success';
    let calls = 0;
    const hung = deferred<number>();
    const runtime = new SpeedRuntimeHealthService(() => now);
    const reconciler = new SpeedExpiryReconcilerService({
      reconcileDue: async () => {
        calls += 1;
        if (behavior === 'failure') throw new Error('reconciliation failed');
        if (behavior === 'hang') return await hung.promise;
        return 0;
      },
    } as any, runtime);
    const readiness = operational(runtime);

    reconciler.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await readiness.check()).available, true);

    behavior = 'failure';
    await reconciler.tick();
    assert.equal((await readiness.check()).reason, 'reconciler_unavailable');

    behavior = 'success';
    await reconciler.tick();
    assert.equal((await readiness.check()).available, true);

    behavior = 'hang';
    const pendingTick = reconciler.tick();
    await new Promise((resolve) => setImmediate(resolve));
    const callsAtHang = calls;
    now += SPEED_RECONCILER_MAX_PASS_MS + 1;
    assert.equal((await readiness.check()).reason, 'reconciler_unavailable');
    await reconciler.tick();
    assert.equal(calls, callsAtHang, 'single-flight suppresses overlap while obsolete work is unresolved');

    hung.resolve(0);
    await pendingTick;
    assert.equal((await readiness.check()).reason, 'reconciler_unavailable', 'late obsolete success stays fenced');
    assert.equal(reconciler.metrics().obsoleteCompletions, 1);

    behavior = 'success';
    await reconciler.tick();
    assert.equal((await readiness.check()).available, true, 'a newly started valid pass restores health');

    reconciler.onModuleDestroy();
    assert.equal((await readiness.check()).reason, 'reconciler_unavailable');
  });

  it('treats an over-budget late failure as obsolete and requires a new success', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    let now = 25_000;
    let behavior: 'success' | 'late-failure' = 'success';
    const delayedFailure = deferred<number>();
    const runtime = new SpeedRuntimeHealthService(() => now);
    const reconciler = new SpeedExpiryReconcilerService({
      reconcileDue: async () => behavior === 'late-failure' ? await delayedFailure.promise : 0,
    } as any, runtime);
    const readiness = operational(runtime);

    reconciler.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await readiness.check()).available, true);

    behavior = 'late-failure';
    const pendingTick = reconciler.tick();
    await new Promise((resolve) => setImmediate(resolve));
    now += SPEED_RECONCILER_MAX_PASS_MS + 1;
    delayedFailure.reject(new Error('obsolete delayed failure'));
    await pendingTick;

    const obsoleteMetrics = reconciler.metrics();
    assert.equal((await readiness.check()).reason, 'reconciler_unavailable');
    assert.equal(obsoleteMetrics.obsoleteCompletions, 1);
    assert.equal(obsoleteMetrics.lastErrorAt, null, 'obsolete failure cannot update current-epoch error evidence');

    behavior = 'success';
    await reconciler.tick();
    assert.equal((await readiness.check()).available, true);
    reconciler.onModuleDestroy();
  });

  it('fences old success and failure callbacks across scheduler stop/restart epochs', () => {
    let now = 30_000;
    const runtime = new SpeedRuntimeHealthService(() => now);
    const firstEpoch = runtime.markSchedulerStarted();
    const oldSuccess = runtime.markPassStarted(firstEpoch)!;
    assert.equal(runtime.markSchedulerStopped(firstEpoch), true);

    const secondEpoch = runtime.markSchedulerStarted();
    const current = runtime.markPassStarted(secondEpoch)!;
    assert.equal(runtime.markPassSucceeded(oldSuccess), false, 'old success cannot clear or revive the new epoch');
    assert.equal(runtime.snapshot().passGeneration, current.generation);
    assert.equal(runtime.markPassSucceeded(current), true);
    assert.equal(runtime.isReconcilerReady(), true);

    const oldFailureEpoch = secondEpoch;
    const oldFailure = runtime.markPassStarted(oldFailureEpoch)!;
    assert.equal(runtime.markSchedulerStopped(oldFailureEpoch), true);
    const thirdEpoch = runtime.markSchedulerStarted();
    const thirdPass = runtime.markPassStarted(thirdEpoch)!;
    assert.equal(runtime.markPassFailed(oldFailure), false, 'late old failure cannot corrupt the new epoch');
    assert.equal(runtime.snapshot().passGeneration, thirdPass.generation);
    assert.equal(runtime.markPassSucceeded(thirdPass), true);
    assert.equal(runtime.isReconcilerReady(), true);
  });

  it('does not overlap across stop/restart while obsolete work remains unresolved', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    let calls = 0;
    let behavior: 'hang' | 'success' = 'hang';
    const oldWork = deferred<number>();
    const runtime = new SpeedRuntimeHealthService();
    const reconciler = new SpeedExpiryReconcilerService({
      reconcileDue: async () => {
        calls += 1;
        if (behavior === 'hang') return await oldWork.promise;
        return 0;
      },
    } as any, runtime);

    reconciler.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    reconciler.onModuleDestroy();
    reconciler.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1, 'restart does not overlap unresolved previous-epoch work');

    behavior = 'success';
    oldWork.resolve(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.isReconcilerReady(), false, 'previous-epoch completion remains fenced');
    await reconciler.tick();
    assert.equal(calls, 2);
    assert.equal(runtime.isReconcilerReady(), true);
    reconciler.onModuleDestroy();
  });

  it('keeps Standard available while generation-fenced Speed health is unavailable', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    let now = 40_000;
    const runtime = new SpeedRuntimeHealthService(() => now);
    const epoch = runtime.markSchedulerStarted();
    const pass = runtime.markPassStarted(epoch)!;
    assert.equal(runtime.markPassSucceeded(pass), true);
    now += SPEED_RECONCILER_SUCCESS_FRESHNESS_MS + 1;

    const catalog = new LeaderboardReadService({ client: {} } as any, operational(runtime));
    const modes = (await catalog.listRankedModes()).modes;
    assert.equal(modes.find((mode) => mode.id === 'standard_1v1')?.enabled, true);
    assert.equal(modes.find((mode) => mode.id === 'speed_1v1')?.enabled, true);
    assert.equal(modes.find((mode) => mode.id === 'speed_1v1')?.queueEnabled, false);
  });
});
