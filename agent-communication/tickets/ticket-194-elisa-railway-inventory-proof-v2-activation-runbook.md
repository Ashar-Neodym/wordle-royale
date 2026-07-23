# Ticket 194 — Railway Inventory-Proof and V2 Activation Runbook

Agent: Elisa (architecture/operations contract)
Wave: V — Trusted Hosted V2 Activation
Status: Complete — trusted operator runbook delivered; no hosted action authorized or performed

## Goal

Define the smallest auditable way to satisfy `SpeedProviderInventoryVerifier` for Railway without placing a long-lived provider credential in the API or weakening Ticket 186's fleet proof.

## Required decisions

- Map immutable Railway deployment/image/commit identity to capability `releaseId` exactly.
- Prove target deployment SUCCESS/active, previous deployments stopped/removed, serving replica count, and no stale/extra instances.
- Define proof freshness, anti-replay identity, expected replica count, failure modes, audit record, and sanitized output.
- Prefer an operator-bound tool using ephemeral existing Railway authentication plus hosted DB credentials; compare against fresh capability leases and activation generation atomically.
- Specify how the tool invokes the existing transition service/logic without exposing an unauthenticated production endpoint or bypassing database guards.
- Preserve two separately approved transactions: `v1_open -> closing_to_v2`, then drained `closing_to_v2 -> v2_open`.
- Define queue drain, lease acknowledgement, rollback/disabled procedures, cleanup, and exact verification commands.
- Identify whether any code, provider variable/secret, API token, database mutation, or external service is required. No paid dependency.

## Deliverables

- Versioned architecture/runbook document.
- Explicit handoff to Freya/Yuna/Jasmine.
- No implementation, provider mutation, hosted database mutation, activation, deployment, or merge.
