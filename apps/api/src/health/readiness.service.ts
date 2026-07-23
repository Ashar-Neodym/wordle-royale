import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ReadinessStatus } from '@wordle-royale/contracts';
import { StandardDictionaryService } from '../dictionary/standard-dictionary.service.ts';

import { speedQueueEnabled, standardQueueEnabled } from '../matchmaking/matchmaking-config.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { RedisReadinessService } from './redis-readiness.service.ts';
import { SpeedOperationalReadinessService } from './speed-operational-readiness.service.ts';

@Injectable()
export class ReadinessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StandardDictionaryService) private readonly dictionary: StandardDictionaryService,
    @Inject(RedisReadinessService) private readonly redis: RedisReadinessService,
    @Optional() @Inject(SpeedOperationalReadinessService) private readonly speedOperational?: SpeedOperationalReadinessService,
  ) {}

  async getReadiness(): Promise<ReadinessStatus> {
    const [database, applicationSchema, redis, speedLifecycleSchema] = await Promise.all([
      this.prisma.checkDatabase(),
      this.prisma.checkApplicationSchema(),
      this.redis.checkRedis(),
      speedQueueEnabled()
        ? this.prisma.checkSpeedReadyLifecycleSchema(false)
        : Promise.resolve({ status: 'not_checked_stub' as const, checkedAt: new Date().toISOString() }),
    ]);
    const checkedAt = new Date().toISOString();
    const standardDictionary = !standardQueueEnabled() && !speedQueueEnabled()
      ? { status: 'not_checked_stub' as const, checkedAt, message: 'The approved dictionary is not required because Standard and Speed matchmaking are disabled.' }
      : database.status !== 'ok'
        ? { status: 'unavailable' as const, checkedAt, message: 'Standard dictionary availability depends on a reachable database.' }
        : applicationSchema.status !== 'ok'
          ? { status: 'unavailable' as const, checkedAt, message: 'Standard dictionary availability depends on the migrated application schema.' }
          : await this.dictionary.checkStandardDictionary();
    const evaluated = this.speedOperational
      ? await this.speedOperational.check()
      : { available: false, reason: speedQueueEnabled() ? 'reconciler_unavailable' as const : 'feature_disabled' as const };
    const persistedRuntime = this.speedOperational?.checkPersistedRuntime
      ? await this.speedOperational.checkPersistedRuntime()
      : evaluated;
    const activationOnlyReasons = new Set(['activation_unavailable', 'activation_draining', 'activation_protocol_unsupported', 'active_version_unsupported', 'capability_lease_unavailable', 'activation_schema_unavailable']);
    const speedRuntime = persistedRuntime.reason === 'feature_disabled'
      ? { status: 'not_checked_stub' as const, checkedAt, message: 'Speed gameplay is not required because Speed matchmaking is disabled.' }
      : persistedRuntime.available || (!this.speedOperational?.checkPersistedRuntime && activationOnlyReasons.has(evaluated.reason))
        ? { status: 'ok' as const, checkedAt, message: 'Speed persisted-row gameplay and expiry reconciliation dependencies are available.' }
        : { status: 'unavailable' as const, checkedAt, message: 'Speed gameplay operational readiness is unavailable.' };
    const speedLifecycleActivation = evaluated.available
      ? { status: 'ok' as const, checkedAt, message: 'Speed lifecycle creation authority is available.' }
      : activationOnlyReasons.has(evaluated.reason)
        ? { status: 'unavailable' as const, checkedAt, message: 'Speed lifecycle creation is safely closed.' }
        : { status: 'not_checked_stub' as const, checkedAt, message: 'Speed lifecycle activation was not evaluated independently.' };

    const blockingStatuses = [database.status, applicationSchema.status, standardDictionary.status, speedRuntime.status, redis.status].filter((value) => value !== 'not_checked_stub');
    const status = blockingStatuses.every((value) => value === 'ok')
      ? 'ok'
      : blockingStatuses.some((value) => value === 'unavailable')
        ? 'unavailable'
        : 'degraded';

    return {
      status,
      service: 'wordle-royale-api',
      environment: process.env.NODE_ENV ?? 'development',
      checkedAt: new Date().toISOString(),
      dependencies: { database, applicationSchema, standardDictionary, speedRuntime, speedLifecycleActivation, redis },
    };
  }
}
