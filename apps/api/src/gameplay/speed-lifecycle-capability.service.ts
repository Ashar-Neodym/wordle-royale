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
    const releaseId = this.releaseId();
    if (!releaseId) {
      this.heartbeatHealthy = false;
      return false;
    }
    try {
      await (this.prisma.client as any).$executeRawUnsafe(
        `INSERT INTO "SpeedLifecycleCapabilityLease" (
           "instanceBootId", "serviceId", "releaseId", "controlProtocol",
           "supportsV1", "supportsV2", "supportsLegacyReconcile",
           "observedGeneration", "startedAt", "lastSeenAt", "expiresAt"
         )
         SELECT $1, $2, $3, $4, TRUE, TRUE, TRUE,
                a."generation", clock_timestamp(), clock_timestamp(),
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
           AND "SpeedLifecycleCapabilityLease"."supportsLegacyReconcile" = TRUE`,
        this.instanceBootId,
        'wordle-royale-api',
        releaseId,
        SPEED_LIFECYCLE_CONTROL_PROTOCOL,
        SPEED_LIFECYCLE_LEASE_TTL_MS,
        SPEED_LIFECYCLE_CONTROL_KEY,
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
    const releaseId = this.releaseId();
    if (!releaseId) return false;
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
          LIMIT 1`,
        this.instanceBootId,
        'wordle-royale-api',
        releaseId,
        SPEED_LIFECYCLE_CONTROL_PROTOCOL,
        expectedGeneration ?? null,
      ) as Array<{ fresh: number }>;
      return rows.length === 1;
    } catch {
      return false;
    }
  }

  private releaseId(): string | null {
    const value = process.env.SPEED_LIFECYCLE_RELEASE_ID?.trim();
    return value ? value : null;
  }
}
