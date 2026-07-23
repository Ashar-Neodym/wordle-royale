import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { sha256, type RailwayInventoryObservation, type RailwayScope } from './speed-lifecycle-proof.ts';

const INACTIVE_STATUSES = new Set(['FAILED', 'CRASHED', 'REMOVED', 'SLEEPING', 'SKIPPED']);
const FULL_SHA = /^[0-9a-fA-F]{40}$/;
const SUPPORTED_RAILWAY_CLI_VERSIONS = new Set(['5.27.1']);
export const RAILWAY_INVENTORY_ERROR_CODES = new Set([
  'railway_cli_missing', 'railway_inventory_unavailable', 'railway_inventory_schema_unsupported',
  'railway_auth_missing', 'railway_scope_mismatch', 'railway_inventory_truncated',
  'railway_target_not_success', 'railway_extra_success_deployment', 'railway_rollout_not_settled',
  'railway_artifact_mismatch', 'railway_artifact_identity_ambiguous', 'railway_replica_count_unknown',
  'railway_replica_count_mismatch', 'railway_inventory_timeout',
]);

export function isRailwayInventoryErrorCode(value: unknown): value is string {
  return typeof value === 'string' && RAILWAY_INVENTORY_ERROR_CODES.has(value);
}

export type RailwayCommandResult = { stdout: string; stderr: string };
export interface RailwayCommandExecutor {
  /** Resolves/rejects only after the owned child exits. Abort terminates that exact child. */
  run(args: readonly string[], timeoutMs?: number, signal?: AbortSignal): Promise<RailwayCommandResult>;
}

export class RailwayInventoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RailwayInventoryError';
  }
}

@Injectable()
export class RailwayCliExecutor implements RailwayCommandExecutor {
  async run(args: readonly string[], timeoutMs = 12_000, signal?: AbortSignal): Promise<RailwayCommandResult> {
    try {
      return await new Promise<RailwayCommandResult>((resolve, reject) => {
        execFile('railway', [...args], {
          encoding: 'utf8', timeout: Math.max(1, Math.min(12_000, Math.floor(timeoutMs))), maxBuffer: 4 * 1024 * 1024,
          env: process.env, signal,
        }, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve({ stdout, stderr });
        });
      });
    } catch (error) {
      const candidate = error as { code?: unknown };
      if (candidate.code === 'ENOENT') throw new RailwayInventoryError('railway_cli_missing');
      throw new RailwayInventoryError('railway_inventory_unavailable');
    }
  }
}

type Deployment = { id: string; status: string; createdAt: string; meta: unknown };
type RegionalAllocation = Array<{ region: string; replicaCount: number }>;
type ServiceInstance = {
  numReplicas: number | null;
  replicaIds: string[];
  observedInstances: Array<{ id: string; status: 'RUNNING' | 'REMOVED' }>;
  regionalAllocation: RegionalAllocation;
  healthHosts: string[];
  latestDeployment: { id: string; status: string };
};

export class RailwayInventoryAdapter {
  private pending: Promise<void> = Promise.resolve();
  private unsettledCommand: Promise<void> | null = null;

  constructor(private readonly executor: RailwayCommandExecutor = new RailwayCliExecutor()) {}

  async observe(scope: RailwayScope, expectedArtifact: string, expectedReplicas: number, timeoutMs = 15_000): Promise<RailwayInventoryObservation> {
    const deadline = performance.now() + Math.max(1, timeoutMs);
    const previous = this.pending;
    let release!: () => void;
    this.pending = new Promise<void>((resolve) => { release = resolve; });
    try { await this.withDeadline(previous, deadline); }
    catch (error) {
      // Keep this timed-out reservation chained behind the still-owned predecessor.
      // Releasing immediately would let a later observer jump a hung command.
      void previous.finally(release);
      throw error;
    }
    try {
      return await this.observeSequential(scope, expectedArtifact, expectedReplicas, deadline);
    } finally {
      const settlement = this.unsettledCommand;
      this.unsettledCommand = null;
      if (settlement) void settlement.finally(release);
      else release();
    }
  }

  private async observeSequential(scope: RailwayScope, expectedArtifact: string, expectedReplicas: number, deadline: number): Promise<RailwayInventoryObservation> {
    this.assertInputs(scope, expectedArtifact, expectedReplicas);
    const versionOutput = (await this.command(['--version'], deadline)).stdout.trim();
    const versionMatch = /^railway\s+([0-9]+\.[0-9]+\.[0-9]+)$/.exec(versionOutput);
    if (!versionMatch?.[1] || !SUPPORTED_RAILWAY_CLI_VERSIONS.has(versionMatch[1])) throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    const whoami = (await this.command(['whoami'], deadline)).stdout.trim();
    if (!whoami || /not\s+(logged|authorized)|unauthenticated/i.test(whoami)) throw new RailwayInventoryError('railway_auth_missing');

    const linkedStatus = this.json(await this.command(['status', '--json'], deadline));
    const linkedInstance = this.parseStatus(linkedStatus, scope);
    const status = this.json(await this.command(['status', '--project', scope.projectId, '--environment', scope.environmentId, '--json'], deadline));
    const statusInstance = this.parseStatus(status, scope);
    if (sha256(linkedInstance) !== sha256(statusInstance)) {
      throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    }

    const deploymentResponse = this.json(await this.command([
      'deployment', 'list', '--project', scope.projectId, '--service', scope.serviceId,
      '--environment', scope.environmentId, '--limit', '1000', '--json',
    ], deadline));
    const { deployments, truncated } = this.deployments(deploymentResponse);
    if (truncated || deployments.length >= 1000) throw new RailwayInventoryError('railway_inventory_truncated');

    const config = this.json(await this.command(['environment', 'config', '--environment', scope.environmentId, '--json'], deadline));
    const serviceInstance = this.serviceInstance(config, scope, statusInstance);
    const target = deployments.filter((deployment) => deployment.id === scope.deploymentId);
    if (target.length !== 1 || target[0]!.status !== 'SUCCESS'
      || serviceInstance.latestDeployment.id !== scope.deploymentId
      || serviceInstance.latestDeployment.status !== 'SUCCESS') {
      throw new RailwayInventoryError('railway_target_not_success');
    }
    if (deployments.some((deployment) => deployment.id !== scope.deploymentId && deployment.status === 'SUCCESS')) {
      throw new RailwayInventoryError('railway_extra_success_deployment');
    }
    if (deployments.some((deployment) => deployment.id !== scope.deploymentId && !INACTIVE_STATUSES.has(deployment.status))) {
      throw new RailwayInventoryError('railway_rollout_not_settled');
    }

    const expectedSha = expectedArtifact.startsWith('git:') ? expectedArtifact.slice(4) : '';
    if (!FULL_SHA.test(expectedSha)) throw new RailwayInventoryError('railway_artifact_mismatch');
    const candidates = [...this.collectFullShas(target[0]!.meta)];
    if (candidates.length !== 1) throw new RailwayInventoryError('railway_artifact_identity_ambiguous');
    const artifactIdentity = `git:${candidates[0]!.toLowerCase()}`;
    if (artifactIdentity !== expectedArtifact.toLowerCase()) throw new RailwayInventoryError('railway_artifact_mismatch');

    const servingReplicaCount = serviceInstance.numReplicas;
    if (typeof servingReplicaCount !== 'number' || !Number.isSafeInteger(servingReplicaCount) || servingReplicaCount < 1) {
      throw new RailwayInventoryError('railway_replica_count_unknown');
    }
    if (servingReplicaCount !== expectedReplicas) throw new RailwayInventoryError('railway_replica_count_mismatch');

    const inactivePriorDeploymentIds = deployments.filter(({ id }) => id !== scope.deploymentId).map(({ id }) => id).sort();
    const releaseId = `railway:deployment:${scope.deploymentId}`;
    const servingReplicaIdsDigest = sha256(serviceInstance.replicaIds);
    const regionalAllocationDigest = sha256(serviceInstance.regionalAllocation);
    const inventoryDigest = sha256({
      schema: 2, scope, releaseId, artifactIdentity, servingReplicaCount,
      servingReplicaIds: serviceInstance.replicaIds, regionalAllocation: serviceInstance.regionalAllocation,
      healthHosts: serviceInstance.healthHosts,
      deployments: deployments.map(({ id, status, createdAt }) => ({ id, status, createdAt })).sort((a, b) => a.id.localeCompare(b.id)),
    });
    return {
      ...scope, releaseId, artifactIdentity, servingReplicaCount,
      servingReplicaIds: serviceInstance.replicaIds, servingReplicaIdsDigest,
      regionalAllocation: serviceInstance.regionalAllocation, regionalAllocationDigest,
      healthHosts: serviceInstance.healthHosts, inactivePriorDeploymentIds, rolloutSettled: true,
      operatorPrincipalHash: sha256(whoami.normalize('NFKC').trim().toLowerCase()), inventoryDigest,
    };
  }

  private async command(args: readonly string[], deadline: number): Promise<RailwayCommandResult> {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0) throw new RailwayInventoryError('railway_inventory_timeout');
    const cancellation = new AbortController();
    const work = this.executor.run(args, Math.min(12_000, remaining), cancellation.signal);
    try {
      return await this.withDeadline(work, deadline);
    } catch (error) {
      if (error instanceof RailwayInventoryError && error.code === 'railway_inventory_timeout') {
        cancellation.abort();
        this.unsettledCommand = work.then(() => undefined, () => undefined);
      }
      throw error;
    }
  }

  private async withDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0) throw new RailwayInventoryError('railway_inventory_timeout');
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([work, new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new RailwayInventoryError('railway_inventory_timeout')), remaining);
      })]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private assertInputs(scope: RailwayScope, artifact: string, replicas: number): void {
    if (Object.values(scope).some((value) => !value.trim()) || !artifact.trim() || !Number.isInteger(replicas) || replicas < 1) {
      throw new RailwayInventoryError('railway_scope_mismatch');
    }
  }

  private parseStatus(value: unknown, scope: RailwayScope): ServiceInstance {
    const project = this.record(value);
    if (project.id !== scope.projectId) throw new RailwayInventoryError('railway_scope_mismatch');
    const environmentEdges = this.record(project.environments).edges;
    if (!Array.isArray(environmentEdges) || environmentEdges.length !== 1) throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    const environment = this.record(this.record(environmentEdges[0]).node);
    if (environment.id !== scope.environmentId) throw new RailwayInventoryError('railway_scope_mismatch');
    const serviceEdges = this.record(project.services).edges;
    if (!Array.isArray(serviceEdges)) throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    const targetServices = serviceEdges.filter((edge) => this.record(this.record(edge).node).id === scope.serviceId);
    if (targetServices.length !== 1) throw new RailwayInventoryError('railway_scope_mismatch');
    const instanceEdges = this.record(environment.serviceInstances).edges;
    if (!Array.isArray(instanceEdges)) throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    const instances = instanceEdges.map((edge) => this.record(this.record(edge).node)).filter((node) => node.serviceId === scope.serviceId);
    if (instances.length !== 1) throw new RailwayInventoryError('railway_scope_mismatch');
    const row = instances[0]!;
    if (row.environmentId !== scope.environmentId || (row.numReplicas !== null && typeof row.numReplicas !== 'number')) {
      throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    }
    if (typeof row.numReplicas === 'number' && (!Number.isSafeInteger(row.numReplicas) || row.numReplicas < 1)) {
      throw new RailwayInventoryError('railway_replica_count_unknown');
    }
    const active = Array.isArray(row.activeDeployments) ? row.activeDeployments.map((item: unknown) => this.record(item)) : [];
    if (active.length !== 1 || active[0]!.id !== scope.deploymentId || active[0]!.status !== 'SUCCESS' || active[0]!.deploymentStopped !== false) {
      throw new RailwayInventoryError('railway_target_not_success');
    }
    const replicaInstances = Array.isArray(active[0]!.instances) ? active[0]!.instances.map((item: unknown) => this.record(item)) : [];
    if (replicaInstances.some((instance) => instance.status !== 'RUNNING' && instance.status !== 'REMOVED')) {
      throw new RailwayInventoryError('railway_rollout_not_settled');
    }
    const observedInstances = replicaInstances.map((instance) => ({
      id: typeof instance.id === 'string' ? instance.id : '',
      status: instance.status as 'RUNNING' | 'REMOVED',
    }));
    if (observedInstances.some(({ id }) => !id || id !== id.trim())
      || new Set(observedInstances.map(({ id }) => id)).size !== observedInstances.length) {
      throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    }
    observedInstances.sort((left, right) => left.id.localeCompare(right.id) || left.status.localeCompare(right.status));
    const replicaIds = observedInstances.filter((instance) => instance.status === 'RUNNING').map(({ id }) => id);
    if (!replicaIds.length || (row.numReplicas !== null && replicaIds.length !== row.numReplicas)
      || replicaIds.some((id) => !id || id !== id.trim()) || new Set(replicaIds).size !== replicaIds.length) {
      throw new RailwayInventoryError('railway_replica_count_unknown');
    }
    replicaIds.sort();
    const latest = this.record(row.latestDeployment);
    const domains = this.record(row.domains);
    if (!Array.isArray(domains.serviceDomains) || !Array.isArray(domains.customDomains)) {
      throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    }
    const domainRows = [...domains.serviceDomains, ...domains.customDomains];
    const rawHealthHosts = domainRows.map((item) => this.record(item).domain);
    if (rawHealthHosts.some((domain) => typeof domain !== 'string' || !domain || domain !== domain.trim().toLowerCase())) {
      throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    }
    const healthHosts = (rawHealthHosts as string[]).sort();
    if (typeof latest.id !== 'string' || typeof latest.status !== 'string' || !healthHosts.length
      || new Set(healthHosts).size !== healthHosts.length || healthHosts.some((host) => host.includes('/') || host.includes(':'))) {
      throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    }
    return { numReplicas: row.numReplicas, replicaIds, observedInstances, regionalAllocation: [], healthHosts, latestDeployment: { id: latest.id, status: latest.status } };
  }

  private deployments(value: unknown): { deployments: Deployment[]; truncated: boolean } {
    const record = this.record(value);
    const raw = Array.isArray(value) ? value : record.deployments;
    if (!Array.isArray(raw)) throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    const truncated = !Array.isArray(value) && (record.hasNextPage === true || record.nextPage != null || record.nextCursor != null);
    const deployments = raw.map((item): Deployment => {
      const row = this.record(item);
      if (typeof row.id !== 'string' || !row.id || row.id !== row.id.trim()
        || typeof row.status !== 'string' || !row.status || row.status !== row.status.trim()
        || typeof row.createdAt !== 'string' || !row.createdAt || row.createdAt !== row.createdAt.trim() || !('meta' in row)) {
        throw new RailwayInventoryError('railway_inventory_schema_unsupported');
      }
      return { id: row.id, status: row.status, createdAt: row.createdAt, meta: row.meta };
    });
    if (new Set(deployments.map(({ id }) => id)).size !== deployments.length) throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    return { deployments, truncated };
  }

  private serviceInstance(value: unknown, scope: RailwayScope, status: ServiceInstance): ServiceInstance {
    const root = this.record(value);
    if (!root.services || typeof root.services !== 'object' || Array.isArray(root.services)) throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    const row = this.record((root.services as Record<string, unknown>)[scope.serviceId]);
    if (!Object.keys(row).length) throw new RailwayInventoryError('railway_inventory_schema_unsupported');
    const multiRegion = this.record(row.deploy).multiRegionConfig;
    if (!multiRegion || typeof multiRegion !== 'object' || Array.isArray(multiRegion)) {
      throw new RailwayInventoryError('railway_replica_count_unknown');
    }
    const entries = Object.entries(multiRegion as Record<string, unknown>);
    if (!entries.length || entries.some(([region]) => !region.trim() || region !== region.trim())) {
      throw new RailwayInventoryError('railway_replica_count_unknown');
    }
    const regionalAllocation = entries.map(([region, entry]) => ({
      region,
      replicaCount: this.record(entry).numReplicas,
    }));
    if (regionalAllocation.some(({ replicaCount }) => typeof replicaCount !== 'number'
      || !Number.isSafeInteger(replicaCount) || replicaCount < 1)) {
      throw new RailwayInventoryError('railway_replica_count_unknown');
    }
    const regionalCount = regionalAllocation.reduce((sum, { replicaCount }) => sum + Number(replicaCount), 0);
    if (!Number.isSafeInteger(regionalCount) || regionalCount < 1
      || (status.numReplicas !== null && status.numReplicas !== regionalCount)
      || status.replicaIds.length !== regionalCount) {
      throw new RailwayInventoryError('railway_replica_count_unknown');
    }
    regionalAllocation.sort((left, right) => left.region.localeCompare(right.region));
    return { ...status, numReplicas: regionalCount, regionalAllocation: regionalAllocation as RegionalAllocation };
  }

  private collectFullShas(value: unknown, found = new Set<string>()): Set<string> {
    if (typeof value === 'string' && FULL_SHA.test(value)) found.add(value.toLowerCase());
    else if (Array.isArray(value)) value.forEach((child) => this.collectFullShas(child, found));
    else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((child) => this.collectFullShas(child, found));
    return found;
  }

  private json(result: RailwayCommandResult): unknown {
    try { return JSON.parse(result.stdout) as unknown; }
    catch { throw new RailwayInventoryError('railway_inventory_schema_unsupported'); }
  }

  private record(value: unknown): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, any>;
  }
}
