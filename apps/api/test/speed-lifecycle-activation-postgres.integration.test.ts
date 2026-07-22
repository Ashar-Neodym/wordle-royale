import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { localFixtureUsers } from '../src/auth/current-user.service.ts';
import { SpeedLifecycleActivationService } from '../src/gameplay/speed-lifecycle-activation.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';

const enabled = process.env.RUN_SPEED_LIFECYCLE_ACTIVATION_POSTGRES_INTEGRATION === '1';
const suite = enabled ? describe : describe.skip;
const v1 = 'speed_ready_v1_match_created_20s';
const v2 = 'speed_ready_v2_first_ack_90s';
const release = 'ticket187-compatible-release';

type Deferred = { promise: Promise<void>; resolve: () => void };
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

suite('Ticket 187 PostgreSQL mixed-version lifecycle activation', { concurrency: false }, () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const client = new PrismaClient();
  const holder = new PrismaClient({ datasources: { db: { url: connection('holder') } } });
  const transitionClient = new PrismaClient({ datasources: { db: { url: connection('transition') } } });
  const monitor = new PrismaClient({ datasources: { db: { url: connection('monitor') } } });
  const schemaReadiness = new PrismaService();
  let providerProofValid = true;
  const activation = new SpeedLifecycleActivationService(
    { client: transitionClient } as unknown as PrismaService,
    undefined,
    { verifyTarget: async ({ targetReleaseId, expectedReplicaCount }) => ({
      proofProtocol: 'speed_provider_inventory_proof_v1',
      targetReleaseId,
      servingReplicaCount: expectedReplicaCount,
      priorReleaseIds: providerProofValid ? [] : ['obsolete-release'],
      rolloutSettled: providerProofValid,
      proofId: 'ticket187-provider-proof',
    }) },
  );
  let dictionaryReleaseId: string;

  function connection(role: string): string {
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('application_name', `ticket187_${role}`);
    return url.toString();
  }

  before(async () => {
    await Promise.all([client.$connect(), holder.$connect(), transitionClient.$connect(), monitor.$connect()]);
    const dictionary = await client.dictionaryRelease.findFirst({ orderBy: { version: 'desc' } });
    assert.ok(dictionary);
    dictionaryReleaseId = dictionary.id;
  });

  after(async () => {
    await Promise.all([client.$disconnect(), holder.$disconnect(), transitionClient.$disconnect(), monitor.$disconnect(), schemaReadiness.onModuleDestroy()]);
  });

  async function ticket(db: any, lifecycle: string | null, mode: 'speed_1v1' | 'standard_1v1' = 'speed_1v1', userId: string = localFixtureUsers.playerOne) {
    return await db.matchmakingTicket.create({ data: {
      userId, mode, rated: true, state: 'queued', ratingAtQueue: 1500,
      provisionalAtQueue: true, allowProvisionalOpponent: true,
      searchMinRating: 1400, searchMaxRating: 1600, expansionStep: 0,
      idempotencyKey: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
      readyLifecycleVersion: lifecycle,
    } });
  }

  async function match(db: PrismaClient, lifecycle: string | null, mode: 'speed_1v1' | 'standard_1v1' = 'speed_1v1') {
    return await db.match.create({ data: {
      dictionaryReleaseId, mode: 'ranked', rankedMode: mode, status: 'pending',
      idempotencyKey: randomUUID(), readyLifecycleVersion: lifecycle,
    } });
  }

  async function rejected(operation: () => Promise<unknown>, token: string) {
    await assert.rejects(operation, (error: any) => {
      assert.equal(JSON.stringify(error).includes(token) || String(error?.message).includes(token), true);
      return true;
    });
  }

  async function authority() {
    return await (client as any).speedLifecycleActivation.findUnique({ where: { key: 'speed_1v1' } });
  }

  async function lease(generation: bigint) {
    await (client as any).speedLifecycleCapabilityLease.deleteMany();
    const now = new Date();
    await (client as any).speedLifecycleCapabilityLease.create({ data: {
      instanceBootId: `ticket187-${generation}`, serviceId: 'wordle-royale-api', releaseId: release,
      controlProtocol: 'speed_lifecycle_activation_gate_v1', supportsV1: true, supportsV2: true,
      supportsLegacyReconcile: true, observedGeneration: generation,
      startedAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + 30_000),
    } });
  }

  it('seeds v1 compatibility and enforces old/new ticket and match identity while Standard bypasses the gate', async () => {
    const seeded = await authority();
    assert.equal(seeded?.phase, 'v1_open');
    assert.equal(seeded?.activeCreationVersion, v1);
    assert.equal(seeded?.generation, 1n);
    assert.equal(await (client as any).speedLifecycleActivation.count(), 1);

    const old = await ticket(client, null);
    const explicit = await ticket(client, v1, 'speed_1v1', localFixtureUsers.guestPlayer);
    assert.equal(old.readyLifecycleVersion, null);
    assert.equal(explicit.readyLifecycleVersion, v1);
    await rejected(() => ticket(client, v2), 'WR_SPEED_LIFECYCLE_VERSION_MISMATCH');
    await rejected(() => match(client, v2), 'WR_SPEED_LIFECYCLE_VERSION_MISMATCH');
    await client.matchmakingTicket.deleteMany();
    const standardTicket = await ticket(client, null, 'standard_1v1');
    const standardMatch = await match(client, null, 'standard_1v1');
    assert.equal(standardTicket.readyLifecycleVersion, null);
    assert.equal(standardMatch.readyLifecycleVersion, null);
    await client.matchmakingTicket.deleteMany();
    await client.match.deleteMany({ where: { id: standardMatch.id } });
  });

  it('serializes closing after an in-flight guarded v1 insert and closes every Speed creation path', async () => {
    await lease(1n);
    const releaseHolder = deferred();
    let insertedId: string | null = null;
    const insertion = holder.$transaction(async (tx) => {
      const created = await ticket(tx, v1);
      insertedId = created.id;
      await releaseHolder.promise;
    });
    while (!insertedId) await new Promise<void>((resolve) => setImmediate(resolve));

    let transitionSettled = false;
    const transition = activation.closeToV2({ expectedGeneration: 1n, targetReleaseId: release, expectedReplicaCount: 1, reason: 'ticket187_close_to_v2' })
      .finally(() => { transitionSettled = true; });
    let blocked = false;
    for (let attempt = 0; attempt < 2_000 && !blocked; attempt += 1) {
      const rows = await monitor.$queryRawUnsafe<Array<{ blocked: boolean }>>(
        `SELECT cardinality(pg_blocking_pids(pid))>0 AS blocked FROM pg_stat_activity
          WHERE application_name='ticket187_transition' AND wait_event_type='Lock'`,
      );
      blocked = rows.some((row) => row.blocked);
      if (!blocked) await new Promise<void>((resolve) => setImmediate(resolve));
    }
    try {
      assert.equal(blocked, true);
      assert.equal(transitionSettled, false);
    } finally {
      releaseHolder.resolve();
    }
    await insertion;
    assert.equal(await transition, 2n);
    assert.equal((await authority())?.phase, 'closing_to_v2');

    for (const lifecycle of [null, v1, v2]) {
      await rejected(() => ticket(client, lifecycle), 'WR_SPEED_CREATION_CLOSED');
      await rejected(() => match(client, lifecycle), 'WR_SPEED_CREATION_CLOSED');
    }
    await client.matchmakingTicket.updateMany({ where: { mode: 'speed_1v1', state: 'queued' }, data: { state: 'timed_out', timedOutAt: new Date() } });
    const standard = await ticket(client, null, 'standard_1v1');
    assert.ok(standard.id);
    await client.matchmakingTicket.deleteMany({ where: { mode: 'standard_1v1' } });
  });

  it('refuses stale/undrained activation, opens v2 only with exact fresh capability evidence, and rejects stale binaries', async () => {
    await assert.rejects(
      activation.openV2({ expectedGeneration: 1n, targetReleaseId: release, expectedReplicaCount: 1, reason: 'stale_generation' }),
      (error: any) => error?.response?.code === 'speed_lifecycle_transition_precondition_failed',
    );
    const blocking = await ticketDuringDisabledGuard(v1);
    await lease(2n);
    await assert.rejects(
      activation.openV2({ expectedGeneration: 2n, targetReleaseId: release, expectedReplicaCount: 1, reason: 'undrained' }),
      (error: any) => error?.response?.code === 'speed_lifecycle_transition_precondition_failed',
    );
    await client.matchmakingTicket.update({ where: { id: blocking }, data: { state: 'timed_out', timedOutAt: new Date() } });
    providerProofValid = false;
    await assert.rejects(
      activation.openV2({ expectedGeneration: 2n, targetReleaseId: release, expectedReplicaCount: 1, reason: 'provider_not_settled' }),
      (error: any) => error?.response?.code === 'speed_lifecycle_transition_precondition_failed',
    );
    providerProofValid = true;
    const now = new Date();
    await (client as any).speedLifecycleCapabilityLease.create({ data: {
      instanceBootId: 'ticket187-extra-incompatible', serviceId: 'wordle-royale-api', releaseId: release,
      controlProtocol: 'speed_lifecycle_activation_gate_v1', supportsV1: true, supportsV2: false,
      supportsLegacyReconcile: true, observedGeneration: 2n,
      startedAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + 30_000),
    } });
    await assert.rejects(
      activation.openV2({ expectedGeneration: 2n, targetReleaseId: release, expectedReplicaCount: 1, reason: 'extra_incompatible_lease' }),
      (error: any) => error?.response?.code === 'speed_lifecycle_transition_precondition_failed',
    );
    await (client as any).speedLifecycleCapabilityLease.delete({ where: { instanceBootId: 'ticket187-extra-incompatible' } });
    assert.equal(await activation.openV2({ expectedGeneration: 2n, targetReleaseId: release, expectedReplicaCount: 1, reason: 'ticket187_open_v2' }), 3n);

    await rejected(() => ticket(client, null), 'WR_SPEED_LIFECYCLE_VERSION_MISMATCH');
    await rejected(() => ticket(client, v1), 'WR_SPEED_LIFECYCLE_VERSION_MISMATCH');
    const newTicket = await ticket(client, v2);
    const newMatch = await match(client, v2);
    assert.equal(newTicket.readyLifecycleVersion, v2);
    assert.equal(newMatch.readyLifecycleVersion, v2);
    await client.matchmakingTicket.update({ where: { id: newTicket.id }, data: { state: 'timed_out', timedOutAt: new Date() } });
    await client.match.delete({ where: { id: newMatch.id } });
  });

  it('requires drain-first rollback, preserves additive schema, and reopens explicit v1 only through closing_to_v1', async () => {
    await rejected(async () => {
      await client.$executeRawUnsafe(`UPDATE "SpeedLifecycleActivation" SET "phase"='v1_open', "activeCreationVersion"=$1, "generation"=4, "updatedAt"=clock_timestamp() WHERE "key"='speed_1v1'`, v1);
    }, 'WR_SPEED_ACTIVATION_TRANSITION_REJECTED');
    await lease(3n);
    assert.equal(await activation.closeToV1({ expectedGeneration: 3n, targetReleaseId: release, expectedReplicaCount: 1, reason: 'ticket187_close_to_v1' }), 4n);
    const blocking = await ticketDuringDisabledGuard(v2);
    await lease(4n);
    await assert.rejects(
      activation.openV1({ expectedGeneration: 4n, targetReleaseId: release, expectedReplicaCount: 1, reason: 'undrained_v2' }),
      (error: any) => error?.response?.code === 'speed_lifecycle_transition_precondition_failed',
    );
    await client.matchmakingTicket.update({ where: { id: blocking }, data: { state: 'cancelled', cancelledAt: new Date() } });
    assert.equal(await activation.openV1({ expectedGeneration: 4n, targetReleaseId: release, expectedReplicaCount: 1, reason: 'ticket187_open_v1' }), 5n);
    assert.equal((await ticket(client, v1)).readyLifecycleVersion, v1);
    assert.equal(await client.$queryRawUnsafe<Array<{ present: boolean }>>(`SELECT to_regclass(current_schema()||'."SpeedLifecycleCapabilityLease"') IS NOT NULL AS present`).then((rows) => rows[0]?.present), true);
  });

  it('fails schema readiness for function, trigger, constraint, and exact activation-index tampering', async () => {
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'ok');
    const [functionRow] = await client.$queryRawUnsafe<Array<{ prosrc: string }>>(
      `SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname=current_schema() AND p.proname='wr_speed_creation_guard'`,
    );
    assert.ok(functionRow?.prosrc);
    await client.$executeRawUnsafe('CREATE OR REPLACE FUNCTION wr_speed_creation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $bad$ BEGIN RETURN NEW; END; $bad$');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'unavailable');
    await client.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION wr_speed_creation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $restore$${functionRow.prosrc}$restore$`);
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'ok');

    await client.$executeRawUnsafe('DROP TRIGGER "speed_ticket_creation_guard" ON "MatchmakingTicket"');
    await client.$executeRawUnsafe('CREATE TRIGGER "speed_ticket_creation_guard" AFTER INSERT ON "MatchmakingTicket" FOR EACH ROW EXECUTE FUNCTION wr_speed_creation_guard()');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'unavailable');
    await client.$executeRawUnsafe('DROP TRIGGER "speed_ticket_creation_guard" ON "MatchmakingTicket"');
    await client.$executeRawUnsafe('CREATE TRIGGER "speed_ticket_creation_guard" BEFORE INSERT ON "MatchmakingTicket" FOR EACH ROW EXECUTE FUNCTION wr_speed_creation_guard()');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'ok');

    const [constraintRow] = await client.$queryRawUnsafe<Array<{ definition: string }>>(
      `SELECT pg_get_constraintdef(x.oid,true) AS definition FROM pg_constraint x
        JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname=current_schema() AND x.conname='SpeedLifecycleCapabilityLease_time_check'`,
    );
    assert.ok(constraintRow?.definition);
    await client.$executeRawUnsafe('ALTER TABLE "SpeedLifecycleCapabilityLease" DROP CONSTRAINT "SpeedLifecycleCapabilityLease_time_check"');
    await client.$executeRawUnsafe('ALTER TABLE "SpeedLifecycleCapabilityLease" ADD CONSTRAINT "SpeedLifecycleCapabilityLease_time_check" CHECK (TRUE)');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'unavailable');
    await client.$executeRawUnsafe('ALTER TABLE "SpeedLifecycleCapabilityLease" DROP CONSTRAINT "SpeedLifecycleCapabilityLease_time_check"');
    await client.$executeRawUnsafe(`ALTER TABLE "SpeedLifecycleCapabilityLease" ADD CONSTRAINT "SpeedLifecycleCapabilityLease_time_check" ${constraintRow.definition}`);
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'ok');

    const releaseIndex = '"SpeedLifecycleCapabilityLease_releaseId_expiresAt_idx"';
    const protocolIndex = '"SpeedLifecycleCapabilityLease_controlProtocol_expiresAt_idx"';
    const restoreRelease = `CREATE INDEX ${releaseIndex} ON "SpeedLifecycleCapabilityLease" ("releaseId", "expiresAt")`;
    const restoreProtocol = `CREATE INDEX ${protocolIndex} ON "SpeedLifecycleCapabilityLease" ("controlProtocol", "expiresAt")`;
    const replaceIndex = async (name: string, replacement: string, restoration: string) => {
      await client.$executeRawUnsafe(`DROP INDEX ${name}`);
      await client.$executeRawUnsafe(replacement);
      assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'unavailable');
      await client.$executeRawUnsafe(`DROP INDEX ${name}`);
      await client.$executeRawUnsafe(restoration);
      assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'ok');
    };

    await replaceIndex(releaseIndex, `CREATE INDEX ${releaseIndex} ON "SpeedLifecycleCapabilityLease" ("releaseId" COLLATE "C", "expiresAt")`, restoreRelease);
    await replaceIndex(protocolIndex, `CREATE INDEX ${protocolIndex} ON "SpeedLifecycleCapabilityLease" ("controlProtocol" COLLATE "C", "expiresAt")`, restoreProtocol);
    await replaceIndex(releaseIndex, `CREATE INDEX ${releaseIndex} ON "SpeedLifecycleCapabilityLease" ("releaseId" text_pattern_ops, "expiresAt")`, restoreRelease);
    await replaceIndex(releaseIndex, `CREATE INDEX ${releaseIndex} ON "SpeedLifecycleCapabilityLease" ("expiresAt", "releaseId")`, restoreRelease);
    await replaceIndex(releaseIndex, `CREATE INDEX ${releaseIndex} ON "SpeedLifecycleCapabilityLease" (lower("releaseId"), "expiresAt")`, restoreRelease);
    await replaceIndex(releaseIndex, `CREATE INDEX ${releaseIndex} ON "SpeedLifecycleCapabilityLease" USING brin ("releaseId", "expiresAt")`, restoreRelease);
    await replaceIndex(releaseIndex, `CREATE UNIQUE INDEX ${releaseIndex} ON "SpeedLifecycleCapabilityLease" ("releaseId", "expiresAt")`, restoreRelease);
    await replaceIndex(releaseIndex, `CREATE INDEX ${releaseIndex} ON "SpeedLifecycleCapabilityLease" ("releaseId", "expiresAt") WHERE "releaseId"<>''`, restoreRelease);

    for (const flag of ['indisvalid', 'indisready'] as const) {
      await client.$executeRawUnsafe(`UPDATE pg_index SET ${flag}=false WHERE indexrelid=to_regclass(current_schema()||'.${releaseIndex}')`);
      assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'unavailable');
      await client.$executeRawUnsafe(`UPDATE pg_index SET ${flag}=true WHERE indexrelid=to_regclass(current_schema()||'.${releaseIndex}')`);
      assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'ok');
    }

    await client.$executeRawUnsafe('CREATE INDEX "ticket190_duplicate_release_expiry_idx" ON "SpeedLifecycleCapabilityLease" ("releaseId", "expiresAt")');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'unavailable');
    await client.$executeRawUnsafe('DROP INDEX "ticket190_duplicate_release_expiry_idx"');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'ok');

    const schemaRows = await client.$queryRawUnsafe<Array<{ schema_name: string }>>('SELECT current_schema() AS schema_name');
    const activeSchema = schemaRows[0]?.schema_name;
    assert.ok(activeSchema);
    const decoySchema = `${activeSchema}_decoy`.slice(0, 63);
    assert.match(decoySchema, /^ticket187_[a-z0-9_]+_decoy$/);
    await client.$executeRawUnsafe(`CREATE SCHEMA "${decoySchema}"`);
    try {
      await client.$executeRawUnsafe(`CREATE TABLE "${decoySchema}"."SpeedLifecycleCapabilityLease" ("releaseId" text NOT NULL, "expiresAt" timestamp(3) NOT NULL)`);
      await client.$executeRawUnsafe(`CREATE INDEX "SpeedLifecycleCapabilityLease_releaseId_expiresAt_idx" ON "${decoySchema}"."SpeedLifecycleCapabilityLease" ("releaseId", "expiresAt")`);
      await client.$executeRawUnsafe(`DROP INDEX ${releaseIndex}`);
      assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'unavailable');
      await client.$executeRawUnsafe(restoreRelease);
      assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema()).status, 'ok');
    } finally {
      await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${decoySchema}" CASCADE`);
    }
  });

  it('fails Speed closed when authority is missing while Standard remains writable', async () => {
    await client.matchmakingTicket.deleteMany();
    await client.$executeRawUnsafe('ALTER TABLE "SpeedLifecycleActivation" DISABLE TRIGGER "speed_activation_transition_guard"');
    await (client as any).speedLifecycleActivation.deleteMany();
    await client.$executeRawUnsafe('ALTER TABLE "SpeedLifecycleActivation" ENABLE TRIGGER "speed_activation_transition_guard"');
    await rejected(() => ticket(client, v1), 'WR_SPEED_ACTIVATION_MISSING');
    const standard = await ticket(client, null, 'standard_1v1');
    assert.ok(standard.id);
  });

  async function ticketDuringDisabledGuard(lifecycle: string): Promise<string> {
    await client.$executeRawUnsafe('ALTER TABLE "MatchmakingTicket" DISABLE TRIGGER "speed_ticket_creation_guard"');
    try {
      return (await ticket(client, lifecycle)).id;
    } finally {
      await client.$executeRawUnsafe('ALTER TABLE "MatchmakingTicket" ENABLE TRIGGER "speed_ticket_creation_guard"');
    }
  }
});
