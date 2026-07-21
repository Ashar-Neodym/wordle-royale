import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SpeedGameplayService } from './speed-gameplay.service.ts';
import {
  SPEED_RECONCILER_INTERVAL_MS,
  SpeedRuntimeHealthService,
  type SpeedReconcilerHealthSnapshot,
} from './speed-runtime-health.service.ts';

@Injectable()
export class SpeedExpiryReconcilerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private schedulerEpoch: number | null = null;
  private lastSuccessAt: Date | null = null;
  private lastErrorAt: Date | null = null;
  private processed = 0;
  private obsoleteCompletions = 0;

  constructor(
    @Inject(SpeedGameplayService) private readonly gameplay: SpeedGameplayService,
    @Inject(SpeedRuntimeHealthService) private readonly runtimeHealth: SpeedRuntimeHealthService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled()) return;
    this.schedulerEpoch = this.runtimeHealth.markSchedulerStarted();
    this.timer = setInterval(() => void this.tick(), SPEED_RECONCILER_INTERVAL_MS);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const schedulerEpoch = this.schedulerEpoch;
    this.schedulerEpoch = null;
    if (schedulerEpoch !== null) this.runtimeHealth.markSchedulerStopped(schedulerEpoch);
  }

  isReady(): boolean {
    return !this.enabled() || this.runtimeHealth.isReconcilerReady();
  }

  metrics(): { processed: number; obsoleteCompletions: number; lastSuccessAt: string | null; lastErrorAt: string | null; health: SpeedReconcilerHealthSnapshot } {
    return {
      processed: this.processed,
      obsoleteCompletions: this.obsoleteCompletions,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: this.lastErrorAt?.toISOString() ?? null,
      health: this.runtimeHealth.snapshot(),
    };
  }

  async tick(): Promise<void> {
    if (this.running || this.schedulerEpoch === null) return;
    const pass = this.runtimeHealth.markPassStarted(this.schedulerEpoch);
    if (pass === null) return;
    this.running = true;
    try {
      this.processed += await this.gameplay.reconcileDue(
        25,
        () => this.runtimeHealth.isPassCompletionEligible(pass),
      );
      if (this.runtimeHealth.markPassSucceeded(pass)) this.lastSuccessAt = new Date();
      else this.obsoleteCompletions += 1;
    } catch {
      if (this.runtimeHealth.markPassFailed(pass)) this.lastErrorAt = new Date();
      else this.obsoleteCompletions += 1;
    } finally {
      this.running = false;
    }
  }

  private enabled(): boolean {
    const value = process.env.SPEED_1V1_QUEUE_ENABLED?.toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
  }
}
