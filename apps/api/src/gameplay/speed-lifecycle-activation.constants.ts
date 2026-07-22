export const SPEED_LIFECYCLE_CONTROL_KEY = 'speed_1v1' as const;
export const SPEED_LIFECYCLE_CONTROL_PROTOCOL = 'speed_lifecycle_activation_gate_v1' as const;
export const SPEED_LIFECYCLE_V1 = 'speed_ready_v1_match_created_20s' as const;
export const SPEED_LIFECYCLE_V2 = 'speed_ready_v2_first_ack_90s' as const;
export const SPEED_LIFECYCLE_HEARTBEAT_INTERVAL_MS = 10_000;
export const SPEED_LIFECYCLE_LEASE_TTL_MS = 30_000;

export const SPEED_LIFECYCLE_PHASES = [
  'v1_open',
  'closing_to_v2',
  'v2_open',
  'closing_to_v1',
  'disabled',
] as const;

export const SPEED_LIFECYCLE_VERSIONS = [SPEED_LIFECYCLE_V1, SPEED_LIFECYCLE_V2] as const;
