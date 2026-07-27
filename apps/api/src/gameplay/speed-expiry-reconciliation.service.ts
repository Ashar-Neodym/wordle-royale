import { Inject, Injectable, Optional } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { PrismaService } from '../prisma/prisma.service.ts';
import { SpeedExpiryAdjudicationService } from './speed-expiry-adjudication.service.ts';
import {
  SPEED_RECONCILER_BATCH_SIZE,
  SPEED_RECONCILER_LOCK_TIMEOUT_MS,
  SPEED_RECONCILER_MAX_WAIT_MS,
  SPEED_RECONCILER_SELECTION_LIMIT,
  SPEED_RECONCILER_STATEMENT_TIMEOUT_MS,
  SPEED_RECONCILER_TRANSACTION_TIMEOUT_MS,
} from './speed-reconciler-budget.ts';

export type SpeedReconcilePassResult = Readonly<{
  selected: number;
  processed: number;
  hasMore: boolean;
}>;

export type SpeedReconcileDueInput = Readonly<{
  batchSize: typeof SPEED_RECONCILER_BATCH_SIZE;
  selectionLimit: typeof SPEED_RECONCILER_SELECTION_LIMIT;
  completionGuard: () => boolean;
}>;

export const SPEED_RECONCILER_ERROR_CLASSES = Object.freeze([
  'connection',
  'serialization',
  'deadlock',
  'transaction_timeout',
  'lock_timeout',
  'statement_timeout',
  'obsolete_pass',
  'unknown',
] as const);
export type SpeedReconcilerErrorClass = typeof SPEED_RECONCILER_ERROR_CLASSES[number];
export const SPEED_RECONCILER_BEFORE_COMMIT_TEST_HOOK = Symbol('SPEED_RECONCILER_BEFORE_COMMIT_TEST_HOOK');
export const SPEED_RECONCILER_OBSERVABILITY_CLOCK = Symbol('SPEED_RECONCILER_OBSERVABILITY_CLOCK');

export type SpeedReconciliationObservation = Readonly<{
  transactionDurationMs: number | null;
  lastErrorClass: SpeedReconcilerErrorClass | null;
}>;

export class SpeedReconciliationFailure extends Error {
  constructor(readonly errorClass: SpeedReconcilerErrorClass) {
    super('speed_reconciliation_failed');
    this.name = 'SpeedReconciliationFailure';
  }
}

function safeCode(error: unknown): { code: string | null; metaCode: string | null } {
  if (!error || typeof error !== 'object') return { code: null, metaCode: null };
  const value = error as { code?: unknown; meta?: unknown };
  const code = typeof value.code === 'string' ? value.code : null;
  const meta = value.meta && typeof value.meta === 'object' ? value.meta as { code?: unknown } : null;
  return { code, metaCode: typeof meta?.code === 'string' ? meta.code : null };
}

export function classifySpeedReconcilerError(error: unknown): SpeedReconcilerErrorClass {
  if (error instanceof SpeedReconciliationFailure) return error.errorClass;
  const { code, metaCode } = safeCode(error);
  if (code === 'obsolete_speed_reconciler_pass') return 'obsolete_pass';
  if (code === 'P2028') return 'transaction_timeout';
  if (code === 'P2034' || code === '40001' || metaCode === '40001') return 'serialization';
  if (code === '40P01' || metaCode === '40P01') return 'deadlock';
  if (code === '55P03' || metaCode === '55P03') return 'lock_timeout';
  if (code === '57014' || metaCode === '57014') return 'statement_timeout';
  if (code === 'P1001' || code === 'P1002' || code === 'P1008' || code === 'P1017') return 'connection';
  return 'unknown';
}

@Injectable()
export class SpeedExpiryReconciliationService {
  private transactionDurationMs: number | null = null;
  private lastErrorClass: SpeedReconcilerErrorClass | null = null;
  private readonly now: () => number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SpeedExpiryAdjudicationService) private readonly adjudication: SpeedExpiryAdjudicationService,
    @Optional() @Inject(SPEED_RECONCILER_BEFORE_COMMIT_TEST_HOOK) private readonly beforeCommitTestHook?: () => Promise<void>,
    @Optional() @Inject(SPEED_RECONCILER_OBSERVABILITY_CLOCK) clock?: () => number,
  ) {
    this.now = clock ?? (() => performance.now());
  }

  observation(): SpeedReconciliationObservation {
    return Object.freeze({
      transactionDurationMs: this.transactionDurationMs,
      lastErrorClass: this.lastErrorClass,
    });
  }

  async reconcileDue(input: SpeedReconcileDueInput): Promise<SpeedReconcilePassResult> {
    if (input.batchSize !== SPEED_RECONCILER_BATCH_SIZE
      || input.selectionLimit !== SPEED_RECONCILER_SELECTION_LIMIT
      || input.selectionLimit !== input.batchSize + 1) {
      throw new SpeedReconciliationFailure('unknown');
    }

    const startedAt = this.now();
    this.lastErrorClass = null;
    try {
      return await (this.prisma.client as any).$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${SPEED_RECONCILER_LOCK_TIMEOUT_MS}ms'`);
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${SPEED_RECONCILER_STATEMENT_TIMEOUT_MS}ms'`);
        await tx.$executeRawUnsafe(`SET LOCAL idle_in_transaction_session_timeout = '${SPEED_RECONCILER_TRANSACTION_TIMEOUT_MS}ms'`);

        const authoritativeClockSql = this.deterministicTestClockEnabled()
          ? '(SELECT "now" FROM "SpeedTimingTestClock" WHERE "id" = 1)'
          : 'clock_timestamp()';
        const due = await tx.$queryRawUnsafe(
          `WITH authoritative_clock AS (SELECT ${authoritativeClockSql} AS "now")
           SELECT match."id"
             FROM "Match" AS match
             LEFT JOIN "MatchRound" AS round ON round."matchId" = match."id" AND round."roundNumber" = 1
             CROSS JOIN authoritative_clock AS timing
            WHERE match."rankedMode" = 'speed_1v1'
              AND match."adjudicatedAt" IS NULL
              AND ((match."status" = 'pending' AND (
                    (match."readyLifecycleVersion" = 'speed_ready_v2_first_ack_90s'
                      AND match."readyWindowStartedAt" IS NULL
                      AND match."invitationExpiresAt" < timing."now")
                 OR (match."readyLifecycleVersion" = 'speed_ready_v2_first_ack_90s'
                      AND match."readyWindowStartedAt" IS NOT NULL
                      AND match."readyDeadlineAt" < timing."now")
                 OR (COALESCE(match."readyLifecycleVersion", 'speed_ready_v1_match_created_20s') = 'speed_ready_v1_match_created_20s'
                      AND match."readyDeadlineAt" < timing."now")))
                OR (match."status" = 'active' AND round."deadlineAt" < timing."now"))
            ORDER BY COALESCE(round."deadlineAt", match."readyDeadlineAt", match."invitationExpiresAt"), match."id"
            FOR UPDATE OF match SKIP LOCKED
            LIMIT $1`,
          input.selectionLimit,
        ) as Array<{ id: string }>;

        const selected = due.length;
        const work = due.slice(0, input.batchSize);
        for (const row of work) await this.adjudication.reconcileMatch(tx, row.id);
        if (this.beforeCommitTestHook && this.hostileRaceTestEnabled()) await this.beforeCommitTestHook();
        if (!input.completionGuard()) throw Object.assign(new Error('speed_reconciliation_failed'), { code: 'obsolete_speed_reconciler_pass' });
        return Object.freeze({ selected, processed: work.length, hasMore: selected > input.batchSize });
      }, {
        isolationLevel: 'Serializable',
        maxWait: SPEED_RECONCILER_MAX_WAIT_MS,
        timeout: this.hostileRaceTestEnabled() ? 10_000 : SPEED_RECONCILER_TRANSACTION_TIMEOUT_MS,
      });
    } catch (error) {
      const errorClass = classifySpeedReconcilerError(error);
      this.lastErrorClass = errorClass;
      throw new SpeedReconciliationFailure(errorClass);
    } finally {
      this.transactionDurationMs = Math.max(0, this.now() - startedAt);
    }
  }

  private hostileRaceTestEnabled(): boolean {
    return process.env.RUN_SPEED_LIFECYCLE_RACE_POSTGRES_INTEGRATION === '1'
      && process.env.NODE_ENV === 'test'
      && process.env.APP_ENV === 'test';
  }

  private deterministicTestClockEnabled(): boolean {
    return process.env.NODE_ENV === 'test'
      && process.env.APP_ENV === 'test'
      && (process.env.RUN_SPEED_TIMING_POSTGRES_INTEGRATION === '1'
        || process.env.RUN_SPEED_LIFECYCLE_RACE_POSTGRES_INTEGRATION === '1');
  }
}
