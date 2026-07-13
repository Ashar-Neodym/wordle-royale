import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ReadinessService } from '../src/health/readiness.service.ts';

const originalQueueSetting = process.env.STANDARD_1V1_QUEUE_ENABLED;

afterEach(() => {
  if (originalQueueSetting === undefined) delete process.env.STANDARD_1V1_QUEUE_ENABLED;
  else process.env.STANDARD_1V1_QUEUE_ENABLED = originalQueueSetting;
});

function dependency(status: 'ok' | 'unavailable' | 'not_checked_stub' = 'ok') {
  return { status, checkedAt: new Date().toISOString() };
}

function createReadiness({ database = 'ok', schema = 'ok', dictionary = 'ok' }:
  { database?: 'ok' | 'unavailable'; schema?: 'ok' | 'unavailable'; dictionary?: 'ok' | 'unavailable' } = {}) {
  const calls = { dictionary: 0 };
  const prisma = {
    checkDatabase: async () => dependency(database),
    checkApplicationSchema: async () => dependency(schema),
  };
  const dictionaryService = {
    checkStandardDictionary: async () => {
      calls.dictionary += 1;
      return dependency(dictionary);
    },
  };
  const redis = { checkRedis: async () => dependency('not_checked_stub') };
  return { service: new ReadinessService(prisma as any, dictionaryService as any, redis as any), calls };
}

describe('Standard dictionary readiness', () => {
  it('is blocking while the queue is enabled', async () => {
    delete process.env.STANDARD_1V1_QUEUE_ENABLED;
    const healthy = createReadiness();
    assert.equal((await healthy.service.getReadiness()).dependencies.standardDictionary!.status, 'ok');

    const missing = createReadiness({ dictionary: 'unavailable' });
    const result = await missing.service.getReadiness();
    assert.equal(result.dependencies.standardDictionary!.status, 'unavailable');
    assert.equal(result.status, 'unavailable');
  });

  it('is non-blocking and not queried while the queue is disabled', async () => {
    process.env.STANDARD_1V1_QUEUE_ENABLED = 'false';
    const readiness = createReadiness({ dictionary: 'unavailable' });
    const result = await readiness.service.getReadiness();
    assert.equal(result.dependencies.standardDictionary!.status, 'not_checked_stub');
    assert.equal(result.status, 'ok');
    assert.equal(readiness.calls.dictionary, 0);
  });

  it('fails safely without querying dictionary tables when database or schema is unavailable', async () => {
    delete process.env.STANDARD_1V1_QUEUE_ENABLED;
    for (const options of [{ database: 'unavailable' as const }, { schema: 'unavailable' as const }]) {
      const readiness = createReadiness(options);
      const result = await readiness.service.getReadiness();
      assert.equal(result.dependencies.standardDictionary!.status, 'unavailable');
      assert.equal(result.status, 'unavailable');
      assert.equal(readiness.calls.dictionary, 0);
      assert.doesNotMatch(result.dependencies.standardDictionary!.message ?? '', /postgres|sql|database_url|prisma/i);
    }
  });
});
