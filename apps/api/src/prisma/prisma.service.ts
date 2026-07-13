import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { ReadinessDependency } from '@wordle-royale/contracts';

export type PrismaClientLike = {
  $queryRaw?: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe?: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
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

const requiredApplicationTables = [
  'UserAccount',
  'UserProfile',
  'ConsentRecord',
  'DictionaryRelease',
  'DictionaryWord',
  'Lobby',
  'Match',
  'MatchRound',
  'MatchParticipant',
  'GuessAttempt',
  'ScoreBreakdown',
  'MatchReport',
  'RatingProfile',
  'RatingEvent',
  'LeaderboardSnapshot',
  'MatchmakingTicket',
  'AnalyticsEvent',
  'AuditLog',
] as const;

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

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

  async checkApplicationSchema(): Promise<ReadinessDependency> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      if (!this.client.$queryRawUnsafe) {
        return {
          status: 'not_checked_stub',
          checkedAt,
          message: 'Application schema readiness check is unavailable for this Prisma client.',
        };
      }

      const requiredTableList = requiredApplicationTables.map(sqlStringLiteral).join(', ');
      const rows = await this.client.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_type = 'BASE TABLE'
            AND table_name IN (${requiredTableList})`,
      );
      const foundTables = new Set(rows.map((row) => row.table_name));
      const missingTables = requiredApplicationTables.filter((tableName) => !foundTables.has(tableName));

      if (missingTables.length > 0) {
        return {
          status: 'unavailable',
          checkedAt,
          latencyMs: Date.now() - startedAt,
          message: `Application schema is missing required table(s): ${missingTables.join(', ')}. Run database migrations before serving traffic.`,
        };
      }

      return {
        status: 'ok',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `Application schema contains ${requiredApplicationTables.length} required table(s).`,
      };
    } catch (error) {
      return {
        status: 'unavailable',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Application schema readiness check failed.',
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect?.();
  }
}
