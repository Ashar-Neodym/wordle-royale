# Ticket 272 — Freya — Inventory v3 and honest single-node PostgreSQL observations

## Goal

Implement the new live provenance data model and verifier semantics without live provider collection.

## Scope

- Challenge v1, live evidence v2, inventory/receipt v3 strict schemas.
- PostgreSQL observations require exactly independent control-plane and direct-SQL methods.
- Observation IDs and methods unique; repeated/null physical node ID accepted.
- No replica invention/count inference.
- Exact cluster/database/schema/endpoint-scope agreement and direct/pooler classification.
- Fixed read-only SQL operation contract and sanitized facts.
- Fixture v2 compatibility remains isolated; mixed/downgrade rejected.
- G3/preflight accepts only verified v3 for production provider-derived evidence.

## Verification

Hostile unit/property tests, one-node positive, duplicate/mismatch negatives, legacy fixture suite, tooling/typecheck/secret/diff. No network or hosted DB.
