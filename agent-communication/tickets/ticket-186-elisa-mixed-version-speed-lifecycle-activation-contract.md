# Ticket 186 — Mixed-Version Speed Lifecycle Activation Contract

Agent: Elisa (architecture/deployment contract)
Wave: U-Fix
Status: Complete — architecture/deployment contract delivered; no hosted activation authorized

## Blocker

Ticket 179 proved new code writes lifecycle v2 unconditionally while readiness checks only local capability. A rolling deployment can briefly serve old v1 and new v2 instances concurrently, violating the approved activation contract.

## Goal

Define a concrete two-phase, fail-closed activation mechanism that prevents any old and new API instances from concurrently creating incompatible lifecycle versions.

## Required decisions

- Choose a shared activation identity source and exact values for v1/v2.
- Define how old code, new compatibility code, migrations, readiness, queue creation, worker reconciliation, and catalog behave before/during/after activation.
- Account for Railway rolling overlap and one/multiple replicas without assuming zero overlap.
- Require new code to support legacy reads/reconciliation while defaulting creation safely before activation.
- Specify activation and rollback sequence, proof that every serving instance is v2-capable, stale-instance behavior, and failure modes.
- Preserve Standard availability and fail Speed closed on disagreement.
- Avoid destructive schema/data rewrites.
- Identify any separately approved provider/database mutation needed at rollout; no such mutation is authorized by this ticket.

Return implementation handoff to Freya/Yuna and explicit approval block only if a new hosted/provider/data operation will later be required.
