import type { ApiEnvelope } from './types.js';

export const statusFixtures = {
  loading: { kind: 'loading', label: 'Loading' },
  emptyLobbies: { kind: 'empty', label: 'No public lobbies', primaryAction: 'Create lobby' },
  emptyRecentMatches: { kind: 'empty', label: 'No recent matches', primaryAction: 'Quick join' },
  offline: { kind: 'connection', state: 'offline', label: 'You are offline. Gameplay input is paused.' },
  reconnecting: { kind: 'connection', state: 'reconnecting', label: 'Reconnecting to match…' },
  reconnected: { kind: 'connection', state: 'reconnected', label: 'Reconnected and match state synced.' },
  rateLimited: { kind: 'error', code: 'RATE_LIMITED', label: 'Too many attempts. Try again shortly.' },
} as const;

export const errorEnvelopes = {
  unauthorized: { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.', retryable: false }, requestId: 'req_unauthorized' },
  forbidden: { data: null, error: { code: 'FORBIDDEN', message: 'You do not have access to this match report.', retryable: false }, requestId: 'req_forbidden' },
  rateLimited: { data: null, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again soon.', retryable: true }, requestId: 'req_rate_limited' },
  serverUnavailable: { data: null, error: { code: 'SERVER_UNAVAILABLE', message: 'Server unavailable. Retry in a moment.', retryable: true }, requestId: 'req_server_unavailable' },
} as const satisfies Record<string, ApiEnvelope<never>>;
