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
  lockSql: string[];
  lockHolderMs: number[];
  commitReturnMs: number[];
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

type PressureCapture = {
  callbackEntries: number;
  rawErrors: StructuredError[];
  lockSql: string[];
  lockHolderMs: number[];
  commitReturnMs: number[];
};

function delayedTransactionClient(client: PrismaClient, latencyMs: number, evidence: PressureCapture) {
  const wrap = (target: any, acquired?: () => void, operationLatencyMs = latencyMs): any => new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object);
      if (typeof value === 'function') {
        return async (...args: unknown[]) => {
          if (property === '$queryRawUnsafe' && typeof args[0] === 'string' && args[0].includes('FOR UPDATE')) {
            evidence.lockSql.push(args[0].replace(/\s+/g, ' ').trim());
          }
          const result = await value.apply(object, args);
          if (property === '$queryRawUnsafe' && typeof args[0] === 'string' && /FROM "Match" WHERE .*FOR UPDATE/s.test(args[0])) acquired?.();
          await delay(operationLatencyMs);
          return result;
        };
      }
      if (value && typeof value === 'object') return wrap(value, acquired, operationLatencyMs);
      return value;
    },
  });
  return {
    $transaction: async (callback: (tx: any) => Promise<unknown>, options: unknown) => {
      const isCommit = (options as any)?.isolationLevel === 'ReadCommitted';
      let lockAcquiredAt: number | null = null;
      let callbackReturnedAt: number | null = null;
      try {
        const result = await client.$transaction(async (tx) => {
          if (isCommit) evidence.callbackEntries += 1;
          const value = await callback(wrap(tx, () => { lockAcquiredAt ??= performance.now(); }, isCommit ? latencyMs : 0));
          callbackReturnedAt = performance.now();
          if (isCommit && lockAcquiredAt !== null) evidence.lockHolderMs.push(callbackReturnedAt - lockAcquiredAt);
          return value;
        }, options as any);
        if (isCommit && callbackReturnedAt !== null) evidence.commitReturnMs.push(performance.now() - callbackReturnedAt);
        return result;
      } catch (error) {
        if (isCommit) evidence.rawErrors.push(structuredError(error));
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
    const capture: PressureCapture = { callbackEntries: 0, rawErrors: [], lockSql: [], lockHolderMs: [], commitReturnMs: [] };
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
    return {
      matchId: match.matchId,
      results,
      elapsedMs: elapsed,
      callbackEntries: capture.callbackEntries,
      rawErrors: capture.rawErrors,
      lockWaitObserved,
      lockSql: capture.lockSql,
      lockHolderMs: capture.lockHolderMs,
      commitReturnMs: capture.commitReturnMs,
    };
  }

  async function runHttpPair(latencyMs: number) {
    const match = await createMatch('ticket221-http-green');
    const capture: PressureCapture = { callbackEntries: 0, rawErrors: [], lockSql: [], lockHolderMs: [], commitReturnMs: [] };
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
    const strictRequestEnvelopeMs = 4_819;
    const timeoutControlMs = 5_505;
    const requiredHolderMarginMs = 1_000;
    const strictHolderEnvelopeMs = timeoutControlMs - requiredHolderMarginMs;
    const green = await runPair(frozenLatencyMs, `ticket236-strict-${frozenLatencyMs}`, true);
    const persisted = await persistedEvidence();
    console.log(JSON.stringify({
      result: 'TICKET236_PRESSURE_EVIDENCE',
      frozenLatencyMs,
      strictRequestEnvelopeMs,
      strictHolderEnvelopeMs,
      callbackEntries: green.callbackEntries,
      rawErrors: green.rawErrors,
      elapsedMs: green.elapsedMs.map(Math.round),
      lockHolderMs: green.lockHolderMs.map(Math.round),
      commitReturnMs: green.commitReturnMs.map(Math.round),
    }));
    assert.equal(green.results.every((result) => result.status === 'fulfilled'), true, 'both pressure requests must commit');
    assert.equal(green.lockWaitObserved, true);
    const closureFailures: string[] = [];
    if (green.callbackEntries !== 2) closureFailures.push(`commit_callback_entries=${green.callbackEntries} (expected 2)`);
    if (green.rawErrors.length !== 0) closureFailures.push(`unexpected_transaction_errors=${JSON.stringify(green.rawErrors)}`);
    const slowestRequestMs = Math.round(Math.max(...green.elapsedMs));
    if (slowestRequestMs >= strictRequestEnvelopeMs) closureFailures.push(`slowest_request_ms=${slowestRequestMs} (must be below ${strictRequestEnvelopeMs})`);
    if (green.lockHolderMs.length !== 2) closureFailures.push(`measured_lock_holders=${green.lockHolderMs.length} (expected 2)`);
    if (green.commitReturnMs.length !== 2) closureFailures.push(`measured_commit_returns=${green.commitReturnMs.length} (expected 2)`);
    if (green.lockHolderMs.length === 2) {
      const slowestHolderMs = Math.round(Math.max(...green.lockHolderMs));
      if (slowestHolderMs > strictHolderEnvelopeMs) closureFailures.push(`slowest_lock_holder_ms=${slowestHolderMs} (limit ${strictHolderEnvelopeMs})`);
    }
    const matchLockCount = green.lockSql.filter((sql) => /FROM "Match" WHERE .* FOR UPDATE/.test(sql)).length;
    const joinedLockCount = green.lockSql.filter((sql) => /MatchRound.*JOIN "MatchParticipant".*ORDER BY.*participant\."id".*FOR UPDATE OF round_state, participant/.test(sql)).length;
    if (matchLockCount !== 2) closureFailures.push(`match_lock_acquisitions=${matchLockCount} (expected 2)`);
    if (joinedLockCount !== 2) closureFailures.push(`joined_lock_acquisitions=${joinedLockCount} (expected 2)`);
    assert.deepEqual([persisted.readyCount, persisted.mutationCount, persisted.ratingCount], [2, 2, 0]);
    assert.deepEqual(closureFailures, [], `Ticket 236 strict closure remains RED:\n${closureFailures.join('\n')}`);

    const persistedMatch = persisted.match;
    assert.ok(persistedMatch?.readyWindowStartedAt && persistedMatch.readyDeadlineAt && persistedMatch.startedAt);
    const originalWindow = [
      persistedMatch.readyWindowStartedAt.toISOString(),
      persistedMatch.readyDeadlineAt.toISOString(),
      persistedMatch.startedAt.toISOString(),
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

  it('reproduces the 5-6s failure class with a real PostgreSQL statement timeout and rollback', { timeout: 15_000 }, async () => {
    await reset();
    const started = performance.now();
    let observed: StructuredError | null = null;
    await assert.rejects(client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '5500ms'`);
      await tx.$executeRawUnsafe('INSERT INTO "SpeedTimingTestClock" ("id", "now") VALUES (236, clock_timestamp())');
      await tx.$queryRawUnsafe('SELECT pg_sleep(6)');
    }, { timeout: 8_000 }), (error) => {
      observed = structuredError(error);
      return observed.metaCode === '57014' || observed.code === '57014';
    });
    const elapsedMs = performance.now() - started;
    assert.ok(elapsedMs >= 5_000 && elapsedMs < 6_000, `real timeout must occupy 5-6s, observed ${Math.round(elapsedMs)}ms`);
    const rolledBack = await client.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*)::bigint AS count FROM "SpeedTimingTestClock" WHERE "id" = 236');
    assert.equal(Number(rolledBack[0]?.count), 0);
    console.log(JSON.stringify({ result: 'REAL_TIMEOUT_CONTROL', elapsedMs: Math.round(elapsedMs), error: observed }));
  });

  it('proves joined round-before-participant and participant-ID lock order with real PostgreSQL contention', { timeout: 30_000 }, async () => {
    const match = await createMatch('ticket236-real-lock-order');
    const round = await client.matchRound.findFirstOrThrow({ where: { matchId: match.matchId } });
    const participants = await client.matchParticipant.findMany({ where: { matchId: match.matchId }, orderBy: { id: 'asc' } });
    assert.equal(participants.length, 2);
    const joinedLock = `SELECT round_state."id", participant."id" AS "participantId"
      FROM "MatchRound" AS round_state
      JOIN "MatchParticipant" AS participant ON participant."matchId" = round_state."matchId"
      WHERE round_state."matchId" = $1
      ORDER BY round_state."roundNumber", participant."id"
      FOR UPDATE OF round_state, participant`;

    async function waitUntilBlocked(pid: number): Promise<void> {
      const deadline = performance.now() + 3_000;
      while (performance.now() < deadline) {
        const rows = await monitor.$queryRawUnsafe<Array<{ blocked: number[] }>>('SELECT pg_blocking_pids($1::int) AS blocked', pid);
        if ((rows[0]?.blocked.length ?? 0) > 0) return;
        await delay(20);
      }
      assert.fail(`backend ${pid} did not enter real lock contention`);
    }

    let releaseRound!: () => void;
    const roundRelease = new Promise<void>((resolve) => { releaseRound = resolve; });
    let roundHeld!: () => void;
    const roundHeldSignal = new Promise<void>((resolve) => { roundHeld = resolve; });
    const roundHolder = holder.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "MatchRound" WHERE "id" = $1 FOR UPDATE', round.id);
      roundHeld();
      await roundRelease;
    }, { timeout: 10_000 });
    await roundHeldSignal;
    let candidatePid = 0;
    const roundBlocked = client.$transaction(async (tx) => {
      candidatePid = Number((await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid'))[0]!.pid);
      return await tx.$queryRawUnsafe(joinedLock, match.matchId);
    }, { timeout: 10_000 });
    while (!candidatePid) await delay(1);
    await waitUntilBlocked(candidatePid);
    await monitor.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '100ms'`);
      await tx.$queryRawUnsafe('SELECT "id" FROM "MatchParticipant" WHERE "matchId" = $1 ORDER BY "id" FOR UPDATE', match.matchId);
    });
    releaseRound();
    await Promise.all([roundHolder, roundBlocked]);

    const high = participants[1]!;
    const low = participants[0]!;
    let releaseHigh!: () => void;
    const highRelease = new Promise<void>((resolve) => { releaseHigh = resolve; });
    let highHeld!: () => void;
    const highHeldSignal = new Promise<void>((resolve) => { highHeld = resolve; });
    const highHolder = holder.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "MatchParticipant" WHERE "id" = $1 FOR UPDATE', high.id);
      highHeld();
      await highRelease;
    }, { timeout: 10_000 });
    await highHeldSignal;
    candidatePid = 0;
    const participantBlocked = client.$transaction(async (tx) => {
      candidatePid = Number((await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid'))[0]!.pid);
      return await tx.$queryRawUnsafe(joinedLock, match.matchId);
    }, { timeout: 10_000 });
    while (!candidatePid) await delay(1);
    await waitUntilBlocked(candidatePid);
    await assert.rejects(monitor.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '100ms'`);
      await tx.$queryRawUnsafe('SELECT "id" FROM "MatchParticipant" WHERE "id" = $1 FOR UPDATE', low.id);
    }), (error) => structuredError(error).metaCode === '55P03' || structuredError(error).code === '55P03');
    releaseHigh();
    await Promise.all([highHolder, participantBlocked]);
  });

  it('rejects malformed one- and three-participant ready cardinality without a receipt', { timeout: 30_000 }, async () => {
    for (const cardinality of [1, 3] as const) {
      const match = await createMatch(`ticket236-participant-${cardinality}`);
      if (cardinality === 1) {
        await client.matchParticipant.delete({ where: { matchId_userId: { matchId: match.matchId, userId: localFixtureUsers.guestPlayer } } });
      } else {
        const third = await client.userAccount.create({ data: { displayName: 'Ticket 236 third participant' } });
        await client.matchParticipant.create({ data: { matchId: match.matchId, userId: third.id, seatNumber: 3 } });
      }
      await assert.rejects(
        creator.markReady(match.matchId, localFixtureUsers.playerOne, `ticket236-participant-${cardinality}-ready`),
        (error: any) => error?.response?.code === 'speed_ruleset_mismatch',
      );
      assert.equal(await client.matchMutationRequest.count({ where: { matchId: match.matchId } }), 0);
      assert.equal(await client.matchParticipant.count({ where: { matchId: match.matchId, readyAt: { not: null } } }), 0);
    }
  });

  it('starts projection only after the commit backend released its locks and rejects malformed round cardinality', { timeout: 60_000 }, async () => {
    const barrierMatch = await createMatch('ticket225-projection-lock-barrier');
    let commitPid = 0;
    let projectionLockCount = -1;
    const barrierService = new SpeedGameplayService({
      client: {
        $transaction: async (callback: (tx: any) => Promise<unknown>, options: any) => {
          if (options?.isolationLevel === 'ReadCommitted') {
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
            if (options?.isolationLevel === 'ReadCommitted') {
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
