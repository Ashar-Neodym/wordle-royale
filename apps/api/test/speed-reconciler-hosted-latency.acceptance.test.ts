import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { LeaderboardReadService } from '../src/leaderboard/leaderboard-read.service.ts';
import { SpeedOperationalReadinessService } from '../src/health/speed-operational-readiness.service.ts';
import { SpeedExpiryReconcilerService } from '../src/gameplay/speed-expiry-reconciler.service.ts';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import { SpeedRuntimeHealthService } from '../src/gameplay/speed-runtime-health.service.ts';

const ARCHITECTURE = Object.freeze({
  runtimeIdentity: 'speed_reconciler_runtime_v2_dependency_minimal_10s',
  intervalMs: 1_000,
  batchSize: 10,
  selectionLimit: 11,
  maxWaitMs: 1_000,
  lockTimeoutMs: 1_000,
  statementTimeoutMs: 7_000,
  transactionTimeoutMs: 8_000,
  maxPassMs: 10_000,
  successFreshnessMs: 12_000,
  passReserveMs: 1_000,
  maximumPassiveExpiryLatenessMs: 11_000,
});
const HOSTED_OBSERVED_DEPENDENCY_LATENCY_MS = 4_400;
const previousQueueFlag = process.env.SPEED_1V1_QUEUE_ENABLED;

const caughtUp = (processed = 0) => ({ selected: processed, processed, hasMore: false });

afterEach(() => {
  if (previousQueueFlag === undefined) delete process.env.SPEED_1V1_QUEUE_ENABLED;
  else process.env.SPEED_1V1_QUEUE_ENABLED = previousQueueFlag;
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(reconcileDue: (...args: any[]) => Promise<any>) {
  let now = 0;
  const runtime = new SpeedRuntimeHealthService(() => now);
  const reconciler = new SpeedExpiryReconcilerService({ reconcileDue } as any, runtime);
  const epoch = runtime.markSchedulerStarted();
  (reconciler as any).schedulerEpoch = epoch;
  return {
    runtime,
    reconciler,
    advance: (milliseconds: number) => { now += milliseconds; },
    restart: () => {
      reconciler.onModuleDestroy();
      const nextEpoch = runtime.markSchedulerStarted();
      (reconciler as any).schedulerEpoch = nextEpoch;
      return nextEpoch;
    },
    stop: () => reconciler.onModuleDestroy(),
  };
}

function guardFrom(args: any[]): () => boolean {
  if (typeof args[0]?.completionGuard === 'function') return args[0].completionGuard;
  if (typeof args[1] === 'function') return args[1];
  throw new Error('missing reconciler completion guard');
}

function dependency(status: 'ok' | 'unavailable') {
  return { status, checkedAt: new Date().toISOString() };
}

function createGameplayHarness() {
  let operationalChecks = 0;
  let transactionOptions: Record<string, unknown> | undefined;
  const sql: string[] = [];
  const queryArguments: unknown[][] = [];
  const tx = {
    $executeRawUnsafe: async (statement: string, ...args: unknown[]) => {
      sql.push(statement);
      queryArguments.push(args);
      return 0;
    },
    $queryRawUnsafe: async (statement: string, ...args: unknown[]) => {
      sql.push(statement);
      queryArguments.push(args);
      return [];
    },
  };
  const gameplay = new SpeedGameplayService({
    client: {
      $transaction: async (callback: (client: any) => Promise<unknown>, options: Record<string, unknown>) => {
        transactionOptions = options;
        return await callback(tx);
      },
    },
  } as any, {} as any, {
    assertDependenciesAvailable: async () => { operationalChecks += 1; },
  } as any);
  return {
    gameplay,
    sql,
    queryArguments,
    transactionOptions: () => transactionOptions,
    operationalChecks: () => operationalChecks,
  };
}

async function reconcileEmpty(gameplay: SpeedGameplayService) {
  return await (gameplay as any).reconcileDue({
    batchSize: ARCHITECTURE.batchSize,
    selectionLimit: ARCHITECTURE.selectionLimit,
    completionGuard: () => true,
  });
}

describe('Ticket 209 reconciled hosted-latency RED acceptance matrix', () => {
  it('RED: exports the exact Ticket 208 fixed budget contract from one production module', async () => {
    let budget: Record<string, unknown> | null = null;
    try {
      budget = await import('../src/gameplay/' + 'speed-reconciler-budget.ts') as Record<string, unknown>;
    } catch {
      // The missing module is the expected pre-Ticket-210 RED state.
    }
    assert.ok(budget, 'speed-reconciler-budget.ts must own the fixed Ticket 208 constants');
    assert.deepEqual({
      runtimeIdentity: budget.SPEED_RECONCILER_RUNTIME_IDENTITY,
      intervalMs: budget.SPEED_RECONCILER_INTERVAL_MS,
      batchSize: budget.SPEED_RECONCILER_BATCH_SIZE,
      selectionLimit: budget.SPEED_RECONCILER_SELECTION_LIMIT,
      maxWaitMs: budget.SPEED_RECONCILER_MAX_WAIT_MS,
      lockTimeoutMs: budget.SPEED_RECONCILER_LOCK_TIMEOUT_MS,
      statementTimeoutMs: budget.SPEED_RECONCILER_STATEMENT_TIMEOUT_MS,
      transactionTimeoutMs: budget.SPEED_RECONCILER_TRANSACTION_TIMEOUT_MS,
      maxPassMs: budget.SPEED_RECONCILER_MAX_PASS_MS,
      successFreshnessMs: budget.SPEED_RECONCILER_SUCCESS_FRESHNESS_MS,
      passReserveMs: budget.SPEED_RECONCILER_PASS_RESERVE_MS,
    }, {
      runtimeIdentity: ARCHITECTURE.runtimeIdentity,
      intervalMs: ARCHITECTURE.intervalMs,
      batchSize: ARCHITECTURE.batchSize,
      selectionLimit: ARCHITECTURE.selectionLimit,
      maxWaitMs: ARCHITECTURE.maxWaitMs,
      lockTimeoutMs: ARCHITECTURE.lockTimeoutMs,
      statementTimeoutMs: ARCHITECTURE.statementTimeoutMs,
      transactionTimeoutMs: ARCHITECTURE.transactionTimeoutMs,
      maxPassMs: ARCHITECTURE.maxPassMs,
      successFreshnessMs: ARCHITECTURE.successFreshnessMs,
      passReserveMs: ARCHITECTURE.passReserveMs,
    });
  });

  it('locks every Ticket 208 arithmetic invariant and exact lateness formula', () => {
    assert.equal(ARCHITECTURE.selectionLimit, ARCHITECTURE.batchSize + 1);
    assert.ok(ARCHITECTURE.maxWaitMs + ARCHITECTURE.transactionTimeoutMs + ARCHITECTURE.passReserveMs <= ARCHITECTURE.maxPassMs);
    assert.ok(ARCHITECTURE.lockTimeoutMs <= ARCHITECTURE.statementTimeoutMs);
    assert.ok(ARCHITECTURE.statementTimeoutMs < ARCHITECTURE.transactionTimeoutMs);
    assert.ok(ARCHITECTURE.intervalMs > 0);
    assert.ok(ARCHITECTURE.batchSize > 0);
    assert.ok(ARCHITECTURE.successFreshnessMs >= ARCHITECTURE.maxPassMs + ARCHITECTURE.intervalMs);
    assert.equal(ARCHITECTURE.intervalMs + ARCHITECTURE.maxPassMs, ARCHITECTURE.maximumPassiveExpiryLatenessMs);
    for (const backlog of [1, 10, 11, 20, 21, 61]) {
      const expected = ARCHITECTURE.intervalMs
        + Math.ceil(backlog / ARCHITECTURE.batchSize) * ARCHITECTURE.maxPassMs;
      assert.equal(expected, 1_000 + Math.ceil(backlog / 10) * 10_000);
    }
  });

  it('RED: accepts an otherwise successful 4.4s hosted pass inside the exact 10s ownership budget', async () => {
    let h!: ReturnType<typeof harness>;
    h = harness(async (...args) => {
      h.advance(HOSTED_OBSERVED_DEPENDENCY_LATENCY_MS);
      if (!guardFrom(args)()) throw new Error('obsolete_speed_reconciler_pass');
      return caughtUp();
    });
    await h.reconciler.tick();
    assert.equal(h.runtime.isReconcilerReady(), true,
      `the production pass budget must equal ${ARCHITECTURE.maxPassMs}ms and accept ${HOSTED_OBSERVED_DEPENDENCY_LATENCY_MS}ms`);
    h.stop();
  });

  it('RED: removes product-readiness probes from the persisted expiry pass', async () => {
    const h = createGameplayHarness();
    await reconcileEmpty(h.gameplay);
    assert.equal(h.operationalChecks(), 0,
      'reconcileDue must not call SpeedOperationalReadinessService or product dependency probes');
  });

  it('RED: uses the exact finite transaction envelope and PostgreSQL-local safeguards', async () => {
    const h = createGameplayHarness();
    await reconcileEmpty(h.gameplay);
    assert.deepEqual(h.transactionOptions(), {
      isolationLevel: 'Serializable',
      maxWait: ARCHITECTURE.maxWaitMs,
      timeout: ARCHITECTURE.transactionTimeoutMs,
    });
    const normalizedSql = h.sql.join('\n').replace(/\s+/g, ' ').toLowerCase();
    assert.match(normalizedSql, /lock_timeout[^\d]*1000/);
    assert.match(normalizedSql, /statement_timeout[^\d]*7000/);
    assert.match(normalizedSql, /idle_in_transaction_session_timeout[^\d]*8000/);
  });

  it('RED: selects 11, mutates at most 10, and returns the structured caught-up result', async () => {
    const h = createGameplayHarness();
    const result = await reconcileEmpty(h.gameplay);
    assert.deepEqual(result, { selected: 0, processed: 0, hasMore: false });
    assert.ok(h.queryArguments.some((args) => args.includes(ARCHITECTURE.selectionLimit)),
      'the due query must use the 11-row selection limit');
  });

  it('RED: a committed sentinel backlog pass processes 10 but cannot establish readiness', async () => {
    const h = harness(async (...args) => {
      assert.equal(guardFrom(args)(), true);
      return { selected: 11, processed: 10, hasMore: true };
    });
    await h.reconciler.tick();
    assert.equal(h.runtime.isReconcilerReady(), false);
    assert.equal(h.reconciler.metrics().processed, 10);
    h.stop();
  });

  it('RED: self-schedules without setInterval and uses the normal 1s delay after caught-up work', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    const intervalCalls: number[] = [];
    const timeoutDelays: number[] = [];
    const originalSetInterval = globalThis.setInterval;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearInterval = globalThis.clearInterval;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.setInterval = ((_: (...args: any[]) => void, delay?: number) => {
      intervalCalls.push(Number(delay));
      return { unref() {} } as any;
    }) as typeof setInterval;
    globalThis.setTimeout = ((_: (...args: any[]) => void, delay?: number) => {
      timeoutDelays.push(Number(delay));
      return { unref() {} } as any;
    }) as typeof setTimeout;
    globalThis.clearInterval = (() => undefined) as typeof clearInterval;
    globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
    const runtime = new SpeedRuntimeHealthService();
    const reconciler = new SpeedExpiryReconcilerService({ reconcileDue: async () => caughtUp() } as any, runtime);
    try {
      reconciler.onModuleInit();
      await Promise.resolve();
      await Promise.resolve();
      assert.deepEqual(intervalCalls, [], 'setInterval must not own the scheduler lifecycle');
      assert.ok(timeoutDelays.includes(ARCHITECTURE.intervalMs), 'caught-up completion must schedule the next pass after 1000ms');
    } finally {
      reconciler.onModuleDestroy();
      globalThis.setInterval = originalSetInterval;
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearInterval = originalClearInterval;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('RED: accepts empty and due caught-up passes and records exact processed counts', async () => {
    for (const processed of [0, 1, 10]) {
      const h = harness(async (...args) => {
        assert.equal(guardFrom(args)(), true);
        return caughtUp(processed);
      });
      await h.reconciler.tick();
      assert.equal(h.runtime.isReconcilerReady(), true);
      assert.equal(h.reconciler.metrics().processed, processed);
      h.stop();
    }
  });

  it('fails closed beyond 10s or on transaction timeout, then requires a new current-epoch success', async () => {
    let attempt = 0;
    let h!: ReturnType<typeof harness>;
    h = harness(async (...args) => {
      attempt += 1;
      if (attempt === 1) {
        h.advance(ARCHITECTURE.maxPassMs + 1);
        if (!guardFrom(args)()) throw new Error('obsolete_speed_reconciler_pass');
      }
      if (attempt === 2) throw Object.assign(new Error('transaction timeout'), { code: 'P2028' });
      h.advance(1);
      assert.equal(guardFrom(args)(), true);
      return caughtUp();
    });
    await h.reconciler.tick();
    assert.equal(h.runtime.isReconcilerReady(), false);
    await h.reconciler.tick();
    assert.equal(h.runtime.isReconcilerReady(), false);
    await h.reconciler.tick();
    assert.equal(h.runtime.isReconcilerReady(), true);
    h.stop();
  });

  it('keeps one hung pass in flight, suppresses overlap, and rejects its late completion', async () => {
    const release = deferred<void>();
    let calls = 0;
    let guardedMutations = 0;
    let h!: ReturnType<typeof harness>;
    h = harness(async (...args) => {
      calls += 1;
      await release.promise;
      if (!guardFrom(args)()) throw new Error('obsolete_speed_reconciler_pass');
      guardedMutations += 1;
      return caughtUp(1);
    });
    const first = h.reconciler.tick();
    await Promise.resolve();
    h.advance(ARCHITECTURE.maxPassMs + 1);
    assert.equal(h.runtime.isReconcilerReady(), false);
    await h.reconciler.tick();
    assert.equal(calls, 1);
    release.resolve();
    await first;
    assert.equal(h.runtime.isReconcilerReady(), false);
    assert.equal(guardedMutations, 0);
    assert.equal(h.reconciler.metrics().obsoleteCompletions, 1);
    h.stop();
  });

  it('fences a pre-restart completion and permits health only from the new scheduler epoch', async () => {
    const release = deferred<void>();
    let calls = 0;
    let h!: ReturnType<typeof harness>;
    h = harness(async (...args) => {
      calls += 1;
      if (calls === 1) await release.promise;
      if (!guardFrom(args)()) throw new Error('obsolete_speed_reconciler_pass');
      return caughtUp();
    });
    const old = h.reconciler.tick();
    await Promise.resolve();
    h.restart();
    release.resolve();
    await old;
    assert.equal(h.runtime.isReconcilerReady(), false);
    await h.reconciler.tick();
    assert.equal(h.runtime.isReconcilerReady(), true);
    assert.equal(calls, 2);
    h.stop();
  });

  it('RED: drains finite backlog in bounded 10-row generations without overlap', async () => {
    let remaining = 61;
    let concurrent = 0;
    let maximumConcurrent = 0;
    const h = harness(async (...args) => {
      concurrent += 1;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      const selected = Math.min(ARCHITECTURE.selectionLimit, remaining);
      const processed = Math.min(ARCHITECTURE.batchSize, selected);
      remaining -= processed;
      assert.equal(guardFrom(args)(), true);
      concurrent -= 1;
      return { selected, processed, hasMore: selected > ARCHITECTURE.batchSize };
    });
    for (let generation = 0; generation < 7; generation += 1) await h.reconciler.tick();
    assert.equal(remaining, 0);
    assert.equal(h.reconciler.metrics().processed, 61);
    assert.equal(maximumConcurrent, 1);
    assert.equal(h.runtime.isReconcilerReady(), true);
    h.stop();
  });

  it('RED: keeps success fresh through 12s and stale immediately afterward', () => {
    let now = 0;
    const runtime = new SpeedRuntimeHealthService(() => now);
    const epoch = runtime.markSchedulerStarted();
    const pass = runtime.markPassStarted(epoch)!;
    assert.equal(runtime.markPassSucceeded(pass), true);
    now = ARCHITECTURE.successFreshnessMs;
    assert.equal(runtime.isReconcilerReady(), true);
    now += 1;
    assert.equal(runtime.isReconcilerReady(), false);
  });

  it('keeps Standard available while Speed readiness fails closed', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    const runtime = new SpeedRuntimeHealthService();
    const readiness = new SpeedOperationalReadinessService({
      checkDatabase: async () => dependency('ok'),
      checkApplicationSchema: async () => dependency('ok'),
      checkSpeedReadyLifecycleSchema: async () => dependency('ok'),
    } as any, { checkStandardDictionary: async () => dependency('ok') } as any, runtime);
    const catalog = new LeaderboardReadService({ client: {} } as any, readiness);
    const modes = (await catalog.listRankedModes()).modes;
    assert.equal(modes.find((mode) => mode.id === 'standard_1v1')?.enabled, true);
    assert.equal(modes.find((mode) => mode.id === 'speed_1v1')?.queueEnabled, false);
  });
});
