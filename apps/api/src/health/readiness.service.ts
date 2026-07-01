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
    const [database, redis] = await Promise.all([
      this.prisma.checkDatabase(),
      this.redis.checkRedis(),
    ]);

    const statuses = [database.status, redis.status];
    const status = statuses.every((value) => value === 'ok')
      ? 'ok'
      : statuses.some((value) => value === 'unavailable')
        ? 'unavailable'
        : 'degraded';

    return {
      status,
      service: 'wordle-royale-api',
      environment: process.env.NODE_ENV ?? 'development',
      checkedAt: new Date().toISOString(),
      dependencies: { database, redis },
    };
  }
}
