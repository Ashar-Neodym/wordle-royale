# Ticket 237 — Ready Transaction Serialization Architecture Decision

Agent: Elisa
Status: Ready
Dependency: Ticket 236 honest RED

## Proven evidence

At 300ms local PostgreSQL pressure after Ticket 235 joined hydration:

- public statuses eventually `[201,201]`;
- callback entries `3` and match-lock acquisitions `3` for two requests;
- natural `40001` serialization failure (`P2010`) occurs and is retried;
- elapsed `[4570,7099] ms`, strict limit `4819ms` fails;
- lock-holder critical section `[2120,2415] ms`, commit-return `[34,28] ms`;
- real `57014` timeout control fires at 5505ms;
- real lock contention/cardinality/rollback subtests pass.

## Decision required

Determine the narrowest safe design that eliminates the expected waiting-request serialization retry while preserving concurrent ready correctness. Explicitly evaluate changing only the Speed ready transaction from Serializable to ReadCommitted under dedicated match-first `FOR UPDATE` plus locked round/participants and unique receipts. Analyze lost-update, phantom/cardinality, B1/B2, idempotency, projection, rollback, expiry/reconciler, mutation races, and Standard isolation. Compare advisory-lock/atomic-SQL alternatives.

Return one chosen architecture, exact invariants, files/functions, RED/GREEN acceptance criteria (exactly two callbacks, no raw errors/retries, `[201,201]`, two receipts, timing margin), and required race tests. Read-only local analysis; no network/hosted/provider/env/config/code changes.
