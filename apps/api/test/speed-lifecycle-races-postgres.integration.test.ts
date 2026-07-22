import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { localFixtureUsers } from '../src/auth/current-user.service.ts';
import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import { SpeedRuntimeHealthService } from '../src/gameplay/speed-runtime-health.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';

const enabled = process.env.RUN_SPEED_LIFECYCLE_RACE_POSTGRES_INTEGRATION === '1';
const suite = enabled ? describe : describe.skip;
const base = new Date('2026-07-18T12:00:00.000Z');
const at = (ms: number) => new Date(base.getTime() + ms);

type Deferred<T = void> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

suite('Ticket 185 deterministic hostile Speed lifecycle race matrix', () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const parsedDatabaseUrl = new URL(databaseUrl);
  const schemaTag = parsedDatabaseUrl.searchParams.get('schema') ?? 'ticket185';
  const mainApplicationName = parsedDatabaseUrl.searchParams.get('application_name') ?? `ticket185_${schemaTag}`.slice(0, 63);
  const keyBase = 185_000 + [...schemaTag].reduce((total, character) => (total + character.charCodeAt(0)) % 10_000, 0) * 10;
  const client = new PrismaClient();
  const holder = new PrismaClient({ datasources: { db: { url: withConnection('ticket185_holder') } } });
  const advisory = new PrismaClient({ datasources: { db: { url: withConnection('ticket185_advisory') } } });
  const monitor = new PrismaClient({ datasources: { db: { url: withConnection('ticket185_monitor') } } });
  const prisma = { client } as unknown as PrismaService;
  const ratings = new GameplayPersistenceService(prisma);
  const operational = { assertAvailable: async () => {}, assertDependenciesAvailable: async () => {} } as any;
  const speed = new SpeedGameplayService(prisma, ratings, operational);
  let releaseId: string;

  function withConnection(role: string): string {
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('application_name', `ticket185_${schemaTag}_${role}`.slice(0, 63));
    return url.toString();
  }

  before(async () => {
    await Promise.all([client.$connect(), holder.$connect(), advisory.$connect(), monitor.$connect()]);
    await client.$executeRawUnsafe(`UPDATE "SpeedLifecycleActivation" SET "phase"='closing_to_v2', "activeCreationVersion"=NULL, "generation"=2, "targetReleaseId"='ticket-test-release', "expectedReplicaCount"=1, "transitionReason"='disposable_test_activation', "updatedAt"=clock_timestamp() WHERE "key"='speed_1v1'`);
    await client.$executeRawUnsafe(`UPDATE "SpeedLifecycleActivation" SET "phase"='v2_open', "activeCreationVersion"='speed_ready_v2_first_ack_90s', "generation"=3, "transitionReason"='disposable_test_activation', "updatedAt"=clock_timestamp() WHERE "key"='speed_1v1'`);
    await client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "SpeedTimingTestClock" ("id" integer PRIMARY KEY, "now" timestamptz NOT NULL)');
    await client.$executeRawUnsafe('INSERT INTO "SpeedTimingTestClock" ("id", "now") VALUES (1, $1) ON CONFLICT ("id") DO UPDATE SET "now" = EXCLUDED."now"', base);
    const release = await client.dictionaryRelease.findFirst({ orderBy: { version: 'desc' } });
    assert.ok(release);
    releaseId = release.id;
  });

  beforeEach(async () => {
    await dropBarrierTrigger();
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
    await setClock(base);
  });

  after(async () => {
    await dropBarrierTrigger();
    await client.$executeRawUnsafe('DROP TABLE IF EXISTS "SpeedTimingTestClock"');
    await Promise.all([client.$disconnect(), holder.$disconnect(), advisory.$disconnect(), monitor.$disconnect()]);
  });

  async function setClock(now: Date) {
    await client.$executeRawUnsafe('UPDATE "SpeedTimingTestClock" SET "now" = $1 WHERE "id" = 1', now);
  }

  async function createMatch(key: string) {
    await setClock(base);
    return await client.$transaction(async (tx) => await speed.createSpeedMatch({
      dictionaryReleaseId: releaseId,
      participantUserIds: [localFixtureUsers.playerOne, localFixtureUsers.guestPlayer],
      idempotencyKey: key,
      readyLifecycleVersion: 'speed_ready_v2_first_ack_90s',
      activationGeneration: 3n,
    }, tx));
  }

  async function revealMatch(key: string) {
    const match = await createMatch(key);
    await setClock(at(1_000));
    await speed.markReady(match.matchId, localFixtureUsers.playerOne, `${key}-ready-one`);
    await setClock(at(2_000));
    await speed.markReady(match.matchId, localFixtureUsers.guestPlayer, `${key}-ready-two`);
    return match;
  }

  async function waitFor(label: string, predicate: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      if (await predicate()) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const activity = await monitor.$queryRawUnsafe('SELECT pid, application_name, state, wait_event_type, wait_event, query FROM pg_stat_activity WHERE datname = current_database() ORDER BY pid');
    throw new Error(`${label} barrier not reached: ${JSON.stringify(activity)}`);
  }

  async function blockedMatchLockBackends(): Promise<Array<{ pid: number; blockers: number[] }>> {
    return await monitor.$queryRawUnsafe(
      `SELECT pid, pg_blocking_pids(pid) AS "blockers"
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND application_name = $1
          AND wait_event_type = 'Lock'
          AND cardinality(pg_blocking_pids(pid)) > 0
          AND query LIKE '%FROM "Match" WHERE "id" = $1 FOR UPDATE%'
        ORDER BY pid`,
      mainApplicationName,
    ) as Array<{ pid: number; blockers: number[] }>;
  }

  async function blockedMatchLockCount(): Promise<number> {
    return (await blockedMatchLockBackends()).length;
  }

  async function advisoryWaiterCount(key: number): Promise<number> {
    const rows = await monitor.$queryRawUnsafe(
      `SELECT count(*)::int AS "count"
         FROM pg_locks locks
         JOIN pg_stat_activity activity ON activity.pid = locks.pid
        WHERE locks.locktype = 'advisory'
          AND NOT locks.granted
          AND locks.objid = $1
          AND activity.application_name = $2`,
      key,
      mainApplicationName,
    ) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  async function holdMatch(matchId: string) {
    const acquired = deferred();
    const release = deferred();
    const done = holder.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Match" WHERE "id" = $1 FOR UPDATE', matchId);
      acquired.resolve();
      await release.promise;
    }, { timeout: 10_000 });
    await acquired.promise;
    return { release: () => release.resolve(), done };
  }

  async function holdAdvisory(key: number) {
    const acquired = deferred();
    const release = deferred();
    const done = advisory.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1)::text AS "locked"', key);
      acquired.resolve();
      await release.promise;
    }, { timeout: 10_000 });
    await acquired.promise;
    return { release: () => release.resolve(), done };
  }

  async function installBarrierTrigger(kind: 'ready' | 'cancel', key: number) {
    await dropBarrierTrigger();
    const condition = kind === 'ready'
      ? 'NEW."readyAt" IS DISTINCT FROM OLD."readyAt"'
      : 'NEW."terminalReason" = \'no_contest\' AND OLD."terminalReason" IS DISTINCT FROM NEW."terminalReason"';
    await client.$executeRawUnsafe(`CREATE FUNCTION "ticket185_participant_barrier"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN PERFORM pg_advisory_xact_lock(${key}); END IF; RETURN NEW; END $$`);
    await client.$executeRawUnsafe('CREATE TRIGGER "ticket185_participant_barrier_trigger" BEFORE UPDATE ON "MatchParticipant" FOR EACH ROW EXECUTE FUNCTION "ticket185_participant_barrier"()');
  }

  async function dropBarrierTrigger() {
    await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS "ticket185_participant_barrier_trigger" ON "MatchParticipant"');
    await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS "ticket185_participant_barrier"()');
  }

  async function assertNoContest(matchId: string, reason: string) {
    const match = await client.match.findUnique({ where: { id: matchId }, include: { participants: true, rounds: true } });
    assert.equal(match?.status, 'voided');
    assert.equal(match?.completionReason, reason);
    assert.equal(match?.participants.every((participant) => participant.result === 'void' && participant.terminalReason === 'no_contest'), true);
    assert.equal(await client.ratingEvent.count({ where: { matchId, type: 'apply' } }), 0);
    return match!;
  }

  it('proves both ready requests reach the contested Match lock before either commits', async () => {
    const game = await createMatch('race-both-ready-lock');
    await setClock(at(2_000));
    const lock = await holdMatch(game.matchId);
    let settled = 0;
    const first = speed.markReady(game.matchId, localFixtureUsers.playerOne, '18500000-0000-4000-8000-000000000001').finally(() => { settled += 1; });
    const second = speed.markReady(game.matchId, localFixtureUsers.guestPlayer, '18500000-0000-4000-8000-000000000002').finally(() => { settled += 1; });
    void first.catch(() => undefined);
    void second.catch(() => undefined);
    let outcomes: PromiseSettledResult<unknown>[] = [];
    try {
      await waitFor('two ready Match-lock waiters', async () => await blockedMatchLockCount() >= 2);
      const blocked = await blockedMatchLockBackends();
      assert.equal(blocked.length, 2);
      assert.equal(new Set(blocked.map((backend) => backend.pid)).size, 2);
      assert.equal(blocked.every((backend) => backend.blockers.length > 0), true);
      assert.equal(settled, 0);
    } finally {
      lock.release();
      outcomes = await Promise.allSettled([lock.done, first, second]);
    }
    assert.equal(outcomes.every((outcome) => outcome.status === 'fulfilled'), true);
    const match = await client.match.findUnique({ where: { id: game.matchId }, include: { participants: true, rounds: true } });
    assert.equal(match?.participants.every((participant) => participant.readyAt?.toISOString() === at(2_000).toISOString()), true);
    assert.equal(match?.readyWindowStartedAt?.toISOString(), at(2_000).toISOString());
    assert.equal(match?.readyDeadlineAt?.toISOString(), at(22_000).toISOString());
    assert.equal(match?.startedAt?.toISOString(), at(5_000).toISOString());
    assert.equal(match?.rounds[0]?.startedAt?.toISOString(), at(5_000).toISOString());
    assert.equal(match?.rounds[0]?.deadlineAt?.toISOString(), at(80_000).toISOString());
    assert.equal(await client.matchMutationRequest.count({ where: { matchId: game.matchId, kind: 'speed_ready' } }), 2);
    assert.equal(await client.ratingEvent.count({ where: { matchId: game.matchId, type: 'apply' } }), 0);
  });

  it('proves ready-first and cancellation-first pre-start lock ordering', async () => {
    for (const order of ['ready-first', 'cancel-first'] as const) {
      const game = await createMatch(`race-${order}`);
      await setClock(at(1_000));
      await speed.markReady(game.matchId, localFixtureUsers.playerOne, `${order}-first-ready`);
      await setClock(at(2_000));
      const key = keyBase + (order === 'ready-first' ? 1 : 2);
      await installBarrierTrigger(order === 'ready-first' ? 'ready' : 'cancel', key);
      const barrier = await holdAdvisory(key);
      const winner = order === 'ready-first'
        ? speed.markReady(game.matchId, localFixtureUsers.guestPlayer, `${order}-second-ready`)
        : speed.forfeit(game.matchId, localFixtureUsers.playerOne, `${order}-cancel`);
      void winner.catch(() => undefined);
      let loser: Promise<unknown> | undefined;
      let outcomes: PromiseSettledResult<unknown>[] = [];
      try {
        await waitFor(`${order} advisory stage`, async () => await advisoryWaiterCount(key) === 1);
        loser = order === 'ready-first'
          ? speed.forfeit(game.matchId, localFixtureUsers.playerOne, `${order}-cancel`)
          : speed.markReady(game.matchId, localFixtureUsers.guestPlayer, `${order}-second-ready`);
        void loser.catch(() => undefined);
        await waitFor(`${order} losing Match waiter`, async () => await blockedMatchLockCount() >= 1);
      } finally {
        barrier.release();
        outcomes = await Promise.allSettled([barrier.done, winner, ...(loser ? [loser] : [])]);
        await dropBarrierTrigger();
      }
      assert.equal(outcomes.length, 3);
      assert.equal(outcomes.every((outcome) => outcome.status === 'fulfilled'), true);
      const snapshots = outcomes.slice(1).map((outcome) => (outcome as PromiseFulfilledResult<unknown>).value);
      const terminal = await assertNoContest(game.matchId, 'pre_start_cancelled');
      assert.equal(terminal.readyWindowStartedAt?.toISOString(), at(1_000).toISOString());
      assert.equal(terminal.readyDeadlineAt?.toISOString(), at(21_000).toISOString());
      assert.equal(terminal.startedAt?.toISOString() ?? null, order === 'ready-first' ? at(5_000).toISOString() : null);
      assert.equal(terminal.rounds[0]?.startedAt?.toISOString() ?? null, order === 'ready-first' ? at(5_000).toISOString() : null);
      assert.equal(terminal.rounds[0]?.deadlineAt?.toISOString() ?? null, order === 'ready-first' ? at(80_000).toISOString() : null);
      assert.doesNotMatch(JSON.stringify(snapshots), /answerWordHash|answerHash|salt|normalizedGuess|dictionaryWord/i);
      assert.equal(await client.matchMutationRequest.count({ where: { matchId: game.matchId, kind: 'speed_ready' } }), order === 'ready-first' ? 2 : 1);
    }
  });

  it('proves ready versus worker expiry and exact ready-deadline selection boundary', async () => {
    const game = await createMatch('race-ready-worker');
    await setClock(at(1_000));
    await speed.markReady(game.matchId, localFixtureUsers.playerOne, 'race-ready-worker-first');
    await setClock(at(21_000));
    assert.equal(await speed.reconcileDue(), 0);
    await setClock(at(21_001));
    const reached = deferred();
    const release = deferred();
    const worker = speed.reconcileDue(25, undefined, async () => { reached.resolve(); await release.promise; });
    void worker.catch(() => undefined);
    await reached.promise;
    const lateReady = speed.markReady(game.matchId, localFixtureUsers.guestPlayer, 'race-ready-worker-late');
    void lateReady.catch(() => undefined);
    let outcomes: PromiseSettledResult<unknown>[] = [];
    try {
      await waitFor('late ready blocked by expiry worker', async () => await blockedMatchLockCount() >= 1);
    } finally {
      release.resolve();
      outcomes = await Promise.allSettled([worker, lateReady]);
    }
    assert.equal(outcomes[0]?.status, 'fulfilled');
    if (outcomes[0]?.status === 'fulfilled') assert.equal(outcomes[0].value, 1);
    assert.equal(outcomes[1]?.status, 'rejected');
    if (outcomes[1]?.status === 'rejected') assert.equal((outcomes[1].reason as any)?.response?.code, 'ready_deadline_passed');
    assert.equal(await speed.reconcileDue(), 0);
    await assertNoContest(game.matchId, 'ready_timeout');
    assert.equal(await client.matchMutationRequest.count({ where: { matchId: game.matchId, kind: 'speed_ready' } }), 1);
  });

  it('proves two reconcilers select and terminalize one due match exactly once', async () => {
    const game = await createMatch('race-two-workers');
    await setClock(at(90_001));
    const reached = deferred();
    const release = deferred();
    const first = speed.reconcileDue(25, undefined, async () => { reached.resolve(); await release.promise; });
    void first.catch(() => undefined);
    await reached.promise;
    let second: number | undefined;
    let firstOutcome: PromiseSettledResult<number> | undefined;
    try {
      second = await speed.reconcileDue();
      assert.equal(second, 0);
    } finally {
      release.resolve();
      [firstOutcome] = await Promise.allSettled([first]);
    }
    assert.equal(firstOutcome?.status, 'fulfilled');
    if (firstOutcome?.status === 'fulfilled') assert.equal(firstOutcome.value, 1);
    const terminal = await assertNoContest(game.matchId, 'invitation_timeout');
    const timestamps = [terminal.adjudicatedAt, terminal.completedAt, terminal.voidedAt, terminal.rounds[0]?.completedAt].map((value) => value?.toISOString());
    assert.equal(await speed.reconcileDue(), 0);
    const reread = await client.match.findUnique({ where: { id: game.matchId }, include: { rounds: true } });
    assert.deepEqual([reread?.adjudicatedAt, reread?.completedAt, reread?.voidedAt, reread?.rounds[0]?.completedAt].map((value) => value?.toISOString()), timestamps);
  });

  it('rolls back expiry when scheduler generation changes after eligibility but before commit', async () => {
    const game = await createMatch('race-generation-before-commit');
    await setClock(at(90_001));
    let monotonicNow = 0;
    const health = new SpeedRuntimeHealthService(() => monotonicNow);
    const epoch = health.markSchedulerStarted();
    const pass = health.markPassStarted(epoch)!;
    assert.equal(health.isPassCompletionEligible(pass), true);
    const reached = deferred();
    const release = deferred();
    const obsolete = speed.reconcileDue(25, () => health.isPassCompletionEligible(pass), async () => { reached.resolve(); await release.promise; });
    void obsolete.catch(() => undefined);
    await reached.promise;
    let outcome: PromiseSettledResult<number> | undefined;
    try {
      assert.equal(health.markSchedulerStopped(epoch), true);
      const nextEpoch = health.markSchedulerStarted();
      assert.ok(health.markPassStarted(nextEpoch));
      monotonicNow = 1;
    } finally {
      release.resolve();
      [outcome] = await Promise.allSettled([obsolete]);
    }
    assert.equal(outcome?.status, 'rejected');
    if (outcome?.status === 'rejected') assert.match(String(outcome.reason), /obsolete_speed_reconciler_pass/);
    const rolledBack = await client.match.findUnique({ where: { id: game.matchId }, include: { participants: true, rounds: true } });
    assert.equal(rolledBack?.status, 'pending');
    assert.equal(rolledBack?.adjudicatedAt, null);
    assert.equal(rolledBack?.participants.every((participant) => participant.terminalReason === null), true);
    assert.equal(rolledBack?.rounds[0]?.completedAt, null);
    assert.equal(await client.ratingEvent.count({ where: { matchId: game.matchId } }), 0);
  });

  it('distinguishes cancellation immediately before from exactly at startsAt', async () => {
    const beforeStart = await revealMatch('race-cancel-before-start');
    const beforePersisted = await client.match.findUnique({ where: { id: beforeStart.matchId }, include: { rounds: true } });
    await setClock(at(4_999));
    await speed.forfeit(beforeStart.matchId, localFixtureUsers.playerOne, 'race-cancel-before-start-op');
    await assertNoContest(beforeStart.matchId, 'pre_start_cancelled');
    const beforeAfter = await client.match.findUnique({ where: { id: beforeStart.matchId }, include: { rounds: true } });
    assert.equal(beforeAfter?.startedAt?.toISOString(), beforePersisted?.startedAt?.toISOString());
    assert.equal(beforeAfter?.rounds[0]?.deadlineAt?.toISOString(), beforePersisted?.rounds[0]?.deadlineAt?.toISOString());

    const atStart = await revealMatch('race-cancel-at-start');
    const atPersisted = await client.match.findUnique({ where: { id: atStart.matchId }, include: { rounds: true } });
    await setClock(at(5_000));
    const result = await speed.forfeit(atStart.matchId, localFixtureUsers.playerOne, 'race-cancel-at-start-op');
    assert.equal(result.state, 'completed');
    assert.equal(result.myState.result, 'loss');
    const opponent = await speed.getSnapshot(atStart.matchId, localFixtureUsers.guestPlayer);
    assert.equal(opponent.myState.result, 'win');
    assert.equal(await client.ratingEvent.count({ where: { matchId: atStart.matchId, type: 'apply' } }), 2);
    const atAfter = await client.match.findUnique({ where: { id: atStart.matchId }, include: { rounds: true } });
    assert.equal(atAfter?.completionReason, 'forfeit');
    assert.equal(atAfter?.startedAt?.toISOString(), atPersisted?.startedAt?.toISOString());
    assert.equal(atAfter?.rounds[0]?.deadlineAt?.toISOString(), atPersisted?.rounds[0]?.deadlineAt?.toISOString());
  });

  it('replays a committed ready operation after expiry before worker/read terminalization', async () => {
    const game = await createMatch('race-replay-before-terminalization');
    const requestId = '18500000-0000-4000-8000-000000000099';
    await setClock(at(1_000));
    const original = await speed.markReady(game.matchId, localFixtureUsers.playerOne, requestId);
    assert.equal(original.readyLifecycleVersion, 'speed_ready_v2_first_ack_90s');
    assert.ok('readyWindowStartedAt' in original);
    const immutable = [(original as any).readyWindowStartedAt, original.readyDeadlineAt, original.startsAt, original.deadlineAt];
    await setClock(at(21_001));
    const replayBeforeWorker = await speed.markReady(game.matchId, localFixtureUsers.playerOne, requestId);
    assert.equal(replayBeforeWorker.readyLifecycleVersion, 'speed_ready_v2_first_ack_90s');
    assert.ok('readyWindowStartedAt' in replayBeforeWorker);
    assert.equal(replayBeforeWorker.readiness.viewerReadyOperationId, requestId);
    assert.deepEqual([(replayBeforeWorker as any).readyWindowStartedAt, replayBeforeWorker.readyDeadlineAt, replayBeforeWorker.startsAt, replayBeforeWorker.deadlineAt], immutable);
    assert.equal((await client.match.findUnique({ where: { id: game.matchId } }))?.status, 'pending');
    assert.equal(await client.matchMutationRequest.count({ where: { matchId: game.matchId, kind: 'speed_ready', clientRequestId: requestId } }), 1);
    assert.equal(await speed.reconcileDue(), 1);
    const terminalReplay = await speed.markReady(game.matchId, localFixtureUsers.playerOne, requestId);
    assert.equal(terminalReplay.state, 'voided');
    assert.equal(terminalReplay.readiness.viewerReadyOperationId, requestId);
    await assertNoContest(game.matchId, 'ready_timeout');
    assert.equal(await client.matchMutationRequest.count({ where: { matchId: game.matchId, kind: 'speed_ready', clientRequestId: requestId } }), 1);
  });
});
