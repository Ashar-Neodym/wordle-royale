# Ticket 187 — Fail-Closed Mixed-Version Lifecycle Activation Gate

Agent: Freya (backend implementation)
Wave: U-Fix
Status: Ready — Ticket 186 contract complete; implementation only, no hosted activation

## Goal

Implement Elisa's approved mixed-version activation contract so rolling old/new instances cannot create incompatible lifecycle rows concurrently.

## Acceptance criteria

- Shared active/supported lifecycle identity is checked before queue creation and in Speed operational readiness/catalog.
- New binaries default safely before v2 activation and retain v1 read/reconciliation compatibility.
- Old/stale/unsupported instances fail Speed closed; Standard remains live.
- Instance replacement, stale process, disagreement, missing activation state, and rollback are deterministic and sanitized.
- No hosted activation occurs in this ticket.
- Add multi-instance/mixed-capability tests and migration/rollback evidence.
- Run canonical API/contracts/build/security plus relevant PostgreSQL suites.

No provider or hosted data mutation.
