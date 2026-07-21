import type { SPEED_LIFECYCLE_PHASES, SPEED_LIFECYCLE_VERSIONS } from './speed-lifecycle-activation.constants.ts';

export type SpeedLifecycleVersion = typeof SPEED_LIFECYCLE_VERSIONS[number];
export type SpeedActivationPhase = typeof SPEED_LIFECYCLE_PHASES[number];

export type SpeedCreationAuthority = {
  protocol: 'speed_lifecycle_activation_gate_v1';
  phase: SpeedActivationPhase;
  activeVersion: SpeedLifecycleVersion;
  generation: bigint;
};

export type SpeedActivationAvailabilityReason =
  | 'available'
  | 'activation_unavailable'
  | 'activation_draining'
  | 'activation_protocol_unsupported'
  | 'active_version_unsupported'
  | 'capability_lease_unavailable';

export type SpeedActivationAvailability = {
  available: boolean;
  reason: SpeedActivationAvailabilityReason;
  activeVersion: SpeedLifecycleVersion | null;
  phase: SpeedActivationPhase | null;
};

export type SpeedActivationTransitionInput = {
  expectedGeneration: bigint;
  targetReleaseId: string;
  expectedReplicaCount: number;
  reason: string;
};

export type SpeedProviderInventoryProof = {
  proofProtocol: 'speed_provider_inventory_proof_v1';
  targetReleaseId: string;
  servingReplicaCount: number;
  priorReleaseIds: string[];
  rolloutSettled: boolean;
  proofId: string;
};

export interface SpeedProviderInventoryVerifier {
  verifyTarget(input: { targetReleaseId: string; expectedReplicaCount: number }): Promise<SpeedProviderInventoryProof>;
}
