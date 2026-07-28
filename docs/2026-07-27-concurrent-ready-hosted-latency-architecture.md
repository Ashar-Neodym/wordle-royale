# Concurrent-Ready Hosted-Latency Architecture

**Ticket:** 220
**Owner:** Elisa
**Status:** Architecture gate PASS; deployed/current implementation remains release-blocking
**Applies to:** Speed `markReady()` and its response projection only
**Lifecycle:** `speed_ready_v2_first_ack_90s`
**Runtime budgets:** unchanged (`24s` lifecycle, `8s` Prisma `maxWait`, `12s` transaction execution, three total attempts, `1s` response reserve)

## 1. Decision summary

The hosted failure is real and fail-closed, but its database exception class is **not recoverable from Ticket 181's sanitized HTTP evidence**. Ticket 181 establishes only this externally observable class:

```text
concurrent_ready_unclassified_database_failure
```

At deployed `e91d515c`, two acknowledgements dispatched `0.680ms` apart returned `500/201` at approximately eight seconds and persisted only one ready participant. The timing is consistent with lock or transaction budget pressure, but it does not prove `P2028`, `55P03`, `57014`, `40001`, or any other concrete code. The generic exception filter intentionally erased that distinction.

Therefore:

1. Ticket 221 must begin with a deterministic real-PostgreSQL RED diagnostic and record the structured, sanitized failure class **before** changing production behavior.
2. The repair must shorten the serializable write transaction rather than widen deadlines.
3. Full response projection moves after commit into a bounded read-only transaction.
4. The mutation remains database-clock-owned, serializable, idempotent, and canonically locked.
5. All supported transient database representations map to stable retryable `409` or `503` responses; none may escape as generic `500`.
6. Current timing constants remain fixed. Any budget change requires separate evidence and architecture approval.

This document passes the architecture gate and unlocks Ticket 221. It does not pass the current implementation, authorize deployment, or authorize hosted gameplay.

## 2. Evidence and current source diagnosis

### 2.1 Hosted evidence

Ticket 181 proved:

- both clients reached the same ready phase;
- dispatch skew was `0.680ms`;
- one request returned `201` in `7.711s`;
- one returned sanitized `500 internal_server_error` in `7.968s`;
- authoritative reads showed `readyCount=1` and only one ready mutation identity;
- the match later voided/no-contest;
- no rating event was written.

This proves one transaction committed and one did not. It does not reveal whether the failed transaction was waiting for a Prisma connection, waiting on the `Match` row, cancelled by PostgreSQL, expired inside Prisma, or rejected by serialization.

### 2.2 Current critical section

`SpeedGameplayService.markReady()` currently keeps `Match`, `MatchRound`, and both `MatchParticipant` rows locked while it performs all of the following:

1. three ordered `FOR UPDATE` statements;
2. three state-loading reads;
3. idempotency lookup;
4. authoritative database clock read;
5. expiry reconciliation;
6. another three-query state reload;
7. participant update;
8. optional ready-window update;
9. participant reread;
10. optional match and round start updates;
11. mutation-record insert;
12. a final three-query state reload;
13. another database clock read;
14. full response projection, including guesses, mutation history, opponent progress, ready-operation lookup, and schema parsing.

The durable acknowledgement is complete before steps 12–14, but the locks remain held until the entire snapshot is built and the interactive transaction commits. Under hosted round-trip latency, those response-only reads amplify lock occupancy for the losing concurrent acknowledgement.

### 2.3 Current error-class gap

Gameplay imports transaction predicates from `matchmaking-lifecycle.ts`. Those predicates recognize only:

- direct `P2028` as transaction expiry;
- direct `P2034` as retryable;
- `P2010` with `meta.code` equal to `40001` or `40P01` as retryable.

They do not cover all required direct, Prisma-meta, or bounded nested forms, including `55P03` and `57014`. Any missed database shape reaches `ApiExceptionFilter` and becomes generic HTTP `500`.

The reconciler has a broader allowlist, but gameplay must not import reconciler-specific policy. Ticket 221 should introduce a small Speed-mutation classifier with its own public mapping.

## 3. Required target flow

```text
POST ready
   |
   +-- operational dependency check (outside transaction)
   |
   +-- optional non-locking replay preflight
   |
   +-- SERIALIZABLE READY COMMIT TRANSACTION
   |      lock/hydrate Match
   |      lock/hydrate first Round
   |      lock/hydrate Participants ordered by id
   |      authoritative replay recheck
   |      database clock
   |      reconcile expiry/cancellation
   |      write ready acknowledgement
   |      initialize first-ack window if absent
   |      initialize countdown/round deadline if both ready
   |      insert mutation identity
   |      return compact commit receipt
   |
   +-- commit releases locks
   |
   +-- bounded REPEATABLE READ projection transaction (no locks, no writes)
          database clock + coherent current snapshot
          return normal 201 snapshot
```

The response projection is not part of the write-integrity boundary.

## 4. Component and file boundaries

### 4.1 `speed-gameplay.service.ts`

Refactor only the ready path and reusable projection helpers:

- `markReady()` orchestrates dependency check, commit, and projection.
- `commitReady()` or equivalent owns the serializable transaction callback.
- `lockReadyState()` returns a minimal typed locked state.
- `readCommittedSnapshot()` builds a coherent post-commit snapshot without `FOR UPDATE` and without reconciliation.
- Existing guess, forfeit, snapshot, and reconciliation behavior must not be broadened accidentally.

### 4.2 `speed-mutation-errors.ts` (new)

A pure, dependency-free helper owns:

- bounded traversal of structured error wrappers;
- classification into a fixed internal enum;
- retryability;
- public exception mapping;
- no raw error message retention or output.

Do not place ready-specific HTTP behavior in `matchmaking-lifecycle.ts` or `speed-expiry-reconciliation.service.ts`.

### 4.3 `speed-mutation-policy.ts`

Keep existing constants. Add only pure policy functions needed to:

- calculate attempt options from remaining lifecycle time;
- determine whether another retry fits;
- expose deterministic retry dependencies in tests.

No constant may be increased in Ticket 221.

### 4.4 Tests

- Extend `speed-mutation-policy.test.ts` for classification and mappings.
- Extend `speed-timing-postgres.integration.test.ts` for immutable first/second acknowledgement identity and post-commit replay.
- Extend `speed-lifecycle-races-postgres.integration.test.ts` for canonical lock ordering, cancellation, expiry, and projection-after-unlock proof.
- Add `speed-ready-hosted-latency-postgres.integration.test.ts` plus a disposable-schema runner for the deterministic RED/GREEN latency matrix.

## 5. Ready commit contract

### 5.1 Input

```ts
type MarkReadyInput = {
  matchId: string;
  userId: string;
  clientRequestId: string;
};
```

The existing request hash remains `requestHash('speed_ready', {})`.

### 5.2 Internal receipt

The serializable callback returns only a compact, non-sensitive receipt:

```ts
type ReadyCommitReceipt =
  | { outcome: 'committed'; commitKnown: true }
  | { outcome: 'replay'; commitKnown: true }
  | { outcome: 'already_ready'; commitKnown: true }
  | { outcome: 'terminal'; commitKnown: true }
  | {
      outcome: 'late';
      commitKnown: true;
      code: 'invitation_expired' | 'ready_deadline_passed';
    };
```

No full `SpeedMatchSnapshot`, answer material, provider detail, or raw exception belongs in this receipt.

### 5.3 Lock/hydration contract

Retain the canonical order:

```text
Match -> first MatchRound -> MatchParticipant rows ordered by id
```

Each lock query should return the exact projected columns needed by ready processing. Do not lock and then issue a second Prisma read for the same row set merely to hydrate it. Parameterized raw SQL is acceptable for these three narrowly typed lock queries; `SELECT *` is not.

Required locked fields include:

- Match lifecycle, status, adjudication, invitation/ready/start timestamps, completion reason;
- first Round identity and start/deadline timestamps;
- both participant identities, user identities, ready/terminal timestamps, and last server event timestamp.

The state mapper must fail closed on zero/multiple rounds, participant count other than two, unknown lifecycle, or viewer mismatch.

### 5.4 Replay order

A non-locking replay preflight may reduce response-loss contention, but it is only an optimization. The authoritative sequence under lock is:

1. lock and identify viewer;
2. recheck `(participantId, kind, clientRequestId)`;
3. reject hash mismatch with `409 idempotency_key_conflict`;
4. treat an exact match as committed replay;
5. only then acquire database time and reconcile expiry.

This preserves the existing rule that response-loss replay remains confirmable after later expiry.

### 5.5 New acknowledgement

For a participant with no prior `readyAt`:

1. acquire authoritative PostgreSQL `clock_timestamp()`;
2. reconcile pending invitation/ready expiry under the same lock;
3. reload only if reconciliation actually mutated state, or make reconciliation return the updated terminal outcome;
4. reject/return terminal state as existing domain semantics require;
5. set `viewer.readyAt = now` and monotonic `lastServerEventAt`;
6. if lifecycle v2 and no ready window exists, set:
   - `readyWindowStartedAt = now`;
   - `readyDeadlineAt = now + 20_000ms`;
7. derive whether both participants are ready from the locked participant state plus the just-written acknowledgement; do not reread participants;
8. if both are ready and the match is pending/unstarted, set:
   - `Match.startedAt = now + 3_000ms`;
   - `Match.status = active`;
   - `MatchRound.startedAt = Match.startedAt`;
   - `MatchRound.deadlineAt = Match.startedAt + 75_000ms`;
9. insert the participant-scoped ready mutation identity;
10. return the receipt and commit.

The guarded match start update must win before the round start update is issued. If the match update affects zero rows, reload the locked state and accept only an already-established compatible identity; otherwise fail closed.

### 5.6 Already-ready with a different operation ID

A different logical request after that participant is already ready:

- does not alter `readyAt`;
- does not restart or extend invitation, ready, countdown, or round deadlines;
- does not insert a second ready mutation identity;
- returns the current snapshot with the original ready operation ID.

This preserves the current contract rather than treating a different request ID as a second mutation.

## 6. Immutable ownership rules

### 6.1 First valid acknowledgement owns

- its participant `readyAt`;
- `Match.readyWindowStartedAt`;
- `Match.readyDeadlineAt`;
- its `MatchMutationRequest.clientRequestId`.

These fields are immutable after the first commit, including under replay, a second participant acknowledgement, cancellation, expiry, or worker reconciliation.

### 6.2 Second valid acknowledgement owns

- its participant `readyAt` and mutation identity;
- the one countdown identity:
  - `Match.startedAt`;
  - `MatchRound.startedAt`;
  - `MatchRound.deadlineAt`.

The match and round timestamps are initialized together in one transaction and never rewritten.

### 6.3 Database constraints remain final

Application guards do not replace existing PostgreSQL lifecycle and uniqueness guards. Serializable isolation, row locks, unique mutation identity, generation fencing, `adjudicatedAt`, and rating event uniqueness remain the final write-integrity boundary.

## 7. Post-commit projection contract

### 7.1 Isolation and behavior

`readCommittedSnapshot(matchId, userId)` uses a separate bounded `RepeatableRead` read transaction:

- no `FOR UPDATE`;
- no advisory locks;
- no gameplay writes;
- no reconciliation;
- no dictionary/provider/readiness checks;
- one coherent database snapshot;
- fresh database time;
- the same spoiler-safe public schema.

A cancellation or expiry that commits before this read may appear in the returned snapshot. That is valid monotonic state. The ready mutation remains committed and replayable.

Do not call the current mutation-capable `getSnapshot()` as a shortcut if it locks or reconciles.

### 7.2 Budget

The projection must remain inside the existing `24_000ms` end-to-end mutation lifecycle and preserve the `1_000ms` response reserve.

- one projection attempt;
- `maxWait` and execution timeout clamped to remaining lifecycle time;
- execution ceiling `8_000ms`;
- no server-side mutation replay after commit;
- client recovery uses the same `clientRequestId`.

A separate architecture approval is required to change these values.

### 7.3 Projection failure after known commit

If commit succeeded but projection failed:

```http
503 Service Unavailable
{
  "error": {
    "code": "speed_snapshot_unavailable",
    "message": "The ready acknowledgement was recorded, but the latest Speed state is temporarily unavailable.",
    "details": { "commitKnown": true, "retrySafe": true }
  }
}
```

The public envelope must follow existing shared envelope formatting. It must not expose IDs, SQLSTATE, Prisma codes, query text, hostnames, provider data, or raw messages.

The client retries the same POST with the same operation ID or performs the approved state recovery flow. The server does not execute a second internal ready mutation after known commit.

## 8. Error classifier and public mapping

### 8.1 Structured allowlist

Inspect only these structured locations, to maximum depth three with cycle detection:

- `code`;
- `meta.code`;
- wrappers `cause`, `original`, and `error`.

Never classify by message substring.

### 8.2 Stable matrix

| Structured class | Internal class | In-request retry | Exhausted HTTP/public code |
|---|---|---:|---|
| `P2034`, direct/nested `40001` | `serialization` | yes, within three-attempt/lifecycle cap | `409 speed_gameplay_busy` |
| direct/nested `40P01` | `deadlock` | yes | `409 speed_gameplay_busy` |
| direct/nested `55P03` | `lock_timeout` | yes | `409 speed_gameplay_busy` |
| direct/nested `P2028` | `transaction_timeout` | no | `503 speed_mutation_transaction_timeout` |
| direct/nested `57014` | `statement_timeout` | no | `503 speed_mutation_transaction_timeout` |
| `P1001/P1002/P1008/P1017` | `connection` | no mutation retry | `503 speed_mutation_unavailable` |
| whole 24s envelope exhausted | `lifecycle_timeout` | no | `503 speed_mutation_lifecycle_timeout` |
| recognized domain conflict | `domain` | no | existing `409` code |
| unknown non-domain failure in ready flow | `unknown` | no | `503 speed_mutation_unavailable` |

Retryable contention retries:

- reuse the same `clientRequestId` and hash;
- start a new serializable transaction;
- obtain a fresh database time;
- sleep with existing `50–250ms` jitter outside all locks;
- stop at three total attempts;
- stop early when remaining lifecycle cannot contain a useful attempt plus response reserve.

Connection and timeout errors are not retried automatically because commit visibility may be uncertain or the same hosted path is likely to repeat. Same-ID replay is the recovery mechanism.

No listed database representation may become generic `500`.

## 9. Deterministic PostgreSQL RED/GREEN gate

### 9.1 Why this is mandatory

Ticket 181's exact SQLSTATE/Prisma class is unavailable. The first Ticket 221 change must therefore be test instrumentation, not a guessed timeout patch.

### 9.2 Harness

Add a disposable-schema PostgreSQL runner following existing timing/race runners. Use:

- distinct application, holder, and monitor clients;
- `connection_limit` sufficient for two independent ready transactions;
- a real `Match FOR UPDATE` holder and `pg_stat_activity`/`pg_blocking_pids` assertions;
- a deterministic query-latency layer applied to the application Prisma client while transactions remain open;
- test-only structured error capture that emits only constructor/category and allowlisted `code`/`meta.code` paths;
- cleanup of triggers, functions, schema, and clients in `finally`.

A Prisma query extension that applies a fixed wall-clock delay around every real database operation is acceptable. A simple delay before dispatching the service calls is not: it does not amplify the transaction's database round trips or lock occupancy.

### 9.3 Required pre-repair diagnostic sequence

1. **Fast control:** concurrent ready succeeds `201/201`, two mutation rows.
2. **Sequential latency control:** both acknowledgements succeed sequentially at the selected latency.
3. **Concurrent latency sweep:** fixed zero-jitter steps until the current path first reproduces one success/one rollback.
4. Record the first failing latency as `D*` and the actual sanitized class as one of:
   - `transaction_acquire_timeout`;
   - `transaction_execution_timeout`;
   - `lock_timeout`;
   - `statement_timeout`;
   - `serialization`;
   - `deadlock`;
   - `connection`;
   - `unknown_database`.
5. Prove through activity monitoring whether the loser entered the transaction callback and whether it waited on the target `Match` lock.
6. Persist the RED result in Ticket 221's response before production refactoring begins.

If the RED run does not reproduce Ticket 181's one-success/one-rollback shape, do not claim a concrete root class. Expand instrumentation or obtain separately approved sanitized hosted telemetry; do not alter budgets speculatively.

### 9.4 Required GREEN result

Against the same frozen `D*` and lock barrier after repair:

- both requests return `201`;
- both mutation identities persist exactly once;
- `readyCount=2`;
- exactly one first-ack window identity exists;
- exactly one countdown/round deadline identity exists;
- no rating event is written;
- projection work occurs only after the contested write locks are released;
- total behavior stays inside the unchanged lifecycle budget.

### 9.5 Forced error-shape matrix

Permanent tests must independently force direct, `meta.code`, and bounded nested forms of:

- `P2028`;
- `P2034`;
- `40001`;
- `40P01`;
- `55P03`;
- `57014`;
- connection codes;
- unknown structured database failure.

Assert retry count, stable `409/503`, rollback state, and absence of raw details.

## 10. Race matrix

### 10.1 Simultaneous ready

- Both transactions request the same `Match` lock.
- One linearizes first and owns the ready window.
- The second reads that committed window, acknowledges the other participant, and owns countdown initialization.
- Both operation identities persist exactly once.

### 10.2 Ready versus pre-start cancellation

- Ready wins: its acknowledgement/start identity may commit; cancellation then voids/no-contests without rewriting timestamps or creating rating events.
- Cancellation wins: ready sees terminal state and writes no new acknowledgement.
- Projection may return the newer terminal snapshot.

### 10.3 Ready versus invitation/ready expiry worker

- Both use the same canonical match-first lock.
- The winner decides using PostgreSQL time.
- Exact deadline equality remains valid; strictly greater expires.
- A committed same-ID replay remains confirmable after terminalization.

### 10.4 Ready versus duplicate request

- Same ID/hash: one logical operation, current authoritative snapshot.
- Same ID/different hash: `409 idempotency_key_conflict`.
- Different ID after ready: no timestamp/window restart and no second ready mutation identity.

### 10.5 Worker versus worker / settlement

No changes are authorized to reconciler selection, generation fencing, `SKIP LOCKED`, terminal adjudication, or rating settlement. Existing exactly-once guards remain unchanged.

## 11. Sanitized observability

Add fixed-cardinality phase observations sufficient to classify future hosted failures:

### Phases

- `dependency_check`;
- `transaction_requested`;
- `transaction_callback_entered`;
- `match_lock_acquired`;
- `mutation_staged`;
- `transaction_returned`;
- `projection_started`;
- `projection_completed`.

### Outcomes

- `committed`;
- `replay`;
- `already_ready`;
- `terminal`;
- `domain_conflict`;
- `retrying`;
- `failed`.

### Error classes

Only the internal classes from Section 8. Do not emit SQLSTATE or Prisma code as an unbounded label.

### Durations

Use bounded histogram buckets for:

- dependency check;
- request-to-callback entry (connection acquisition);
- callback-entry-to-match-lock (row-lock wait);
- lock-to-mutation-staged;
- transaction callback exit-to-transaction return (commit acknowledgement);
- post-commit projection;
- total request.

### Forbidden data

Never emit match, round, participant, user, request, deployment, or provider IDs; cookies; tokens; URLs; SQL; query parameters; answers; guesses; raw exception messages; stack traces in public readiness/metrics; or database/provider payloads.

## 12. Acceptance checklist for Ticket 221

Ticket 221 is complete only if all are true:

- [ ] RED diagnostic records the actual locally reproduced failure class before repair.
- [ ] No claim equates Ticket 181's sanitized `500` with a specific SQLSTATE without evidence.
- [ ] Ready commit transaction returns a compact receipt, not a full snapshot.
- [ ] Response-only projection occurs after commit without write locks or reconciliation.
- [ ] Canonical lock order remains Match -> Round -> participants ordered by ID.
- [ ] PostgreSQL time owns all ready/countdown/deadline decisions.
- [ ] First-ack window and second-ack countdown identities are immutable.
- [ ] Same-ID replay remains confirmable after response loss and expiry.
- [ ] Different-ID already-ready calls cannot replace operation identity.
- [ ] Supported direct/meta/nested error shapes map to stable `409/503`, never generic `500`.
- [ ] Retries are bounded by three total attempts and the unchanged 24s lifecycle.
- [ ] Cancellation and expiry races remain fail-closed and unrated.
- [ ] No duplicate reveal/start/settlement path is introduced.
- [ ] Existing timing, gameplay, lifecycle-race, reconciler, Standard-isolation, typecheck, and full API tests pass.
- [ ] No migration, provider change, hosted mutation, deployment, activation, rollback, merge, or push occurs under this ticket.

## 13. Tradeoffs

### Chosen: shorter transaction plus post-commit projection

Pros:

- directly removes response-only lock occupancy;
- preserves strict write integrity;
- allows same-ID response-loss recovery;
- does not widen game deadlines or transaction budgets.

Cons:

- a committed mutation can return a projection-specific `503`;
- returned state may include a newer terminal transition;
- requires explicit client recovery semantics.

### Rejected: increase transaction timeout

This hides query amplification, extends contested lock ownership, increases pool pressure, and does not classify the generic `500`.

### Rejected: remove match lock or lower isolation

This risks duplicate window/start identity, deadline drift, and unsafe interaction with expiry/cancellation.

### Rejected: return a snapshot assembled from pre-commit in-memory state

It can omit concurrent committed state and creates a second snapshot semantics separate from authoritative reads.

### Rejected: store and replay the original full ready response

It returns stale lifecycle state after expiry/cancellation and expands persisted response data unnecessarily.

### Rejected: classify by raw message text

Provider/Prisma messages are unstable and risk leaking SQL or infrastructure detail.

## 14. Release boundary

Architecture gate: **PASS**.
Current/deployed implementation: **FAIL for further hosted gameplay**.
Ticket 221 may implement and verify this design. Ticket 223 must independently test it. Ticket 224 remains blocked on Ticket 223 PASS and explicit checkpoint authority.

This document authorizes no deployment, migration, hosted smoke, provider change, lifecycle transition, queue activation, rollback, merge, push, or PR operation.
