import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { EventEmitter } from 'node:events';
import type { INestApplication } from '@nestjs/common';
import { createCachedHandler } from '../api/index.ts';
import { validateRuntimeConfig } from '../src/config/runtime-config.ts';
import { SpeedExpiryReconcilerService } from '../src/gameplay/speed-expiry-reconciler.service.ts';
import { SpeedLifecycleCapabilityService } from '../src/gameplay/speed-lifecycle-capability.service.ts';
import { speedQueueEnabled, standardQueueEnabled } from '../src/matchmaking/matchmaking-config.ts';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

describe('serverless API runtime', () => {
  for (const event of ['finish', 'close'] as const) {
    it(`removes every response listener after ${event}`, async () => {
      process.env.API_RUNTIME_MODE = 'serverless';
      const response = new EventEmitter();
      const application = {
        getHttpAdapter: () => ({ getInstance: () => () => response.emit(event) }),
      } as unknown as INestApplication;

      await createCachedHandler(async () => application)({} as never, response as never);

      assert.deepEqual(
        ['finish', 'close', 'error'].map((name) => response.listenerCount(name)),
        [0, 0, 0],
      );
    });
  }

  it('removes every response listener after an asynchronous response error', async () => {
    process.env.API_RUNTIME_MODE = 'serverless';
    const response = new EventEmitter();
    const application = {
      getHttpAdapter: () => ({ getInstance: () => () => response.emit('error', new Error('hostile error')) }),
    } as unknown as INestApplication;

    await assert.rejects(createCachedHandler(async () => application)({} as never, response as never), /hostile error/);
    assert.deepEqual(['finish', 'close', 'error'].map((name) => response.listenerCount(name)), [0, 0, 0]);
  });

  it('removes every response listener when Express throws synchronously', async () => {
    process.env.API_RUNTIME_MODE = 'serverless';
    const response = new EventEmitter();
    const application = {
      getHttpAdapter: () => ({ getInstance: () => () => { throw new Error('hostile throw'); } }),
    } as unknown as INestApplication;

    await assert.rejects(createCachedHandler(async () => application)({} as never, response as never), /hostile throw/);
    assert.deepEqual(['finish', 'close', 'error'].map((name) => response.listenerCount(name)), [0, 0, 0]);
  });

  it('caches one cold bootstrap and reuses it for warm and concurrent invocations', async () => {
    process.env.API_RUNTIME_MODE = 'serverless';
    let bootstraps = 0;
    const requests: unknown[] = [];
    const application = {
      getHttpAdapter: () => ({
        getInstance: () => (request: unknown, response: EventEmitter) => { requests.push(request); response.emit('finish'); },
      }),
    } as unknown as INestApplication;
    const handler = createCachedHandler(async () => {
      bootstraps += 1;
      await Promise.resolve();
      return application;
    });
    const first = {};
    const second = {};
    await Promise.all([handler(first as never, new EventEmitter() as never), handler(second as never, new EventEmitter() as never)]);
    await handler({} as never, new EventEmitter() as never);
    assert.equal(bootstraps, 1);
    assert.equal(requests.length, 3);
  });

  it('retries bootstrap after a cold-start failure instead of caching rejection', async () => {
    process.env.API_RUNTIME_MODE = 'serverless';
    let bootstraps = 0;
    const application = { getHttpAdapter: () => ({ getInstance: () => (_request: unknown, response: EventEmitter) => response.emit('finish') }) } as unknown as INestApplication;
    const handler = createCachedHandler(async () => {
      bootstraps += 1;
      if (bootstraps === 1) throw new Error('cold failure');
      return application;
    });
    await assert.rejects(handler({} as never, new EventEmitter() as never), /cold failure/);
    await handler({} as never, new EventEmitter() as never);
    assert.equal(bootstraps, 2);
  });

  it('fails closed before bootstrap when the dedicated entrypoint is not explicitly serverless', async () => {
    delete process.env.API_RUNTIME_MODE;
    let bootstraps = 0;
    const handler = createCachedHandler(async () => { bootstraps += 1; throw new Error('must not bootstrap'); });
    await assert.rejects(handler({} as never, new EventEmitter() as never), /requires API_RUNTIME_MODE=serverless/);
    assert.equal(bootstraps, 0);
  });

  it('does not schedule a reconciler timer or capability heartbeat/lease in serverless mode', async () => {
    process.env.API_RUNTIME_MODE = 'serverless';
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    let reconciliationCalls = 0;
    const reconciler = new SpeedExpiryReconcilerService(
      { reconcileDue: async () => { reconciliationCalls += 1; return { processed: 0, hasMore: false }; } } as never,
      {
        markSchedulerStarted: () => { throw new Error('scheduler started'); },
        snapshot: () => ({
          state: 'stopped', schedulerEpoch: null, passGeneration: 0, inFlight: false,
          lastStartedAt: null, lastCompletedAt: null, lastSuccessAt: null, lastDurationMs: null,
        }),
      } as never,
    );
    const originalSetInterval = globalThis.setInterval;
    const originalSetTimeout = globalThis.setTimeout;
    let timerCalls = 0;
    globalThis.setInterval = (() => { timerCalls += 1; throw new Error('interval scheduled'); }) as unknown as typeof setInterval;
    globalThis.setTimeout = (() => { timerCalls += 1; throw new Error('timeout scheduled'); }) as unknown as typeof setTimeout;
    try {
      reconciler.onModuleInit();

      let leaseCalls = 0;
      const capability = new SpeedLifecycleCapabilityService({
        client: { $executeRawUnsafe: async () => { leaseCalls += 1; } },
      } as never);
      await capability.onModuleInit();

      assert.equal(reconciliationCalls, 0);
      assert.equal(leaseCalls, 0);
      assert.equal(timerCalls, 0);
      assert.equal(reconciler.metrics().passStarted, 0);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('keeps Standard enabled while Speed fails closed in serverless mode', () => {
    process.env.API_RUNTIME_MODE = 'serverless';
    delete process.env.STANDARD_1V1_QUEUE_ENABLED;
    delete process.env.SPEED_1V1_QUEUE_ENABLED;
    assert.equal(standardQueueEnabled(), true);
    assert.equal(speedQueueEnabled(), false);

    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    assert.equal(speedQueueEnabled(), false);
  });

  it('rejects unsafe serverless Speed lifecycle and fixed-replica combinations', () => {
    assert.throws(
      () => validateRuntimeConfig({ API_RUNTIME_MODE: 'serverless', SPEED_1V1_QUEUE_ENABLED: 'true' }),
      /SPEED_1V1_QUEUE_ENABLED must be false in serverless mode/,
    );
    assert.throws(
      () => validateRuntimeConfig({ API_RUNTIME_MODE: 'serverless', SPEED_LIFECYCLE_RELEASE_ID: 'release' }),
      /capability leases are forbidden/,
    );
    assert.throws(
      () => validateRuntimeConfig({ API_RUNTIME_MODE: 'serverless', EXPECTED_API_REPLICA_COUNT: '1' }),
      /must be unset in serverless mode/,
    );
    assert.throws(() => validateRuntimeConfig({ API_RUNTIME_MODE: 'edge' }), /exactly server or serverless/);
  });
});
