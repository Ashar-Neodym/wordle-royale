# Ticket 221 — Hosted-Safe Simultaneous-Ready Backend Repair — Evidence

**Owner:** Freya
**Status:** Complete — independent PASS
**Hosted actions:** None

## Mandatory pre-repair RED evidence

The disposable PostgreSQL latency harness was created and executed before the production ready-path refactor.

- Real database operations were wrapped with fixed per-operation latency.
- Fast concurrent control passed.
- First failing latency frozen as `D*=300ms`.
- Sequential requests at `D*` both passed.
- Concurrent requests at `D*` entered both transaction callbacks and produced one committed acknowledgement plus one rollback.
- A PostgreSQL `FOR UPDATE` lock waiter was observed.
- Structured raw failure evidence:
  - `PrismaClientKnownRequestError`, `code=P2010`, `meta.code=40001`;
  - retry surfaced `Error`, `code=InvalidArg`.
- Response elapsed times: approximately `7368ms` and `7454ms`.
- Persisted state after RED: one ready participant, one `speed_ready` mutation identity, zero apply-rating events.
- The disposable schema was dropped.

This evidence explains the hosted 500 shape without equating the hosted provider error to a guessed local error class: the prior predicates did not classify the observed structured wrappers consistently, allowing the retry failure to escape the ready-specific public mapping.

## Current GREEN evidence

At frozen `D*=300ms`, the repaired path has produced:

- direct concurrent completion around `4858ms` and `7682ms`;
- real `GameplayController` HTTP statuses `[201, 201]`;
- two ready participants;
- two distinct `speed_ready` mutation identities;
- one immutable ready window/countdown/deadline set;
- zero apply-rating events;
- post-commit projection failure preserved the committed acknowledgement and returned sanitized `speed_snapshot_unavailable` with `commitKnown=true`, `retrySafe=true`;
- same-ID replay and different-ID already-ready behavior remained idempotent.

## Final verification

- Independent architecture/security review: **PASS**.
- Default permanent hosted-latency gate: **PASS** with no environment overrides; explicit target holder, two blocked `Match FOR UPDATE` backends with non-empty `pg_blocking_pids`, HTTP `[201,201]`, exact persistence, and schema cleanup.
- API canonical suite: **234/234**.
- Contracts: **24/24**.
- PostgreSQL timing: **7/7**.
- Hostile lifecycle races: **80/80 across ten iterations** (independent verification).
- Focused ready/error flow: **15/15**.
- Prisma validate/generate and API typecheck: **PASS**.
- Workspace validation: **9 packages**.
- Secret scan: **297 files**.
- Diff hygiene: **PASS**.

The write phase now owns only canonical lock/hydration, operation-first replay, authoritative clock/reconciliation, minimal mutations, and a compact commit receipt. Snapshot projection is a single bounded post-commit `RepeatableRead` attempt. Ready-specific dependency, transaction, and projection failures are sanitized into stable 409/503 contracts; no raw database/provider/credential detail is returned. Fixed-cardinality phase, duration-histogram, outcome, retry, and error-class observations contain no user, match, request, or raw-error identifiers.

No hosted access, deployment, lifecycle mutation, commit, push, merge, or PR occurred. Ticket 223 remains blocked until sibling Ticket 222 is complete.
