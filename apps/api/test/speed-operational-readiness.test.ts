import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { LeaderboardReadService } from '../src/leaderboard/leaderboard-read.service.ts';
import { SpeedOperationalReadinessService } from '../src/health/speed-operational-readiness.service.ts';
import { SpeedRuntimeHealthService } from '../src/gameplay/speed-runtime-health.service.ts';
import { SpeedExpiryReconcilerService } from '../src/gameplay/speed-expiry-reconciler.service.ts';

const previous = process.env.SPEED_1V1_QUEUE_ENABLED;

afterEach(() => {
  if (previous === undefined) delete process.env.SPEED_1V1_QUEUE_ENABLED;
  else process.env.SPEED_1V1_QUEUE_ENABLED = previous;
});

function dependency(status: 'ok' | 'unavailable') {
  return { status, checkedAt: new Date().toISOString() };
}

function createService(input: { database?: 'ok' | 'unavailable'; schema?: 'ok' | 'unavailable'; dictionary?: 'ok' | 'unavailable'; reconciler?: boolean } = {}) {
  process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
  const runtime = new SpeedRuntimeHealthService();
  const epoch = runtime.markSchedulerStarted();
  const pass = runtime.markPassStarted(epoch)!;
  if (input.reconciler ?? true) runtime.markPassSucceeded(pass);
  else runtime.markPassFailed(pass);
  return new SpeedOperationalReadinessService({
    checkDatabase: async () => dependency(input.database ?? 'ok'),
    checkApplicationSchema: async () => dependency(input.schema ?? 'ok'),
    checkSpeedReadyLifecycleSchema: async () => dependency(input.schema ?? 'ok'),
  } as any, {
    checkStandardDictionary: async () => dependency(input.dictionary ?? 'ok'),
  } as any, runtime);
}

describe('Ticket 166 Speed operational readiness', () => {
  it('keeps Speed-specific lifecycle checks isolated when Speed is disabled', async () => {
    delete process.env.SPEED_1V1_QUEUE_ENABLED;
    let dependencyChecks = 0;
    const readiness = new SpeedOperationalReadinessService({
      checkDatabase: async () => { dependencyChecks += 1; return dependency('ok'); },
      checkApplicationSchema: async () => { dependencyChecks += 1; return dependency('ok'); },
      checkSpeedReadyLifecycleSchema: async () => { dependencyChecks += 1; return dependency('unavailable'); },
    } as any, {
      checkStandardDictionary: async () => { dependencyChecks += 1; return dependency('ok'); },
    } as any, new SpeedRuntimeHealthService());

    assert.deepEqual((await readiness.check()).reason, 'feature_disabled');
    assert.equal(dependencyChecks, 0);
    const catalog = new LeaderboardReadService({ client: {} } as any, readiness);
    const modes = await catalog.listRankedModes();
    assert.equal(modes.modes.find((mode) => mode.id === 'standard_1v1')?.enabled, true);
    assert.equal(modes.modes.find((mode) => mode.id === 'speed_1v1')?.enabled, false);
  });

  it('fails closed for each required dependency with one stable public error', async () => {
    for (const input of [
      { database: 'unavailable' as const },
      { schema: 'unavailable' as const },
      { dictionary: 'unavailable' as const },
      { reconciler: false },
    ]) {
      const service = createService(input);
      assert.equal((await service.check()).available, false);
      await assert.rejects(service.assertAvailable(), (error: any) => {
        assert.deepEqual(error?.response, {
          code: 'speed_1v1_unavailable',
          message: 'Speed 1v1 is temporarily unavailable. Retry later.',
        });
        return true;
      });
    }
  });

  it('keeps the catalog disabled when the flag is on but operational readiness is false', async () => {
    const readiness = createService({ dictionary: 'unavailable' });
    const catalog = new LeaderboardReadService({ client: {} } as any, readiness);
    const speed = (await catalog.listRankedModes()).modes.find((mode) => mode.id === 'speed_1v1');
    assert.equal(speed?.enabled, true);
    assert.equal(speed?.queueEnabled, false);
    assert.equal(speed?.rulesetVersion, 'speed_1v1_v1_75s');
    assert.equal(speed?.ratingAlgorithmConfigVersion, 'speed_1v1_glicko_v1');
    assert.equal(speed?.timeControl?.roundTimeSeconds, 75);
    assert.equal(speed?.timeControl?.tieBreaker, 'server_solve_time_bucket');
  });

  it('reports live only when flag, database, schema, dictionary, and reconciler are ready', async () => {
    const readiness = createService();
    assert.deepEqual((await readiness.check()).available, true);
    const catalog = new LeaderboardReadService({ client: {} } as any, readiness);
    const speed = (await catalog.listRankedModes()).modes.find((mode) => mode.id === 'speed_1v1');
    assert.equal(speed?.enabled, true);
    assert.equal(speed?.queueEnabled, true);
  });

  it('marks reconciler health ready only after success and clears it after a failure', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    const runtime = new SpeedRuntimeHealthService();
    let fail = true;
    const reconciler = new SpeedExpiryReconcilerService({
      reconcileDue: async () => {
        if (fail) throw new Error('transient reconciliation failure');
        return 0;
      },
    } as any, runtime);
    reconciler.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(runtime.isReconcilerReady(), false);
    fail = false;
    await reconciler.tick();
    assert.equal(runtime.isReconcilerReady(), true);
    fail = true;
    await reconciler.tick();
    assert.equal(runtime.isReconcilerReady(), false);
    reconciler.onModuleDestroy();
  });
});
