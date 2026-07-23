import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.ts';
import {
  SPEED_LIFECYCLE_CONTROL_KEY,
  SPEED_LIFECYCLE_CONTROL_PROTOCOL,
  SPEED_LIFECYCLE_HEARTBEAT_INTERVAL_MS,
  SPEED_LIFECYCLE_LEASE_TTL_MS,
} from './speed-lifecycle-activation.constants.ts';

@Injectable()
export class SpeedLifecycleCapabilityService implements OnModuleInit, OnModuleDestroy {
  readonly instanceBootId = randomUUID();
  private timer: NodeJS.Timeout | null = null;
  private heartbeatHealthy = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.heartbeat().catch(() => undefined);
    this.timer = setInterval(() => { void this.heartbeat().catch(() => undefined); }, SPEED_LIFECYCLE_HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.heartbeatHealthy = false;
  }

  async heartbeat(): Promise<boolean> {
    const identity = this.runtimeIdentity();
    if (!identity) {
      this.heartbeatHealthy = false;
      return false;
    }
    try {
      await (this.prisma.client as any).$executeRawUnsafe(
        `INSERT INTO "SpeedLifecycleCapabilityLease" (
           "instanceBootId", "serviceId", "releaseId", "controlProtocol",
           "supportsV1", "supportsV2", "supportsLegacyReconcile",
           "observedGeneration", "providerProjectId", "providerEnvironmentId",
           "providerServiceId", "providerDeploymentId", "providerReplicaId",
           "providerRegion", "providerArtifact", "startedAt", "lastSeenAt", "expiresAt"
         )
         SELECT $1, $2, $3, $4, TRUE, TRUE, TRUE,
                a."generation", $7, $8, $9, $10, $11, $12, $13,
                clock_timestamp(), clock_timestamp(),
                clock_timestamp() + ($5::integer * INTERVAL '1 millisecond')
           FROM "SpeedLifecycleActivation" a
          WHERE a."key" = $6
         ON CONFLICT ("instanceBootId") DO UPDATE SET
           "lastSeenAt" = clock_timestamp(),
           "expiresAt" = clock_timestamp() + ($5::integer * INTERVAL '1 millisecond'),
           "observedGeneration" = EXCLUDED."observedGeneration"
         WHERE "SpeedLifecycleCapabilityLease"."serviceId" = EXCLUDED."serviceId"
           AND "SpeedLifecycleCapabilityLease"."releaseId" = EXCLUDED."releaseId"
           AND "SpeedLifecycleCapabilityLease"."controlProtocol" = EXCLUDED."controlProtocol"
           AND "SpeedLifecycleCapabilityLease"."supportsV1" = TRUE
           AND "SpeedLifecycleCapabilityLease"."supportsV2" = TRUE
           AND "SpeedLifecycleCapabilityLease"."supportsLegacyReconcile" = TRUE
           AND "SpeedLifecycleCapabilityLease"."providerProjectId" IS NOT DISTINCT FROM EXCLUDED."providerProjectId"
           AND "SpeedLifecycleCapabilityLease"."providerEnvironmentId" IS NOT DISTINCT FROM EXCLUDED."providerEnvironmentId"
           AND "SpeedLifecycleCapabilityLease"."providerServiceId" IS NOT DISTINCT FROM EXCLUDED."providerServiceId"
           AND "SpeedLifecycleCapabilityLease"."providerDeploymentId" IS NOT DISTINCT FROM EXCLUDED."providerDeploymentId"
           AND "SpeedLifecycleCapabilityLease"."providerReplicaId" IS NOT DISTINCT FROM EXCLUDED."providerReplicaId"
           AND "SpeedLifecycleCapabilityLease"."providerRegion" IS NOT DISTINCT FROM EXCLUDED."providerRegion"
           AND "SpeedLifecycleCapabilityLease"."providerArtifact" IS NOT DISTINCT FROM EXCLUDED."providerArtifact"`,
        this.instanceBootId,
        'wordle-royale-api',
        identity.releaseId,
        SPEED_LIFECYCLE_CONTROL_PROTOCOL,
        SPEED_LIFECYCLE_LEASE_TTL_MS,
        SPEED_LIFECYCLE_CONTROL_KEY,
        identity.providerProjectId,
        identity.providerEnvironmentId,
        identity.providerServiceId,
        identity.providerDeploymentId,
        identity.providerReplicaId,
        identity.providerRegion,
        identity.providerArtifact,
      );
      this.heartbeatHealthy = true;
      this.heartbeatHealthy = await this.isFresh();
      return this.heartbeatHealthy;
    } catch {
      this.heartbeatHealthy = false;
      return false;
    }
  }

  async isFresh(expectedGeneration?: bigint): Promise<boolean> {
    const identity = this.runtimeIdentity();
    if (!identity) return false;
    try {
      const rows = await (this.prisma.client as any).$queryRawUnsafe(
        `SELECT 1 AS "fresh"
           FROM "SpeedLifecycleCapabilityLease"
          WHERE "instanceBootId" = $1
            AND "serviceId" = $2
            AND "releaseId" = $3
            AND "controlProtocol" = $4
            AND "supportsV1" = TRUE
            AND "supportsV2" = TRUE
            AND "supportsLegacyReconcile" = TRUE
            AND "expiresAt" > clock_timestamp()
            AND ($5::bigint IS NULL OR "observedGeneration" = $5::bigint)
            AND "providerProjectId" IS NOT DISTINCT FROM $6::text
            AND "providerEnvironmentId" IS NOT DISTINCT FROM $7::text
            AND "providerServiceId" IS NOT DISTINCT FROM $8::text
            AND "providerDeploymentId" IS NOT DISTINCT FROM $9::text
            AND "providerReplicaId" IS NOT DISTINCT FROM $10::text
            AND "providerRegion" IS NOT DISTINCT FROM $11::text
            AND "providerArtifact" IS NOT DISTINCT FROM $12::text
          LIMIT 1`,
        this.instanceBootId,
        'wordle-royale-api',
        identity.releaseId,
        SPEED_LIFECYCLE_CONTROL_PROTOCOL,
        expectedGeneration ?? null,
        identity.providerProjectId,
        identity.providerEnvironmentId,
        identity.providerServiceId,
        identity.providerDeploymentId,
        identity.providerReplicaId,
        identity.providerRegion,
        identity.providerArtifact,
      ) as Array<{ fresh: number }>;
      return rows.length === 1;
    } catch {
      return false;
    }
  }

  private runtimeIdentity(): {
    releaseId: string;
    providerProjectId: string | null;
    providerEnvironmentId: string | null;
    providerServiceId: string | null;
    providerDeploymentId: string | null;
    providerReplicaId: string | null;
    providerRegion: string | null;
    providerArtifact: string | null;
  } | null {
    const railwayKeys = ['RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_SERVICE_ID', 'RAILWAY_DEPLOYMENT_ID', 'RAILWAY_REPLICA_ID', 'RAILWAY_REPLICA_REGION', 'RAILWAY_GIT_COMMIT_SHA'] as const;
    const railwayDetected = railwayKeys.some((key) => Boolean(process.env[key]?.trim()));
    if (railwayDetected) {
      const values = Object.fromEntries(railwayKeys.map((key) => [key, process.env[key]?.trim() ?? ''])) as Record<typeof railwayKeys[number], string>;
      if (railwayKeys.some((key) => !values[key])) return null;
      if (!/^[0-9a-fA-F]{40}$/.test(values.RAILWAY_GIT_COMMIT_SHA)) return null;
      const releaseId = `railway:deployment:${values.RAILWAY_DEPLOYMENT_ID}`;
      const configured = process.env.SPEED_LIFECYCLE_RELEASE_ID?.trim();
      if (configured && configured !== releaseId) return null;
      return {
        releaseId,
        providerProjectId: values.RAILWAY_PROJECT_ID,
        providerEnvironmentId: values.RAILWAY_ENVIRONMENT_ID,
        providerServiceId: values.RAILWAY_SERVICE_ID,
        providerDeploymentId: values.RAILWAY_DEPLOYMENT_ID,
        providerReplicaId: values.RAILWAY_REPLICA_ID,
        providerRegion: values.RAILWAY_REPLICA_REGION,
        providerArtifact: `git:${values.RAILWAY_GIT_COMMIT_SHA.toLowerCase()}`,
      };
    }
    if (process.env.SPEED_LIFECYCLE_PROVIDER_ADAPTER !== 'local' && !process.env.NODE_TEST_CONTEXT) return null;
    const releaseId = process.env.SPEED_LIFECYCLE_RELEASE_ID?.trim();
    return releaseId ? {
      releaseId,
      providerProjectId: null,
      providerEnvironmentId: null,
      providerServiceId: null,
      providerDeploymentId: null,
      providerReplicaId: null,
      providerRegion: null,
      providerArtifact: null,
    } : null;
  }
}
