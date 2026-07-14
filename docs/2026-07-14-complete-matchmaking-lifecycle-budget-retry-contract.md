# Complete matchmaking lifecycle budget and retry contract — Wave R Hosted Lifecycle Fix

Date: 2026-07-14
Owner: Elisa
Ticket: 144 — Complete Matchmaking Lifecycle Budget and Retry Contract
Status: decision lock for Tickets 145–147; no code, provider, or hosted mutation

## 1. Decision summary

Standard matchmaking requests must run under one monotonic lifecycle ledger. The initial transaction phase, serialization/deadlock retries, jitter sleeps, and late active-ticket `P2002` recovery all consume the same deadline and the same transaction-attempt count.

Locked defaults:

```text
backend lifecycle cap                 90,000 ms
completion/sanitization reserve        1,000 ms
maximum Prisma transaction attempts        4
configured transaction maxWait         5,000 ms default; 10,000 ms hard config cap
configured transaction timeout        20,000 ms default; 30,000 ms hard config cap
minimum clamped maxWait                   250 ms
minimum clamped transaction timeout     1,000 ms
backoff algorithm                      decorrelated jitter
backoff base                               50 ms
backoff hard cap                        1,000 ms
API proxy deadline                     95,000 ms
server-action maximum                 100,000 ms
browser deadline                      110,000 ms
```

Strict ordering:

```text
backend 90s < API proxy 95s < server action 100s < browser 110s
```

The existing independent `inTransaction()` loops are not compliant. Late uniqueness recovery must not receive a fresh loop, fresh deadline, or reset attempt counter.

## 2. Scope

This contract applies to each Standard matchmaking HTTP request:

- join/create ticket;
- reconnect/current-ticket lookup;
- ticket-by-id lookup;
- cancel.

Join is the maximum path because it can include dictionary selection, cold rating-profile creation, queue creation, candidate locks, dictionary revalidation, match creation, serialization/deadlock retry, and late uniqueness recovery.

Current/reconnect/cancel usually finish much sooner, but use the same bounded coordinator and cross-layer deadline policy so behavior and timeout classification do not drift.

This contract does not change:

- 60-second queue-ticket TTL;
- `Serializable` isolation;
- `FOR UPDATE` / `SKIP LOCKED` behavior;
- idempotency keys or one-active-ticket constraints;
- exact dictionary revalidation before match creation;
- transaction rollback requirements;
- spoiler-safe public responses;
- Redis-optional deployment shape.

## 3. Lifecycle ledger

### 3.1 Monotonic deadline

At the service method boundary, create one ledger:

```ts
type MatchmakingLifecycle = {
  startedAtMonotonicMs: number;
  deadlineMonotonicMs: number; // start + 90_000
  attemptsUsed: number;        // starts at 0
  phase: 'initial' | 'unique_recovery';
  previousBackoffMs: number;   // starts at 50
};
```

Use a monotonic clock (`performance.now()` or injected equivalent) for elapsed-budget decisions. Do not use `Date.now()` to enforce the deadline because wall-clock adjustments can move backward or forward.

Use a separately injected wall clock for persisted timestamps. Refresh the wall-clock `attemptNow` at the beginning of each transaction attempt; do not reuse the HTTP-entry timestamp across retries. In particular, a ticket created late in the lifecycle must receive:

```text
expiresAt = successfulAttemptNow + 60 seconds
```

This prevents a slow/retried request from committing an already-expired ticket.

### 3.2 One coordinator

All Prisma interactive transactions for one request must be invoked through one coordinator, conceptually:

```ts
runMatchmakingLifecycle({ initial, recoverUnique }, dependencies)
```

The coordinator owns:

- monotonic deadline;
- total attempt ledger;
- phase transition;
- per-attempt Prisma options;
- retry classification;
- jitter and sleep;
- public timeout/exhaustion normalization.

Business callbacks do not start nested or second retry loops.

### 3.3 Attempt accounting

Every call to Prisma `$transaction(callback, options)` consumes one attempt before invocation.

Maximum attempts per HTTP request: **4 total**, not four per phase.

Examples:

| Sequence | Attempts used | Allowed next action |
|---|---:|---|
| Initial succeeds | 1 | Return. |
| Initial `P2034`, retry succeeds | 2 | Return. |
| Initial `P2034`, `40001`, `40P01`, then succeeds | 4 | Return. |
| Initial `P2034`, then recognized active-ticket `P2002`, recovery succeeds | 3 | Return. |
| Three initial retryable failures, then recognized `P2002` on attempt 4 | 4 | No recovery attempt; retry exhausted. |
| Initial recognized `P2002`, recovery has retryable conflict twice, succeeds | 4 | Return. |

No code path may reset `attemptsUsed` when `phase` changes.

## 4. Late `P2002` uniqueness recovery

### 4.1 Recognized recovery trigger

Transition from `initial` to `unique_recovery` only for a `P2002` known to represent the request's matchmaking-ticket idempotency/one-active-ticket race. Inspect Prisma metadata/constraint identity where available. Do not treat every unrelated `P2002` as an active-ticket replay.

The transition:

1. consumes the failed initial attempt;
2. may perform one bounded jitter sleep;
3. changes the phase on the same ledger;
4. invokes recovery through the same coordinator;
5. preserves the original monotonic deadline.

Only one initial-to-recovery phase transition is allowed.

### 4.2 Recovery callback

Inside a recovery transaction:

1. reselect the exact idempotency-key replay;
2. otherwise select the user's active Standard ticket;
3. require/revalidate the approved dictionary under the existing policy;
4. attempt pairing if the ticket is still queued;
5. return `created=false`.

If the winner's active ticket is not yet visible or recovery receives `P2034`, PostgreSQL `40001`, or `40P01`, the coordinator may retry recovery only while both attempt and time budgets remain.

An unrecognized `P2002` must not silently become a replay. Preserve or map it to the existing sanitized domain conflict; never expose the database constraint name.

## 5. Retry classes and precedence

### 5.1 Retryable

The following may consume another attempt under the same ledger:

```text
Prisma P2034
Prisma P2010 with PostgreSQL 40001
Prisma P2010 with PostgreSQL 40P01
recognized late matchmaking-ticket P2002
```

Retry is permitted only when:

- fewer than four attempts have been consumed;
- enough lifecycle time remains for bounded jitter and a minimum transaction envelope;
- no non-retryable classification has taken precedence.

### 5.2 Non-retryable

Do not retry:

- Prisma `P2028` interactive-transaction expiry;
- dictionary unavailable/invalid policy result;
- validation/auth/unsupported mode errors;
- not-found/already-matched cancellation outcomes;
- unrecognized uniqueness violations;
- spoiler-safety/domain failures.

### 5.3 Classification precedence

Use this ordering at the coordinator boundary:

1. `P2028` -> `matchmaking_transaction_timeout` immediately, even if the lifecycle deadline is also near.
2. Known non-retryable domain error -> preserve its sanitized contract.
3. Retryable error with attempts remaining -> compute bounded jitter and remaining budget.
4. Retryable error with no attempts remaining:
   - if monotonic deadline is exhausted, `matchmaking_lifecycle_timeout`;
   - otherwise, `matchmaking_retry_exhausted`.
5. Before sleeping/starting an attempt, insufficient remaining envelope -> `matchmaking_lifecycle_timeout`.

This keeps a real Prisma attempt expiry distinct from whole-request budget exhaustion.

## 6. Decorrelated jitter contract

Replace fixed 10/20ms sleeps with decorrelated jitter:

```ts
const BASE_MS = 50;
const CAP_MS = 1_000;

upper = min(CAP_MS, previousBackoffMs * 3);
delay = randomIntegerInclusive(BASE_MS, upper);
previousBackoffMs = delay;
```

With `previousBackoffMs=50`, the first range is 50–150ms. The next upper bound is at most 450ms, and the third is at most 1,000ms.

Production randomness may use `Math.random()` or a non-blocking equivalent. Tests must inject randomness; do not mock global time/random APIs when a dependency can be passed directly.

Injectable dependencies:

```ts
type LifecycleDependencies = {
  monotonicNowMs: () => number;
  wallNow: () => Date;
  random: () => number; // [0, 1)
  sleep: (milliseconds: number) => Promise<void>;
};
```

Before sleeping, calculate whether this delay leaves the completion reserve plus minimum attempt envelope. If not, do not sleep; return lifecycle timeout.

Different injected random sequences must yield different bounded delays for concurrent test runners, proving the algorithm can break lockstep. Tests must also prove deterministic output for a fixed sequence.

## 7. Per-attempt Prisma budget clamping

### 7.1 Inputs

Retain the existing validated configuration:

```text
MATCHMAKING_TRANSACTION_MAX_WAIT_MS
  default 5,000
  configured range 1,000–10,000

MATCHMAKING_TRANSACTION_TIMEOUT_MS
  default 20,000
  configured range 6,000–30,000
```

These are preferred per-attempt maxima, not guaranteed allocations.

### 7.2 Formula

Immediately before every Prisma transaction:

```ts
remainingMs = deadlineMonotonicMs - monotonicNowMs();
usableMs = floor(remainingMs - COMPLETION_RESERVE_MS); // reserve = 1,000

clampedMaxWaitMs = min(configuredMaxWaitMs, floor(usableMs / 5));
clampedTimeoutMs = min(configuredTimeoutMs, usableMs - clampedMaxWaitMs);
```

Start an attempt only when:

```text
clampedMaxWaitMs >= 250
clampedTimeoutMs >= 1,000
clampedMaxWaitMs + clampedTimeoutMs <= remainingMs - 1,000
attemptsUsed < 4
```

Otherwise return `matchmaking_lifecycle_timeout` without invoking Prisma.

Pass on every attempt:

```ts
{
  isolationLevel: 'Serializable',
  maxWait: clampedMaxWaitMs,
  timeout: clampedTimeoutMs,
}
```

Never pass zero, negative, NaN, or unclamped values. Never allow `maxWait + timeout` to exceed the remaining lifecycle minus reserve.

### 7.3 Why the formula is asymmetric

Transaction execution is more valuable than pool acquisition, so the clamped envelope reserves approximately 80% of a short remaining budget for `timeout` and at most 20% for `maxWait`. With ample time, existing configured maxima remain unchanged.

## 8. Public error contract

All three errors are HTTP `503`, retryable by a future user action, and spoiler-safe.

### 8.1 Complete lifecycle exhausted

```json
{
  "code": "matchmaking_lifecycle_timeout",
  "message": "Matchmaking could not complete within its request deadline. Retry the request."
}
```

Use when the monotonic request budget or minimum remaining envelope is exhausted before a definitive result.

### 8.2 Prisma transaction expired

```json
{
  "code": "matchmaking_transaction_timeout",
  "message": "Matchmaking took too long to complete. Retry the request."
}
```

Use only for `P2028`. Do not retry the expired transaction in the same request.

### 8.3 Retry attempts exhausted

```json
{
  "code": "matchmaking_retry_exhausted",
  "message": "Matchmaking was busy resolving concurrent queue activity. Retry the request."
}
```

Use when four attempts are consumed by retryable concurrency/recognized uniqueness races while lifecycle time remains.

Never include:

- Prisma/PostgreSQL codes;
- constraint names;
- SQL or provider details;
- database URLs/credentials;
- dictionary words or answer metadata;
- attempt counts or internal timing details in the public response.

Structured internal telemetry may record error class, phase, attempts used, and elapsed/budget bucket, but must not include secrets or answers.

## 9. Rollback, idempotency, and server-authority invariants

Each failed/expired interactive transaction must roll back:

- rating profiles created in that attempt;
- queue tickets;
- audit rows;
- matches, rounds, participants, guesses, and rating events.

A subsequent attempt must re-run business reads inside its new serializable snapshot. Do not carry Prisma records or transaction clients across attempts. Only stable request input and the lifecycle ledger cross attempt boundaries.

Preserve:

- idempotency-key replay before new ticket creation;
- one active ticket per user/mode;
- candidate row locks and self-match prevention;
- dictionary release lock and exact policy revalidation immediately before match creation;
- deterministic match idempotency key from sorted ticket IDs;
- exactly one shared match for two successfully paired users;
- no client-submitted outcome, answer, rating, or match authority.

## 10. Queue timestamp semantics

The lifecycle's 90-second cap is longer than the 60-second queue TTL. Therefore:

- compute persisted queue timestamps from each attempt's fresh wall clock;
- set new ticket `createdAt` normally at database insertion and `expiresAt=attemptNow+60s`;
- perform expiration/window calculations using the current attempt's wall clock;
- do not let an old method-entry `now` create an immediately expired ticket after retries;
- idempotent replays retain their original timestamps.

Tests with injected clocks must prove a ticket committed late in the lifecycle still receives a full queue TTL from its successful attempt.

## 11. Worst-case arithmetic

### 11.1 Default unconstrained attempt arithmetic

```text
per-attempt maximum = 5,000 maxWait + 20,000 timeout = 25,000 ms
four attempts        = 4 × 25,000                         = 100,000 ms
maximum jitter       = 150 + 450 + 1,000                 =   1,600 ms
unconstrained total                                           101,600 ms
```

The unconstrained total exceeds the lifecycle cap, so the fourth/late attempts must be clamped or refused.

### 11.2 Enforced complete path

```text
backend lifecycle hard cap                              90,000 ms
completion/sanitization reserve                          1,000 ms
all Prisma waits/execution/backoff must finish by       89,000 ms
API proxy abort                                          95,000 ms  (+5,000)
server-action maximum                                   100,000 ms  (+5,000)
browser operation deadline                             110,000 ms (+10,000)
```

The 90-second cap includes both initial and uniqueness-recovery phases. There is no valid `90s + recovery` path.

At maximum configured `10s maxWait + 30s timeout`, each early attempt may request 40 seconds, but later attempts receive only the remaining clamped envelope. Configuration cannot expand the 90-second lifecycle.

### 11.3 Provider prerequisite

The hosting path must permit at least the 100-second server-action maximum already represented by application configuration. If a provider imposes a lower immutable request limit, lower the backend/API/server/browser chain together; do not leave an impossible application deadline. No provider change is authorized by Ticket 144.

## 12. Web/API deadline contract

Ticket 146 should replace current `125/130/140` values with:

```ts
backendLifecycleMs: 90_000,
apiProxyMs: 95_000,
serverActionMaxDurationSeconds: 100,
serverActionMaxMs: 100_000,
browserMs: 110_000,
minimumBackendToProxyMarginMs: 5_000,
minimumProxyToServerMarginMs: 5_000,
minimumServerToBrowserMarginMs: 10_000,
```

Apply this bounded policy to join, reconnect, current-ticket polling, and cancel.

The web layer must distinguish its own abort from an API `503`:

- API returns one of the three matchmaking codes -> preserve code/message to recoverable queue UI.
- API-proxy `AbortError` at 95 seconds -> sanitized web transport timeout; browser remains active long enough to receive it.
- Browser reaches 110 seconds first only if server action/proxy failed to honor their own earlier deadlines; UI returns to a retryable state.

Do not automatically submit a second join after an ambiguous timeout. Reconnect/current-ticket status is the safe reconciliation path because the first request may have committed just before transport cancellation.

## 13. Behaviorally tied verification

### 13.1 Backend coordinator unit tests

Use fake monotonic/wall clocks, fake sleep, injected random sequence, and a fake Prisma transaction invoker.

Required assertions:

1. One initial success consumes one attempt.
2. Each of `P2034`, `P2010/40001`, and `P2010/40P01` is forced through exactly four failures and returns `matchmaking_retry_exhausted` with three bounded sleeps.
3. `P2028` returns `matchmaking_transaction_timeout` after one attempt and zero sleeps.
4. Initial attempt(s) plus recognized `P2002` recovery never exceed four total attempts.
5. Late `P2002` on attempt four starts no recovery transaction.
6. Recovery uses the original deadline; fake elapsed time can force `matchmaking_lifecycle_timeout` before recovery.
7. Every recorded Prisma option has `Serializable`, positive clamped values, and `maxWait + timeout <= remaining - reserve` at invocation.
8. Fixed random sequence yields exact repeatable delays; different sequences produce different bounded delays.
9. Backoff that would consume the minimum envelope is refused without sleeping.
10. Fresh wall time is used per attempt and committed ticket TTL is not based on stale request-entry time.

### 13.2 API/service tests

- Existing dictionary unavailable remains distinct and performs zero writes.
- Injected inner dictionary/rating-profile `P2028` remains transaction timeout and is not retried.
- Recognized ticket uniqueness race enters recovery; unrelated `P2002` does not.
- All three public error bodies are exact and contain no injected sensitive/ORM details.
- Initial, retry, recovery, current, ticket lookup, and cancel transactions use the shared coordinator.
- Partial write followed by timeout/retry rolls back in real PostgreSQL.

### 13.3 Concurrency/PostgreSQL tests

- Reproduce the pre-fix canonical cold-profile failure.
- Then pass the canonical fresh-schema matchmaking harness **10 consecutive times**.
- Six-second delayed two-user concurrent pairing creates exactly two tickets, one shared match, two distinct participants, and no self-pairing.
- Dictionary bootstrap/revalidation and over-budget rollback harnesses remain green.
- No disposable schemas/processes remain after testing.

### 13.4 Web tests

Replace whole-file regex-only proof with imports/instrumented behavior:

- API client request transport is injectable or observable; invoke each exported queue operation and assert the actual fetch/abort timeout is 95,000ms.
- Browser deadline runner uses an injected timer; invoke join/reconnect/current/cancel and assert actual 110,000ms behavior.
- Server action imports a shared numeric constant or a generated/validated boundary that cannot drift silently; build-time test verifies `maxDuration=100` and actual action path uses the policy.
- Assert exact ordering and all margins from imported values.
- Assert API `503` arrives before browser deadline and remains recoverable.
- Assert browser timeout does not auto-submit another join and reconciliation uses current-ticket lookup.

Source inspection may supplement these tests but cannot be the sole evidence.

## 14. Implementation boundaries

Recommended backend modules:

```text
apps/api/src/matchmaking/matchmaking-lifecycle.ts
  policy constants/config
  ledger
  classifier
  clamped attempt budget
  decorrelated jitter
  coordinator

apps/api/src/matchmaking/matchmaking.service.ts
  initial and unique-recovery business callbacks
  no independent retry loops

apps/api/test/matchmaking-lifecycle.test.ts
  deterministic coordinator behavior
```

The existing `matchmaking-transaction-budget.ts` may be expanded or replaced, but there must be one authoritative backend lifecycle policy.

Recommended web boundary:

```text
apps/web/src/lib/matchmaking-deadline-policy.ts
  imported constants and ordering assertions

apps/web/src/lib/api-client.ts
  injected/observable timeout use

apps/web/src/components/standard-queue-state.ts
  browser runner and reconciliation behavior
```

Do not duplicate numeric literals across call sites when importable policy values are possible.

## 15. Handoff

### Freya / Ticket 145

- implement one coordinator/ledger and remove the second full recovery loop;
- implement four total attempts and decorrelated jitter;
- clamp every Prisma attempt to remaining monotonic budget;
- refresh wall time per attempt;
- preserve all transaction/dictionary/idempotency/rollback invariants;
- prove 10 consecutive canonical fresh-schema passes.

### Luna / Ticket 146

- bind actual API fetch, server-action, and browser runners to `95s/100s/110s`;
- use behavior/instrumentation tests rather than regex-only evidence;
- preserve recoverable UI and current-ticket reconciliation after ambiguity.

### Jasmine / Ticket 147

Independently verify every item in Section 13. Ticket 140 remains blocked unless Ticket 147 returns PASS.

## 16. Non-goals

- No code implementation in Ticket 144.
- No provider/deployment/hosted database mutation.
- No dictionary re-bootstrap.
- No weakening of serializable isolation, row locks, revalidation, or idempotency.
- No unbounded/infinite retries.
- No automatic client duplicate join after ambiguous timeout.
