import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { localFixtureUsers } from '../src/auth/current-user.service.ts';
import { StandardDictionaryService } from '../src/dictionary/standard-dictionary.service.ts';
import { DefaultOperatorReadinessVerifier, SpeedLifecycleOperatorService, type OperatorTarget } from '../src/gameplay/speed-lifecycle-operator.service.ts';
import { sha256 } from '../src/gameplay/speed-lifecycle-proof.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';

const suite = process.env.RUN_SPEED_LIFECYCLE_OPERATOR_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;
const SHA = 'a'.repeat(40);
const release = 'railway:deployment:ticket195-deployment';

type Deferred = { promise: Promise<void>; resolve: () => void };
function deferred(): Deferred { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }

suite('Ticket 195 PostgreSQL operator proof and transition', { concurrency: false }, () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const connection = (name: string) => { const url = new URL(databaseUrl); url.searchParams.set('connection_limit', '1'); url.searchParams.set('application_name', `ticket195_${name}`); return url.toString(); };
  const client = new PrismaClient();
  const holder = new PrismaClient({ datasources: { db: { url: connection('holder') } } });
  const transition = new PrismaClient({ datasources: { db: { url: connection('transition') } } });
  const monitor = new PrismaClient({ datasources: { db: { url: connection('monitor') } } });
  const prisma = { client: transition } as unknown as PrismaService;
  const schemaReadiness = new PrismaService();
  const boundedReadiness = new DefaultOperatorReadinessVerifier(schemaReadiness, new StandardDictionaryService(schemaReadiness));
  const railway: any = { observe: async () => ({
    projectId: 'ticket195-project', environmentId: 'ticket195-environment', serviceId: 'ticket195-service',
    deploymentId: 'ticket195-deployment', releaseId: release, artifactIdentity: `git:${SHA}`,
    servingReplicaCount: 2, healthHosts: ['api.example.test'], inactivePriorDeploymentIds: ['inactive-old'], rolloutSettled: true,
    servingReplicaIds: ['replica-a', 'replica-b'], servingReplicaIdsDigest: sha256(['replica-a', 'replica-b']),
    regionalAllocation: [{ region: 'eu-west4', replicaCount: 1 }, { region: 'us-east4', replicaCount: 1 }],
    regionalAllocationDigest: sha256([{ region: 'eu-west4', replicaCount: 1 }, { region: 'us-east4', replicaCount: 1 }]),
    operatorPrincipalHash: 'b'.repeat(64), inventoryDigest: 'c'.repeat(64),
  }) };
  const readiness: any = { verify: async () => ({ schema: true, dictionary: true, reconciler: true, standard: true }) };
  const operator = new SpeedLifecycleOperatorService(prisma, railway, readiness);
  const baseTarget: OperatorTarget = {
    projectId: 'ticket195-project', environmentId: 'ticket195-environment', serviceId: 'ticket195-service',
    deploymentId: 'ticket195-deployment', expectedArtifact: `git:${SHA}`, expectedReplicas: 2,
    expectedPhase: 'v1_open', expectedGeneration: 1n, healthUrl: 'https://not-called.invalid',
  };

  before(async () => { await Promise.all([client.$connect(), holder.$connect(), transition.$connect(), monitor.$connect()]); });
  after(async () => { await Promise.all([client.$disconnect(), holder.$disconnect(), transition.$disconnect(), monitor.$disconnect(), schemaReadiness.onModuleDestroy()]); });

  async function leases(generation: bigint, mutation?: 'extra' | 'duplicate' | 'provider' | 'generation' | 'region' | 'replica') {
    await (client as any).speedLifecycleCapabilityLease.deleteMany();
    const now = new Date();
    const rows = [
      ['boot-a', 'replica-a'], ['boot-b', mutation === 'duplicate' ? 'replica-a' : 'replica-b'],
      ...(mutation === 'extra' ? [['boot-c', 'replica-c']] : []),
    ];
    for (const [boot, replica] of rows) await (client as any).speedLifecycleCapabilityLease.create({ data: {
      instanceBootId: boot, serviceId: 'wordle-royale-api', releaseId: release,
      controlProtocol: 'speed_lifecycle_activation_gate_v1', supportsV1: true, supportsV2: true,
      supportsLegacyReconcile: true, observedGeneration: mutation === 'generation' ? generation + 1n : generation,
      providerProjectId: mutation === 'provider' ? 'wrong-project' : 'ticket195-project',
      providerEnvironmentId: 'ticket195-environment', providerServiceId: 'ticket195-service',
      providerDeploymentId: 'ticket195-deployment', providerReplicaId: mutation === 'replica' && boot === 'boot-b' ? 'replica-x' : replica,
      providerRegion: mutation === 'region' || boot === 'boot-a' ? 'us-east4' : 'eu-west4',
      providerArtifact: `git:${SHA}`, startedAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + 30_000),
    } });
  }

  async function ticket(db: any, mode: 'speed_1v1' | 'standard_1v1', lifecycle: string | null = null) {
    return await db.matchmakingTicket.create({ data: {
      userId: mode === 'speed_1v1' ? localFixtureUsers.playerOne : localFixtureUsers.guestPlayer,
      mode, rated: true, state: 'queued', ratingAtQueue: 1500, provisionalAtQueue: true,
      allowProvisionalOpponent: true, searchMinRating: 1400, searchMaxRating: 1600,
      expansionStep: 0, idempotencyKey: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
      readyLifecycleVersion: lifecycle,
    } });
  }

  async function failure(action: () => Promise<unknown>, code: string) {
    await assert.rejects(action, (error: any) => error?.code === code);
  }

  it('keeps dry-run at zero writes, requires the exact additive schema, and rejects hostile lease sets', async () => {
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema(true)).status, 'ok');
    await failure(() => boundedReadiness.verify('https://substitute.example.test', ['api.example.test'], 5_000), 'railway_scope_mismatch');
    await leases(1n);
    const beforeAuthority = await (client as any).speedLifecycleActivation.findUnique({ where: { key: 'speed_1v1' } });
    const beforeAudit = await (client as any).speedLifecycleActivationAudit.count();
    const result = await operator.verify(baseTarget, 'close-v2');
    assert.equal(result.matchingLeaseCount, 2);
    assert.equal(await (client as any).speedLifecycleActivationAudit.count(), beforeAudit);
    assert.deepEqual(await (client as any).speedLifecycleActivation.findUnique({ where: { key: 'speed_1v1' } }), beforeAuthority);

    await leases(1n, 'extra');
    await failure(() => operator.verify(baseTarget), 'capability_lease_extra');
    await leases(1n, 'duplicate');
    await failure(() => operator.verify(baseTarget), 'capability_replica_id_duplicate');
    await leases(1n, 'provider');
    await failure(() => operator.verify(baseTarget), 'capability_lease_provider_mismatch');
    await leases(1n, 'replica');
    await failure(() => operator.verify(baseTarget), 'capability_lease_provider_mismatch');
    await leases(1n, 'region');
    await failure(() => operator.verify(baseTarget), 'capability_lease_provider_mismatch');
    await leases(1n, 'generation');
    await failure(() => operator.verify(baseTarget), 'capability_lease_generation_mismatch');
  });

  it('fails schema readiness for provider-index and append-only-audit tampering, then recovers canonically', async () => {
    await client.$executeRawUnsafe('DROP INDEX "SpeedLifecycleCapabilityLease_release_replica_expiry_idx"');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema(true)).status, 'unavailable');
    await client.$executeRawUnsafe('CREATE INDEX "SpeedLifecycleCapabilityLease_release_replica_expiry_idx" ON "SpeedLifecycleCapabilityLease" ("releaseId", "providerReplicaId", "expiresAt")');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema(true)).status, 'ok');
    await client.$executeRawUnsafe('ALTER TABLE "SpeedLifecycleActivationAudit" DROP CONSTRAINT "SpeedLifecycleActivationAudit_proofId_key"');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema(true)).status, 'unavailable');
    await client.$executeRawUnsafe('ALTER TABLE "SpeedLifecycleActivationAudit" ADD CONSTRAINT "SpeedLifecycleActivationAudit_proofId_key" UNIQUE ("proofId")');
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema(true)).status, 'ok');
  });

  it('rejects partial provider identities and rolls authority back when the audit append fails', async () => {
    await assert.rejects(client.$executeRawUnsafe(
      `INSERT INTO "SpeedLifecycleCapabilityLease" ("instanceBootId","serviceId","releaseId","controlProtocol","supportsV1","supportsV2","supportsLegacyReconcile","observedGeneration","providerProjectId","providerEnvironmentId","providerServiceId","providerDeploymentId","providerReplicaId","providerArtifact","startedAt","lastSeenAt","expiresAt")
       VALUES ('partial-provider','api',$1,'speed_lifecycle_activation_gate_v1',true,true,true,1,'project',NULL,'service','deployment','replica',$2,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '20 seconds')`,
      release, `git:${SHA}`,
    ), (error: any) => String(error?.meta?.message ?? error).includes('SpeedLifecycleCapabilityLease_provider_identity_check'));
    await client.$executeRawUnsafe(
      `INSERT INTO "SpeedLifecycleCapabilityLease" ("instanceBootId","serviceId","releaseId","controlProtocol","supportsV1","supportsV2","supportsLegacyReconcile","observedGeneration","startedAt","lastSeenAt","expiresAt")
       VALUES ('legacy-null-provider','api',$1,'speed_lifecycle_activation_gate_v1',true,true,true,1,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '20 seconds')`, release,
    );
    await client.$executeRawUnsafe(`DELETE FROM "SpeedLifecycleCapabilityLease" WHERE "instanceBootId"='legacy-null-provider'`);
    await leases(1n);
    await client.$executeRawUnsafe(`CREATE FUNCTION ticket195_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$`);
    await client.$executeRawUnsafe(`CREATE TRIGGER ticket195_reject_audit BEFORE INSERT ON "SpeedLifecycleActivationAudit" FOR EACH ROW EXECUTE FUNCTION ticket195_reject_audit()`);
    try {
      await failure(() => operator.apply({
        operation: 'close-v2', target: baseTarget, approvalRef: 'ticket195-audit',
        confirmation: 'CLOSE SPEED V1 CREATION FOR V2 DRAIN', reason: 'ticket195 audit failure',
      }), 'activation_audit_write_failed');
      const authority = await (client as any).speedLifecycleActivation.findUniqueOrThrow({ where: { key: 'speed_1v1' } });
      assert.equal(authority.phase, 'v1_open'); assert.equal(authority.generation, 1n);
      assert.equal(await (client as any).speedLifecycleActivationAudit.count(), 0);
    } finally {
      await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS ticket195_reject_audit ON "SpeedLifecycleActivationAudit"');
      await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS ticket195_reject_audit()');
    }
    assert.equal((await schemaReadiness.checkSpeedReadyLifecycleSchema(true)).status, 'ok');
  });

  it('serializes close behind a guarded creator, writes one atomic audit, and leaves Standard available', async () => {
    await leases(1n);
    const releaseHolder = deferred();
    let inserted = false;
    const creation = holder.$transaction(async (tx) => {
      await ticket(tx, 'speed_1v1', 'speed_ready_v1_match_created_20s');
      inserted = true;
      await releaseHolder.promise;
    });
    while (!inserted) await new Promise<void>((resolve) => setImmediate(resolve));
    let settled = false;
    const applying = operator.apply({
      operation: 'close-v2', target: baseTarget, approvalRef: 'ticket198-approval-a',
      confirmation: 'CLOSE SPEED V1 CREATION FOR V2 DRAIN', reason: 'ticket195-race-close',
    }).finally(() => { settled = true; });
    let blocked = false;
    for (let attempt = 0; attempt < 2000 && !blocked; attempt += 1) {
      const rows = await monitor.$queryRawUnsafe<Array<{ blocked: boolean }>>(
        `SELECT cardinality(pg_blocking_pids(pid))>0 AS blocked FROM pg_stat_activity
         WHERE application_name='ticket195_transition' AND wait_event_type='Lock'`,
      );
      blocked = rows.some((row) => row.blocked);
      if (!blocked) await new Promise<void>((resolve) => setImmediate(resolve));
    }
    try { assert.equal(blocked, true); assert.equal(settled, false); }
    finally { releaseHolder.resolve(); }
    await creation;
    const applied = await applying;
    assert.equal(applied.generation, 2n);
    assert.equal((await (client as any).speedLifecycleActivationAudit.count()), 1);
    const audits = await (client as any).speedLifecycleActivationAudit.findMany();
    assert.equal(audits[0]?.operation, 'close-v2'); assert.equal(audits[0]?.result, 'applied');
    await assert.rejects(client.$executeRawUnsafe(`UPDATE "SpeedLifecycleActivationAudit" SET "approvalRef"='tampered'`));
    await assert.rejects(client.$executeRawUnsafe(`DELETE FROM "SpeedLifecycleActivationAudit"`));
    await assert.rejects(client.$executeRawUnsafe(`TRUNCATE "SpeedLifecycleActivationAudit"`));
    assert.equal(await (client as any).speedLifecycleActivationAudit.count(), 1);
    assert.equal((await (client as any).speedLifecycleActivation.findUnique({ where: { key: 'speed_1v1' } })).phase, 'closing_to_v2');
    assert.ok((await ticket(client, 'standard_1v1')).id);
  });

  it('requires drain and closing-generation acknowledgement before open, then proves rollback symmetry', async () => {
    await leases(2n);
    const openTarget = { ...baseTarget, expectedPhase: 'closing_to_v2' as const, expectedGeneration: 2n };
    await failure(() => operator.verify(openTarget, 'open-v2'), 'speed_v1_queue_not_drained');
    await client.matchmakingTicket.updateMany({ where: { mode: 'speed_1v1', state: 'queued' }, data: { state: 'timed_out', timedOutAt: new Date() } });
    const opened = await operator.apply({
      operation: 'open-v2', target: openTarget, approvalRef: 'ticket198-approval-b',
      confirmation: 'OPEN SPEED CREATION ON READY LIFECYCLE V2', reason: 'ticket195-open-v2',
    });
    assert.equal(opened.generation, 3n);
    assert.equal((await (client as any).speedLifecycleActivationAudit.count()), 2);
    assert.equal((await ticket(client, 'speed_1v1', 'speed_ready_v2_first_ack_90s')).readyLifecycleVersion, 'speed_ready_v2_first_ack_90s');

    await client.matchmakingTicket.updateMany({ where: { mode: 'speed_1v1', state: 'queued' }, data: { state: 'timed_out', timedOutAt: new Date() } });
    await leases(3n);
    const closeV1Target = { ...baseTarget, expectedPhase: 'v2_open' as const, expectedGeneration: 3n };
    assert.equal((await operator.apply({
      operation: 'close-v1', target: closeV1Target, approvalRef: 'rollback-close',
      confirmation: 'CLOSE SPEED V2 CREATION FOR V1 DRAIN', reason: 'ticket195-close-v1',
    })).generation, 4n);
    await leases(4n);
    const openV1Target = { ...baseTarget, expectedPhase: 'closing_to_v1' as const, expectedGeneration: 4n };
    assert.equal((await operator.apply({
      operation: 'open-v1', target: openV1Target, approvalRef: 'rollback-open',
      confirmation: 'OPEN SPEED CREATION ON READY LIFECYCLE V1', reason: 'ticket195-open-v1',
    })).generation, 5n);
    assert.equal((await (client as any).speedLifecycleActivationAudit.count()), 4);
  });
});
