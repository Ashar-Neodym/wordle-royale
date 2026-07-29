# Ticket 261 — Freya — Phased activation preflight and rollback contract

## Goal

Make the documented dormant → closed → canary sequence executable and fail-closed without hosted access.

## Scope

- Add explicit dormant, closed, and canary preflight phases with phase-specific API/web identity/readiness expectations.
- Bind approval/preflight run identities explicitly.
- Replace same-snapshot zero-write proof with an independent post-probe read-only observation.
- Reconcile rollback order with session-operator prerequisites; add executable rollback-order tests.
- Preserve read-only transactions, exact migration/schema checks, `pg_control_system()` hard failure, bounded GETs, redirect/content-type/schema fencing, and sanitized receipts.

## Acceptance

- Permanent RED tests for dormant G3, wrong phase, run-ID mismatch, concurrent GET write visibility, and invalid rollback order.
- Focused tooling tests and real disposable PostgreSQL runner pass with nonzero counts and schema cleanup.
- No hosted/provider/database/account action outside disposable local schemas.
- Commit candidate in an isolated worktree and return exact SHA plus commands/results.
