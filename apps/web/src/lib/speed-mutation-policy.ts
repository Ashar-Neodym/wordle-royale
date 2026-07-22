export const SPEED_MUTATION_OPERATIONS = ['ready', 'guess', 'forfeit'] as const;
export type SpeedMutationOperation = (typeof SPEED_MUTATION_OPERATIONS)[number];

export const SPEED_MUTATION_POLICY = Object.freeze({
  backendLifecycleMs: 24_000,
  apiProxyMs: 26_000,
  serverActionMs: 30_000,
  browserEnvelopeMs: 35_000,
  softUncertainMs: 8_000,
  recoveryReadTimeoutMs: 12_000,
  recoveryReadAttempts: 2,
  recoveryRetryDelayMs: 250,
});

export type SpeedOperationOutcome<T> =
  | { kind: 'settled'; value: T }
  | { kind: 'timed_out'; settlement: Promise<SpeedOperationSettlement<T>> };

export type SpeedOperationSettlement<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

type Schedule = (callback: () => void, timeoutMs: number) => unknown;
type Cancel = (timer: unknown) => void;

const defaultSchedule: Schedule = (callback, timeoutMs) => setTimeout(callback, timeoutMs);
const defaultCancel: Cancel = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>);

export async function raceSpeedOperation<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  schedule: Schedule = defaultSchedule,
  cancel: Cancel = defaultCancel,
): Promise<SpeedOperationOutcome<T>> {
  const rawOperationPromise = operation();
  const settlement = rawOperationPromise.then(
    (value): SpeedOperationSettlement<T> => ({ status: 'fulfilled', value }),
    (reason): SpeedOperationSettlement<T> => ({ status: 'rejected', reason }),
  );
  const operationPromise = rawOperationPromise.then((value): SpeedOperationOutcome<T> => ({ kind: 'settled', value }));
  let timeoutTimer: unknown;
  const timeoutPromise = new Promise<SpeedOperationOutcome<T>>((resolve) => {
    timeoutTimer = schedule(() => resolve({ kind: 'timed_out', settlement }), timeoutMs);
  });
  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    cancel(timeoutTimer);
  }
}

export async function runSpeedBrowserMutation<T>({
  mutate,
  recover,
  onSoftUncertain,
  schedule = defaultSchedule,
  cancel = defaultCancel,
}: {
  mutate: () => Promise<T>;
  recover: () => Promise<void>;
  onSoftUncertain: () => void;
  schedule?: Schedule;
  cancel?: Cancel;
}): Promise<SpeedOperationOutcome<T>> {
  const softTimer = schedule(() => {
    onSoftUncertain();
    void recover().catch(() => undefined);
  }, SPEED_MUTATION_POLICY.softUncertainMs);
  try {
    return await raceSpeedOperation(
      mutate,
      SPEED_MUTATION_POLICY.browserEnvelopeMs,
      schedule,
      cancel,
    );
  } finally {
    cancel(softTimer);
  }
}
