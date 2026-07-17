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
    const [database, applicationSchema, redis] = await Promise.all([
      this.prisma.checkDatabase(),
      this.prisma.checkApplicationSchema(),
      this.redis.checkRedis(),
    ]);
    const checkedAt = new Date().toISOString();
    const standardDictionary = !standardQueueEnabled() && !speedQueueEnabled()
      ? { status: 'not_checked_stub' as const, checkedAt, message: 'The approved dictionary is not required because Standard and Speed matchmaking are disabled.' }
      : database.status !== 'ok'
        ? { status: 'unavailable' as const, checkedAt, message: 'Standard dictionary availability depends on a reachable database.' }
        : applicationSchema.status !== 'ok'
          ? { status: 'unavailable' as const, checkedAt, message: 'Standard dictionary availability depends on the migrated application schema.' }
          : await this.dictionary.checkStandardDictionary();
    const operational = this.speedOperational?.evaluate({ database, applicationSchema, dictionary: standardDictionary })
      ?? { available: false, reason: speedQueueEnabled() ? 'reconciler_unavailable' as const : 'feature_disabled' as const };
    const speedRuntime = operational.reason === 'feature_disabled'
      ? { status: 'not_checked_stub' as const, checkedAt, message: 'Speed gameplay is not required because Speed matchmaking is disabled.' }
      : operational.available
        ? { status: 'ok' as const, checkedAt, message: 'Speed rules, persistence, dictionary, and expiry reconciliation are available.' }
        : { status: 'unavailable' as const, checkedAt, message: 'Speed gameplay operational readiness is unavailable.' };

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
      dependencies: { database, applicationSchema, standardDictionary, speedRuntime, redis },
    };
  }
}
