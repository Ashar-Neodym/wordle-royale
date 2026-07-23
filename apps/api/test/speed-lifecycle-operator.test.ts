import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RailwayInventoryAdapter } from '../src/gameplay/railway-inventory.adapter.ts';
import { sha256 } from '../src/gameplay/speed-lifecycle-proof.ts';
import {
  DefaultOperatorReadinessVerifier,
  SpeedLifecycleOperatorError,
  SpeedLifecycleOperatorService,
  type OperatorTarget,
} from '../src/gameplay/speed-lifecycle-operator.service.ts';

const SHA = 'a'.repeat(40);
const target: OperatorTarget = {
  projectId: 'project-id', environmentId: 'environment-id', serviceId: 'service-id', deploymentId: 'deployment-id',
  expectedArtifact: `git:${SHA}`, expectedReplicas: 2, expectedPhase: 'v1_open', expectedGeneration: 1n,
  healthUrl: 'https://api.example.test',
};

function harness(options: { duplicateReplica?: boolean; extraLease?: boolean; wrongGeneration?: boolean; wrongRegion?: boolean; unexpectedReplica?: boolean; drain?: number; staleApply?: boolean; railwayDelay?: number; hangDbNow?: boolean; hangMutation?: boolean } = {}) {
  const writes: string[] = [];
  let clockCalls = 0;
  let transactionCalls = 0;
  const authority = { phase: 'v1_open', generation: 1n, targetReleaseId: null as string | null, expectedReplicaCount: null as number | null };
  const lease = (boot: string, replica: string) => ({
    instanceBootId: boot, serviceId: 'wordle-royale-api', releaseId: 'railway:deployment:deployment-id',
    controlProtocol: 'speed_lifecycle_activation_gate_v1', supportsV1: true, supportsV2: true,
    supportsLegacyReconcile: true, observedGeneration: options.wrongGeneration ? 9n : authority.generation,
    providerProjectId: 'project-id', providerEnvironmentId: 'environment-id', providerServiceId: 'service-id',
    providerDeploymentId: 'deployment-id', providerReplicaId: options.unexpectedReplica && boot === 'boot-b' ? 'replica-x' : replica,
    providerRegion: options.wrongRegion || boot === 'boot-a' ? 'us-east4' : 'eu-west4', providerArtifact: `git:${SHA}`,
  });
  const leases = () => [lease('boot-a', 'replica-a'), lease('boot-b', options.duplicateReplica ? 'replica-a' : 'replica-b'), ...(options.extraLease ? [lease('boot-c', 'replica-c')] : [])];
  const client: any = {
    async $transaction(callback: (tx: any) => Promise<unknown>, settings: { timeout?: number } = {}) {
      transactionCalls += 1;
      const shouldHang = (options.hangDbNow && transactionCalls === 1) || (options.hangMutation && transactionCalls === 4);
      if (shouldHang) return await new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('transaction timeout'), { code: 'P2028' })), settings.timeout ?? 50));
      return await callback(client);
    },
    async $queryRawUnsafe(sql: string) {
      if (sql.includes("set_config('statement_timeout'")) return [{}];
      if (sql.includes('clock_timestamp() AS now')) {
        clockCalls += 1;
        const offset = options.staleApply && clockCalls >= 3 ? 30_000 : clockCalls * 10;
        return [{ now: new Date(1_700_000_000_000 + offset) }];
      }
      if (sql.includes('FROM "SpeedLifecycleActivation"')) return [{ ...authority }];
      if (sql.includes('FROM "SpeedLifecycleCapabilityLease"')) return leases();
      if (sql.includes('FROM "MatchmakingTicket"')) return [{ count: options.drain ?? 0 }];
      if (sql.includes('FROM "SpeedLifecycleActivationAudit"')) return [];
      throw new Error('unexpected query');
    },
    async $executeRawUnsafe(sql: string, ...args: unknown[]) {
      writes.push(sql);
      if (sql.startsWith('UPDATE')) {
        authority.phase = String(args[0]);
        authority.generation = BigInt(args[2] as bigint);
        authority.targetReleaseId = args[3] as string | null;
        authority.expectedReplicaCount = args[4] as number | null;
        return 1;
      }
      return 1;
    },
  };
  const railway: any = options.railwayDelay
    ? new RailwayInventoryAdapter({ run: async () => await new Promise<never>(() => undefined) })
    : { observe: async () => ({
      projectId: target.projectId, environmentId: target.environmentId, serviceId: target.serviceId,
      deploymentId: target.deploymentId, releaseId: 'railway:deployment:deployment-id', artifactIdentity: `git:${SHA}`,
      servingReplicaCount: 2, healthHosts: ['api.example.test'], inactivePriorDeploymentIds: ['old'], rolloutSettled: true,
      servingReplicaIds: ['replica-a', 'replica-b'], servingReplicaIdsDigest: sha256(['replica-a', 'replica-b']),
      regionalAllocation: [{ region: 'eu-west4', replicaCount: 1 }, { region: 'us-east4', replicaCount: 1 }],
      regionalAllocationDigest: sha256([{ region: 'eu-west4', replicaCount: 1 }, { region: 'us-east4', replicaCount: 1 }]),
      operatorPrincipalHash: 'b'.repeat(64), inventoryDigest: 'c'.repeat(64),
    }) };
  const readiness: any = { verify: async () => ({ schema: true, dictionary: true, reconciler: true, standard: true }) };
  return { service: new SpeedLifecycleOperatorService({ client } as any, railway, readiness), writes, authority };
}

async function code(action: () => Promise<unknown>): Promise<string> {
  try { await action(); return 'PASS'; }
  catch (error) { return (error as SpeedLifecycleOperatorError).code; }
}

describe('Ticket 195 operator-bound transition service', () => {
  it('keeps dry-run read-only while proving exact provider leases and health', async () => {
    const { service, writes } = harness();
    const result = await service.verify(target, 'close-v2');
    assert.equal(result.matchingLeaseCount, 2);
    assert.equal(result.nonTargetLeaseCount, 0);
    assert.equal(result.proof.expectedActivationGeneration, 1n);
    assert.equal(writes.length, 0);
  });

  it('requires explicit approval and exact operation-specific confirmation', async () => {
    const { service, writes } = harness();
    const base = { operation: 'close-v2' as const, target, approvalRef: '', confirmation: '', reason: 'ticket-198' };
    assert.equal(await code(() => service.apply(base)), 'approval_missing');
    assert.equal(await code(() => service.apply({ ...base, approvalRef: 'approval-a', confirmation: 'wrong' })), 'confirmation_mismatch');
    assert.equal(writes.length, 0);
  });

  it('binds the health endpoint host to provider inventory before fetching', async () => {
    const verifier = new DefaultOperatorReadinessVerifier({
      checkApplicationSchema: async () => ({ status: 'ok' }),
      checkSpeedReadyLifecycleSchema: async () => ({ status: 'ok' }),
    } as any, { checkStandardDictionary: async () => ({ status: 'ok' }) } as any);
    let fetched = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { fetched = true; throw new Error('unexpected'); }) as typeof fetch;
    try {
      for (const healthUrl of [
        'https://attacker.example', 'http://localhost', 'http://127.0.0.1',
        'https://user:secret@api.example.test', 'https://api.example.test:8443',
        'https://api.example.test/path', 'https://api.example.test?token=secret', 'https://api.example.test#fragment',
      ]) assert.equal(await code(() => verifier.verify(healthUrl, ['api.example.test'])), 'railway_scope_mismatch');
      assert.equal(fetched, false);
    } finally { globalThis.fetch = originalFetch; }
  });

  it('atomically closes and appends one audit without opening automatically', async () => {
    const { service, writes, authority } = harness();
    const result = await service.apply({
      operation: 'close-v2', target, approvalRef: 'approval-a',
      confirmation: 'CLOSE SPEED V1 CREATION FOR V2 DRAIN', reason: 'ticket-198-close',
    });
    assert.equal(result.generation, 2n);
    assert.equal(authority.phase, 'closing_to_v2');
    assert.equal(writes.filter((sql) => sql.startsWith('UPDATE')).length, 1);
    assert.equal(writes.filter((sql) => sql.startsWith('INSERT')).length, 1);
  });

  it('fails closed for extra, duplicate, wrong-generation leases and stale provider proof', async () => {
    assert.equal(await code(() => harness({ extraLease: true }).service.verify(target)), 'capability_lease_extra');
    assert.equal(await code(() => harness({ duplicateReplica: true }).service.verify(target)), 'capability_replica_id_duplicate');
    assert.equal(await code(() => harness({ unexpectedReplica: true }).service.verify(target)), 'capability_lease_provider_mismatch');
    assert.equal(await code(() => harness({ wrongRegion: true }).service.verify(target)), 'capability_lease_provider_mismatch');
    assert.equal(await code(() => harness({ wrongGeneration: true }).service.verify(target)), 'capability_lease_generation_mismatch');
    const stale = harness({ staleApply: true });
    assert.equal(await code(() => stale.service.apply({
      operation: 'close-v2', target, approvalRef: 'approval-a',
      confirmation: 'CLOSE SPEED V1 CREATION FOR V2 DRAIN', reason: 'ticket-198-close',
    })), 'provider_proof_stale');
    assert.equal(stale.writes.length, 0);
  });

  it('bounds convergence work monotonically and performs no transition or audit on timeout', async () => {
    const { service, writes } = harness({ railwayDelay: 250 });
    const started = performance.now();
    assert.equal(await code(() => service.waitForConvergence({ ...target, expectedPhase: 'closing_to_v2' }, 'open-v2', 50)), 'operator_wait_timeout');
    assert.ok(performance.now() - started < 175);
    assert.equal(writes.length, 0);
  });

  it('bounds initial database clock acquisition with no writes', async () => {
    const { service, writes } = harness({ hangDbNow: true });
    const started = performance.now();
    assert.equal(await code(() => service.verify(target, undefined, 50)), 'operator_wait_timeout');
    assert.ok(performance.now() - started < 150);
    assert.deepEqual(writes, []);
  });

  it('bounds transactional readiness database work before any fetch', async () => {
    let fetched = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { fetched = true; throw new Error('unexpected fetch'); }) as typeof fetch;
    const timeoutClient: any = {
      $transaction: async (_callback: unknown, settings: { timeout?: number }) => await new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('transaction timeout'), { code: 'P2028' })), settings.timeout ?? 50)),
    };
    const verifier = new DefaultOperatorReadinessVerifier({ client: timeoutClient } as any, {} as any);
    try {
      const started = performance.now();
      assert.equal(await code(() => verifier.verify('https://api.example.test', ['api.example.test'], 50)), 'operator_wait_timeout');
      assert.ok(performance.now() - started < 150);
      assert.equal(fetched, false);
    } finally { globalThis.fetch = originalFetch; }
  });

  it('bounds the guarded mutation transaction and rolls back before writes', async () => {
    const { service, writes } = harness({ hangMutation: true });
    const started = performance.now();
    assert.equal(await code(() => service.apply({
      operation: 'close-v2', target, approvalRef: 'ticket-195',
      confirmation: 'CLOSE SPEED V1 CREATION FOR V2 DRAIN', reason: 'bounded mutation timeout',
    }, 80)), 'operator_wait_timeout');
    assert.ok(performance.now() - started < 200);
    assert.deepEqual(writes, []);
  });

  it('shares one deadline across convergence and final verification', async () => {
    const { service, writes } = harness();
    let verifyBudget = 0;
    (service as any).waitForConvergence = async () => { await new Promise((resolve) => setTimeout(resolve, 35)); return {}; };
    (service as any).verify = async (_target: unknown, _operation: unknown, timeoutMs: number) => {
      verifyBudget = timeoutMs;
      throw new SpeedLifecycleOperatorError('operator_wait_timeout');
    };
    assert.equal(await code(() => service.apply({
      operation: 'open-v2', target: { ...target, expectedPhase: 'closing_to_v2' }, approvalRef: 'ticket-195',
      confirmation: 'OPEN SPEED CREATION ON READY LIFECYCLE V2', reason: 'shared deadline proof',
    }, 50)), 'operator_wait_timeout');
    assert.ok(verifyBudget > 0 && verifyBudget < 30);
    assert.deepEqual(writes, []);
  });

  it('rejects open while the draining lifecycle still has eligible queue work', async () => {
    const state = harness({ drain: 1 });
    state.authority.phase = 'closing_to_v2';
    state.authority.generation = 2n;
    state.authority.targetReleaseId = 'railway:deployment:deployment-id';
    state.authority.expectedReplicaCount = 2;
    const openTarget = { ...target, expectedPhase: 'closing_to_v2' as const, expectedGeneration: 2n };
    assert.equal(await code(() => state.service.verify(openTarget, 'open-v2')), 'speed_v1_queue_not_drained');
    assert.equal(state.writes.length, 0);
  });
});
