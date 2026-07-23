import { createHash, randomUUID } from 'node:crypto';
import type { SpeedActivationPhase } from './speed-lifecycle-activation.types.ts';

export const SPEED_PROVIDER_PROOF_PROTOCOL_V2 = 'speed_provider_inventory_proof_v2' as const;
export const PROVIDER_PROOF_MAX_ACQUISITION_MS = 15_000;
export const PROVIDER_PROOF_MAX_AGE_MS = 20_000;

export type RailwayScope = {
  projectId: string;
  environmentId: string;
  serviceId: string;
  deploymentId: string;
};

export type RailwayInventoryObservation = RailwayScope & {
  releaseId: string;
  artifactIdentity: string;
  servingReplicaCount: number;
  servingReplicaIds: string[];
  servingReplicaIdsDigest: string;
  regionalAllocation: Array<{ region: string; replicaCount: number }>;
  regionalAllocationDigest: string;
  healthHosts: string[];
  inactivePriorDeploymentIds: string[];
  rolloutSettled: true;
  operatorPrincipalHash: string;
  inventoryDigest: string;
};

export type SpeedProviderInventoryProofV2 = RailwayInventoryObservation & {
  proofProtocol: typeof SPEED_PROVIDER_PROOF_PROTOCOL_V2;
  proofId: string;
  expectedActivationPhase: SpeedActivationPhase;
  expectedActivationGeneration: bigint;
  providerObservedBeforeAt: Date;
  providerObservedAfterAt: Date;
};

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  return JSON.stringify(value);
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

export function createProofId(): string {
  return randomUUID();
}

export function abbreviateId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}
