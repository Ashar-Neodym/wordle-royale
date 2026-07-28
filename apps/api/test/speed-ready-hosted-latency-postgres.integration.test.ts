import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CurrentUserService, localFixtureUsers } from '../src/auth/current-user.service.ts';
import { GameplayController } from '../src/gameplay/gameplay.controller.ts';
import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import type { PrismaService } from '../src/prisma/prisma.service.ts';
import { ProfileReadService } from '../src/profile/profile-read.service.ts';

const enabled = process.env.RUN_SPEED_READY_HOSTED_LATENCY_POSTGRES_INTEGRATION === '1';
const suite = enabled ? describe : describe.skip;
const base = new Date('2026-07-27T12:00:00.000Z');
const candidates = [100, 200, 300, 400, 500];

type StructuredError = { constructorName: string; code: string | null; metaCode: string | null };
type AttemptEvidence = {
  matchId: string;
  results: PromiseSettledResult<unknown>[];
  elapsedMs: number[];
  callbackEntries: number;
  rawErrors: StructuredError[];
  lockWaitObserved: boolean;
};

function delay(milliseconds: number): Promise<void> {
  return milliseconds === 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function structuredError(error: unknown): StructuredError {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const meta = value.meta && typeof value.meta === 'object' ? value.meta as Record<string, unknown> : {};
  return {
    constructorName: error instanceof Error ? error.constructor.name : 'UnknownError',
    code: typeof value.code === 'string' ? value.code : null,
    metaCode: typeof meta.code === 'string' ? meta.code : null,
  };
}

function delayedTransactionClient(client: PrismaClient, latencyMs: number, evidence: { callbackEntries: number; rawErrors: StructuredError[] }) {
  const wrap = (target: any): any => new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object);
      if (typeof value === 'function') {
        return async (...args: unknown[]) => {
          const result = await value.apply(object, args);
          await delay(latencyMs);
          return result;
        };
      }
      if (value && typeof value === 'object') return wrap(value);
      return value;
    },
  });
  return {
    $transaction: async (callback: (tx: any) => Promise<unknown>, options: unknown) => {
      try {
        return await client.$transaction(async (tx) => {
          evidence.callbackEntries += 1;
          return await callback(wrap(tx));
        }, options as any);
      } catch (error) {
        evidence.rawErrors.push(structuredError(error));
        throw error;
      }
    },
  };
}

suite('Ticket 221 hosted-safe simultaneous-ready PostgreSQL diagnostic', () => {
  const client = new PrismaClient();
  const monitor = new PrismaClient();
  const holderUrl = new URL(process.env.DATABASE_URL!);
  holderUrl.searchParams.set('application_name', 'ticket221_holder');
  const holder = new PrismaClient({ datasources: { db: { url: holderUrl.toString() } } });
  const prisma = { client } as unknown as PrismaService;
  const ratings = new GameplayPersistenceService(prisma);
  const operational = { assertAvailable: async () => {}, assertDependenciesAvailable: async () => {} } as any;
  const creator = new SpeedGameplayService(prisma, ratings, operational);
  let releaseId: string;

  before(async () => {
    await Promise.all([client.$connect(), monitor.$connect(), holder.$connect()]);
    await client.$executeRawUnsafe(`UPDATE "SpeedLifecycleActivation" SET "phase"='closing_to_v2', "activeCreationVersion"=NULL, "generation"=2, "targetReleaseId"='ticket-test-release', "expectedReplicaCount"=1, "transitionReason"='disposable_test_activation', "updatedAt"=clock_timestamp() WHERE "key"='speed_1v1'`);
    await client.$executeRawUnsafe(`UPDATE "SpeedLifecycleActivation" SET "phase"='v2_open', "activeCreationVersion"='speed_ready_v2_first_ack_90s', "generation"=3, "transitionReason"='disposable_test_activation', "updatedAt"=clock_timestamp() WHERE "key"='speed_1v1'`);
    await client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "SpeedTimingTestClock" ("id" integer PRIMARY KEY, "now" timestamptz NOT NULL)');
    await client.$executeRawUnsafe('INSERT INTO "SpeedTimingTestClock" ("id", "now") VALUES (1, $1) ON CONFLICT ("id") DO UPDATE SET "now" = EXCLUDED."now"', base);
    const release = await client.dictionaryRelease.findFirst({ orderBy: { version: 'desc' } });
    assert.ok(release);
    releaseId = release.id;
  });

  after(async () => {
    await client.$executeRawUnsafe('DROP TABLE IF EXISTS "SpeedTimingTestClock"');
    await Promise.all([client.$disconnect(), monitor.$disconnect(), holder.$disconnect()]);
  });

  async function reset(): Promise<void> {
    await client.matchMutationRequest.deleteMany();
    await client.ratingEvent.deleteMany();
    await client.scoreBreakdown.deleteMany();
    await client.guessAttempt.deleteMany();
    await client.matchmakingTicket.deleteMany();
    await client.matchParticipant.deleteMany();
    await client.matchRound.deleteMany();
    await client.match.deleteMany();
    await client.auditLog.deleteMany();
    await client.ratingProfile.deleteMany({ where: { mode: 'speed_1v1' } });
    await client.$executeRawUnsafe('UPDATE "SpeedTimingTestClock" SET "now" = $1 WHERE "id" = 1', base);
  }

  async function createMatch(key: string) {
    await reset();
    return await client.$transaction(async (tx) => await creator.createSpeedMatch({
      dictionaryReleaseId: releaseId,
      participantUserIds: [localFixtureUsers.playerOne, localFixtureUsers.guestPlayer],
      idempotencyKey: key,
      readyLifecycleVersion: 'speed_ready_v2_first_ack_90s',
      activationGeneration: 3n,
    }, tx));
  }

  async function runPair(latencyMs: number, key: string, concurrent: boolean): Promise<AttemptEvidence> {
    const match = await createMatch(key);
    const capture = { callbackEntries: 0, rawErrors: [] as StructuredError[] };
    const delayedPrisma = { client: delayedTransactionClient(client, latencyMs, capture) } as unknown as PrismaService;
    const service = new SpeedGameplayService(delayedPrisma, ratings, operational);
    let monitoring = true;
    let lockWaitObserved = false;
    const monitorLoop = (async () => {
      while (monitoring) {
        const rows = await monitor.$queryRawUnsafe<Array<{ waiting: bigint }>>(
          `SELECT count(*)::bigint AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'`,
        );
        if (Number(rows[0]?.waiting ?? 0) > 0) lockWaitObserved = true;
        await delay(20);
      }
    })();
    const invoke = async (userId: string, requestId: string) => {
      const started = performance.now();
      try {
        return await service.markReady(match.matchId, userId, requestId);
      } finally {
        elapsed.push(performance.now() - started);
      }
    };
    const elapsed: number[] = [];
    const one = () => invoke(localFixtureUsers.playerOne, `${key}-one`);
    const two = () => invoke(localFixtureUsers.guestPlayer, `${key}-two`);
    const results = concurrent
      ? await Promise.allSettled([one(), two()])
      : [await Promise.resolve().then(one).then((value) => ({ status: 'fulfilled', value }) as const, (reason) => ({ status: 'rejected', reason }) as const),
          await Promise.resolve().then(two).then((value) => ({ status: 'fulfilled', value }) as const, (reason) => ({ status: 'rejected', reason }) as const)];
    monitoring = false;
    await monitorLoop;
    return { matchId: match.matchId, results, elapsedMs: elapsed, callbackEntries: capture.callbackEntries, rawErrors: capture.rawErrors, lockWaitObserved };
  }

  async function runHttpPair(latencyMs: number) {
    const match = await createMatch('ticket221-http-green');
    const capture = { callbackEntries: 0, rawErrors: [] as StructuredError[] };
    const delayedPrisma = { client: delayedTransactionClient(client, latencyMs, capture) } as unknown as PrismaService;
    const service = new SpeedGameplayService(delayedPrisma, ratings, operational);
    const moduleRef = await Test.createTestingModule({
      controllers: [GameplayController],
      providers: [
        { provide: GameplayPersistenceService, useValue: ratings },
        { provide: SpeedGameplayService, useValue: service },
        { provide: ProfileReadService, useValue: {} },
        {
          provide: CurrentUserService,
          useValue: {
            resolveCurrentUser: (header: string) => ({
              userId: header === 'ticket221-one' ? localFixtureUsers.playerOne : localFixtureUsers.guestPlayer,
            }),
          },
        },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      let releaseHolder!: () => void;
      const releaseSignal = new Promise<void>((resolve) => { releaseHolder = resolve; });
      let holderReady!: (pid: number) => void;
      const holderReadySignal = new Promise<number>((resolve) => { holderReady = resolve; });
      const holderTransaction = holder.$transaction(async (tx) => {
        const pidRows = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid');
        await tx.$queryRawUnsafe('SELECT "id" FROM "Match" WHERE "id" = $1 FOR UPDATE', match.matchId);
        holderReady(pidRows[0]!.pid);
        await releaseSignal;
      }, { timeout: 15_000 });
      const holderPid = await holderReadySignal;
      const responsesPromise = Promise.all([
        request(app.getHttpServer())
          .post(`/matches/${match.matchId}/ready`)
          .set('x-wordle-dev-user-id', 'ticket221-one')
          .send({ clientRequestId: '22100000-0000-4000-8000-000000000001' }),
        request(app.getHttpServer())
          .post(`/matches/${match.matchId}/ready`)
          .set('x-wordle-dev-user-id', 'ticket221-two')
          .send({ clientRequestId: '22100000-0000-4000-8000-000000000002' }),
      ]);
      let blockedBackends = 0;
      const waitDeadline = performance.now() + 5_000;
      while (performance.now() < waitDeadline && blockedBackends < 2) {
        const rows = await monitor.$queryRawUnsafe<Array<{ blocked: bigint }>>(`
          SELECT count(*)::bigint AS blocked FROM pg_stat_activity
          WHERE pid <> $1
            AND wait_event_type='Lock'
            AND query LIKE '%FROM "Match"%FOR UPDATE%'
            AND cardinality(pg_blocking_pids(pid)) > 0
        `, holderPid);
        blockedBackends = Number(rows[0]?.blocked ?? 0);
        if (blockedBackends < 2) await delay(20);
      }
      releaseHolder();
      await holderTransaction;
      const responses = await responsesPromise;
      return {
        statuses: responses.map((response) => response.status),
        bodies: responses.map((response) => response.body),
        holderPid,
        blockedBackends,
      };
    } finally {
      await app.close();
    }
  }

  async function persistedEvidence() {
    return {
      readyCount: await client.matchParticipant.count({ where: { readyAt: { not: null } } }),
      mutationCount: await client.matchMutationRequest.count({ where: { kind: 'speed_ready' } }),
      ratingCount: await client.ratingEvent.count({ where: { type: 'apply' } }),
      match: await client.match.findFirst({ select: { readyWindowStartedAt: true, readyDeadlineAt: true, startedAt: true } }),
      round: await client.matchRound.findFirst({ select: { startedAt: true, deadlineAt: true } }),
    };
  }

  function projectionFailureService() {
    return new SpeedGameplayService({
      client: {
        $transaction: async (callback: (tx: any) => Promise<unknown>, options: any) => {
          if (options?.isolationLevel === 'RepeatableRead') throw new Error('private projection postgresql://credentials');
          return await client.$transaction(callback, options);
        },
      },
    } as unknown as PrismaService, ratings, operational);
  }

  async function receiptPersistence(matchId: string, userId: string) {
    const participant = await client.matchParticipant.findFirst({ where: { matchId, userId } });
    assert.ok(participant);
    return {
      readyAt: participant.readyAt,
      mutations: await client.matchMutationRequest.findMany({
        where: { matchId, participantId: participant.id, kind: 'speed_ready' },
        orderBy: { createdAt: 'asc' },
        select: { clientRequestId: true },
      }),
      match: await client.match.findUnique({ where: { id: matchId }, select: { status: true, completionReason: true } }),
    };
  }

  function forcedRollbackService(forced: unknown, attempts: { count: number }) {
    return new SpeedGameplayService({
      client: {
        $transaction: async (callback: (tx: any) => Promise<unknown>, options: any) => await client.$transaction(async (tx) => {
          attempts.count += 1;
          const wrapped = new Proxy(tx as any, {
            get(target, property, receiver) {
              if (property !== 'matchMutationRequest') return Reflect.get(target, property, receiver);
              return new Proxy(target.matchMutationRequest, {
                get(model, method, modelReceiver) {
                  if (method !== 'create') return Reflect.get(model, method, modelReceiver);
                  return async (...args: unknown[]) => {
                    await model.create(...args);
                    throw forced;
                  };
                },
              });
            },
          });
          return await callback(wrapped);
        }, options),
      },
    } as unknown as PrismaService, ratings, operational);
  }

  it('records deterministic RED classification before repair and freezes D* for GREEN', { timeout: 180_000 }, async () => {
    const fast = await runPair(0, 'ticket221-fast', true);
    assert.equal(fast.results.every((result) => result.status === 'fulfilled'), true);
    assert.deepEqual(await persistedEvidence().then((value) => [value.readyCount, value.mutationCount, value.ratingCount]), [2, 2, 0]);

    const expectation = process.env.SPEED_READY_HOSTED_LATENCY_EXPECT ?? 'green';
    let frozen: { latencyMs: number; evidence: AttemptEvidence } | null = null;
    if (expectation === 'red') {
      for (const latencyMs of candidates) {
        const evidence = await runPair(latencyMs, `ticket221-sweep-${latencyMs}`, true);
        const succeeded = evidence.results.filter((result) => result.status === 'fulfilled').length;
        const persisted = await persistedEvidence();
        if (succeeded === 1 && persisted.readyCount === 1 && persisted.mutationCount === 1) {
          frozen = { latencyMs, evidence };
          break;
        }
      }
    }

    if (expectation === 'red') {
      assert.ok(frozen, 'current critical section must reproduce one-success/one-rollback under the deterministic latency sweep');
      assert.equal(frozen.evidence.callbackEntries >= 2, true);
      assert.equal(frozen.evidence.lockWaitObserved, true);
      assert.equal(frozen.evidence.rawErrors.length >= 1, true);
      const control = await runPair(frozen.latencyMs, `ticket221-sequential-${frozen.latencyMs}`, false);
      assert.equal(control.results.every((result) => result.status === 'fulfilled'), true);
      console.log(JSON.stringify({
        result: 'RED_REPRODUCED',
        frozenLatencyMs: frozen.latencyMs,
        structuredFailure: frozen.evidence.rawErrors,
        callbackEntries: frozen.evidence.callbackEntries,
        lockWaitObserved: frozen.evidence.lockWaitObserved,
        elapsedMs: frozen.evidence.elapsedMs.map(Math.round),
      }));
      return;
    }

    const frozenLatencyMs = Number(process.env.SPEED_READY_HOSTED_LATENCY_FROZEN_MS);
    assert.ok(Number.isFinite(frozenLatencyMs) && frozenLatencyMs > 0);
    const green = await runPair(frozenLatencyMs, 'ticket221-green-frozen', true);
    assert.equal(green.results.every((result) => result.status === 'fulfilled'), true);
    assert.equal(green.callbackEntries >= 2, true);
    assert.equal(green.lockWaitObserved, true);
    const persisted = await persistedEvidence();
    assert.equal(persisted.readyCount, 2);
    assert.equal(persisted.mutationCount, 2);
    assert.equal(persisted.ratingCount, 0);
    assert.ok(persisted.match?.readyWindowStartedAt && persisted.match.readyDeadlineAt && persisted.match.startedAt);
    assert.equal(persisted.round?.startedAt?.toISOString(), persisted.match.startedAt.toISOString());
    assert.ok(persisted.round?.deadlineAt);

    const originalWindow = [
      persisted.match.readyWindowStartedAt.toISOString(),
      persisted.match.readyDeadlineAt.toISOString(),
      persisted.match.startedAt.toISOString(),
    ];
    await creator.markReady(green.matchId, localFixtureUsers.playerOne, 'ticket221-green-frozen-one');
    await creator.markReady(green.matchId, localFixtureUsers.playerOne, 'ticket221-green-different-logical-id');
    const afterReplay = await persistedEvidence();
    assert.equal(afterReplay.mutationCount, 2);
    assert.deepEqual([
      afterReplay.match?.readyWindowStartedAt?.toISOString(),
      afterReplay.match?.readyDeadlineAt?.toISOString(),
      afterReplay.match?.startedAt?.toISOString(),
    ], originalWindow);

    const httpGreen = await runHttpPair(frozenLatencyMs);
    assert.deepEqual(httpGreen.statuses, [201, 201]);
    assert.equal(httpGreen.blockedBackends, 2);
    assert.equal(httpGreen.bodies.every((body) => body?.data?.readiness?.viewerReady === true), true);
    assert.equal(httpGreen.bodies.some((body) => body?.data?.readiness?.readyCount === 2), true);
    assert.deepEqual(await persistedEvidence().then((value) => [value.readyCount, value.mutationCount, value.ratingCount]), [2, 2, 0]);

    const projectionMatch = await createMatch('ticket221-projection-failure');
    let transactionCall = 0;
    const projectionFailurePrisma = {
      client: {
        $transaction: async (callback: (tx: any) => Promise<unknown>, options: unknown) => {
          transactionCall += 1;
          if (transactionCall === 2) throw new Error('private projection failure with postgresql://credentials');
          return await client.$transaction(callback, options as any);
        },
      },
    } as unknown as PrismaService;
    const projectionFailureService = new SpeedGameplayService(projectionFailurePrisma, ratings, operational);
    await assert.rejects(
      projectionFailureService.markReady(projectionMatch.matchId, localFixtureUsers.playerOne, 'ticket221-projection-one'),
      (error: any) => error?.response?.code === 'speed_snapshot_unavailable'
        && error?.response?.details?.commitKnown === true
        && error?.response?.details?.retrySafe === true
        && !JSON.stringify(error.response).includes('private'),
    );
    const committedAfterProjectionFailure = await persistedEvidence();
    assert.equal(committedAfterProjectionFailure.readyCount, 1);
    assert.equal(committedAfterProjectionFailure.mutationCount, 1);
    const projectionMetrics = projectionFailureService.readyMetrics();
    assert.equal(projectionMetrics.events.dependency_check, 1);
    assert.equal(projectionMetrics.events.transaction_requested, 1);
    assert.equal(projectionMetrics.events.callback_entered, 1);
    assert.equal(projectionMetrics.events.match_lock_acquired, 1);
    assert.equal(projectionMetrics.events.mutation_staged, 1);
    assert.equal(projectionMetrics.events.transaction_returned, 1);
    assert.equal(projectionMetrics.events.projection_started, 1);
    assert.equal(projectionMetrics.events.projection_completed, 0);
    assert.equal(projectionMetrics.outcomes.projection_failed, 1);
    assert.equal(Object.keys(projectionMetrics.durationBuckets).length, 7);
    assert.doesNotMatch(JSON.stringify(projectionMetrics), /ticket221|postgresql|credentials|matchId|clientRequestId/);
    const replayAfterProjectionFailure = await creator.markReady(
      projectionMatch.matchId,
      localFixtureUsers.playerOne,
      'ticket221-projection-one',
    );
    assert.equal(replayAfterProjectionFailure.readiness.viewerReady, true);
    assert.equal((await persistedEvidence()).mutationCount, 1);
    console.log(JSON.stringify({
      result: 'GREEN_FROZEN',
      frozenLatencyMs,
      callbackEntries: green.callbackEntries,
      lockWaitObserved: green.lockWaitObserved,
      elapsedMs: green.elapsedMs.map(Math.round),
      publicStatuses: httpGreen.statuses,
      persistence: { readyCount: 2, mutationCount: 2, ratingCount: 0 },
    }));
  });

  it('keeps projection-failure recovery truthful for every ready receipt outcome', { timeout: 60_000 }, async () => {
    const committed = await createMatch('ticket225-projection-committed');
    await assert.rejects(
      projectionFailureService().markReady(committed.matchId, localFixtureUsers.playerOne, 'ticket225-committed'),
      (error: any) => error?.response?.code === 'speed_snapshot_unavailable'
        && error?.response?.details?.acknowledgementKnown === true
        && error?.response?.details?.retrySafe === true
        && /acknowledgement was recorded/.test(error?.response?.message),
    );
    assert.deepEqual((await receiptPersistence(committed.matchId, localFixtureUsers.playerOne)).mutations, [{ clientRequestId: 'ticket225-committed' }]);

    await assert.rejects(
      projectionFailureService().markReady(committed.matchId, localFixtureUsers.playerOne, 'ticket225-committed'),
      (error: any) => error?.response?.details?.acknowledgementKnown === true
        && error?.response?.details?.retrySafe === true,
    );
    assert.deepEqual((await receiptPersistence(committed.matchId, localFixtureUsers.playerOne)).mutations, [{ clientRequestId: 'ticket225-committed' }]);

    const already = await createMatch('ticket225-projection-already');
    await creator.markReady(already.matchId, localFixtureUsers.playerOne, 'ticket225-original');
    const original = await receiptPersistence(already.matchId, localFixtureUsers.playerOne);
    await assert.rejects(
      projectionFailureService().markReady(already.matchId, localFixtureUsers.playerOne, 'ticket225-different'),
      (error: any) => error?.response?.details?.acknowledgementKnown === true
        && error?.response?.details?.retrySafe === true,
    );
    const alreadyAfter = await receiptPersistence(already.matchId, localFixtureUsers.playerOne);
    assert.equal(alreadyAfter.readyAt?.toISOString(), original.readyAt?.toISOString());
    assert.deepEqual(alreadyAfter.mutations, [{ clientRequestId: 'ticket225-original' }]);

    const late = await createMatch('ticket225-projection-late');
    await client.$executeRawUnsafe('UPDATE "SpeedTimingTestClock" SET "now" = $1 WHERE "id" = 1', new Date(base.getTime() + 90_001));
    await assert.rejects(
      projectionFailureService().markReady(late.matchId, localFixtureUsers.playerOne, 'ticket225-late'),
      (error: any) => error?.response?.code === 'speed_snapshot_unavailable'
        && error?.response?.details?.acknowledgementKnown === false
        && error?.response?.details?.retrySafe === false
        && !/The ready acknowledgement was recorded,/.test(error?.response?.message),
    );
    const lateAfter = await receiptPersistence(late.matchId, localFixtureUsers.playerOne);
    assert.equal(lateAfter.readyAt, null);
    assert.equal(lateAfter.mutations.length, 0);
    assert.equal(lateAfter.match?.completionReason, 'invitation_timeout');

    const terminal = await createMatch('ticket225-projection-terminal');
    await client.match.update({ where: { id: terminal.matchId }, data: { status: 'voided', adjudicatedAt: base, completionReason: 'pre_start_cancelled' } });
    await assert.rejects(
      projectionFailureService().markReady(terminal.matchId, localFixtureUsers.playerOne, 'ticket225-terminal'),
      (error: any) => error?.response?.details?.acknowledgementKnown === false
        && error?.response?.details?.retrySafe === false
        && !/The ready acknowledgement was recorded,/.test(error?.response?.message),
    );
    const terminalAfter = await receiptPersistence(terminal.matchId, localFixtureUsers.playerOne);
    assert.equal(terminalAfter.readyAt, null);
    assert.equal(terminalAfter.mutations.length, 0);
    assert.equal(terminalAfter.match?.completionReason, 'pre_start_cancelled');
  });

  it('forces every structured class through a real rollback-capable ready transaction', { timeout: 120_000 }, async () => {
    const classes = [
      ['P2034', 3, 409, 'speed_gameplay_busy'],
      ['40001', 3, 409, 'speed_gameplay_busy'],
      ['40P01', 3, 409, 'speed_gameplay_busy'],
      ['55P03', 3, 409, 'speed_gameplay_busy'],
      ['P2028', 1, 503, 'speed_mutation_transaction_timeout'],
      ['57014', 1, 503, 'speed_mutation_transaction_timeout'],
      ['P1001', 1, 503, 'speed_mutation_unavailable'],
      ['P1002', 1, 503, 'speed_mutation_unavailable'],
      ['P1008', 1, 503, 'speed_mutation_unavailable'],
      ['P1017', 1, 503, 'speed_mutation_unavailable'],
      ['PRIVATE_UNKNOWN', 1, 503, 'speed_mutation_unavailable'],
    ] as const;
    const shapes = [
      (code: string) => ({ code, message: 'private SQL credentials' }),
      (code: string) => ({ meta: { code }, message: 'private SQL credentials' }),
      (code: string) => ({ cause: { original: { error: { meta: { code } } } }, message: 'private SQL credentials' }),
    ];
    let sequence = 0;
    for (const [code, expectedAttempts, status, publicCode] of classes) {
      for (const shape of shapes) {
        sequence += 1;
        const match = await createMatch(`ticket225-rollback-${sequence}`);
        const attempts = { count: 0 };
        const service = forcedRollbackService(shape(code), attempts);
        await assert.rejects(
          service.markReady(match.matchId, localFixtureUsers.playerOne, `ticket225-rollback-request-${sequence}`),
          (error: any) => error?.getStatus?.() === status
            && error?.response?.code === publicCode
            && !/PRIVATE|private|SQL|credential|P20|P10|40001|40P01|55P03|57014/.test(JSON.stringify(error.response)),
        );
        assert.equal(attempts.count, expectedAttempts);
        const persisted = await receiptPersistence(match.matchId, localFixtureUsers.playerOne);
        assert.equal(persisted.readyAt, null);
        assert.equal(persisted.mutations.length, 0);
        assert.equal(persisted.match?.status, 'pending');
        const metrics = service.readyMetrics();
        assert.equal(metrics.retries, expectedAttempts - 1);
        assert.equal(metrics.outcomes.retrying, expectedAttempts - 1);
        assert.doesNotMatch(JSON.stringify(metrics), /ticket225|private|SQL|credential/);
      }
    }

    const dependencyMatch = await createMatch('ticket225-dependency-rollback');
    const dependencyService = new SpeedGameplayService(prisma, ratings, {
      assertDependenciesAvailable: async () => { throw new Error('private dependency credentials'); },
    } as any);
    await assert.rejects(
      dependencyService.markReady(dependencyMatch.matchId, localFixtureUsers.playerOne, 'ticket225-dependency'),
      (error: any) => error?.response?.code === 'speed_mutation_unavailable'
        && !/private|credential/.test(JSON.stringify(error.response)),
    );
    const dependencyPersistence = await receiptPersistence(dependencyMatch.matchId, localFixtureUsers.playerOne);
    assert.equal(dependencyPersistence.readyAt, null);
    assert.equal(dependencyPersistence.mutations.length, 0);
  });

  it('starts projection only after the commit backend released its locks and rejects malformed round cardinality', { timeout: 60_000 }, async () => {
    const barrierMatch = await createMatch('ticket225-projection-lock-barrier');
    let commitPid = 0;
    let projectionLockCount = -1;
    const barrierService = new SpeedGameplayService({
      client: {
        $transaction: async (callback: (tx: any) => Promise<unknown>, options: any) => {
          if (options?.isolationLevel === 'Serializable') {
            return await client.$transaction(async (tx) => {
              const rows = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid');
              commitPid = rows[0]!.pid;
              return await callback(tx);
            }, options);
          }
          const locks = await monitor.$queryRawUnsafe<Array<{ count: bigint }>>(
            'SELECT count(*)::bigint AS count FROM pg_locks WHERE pid = $1', commitPid,
          );
          projectionLockCount = Number(locks[0]?.count ?? -1);
          return await client.$transaction(callback, options);
        },
      },
    } as unknown as PrismaService, ratings, operational);
    const barrierSnapshot = await barrierService.markReady(barrierMatch.matchId, localFixtureUsers.playerOne, 'ticket225-barrier-ready');
    assert.equal(barrierSnapshot.readiness.viewerReady, true);
    assert.ok(commitPid > 0);
    assert.equal(projectionLockCount, 0);

    for (const cardinality of ['zero', 'multiple'] as const) {
      const malformed = await createMatch(`ticket225-round-${cardinality}`);
      let commitReturned = false;
      const malformedService = new SpeedGameplayService({
        client: {
          $transaction: async (callback: (tx: any) => Promise<unknown>, options: any) => {
            if (options?.isolationLevel === 'Serializable') {
              const result = await client.$transaction(callback, options);
              commitReturned = true;
              const round = await client.matchRound.findFirstOrThrow({ where: { matchId: malformed.matchId } });
              if (cardinality === 'zero') await client.matchRound.deleteMany({ where: { matchId: malformed.matchId } });
              else await client.matchRound.create({ data: {
                matchId: round.matchId, dictionaryReleaseId: round.dictionaryReleaseId, roundNumber: 2,
                answerWordHash: round.answerWordHash, answerWordSaltRef: round.answerWordSaltRef, maxAttempts: round.maxAttempts,
              } });
              return result;
            }
            return await client.$transaction(callback, options);
          },
        },
      } as unknown as PrismaService, ratings, operational);
      await assert.rejects(
        malformedService.markReady(malformed.matchId, localFixtureUsers.playerOne, `ticket225-round-${cardinality}-ready`),
        (error: any) => error?.response?.code === 'speed_snapshot_unavailable',
      );
      assert.equal(commitReturned, true);
      const persistence = await receiptPersistence(malformed.matchId, localFixtureUsers.playerOne);
      assert.ok(persistence.readyAt);
      assert.equal(persistence.mutations.length, 1);
    }
  });
});
