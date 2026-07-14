export const MATCHMAKING_OPERATIONS = ['join', 'reconnect', 'current_ticket', 'cancel'] as const;

export type MatchmakingOperation = (typeof MATCHMAKING_OPERATIONS)[number];

/**
 * Cross-layer Standard matchmaking timeout contract.
 *
 * The API receives five seconds beyond the backend's complete monotonic lifecycle
 * for response normalization and transport. The server action receives another
 * five seconds for cookie forwarding, dispatch, and parsing. The browser remains
 * bounded while waiting ten seconds beyond the complete server-action maximum.
 */
export const MATCHMAKING_DEADLINE_POLICY = Object.freeze({
  backendLifecycleMs: 90_000,
  apiProxyMs: 95_000,
  serverActionMaxDurationSeconds: 100,
  serverActionMaxMs: 100_000,
  browserMs: 110_000,
  minimumApiOverheadMs: 5_000,
  minimumServerOverheadMs: 5_000,
  minimumBrowserOverheadMs: 10_000,
});

export function matchmakingDeadlinePolicyFor(_operation: MatchmakingOperation): typeof MATCHMAKING_DEADLINE_POLICY {
  return MATCHMAKING_DEADLINE_POLICY;
}
