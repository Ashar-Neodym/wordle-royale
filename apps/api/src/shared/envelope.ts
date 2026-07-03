import { randomUUID } from 'node:crypto';
import type { ErrorEnvelope, SuccessEnvelope } from '@wordle-royale/contracts';

type RequestLike = { headers?: Record<string, string | string[] | undefined> } | undefined;

type ErrorDetails = Record<string, unknown>;

function requestIdFrom(request: RequestLike): string {
  const value = request?.headers?.['x-request-id'];
  if (Array.isArray(value)) {
    return value[0] ?? randomUUID();
  }
  return value ?? randomUUID();
}

export function ok<T>(data: T, request?: RequestLike): SuccessEnvelope<T> {
  return { data, error: null, requestId: requestIdFrom(request) };
}

export function fail(code: string, message: string, details: ErrorDetails = {}, request?: RequestLike): ErrorEnvelope {
  return { data: null, error: { code, message, details }, requestId: requestIdFrom(request) };
}
