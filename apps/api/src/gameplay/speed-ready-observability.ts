import type { SpeedMutationErrorClass } from './speed-mutation-errors.ts';

export const SPEED_READY_EVENTS = [
  'dependency_check',
  'transaction_requested',
  'callback_entered',
  'match_lock_acquired',
  'mutation_staged',
  'transaction_returned',
  'projection_started',
  'projection_completed',
] as const;
export type SpeedReadyEvent = typeof SPEED_READY_EVENTS[number];
export const SPEED_READY_DURATIONS = [
  'dependency_check',
  'connection_acquisition',
  'row_lock_wait',
  'critical_section',
  'commit_return',
  'projection',
  'total',
] as const;
export type SpeedReadyDuration = typeof SPEED_READY_DURATIONS[number];
export const SPEED_READY_DURATION_BUCKETS_MS = [10, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 24_000] as const;
export const SPEED_READY_OUTCOMES = ['committed', 'replay', 'already_ready', 'terminal', 'late', 'domain_conflict', 'retrying', 'projection_failed', 'failed'] as const;
export type SpeedReadyOutcome = typeof SPEED_READY_OUTCOMES[number];

function zeroRecord<const T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}

export class SpeedReadyObservability {
  private readonly eventCount = zeroRecord(SPEED_READY_EVENTS);
  private readonly durationLastMs = zeroRecord(SPEED_READY_DURATIONS);
  private readonly durationMaxMs = zeroRecord(SPEED_READY_DURATIONS);
  private readonly durationBuckets = Object.fromEntries(SPEED_READY_DURATIONS.map((duration) => [
    duration,
    Object.fromEntries(SPEED_READY_DURATION_BUCKETS_MS.map((bucket) => [String(bucket), 0])),
  ])) as Record<SpeedReadyDuration, Record<string, number>>;
  private readonly outcomeCount = zeroRecord(SPEED_READY_OUTCOMES);
  private readonly errorClassCount: Record<SpeedMutationErrorClass, number> = {
    serialization: 0, deadlock: 0, lock_timeout: 0, transaction_timeout: 0,
    statement_timeout: 0, connection: 0, lifecycle_timeout: 0, domain: 0, unknown: 0,
  };
  private retryCount = 0;

  observeEvent(event: SpeedReadyEvent): void { this.eventCount[event] += 1; }

  observeDuration(duration: SpeedReadyDuration, durationMs: number): void {
    const bounded = Math.max(0, Math.round(durationMs));
    this.durationLastMs[duration] = bounded;
    this.durationMaxMs[duration] = Math.max(this.durationMaxMs[duration], bounded);
    const buckets = this.durationBuckets[duration]!;
    for (const bucket of SPEED_READY_DURATION_BUCKETS_MS) {
      if (bounded <= bucket) {
        const key = String(bucket);
        buckets[key] = (buckets[key] ?? 0) + 1;
      }
    }
  }

  observeOutcome(outcome: SpeedReadyOutcome): void { this.outcomeCount[outcome] += 1; }
  observeError(errorClass: SpeedMutationErrorClass): void { this.errorClassCount[errorClass] += 1; }
  observeRetry(): void { this.retryCount += 1; }

  snapshot() {
    return {
      events: { ...this.eventCount },
      durationLastMs: { ...this.durationLastMs },
      durationMaxMs: { ...this.durationMaxMs },
      durationBuckets: Object.fromEntries(Object.entries(this.durationBuckets).map(([key, value]) => [key, { ...value }])),
      outcomes: { ...this.outcomeCount }, errorClasses: { ...this.errorClassCount }, retries: this.retryCount,
    };
  }
}
