# Ticket 237 — Ready Transaction Serialization Architecture Decision

Agent: Elisa
Status: **APPROVE a ready-only `ReadCommitted` write transaction, conditionally gated by the race matrix below**

## Decision

Change **only the Speed `markReady` commit transaction** from PostgreSQL `Serializable` to `ReadCommitted`. Keep the dedicated `Match ... FOR UPDATE` as the first statement and keep the joined `MatchRound`/ordered `MatchParticipant` `FOR UPDATE` hydration, guarded writes, and participant-scoped mutation receipt exactly as they are.

Do **not** change the isolation used by guesses, forfeits, snapshots, the expiry reconciler, matchmaking, or Standard gameplay. Do not remove the retry/error coordinator: it remains defense for deadlock, lock-timeout, provider error, and explicitly injected/error-mapping tests, but the normal simultaneous-ready GREEN path must execute it zero times.

This is the narrowest safe correction for the proven failure. The natural `P2010`/meta `40001` is PostgreSQL Serializable Snapshot Isolation rejecting the waiting ready transaction after both transactions entered with overlapping serializable snapshots. It is not evidence that the explicit row-lock protocol failed. At `ReadCommitted`, each statement receives a fresh snapshot: after the waiter acquires `Match FOR UPDATE`, its subsequent joined lock/read observes the holder's committed acknowledgement. The waiter can therefore become the second acknowledgement directly, rather than discarding a complete lock wait and replaying the callback.

Approval is conditional on preserving the lock/topology contract and passing the real PostgreSQL tests below. If any production writer can mutate Speed match lifecycle state without first acquiring the same `Match FOR UPDATE`, this decision must not ship until that writer is brought into the protocol.

## Why `ReadCommitted` is sufficient here

The transaction does not rely on isolation-level predicate serialization for ready correctness. It establishes an explicit per-match linearization point before reading or writing domain state:

1. lock and hydrate exactly one `Match` by primary key with `FOR UPDATE`;
2. lock/hydrate exactly one joined round and exactly two participants, participants ordered by ID;
3. check viewer membership and receipt replay;
4. obtain authoritative database time and reconcile expiry while the same rows remain locked;
5. perform guarded, monotonic participant/window/start writes;
6. insert the mutation receipt;
7. commit atomically;
8. perform projection in the existing separate `RepeatableRead` transaction.

All concurrent ready operations for one match are therefore equivalent to a serial order chosen by the `Match` row lock. `ReadCommitted` changes snapshot refresh behavior; it does not weaken the row locks or transaction atomicity.

### Invariant analysis

- **Lost updates:** impossible among conforming Speed writers. No writer may read actionable match/round/participant state before holding the match lock. The waiting ready callback reads the committed holder state after acquiring that lock. Participant `readyAt` is written once; the first-ack window and match/round start use null/status guards as a second line of defense.
- **First/second acknowledgement identity:** exactly one transaction observes no `readyWindowStartedAt` and initializes it. Exactly one transaction can transition `startedAt: null/status: pending` and the round's null start/deadline. The second participant sees the first participant's committed `readyAt` and starts the match once.
- **Phantoms/cardinality:** normal match topology is immutable after publication. Existing round and participant rows are locked, and malformed zero/two-round or one/three-participant state fails before writes. Parent `Match FOR UPDATE` also conflicts with the parent key-share lock required by normal FK-checked child insertion, so a conforming insertion commits before ready reads topology or waits until ready commits. This is not permission for an out-of-protocol direct child insert/delete: creation/repair/deletion must occur before publication or take `Match` first. Add the topology race tests below because `ReadCommitted` itself provides no predicate lock.
- **B1 (different operation ID after already ready):** receipt lookup occurs under the match/participant locks, reconciliation runs, then `viewer.readyAt` has precedence over late/terminal reinterpretation. The second operation returns `already_ready`, does not replace `readyAt`, and does not insert another receipt.
- **B2 / same-ID recovery:** the unique `(participantId, kind, clientRequestId)` constraint remains the durable replay backstop. Replay lookup is under the same locks. A post-commit projection failure can be retried with the same ID and resolves from the receipt without restaging the acknowledgement.
- **Two different IDs from one participant concurrently:** match-lock serialization means the winner records one receipt and `readyAt`; the loser takes B1 and records no receipt. The schema's unique key alone does not enforce one ready receipt per participant, so retaining B1 under the lock is essential.
- **Two participants concurrently:** the transactions serialize at `Match`; each writes only its own participant, but the second reads both locked participant rows after the first commits. Result is two `readyAt` values, two distinct receipts, one immutable window, one match start, and one aligned round start/deadline.
- **Rollback:** row locks do not alter transaction atomicity. Any error before commit rolls back participant readiness, match/window/start, round/deadline, reconciliation/rating side effects, and receipt together. A timeout/cancellation remains sanitized and must never leave a partial acknowledgement.
- **Projection:** projection remains post-commit and `RepeatableRead`. Its failure cannot roll back the acknowledgement; the existing receipt-outcome mapping must continue to report truthful `acknowledgementKnown` and `retrySafe` values.
- **Expiry/reconciler:** both ready and reconciliation use `Match` first. If ready acquires it first, it evaluates authoritative time and either commits the valid acknowledgement/start or performs/observes expiry atomically; the reconciler then sees the committed state. If the reconciler acquires it first, it terminalizes and commits, and ready subsequently sees terminal/expired state and cannot create a receipt. No ready-versus-expiry lost update is possible. The reconciler may retain `Serializable`; if its older snapshot is invalidated it may report/retry its own pass, but a `ReadCommitted` ready transaction does not receive the expected SSI `40001`.
- **Guess/forfeit/cancel/operator mutation races:** these remain Serializable and must retain match-first round-participant ordering. Whichever owns `Match` first commits a complete lifecycle transition; ready then reads that transition, or its peer reads readiness/start. No path may lock participant/round and then request Match.
- **Ratings:** ready can invoke reconciliation, but no rating event is created merely by two valid acknowledgements/start. Expiry remains no-contest where required, with rollback atomicity preserved.
- **Standard isolation:** untouched. The new option helper must be private to Speed ready; changing the shared Speed mutation helper or any Standard persistence policy is prohibited.

## Chosen implementation scope

Expected product files/functions:

1. `apps/api/src/gameplay/speed-mutation-policy.ts`
   - add a narrowly named `speedReadyMutationAttemptOptions(remainingMs)` returning the same bounded `maxWait` and `timeout` calculation but `isolationLevel: 'ReadCommitted'`;
   - leave `speedMutationAttemptOptions()` as `Serializable` for all non-ready Speed mutations;
   - leave projection options as `RepeatableRead`.
2. `apps/api/src/gameplay/speed-gameplay.service.ts`
   - in `inReadyTransaction()`, pass `speedReadyMutationAttemptOptions(remaining)`;
   - no domain-order, lock SQL, receipt, retry classifier, timeout, projection, or public API changes.
3. Focused tests only as required below, principally:
   - `apps/api/test/speed-mutation-policy.test.ts`;
   - `apps/api/test/speed-ready-hosted-latency-postgres.integration.test.ts`;
   - `apps/api/test/speed-lifecycle-races-postgres.integration.test.ts` (only for missing ready/reconciler interleavings).

Do not parameterize the existing generic helper with an arbitrary caller-selected isolation level; a dedicated ready helper makes the exception auditable and prevents accidental spread.

## Alternatives considered

### Keep Serializable and accept/reduce retry — rejected

Ticket 236 proved that two requests cause three callback entries and three match-lock acquisitions. The waiting request pays the complete lock wait, receives natural meta `40001`, then pays another transaction. This produces 4570/7099ms and fails the strict 4819ms gate despite holder critical sections of only 2120/2415ms and commit returns of 34/28ms. Retry is the bottleneck, not commit protocol.

### Transaction-scoped advisory lock — rejected

It duplicates the already-correct per-match row lock and requires every writer to adopt another lock namespace/order. An advisory lock acquired inside a Serializable transaction does not safely promise a post-wait fresh snapshot, so it does not remove the SSI cause without also lowering isolation. Acquiring it outside the transaction requires pinned-session/protocol complexity and creates a failure window. It adds deadlock and operational risk with no invariant gain.

### Atomic SQL/CTE ready mutation — rejected for this repair

A single CTE could reduce round trips, but it would duplicate lifecycle, authoritative-time reconciliation, B1/B2, receipt, and cardinality logic in SQL. It is materially broader and harder to verify. It also does not by itself guarantee that a waiting Serializable transaction avoids `40001`. Retain as a future performance option only if ready-only `ReadCommitted` still lacks measured timeout margin.

### Remove explicit locks or rely only on unique receipts — rejected

The receipt uniqueness key protects one operation ID, not one acknowledgement per participant and not first-window/start identity. Removing Match/round/participant locks would permit stale participant counts, multiple ready receipts for different IDs, and expiry/start lost updates.

## Required RED/GREEN acceptance

### Frozen RED

Before the isolation change, preserve a real PostgreSQL 300ms concurrent-ready proof showing:

- statuses eventually `[201,201]` only because retry is enabled;
- exactly 3 callback entries and 3 match-lock acquisitions for two requests;
- one natural Prisma `P2010` with nested/meta SQLSTATE `40001`;
- elapsed approximately 4570/7099ms and strict 4819ms failure;
- holder critical sections approximately 2120/2415ms and commit return approximately 34/28ms;
- real `57014` control near 5505ms.

Do not manufacture GREEN by suppressing metrics, relaxing the strict limit, increasing timeout, or disabling the natural-error assertion before switching isolation.

### GREEN at the same pressure

After changing only ready isolation:

- public HTTP statuses are exactly `[201,201]`;
- exactly **2** ready transaction callback entries, **2** transaction requests/returns, and **2** match-lock acquisitions occur;
- retry count is **0** and the pressure pair records no `40001`, raw Prisma/provider error, timeout, lock error, or unknown error;
- persistence is exactly two ready participants and two distinct participant-scoped `speed_ready` receipts;
- one immutable first-ack window, one match start, and one aligned round start/deadline persist; ratings remain zero;
- the slower request is below the frozen **4819ms** strict ceiling;
- each lock-holder critical section remains at least **1000ms below** the calibrated natural `57014` boundary (with the current 5505ms control, no holder may exceed 4505ms), and commit-return is separately reported;
- the natural `57014` rollback control still fires and remains sanitized; it is a control, not part of the successful pair.

Run 0/300/400/500ms latency characterization as non-regression evidence, but the same 300ms point and frozen 4819ms limit are the architecture acceptance gate. Report p50/p95 where repetitions permit; do not use a single lucky sample to claim margin.

## Mandatory real-PostgreSQL race matrix

1. **Different participants, simultaneous ready:** barrier both callbacks before Match acquisition; assert two callbacks/no retry, `[201,201]`, exact persistence and immutable timestamp identity.
2. **Same participant, same ID, simultaneous:** one durable receipt/`readyAt`; both calls resolve as committed/replay semantics; no unique error leaks.
3. **Same participant, different IDs, simultaneous:** one winning receipt; loser is B1 `already_ready`; original `readyAt`, window, and receipt remain unchanged.
4. **Projection failure for all receipt outcomes:** committed, replay, already-ready, late, and terminal preserve current `acknowledgementKnown`/`retrySafe`; same-ID recovery adds no receipt.
5. **Invitation expiry race, both lock orders:** ready-before-expiry remains acknowledged; expiry-first becomes no-contest and ready creates no receipt.
6. **Ready-deadline/second-ack race, both lock orders:** valid second ack first starts exactly once and cannot later be voided; reconciler first after deadline voids atomically and second ack cannot start or receipt.
7. **Reconciler selection race:** cover the reconciler's `FOR UPDATE OF match SKIP LOCKED` selection plus `reconcileMatch` lock sequence, not only direct adjudication. Accept a sanitized reconciler serialization outcome where applicable, never partial state or a ready retry.
8. **Forfeit/cancel/operator-void versus first and second ack, both lock orders:** terminal/start outcome follows Match-lock order; no active-and-voided hybrid, duplicate settlement, or receipt after terminal rejection.
9. **Guess versus second ack/start:** guess cannot observe a partially started match/round; it is either rejected before start or evaluates a fully aligned start/deadline after commit.
10. **Topology/cardinality:** zero/two rounds and one/three participants fail closed before writes. Concurrent conforming child insert/delete/repair must be shown to serialize through Match or be rejected as an unsupported post-publication operation; audit production writers for Match-first order.
11. **Rollback matrix:** natural and forced direct/meta/nested `40001`, `P2034`, `40P01`, `55P03`, `P2028`, `57014`, connection, and unknown failures retain bounded/sanitized mapping and all-or-nothing persistence. Forced `40001` remains testable even though simultaneous ready no longer naturally produces it.
12. **Isolation assertions:** capture transaction options and prove only ready commit is `ReadCommitted`; guess/forfeit/general Speed remain `Serializable`, projection remains `RepeatableRead`, reconciler remains `Serializable`, and Standard tests observe no option/code change.

## Architecture verdict

**Proceed with ready-only `ReadCommitted`.** The explicit Match-first row-lock protocol, locked topology, guarded monotonic writes, and atomic receipt provide the serial order that ready needs. Keeping SSI on this path adds an expected abort after lock waiting but adds no domain protection under the stated protocol. The change is safe only as a deliberately narrow exception with a documented Match-first writer contract and the expiry/topology/mutation race gates above.

## Scope/evidence note

This was read-only analysis of `/tmp/wordle-ticket181-rerun-1d8ef` and shared Tickets 234–237. No worktree, environment, hosted/provider, network, GitHub, harness, lifecycle/config, or gameplay changes were made. This response is the only created file.
