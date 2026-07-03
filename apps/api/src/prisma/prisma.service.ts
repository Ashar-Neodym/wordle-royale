import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { ReadinessDependency } from '@wordle-royale/contracts';

export type PrismaClientLike = {
  $queryRaw?: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $disconnect?: () => Promise<void>;
  userAccount: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown>;
  };
  userProfile: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
  };
  lobby: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
};

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly prisma = new PrismaClient();

  get client(): PrismaClientLike {
    return this.prisma as unknown as PrismaClientLike;
  }

  async checkDatabase(): Promise<ReadinessDependency> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      if (this.client.$queryRaw) {
        await this.client.$queryRaw`SELECT 1`;
      }
      return { status: 'ok', checkedAt, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'unavailable',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Database readiness check failed.',
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect?.();
  }
}
