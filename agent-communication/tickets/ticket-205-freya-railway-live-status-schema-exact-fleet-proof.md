# Ticket 205 — Railway Live Status Schema Compatibility for Exact Fleet Proof

Agent: Freya (backend/operator implementation)
Wave: V-Provider-Compatibility
Status: Ready

## Reproduced hosted blocker

Athena reproduced Ticket 202 with authorized read-only access. Railway CLI 5.27.1 currently returns:

- one active successful target deployment;
- `serviceInstance.numReplicas = null`;
- target deployment instances containing one `RUNNING` instance and one stale `REMOVED` instance;
- environment config `multiRegionConfig = { sfo: { numReplicas: 1 } }`;
- hosted authority `v1_open`, generation `1`, audit count `0`, and exactly one fresh matching lease identity.

The adapter returns `railway_inventory_schema_unsupported`; no mutation occurred.

## Required red-to-green contract

Add a permanent sanitized live-shape fixture before changing behavior. Then:

1. Treat only exact provider-documented serving statuses as serving; accept `RUNNING`, exclude terminal `REMOVED`, and fail unknown/transitional/failed states.
2. When status `numReplicas` is null, derive configured replica cardinality only from complete positive `multiRegionConfig`; require its sum to equal RUNNING instance count and operator expected count.
3. When status `numReplicas` is present, require it also equals regional sum, RUNNING count, and expected count.
4. Require one settled successful target deployment, distinct canonical RUNNING replica IDs, no other serving deployment, exact region allocation, exact health host, artifact, release, and scope.
5. Preserve fail-closed behavior for missing regions, zero/negative counts, duplicate IDs, all-removed fleet, extra RUNNING replica, unknown statuses, rollout overlap, contradictions, truncation, auth failures, and stale/extra deployments.
6. Ensure the operator returns a stable sanitized schema/inventory failure code rather than collapsing a recognized Railway inventory error.

Run focused adapter/operator tests, full API/contracts/build/typechecks/security, and disposable PostgreSQL operator matrix. No Railway query, hosted DB access, deployment, provider change, or lifecycle mutation.
