import { Inject, Injectable } from '@nestjs/common';
import type { ReadinessStatus } from '@wordle-royale/contracts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { RedisReadinessService } from './redis-readiness.service.ts';

@Injectable()
export class ReadinessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisReadinessService) private readonly redis: RedisReadinessService,
  ) {}

  async getReadiness(): Promise<ReadinessStatus> {
    const [database, applicationSchema, redis] = await Promise.all([
      this.prisma.checkDatabase(),
      this.prisma.checkApplicationSchema(),
      this.redis.checkRedis(),
    ]);

    const blockingStatuses = [database.status, applicationSchema.status, redis.status].filter((value) => value !== 'not_checked_stub');
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
      dependencies: { database, applicationSchema, redis },
    };
  }
}
