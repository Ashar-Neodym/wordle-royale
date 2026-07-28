# Ticket 220 — Concurrent-Ready Hosted-Latency Architecture Gate Response

Agent: Elisa (architecture/source gate)
Result: **PASS — architecture approved; current implementation remains release-blocking**
Date: 2026-07-27

## Decision

The implementation-ready contract is published at:

- `docs/2026-07-27-concurrent-ready-hosted-latency-architecture.md`

Ticket 221 may proceed under that contract. This PASS approves the design and diagnostic/implementation sequence only. It does not accept the current `markReady()` source and does not authorize hosted gameplay, migration, deployment, lifecycle/provider mutation, merge, push, or PR activity.

## Root-class conclusion

Ticket 181 proves one concurrent transaction committed and one rolled back, but the exact database exception is **not present in the available evidence**. The only honest current classification is:

```text
concurrent_ready_unclassified_database_failure
```

The approximately eight-second timing is compatible with transaction acquisition, row-lock amplification, interactive transaction expiry, PostgreSQL timeout/cancellation, or an unrecognized Prisma wrapper. It does not prove `P2028` or any SQLSTATE. The generic exception filter deliberately reduced the original failure to HTTP 500.

Ticket 221 must therefore begin with the specified deterministic real-PostgreSQL RED latency/lock diagnostic, freeze the first reproducing latency `D*`, and record the actual structured class before changing production behavior. If it cannot reproduce the hosted one-success/one-rollback shape, it must not claim a more specific root cause.

Local PostgreSQL timing/race runners could not be exercised during this architecture gate because no database server was listening at `localhost:5432`. This is not papered over as evidence: both runners exited 1 with Prisma `Can't reach database server`. The focused mutation-policy unit suite and API typecheck did pass.

## Source finding

`SpeedGameplayService.markReady()` currently holds `Match`, `MatchRound`, and both participant locks across the durable acknowledgement **and** the full response projection. The lock is retained during repeated state reloads, clock reads, guess/mutation-history reads, opponent-progress reads, ready-operation lookup, and schema projection. These response-only operations create avoidable lock occupancy under hosted per-query latency.

Gameplay also imports narrow matchmaking error predicates. Current coverage omits required direct/meta/nested representations, especially `55P03` and `57014`, allowing supported database failures to become generic `500 internal_server_error`.

## Locked target design

1. Keep the existing operational dependency check outside the transaction.
2. Use one short serializable commit transaction with canonical lock order:
   - Match;
   - first MatchRound;
   - participants ordered by ID.
3. Have lock queries return the minimal typed state so rows are not locked and then redundantly reread.
4. Inside the transaction retain only:
   - authoritative replay recheck;
   - PostgreSQL time;
   - expiry/cancellation reconciliation;
   - participant ready write;
   - first-ack window initialization;
   - second-ack countdown/round initialization;
   - mutation identity insert.
5. Return a compact commit receipt and release locks.
6. Build the public snapshot afterward in one bounded read-only `RepeatableRead` transaction with no locks, writes, reconciliation, dictionary/provider checks, or readiness checks.
7. Keep all mutation budgets unchanged: `24s` lifecycle, `8s` `maxWait`, `12s` execution ceiling, three total attempts, `1s` reserve.
8. Add a Speed-mutation-specific bounded structured classifier; do not overload matchmaking or reconciler policy.

## Public error contract

- `P2034`, direct/meta/nested `40001`, `40P01`, and `55P03`:
  - bounded retry within the existing three-attempt/lifecycle ledger;
  - exhausted result `409 speed_gameplay_busy`.
- direct/meta/nested `P2028` or `57014`:
  - no automatic mutation retry;
  - `503 speed_mutation_transaction_timeout`.
- `P1001/P1002/P1008/P1017`:
  - no mutation retry;
  - `503 speed_mutation_unavailable`.
- whole lifecycle exhaustion:
  - `503 speed_mutation_lifecycle_timeout`.
- known commit followed by projection failure:
  - `503 speed_snapshot_unavailable` with bounded `{ commitKnown: true, retrySafe: true }` details;
  - client replays the same operation ID.
- unknown non-domain failure in the ready flow:
  - sanitized `503 speed_mutation_unavailable`.

No supported class may expose SQLSTATE, Prisma code, SQL, provider detail, raw message, or generic HTTP 500.

## Preserved invariants

- PostgreSQL time owns invitation, ready, countdown, and round deadlines.
- Serializable isolation and row locks remain mandatory.
- First valid acknowledgement immutably owns `readyWindowStartedAt` and `readyDeadlineAt`.
- Second valid acknowledgement initializes one immutable match/round start and round deadline.
- Same-ID replay is checked before reconciliation and remains confirmable after response loss or expiry.
- A different ID after ready cannot replace `readyAt`, restart any window, or create a second ready mutation.
- Cancellation/expiry ordering remains match-lock linearized and fail-closed.
- No duplicate reveal/start/terminalization/settlement path is introduced.
- Existing generation fences, `SKIP LOCKED`, adjudication, and rating uniqueness are unchanged.
- Standard remains isolated from Speed failure.

## Required Ticket 221 sequence

1. Add the disposable-schema RED diagnostic and structured phase/error capture.
2. Reproduce fast control, sequential latency control, and concurrent latency sweep.
3. Record `D*`, callback-entry/lock evidence, persisted state, and actual sanitized failure class.
4. Add the pure Speed mutation classifier and direct/meta/nested table tests.
5. Split ready commit from post-commit projection.
6. Remove redundant locked rereads while preserving canonical lock order.
7. Run GREEN against frozen `D*`.
8. Run timing, gameplay, lifecycle-race, reconciler, Standard-isolation, API, typecheck, and secret checks.
9. Hand to Ticket 223 for independent QA; do not self-authorize hosted validation.

## Verification performed

```text
node --import tsx --test test/speed-mutation-policy.test.ts
PASS — 5/5

pnpm run typecheck
PASS

pnpm run test:postgres:speed-timing
NOT RUNNABLE — exit 1, localhost:5432 unavailable

pnpm run test:postgres:speed-lifecycle-races
NOT RUNNABLE — exit 1, localhost:5432 unavailable
```

The two PostgreSQL failures are prerequisite-environment failures, not test failures and not evidence for a database root class.

## Risks/follow-ups

- A post-commit snapshot can fail after a successful acknowledgement; the explicit `commitKnown` recovery contract is mandatory.
- A newer cancellation/expiry may appear in the post-commit snapshot; this is valid monotonic state.
- Merely increasing transaction timeout, game deadlines, or lifecycle budget is noncompliant.
- Removing locks or lowering isolation is noncompliant.
- The RED diagnostic must measure real transaction/row-lock behavior; delaying request dispatch is insufficient.
- Sanitized phase metrics must distinguish connection acquisition, row-lock wait, critical-section work, commit return, and post-commit projection without IDs or raw errors.

## Handoff

**Ticket 221: Ready.** Implement exactly the architecture contract, beginning with diagnostic classification.
**Ticket 223: Remains blocked** on Tickets 221 and 222.
**Ticket 224: Remains blocked** on Ticket 223 PASS and explicit checkpoint authority.
