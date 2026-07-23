import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StandardDictionaryService } from '../dictionary/standard-dictionary.service.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { RailwayInventoryAdapter, RailwayInventoryError, isRailwayInventoryErrorCode } from './railway-inventory.adapter.ts';
import {
  PROVIDER_PROOF_MAX_ACQUISITION_MS,
  PROVIDER_PROOF_MAX_AGE_MS,
  SPEED_PROVIDER_PROOF_PROTOCOL_V2,
  createProofId,
  sha256,
  type RailwayScope,
  type SpeedProviderInventoryProofV2,
} from './speed-lifecycle-proof.ts';
import { SPEED_LIFECYCLE_CONTROL_KEY, SPEED_LIFECYCLE_CONTROL_PROTOCOL, SPEED_LIFECYCLE_V1, SPEED_LIFECYCLE_V2 } from './speed-lifecycle-activation.constants.ts';
import type { SpeedActivationPhase } from './speed-lifecycle-activation.types.ts';
import {
  HttpsPinnedReadinessTransport,
  SystemPublicOriginResolver,
  canonicalPublicHostname,
  isPublicAddress,
  type PinnedReadinessTransport,
  type PublicOriginResolver,
} from './public-origin-readiness.ts';

export type OperatorOperation = 'close-v2' | 'open-v2' | 'disable' | 'close-v1' | 'open-v1';

export type OperatorTarget = RailwayScope & {
  expectedArtifact: string;
  expectedReplicas: number;
  expectedPhase: SpeedActivationPhase;
  expectedGeneration: bigint;
  healthUrl: string;
};

export type OperatorReadiness = {
  schema: true;
  dictionary: true;
  reconciler: true;
  standard: true;
};

export interface OperatorReadinessVerifier {
  verify(healthUrl: string, allowedHealthHosts: readonly string[], timeoutMs?: number): Promise<OperatorReadiness>;
}

export class SpeedLifecycleOperatorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SpeedLifecycleOperatorError';
  }
}

type Authority = {
  phase: string;
  generation: bigint;
  targetReleaseId: string | null;
  expectedReplicaCount: number | null;
};

type Lease = {
  instanceBootId: string;
  serviceId: string;
  releaseId: string;
  controlProtocol: string;
  supportsV1: boolean;
  supportsV2: boolean;
  supportsLegacyReconcile: boolean;
  observedGeneration: bigint | null;
  providerProjectId: string | null;
  providerEnvironmentId: string | null;
  providerServiceId: string | null;
  providerDeploymentId: string | null;
  providerReplicaId: string | null;
  providerRegion: string | null;
  providerArtifact: string | null;
};

const TRANSITIONS: Record<OperatorOperation, {
  from: SpeedActivationPhase;
  to: SpeedActivationPhase;
  activeVersion: string | null;
  confirmation: string;
  drainVersion: string | null;
}> = {
  'close-v2': { from: 'v1_open', to: 'closing_to_v2', activeVersion: null, confirmation: 'CLOSE SPEED V1 CREATION FOR V2 DRAIN', drainVersion: null },
  'open-v2': { from: 'closing_to_v2', to: 'v2_open', activeVersion: SPEED_LIFECYCLE_V2, confirmation: 'OPEN SPEED CREATION ON READY LIFECYCLE V2', drainVersion: SPEED_LIFECYCLE_V1 },
  disable: { from: 'v2_open', to: 'disabled', activeVersion: null, confirmation: 'DISABLE SPEED CREATION', drainVersion: null },
  'close-v1': { from: 'v2_open', to: 'closing_to_v1', activeVersion: null, confirmation: 'CLOSE SPEED V2 CREATION FOR V1 DRAIN', drainVersion: null },
  'open-v1': { from: 'closing_to_v1', to: 'v1_open', activeVersion: SPEED_LIFECYCLE_V1, confirmation: 'OPEN SPEED CREATION ON READY LIFECYCLE V1', drainVersion: SPEED_LIFECYCLE_V2 },
};

export class DefaultOperatorReadinessVerifier implements OperatorReadinessVerifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: StandardDictionaryService,
    private readonly resolver: PublicOriginResolver = new SystemPublicOriginResolver(),
    private readonly transport: PinnedReadinessTransport = new HttpsPinnedReadinessTransport(),
  ) {}

  async verify(healthUrl: string, allowedHealthHosts: readonly string[], timeoutMs = 5_000): Promise<OperatorReadiness> {
    const deadline = performance.now() + Math.max(1, timeoutMs);
    const remaining = (): number => {
      const value = Math.floor(deadline - performance.now());
      if (value <= 0) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
      return value;
    };
    let baseUrl: URL;
    try { baseUrl = new URL(healthUrl); } catch { throw new SpeedLifecycleOperatorError('railway_scope_mismatch'); }
    const normalizedHost = canonicalPublicHostname(baseUrl.hostname);
    const allowed = allowedHealthHosts.map(canonicalPublicHostname);
    if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.port
      || (baseUrl.pathname !== '' && baseUrl.pathname !== '/') || baseUrl.search || baseUrl.hash
      || !normalizedHost || normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost')
      || !allowed.includes(normalizedHost)) {
      throw new SpeedLifecycleOperatorError('railway_scope_mismatch');
    }
    if (this.isForbiddenHostname(normalizedHost)) {
      throw new SpeedLifecycleOperatorError('railway_scope_mismatch');
    }
    const url = new URL('/readyz', baseUrl.origin);
    let application: { status: string };
    let lifecycle: { status: string };
    let dictionary: { status: string };
    const client = this.prisma.client as any;
    if (typeof client?.$transaction === 'function') {
      try {
        [application, lifecycle, dictionary] = await client.$transaction(async (tx: any) => {
          await this.applyStatementTimeout(tx, remaining());
          const applicationResult = await this.prisma.checkApplicationSchema(tx); remaining();
          const lifecycleResult = await this.prisma.checkSpeedReadyLifecycleSchema(true, tx); remaining();
          const dictionaryResult = await this.dictionary.checkStandardDictionary(undefined, tx); remaining();
          return [applicationResult, lifecycleResult, dictionaryResult];
        }, { isolationLevel: 'Serializable', maxWait: remaining(), timeout: remaining() });
      } catch (error) {
        if (this.isTimeout(error) || performance.now() >= deadline) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
        throw new SpeedLifecycleOperatorError('schema_readiness_failed');
      }
    } else {
      [application, lifecycle, dictionary] = await Promise.all([
        this.prisma.checkApplicationSchema(),
        this.prisma.checkSpeedReadyLifecycleSchema(true),
        this.dictionary.checkStandardDictionary(),
      ]);
      remaining();
    }
    if (application.status !== 'ok' || lifecycle.status !== 'ok') throw new SpeedLifecycleOperatorError('schema_readiness_failed');
    if (dictionary.status !== 'ok') throw new SpeedLifecycleOperatorError('dictionary_readiness_failed');
    let addresses: string[];
    try {
      addresses = [...new Set(await this.withDeadline(this.resolver.resolve(normalizedHost), remaining()))].sort();
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new SpeedLifecycleOperatorError('operator_wait_timeout');
      throw new SpeedLifecycleOperatorError('reconciler_readiness_failed');
    }
    remaining();
    if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
      throw new SpeedLifecycleOperatorError('railway_scope_mismatch');
    }
    try {
      const body = await this.withDeadline(
        this.transport.getJson(url, addresses[0]!, Math.max(1, Math.min(5_000, remaining()))),
        remaining(),
      ) as {
        dependencies?: Record<string, { status?: string }>;
      };
      remaining();
      if (body.dependencies?.speedRuntime?.status !== 'ok') throw new SpeedLifecycleOperatorError('reconciler_readiness_failed');
      for (const dependency of ['database', 'applicationSchema', 'standardDictionary']) {
        if (body.dependencies?.[dependency]?.status !== 'ok') throw new SpeedLifecycleOperatorError('standard_readiness_failed');
      }
    } catch (error) {
      if (performance.now() >= deadline || (error instanceof Error && error.name === 'TimeoutError')) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
      if (error instanceof SpeedLifecycleOperatorError) throw error;
      throw new SpeedLifecycleOperatorError('reconciler_readiness_failed');
    }
    return { schema: true, dictionary: true, reconciler: true, standard: true };
  }

  private async applyStatementTimeout(tx: any, timeoutMs: number): Promise<void> {
    const bounded = `${Math.max(1, Math.floor(timeoutMs))}ms`;
    await tx.$queryRawUnsafe(`SELECT set_config('statement_timeout',$1,true), set_config('lock_timeout',$1,true)`, bounded);
  }

  private isTimeout(error: unknown): boolean {
    const candidate = error as { code?: unknown; meta?: { code?: unknown } };
    return candidate?.code === 'P2024' || candidate?.code === 'P2028' || candidate?.code === '57014' || candidate?.meta?.code === '57014';
  }

  private isForbiddenHostname(hostname: string): boolean {
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
    if (hostname === 'metadata' || hostname === 'metadata.google.internal') return true;
    return hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.home.arpa');
  }

  private async withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([work, new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), Math.max(1, timeoutMs));
      })]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export class SpeedLifecycleOperatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly railway: RailwayInventoryAdapter,
    private readonly readiness: OperatorReadinessVerifier,
  ) {}

  async verify(target: OperatorTarget, operation?: OperatorOperation, timeoutMs = 60_000): Promise<{
    proof: SpeedProviderInventoryProofV2;
    readiness: OperatorReadiness;
    matchingLeaseCount: number;
    nonTargetLeaseCount: number;
    eligibleDrainCount: number;
  }> {
    const deadline = performance.now() + Math.max(1, timeoutMs);
    const remaining = (): number => {
      const value = Math.floor(deadline - performance.now());
      if (value <= 0) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
      return value;
    };
    const before = await this.dbNowBounded(remaining());
    remaining();
    let inventory;
    const providerBudget = Math.min(PROVIDER_PROOF_MAX_ACQUISITION_MS, remaining());
    try {
      inventory = await this.railway.observe({
        projectId: target.projectId,
        environmentId: target.environmentId,
        serviceId: target.serviceId,
        deploymentId: target.deploymentId,
      }, target.expectedArtifact, target.expectedReplicas, providerBudget);
    } catch (error) {
      const railwayError = error instanceof RailwayInventoryError
        || (error instanceof Error && error.name === 'RailwayInventoryError' && typeof (error as { code?: unknown }).code === 'string');
      if (railwayError && isRailwayInventoryErrorCode((error as { code?: unknown }).code)) {
        const code = (error as RailwayInventoryError).code;
        if (code === 'railway_inventory_timeout') {
          if (providerBudget < PROVIDER_PROOF_MAX_ACQUISITION_MS) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
          remaining();
          throw new SpeedLifecycleOperatorError('provider_proof_too_slow');
        }
        throw new SpeedLifecycleOperatorError(code);
      }
      throw new SpeedLifecycleOperatorError('railway_inventory_unavailable');
    }
    const after = await this.dbNowBounded(remaining());
    remaining();
    if (after.getTime() - before.getTime() > PROVIDER_PROOF_MAX_ACQUISITION_MS) throw new SpeedLifecycleOperatorError('provider_proof_too_slow');
    const readiness = await this.readiness.verify(target.healthUrl, inventory.healthHosts, remaining());
    remaining();

    try {
      return await (this.prisma.client as any).$transaction(async (tx: any) => {
      await this.applyStatementTimeout(tx, remaining());
      const authority = await this.authority(tx, 'share');
      const verifiedAt = await this.dbNow(tx);
      if (verifiedAt.getTime() - after.getTime() > PROVIDER_PROOF_MAX_AGE_MS) throw new SpeedLifecycleOperatorError('provider_proof_stale');
      if (!authority || authority.phase !== target.expectedPhase) throw new SpeedLifecycleOperatorError('activation_phase_mismatch');
      if (BigInt(authority.generation) !== target.expectedGeneration) throw new SpeedLifecycleOperatorError('activation_generation_mismatch');
      const leases = await this.freshLeases(tx);
      const checked = this.validateLeases(leases, inventory, target.expectedGeneration);
      const proof: SpeedProviderInventoryProofV2 = {
        ...inventory,
        proofProtocol: SPEED_PROVIDER_PROOF_PROTOCOL_V2,
        proofId: createProofId(),
        expectedActivationPhase: target.expectedPhase,
        expectedActivationGeneration: target.expectedGeneration,
        providerObservedBeforeAt: before,
        providerObservedAfterAt: after,
      };
      const transition = operation ? TRANSITIONS[operation] : undefined;
      if (transition && transition.from !== target.expectedPhase) throw new SpeedLifecycleOperatorError('activation_phase_mismatch');
      const eligibleDrainCount = transition?.drainVersion ? await this.drainCount(tx, transition.drainVersion) : 0;
      if (eligibleDrainCount !== 0) throw new SpeedLifecycleOperatorError('speed_v1_queue_not_drained');
      return { proof, readiness, matchingLeaseCount: checked.matching, nonTargetLeaseCount: checked.nonTarget, eligibleDrainCount };
      }, { isolationLevel: 'Serializable', maxWait: remaining(), timeout: remaining() });
    } catch (error) {
      if (this.isTimeout(error) || performance.now() >= deadline) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
      throw error;
    }
  }

  async waitForConvergence(target: OperatorTarget, operation: OperatorOperation, timeoutMs = 60_000): Promise<Awaited<ReturnType<SpeedLifecycleOperatorService['verify']>>> {
    const transition = TRANSITIONS[operation];
    const deadline = performance.now() + Math.max(1, timeoutMs);
    const remaining = (): number => Math.floor(deadline - performance.now());
    if (!transition.drainVersion) return await this.verify(target, operation, Math.max(1, remaining()));
    const retryable = new Set(['capability_lease_missing', 'capability_lease_generation_mismatch', 'speed_v1_queue_not_drained']);
    while (true) {
      const budget = remaining();
      if (budget <= 0) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
      try { return await this.verify(target, operation, budget); }
      catch (error) {
        if (remaining() <= 0 || (error instanceof SpeedLifecycleOperatorError && error.code === 'operator_wait_timeout')) {
          throw new SpeedLifecycleOperatorError('operator_wait_timeout');
        }
        if (!(error instanceof SpeedLifecycleOperatorError) || !retryable.has(error.code)) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1_000, Math.max(1, remaining()))));
      }
    }
  }

  async apply(input: {
    operation: OperatorOperation;
    target: OperatorTarget;
    approvalRef: string;
    confirmation: string;
    reason: string;
  }, timeoutMs = 60_000): Promise<{ generation: bigint; proofId: string }> {
    const deadline = performance.now() + Math.max(1, timeoutMs);
    const remaining = (): number => {
      const value = Math.floor(deadline - performance.now());
      if (value <= 0) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
      return value;
    };
    const transition = TRANSITIONS[input.operation];
    if (!this.safeOperatorText(input.approvalRef, 128, false)) throw new SpeedLifecycleOperatorError('approval_missing');
    if (input.confirmation !== transition.confirmation) throw new SpeedLifecycleOperatorError('confirmation_mismatch');
    if (!this.safeOperatorText(input.reason, 160, true)) throw new SpeedLifecycleOperatorError('approval_missing');
    if (transition.drainVersion) await this.waitForConvergence(input.target, input.operation, remaining());
    const verified = await this.verify(input.target, input.operation, remaining());
    const proof = verified.proof;

    try {
      return await (this.prisma.client as any).$transaction(async (tx: any) => {
      await this.applyStatementTimeout(tx, remaining());
      const authority = await this.authority(tx, 'update');
      if (!authority || authority.phase !== transition.from || authority.phase !== proof.expectedActivationPhase) {
        throw new SpeedLifecycleOperatorError('activation_phase_mismatch');
      }
      if (BigInt(authority.generation) !== proof.expectedActivationGeneration) throw new SpeedLifecycleOperatorError('activation_generation_mismatch');
      const now = await this.dbNow(tx);
      if (now.getTime() - proof.providerObservedAfterAt.getTime() > PROVIDER_PROOF_MAX_AGE_MS) throw new SpeedLifecycleOperatorError('provider_proof_stale');
      const consumed = await tx.$queryRawUnsafe(`SELECT 1 FROM "SpeedLifecycleActivationAudit" WHERE "proofId"=$1::uuid`, proof.proofId) as unknown[];
      if (consumed.length) throw new SpeedLifecycleOperatorError('provider_proof_replayed');
      if ((transition.to === 'v2_open' || transition.to === 'v1_open')
        && (authority.targetReleaseId !== proof.releaseId || authority.expectedReplicaCount !== proof.servingReplicaCount)) {
        throw new SpeedLifecycleOperatorError('activation_release_mismatch');
      }
      const leases = await this.freshLeases(tx);
      const checked = this.validateLeases(leases, proof, proof.expectedActivationGeneration);
      if (checked.replicaDigest !== proof.servingReplicaIdsDigest) throw new SpeedLifecycleOperatorError('capability_lease_provider_mismatch');
      if (transition.drainVersion && await this.drainCount(tx, transition.drainVersion) !== 0) {
        throw new SpeedLifecycleOperatorError('speed_v1_queue_not_drained');
      }
      const next = proof.expectedActivationGeneration + 1n;
      const changed = await tx.$executeRawUnsafe(
        `UPDATE "SpeedLifecycleActivation" SET "phase"=$1, "activeCreationVersion"=$2,
           "generation"=$3, "targetReleaseId"=$4, "expectedReplicaCount"=$5,
           "transitionReason"=$6, "updatedAt"=clock_timestamp()
         WHERE "key"=$7 AND "phase"=$8 AND "generation"=$9`,
        transition.to, transition.activeVersion, next,
        transition.to === 'disabled' ? null : proof.releaseId,
        transition.to === 'disabled' ? null : proof.servingReplicaCount,
        input.reason, SPEED_LIFECYCLE_CONTROL_KEY, transition.from, proof.expectedActivationGeneration,
      );
      if (changed !== 1) throw new SpeedLifecycleOperatorError('activation_generation_mismatch');
      try {
        await tx.$executeRawUnsafe(
          `INSERT INTO "SpeedLifecycleActivationAudit" (
            "id","proofProtocol","proofId","operation","approvalRef","operatorPrincipalHash",
            "providerProjectId","providerEnvironmentId","providerServiceId","providerDeploymentId",
            "artifactIdentity","releaseId","expectedReplicaCount","inventoryDigest","leaseSetDigest",
            "providerObservedBeforeAt","providerObservedAfterAt","fromPhase","fromGeneration",
            "toPhase","toGeneration","result","failureCode")
           VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'applied',NULL)`,
          randomUUID(), proof.proofProtocol, proof.proofId, input.operation, input.approvalRef,
          proof.operatorPrincipalHash, proof.projectId, proof.environmentId, proof.serviceId,
          proof.deploymentId, proof.artifactIdentity, proof.releaseId, proof.servingReplicaCount,
          proof.inventoryDigest, checked.leaseDigest, proof.providerObservedBeforeAt,
          proof.providerObservedAfterAt, transition.from, proof.expectedActivationGeneration,
          transition.to, next,
        );
      } catch (error) {
        if (this.isTimeout(error) || performance.now() >= deadline) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
        throw new SpeedLifecycleOperatorError('activation_audit_write_failed');
      }
      return { generation: next, proofId: proof.proofId };
      }, { isolationLevel: 'Serializable', maxWait: remaining(), timeout: remaining() });
    } catch (error) {
      if (this.isTimeout(error) || performance.now() >= deadline) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
      throw error;
    }
  }

  private async applyStatementTimeout(tx: any, timeoutMs: number): Promise<void> {
    const bounded = `${Math.max(1, Math.floor(timeoutMs))}ms`;
    await tx.$queryRawUnsafe(`SELECT set_config('statement_timeout',$1,true), set_config('lock_timeout',$1,true)`, bounded);
  }

  private isTimeout(error: unknown): boolean {
    const candidate = error as { code?: unknown; meta?: { code?: unknown } };
    return candidate?.code === 'P2024' || candidate?.code === 'P2028' || candidate?.code === '57014' || candidate?.meta?.code === '57014';
  }

  private async dbNowBounded(timeoutMs: number): Promise<Date> {
    const bounded = Math.max(1, Math.floor(timeoutMs));
    try {
      return await (this.prisma.client as any).$transaction(async (tx: any) => {
        await this.applyStatementTimeout(tx, bounded);
        return await this.dbNow(tx);
      }, { isolationLevel: 'Serializable', maxWait: bounded, timeout: bounded });
    } catch (error) {
      if (this.isTimeout(error)) throw new SpeedLifecycleOperatorError('operator_wait_timeout');
      throw new SpeedLifecycleOperatorError('schema_readiness_failed');
    }
  }

  private safeOperatorText(value: string, maxLength: number, allowSpaces: boolean): boolean {
    const text = value.trim();
    if (!text || text.length > maxLength) return false;
    const pattern = allowSpaces ? /^[A-Za-z0-9._ #:-]+$/ : /^[A-Za-z0-9._#:-]+$/;
    if (!pattern.test(text) || /(?:https?:\/\/|postgres(?:ql)?:|database_url|password|secret|token|authorization|cookie|@)/i.test(text)) return false;
    if (/\b[0-9a-f]{32,}\b/i.test(text) || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(text)) return false;
    return true;
  }

  private validateLeases(leases: Lease[], proof: {
    releaseId: string; projectId: string; environmentId: string; serviceId: string;
    deploymentId: string; artifactIdentity: string; servingReplicaCount: number;
    servingReplicaIds: string[]; servingReplicaIdsDigest: string;
    regionalAllocation: Array<{ region: string; replicaCount: number }>;
    regionalAllocationDigest: string;
  }, generation: bigint): { matching: number; nonTarget: number; replicaDigest: string; leaseDigest: string } {
    if (leases.length < proof.servingReplicaCount) throw new SpeedLifecycleOperatorError('capability_lease_missing');
    if (leases.length > proof.servingReplicaCount) throw new SpeedLifecycleOperatorError('capability_lease_extra');
    const expectedRegions = proof.regionalAllocation.map(({ region, replicaCount }) => ({ region, replicaCount }));
    if (proof.servingReplicaIds.length !== proof.servingReplicaCount
      || new Set(proof.servingReplicaIds).size !== proof.servingReplicaIds.length
      || sha256([...proof.servingReplicaIds].sort()) !== proof.servingReplicaIdsDigest
      || sha256(proof.regionalAllocation) !== proof.regionalAllocationDigest
      || expectedRegions.some(({ region, replicaCount }) => !region || region !== region.trim() || !Number.isSafeInteger(replicaCount) || replicaCount < 0)
      || new Set(expectedRegions.map(({ region }) => region)).size !== expectedRegions.length
      || (expectedRegions.length > 0 && expectedRegions.reduce((sum, { replicaCount }) => sum + replicaCount, 0) !== proof.servingReplicaCount)) {
      throw new SpeedLifecycleOperatorError('capability_lease_provider_mismatch');
    }
    const exact = leases.filter((lease) => lease.serviceId === 'wordle-royale-api'
      && lease.releaseId === proof.releaseId && lease.controlProtocol === SPEED_LIFECYCLE_CONTROL_PROTOCOL
      && lease.supportsV1 && lease.supportsV2 && lease.supportsLegacyReconcile
      && lease.observedGeneration === generation && lease.providerProjectId === proof.projectId
      && lease.providerEnvironmentId === proof.environmentId && lease.providerServiceId === proof.serviceId
      && lease.providerDeploymentId === proof.deploymentId && lease.providerArtifact === proof.artifactIdentity
      && Boolean(lease.providerReplicaId?.trim()) && lease.providerReplicaId === lease.providerReplicaId?.trim()
      && (!proof.regionalAllocation.length || (Boolean(lease.providerRegion?.trim()) && lease.providerRegion === lease.providerRegion?.trim())));
    if (exact.length !== leases.length) {
      if (leases.some((lease) => lease.observedGeneration !== generation)) throw new SpeedLifecycleOperatorError('capability_lease_generation_mismatch');
      throw new SpeedLifecycleOperatorError('capability_lease_provider_mismatch');
    }
    const replicas = exact.map((lease) => lease.providerReplicaId!.trim()).sort();
    if (new Set(replicas).size !== replicas.length) throw new SpeedLifecycleOperatorError('capability_replica_id_duplicate');
    if (sha256(replicas) !== proof.servingReplicaIdsDigest) throw new SpeedLifecycleOperatorError('capability_lease_provider_mismatch');
    if (proof.regionalAllocation.length) {
      const actualRegions = new Map<string, number>();
      for (const lease of exact) {
        const region = lease.providerRegion?.trim();
        if (!region) throw new SpeedLifecycleOperatorError('capability_lease_provider_mismatch');
        actualRegions.set(region, (actualRegions.get(region) ?? 0) + 1);
      }
      const actualAllocation = [...actualRegions].map(([region, replicaCount]) => ({ region, replicaCount }))
        .sort((left, right) => left.region.localeCompare(right.region));
      if (sha256(actualAllocation) !== proof.regionalAllocationDigest) throw new SpeedLifecycleOperatorError('capability_lease_provider_mismatch');
    }
    const canonicalLeases = exact.map((lease) => ({
      boot: lease.instanceBootId, replica: lease.providerReplicaId!.trim(), region: lease.providerRegion?.trim() ?? null,
    })).sort((a, b) => a.boot.localeCompare(b.boot));
    return { matching: exact.length, nonTarget: leases.length - exact.length, replicaDigest: sha256(replicas), leaseDigest: sha256(canonicalLeases) };
  }

  private async authority(tx: any, lock: 'share' | 'update'): Promise<Authority | null> {
    const rows = await tx.$queryRawUnsafe(
      `SELECT "phase","generation","targetReleaseId","expectedReplicaCount" FROM "SpeedLifecycleActivation"
       WHERE "key"=$1 AND "controlProtocol"=$2 ${lock === 'update' ? 'FOR UPDATE' : 'FOR SHARE'}`,
      SPEED_LIFECYCLE_CONTROL_KEY, SPEED_LIFECYCLE_CONTROL_PROTOCOL,
    ) as Authority[];
    return rows.length === 1 ? rows[0]! : null;
  }

  private async freshLeases(tx: any): Promise<Lease[]> {
    return await tx.$queryRawUnsafe(
      `SELECT "instanceBootId","serviceId","releaseId","controlProtocol","supportsV1","supportsV2",
        "supportsLegacyReconcile","observedGeneration","providerProjectId","providerEnvironmentId",
        "providerServiceId","providerDeploymentId","providerReplicaId","providerRegion","providerArtifact"
       FROM "SpeedLifecycleCapabilityLease" WHERE "expiresAt" > clock_timestamp()
       ORDER BY "instanceBootId"`,
    ) as Lease[];
  }

  private async drainCount(tx: any, lifecycleVersion: string): Promise<number> {
    const rows = await tx.$queryRawUnsafe(
      `SELECT count(*)::integer AS count FROM "MatchmakingTicket"
       WHERE "mode"='speed_1v1' AND "state"='queued' AND "expiresAt">clock_timestamp()
       AND COALESCE("readyLifecycleVersion", $1)=$2`, SPEED_LIFECYCLE_V1, lifecycleVersion,
    ) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  private async dbNow(tx: any = this.prisma.client as any): Promise<Date> {
    const rows = await tx.$queryRawUnsafe(`SELECT clock_timestamp() AS now`) as Array<{ now: Date }>;
    if (!(rows[0]?.now instanceof Date)) throw new SpeedLifecycleOperatorError('railway_inventory_unavailable');
    return rows[0].now;
  }
}

export function toOperatorFailure(error: unknown): SpeedLifecycleOperatorError {
  if (error instanceof SpeedLifecycleOperatorError) return error;
  if (error instanceof ConflictException) return new SpeedLifecycleOperatorError('activation_generation_mismatch');
  return new SpeedLifecycleOperatorError('railway_inventory_unavailable');
}
