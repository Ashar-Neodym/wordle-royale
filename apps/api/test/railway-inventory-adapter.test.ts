import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  RailwayInventoryAdapter,
  RailwayInventoryError,
  type RailwayCommandExecutor,
  type RailwayCommandResult,
} from '../src/gameplay/railway-inventory.adapter.ts';

const SHA = 'a'.repeat(40);
const scope = { projectId: 'project-id', environmentId: 'environment-id', serviceId: 'service-id', deploymentId: 'deployment-id' };
const LIVE_STATUS = JSON.parse(readFileSync(new URL('./fixtures/railway-status-5.27.1-live-sanitized.json', import.meta.url), 'utf8')) as unknown;

function statusFixture(
  instances: Array<{ id: string; status: string }> = [{ id: 'replica-a', status: 'RUNNING' }, { id: 'replica-b', status: 'RUNNING' }],
  numReplicas: number | null = 2,
) {
  return {
    id: scope.projectId,
    environments: { edges: [{ node: {
      id: scope.environmentId,
      serviceInstances: { edges: [{ node: {
        serviceId: scope.serviceId, environmentId: scope.environmentId, numReplicas,
        latestDeployment: { id: scope.deploymentId, status: 'SUCCESS' },
        activeDeployments: [{ id: scope.deploymentId, status: 'SUCCESS', deploymentStopped: false, instances }],
        domains: { serviceDomains: [{ domain: 'api.example.test' }], customDomains: [] },
      } }] },
    } }] },
    services: { edges: [{ node: { id: scope.serviceId } }] },
  };
}

function executor(overrides: { status?: unknown; linkedStatus?: unknown; scopedStatus?: unknown; deployments?: unknown; config?: unknown; whoami?: string; version?: string; delayMs?: number } = {}): RailwayCommandExecutor & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push([...args]);
      if (overrides.delayMs) await new Promise<void>((resolve) => setTimeout(resolve, overrides.delayMs));
      if (args[0] === '--version') return { stdout: overrides.version ?? 'railway 5.27.1', stderr: '' };
      if (args[0] === 'whoami') return { stdout: overrides.whoami ?? 'Operator@example.com', stderr: '' };
      if (args[0] === 'status') return { stdout: JSON.stringify((args.includes('--project')
        ? overrides.scopedStatus ?? overrides.status
        : overrides.linkedStatus ?? overrides.status) ?? {
        id: scope.projectId,
        environments: { edges: [{ node: {
          id: scope.environmentId,
          serviceInstances: { edges: [{ node: {
            serviceId: scope.serviceId, environmentId: scope.environmentId, numReplicas: 2,
            latestDeployment: { id: scope.deploymentId, status: 'SUCCESS' },
            activeDeployments: [{ id: scope.deploymentId, status: 'SUCCESS', deploymentStopped: false, instances: [{ id: 'replica-a', status: 'RUNNING' }, { id: 'replica-b', status: 'RUNNING' }] }],
            domains: { serviceDomains: [{ domain: 'api.example.test' }], customDomains: [] },
          } }] },
        } }] },
        services: { edges: [{ node: { id: scope.serviceId } }] },
      }), stderr: '' };
      if (args[0] === 'deployment') return { stdout: JSON.stringify(overrides.deployments ?? { deployments: [
        { id: scope.deploymentId, status: 'SUCCESS', createdAt: '2026-07-21T00:00:00Z', meta: { commitHash: SHA } },
        { id: 'old', status: 'REMOVED', createdAt: '2026-07-20T00:00:00Z', meta: {} },
      ], hasNextPage: false }), stderr: '' };
      return { stdout: JSON.stringify(overrides.config ?? { services: {
        [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 2 } } } },
      } }), stderr: '' };
    },
  };
}

async function failure(adapter: RailwayInventoryAdapter, expectedReplicas = 2): Promise<string> {
  try { await adapter.observe(scope, `git:${SHA}`, expectedReplicas); return 'PASS'; }
  catch (error) { return (error as RailwayInventoryError).code; }
}

describe('Ticket 195 strict Railway inventory adapter', () => {
  it('accepts the permanent sanitized Railway 5.27.1 live shape using complete regional cardinality', async () => {
    const result = await new RailwayInventoryAdapter(executor({
      status: LIVE_STATUS,
      config: { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 1 } } } } } },
    })).observe(scope, `git:${SHA}`, 1);
    assert.equal(result.servingReplicaCount, 1);
    assert.deepEqual(result.servingReplicaIds, ['replica-running']);
    assert.deepEqual(result.regionalAllocation, [{ region: 'sfo', replicaCount: 1 }]);
    assert.deepEqual(result.healthHosts, ['api.example.test']);
  });

  it('fails closed on incomplete regional cardinality for nullable and present status counts', async () => {
    const configs = [
      { services: { [scope.serviceId]: { deploy: {} } } },
      { services: { [scope.serviceId]: { deploy: { multiRegionConfig: {} } } } },
      { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 0 } } } } } },
      { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: -1 } } } } } },
      { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { ' sfo ': { numReplicas: 1 } } } } } },
    ];
    for (const config of configs) {
      assert.equal(await failure(new RailwayInventoryAdapter(executor({ status: LIVE_STATUS, config })), 1), 'railway_replica_count_unknown');
    }
    assert.equal(await failure(new RailwayInventoryAdapter(executor({
      status: statusFixture([{ id: 'replica-a', status: 'RUNNING' }], null),
      config: { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 2 } } } } } },
    })), 1), 'railway_replica_count_unknown');
    assert.equal(await failure(new RailwayInventoryAdapter(executor({
      status: statusFixture(undefined, 2),
      config: { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 1 } } } } } },
    }))), 'railway_replica_count_unknown');
  });

  it('accepts only RUNNING as serving, excludes REMOVED, and rejects every other instance state', async () => {
    assert.equal(await failure(new RailwayInventoryAdapter(executor({
      status: statusFixture([{ id: 'removed', status: 'REMOVED' }], null),
      config: { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 1 } } } } } },
    })), 1), 'railway_replica_count_unknown');
    assert.equal(await failure(new RailwayInventoryAdapter(executor({
      status: statusFixture([{ id: 'a', status: 'RUNNING' }, { id: 'b', status: 'RUNNING' }, { id: 'old', status: 'REMOVED' }], null),
      config: { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 1 } } } } } },
    })), 1), 'railway_replica_count_unknown');
    for (const status of ['SUCCESS', 'DEPLOYING', 'INITIALIZING', 'FAILED', 'CRASHED', 'UNKNOWN']) {
      assert.equal(await failure(new RailwayInventoryAdapter(executor({
        status: statusFixture([{ id: 'replica-a', status }, { id: 'replica-b', status: 'RUNNING' }]),
      }))), 'railway_rollout_not_settled', status);
    }
  });

  it('rejects overlapping active deployment entries even when the target remains successful', async () => {
    const status: any = statusFixture();
    status.environments.edges[0].node.serviceInstances.edges[0].node.activeDeployments.push({
      id: 'overlap', status: 'SUCCESS', deploymentStopped: false, instances: [{ id: 'replica-x', status: 'RUNNING' }],
    });
    assert.equal(await failure(new RailwayInventoryAdapter(executor({ status }))), 'railway_target_not_success');
  });

  it('rejects malformed settlement, terminal identities, health rows, deployment evidence, and linked/scoped disagreement', async () => {
    const missingStopped: any = structuredClone(LIVE_STATUS);
    delete missingStopped.environments.edges[0].node.serviceInstances.edges[0].node.activeDeployments[0].deploymentStopped;
    assert.equal(await failure(new RailwayInventoryAdapter(executor({
      status: missingStopped,
      config: { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 1 } } } } } },
    })), 1), 'railway_target_not_success');

    const blankRemoved: any = structuredClone(LIVE_STATUS);
    blankRemoved.environments.edges[0].node.serviceInstances.edges[0].node.activeDeployments[0].instances[1].id = '';
    assert.equal(await failure(new RailwayInventoryAdapter(executor({
      status: blankRemoved,
      config: { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 1 } } } } } },
    })), 1), 'railway_inventory_schema_unsupported');

    const malformedDomain: any = structuredClone(LIVE_STATUS);
    malformedDomain.environments.edges[0].node.serviceInstances.edges[0].node.domains.customDomains.push({ domain: 17 });
    assert.equal(await failure(new RailwayInventoryAdapter(executor({
      status: malformedDomain,
      config: { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 1 } } } } } },
    })), 1), 'railway_inventory_schema_unsupported');

    const scoped: any = structuredClone(LIVE_STATUS);
    scoped.environments.edges[0].node.serviceInstances.edges[0].node.activeDeployments[0].instances[1].id = 'different-removed';
    assert.equal(await failure(new RailwayInventoryAdapter(executor({
      linkedStatus: LIVE_STATUS, scopedStatus: scoped,
      config: { services: { [scope.serviceId]: { deploy: { multiRegionConfig: { sfo: { numReplicas: 1 } } } } } },
    })), 1), 'railway_inventory_schema_unsupported');

    assert.equal(await failure(new RailwayInventoryAdapter(executor({ deployments: { deployments: [
      { id: scope.deploymentId, status: 'SUCCESS', createdAt: '2026-07-21T00:00:00Z', meta: { commitHash: SHA } },
      { id: '', status: 'REMOVED', createdAt: '', meta: {} },
    ], hasNextPage: false } }))), 'railway_inventory_schema_unsupported');
  });

  it('binds exact scope, sole successful deployment, immutable artifact, replica count, and sequential CLI commands', async () => {
    const commands = executor();
    const result = await new RailwayInventoryAdapter(commands).observe(scope, `git:${SHA}`, 2);
    assert.equal(result.releaseId, 'railway:deployment:deployment-id');
    assert.equal(result.artifactIdentity, `git:${SHA}`);
    assert.equal(result.servingReplicaCount, 2);
    assert.deepEqual(result.servingReplicaIds, ['replica-a', 'replica-b']);
    assert.match(result.servingReplicaIdsDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(result.inactivePriorDeploymentIds, ['old']);
    assert.match(result.inventoryDigest, /^[0-9a-f]{64}$/);
    assert.match(result.operatorPrincipalHash, /^[0-9a-f]{64}$/);
    assert.deepEqual(commands.calls.map((args) => args.slice(0, 2)), [
      ['--version'], ['whoami'], ['status', '--json'], ['status', '--project'], ['deployment', 'list'], ['environment', 'config'],
    ]);
  });

  it('rejects empty, under, over, duplicate, blank, and noncanonical active replica inventories', async () => {
    const cases: Array<[Array<{ id: string; status: string }>, string]> = [
      [[], 'railway_replica_count_unknown'],
      [[{ id: 'replica-a', status: 'RUNNING' }], 'railway_replica_count_unknown'],
      [[{ id: 'replica-a', status: 'RUNNING' }, { id: 'replica-b', status: 'RUNNING' }, { id: 'replica-c', status: 'RUNNING' }], 'railway_replica_count_unknown'],
      [[{ id: 'replica-a', status: 'RUNNING' }, { id: 'replica-a', status: 'RUNNING' }], 'railway_inventory_schema_unsupported'],
      [[{ id: 'replica-a', status: 'RUNNING' }, { id: '', status: 'RUNNING' }], 'railway_inventory_schema_unsupported'],
      [[{ id: 'replica-a', status: 'RUNNING' }, { id: ' replica-b ', status: 'RUNNING' }], 'railway_inventory_schema_unsupported'],
    ];
    for (const [instances, expected] of cases) {
      assert.equal(await failure(new RailwayInventoryAdapter(executor({ status: statusFixture(instances) }))), expected);
    }
  });

  it('fails closed on auth, scope, extra success, transitional/unknown state, truncation, artifact ambiguity, and replica mismatch', async () => {
    const cases: Array<[string, RailwayCommandExecutor]> = [
      ['railway_inventory_schema_unsupported', executor({ version: 'railway 5.28.0' })],
      ['railway_auth_missing', executor({ whoami: '' })],
      ['railway_scope_mismatch', executor({ status: { project: { id: 'wrong' }, environment: { id: scope.environmentId }, service: { id: scope.serviceId } } })],
      ['railway_extra_success_deployment', executor({ deployments: { deployments: [
        { id: scope.deploymentId, status: 'SUCCESS', createdAt: 'x', meta: { sha: SHA } },
        { id: 'old', status: 'SUCCESS', createdAt: 'x', meta: {} },
      ], hasNextPage: false } })],
      ['railway_rollout_not_settled', executor({ deployments: { deployments: [
        { id: scope.deploymentId, status: 'SUCCESS', createdAt: 'x', meta: { sha: SHA } },
        { id: 'old', status: 'DEPLOYING', createdAt: 'x', meta: {} },
      ], hasNextPage: false } })],
      ['railway_inventory_truncated', executor({ deployments: { deployments: [
        { id: scope.deploymentId, status: 'SUCCESS', createdAt: 'x', meta: { sha: SHA } },
      ], hasNextPage: true } })],
      ['railway_artifact_identity_ambiguous', executor({ deployments: { deployments: [
        { id: scope.deploymentId, status: 'SUCCESS', createdAt: 'x', meta: { one: SHA, two: 'b'.repeat(40) } },
      ], hasNextPage: false } })],
      ['railway_replica_count_unknown', executor({ config: { services: {
        [scope.serviceId]: { deploy: { multiRegionConfig: { 'us-east4': { numReplicas: 3 } } } },
      } } })],
      ['railway_replica_count_unknown', executor({ config: { services: {
        [scope.serviceId]: { deploy: { multiRegionConfig: { 'us-east4': { numReplicas: 1 }, 'eu-west4': { numReplicas: 'one' } } } },
      } } })],
    ];
    for (const [expected, command] of cases) assert.equal(await failure(new RailwayInventoryAdapter(command)), expected);
  });

  it('sums complete multi-region replica inventory and binds health hosts', async () => {
    const result = await new RailwayInventoryAdapter(executor({ config: { services: {
      [scope.serviceId]: {
        deploy: { multiRegionConfig: { 'us-east4': { numReplicas: 1 }, 'eu-west4': { numReplicas: 1 } } },
      },
    } } })).observe(scope, `git:${SHA}`, 2);
    assert.equal(result.servingReplicaCount, 2);
    assert.deepEqual(result.healthHosts, ['api.example.test']);
    assert.deepEqual(result.regionalAllocation, [
      { region: 'eu-west4', replicaCount: 1 },
      { region: 'us-east4', replicaCount: 1 },
    ]);
    assert.match(result.regionalAllocationDigest, /^[0-9a-f]{64}$/);
  });

  it('rejects contradictory status and regional cardinality even when expected matches the regional sum', async () => {
    const adapter = new RailwayInventoryAdapter(executor({ config: { services: {
      [scope.serviceId]: { deploy: { multiRegionConfig: { 'us-east4': { numReplicas: 1 }, 'eu-west4': { numReplicas: 2 } } } },
    } } }));
    await assert.rejects(adapter.observe(scope, `git:${SHA}`, 3), (error: any) => error?.code === 'railway_replica_count_unknown');
  });

  it('bounds delayed command execution with a monotonic observation deadline', async () => {
    const started = performance.now();
    await assert.rejects(
      new RailwayInventoryAdapter(executor({ delayMs: 250 })).observe(scope, `git:${SHA}`, 2, 50),
      (error: any) => error?.code === 'railway_inventory_timeout',
    );
    assert.ok(performance.now() - started < 175);
  });

  it('holds the adapter-wide command gate until a cancellation-ignoring command actually settles', async () => {
    let active = 0;
    let maxActive = 0;
    const hung: RailwayCommandExecutor = {
      run: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        return await new Promise<RailwayCommandResult>(() => undefined);
      },
    };
    const adapter = new RailwayInventoryAdapter(hung);
    await assert.rejects(adapter.observe(scope, `git:${SHA}`, 2, 25), (error: any) => error?.code === 'railway_inventory_timeout');
    await assert.rejects(adapter.observe(scope, `git:${SHA}`, 2, 25), (error: any) => error?.code === 'railway_inventory_timeout');
    await assert.rejects(adapter.observe(scope, `git:${SHA}`, 2, 25), (error: any) => error?.code === 'railway_inventory_timeout');
    assert.equal(maxActive, 1);
    assert.equal(active, 1);
  });

  it('does not leak raw provider responses in errors', async () => {
    const secret = 'railway-secret-value';
    const adapter = new RailwayInventoryAdapter(executor({ config: { token: secret } }));
    try { await adapter.observe(scope, `git:${SHA}`, 2); assert.fail('expected failure'); }
    catch (error) {
      assert.equal((error as RailwayInventoryError).code, 'railway_inventory_schema_unsupported');
      assert.equal(String(error).includes(secret), false);
    }
  });
});
