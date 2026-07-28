# Ticket 234 — Hosted Ready 503 Lock/Timeout Diagnosis

Agent: Elisa
Status: **Diagnosis complete — narrow local repair recommended; no hosted or worktree mutation performed**

## Executive conclusion

The failure is a **database-serialized ready-write failure**, not a ready-window rules failure and not evidence of an edge request deadline. Two requests entered the same `Match` critical section almost simultaneously; one held the `Match` row while executing a latency-multiplied interactive transaction, the peer waited on that same row, and the holder rolled back before recording its acknowledgement. Releasing that lock allowed the peer to commit. That exactly explains HTTP `[503,201]`, durations `[6242.46,9268.19]ms`, and durable cardinality `ready=1`, `speed_ready receipts=1`.

There is one important evidence boundary: **the fixed hosted record does not preserve the 503 response body, application error class, Prisma code, SQLSTATE, or database settings.** Therefore it is not honest to claim that the precise exception was `P2028` rather than `57014` (or, less likely, another app-mapped unavailable class). Source and timing establish the lock/rollback timeline; they do not recover the erased structured exception. The narrow follow-up repair must capture the sanitized class in a local real-PostgreSQL reproduction and in hosted aggregate metrics, without exposing raw database details.

The strongest supported classification is:

```text
simultaneous ready
  -> same Match FOR UPDATE contention
  -> first interactive transaction exceeds the effective hosted DB/transaction envelope
  -> complete rollback of that request
  -> app/upstream returns 503
  -> waiting peer acquires released lock and commits
```

The configured source envelope is `24s` lifecycle / `8s` connection maxWait / `12s` interactive execution / `1s` completion reserve. A response returned from Railway upstream in `5819ms`, far below the 24s lifecycle and 12s configured Prisma execution ceilings. Thus this is **not `speed_mutation_lifecycle_timeout` caused by the source constants**. It is consistent with an effective database/pooler/session timeout near five seconds surfacing as `P2028` or `57014`; that exact provider setting/code cannot be proved under this ticket's no-env/no-provider constraints.

## Source path and exact lock order

Relevant deployed artifact (`1d8ef83353c4bcc09bb8e7803ca231eb7f554f08`):

- `apps/api/src/gameplay/gameplay.controller.ts:81-90` — `POST /matches/:matchId/ready` delegates to `markReady()` and returns Nest's default POST `201` on success.
- `apps/api/src/gameplay/speed-gameplay.service.ts:147-196` — dependency check, commit transaction, then post-commit projection.
- `apps/api/src/gameplay/speed-gameplay.service.ts:198-260` — serializable ready commit.
- `apps/api/src/gameplay/speed-gameplay.service.ts:439-469` — canonical locks/hydration.
- `apps/api/src/gameplay/speed-gameplay.service.ts:628-673` — retry/error coordinator.
- `apps/api/src/gameplay/speed-mutation-policy.ts:1-20` — `24s`, three attempts, `8s maxWait`, `12s execution`, `1s reserve`; commit isolation `Serializable`, projection `RepeatableRead`.
- `apps/api/src/gameplay/speed-mutation-errors.ts:31-83` — `P2028`/`57014` map to `503 speed_mutation_transaction_timeout`; connection/unknown map to sanitized 503; lock timeout/serialization/deadlock are bounded-retry classes.
- `apps/api/src/shared/api-exception.filter.ts:24-31` — preserves an app `HttpException` status/body; only unknown errors become 500.

Within each commit attempt the acquisition order is:

1. `Match WHERE id=$1 FOR UPDATE` — the single common serialization point.
2. `MatchRound WHERE matchId=$1 ORDER BY roundNumber FOR UPDATE`.
3. both `MatchParticipant` rows `ORDER BY id FOR UPDATE`.

The lock queries return the required state; there is no longer a redundant locked-state reread. Under the match lock, the callback then performs, serially:

4. ready receipt lookup;
5. authoritative `clock_timestamp()`;
6. locked reconciliation;
7. participant `readyAt`/`lastServerEventAt` update;
8. for the first acknowledgement, ready-window `Match` update; or for the second acknowledgement, `Match` start and `MatchRound` start updates;
9. `MatchMutationRequest` insert;
10. transaction commit/return.

Only after commit releases all locks does `readCommittedSnapshot()` run in a separate non-locking `RepeatableRead` transaction (`speed-gameplay.service.ts:263-269`). The Ticket 221 split is therefore present and correct, but the remaining write critical section still has enough serial hosted round trips to cross the effective hosted envelope.

## Causal timeline for match `51d60455-e52e-4b76-a380-92026dc0d47c`

Actor labels are intentionally abstract because the evidence does not identify which session owned which status.

1. **t≈0:** Ready A and Ready B are dispatched `0.253847ms` apart. Both first run the operational dependency check outside the mutation transaction.
2. Both request a Prisma interactive transaction with `Serializable`, up to `8s maxWait`, and up to `12s execution` according to local source.
3. Both enter (or attempt to enter) `lockReadyState()`. Transaction A wins `Match FOR UPDATE`; Transaction B blocks on that same row. B cannot reach the round/participant locks yet, so there is no opposite lock order and no application deadlock.
4. A executes the remaining round lock, participant lock, replay lookup, clock query, reconciliation, participant/window writes, receipt insert and commit protocol. Hosted DB/pooler/network latency is paid once per sequential statement while A retains the match lock.
5. At approximately the Railway `5819ms` upstream duration, A's transaction is cancelled/expired by the effective hosted envelope and rolls back atomically. Its tentative `readyAt`, first-ack window change, and receipt (wherever reached) are all absent. The client observes the 503 at `6242.46ms`, the extra roughly 423ms being outside Railway's reported upstream service duration.
6. A's rollback releases `Match`. B's blocked `FOR UPDATE` completes and B continues under the same canonical order against unchanged durable ready state.
7. B becomes the durable first acknowledgement, initializes the 20s ready window, inserts exactly one receipt, commits, performs post-commit projection, and returns 201 at `9268.19ms`.
8. Since the rolled-back participant never became ready and the harness correctly made no blind mutation retry, the reconciler later sees one of two acknowledgements at ready deadline and safely terminalizes `voided/ready_timeout`; both participants are no-contest and no ratings are applied.

The opposite assignment (the 201 request initially owning the lock) is inconsistent with the observed ordering: a committed holder would release the lock before the failed request continued, while the failed response arrives about three seconds **before** the successful response. Holder rollback followed by waiter commit is the parsimonious timeline.

## 503 ownership: app, Railway edge, or database

- **Database/transaction is the initiating failure domain:** exact persistence rollback plus same-row contention cannot be produced by a mere client timeout after a successful commit.
- **The HTTP 503 is returned through the app/upstream path, not a 35s harness timeout:** it arrives in 6.24s; the harness's abort is 35s. Railway records an upstream request duration of 5.819s. This is not an edge gateway deadline at 35s.
- **Configured app lifecycle timeout is ruled out:** 5.8–6.2s is well below 24s and leaves enough source budget; `inReadyTransaction()` would not choose lifecycle exhaustion at that point.
- **Configured Prisma `timeout: 12_000` is not itself reached.** The likely initiating condition is a lower effective hosted database/pooler timeout or cancellation while the transaction is lock/statement active. `P2028` and `57014` both intentionally become app 503. Without the response body/raw structured class or `SHOW` settings, choosing one is speculation.
- A connection/unavailable 503 is less consistent with the exact lock-serialized timing and rollback shape, but cannot be mathematically excluded from the fixed sanitized evidence.

## Why the Ticket 225 local gate missed it

`apps/api/test/speed-ready-hosted-latency-postgres.integration.test.ts` freezes only `D*=300ms`, the first latency that reproduced the **older pre-repair** RED implementation. The current GREEN assertion proves `[201,201]` at that single local point; it does not establish hosted headroom.

Its proxy (`delayedTransactionClient`, lines 43-70):

- adds a fixed delay **after each visible Prisma model/raw call returns**;
- does not delay interactive transaction BEGIN/COMMIT protocol, pooler hops, TLS/network transit, connection scheduling, server execution, or HTTP/runtime overhead;
- uses a local database and process, so its baseline and jitter are substantially lower;
- does not reproduce a hosted database/session timeout setting;
- validates one point (`300ms`), despite candidate values extending through `500ms`;
- uses the old D* as a permanent threshold rather than calibrating cumulative statement count and lock-holder p95/p99.

The recorded local GREEN itself had about `4.858s/7.682s` direct completion at 300ms, whereas hosted returned at `6.242s/9.268s`: roughly 1.4–1.6s of missing cumulative overhead. The test therefore proved functional ordering and rollback/idempotency, but not margin against the hosted effective timeout.

The HTTP subcase also uses an external holder only until both ready backends are observed blocked, then releases it. That is useful lock proof, not an equivalent model of one real ready transaction retaining the match lock through all of its hosted-latency statements.

## Repair alternatives

### A. Increase transaction/provider timeout — rejected as primary repair

Raising Prisma execution, provider statement timeout, or lifecycle limits may mask the symptom but lengthens lock occupancy and preserves latency multiplication. It also violates this ticket's no-config scope and requires provider proof. Keep as an emergency operational option only after a separate review.

### B. Fail-fast `lock_timeout` and retry — not sufficient

A short local lock timeout can stop a waiter consuming its transaction budget and existing mapping can retry it. But the observed **holder** is the request that rolls back, so changing waiter behavior alone does not shorten the holder. It can also turn a valid simultaneous ready into `409 speed_gameplay_busy` rather than the required two successful acknowledgements.

### C. Remove locks/lower isolation — rejected

This breaks first-ack ownership, second-ack start identity, reconciliation ordering, and B1/B2 idempotency. `Serializable` and canonical locks are mandatory.

### D. Single large SQL statement for the whole mutation — too broad

A CTE/stored mutation could minimize round trips, but it duplicates substantial reconciliation/domain logic in SQL, is harder to review, and increases rollback/cardinality risk.

### E. **Chosen: merge only round + participant lock/hydration into one ordered query**

Keep the dedicated `Match FOR UPDATE` as the first statement. Replace the next two statements in `lockReadyState()` with one narrowly typed joined lock query over exactly one `MatchRound` and the two `MatchParticipant` rows, ordered by `roundNumber`, then participant `id`, using `FOR UPDATE OF round_alias, participant_alias`. Validate exactly two result rows, exactly one round identity, two distinct participant identities, and viewer membership before any write.

This saves one hosted round trip in every ready commit while preserving:

- `Match` first as the global serialization boundary;
- round before participants at the logical lock boundary;
- participants in deterministic ID order;
- `Serializable` isolation;
- current operation-first replay, database clock, reconciliation and guarded writes;
- one participant-scoped receipt;
- complete rollback;
- exactly-one-round/two-participant fail-closed cardinality;
- post-commit projection and receipt-aware B1/B2 behavior;
- Standard isolation (Speed-only helper).

Tradeoff: PostgreSQL row-lock execution order must be demonstrated with a real contention test and `EXPLAIN` must not be treated as a contract by itself. If independent testing cannot prove deterministic round-before-participant acquisition for the joined statement, use a slightly broader but still safe variant: retain the round lock as statement 2 and combine participant locking with the authoritative replay lookup where possible. Do not combine all three tables into a planner-dependent one-statement lock.

A secondary safe micro-optimization, only if the one-query saving is insufficient, is to make `reconcileLocked()` return whether it wrote and avoid any no-op database calls in the normal pending/not-expired ready path. Do not weaken reconciliation or omit its authoritative clock check.

## Acceptance criteria

1. Exact source scope is limited to Speed ready lock/hydration and its focused tests; no migration, env, provider, lifecycle constants, deadlines, Standard code, rating logic, or public schema changes.
2. Lock proof on real PostgreSQL shows `Match` acquired first; round identity and both participants are then locked deterministically with participants ordered by ID. Concurrent ready, expiry, cancellation and forfeit cannot form an opposite-order deadlock.
3. A latency sweep runs at `0, 300, 400, 500ms` per statement plus a calibrated baseline/commit delay. Every simultaneous pair returns `[201,201]`; both callbacks and a real match-row waiter are observed.
4. Add an effective-timeout RED control around the hosted failure region (approximately 5–6s transaction occupancy) that fails before repair and passes after repair with at least **1s measured holder margin**. Do not merely increase timeout.
5. Persistence after every successful pair is exactly: two ready participants, two distinct participant-scoped ready receipts, one immutable first-ack window, one match start, one round start/deadline, zero rating events before gameplay terminalization.
6. Same-ID replay and different-ID already-ready B1 remain monotonic: no second receipt, no replaced `readyAt`, no restarted window/deadline.
7. Forced `P2034`, direct/meta/nested `40001`, `40P01`, `55P03`, `P2028`, `57014`, connection codes and unknown errors preserve the existing retry/status mapping and full transaction rollback; no raw SQL/provider/credential detail leaks.
8. Forced post-commit projection failure preserves all five receipt outcomes and truthful `acknowledgementKnown`/`retrySafe` details.
9. Malformed zero/two-round and one/three-participant fixtures fail closed before writes.
10. Timing, lifecycle-race, reconciler, rating, Standard-isolation, API, typecheck and secret-scan gates remain green.
11. Hosted verification, when separately authorized, records aggregate ready metrics (`connection_acquisition`, `row_lock_wait`, `critical_section`, `commit_return`, error class) and the sanitized response code. Two-client acceptance requires `[201,201]`, 2/2 ready, two receipts, and no timeout/void.

## Verification commands for the repair ticket

Run from the repository root with a disposable PostgreSQL schema/database as required by the existing scripts:

```bash
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  test/speed-mutation-policy.test.ts

RUN_SPEED_READY_HOSTED_LATENCY_POSTGRES_INTEGRATION=1 \
SPEED_READY_HOSTED_LATENCY_EXPECT=green \
SPEED_READY_HOSTED_LATENCY_FROZEN_MS=300 \
pnpm --filter @wordle-royale/api exec node --import tsx --test \
  test/speed-ready-hosted-latency-postgres.integration.test.ts

# Extend the gate to invoke the same suite/matrix at 400 and 500ms and with
# the effective 5–6s transaction-occupancy control; these are required new cases.

pnpm --filter @wordle-royale/api run test:postgres:speed-timing
pnpm --filter @wordle-royale/api run test:postgres:speed-lifecycle-races
pnpm --filter @wordle-royale/api run typecheck
CI=true pnpm --filter @wordle-royale/api test
pnpm run validate

git diff --check
git status --short
```

Before any separately authorized hosted rerun, also log only sanitized outputs:

```text
HTTP status + public error code
ready metrics by fixed class/bucket
ready participant count / receipt count
match/round immutable timestamp identity
rating-event count
```

Do not log match/user/request IDs in application metrics, raw Prisma messages, SQL, URLs, or credentials.

## Read-only evidence and limitations

- Inspected deployed source at exact Git head `1d8ef83353c4bcc09bb8e7803ca231eb7f554f08`, Prisma transaction policy, ready lock helper, error classifier/filter, Ticket 221/225 tests, and local uncommitted hosted harness.
- `git diff --check` passed. The worktree had only the disclosed local harness changes (`package.json` plus three untracked smoke files); no source/test/config edit was made.
- No network, provider, environment, GitHub, Railway, hosted database, deployment, lifecycle, or gameplay access occurred.
- This response is the only file created. The missing hosted error body/structured database code remains the sole reason the diagnosis cannot honestly choose `P2028` versus `57014`.