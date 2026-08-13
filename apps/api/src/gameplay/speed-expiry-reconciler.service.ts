import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  classifySpeedReconcilerError,
  SPEED_RECONCILER_ERROR_CLASSES,
  SpeedExpiryReconciliationService,
  type SpeedReconcilerErrorClass,
} from './speed-expiry-reconciliation.service.ts';
import {
  SPEED_RECONCILER_BATCH_SIZE,
  SPEED_RECONCILER_INTERVAL_MS,
  SPEED_RECONCILER_SELECTION_LIMIT,
} from './speed-reconciler-budget.ts';
import { SpeedRuntimeHealthService, type SpeedReconcilerHealthSnapshot } from './speed-runtime-health.service.ts';
import { serverlessRuntime } from '../config/runtime-config.ts';

export type SpeedReconcilerMetrics = {
  processed: number;
  obsoleteCompletions: number;
  passStarted: number;
  caughtUpPasses: number;
  backlogPasses: number;
  failedPasses: number;
  skippedOverlaps: number;
  immediateCatchups: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorClass: SpeedReconcilerErrorClass | null;
  errorCounts: Readonly<Record<SpeedReconcilerErrorClass, number>>;
  counters: Readonly<Record<string, number>>;
  gauges: Readonly<Record<string, number | boolean | null>>;
  health: SpeedReconcilerHealthSnapshot;
};

@Injectable()
export class SpeedExpiryReconcilerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private schedulingEnabled = false;
  private schedulerEpoch: number | null = null;
  private pendingTickEpoch: number | null = null;
  private lastSuccessAt: Date | null = null;
  private lastErrorAt: Date | null = null;
  private processed = 0;
  private obsoleteCompletions = 0;
  private passStarted = 0;
  private caughtUpPasses = 0;
  private backlogPasses = 0;
  private failedPasses = 0;
  private skippedOverlaps = 0;
  private immediateCatchups = 0;
  private lastErrorClass: SpeedReconcilerErrorClass | null = null;
  private transactionDurationMs: number | null = null;
  private readonly errorCounts = Object.fromEntries(
    SPEED_RECONCILER_ERROR_CLASSES.map((errorClass) => [errorClass, 0]),
  ) as Record<SpeedReconcilerErrorClass, number>;

  constructor(
    @Inject(SpeedExpiryReconciliationService) private readonly reconciliation: SpeedExpiryReconciliationService,
    @Inject(SpeedRuntimeHealthService) private readonly runtimeHealth: SpeedRuntimeHealthService,
  ) {}

  onModuleInit(): void {
    if (serverlessRuntime()) return;
    if (!this.enabled()) return;
    this.schedulingEnabled = true;
    this.schedulerEpoch = this.runtimeHealth.markSchedulerStarted();
    void this.tick();
  }

  onModuleDestroy(): void {
    this.schedulingEnabled = false;
    this.pendingTickEpoch = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const schedulerEpoch = this.schedulerEpoch;
    this.schedulerEpoch = null;
    if (schedulerEpoch !== null) this.runtimeHealth.markSchedulerStopped(schedulerEpoch);
  }

  isReady(): boolean {
    return !this.enabled() || this.runtimeHealth.isReconcilerReady();
  }

  metrics(): SpeedReconcilerMetrics {
    const health = this.runtimeHealth.snapshot();
    return {
      processed: this.processed,
      obsoleteCompletions: this.obsoleteCompletions,
      passStarted: this.passStarted,
      caughtUpPasses: this.caughtUpPasses,
      backlogPasses: this.backlogPasses,
      failedPasses: this.failedPasses,
      skippedOverlaps: this.skippedOverlaps,
      immediateCatchups: this.immediateCatchups,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: this.lastErrorAt?.toISOString() ?? null,
      lastErrorClass: this.lastErrorClass,
      errorCounts: Object.freeze({ ...this.errorCounts }),
      counters: Object.freeze({
        speed_reconciler_pass_started_total: this.passStarted,
        speed_reconciler_pass_caught_up_total: this.caughtUpPasses,
        speed_reconciler_pass_backlog_total: this.backlogPasses,
        speed_reconciler_pass_failed_total: this.failedPasses,
        speed_reconciler_pass_obsolete_total: this.obsoleteCompletions,
        speed_reconciler_tick_skipped_overlap_total: this.skippedOverlaps,
        speed_reconciler_matches_processed_total: this.processed,
        speed_reconciler_immediate_catchup_total: this.immediateCatchups,
      }),
      gauges: Object.freeze({
        speed_reconciler_pass_duration_ms: health.lastPassDurationMs,
        speed_reconciler_transaction_duration_ms: this.transactionDurationMs,
        speed_reconciler_success_age_ms: health.successAgeMs,
        speed_reconciler_inflight_age_ms: health.inFlightAgeMs,
        speed_reconciler_last_processed: health.lastProcessed,
        speed_reconciler_backlog_observed: health.backlogObserved,
      }),
      health,
    };
  }

  async tick(): Promise<void> {
    if (this.running) {
      this.skippedOverlaps += 1;
      if (this.schedulingEnabled && this.schedulerEpoch !== null) this.pendingTickEpoch = this.schedulerEpoch;
      return;
    }
    const epoch = this.schedulerEpoch;
    if (epoch === null) return;
    const pass = this.runtimeHealth.markPassStarted(epoch);
    if (pass === null) return;
    this.running = true;
    this.passStarted += 1;
    let nextDelay: number | null = null;
    try {
      const result = await this.reconciliation.reconcileDue({
        batchSize: SPEED_RECONCILER_BATCH_SIZE,
        selectionLimit: SPEED_RECONCILER_SELECTION_LIMIT,
        completionGuard: () => this.runtimeHealth.isPassCompletionEligible(pass),
      });
      this.captureTransactionObservation();
      this.processed += result.processed;
      if (!this.runtimeHealth.markPassSucceeded(pass, result)) {
        this.obsoleteCompletions += 1;
        this.recordErrorClass('obsolete_pass');
        if (this.schedulingEnabled && this.schedulerEpoch === epoch) nextDelay = SPEED_RECONCILER_INTERVAL_MS;
      } else if (result.hasMore) {
        this.backlogPasses += 1;
        this.immediateCatchups += 1;
        nextDelay = 0;
      } else {
        this.caughtUpPasses += 1;
        this.lastSuccessAt = new Date();
        nextDelay = SPEED_RECONCILER_INTERVAL_MS;
      }
    } catch (error) {
      this.captureTransactionObservation();
      if (this.runtimeHealth.markPassFailed(pass)) {
        this.failedPasses += 1;
        this.lastErrorAt = new Date();
        this.recordErrorClass(classifySpeedReconcilerError(error));
        nextDelay = SPEED_RECONCILER_INTERVAL_MS;
      } else {
        this.obsoleteCompletions += 1;
        this.recordErrorClass('obsolete_pass');
        if (this.schedulingEnabled && this.schedulerEpoch === epoch) nextDelay = SPEED_RECONCILER_INTERVAL_MS;
      }
    } finally {
      this.running = false;
      const pendingEpoch = this.pendingTickEpoch;
      if (pendingEpoch !== null && this.schedulingEnabled && pendingEpoch === this.schedulerEpoch) {
        this.pendingTickEpoch = null;
        this.schedule(0, pendingEpoch);
      } else if (nextDelay !== null) {
        this.schedule(nextDelay, epoch);
      }
    }
  }

  private captureTransactionObservation(): void {
    const observation = (this.reconciliation as any).observation?.() as { transactionDurationMs?: unknown } | undefined;
    if (typeof observation?.transactionDurationMs === 'number' && Number.isFinite(observation.transactionDurationMs)) {
      this.transactionDurationMs = Math.max(0, observation.transactionDurationMs);
    }
  }

  private recordErrorClass(errorClass: SpeedReconcilerErrorClass): void {
    this.lastErrorClass = errorClass;
    this.errorCounts[errorClass] += 1;
  }

  private schedule(delay: number, epoch: number): void {
    if (!this.schedulingEnabled || this.schedulerEpoch !== epoch) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.schedulingEnabled || this.schedulerEpoch !== epoch) return;
      void this.tick();
    }, delay);
    this.timer.unref();
  }

  private enabled(): boolean {
    const value = process.env.SPEED_1V1_QUEUE_ENABLED?.toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
  }
}
