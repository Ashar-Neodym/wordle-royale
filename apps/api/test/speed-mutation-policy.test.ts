import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import {
  SPEED_MUTATION_COMPLETION_RESERVE_MS,
  SPEED_MUTATION_EXECUTION_MS,
  SPEED_MUTATION_LIFECYCLE_MS,
  SPEED_MUTATION_MAX_ATTEMPTS,
  SPEED_MUTATION_MAX_WAIT_MS,
  speedMutationAttemptOptions,
  speedMutationRetryDelayMs,
} from '../src/gameplay/speed-mutation-policy.ts';

describe('Ticket 177 finite Speed mutation policy', () => {
  it('locks the shared finite lifecycle and attempt ceilings', () => {
    assert.equal(SPEED_MUTATION_LIFECYCLE_MS, 24_000);
    assert.equal(SPEED_MUTATION_MAX_ATTEMPTS, 3);
    assert.equal(SPEED_MUTATION_COMPLETION_RESERVE_MS, 1_000);
    assert.equal(SPEED_MUTATION_MAX_WAIT_MS, 8_000);
    assert.equal(SPEED_MUTATION_EXECUTION_MS, 12_000);
  });

  it('clamps every transaction envelope to remaining monotonic lifecycle time', () => {
    const full = speedMutationAttemptOptions(24_000);
    assert.ok(full.maxWait <= 8_000);
    assert.ok(full.timeout <= 12_000);
    assert.ok(full.maxWait + full.timeout <= 23_000);

    const constrained = speedMutationAttemptOptions(4_000);
    assert.ok(constrained.maxWait > 0);
    assert.ok(constrained.timeout > 0);
    assert.ok(constrained.maxWait + constrained.timeout <= 3_000);
  });

  it('keeps retry jitter bounded between 50 and 250 milliseconds', () => {
    for (let attempt = 1; attempt <= SPEED_MUTATION_MAX_ATTEMPTS; attempt += 1) {
      for (let sample = 0; sample < 100; sample += 1) {
        const delay = speedMutationRetryDelayMs(attempt);
        assert.ok(delay >= 50 && delay <= 250);
      }
    }
  });

  it('uses exactly three bounded attempts and sanitizes exhausted serialization conflicts', async () => {
    const options: Array<{ maxWait: number; timeout: number }> = [];
    const prisma = {
      client: {
        $transaction: async (_callback: unknown, attemptOptions: { maxWait: number; timeout: number }) => {
          options.push(attemptOptions);
          throw Object.assign(new Error('private database serialization detail'), { code: 'P2034' });
        },
      },
    };
    const service = new SpeedGameplayService(prisma as any, {} as any, {} as any);
    await assert.rejects(
      (service as any).inTransaction(async () => 'unreachable'),
      (error: any) => error?.response?.code === 'speed_gameplay_busy'
        && !JSON.stringify(error.response).includes('serialization'),
    );
    assert.equal(options.length, 3);
    assert.equal(options.every((value) => value.maxWait <= 8_000 && value.timeout <= 12_000), true);
  });

  it('maps interactive transaction expiry to the stable Speed-specific error', async () => {
    const service = new SpeedGameplayService({
      client: {
        $transaction: async () => {
          throw Object.assign(new Error('private transaction expiry detail'), { code: 'P2028' });
        },
      },
    } as any, {} as any, {} as any);
    await assert.rejects(
      (service as any).inTransaction(async () => 'unreachable'),
      (error: any) => error?.response?.code === 'speed_mutation_transaction_timeout'
        && !JSON.stringify(error.response).includes('private'),
    );
  });
});
