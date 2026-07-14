import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  isRecognizedMatchmakingTicketUniqueError,
  MATCHMAKING_COMPLETION_RESERVE_MS,
  MATCHMAKING_LIFECYCLE_MS,
  MatchmakingRecoveryPendingError,
  recognizedMatchmakingTicketUniqueError,
  runMatchmakingLifecycle,
} from '../src/matchmaking/matchmaking-lifecycle.ts';
import type {
  MatchmakingLifecycleDependencies,
  MatchmakingTransactionInvoker,
  MatchmakingTransactionOptions,
} from '../src/matchmaking/matchmaking-lifecycle.ts';

const budget = { maxWait: 5_000, timeout: 20_000 };

function publicError(error: unknown): { code?: string; message?: string } {
  assert.ok(error instanceof ServiceUnavailableException);
  return error.getResponse() as { code?: string; message?: string };
}

function fakeRuntime(options: {
  random?: number[];
  startMonotonic?: number;
  wallTimes?: Date[];
} = {}) {
  let monotonic = options.startMonotonic ?? 1_000;
  const sleeps: number[] = [];
  const random = [...(options.random ?? [0])];
  const wallTimes = [...(options.wallTimes ?? [new Date('2026-07-14T00:00:00.000Z')])];
  const dependencies: MatchmakingLifecycleDependencies = {
    monotonicNowMs: () => monotonic,
    wallNow: () => new Date((wallTimes.shift() ?? wallTimes.at(-1) ?? new Date()).getTime()),
    random: () => random.shift() ?? 0,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      monotonic += milliseconds;
    },
  };
  return {
    dependencies,
    sleeps,
    advance: (milliseconds: number) => { monotonic += milliseconds; },
  };
}

function sequencedTransaction(
  sequence: unknown[],
  recordedOptions: MatchmakingTransactionOptions[] = [],
): MatchmakingTransactionInvoker {
  return async (callback, options) => {
    recordedOptions.push({ ...options });
    const next = sequence.shift();
    if (next !== undefined) throw next;
    return await callback({});
  };
}

const retryableCases = [
  ['P2034', Object.assign(new Error('serialization detail'), { code: 'P2034' })],
  ['PostgreSQL 40001', Object.assign(new Error('serialization SQL detail'), { code: 'P2010', meta: { code: '40001' } })],
  ['PostgreSQL 40P01', Object.assign(new Error('deadlock SQL detail'), { code: 'P2010', meta: { code: '40P01' } })],
] as const;

describe('shared matchmaking lifecycle coordinator', () => {
  it('recognizes only the locked ticket idempotency and active-ticket uniqueness identities', () => {
    const p2002 = (target?: unknown) => Object.assign(new Error('unique'), {
      code: 'P2002',
      ...(target === undefined ? {} : { meta: { target } }),
    });

    assert.equal(isRecognizedMatchmakingTicketUniqueError(p2002('MatchmakingTicket_userId_mode_idempotencyKey_key')), true);
    assert.equal(isRecognizedMatchmakingTicketUniqueError(p2002('matchmaking_ticket_one_active_per_user_mode')), true);
    assert.equal(isRecognizedMatchmakingTicketUniqueError(p2002(['userId', 'mode', 'idempotencyKey'])), true);
    assert.equal(isRecognizedMatchmakingTicketUniqueError(p2002(['userId', 'mode'])), true);
    assert.equal(isRecognizedMatchmakingTicketUniqueError(p2002(['id'])), false);
    assert.equal(isRecognizedMatchmakingTicketUniqueError(p2002()), false);
    assert.equal(isRecognizedMatchmakingTicketUniqueError(Object.assign(new Error('other'), { code: 'P2034' })), false);
  });

  it('runs a successful initial transaction once with the configured preferred budget', async () => {
    const runtime = fakeRuntime();
    const options: MatchmakingTransactionOptions[] = [];
    const result = await runMatchmakingLifecycle(
      sequencedTransaction([], options),
      { initial: async (_tx, context) => ({ phase: context.phase, attempt: context.attempt }) },
      budget,
      runtime.dependencies,
    );

    assert.deepEqual(result, { phase: 'initial', attempt: 1 });
    assert.deepEqual(options, [{ isolationLevel: 'Serializable', maxWait: 5_000, timeout: 20_000 }]);
    assert.deepEqual(runtime.sleeps, []);
  });

  for (const [name, failure] of retryableCases) {
    it(`exhausts exactly four shared attempts for ${name} with three bounded sleeps`, async () => {
      const runtime = fakeRuntime({ random: [0, 0.5, 0.999999] });
      const options: MatchmakingTransactionOptions[] = [];
      const error = await runMatchmakingLifecycle(
        sequencedTransaction([failure, failure, failure, failure], options),
        { initial: async () => 'unreachable' },
        budget,
        runtime.dependencies,
      ).then(() => null, (caught) => caught);

      assert.deepEqual(publicError(error), {
        code: 'matchmaking_retry_exhausted',
        message: 'Matchmaking was busy resolving concurrent queue activity. Retry the request.',
      });
      assert.equal(options.length, 4);
      assert.deepEqual(runtime.sleeps, [50, 100, 300]);
    });
  }

  it('does not retry P2028 and returns only the sanitized transaction-timeout contract', async () => {
    const runtime = fakeRuntime();
    const options: MatchmakingTransactionOptions[] = [];
    const failure = Object.assign(new Error('P2028 sensitive provider detail'), { code: 'P2028' });
    const error = await runMatchmakingLifecycle(
      sequencedTransaction([failure], options),
      { initial: async () => 'unreachable' },
      budget,
      runtime.dependencies,
    ).then(() => null, (caught) => caught);

    assert.deepEqual(publicError(error), {
      code: 'matchmaking_transaction_timeout',
      message: 'Matchmaking took too long to complete. Retry the request.',
    });
    assert.equal(options.length, 1);
    assert.deepEqual(runtime.sleeps, []);
    assert.equal(JSON.stringify(publicError(error)).includes('P2028'), false);
  });

  it('shares attempts and the original deadline across initial P2002 recovery and recovery retries', async () => {
    const runtime = fakeRuntime({ random: [0, 0, 0] });
    const options: MatchmakingTransactionOptions[] = [];
    const unique = recognizedMatchmakingTicketUniqueError(Object.assign(new Error('constraint detail'), { code: 'P2002' }));
    const result = await runMatchmakingLifecycle(
      sequencedTransaction([Object.assign(new Error('serialization'), { code: 'P2034' }), unique, new MatchmakingRecoveryPendingError()], options),
      {
        initial: async () => 'initial',
        recoverUnique: async (_tx, context) => `recovered-${context.attempt}`,
      },
      budget,
      runtime.dependencies,
    );

    assert.equal(result, 'recovered-4');
    assert.equal(options.length, 4);
    assert.deepEqual(runtime.sleeps, [50, 50, 50]);
  });

  it('starts no recovery transaction when recognized P2002 consumes attempt four', async () => {
    const runtime = fakeRuntime();
    const options: MatchmakingTransactionOptions[] = [];
    const retry = Object.assign(new Error('serialization'), { code: 'P2034' });
    const unique = recognizedMatchmakingTicketUniqueError(Object.assign(new Error('constraint detail'), { code: 'P2002' }));
    let recoveryCalls = 0;
    const error = await runMatchmakingLifecycle(
      sequencedTransaction([retry, retry, retry, unique], options),
      {
        initial: async () => 'initial',
        recoverUnique: async () => { recoveryCalls += 1; return 'recovered'; },
      },
      budget,
      runtime.dependencies,
    ).then(() => null, (caught) => caught);

    assert.equal(publicError(error).code, 'matchmaking_retry_exhausted');
    assert.equal(options.length, 4);
    assert.equal(recoveryCalls, 0);
  });

  it('keeps recognized P2002 recovery on the original deadline and returns an exact sanitized lifecycle timeout', async () => {
    const runtime = fakeRuntime({ random: [0] });
    const options: MatchmakingTransactionOptions[] = [];
    const unique = recognizedMatchmakingTicketUniqueError(Object.assign(new Error('P2002 constraint and SQL detail'), {
      code: 'P2002',
      meta: { target: 'matchmaking_ticket_one_active_per_user_mode' },
    }));
    let recoveryCalls = 0;
    const transaction: MatchmakingTransactionInvoker = async () => {
      options.push({ isolationLevel: 'Serializable', maxWait: 5_000, timeout: 20_000 });
      runtime.advance(89_000);
      throw unique;
    };
    const error = await runMatchmakingLifecycle(
      transaction,
      {
        initial: async () => 'initial',
        recoverUnique: async () => { recoveryCalls += 1; return 'recovered'; },
      },
      budget,
      runtime.dependencies,
    ).then(() => null, (caught) => caught);

    assert.deepEqual(publicError(error), {
      code: 'matchmaking_lifecycle_timeout',
      message: 'Matchmaking could not complete within its request deadline. Retry the request.',
    });
    assert.equal(JSON.stringify(publicError(error)).includes('P2002'), false);
    assert.equal(JSON.stringify(publicError(error)).includes('SQL'), false);
    assert.equal(options.length, 1);
    assert.equal(recoveryCalls, 0);
    assert.deepEqual(runtime.sleeps, []);
  });

  it('does not transition unrelated P2002 errors into ticket recovery', async () => {
    const runtime = fakeRuntime();
    const options: MatchmakingTransactionOptions[] = [];
    const unrelated = Object.assign(new Error('unrelated unique constraint'), { code: 'P2002' });
    let recoveryCalls = 0;
    const error = await runMatchmakingLifecycle(
      sequencedTransaction([unrelated], options),
      {
        initial: async () => 'initial',
        recoverUnique: async () => { recoveryCalls += 1; return 'recovered'; },
      },
      budget,
      runtime.dependencies,
    ).then(() => null, (caught) => caught);

    assert.equal(error, unrelated);
    assert.equal(options.length, 1);
    assert.equal(recoveryCalls, 0);
    assert.deepEqual(runtime.sleeps, []);
  });

  it('clamps a late attempt to the original remaining lifecycle budget', async () => {
    const runtime = fakeRuntime({ random: [0] });
    const options: MatchmakingTransactionOptions[] = [];
    const retry = Object.assign(new Error('serialization'), { code: 'P2034' });
    const transaction: MatchmakingTransactionInvoker = async (callback, prismaOptions) => {
      options.push({ ...prismaOptions });
      if (options.length === 1) {
        runtime.advance(70_000);
        throw retry;
      }
      return await callback({});
    };

    await runMatchmakingLifecycle(transaction, { initial: async () => 'ok' }, budget, runtime.dependencies);

    assert.deepEqual(options[0], { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 20_000 });
    assert.deepEqual(options[1], { isolationLevel: 'Serializable', maxWait: 3_790, timeout: 15_160 });
    assert.ok(options[1].maxWait + options[1].timeout
      <= MATCHMAKING_LIFECYCLE_MS - 70_050 - MATCHMAKING_COMPLETION_RESERVE_MS);
  });

  it('uses deterministic bounded decorrelated jitter and different sequences break lockstep', async () => {
    const run = async (random: number[]) => {
      const runtime = fakeRuntime({ random });
      const retry = Object.assign(new Error('serialization'), { code: 'P2034' });
      await runMatchmakingLifecycle(
        sequencedTransaction([retry, retry, retry]),
        { initial: async () => 'ok' },
        budget,
        runtime.dependencies,
      );
      return runtime.sleeps;
    };

    assert.deepEqual(await run([0, 0.5, 0.999999]), [50, 100, 300]);
    assert.deepEqual(await run([0, 0.5, 0.999999]), [50, 100, 300]);
    assert.deepEqual(await run([0.999999, 0.999999, 0.999999]), [150, 450, 1_000]);
  });

  it('refuses a backoff that would consume the minimum remaining attempt envelope', async () => {
    const runtime = fakeRuntime({ random: [0.999999] });
    const retry = Object.assign(new Error('serialization'), { code: 'P2034' });
    const transaction: MatchmakingTransactionInvoker = async () => {
      runtime.advance(MATCHMAKING_LIFECYCLE_MS - 2_300);
      throw retry;
    };
    const error = await runMatchmakingLifecycle(
      transaction,
      { initial: async () => 'unreachable' },
      budget,
      runtime.dependencies,
    ).then(() => null, (caught) => caught);

    assert.equal(publicError(error).code, 'matchmaking_lifecycle_timeout');
    assert.deepEqual(runtime.sleeps, []);
  });

  it('refreshes wall time for each attempt so a late successful ticket receives a full queue TTL', async () => {
    const first = new Date('2026-07-14T00:00:00.000Z');
    const second = new Date('2026-07-14T00:01:10.000Z');
    const runtime = fakeRuntime({ wallTimes: [first, second] });
    const retry = Object.assign(new Error('serialization'), { code: 'P2034' });
    const result = await runMatchmakingLifecycle(
      sequencedTransaction([retry]),
      {
        initial: async (_tx, context) => ({
          createdAt: context.attemptNow,
          expiresAt: new Date(context.attemptNow.getTime() + 60_000),
        }),
      },
      budget,
      runtime.dependencies,
    );

    assert.equal(result.createdAt.toISOString(), second.toISOString());
    assert.equal(result.expiresAt.getTime() - result.createdAt.getTime(), 60_000);
  });
});
