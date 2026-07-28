import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import {
  classifySpeedMutationError,
  speedMutationErrorIsRetryable,
  speedMutationPublicError,
} from '../src/gameplay/speed-mutation-errors.ts';
import {
  SPEED_MUTATION_COMPLETION_RESERVE_MS,
  SPEED_MUTATION_EXECUTION_MS,
  SPEED_MUTATION_LIFECYCLE_MS,
  SPEED_MUTATION_MAX_ATTEMPTS,
  SPEED_MUTATION_MAX_WAIT_MS,
  SPEED_MUTATION_PROJECTION_EXECUTION_MS,
  speedMutationAttemptOptions,
  speedMutationProjectionOptions,
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
      (service as any).inReadyTransaction(async () => 'unreachable', performance.now()),
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
      (service as any).inReadyTransaction(async () => 'unreachable', performance.now()),
      (error: any) => error?.response?.code === 'speed_mutation_transaction_timeout'
        && !JSON.stringify(error.response).includes('private'),
    );
  });

  it('locks the post-commit projection to one bounded RepeatableRead attempt', () => {
    assert.equal(SPEED_MUTATION_PROJECTION_EXECUTION_MS, 8_000);
    const options = speedMutationProjectionOptions(SPEED_MUTATION_LIFECYCLE_MS);
    assert.equal(options.isolationLevel, 'RepeatableRead');
    assert.ok(options.maxWait <= SPEED_MUTATION_MAX_WAIT_MS);
    assert.ok(options.timeout <= SPEED_MUTATION_PROJECTION_EXECUTION_MS);
    assert.ok(options.maxWait + options.timeout <= SPEED_MUTATION_LIFECYCLE_MS - SPEED_MUTATION_COMPLETION_RESERVE_MS);
  });

  it('classifies every direct, meta, and bounded nested Speed mutation database shape', () => {
    const table = [
      ['P2034', 'serialization', true, 409, 'speed_gameplay_busy'],
      ['40001', 'serialization', true, 409, 'speed_gameplay_busy'],
      ['40P01', 'deadlock', true, 409, 'speed_gameplay_busy'],
      ['55P03', 'lock_timeout', true, 409, 'speed_gameplay_busy'],
      ['P2028', 'transaction_timeout', false, 503, 'speed_mutation_transaction_timeout'],
      ['57014', 'statement_timeout', false, 503, 'speed_mutation_transaction_timeout'],
      ['P1001', 'connection', false, 503, 'speed_mutation_unavailable'],
      ['P1002', 'connection', false, 503, 'speed_mutation_unavailable'],
      ['P1008', 'connection', false, 503, 'speed_mutation_unavailable'],
      ['P1017', 'connection', false, 503, 'speed_mutation_unavailable'],
    ] as const;
    for (const [code, expectedClass, retryable, status, publicCode] of table) {
      for (const error of [
        { code },
        { meta: { code } },
        { cause: { original: { error: { meta: { code } } } } },
      ]) {
        const classified = classifySpeedMutationError(error);
        assert.equal(classified, expectedClass);
        assert.equal(speedMutationErrorIsRetryable(classified), retryable);
        const mapped = speedMutationPublicError(classified);
        assert.equal(mapped.getStatus(), status);
        assert.equal((mapped.getResponse() as any).code, publicCode);
        assert.doesNotMatch(JSON.stringify(mapped.getResponse()), /P20|40001|40P01|55P03|57014|P100/);
      }
    }
  });

  it('bounds wrapper traversal, handles cycles, and sanitizes unknown failures', () => {
    const cyclic: any = { code: 'private_unknown_code', message: 'postgresql://private' };
    cyclic.cause = cyclic;
    assert.equal(classifySpeedMutationError(cyclic), 'unknown');
    const tooDeep = { cause: { cause: { cause: { cause: { code: '40001' } } } } };
    assert.equal(classifySpeedMutationError(tooDeep), 'unknown');
    const mapped = speedMutationPublicError('unknown');
    assert.equal(mapped.getStatus(), 503);
    assert.equal((mapped.getResponse() as any).code, 'speed_mutation_unavailable');
    assert.doesNotMatch(JSON.stringify(mapped.getResponse()), /private|postgres|40001/);
  });

  it('forces every structured class through the actual ready flow with exact attempts and sanitized status', { timeout: 30_000 }, async () => {
    const cases = [
      [{ meta: { code: '40001' } }, 3, 409, 'speed_gameplay_busy'],
      [{ cause: { original: { error: { code: '40P01' } } } }, 3, 409, 'speed_gameplay_busy'],
      [{ error: { meta: { code: '55P03' } } }, 3, 409, 'speed_gameplay_busy'],
      [{ original: { code: 'P2028' } }, 1, 503, 'speed_mutation_transaction_timeout'],
      [{ cause: { meta: { code: '57014' } } }, 1, 503, 'speed_mutation_transaction_timeout'],
      [{ error: { code: 'P1001' } }, 1, 503, 'speed_mutation_unavailable'],
      [{ cause: { error: new Error('postgresql://private unknown') } }, 1, 503, 'speed_mutation_unavailable'],
    ] as const;
    for (const [forced, expectedAttempts, status, code] of cases) {
      let attempts = 0;
      const service = new SpeedGameplayService({
        client: {
          $transaction: async () => {
            attempts += 1;
            throw forced;
          },
        },
      } as any, {} as any, { assertDependenciesAvailable: async () => {} } as any);
      await assert.rejects(
        service.markReady('private-match-id', 'private-user-id', 'private-request-id'),
        (error: any) => error?.getStatus?.() === status
          && error?.response?.code === code
          && !JSON.stringify(error.response).includes('private'),
      );
      assert.equal(attempts, expectedAttempts);
    }
  });

  it('sanitizes unknown dependency-gate failures before the controller boundary', async () => {
    const service = new SpeedGameplayService({ client: {} } as any, {} as any, {
      assertDependenciesAvailable: async () => { throw new Error('postgresql://private dependency'); },
    } as any);
    await assert.rejects(
      service.markReady('private-match-id', 'private-user-id', 'private-request-id'),
      (error: any) => error?.getStatus?.() === 503
        && error?.response?.code === 'speed_mutation_unavailable'
        && !JSON.stringify(error.response).includes('private'),
    );
  });
});
