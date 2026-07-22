import { ConflictException, Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import {
  SPEED_LIFECYCLE_CONTROL_KEY,
  SPEED_LIFECYCLE_CONTROL_PROTOCOL,
  SPEED_LIFECYCLE_PHASES,
  SPEED_LIFECYCLE_V1,
  SPEED_LIFECYCLE_V2,
} from './speed-lifecycle-activation.constants.ts';
import { SpeedLifecycleCapabilityService } from './speed-lifecycle-capability.service.ts';
import type {
  SpeedActivationAvailability,
  SpeedActivationPhase,
  SpeedActivationTransitionInput,
  SpeedCreationAuthority,
  SpeedLifecycleVersion,
  SpeedProviderInventoryVerifier,
} from './speed-lifecycle-activation.types.ts';

export const SPEED_PROVIDER_INVENTORY_VERIFIER = Symbol('SPEED_PROVIDER_INVENTORY_VERIFIER');

type AuthorityRow = {
  controlProtocol: string;
  phase: string;
  activeCreationVersion: string | null;
  generation: bigint;
  targetReleaseId: string | null;
  expectedReplicaCount: number | null;
};

const supportedVersions = new Set<string>([SPEED_LIFECYCLE_V1, SPEED_LIFECYCLE_V2]);
const supportedPhases = new Set<string>(SPEED_LIFECYCLE_PHASES);

@Injectable()
export class SpeedLifecycleActivationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(SpeedLifecycleCapabilityService) private readonly capability?: SpeedLifecycleCapabilityService,
    @Optional() @Inject(SPEED_PROVIDER_INVENTORY_VERIFIER) private readonly providerInventory?: SpeedProviderInventoryVerifier,
  ) {}

  async checkLocalAvailability(): Promise<SpeedActivationAvailability> {
    let row: AuthorityRow | null;
    try {
      row = await this.readAuthority(this.prisma.client as any, false);
    } catch {
      return this.unavailable('activation_unavailable');
    }
    if (!row || !supportedPhases.has(row.phase)) return this.unavailable('activation_unavailable');
    if (row.controlProtocol !== SPEED_LIFECYCLE_CONTROL_PROTOCOL) return this.unavailable('activation_protocol_unsupported', row);
    if (row.phase === 'closing_to_v1' || row.phase === 'closing_to_v2' || row.phase === 'disabled') {
      return this.unavailable('activation_draining', row);
    }
    const expected = row.phase === 'v1_open' ? SPEED_LIFECYCLE_V1 : SPEED_LIFECYCLE_V2;
    if (row.activeCreationVersion !== expected || !supportedVersions.has(row.activeCreationVersion)) {
      return this.unavailable('active_version_unsupported', row);
    }
    if (!this.capability || !(await this.capability.isFresh(BigInt(row.generation)))) return this.unavailable('capability_lease_unavailable', row);
    return { available: true, reason: 'available', activeVersion: expected, phase: row.phase as SpeedActivationPhase };
  }

  async lockCreationAuthority(tx: any): Promise<SpeedCreationAuthority> {
    let row: AuthorityRow | null;
    try {
      row = await this.readAuthority(tx, 'share');
    } catch (error) {
      throw this.mapDatabaseError(error);
    }
    if (!row || !supportedPhases.has(row.phase)) throw this.activationUnavailable();
    if (row.controlProtocol !== SPEED_LIFECYCLE_CONTROL_PROTOCOL) throw this.activationUnavailable();
    if (row.phase !== 'v1_open' && row.phase !== 'v2_open') throw this.activationDraining();
    const activeVersion = row.phase === 'v1_open' ? SPEED_LIFECYCLE_V1 : SPEED_LIFECYCLE_V2;
    if (row.activeCreationVersion !== activeVersion) throw this.versionMismatch();
    return {
      protocol: SPEED_LIFECYCLE_CONTROL_PROTOCOL,
      phase: row.phase,
      activeVersion,
      generation: BigInt(row.generation),
    };
  }

  assertTicketVersion(authority: SpeedCreationAuthority, version: string | null): void {
    const effective = version ?? SPEED_LIFECYCLE_V1;
    if (effective !== authority.activeVersion) throw this.versionMismatch();
  }

  mapDatabaseError(error: unknown): ServiceUnavailableException {
    const text = this.errorText(error);
    if (text.includes('WR_SPEED_CREATION_CLOSED')) return this.activationDraining();
    if (text.includes('WR_SPEED_LIFECYCLE_VERSION_MISMATCH') || text.includes('WR_SPEED_TICKET_MATCH_IDENTITY_MISMATCH')) return this.versionMismatch();
    return this.activationUnavailable();
  }

  async closeToV2(input: SpeedActivationTransitionInput): Promise<bigint> {
    return await this.transition('v1_open', 'closing_to_v2', null, input, false);
  }

  async openV2(input: SpeedActivationTransitionInput): Promise<bigint> {
    return await this.transition('closing_to_v2', 'v2_open', SPEED_LIFECYCLE_V2, input, true);
  }

  async closeToV1(input: SpeedActivationTransitionInput): Promise<bigint> {
    return await this.transition('v2_open', 'closing_to_v1', null, input, false);
  }

  async openV1(input: SpeedActivationTransitionInput): Promise<bigint> {
    return await this.transition('closing_to_v1', 'v1_open', SPEED_LIFECYCLE_V1, input, true);
  }

  async disable(expectedGeneration: bigint, reason: string): Promise<bigint> {
    return await (this.prisma.client as any).$transaction(async (tx: any) => {
      const row = await this.readAuthority(tx, 'update');
      if (!row || (row.phase !== 'v1_open' && row.phase !== 'v2_open') || BigInt(row.generation) !== expectedGeneration) throw this.transitionConflict();
      const next = expectedGeneration + 1n;
      await tx.$executeRawUnsafe(
        `UPDATE "SpeedLifecycleActivation"
            SET "phase"='disabled', "activeCreationVersion"=NULL,
                "generation"=$1, "targetReleaseId"=NULL,
                "expectedReplicaCount"=NULL, "transitionReason"=$2,
                "updatedAt"=clock_timestamp()
          WHERE "key"=$3`, next, reason, SPEED_LIFECYCLE_CONTROL_KEY,
      );
      return next;
    }, { isolationLevel: 'Serializable' });
  }

  private async transition(
    from: SpeedActivationPhase,
    to: SpeedActivationPhase,
    activeVersion: SpeedLifecycleVersion | null,
    input: SpeedActivationTransitionInput,
    opening: boolean,
  ): Promise<bigint> {
    if (!input.targetReleaseId.trim() || !input.reason.trim() || !Number.isInteger(input.expectedReplicaCount) || input.expectedReplicaCount < 1) throw this.transitionConflict();
    await this.assertProviderInventory(input);
    return await (this.prisma.client as any).$transaction(async (tx: any) => {
      const row = await this.readAuthority(tx, 'update');
      if (!row || row.phase !== from || BigInt(row.generation) !== input.expectedGeneration) throw this.transitionConflict();
      if (opening) {
        if (row.targetReleaseId !== input.targetReleaseId || row.expectedReplicaCount !== input.expectedReplicaCount) throw this.transitionConflict();
        await this.assertDrainedAndCapable(tx, from === 'closing_to_v2' ? SPEED_LIFECYCLE_V1 : SPEED_LIFECYCLE_V2, input, input.expectedGeneration);
      } else {
        await this.assertFreshTargetLeases(tx, input, input.expectedGeneration);
      }
      const next = input.expectedGeneration + 1n;
      await tx.$executeRawUnsafe(
        `UPDATE "SpeedLifecycleActivation"
            SET "phase"=$1, "activeCreationVersion"=$2, "generation"=$3,
                "targetReleaseId"=$4, "expectedReplicaCount"=$5,
                "transitionReason"=$6, "updatedAt"=clock_timestamp()
          WHERE "key"=$7`,
        to, activeVersion, next, input.targetReleaseId, input.expectedReplicaCount,
        input.reason, SPEED_LIFECYCLE_CONTROL_KEY,
      );
      return next;
    }, { isolationLevel: 'Serializable' });
  }

  private async assertDrainedAndCapable(tx: any, drainingVersion: SpeedLifecycleVersion, input: SpeedActivationTransitionInput, generation: bigint): Promise<void> {
    const rows = await tx.$queryRawUnsafe(
      `SELECT count(*)::integer AS "count"
         FROM "MatchmakingTicket"
        WHERE "mode"='speed_1v1' AND "state"='queued'
          AND "expiresAt" > clock_timestamp()
          AND COALESCE("readyLifecycleVersion", $1)=$2`,
      SPEED_LIFECYCLE_V1, drainingVersion,
    ) as Array<{ count: number }>;
    if ((rows[0]?.count ?? 0) !== 0) throw this.transitionConflict();
    await this.assertFreshTargetLeases(tx, input, generation);
  }

  private async assertFreshTargetLeases(tx: any, input: SpeedActivationTransitionInput, generation: bigint): Promise<void> {
    const rows = await tx.$queryRawUnsafe(
      `SELECT
         count(*)::integer AS "freshTotal",
         count(*) FILTER (WHERE "serviceId"='wordle-royale-api' AND "releaseId"=$1
           AND "controlProtocol"=$2 AND "supportsV1"=TRUE AND "supportsV2"=TRUE
           AND "supportsLegacyReconcile"=TRUE AND "observedGeneration"=$3)::integer AS "matching",
         count(*) FILTER (WHERE NOT (
           "serviceId"='wordle-royale-api' AND "releaseId"=$1
           AND "controlProtocol"=$2 AND "supportsV1"=TRUE AND "supportsV2"=TRUE
           AND "supportsLegacyReconcile"=TRUE AND "observedGeneration"=$3
         ))::integer AS "nonmatching"
       FROM "SpeedLifecycleCapabilityLease"
       WHERE "expiresAt" > clock_timestamp()`,
      input.targetReleaseId, SPEED_LIFECYCLE_CONTROL_PROTOCOL, generation,
    ) as Array<{ freshTotal: number; matching: number; nonmatching: number }>;
    if (rows[0]?.freshTotal !== input.expectedReplicaCount
      || rows[0]?.matching !== input.expectedReplicaCount
      || rows[0]?.nonmatching !== 0) throw this.transitionConflict();
  }

  private async assertProviderInventory(input: SpeedActivationTransitionInput): Promise<void> {
    if (!this.providerInventory) throw this.transitionConflict();
    try {
      const proof = await this.providerInventory.verifyTarget({
        targetReleaseId: input.targetReleaseId,
        expectedReplicaCount: input.expectedReplicaCount,
      });
      if (proof.proofProtocol !== 'speed_provider_inventory_proof_v1'
        || proof.targetReleaseId !== input.targetReleaseId
        || proof.servingReplicaCount !== input.expectedReplicaCount
        || proof.priorReleaseIds.length !== 0
        || !proof.rolloutSettled
        || !proof.proofId.trim()) throw this.transitionConflict();
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw this.transitionConflict();
    }
  }

  private async readAuthority(tx: any, lock: false | 'share' | 'update'): Promise<AuthorityRow | null> {
    const rows = await tx.$queryRawUnsafe(
      `SELECT "controlProtocol", "phase", "activeCreationVersion", "generation", "targetReleaseId", "expectedReplicaCount"
         FROM "SpeedLifecycleActivation" WHERE "key"=$1 ${lock === 'share' ? 'FOR SHARE' : lock === 'update' ? 'FOR UPDATE' : ''}`,
      SPEED_LIFECYCLE_CONTROL_KEY,
    ) as AuthorityRow[];
    return rows.length === 1 ? rows[0]! : null;
  }

  private unavailable(reason: SpeedActivationAvailability['reason'], row?: AuthorityRow | null): SpeedActivationAvailability {
    return {
      available: false,
      reason,
      activeVersion: supportedVersions.has(row?.activeCreationVersion ?? '') ? row!.activeCreationVersion as SpeedLifecycleVersion : null,
      phase: supportedPhases.has(row?.phase ?? '') ? row!.phase as SpeedActivationPhase : null,
    };
  }

  private activationUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({ code: 'speed_lifecycle_activation_unavailable', message: 'Speed lifecycle activation is temporarily unavailable.' });
  }
  private activationDraining(): ServiceUnavailableException {
    return new ServiceUnavailableException({ code: 'speed_lifecycle_draining', message: 'Speed matchmaking is temporarily closed for lifecycle maintenance.' });
  }
  private versionMismatch(): ServiceUnavailableException {
    return new ServiceUnavailableException({ code: 'speed_lifecycle_version_mismatch', message: 'Speed lifecycle compatibility is temporarily unavailable.' });
  }
  private transitionConflict(): ConflictException {
    return new ConflictException({ code: 'speed_lifecycle_transition_precondition_failed', message: 'The lifecycle transition preconditions are not satisfied.' });
  }
  private errorText(error: unknown): string {
    if (!error || typeof error !== 'object') return String(error);
    const candidate = error as { message?: unknown; meta?: unknown; cause?: unknown };
    return `${String(candidate.message ?? '')} ${JSON.stringify(candidate.meta ?? '')} ${String(candidate.cause ?? '')}`;
  }
}
