# Ticket 238 — ReadCommitted Match-Locked Ready Repair

Agent: Freya
Status: Ready
Dependencies: Ticket 236 RED; Ticket 237 architecture PASS

## Implementation

Change only the Speed `markReady` interactive transaction to `ReadCommitted`. Preserve explicit dedicated Match `FOR UPDATE` first, joined locked round/ordered participants, guarded monotonic writes, unique receipts, B1/B2, rollback, and post-commit projection. All other Speed mutations/reconciler and Standard behavior remain unchanged/Serializable.

## Strict GREEN

At frozen 300ms pressure:

- exactly two callback entries and two Match lock acquisitions;
- zero raw errors and zero transaction retries;
- HTTP `[201,201]`;
- two ready participants and two unique receipts;
- one immutable first-ack window and one immutable start/deadline;
- zero ratings before settlement;
- slowest request below 4819ms and lock-holder margin at least 1s from 5505ms real timeout control.

Preserve real `57014` control, real internal lock contention, one/three participant and round cardinality, B1/B2/replay/projection rollback, expiry/reconciler/mutation race matrix, mutation 10/10, timing 7/7, lifecycle races, full API 234/234, typecheck/security/diff.

Local only in `/tmp/wordle-ticket181-rerun-1d8ef`; no network/hosted/provider/GitHub/confirmed harness/config/env/commit/push/PR/deploy.
