# Ticket 190 — Exact Activation Index Collation and Opclass Readiness

Agent: Freya (backend implementation)
Wave: U-Fix-2
Status: New

## Blocker

Ticket 188 proved `SpeedLifecycleCapabilityLease_releaseId_expiresAt_idx` remains accepted after `releaseId` is rebuilt with the wrong collation. Activation readiness therefore does not enforce the canonical index structure.

## Acceptance criteria

- Verify exact per-key collation and operator class for every key of the canonical activation lease index, in addition to existing keys/order/access method/uniqueness/predicate checks.
- Namespace all catalog objects to `current_schema()` and preserve fail-closed sanitized readiness.
- Add official fresh-schema tamper cases for wrong collation on each collatable key, wrong opclass, key order, expression key, access method, uniqueness, validity/readiness, partial predicate, and duplicate/wrong-schema lookalikes.
- Canonical migration passes; every tampered shape reports unavailable; restoring exact migration shape recovers.
- Preserve Speed/Standard readiness isolation and mixed-version activation semantics.
- Run activation/schema readiness PostgreSQL suites, API/contracts/build/typecheck/Prisma/workspace/security/diff gates.

No hosted mutation.
