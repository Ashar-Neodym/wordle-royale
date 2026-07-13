import { Inject, Injectable } from '@nestjs/common';
import type { ReadinessStatus } from '@wordle-royale/contracts';
import { StandardDictionaryService } from '../dictionary/standard-dictionary.service.ts';
import { standardQueueEnabled } from '../matchmaking/matchmaking-config.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { RedisReadinessService } from './redis-readiness.service.ts';

@Injectable()
export class ReadinessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StandardDictionaryService) private readonly dictionary: StandardDictionaryService,
    @Inject(RedisReadinessService) private readonly redis: RedisReadinessService,
  ) {}

  async getReadiness(): Promise<ReadinessStatus> {
    const [database, applicationSchema, redis] = await Promise.all([
      this.prisma.checkDatabase(),
      this.prisma.checkApplicationSchema(),
      this.redis.checkRedis(),
    ]);
    const checkedAt = new Date().toISOString();
    const standardDictionary = !standardQueueEnabled()
      ? { status: 'not_checked_stub' as const, checkedAt, message: 'Standard dictionary is not required because Standard matchmaking is disabled.' }
      : database.status !== 'ok'
        ? { status: 'unavailable' as const, checkedAt, message: 'Standard dictionary availability depends on a reachable database.' }
        : applicationSchema.status !== 'ok'
          ? { status: 'unavailable' as const, checkedAt, message: 'Standard dictionary availability depends on the migrated application schema.' }
          : await this.dictionary.checkStandardDictionary();

    const blockingStatuses = [database.status, applicationSchema.status, standardDictionary.status, redis.status].filter((value) => value !== 'not_checked_stub');
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
      dependencies: { database, applicationSchema, standardDictionary, redis },
    };
  }
}
