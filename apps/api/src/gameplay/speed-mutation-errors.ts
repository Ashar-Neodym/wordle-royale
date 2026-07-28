import { ConflictException, HttpException, ServiceUnavailableException } from '@nestjs/common';

export const SPEED_MUTATION_ERROR_CLASSES = [
  'serialization',
  'deadlock',
  'lock_timeout',
  'transaction_timeout',
  'statement_timeout',
  'connection',
  'lifecycle_timeout',
  'domain',
  'unknown',
] as const;

export type SpeedMutationErrorClass = typeof SPEED_MUTATION_ERROR_CLASSES[number];

const CONNECTION_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
const WRAPPER_KEYS = ['cause', 'original', 'error'] as const;
const MAX_ERROR_DEPTH = 3;

function structuredCodes(value: Record<string, unknown>): string[] {
  const codes: string[] = [];
  if (typeof value.code === 'string') codes.push(value.code);
  const meta = value.meta;
  if (meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>).code === 'string') {
    codes.push((meta as Record<string, unknown>).code as string);
  }
  return codes;
}

export function classifySpeedMutationError(error: unknown): SpeedMutationErrorClass {
  if (error instanceof HttpException) return 'domain';
  const seen = new Set<object>();
  const queue: Array<{ value: unknown; depth: number }> = [{ value: error, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!current.value || typeof current.value !== 'object' || seen.has(current.value as object)) continue;
    seen.add(current.value as object);
    const record = current.value as Record<string, unknown>;
    for (const code of structuredCodes(record)) {
      if (code === 'P2034' || code === '40001') return 'serialization';
      if (code === '40P01') return 'deadlock';
      if (code === '55P03') return 'lock_timeout';
      if (code === 'P2028') return 'transaction_timeout';
      if (code === '57014') return 'statement_timeout';
      if (CONNECTION_CODES.has(code)) return 'connection';
    }
    if (current.depth >= MAX_ERROR_DEPTH) continue;
    for (const key of WRAPPER_KEYS) queue.push({ value: record[key], depth: current.depth + 1 });
  }
  return 'unknown';
}

export function speedMutationErrorIsRetryable(errorClass: SpeedMutationErrorClass): boolean {
  return errorClass === 'serialization' || errorClass === 'deadlock' || errorClass === 'lock_timeout';
}

export function speedMutationPublicError(errorClass: SpeedMutationErrorClass): HttpException {
  if (errorClass === 'domain') {
    throw new TypeError('Domain errors must be rethrown by identity.');
  }
  if (speedMutationErrorIsRetryable(errorClass)) {
    return new ConflictException({
      code: 'speed_gameplay_busy',
      message: 'Speed gameplay was busy resolving concurrent activity. Retry the request.',
    });
  }
  if (errorClass === 'transaction_timeout' || errorClass === 'statement_timeout') {
    return new ServiceUnavailableException({
      code: 'speed_mutation_transaction_timeout',
      message: 'The Speed transaction expired.',
    });
  }
  if (errorClass === 'lifecycle_timeout') {
    return new ServiceUnavailableException({
      code: 'speed_mutation_lifecycle_timeout',
      message: 'The Speed mutation lifecycle budget expired.',
    });
  }
  return new ServiceUnavailableException({
    code: 'speed_mutation_unavailable',
    message: 'Speed gameplay is temporarily unavailable. Retry the request.',
  });
}

type ReadyProjectionReceiptOutcome = 'committed' | 'replay' | 'already_ready' | 'terminal' | 'late';

export function speedSnapshotUnavailableError(outcome: ReadyProjectionReceiptOutcome): ServiceUnavailableException {
  const acknowledgementKnown = outcome === 'committed' || outcome === 'replay' || outcome === 'already_ready';
  return new ServiceUnavailableException({
    code: 'speed_snapshot_unavailable',
    message: acknowledgementKnown
      ? 'The ready acknowledgement was recorded, but the latest Speed state is temporarily unavailable.'
      : 'The latest Speed state is temporarily unavailable. No ready acknowledgement was recorded by this request.',
    details: { commitKnown: true, acknowledgementKnown, retrySafe: acknowledgementKnown },
  });
}
