import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, it } from 'node:test';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StandardDictionaryService } from '../src/dictionary/standard-dictionary.service.ts';
import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';
import { SpeedExpiryAdjudicationService } from '../src/gameplay/speed-expiry-adjudication.service.ts';
import {
  classifySpeedReconcilerError,
  SpeedExpiryReconciliationService,
} from '../src/gameplay/speed-expiry-reconciliation.service.ts';
import { SpeedExpiryReconcilerService } from '../src/gameplay/speed-expiry-reconciler.service.ts';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import { SpeedLifecycleActivationService } from '../src/gameplay/speed-lifecycle-activation.service.ts';
import { SpeedLifecycleCapabilityService } from '../src/gameplay/speed-lifecycle-capability.service.ts';
import { SpeedReconcilerRuntimeModule } from '../src/gameplay/speed-reconciler-runtime.module.ts';
import { SpeedRuntimeHealthService } from '../src/gameplay/speed-runtime-health.service.ts';
import { HealthController } from '../src/health/health.controller.ts';
import { ReadinessService } from '../src/health/readiness.service.ts';
import { RedisReadinessService } from '../src/health/redis-readiness.service.ts';
import { SpeedOperationalReadinessService } from '../src/health/speed-operational-readiness.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';

const originalSpeedFlag = process.env.SPEED_1V1_QUEUE_ENABLED;

afterEach(() => {
  if (originalSpeedFlag === undefined) delete process.env.SPEED_1V1_QUEUE_ENABLED;
  else process.env.SPEED_1V1_QUEUE_ENABLED = originalSpeedFlag;
});

function emptyTransactionPrisma() {
  const tx = {
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async () => [],
  };
  return {
    client: {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => await callback(tx),
    },
  };
}

describe('Ticket 213 dependency-minimal reconciler composition', () => {
  it('resolves and runs the production runtime module without product/provider/http dependencies', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    const moduleRef = await Test.createTestingModule({ imports: [SpeedReconcilerRuntimeModule] })
      .overrideProvider(PrismaService)
      .useValue(emptyTransactionPrisma())
      .compile();
    await moduleRef.init();
    try {
      const worker = moduleRef.get(SpeedExpiryReconcilerService, { strict: false });
      for (let attempt = 0; attempt < 20 && worker.metrics().caughtUpPasses < 1; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      assert.equal(worker.metrics().caughtUpPasses, 1);
      assert.equal(worker.isReady(), true);
      for (const forbidden of [
        SpeedGameplayService,
        GameplayPersistenceService,
        SpeedOperationalReadinessService,
        StandardDictionaryService,
        SpeedLifecycleActivationService,
        SpeedLifecycleCapabilityService,
        RedisReadinessService,
        ReadinessService,
        HealthController,
      ]) {
        assert.throws(() => moduleRef.get(forbidden, { strict: false }));
      }
    } finally {
      await moduleRef.close();
    }
  });

  it('locks the production reconciliation input to fixed batching and completion ownership only', async () => {
    const source = await readFile(new URL('../src/gameplay/speed-expiry-reconciliation.service.ts', import.meta.url), 'utf8');
    const input = source.match(/export type SpeedReconcileDueInput[\s\S]*?\n}>;/)?.[0];
    assert.ok(input);
    assert.match(input, /batchSize/);
    assert.match(input, /selectionLimit/);
    assert.match(input, /completionGuard/);
    assert.doesNotMatch(input, /authoritativeClockSql|reconcileMatch|beforeCommit|SQL|callback/i);

    const workerSource = await readFile(new URL('../src/gameplay/speed-expiry-reconciler.service.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(workerSource, /SpeedGameplayService|GameplayPersistenceService|SpeedOperationalReadinessService|StandardDictionaryService|RedisReadinessService/);
  });
});

describe('Ticket 213 sanitized reconciler observability', () => {
  it('classifies every allowlisted error class without inspecting raw messages', () => {
    const cases = [
      [{ code: 'P1001', message: 'postgresql://credential' }, 'connection'],
      [{ code: 'P2034', message: 'select secret' }, 'serialization'],
      [{ code: '40001', message: 'direct serialization details' }, 'serialization'],
      [{ meta: { code: '40001' }, message: 'serialization details' }, 'serialization'],
      [{ code: '40P01', message: 'direct deadlock details' }, 'deadlock'],
      [{ meta: { code: '40P01' }, message: 'deadlock details' }, 'deadlock'],
      [{ code: '55P03', message: 'direct lock details' }, 'lock_timeout'],
      [{ meta: { code: '55P03' }, message: 'lock details' }, 'lock_timeout'],
      [{ code: '57014', message: 'direct statement details' }, 'statement_timeout'],
      [{ meta: { code: '57014' }, message: 'statement details' }, 'statement_timeout'],
      [{ code: 'obsolete_speed_reconciler_pass', message: 'match-private' }, 'obsolete_pass'],
      [{ code: 'MALICIOUS_RAW_CODE', message: 'postgresql://user:pass@private/answer' }, 'unknown'],
    ] as const;
    for (const [error, expected] of cases) assert.equal(classifySpeedReconcilerError(error), expected);
  });

  it('records bounded transaction and fixed pass metrics with no raw error leakage', async () => {
    const times = [100, 145];
    const reconciliation = new SpeedExpiryReconciliationService(
      emptyTransactionPrisma() as any,
      { reconcileMatch: async () => {} } as unknown as SpeedExpiryAdjudicationService,
      undefined,
      () => times.shift() ?? 145,
    );
    const result = await reconciliation.reconcileDue({ batchSize: 10, selectionLimit: 11, completionGuard: () => true });
    assert.deepEqual(result, { selected: 0, processed: 0, hasMore: false });
    assert.deepEqual(reconciliation.observation(), { transactionDurationMs: 45, lastErrorClass: null });

    let now = 0;
    const runtime = new SpeedRuntimeHealthService(() => now);
    const poisoned = {
      reconcileDue: async () => {
        throw { code: 'MALICIOUS_RAW_CODE', message: 'SELECT answer FROM private postgresql://user:pass@host' };
      },
      observation: () => ({ transactionDurationMs: 37, lastErrorClass: 'unknown' }),
    };
    const worker = new SpeedExpiryReconcilerService(poisoned as any, runtime);
    const epoch = runtime.markSchedulerStarted();
    (worker as any).schedulerEpoch = epoch;
    await worker.tick();
    now = 1;
    const metrics = worker.metrics();
    assert.equal(metrics.lastErrorClass, 'unknown');
    assert.equal(metrics.errorCounts.unknown, 1);
    assert.equal(metrics.gauges.speed_reconciler_transaction_duration_ms, 37);
    assert.equal(metrics.counters.speed_reconciler_pass_failed_total, 1);
    const serialized = JSON.stringify(metrics);
    assert.doesNotMatch(serialized, /SELECT|answer|postgresql|user:pass|host|MALICIOUS_RAW_CODE/i);
  });

  it('serves Speed-only degradation through the HTTP readiness envelope without a core outage', async () => {
    const readiness = {
      getReadiness: async () => ({
        status: 'degraded',
        service: 'wordle-royale-api',
        checkedAt: new Date().toISOString(),
        dependencies: {
          database: { status: 'ok' },
          applicationSchema: { status: 'ok' },
          standardDictionary: { status: 'ok' },
          speedRuntime: { status: 'unavailable' },
        },
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ReadinessService, useValue: readiness }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const response = await request(app.getHttpServer()).get('/readyz').expect(200);
      assert.equal(response.body.data.status, 'degraded');
      assert.equal(response.body.data.dependencies.speedRuntime.status, 'unavailable');
      assert.equal(response.body.data.dependencies.database.status, 'ok');
    } finally {
      await app.close();
    }
  });
});
