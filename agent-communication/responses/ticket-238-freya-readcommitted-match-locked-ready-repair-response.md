# Ticket 238 — ReadCommitted Match-Locked Ready Repair Response

Agent: Freya implementation recovered by Athena; independent QA by Jasmine
Status: PASS local candidate

## Architecture

Only Speed `markReady` uses `ReadCommitted`. It retains dedicated Match `FOR UPDATE` first, joined locked round/ordered participants, exact cardinality/viewer checks, guarded monotonic writes, unique receipts, B1/B2 ordering, atomic rollback, and post-commit projection. Other Speed mutation/reconciler and Standard paths remain Serializable and isolated.

## Strict pressure evidence

- PostgreSQL suite: 7/7.
- Frozen latency: 300ms.
- HTTP: `[201,201]`.
- Transaction callbacks / match locks: 2 / 2.
- Raw errors / retries: 0 / 0.
- Request duration: 2161ms / 4624ms; strict maximum 4819ms.
- Lock holder: 2108ms / 2410ms; strict maximum 4505ms.
- Persistence: 2 ready participants, 2 unique receipts, 0 ratings.
- Natural PostgreSQL 57014 timeout/rollback control: 5523ms PASS.
- Real round-before-participant and participant-ID contention: PASS.
- One-/three-participant and malformed-round fail-closed cases: PASS.

## Regression

- Mutation policy 11/11.
- Timing PostgreSQL 7/7.
- Lifecycle races 16/16 across independent iterations.
- Full API 235/235.
- API typecheck, workspace validation, secret scan (301 files), and diff check PASS.

## Verdict

Ticket 238 is an independently accepted local repair candidate. Ticket 181 remains historical strict FAIL until an approved exact deployment and a fresh hosted smoke pass. No hosted access, provider/config change, commit, push, PR, or deployment occurred during implementation/QA.
