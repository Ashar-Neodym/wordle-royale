import { Inject, Injectable, Optional } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

export const SPEED_RECONCILER_INTERVAL_MS = 1_000;
// Two missed one-second completion opportunities are the bounded fail-closed budget.
export const SPEED_RECONCILER_MAX_PASS_MS = SPEED_RECONCILER_INTERVAL_MS * 2;
export const SPEED_RECONCILER_SUCCESS_FRESHNESS_MS = SPEED_RECONCILER_INTERVAL_MS * 2;

export const SPEED_RUNTIME_MONOTONIC_CLOCK = Symbol('SPEED_RUNTIME_MONOTONIC_CLOCK');
export type SpeedRuntimeMonotonicClock = () => number;

export type SpeedReconcilerPassToken = Readonly<{
  schedulerEpoch: number;
  generation: number;
  startedAt: number;
}>;

export type SpeedReconcilerHealthSnapshot = {
  ready: boolean;
  schedulerRunning: boolean;
  schedulerEpoch: number;
  passInFlight: boolean;
  passGeneration: number | null;
  lastCompletionSucceeded: boolean;
  successAgeMs: number | null;
  inFlightAgeMs: number | null;
  successFreshnessMs: number;
  maxPassMs: number;
};

@Injectable()
export class SpeedRuntimeHealthService {
  private schedulerRunning = false;
  private schedulerEpoch = 0;
  private nextPassGeneration = 0;
  private currentPass: SpeedReconcilerPassToken | null = null;
  private lastSuccessfulCompletionAt: number | null = null;
  private lastCompletionSucceeded = false;
  private readonly now: SpeedRuntimeMonotonicClock;

  constructor(
    @Optional() @Inject(SPEED_RUNTIME_MONOTONIC_CLOCK) monotonicClock?: SpeedRuntimeMonotonicClock,
  ) {
    this.now = monotonicClock ?? (() => performance.now());
  }

  markSchedulerStarted(): number {
    this.schedulerEpoch += 1;
    this.schedulerRunning = true;
    this.currentPass = null;
    this.lastSuccessfulCompletionAt = null;
    this.lastCompletionSucceeded = false;
    return this.schedulerEpoch;
  }

  markSchedulerStopped(schedulerEpoch: number): boolean {
    if (!this.schedulerRunning || schedulerEpoch !== this.schedulerEpoch) return false;
    this.schedulerRunning = false;
    this.currentPass = null;
    this.lastCompletionSucceeded = false;
    return true;
  }

  markPassStarted(schedulerEpoch: number): SpeedReconcilerPassToken | null {
    if (!this.schedulerRunning || schedulerEpoch !== this.schedulerEpoch || this.currentPass !== null) return null;
    const passIdentity = Object.freeze({
      schedulerEpoch,
      generation: ++this.nextPassGeneration,
      startedAt: this.now(),
    });
    this.currentPass = passIdentity;
    return passIdentity;
  }

  markPassSucceeded(passIdentity: SpeedReconcilerPassToken): boolean {
    if (!this.isCurrentPass(passIdentity)) return false;
    this.currentPass = null;
    const completedAt = this.now();
    const withinBudget = completedAt - passIdentity.startedAt <= SPEED_RECONCILER_MAX_PASS_MS;
    if (!this.schedulerRunning || passIdentity.schedulerEpoch !== this.schedulerEpoch || !withinBudget) {
      this.lastCompletionSucceeded = false;
      return false;
    }
    this.lastSuccessfulCompletionAt = completedAt;
    this.lastCompletionSucceeded = true;
    return true;
  }

  markPassFailed(passIdentity: SpeedReconcilerPassToken): boolean {
    if (!this.isCurrentPass(passIdentity)) return false;
    this.currentPass = null;
    this.lastCompletionSucceeded = false;
    const completedAt = this.now();
    const withinBudget = completedAt - passIdentity.startedAt <= SPEED_RECONCILER_MAX_PASS_MS;
    return this.schedulerRunning
      && passIdentity.schedulerEpoch === this.schedulerEpoch
      && withinBudget;
  }

  isReconcilerReady(): boolean {
    return this.snapshot().ready;
  }

  snapshot(): SpeedReconcilerHealthSnapshot {
    const now = this.now();
    const successAgeMs = this.lastSuccessfulCompletionAt === null
      ? null
      : Math.max(0, now - this.lastSuccessfulCompletionAt);
    const inFlightAgeMs = this.currentPass === null
      ? null
      : Math.max(0, now - this.currentPass.startedAt);
    const successFresh = successAgeMs !== null && successAgeMs <= SPEED_RECONCILER_SUCCESS_FRESHNESS_MS;
    const passWithinBudget = inFlightAgeMs === null || inFlightAgeMs <= SPEED_RECONCILER_MAX_PASS_MS;

    return {
      ready: this.schedulerRunning && this.lastCompletionSucceeded && successFresh && passWithinBudget,
      schedulerRunning: this.schedulerRunning,
      schedulerEpoch: this.schedulerEpoch,
      passInFlight: this.currentPass !== null,
      passGeneration: this.currentPass?.generation ?? null,
      lastCompletionSucceeded: this.lastCompletionSucceeded,
      successAgeMs,
      inFlightAgeMs,
      successFreshnessMs: SPEED_RECONCILER_SUCCESS_FRESHNESS_MS,
      maxPassMs: SPEED_RECONCILER_MAX_PASS_MS,
    };
  }

  private isCurrentPass(passIdentity: SpeedReconcilerPassToken): boolean {
    return this.currentPass !== null
      && passIdentity.schedulerEpoch === this.currentPass.schedulerEpoch
      && passIdentity.generation === this.currentPass.generation
      && passIdentity.startedAt === this.currentPass.startedAt;
  }
}
