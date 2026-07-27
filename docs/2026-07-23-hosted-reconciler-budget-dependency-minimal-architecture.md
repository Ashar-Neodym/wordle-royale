# Hosted Speed reconciler budget and dependency-minimal architecture

Date: 2026-07-23
Owner: Elisa
Ticket: 208 — Hosted Reconciler Budget and Dependency-Minimal Architecture
Status: implementation-ready architecture; no hosted action authorized

## 1. Purpose

Define a bounded Speed expiry reconciler that can establish honest runtime readiness on the measured hosted Railway/PostgreSQL path without weakening exact-once expiry, scheduler generation fencing, deadline authority, or Standard isolation.

This contract replaces the current assumption that an entire reconciler pass must finish inside `2,000ms` and that its database transaction must finish inside `1,000ms`.

It does **not** authorize:

- implementation merge;
- migration;
- deployment;
- Railway or database configuration changes;
- lifecycle authority transition;
- queue activation;
- gameplay smoke;
- provisioning or credential changes.

Speed remains closed until downstream implementation, independent QA, approved checkpoint deployment, read-only hosted verification, and the existing activation approvals all pass.

## 2. Evidence and root cause

### 2.1 Hosted evidence

Ticket 202's read-only hosted preflight established:

- exact Railway fleet proof passed;
- provider project, environment, service, deployment, commit, replica count, and capability leases matched;
- schema and dictionary checks passed;
- Standard remained healthy;
- Speed remained unavailable;
- lifecycle authority remained `v1_open`, generation `1`;
- no provider or database mutation occurred;
- the reconciler dependency path took approximately `4,400ms`;
- the reconciler transaction was configured with a `1,000ms` timeout;
- reconciler pass ownership expired after `2,000ms`.

The observed path therefore cannot establish a valid successful pass under the current envelope even when the database and schema are healthy.

### 2.2 Current call graph

The current pass is:

```text
SpeedExpiryReconcilerService.tick()
  -> SpeedGameplayService.reconcileDue()
     -> SpeedOperationalReadinessService.assertDependenciesAvailable()
        -> checkDatabase()
        -> checkApplicationSchema()
        -> checkSpeedReadyLifecycleSchema(false)
        -> checkStandardDictionary()
     -> Prisma interactive transaction
        -> due-match query
        -> lock/load/reconcile each selected match
        -> completion ownership guard
        -> commit
```

The dependency probes are useful at application readiness and matchmaking boundaries, but they are redundant inside every one-second expiry pass.

### 2.3 Architectural defect

The current pass conflates two questions:

1. **May the product advertise or create new Speed work?**
2. **Can this worker reconcile already-persisted Speed deadlines?**

Question 1 requires feature, schema, dictionary, activation, capability, and reconciler readiness.

Question 2 requires only the database objects and transaction paths needed to find and settle persisted Speed matches.

Running full product-readiness probes before each expiry transaction increases latency and creates a circular dependency:

```text
Speed readiness requires a successful reconciler pass
reconciler pass requires full Speed dependency readiness
full dependency readiness performs multiple hosted probes before reconciliation
```

The repair is to make reconciliation dependency-minimal while leaving product readiness fail-closed.

## 3. Decisions

### 3.1 Protocol identity

The implementation identity is:

```text
speed_reconciler_runtime_v2_dependency_minimal_10s
```

It is an internal runtime identity, not a public gameplay ruleset or ready-lifecycle version.

The following identities remain unchanged:

```text
ranked mode             speed_1v1
ruleset                 speed_1v1_v1_75s
rating identity         speed_1v1_glicko_v1
v1 ready lifecycle      speed_ready_v1_match_created_20s
v2 ready lifecycle      speed_ready_v2_first_ack_90s
activation protocol     speed_lifecycle_activation_gate_v1
```

### 3.2 Fixed runtime constants

Ticket 210 must define these constants in one runtime-budget module and import them from the scheduler, transaction adapter, metrics, readiness snapshot, and tests:

| Constant | Value | Meaning |
|---|---:|---|
| `SPEED_RECONCILER_INTERVAL_MS` | `1,000` | delay after a caught-up success or failure before the next pass |
| `SPEED_RECONCILER_BATCH_SIZE` | `10` | maximum matches mutated in one transaction |
| `SPEED_RECONCILER_SELECTION_LIMIT` | `11` | batch plus one, used to detect remaining due backlog |
| `SPEED_RECONCILER_MAX_WAIT_MS` | `1,000` | Prisma interactive transaction acquisition wait |
| `SPEED_RECONCILER_LOCK_TIMEOUT_MS` | `1,000` | PostgreSQL local lock timeout |
| `SPEED_RECONCILER_STATEMENT_TIMEOUT_MS` | `7,000` | PostgreSQL local statement timeout |
| `SPEED_RECONCILER_TRANSACTION_TIMEOUT_MS` | `8,000` | Prisma interactive transaction lifetime |
| `SPEED_RECONCILER_MAX_PASS_MS` | `10,000` | scheduler pass ownership lifetime, including transaction acquisition |
| `SPEED_RECONCILER_SUCCESS_FRESHNESS_MS` | `12,000` | maximum age of the last caught-up successful pass |
| `SPEED_RECONCILER_PASS_RESERVE_MS` | `1,000` | reserve between the maximum transaction envelope and pass ownership expiry |

The measured hosted dependency path was `4,400ms`. The new pass envelope is `10,000ms`, leaving `5,600ms` of measured-path headroom. The transaction acquisition plus transaction-lifetime envelope is `9,000ms`, leaving `1,000ms` before pass ownership expires.

These are fixed architecture values. They must not become unrestricted environment variables. A later change requires new evidence and a recorded decision.

### 3.3 Why not merely raise the old timeout

Raising the old `1,000ms` transaction and `2,000ms` pass values without removing redundant dependency probes would:

- retain circular readiness coupling;
- spend most of the budget on probes unrelated to expiry settlement;
- amplify database catalog and dictionary traffic every second per API replica;
- make capacity scale poorly with replica count;
- hide the architectural defect rather than repair it.

Ticket 210 must both remove the probes from the pass and implement the new bounded budgets.

## 4. Dependency boundary

### 4.1 Required inside a pass

A reconciler pass may depend only on:

1. the configured Prisma/PostgreSQL connection;
2. PostgreSQL authoritative time;
3. Speed `Match`, `MatchRound`, and `MatchParticipant` rows;
4. rating/event persistence touched by the existing adjudication path;
5. the current scheduler epoch and pass-generation token;
6. monotonic process time for local pass ownership and health freshness.

### 4.2 Forbidden inside a pass

`reconcileDue()` and the expiry worker must not call or depend on:

- `SpeedOperationalReadinessService`;
- `checkDatabase()` as a separate probe;
- `checkApplicationSchema()`;
- `checkSpeedReadyLifecycleSchema()`;
- `StandardDictionaryService` or dictionary readiness;
- dictionary rows or answer selection;
- `SpeedLifecycleActivationService` or the activation authority row;
- capability lease checks or heartbeats;
- Railway/provider inventory;
- Redis;
- HTTP, DNS, Vercel, Railway, or another service;
- queue creation eligibility;
- global application readiness;
- client timestamps.

The due query and settlement transaction are themselves the worker's database proof. A missing table, column, enum, index-dependent statement, rating path, or database connection causes the pass to fail closed.

### 4.3 Readiness remains comprehensive

Removing product-readiness probes from the worker does not remove them from product readiness.

`SpeedOperationalReadinessService` must continue to require, outside the pass:

- the Speed feature gate;
- database connectivity;
- application and lifecycle schema readiness;
- validated active dictionary readiness for new matchmaking;
- activation schema and local lifecycle compatibility where applicable;
- a fresh caught-up reconciler success.

New Speed queue tickets and matches remain closed if any one of those checks fails.

### 4.4 Persisted-work principle

Activation closing, disabled creation, dictionary unavailability, or provider uncertainty must not prevent reconciliation of already-persisted Speed matches.

Persisted match identity determines reconciliation behavior. The worker must continue to read and settle both v1 and v2 rows according to each row's own lifecycle identity.

The worker must never rewrite lifecycle identity or extend invitation, ready, countdown, or round deadlines.

## 5. Component boundaries

### 5.1 Budget module

Create:

```text
apps/api/src/gameplay/speed-reconciler-budget.ts
```

It owns only fixed constants, derived type-safe budget configuration, and invariant checks.

At module load or in tests, assert:

```text
selectionLimit = batchSize + 1
maxWaitMs + transactionTimeoutMs + passReserveMs <= maxPassMs
lockTimeoutMs <= statementTimeoutMs
statementTimeoutMs < transactionTimeoutMs
intervalMs > 0
batchSize > 0
successFreshnessMs >= maxPassMs + intervalMs
```

Do not duplicate numeric literals elsewhere.

### 5.2 Persistence service

Create or extract:

```text
apps/api/src/gameplay/speed-expiry-reconciliation.service.ts
```

Contract:

```ts
type SpeedReconcilePassResult = Readonly<{
  selected: number;
  processed: number;
  hasMore: boolean;
}>;

reconcileDue(input: {
  batchSize: 10;
  selectionLimit: 11;
  completionGuard: () => boolean;
}): Promise<SpeedReconcilePassResult>;
```

This service may use existing private gameplay adjudication helpers after a narrow refactor. Do not copy adjudication or rating rules into a second implementation.

It must not inject `SpeedOperationalReadinessService`.

### 5.3 Scheduler

`SpeedExpiryReconcilerService` owns:

- one self-scheduling timer;
- the scheduler epoch;
- one pass-generation token;
- no-overlap enforcement;
- immediate bounded catch-up scheduling when `hasMore=true`;
- normal interval scheduling after caught-up success or failure;
- runtime health and metrics updates.

### 5.4 Runtime health

`SpeedRuntimeHealthService` owns only process-local scheduler evidence. It must not query PostgreSQL or any external dependency.

It tracks:

- scheduler epoch;
- pass generation;
- pass start monotonic time;
- pass in-flight state;
- last caught-up successful completion;
- last completion classification;
- backlog/caught-up state;
- elapsed budget and freshness.

### 5.5 Product readiness

`SpeedOperationalReadinessService` combines persisted dependency checks, lifecycle compatibility, and the process-local runtime snapshot.

No reverse dependency from the reconciler to this service is permitted.

## 6. Pass algorithm

### 6.1 Self-scheduling loop

Replace `setInterval()` with a single self-scheduling `setTimeout()` loop.

Pseudocode:

```text
onModuleInit:
  if scheduler configuration disabled:
    remain unavailable
    return
  epoch = markSchedulerStarted()
  schedule tick immediately

tick:
  if stopped, wrong epoch, or pass already running:
    return

  pass = markPassStarted(epoch)
  result = await reconcileDue(batch=10, selectionLimit=11, guard=owns(pass))

  if completion is obsolete:
    record obsolete completion
    remain unavailable
    do not schedule from the obsolete pass
  else if result.hasMore:
    mark pass completed but backlog/not-caught-up
    remain unavailable
    schedule next pass immediately with a new generation
  else:
    mark caught-up pass succeeded
    schedule next pass after 1,000ms

on transaction/error/timeout:
  mark current pass failed if still owned
  remain unavailable
  schedule next pass after 1,000ms

onModuleDestroy:
  cancel pending timer
  invalidate scheduler epoch before awaiting shutdown
  do not accept any old completion
```

A zero-delay catch-up must use a new event-loop turn (`setImmediate` or `setTimeout(..., 0)`), not recursion.

### 6.2 Startup

At process startup:

- reconciler readiness is false;
- no previous process success is inherited;
- the first pass starts immediately;
- an empty or fully caught-up pass may establish readiness;
- a pass reporting `hasMore=true` may not establish readiness;
- there is no arbitrary startup grace that advertises Speed before proof.

### 6.3 Empty queue

An empty due query is a valid caught-up success if:

- the transaction committed;
- pass ownership was valid immediately before commit;
- the transaction and pass stayed inside their budgets;
- the scheduler epoch remained current.

An empty pass proves the scanner and transaction path are operational. Independent schema readiness continues to prove the broader product schema.

### 6.4 Due-work selection

Inside one serializable transaction:

1. apply local transaction safeguards;
2. obtain PostgreSQL-authoritative time;
3. select at most `11` due Speed match IDs in deadline/ID order using `FOR UPDATE ... SKIP LOCKED`;
4. set `hasMore = selected.length > 10`;
5. reconcile only the first `10` selected IDs;
6. check pass ownership immediately before callback return/commit;
7. throw on lost ownership so the entire transaction rolls back;
8. return `{selected, processed, hasMore}` only after commit succeeds.

Stable ordering remains:

```text
ORDER BY COALESCE(round.deadlineAt, match.readyDeadlineAt, match.invitationExpiresAt), match.id
```

The eleventh row is a backlog sentinel and must not be mutated by that transaction.

### 6.5 PostgreSQL safeguards

The transaction must set, locally and without changing hosted configuration:

```text
lock_timeout = 1,000ms
statement_timeout = 7,000ms
idle_in_transaction_session_timeout = 8,000ms
```

The Prisma interactive transaction uses:

```text
isolationLevel = Serializable
maxWait = 1,000ms
timeout = 8,000ms
```

These settings are per transaction. Ticket 210 must not alter global PostgreSQL, Supabase, Railway, or Prisma pool configuration.

The deterministic PostgreSQL race harness may retain its explicit test-only timeout override, but production constants and ordinary tests must use this contract.

### 6.6 No in-pass retry

Do not retry a failed serializable transaction inside the same scheduler pass.

A retry would consume the ownership reserve, blur metrics, and risk committing after the pass's proof window. Instead:

- `P2034`, PostgreSQL `40001`, PostgreSQL `40P01`, `P2028`, lock timeout, statement timeout, and connectivity failure all fail the current pass;
- runtime readiness becomes false immediately when the current failure is accepted;
- the next scheduler pass, with a new generation, is the retry.

This differs intentionally from request-path mutation retries defined by Ticket 144.

## 7. Deadline and correctness guarantees

### 7.1 Time authority

PostgreSQL time remains authoritative for:

- invitation expiry;
- ready expiry;
- countdown/round boundaries;
- adjudication timestamps;
- rating events.

Monotonic process time is used only for scheduler ownership and readiness freshness.

### 7.2 Exact deadline boundary

Existing policy remains:

```text
accepted at database time == deadline
expired only at database time > deadline
```

The due query therefore uses strict `< authoritative_now` comparisons for persisted deadlines.

### 7.3 Request-path reconciliation remains

Ready, guess, forfeit, cancellation, and snapshot paths continue to reconcile a locked match before serving or mutating it.

The worker is the durable passive completion path, not the sole correctness boundary. A delayed passive worker must never allow a late mutation because request paths compare against PostgreSQL-authoritative deadlines.

### 7.4 Exactly once

Exactly-once terminal effects continue to depend on:

- `FOR UPDATE ... SKIP LOCKED` due selection;
- deterministic lock ordering;
- `adjudicatedAt` terminal guard;
- one serializable transaction per selected batch;
- rating/event uniqueness and existing finalize logic;
- complete rollback on pass-ownership loss;
- idempotent request operation records.

Redis, leader election, and process-local ownership are not correctness boundaries.

### 7.5 No stale completion

A pass completion is accepted only when all are true:

- scheduler is running;
- scheduler epoch matches;
- pass generation matches the current in-flight pass;
- monotonic elapsed time is at most `10,000ms`;
- transaction committed within its `8,000ms` lifetime;
- completion guard still owned the pass immediately before commit;
- the process has not begun module destruction.

An old process, stopped scheduler, replaced generation, timed-out pass, or late callback cannot establish health.

## 8. Backlog behavior

### 8.1 Caught-up semantics

A pass is **caught up** only when `hasMore=false`.

A successful commit with `hasMore=true`:

- counts processed rows;
- proves useful work occurred;
- does not establish reconciler readiness;
- clears caught-up success eligibility;
- schedules an immediate new-generation catch-up pass.

This prevents a worker that is permanently behind from advertising Speed as healthy.

### 8.2 Bounded batches

The batch size is `10`, not the current `25`.

Reasons:

- hosted round trips and rating finalization must fit the `8,000ms` transaction lifetime;
- smaller lock sets reduce contention with request-path reconciliation;
- a failed pass rolls back less work;
- immediate catch-up preserves throughput without making one transaction unbounded.

Ticket 209's initial `25`-row expectation must be reconciled to the architecture value `10` before Ticket 210 implementation begins.

### 8.3 Deterministic expiry-lateness bounds

When the worker is caught up and healthy, maximum passive expiry lateness is:

```text
interval + maxPass = 1,000ms + 10,000ms = 11,000ms
```

For a finite backlog of `B` due rows ordered at or before a target row, with no worker failure:

```text
maximum lateness(B)
  = interval + ceil(B / batchSize) * maxPass
  = 1,000ms + ceil(B / 10) * 10,000ms
```

Examples:

| Due rows through target | Bound |
|---:|---:|
| `1–10` | `11,000ms` |
| `11–20` | `21,000ms` |
| `21–30` | `31,000ms` |
| `50` | `51,000ms` |
| `61` | `71,000ms` |

There is no honest finite bound under unbounded arrivals, repeated database failure, or capacity lower than due-work arrival. In those conditions Speed must stay unavailable, alerts must fire, and no new queue work may be created.

### 8.4 Failure detection

A current explicit pass failure clears readiness immediately.

A hung in-flight pass becomes unhealthy when its age exceeds `10,000ms`.

A process with no new successful caught-up completion becomes unhealthy when success age exceeds `12,000ms`.

With one-second health observation cadence, the maximum stale-success detection envelope is `13,000ms`.

## 9. Multi-replica behavior

Each API replica runs one local scheduler. Do not add:

- Redis coordination;
- PostgreSQL advisory leader election;
- a singleton hosted worker requirement;
- Railway cron;
- a new queue service.

`FOR UPDATE ... SKIP LOCKED` partitions due rows among healthy replicas. Each replica maintains its own scheduler epoch and local readiness evidence.

A replica may report a successful empty pass while another replica holds due rows. That is acceptable because:

- the other transaction is bounded;
- skipped locks are released on commit/rollback/timeout;
- exact-once integrity is database-enforced;
- every replica independently fails health on its own hung/failed pass;
- request paths still reconcile locked matches.

Provider inventory and capability leases remain activation concerns, not per-pass dependencies.

## 10. Failure matrix

| Condition | Transaction outcome | Local reconciler health | Scheduling | Product effect |
|---|---|---|---|---|
| Empty due queue within budget | Commit | Ready | next pass after `1,000ms` | Speed may pass this gate |
| `1–10` due rows settled | Commit | Ready if no sentinel | next pass after `1,000ms` | bounded settlement |
| More than `10` due rows | First 10 commit | Unavailable/not caught up | immediate catch-up | new Speed work stays closed |
| Transient connection failure | No commit | Unavailable | retry after `1,000ms` | Speed closed; Standard unaffected |
| `P2034`/`40001`/`40P01` | Rollback | Unavailable | new-generation retry after `1,000ms` | no in-pass retry |
| Prisma `P2028` | Rollback/expired | Unavailable | new-generation retry after `1,000ms` | stale pass cannot revive health |
| Lock timeout | Rollback | Unavailable | retry after `1,000ms` | request-path owner wins |
| Statement timeout | Rollback | Unavailable | retry after `1,000ms` | no partial expiry |
| Pass exceeds `10,000ms` | Completion rejected; guard rolls back if pre-commit | Unavailable | no overlap; retry only after settlement | fail closed |
| Promise never settles | Unknown transaction eventually bounded by DB/Prisma; no second pass | Unavailable after pass budget | no overlap | restart/incident required if it never returns |
| Scheduler restart | Old epoch invalid | Unavailable until new caught-up pass | immediate new-epoch pass | old completion rejected |
| Module shutdown | Timer cancelled; epoch invalid | Unavailable | none | old transaction cannot establish health |
| Dictionary unavailable | Reconciler still runs | Product Speed unavailable | normal reconciliation | persisted rows settle |
| Activation closing/disabled | Reconciler still runs | creation unavailable | normal reconciliation | drain remains possible |
| Reconciler fails | No effect on Standard worker/read contracts | Speed unavailable only | bounded retry | Standard stays available |

## 11. Health and observability contract

### 11.1 Runtime snapshot

Extend the existing reconciler health snapshot with safe fields:

```ts
type SpeedReconcilerHealthSnapshot = {
  ready: boolean;
  schedulerRunning: boolean;
  schedulerEpoch: number;
  passInFlight: boolean;
  passGeneration: number | null;
  lastCompletion: 'none' | 'caught_up_success' | 'backlog' | 'failed' | 'obsolete';
  caughtUp: boolean;
  successAgeMs: number | null;
  inFlightAgeMs: number | null;
  lastPassDurationMs: number | null;
  lastProcessed: number;
  backlogObserved: boolean;
  intervalMs: 1000;
  batchSize: 10;
  maxPassMs: 10000;
  successFreshnessMs: 12000;
};
```

Do not expose match IDs, user IDs, answers, guesses, database URLs, SQL text, provider credentials, or raw errors.

### 11.2 Metrics

Expose through existing internal metrics/logging facilities:

Counters:

```text
speed_reconciler_pass_started_total
speed_reconciler_pass_caught_up_total
speed_reconciler_pass_backlog_total
speed_reconciler_pass_failed_total
speed_reconciler_pass_obsolete_total
speed_reconciler_tick_skipped_overlap_total
speed_reconciler_matches_processed_total
speed_reconciler_immediate_catchup_total
```

Gauges/histograms:

```text
speed_reconciler_pass_duration_ms
speed_reconciler_transaction_duration_ms
speed_reconciler_success_age_ms
speed_reconciler_inflight_age_ms
speed_reconciler_last_processed
speed_reconciler_backlog_observed
```

Error classification must use an allowlist such as:

```text
connection
serialization
 deadlock
transaction_timeout
lock_timeout
statement_timeout
obsolete_pass
unknown
```

Do not log raw exception messages if they can include connection details or SQL.

### 11.3 Public readiness

Public `/readyz` may expose sanitized Speed runtime status and fixed budget values. It must not expose process IDs, deployment IDs, lease IDs, provider IDs, or database details.

A Speed reconciler failure must:

- mark `dependencies.speedRuntime.status = unavailable`;
- make Speed catalog `enabled=false` and `queueEnabled=false`;
- make Speed queue mutation fail with the stable unavailable contract;
- leave Standard mode enabled when Standard's own dependencies are healthy;
- not cause a Speed-only disagreement to be represented as a global Standard/core outage.

The endpoint may describe the service as degraded while still returning the existing successful health envelope for core availability. Deployment health configuration must not restart the entire API solely because Speed runtime is unavailable.

## 12. Scheduler enablement and shutdown

### 12.1 Enablement

Ticket 210 must preserve the current production enablement behavior unless a separate operational decision changes it. The reconciler runs when the deployed Speed runtime is enabled.

Activation phase and dictionary readiness must not stop it.

If operations disable new Speed creation while persisted matches remain, they must keep the reconciler runtime enabled until those matches settle.

Do not introduce a new hosted environment variable in Ticket 210 unless implementation proves one is necessary. Any new variable would require separate deployment/configuration approval.

### 12.2 Graceful shutdown

On shutdown:

1. cancel the pending timer;
2. invalidate the scheduler epoch immediately;
3. reject any later pass completion;
4. let Prisma teardown roll back or close in-flight work;
5. do not wait indefinitely for a hung pass;
6. never mark health successful during shutdown.

## 13. Security and data policy

- No new public mutation endpoint.
- No operator endpoint.
- No provider credential in the API.
- No raw SQL or database errors in public responses.
- No answers or guesses in reconciler logs or metrics.
- No opponent information is serialized by the worker.
- No client timestamp influences expiry.
- No cross-mode locks or rating writes.
- Standard rows and Standard rating history remain untouched.

## 14. Testing contract

### 14.1 Ticket 209 reconciliation

Ticket 209 is the QA-first RED matrix. Before Ticket 210 starts, Jasmine and Freya must reconcile its assumptions to this contract:

- batch size changes from the provisional `25` to `10`;
- selection limit is `11`;
- `reconcileDue()` returns structured backlog evidence rather than only a number;
- successful backlog work does not establish readiness;
- the `4,400ms` hosted-latency case remains required and must pass under the `10,000ms` ownership budget;
- dependency-minimal spies must prove schema/dictionary/readiness methods are not called by a pass.

### 14.2 Deterministic unit tests

Required cases:

1. fixed constants and invariant relationships;
2. empty pass success;
3. one due match success;
4. exactly ten due matches success with no sentinel;
5. eleven due matches process ten, report backlog, remain unavailable, and schedule immediate catch-up;
6. 61-row backlog drains in deterministic ordered batches without overlap;
7. pass at exactly `10,000ms` remains eligible;
8. pass after `10,000ms` is obsolete;
9. success at exactly `12,000ms` age remains fresh;
10. success after `12,000ms` age is stale;
11. `P2028`, `P2034`, `40001`, `40P01`, lock timeout, statement timeout, and connection failure each fail closed;
12. no in-pass retry occurs;
13. next-generation retry can recover health;
14. a hung pass blocks overlap and becomes unhealthy;
15. late success and late failure cannot revive health;
16. scheduler restart fences the old pass;
17. module destroy fences the old pass;
18. Standard stays available while Speed fails closed;
19. dictionary failure does not prevent persisted expiry reconciliation;
20. activation closing/disabled does not prevent persisted expiry reconciliation;
21. empty/due passes never call operational readiness, schema checks, dictionary checks, activation, leases, provider inventory, Redis, or HTTP.

### 14.3 Transaction-shape tests

Assert exact production options:

```text
Serializable
maxWait=1,000ms
timeout=8,000ms
lock_timeout=1,000ms
statement_timeout=7,000ms
idle_in_transaction_session_timeout=8,000ms
```

Assert:

- `LIMIT 11`;
- only first ten rows mutate;
- deadline/ID ordering;
- `FOR UPDATE OF match SKIP LOCKED`;
- PostgreSQL time;
- strict expiry boundary;
- ownership guard immediately before commit;
- sentinel row remains unchanged;
- transaction rollback removes every mutation on ownership loss.

### 14.4 Real PostgreSQL tests

The existing hostile lifecycle runner must continue to prove:

- two reconcilers do not double-settle one match;
- request path versus worker lock ordering;
- ready at the exact deadline remains accepted;
- ready after deadline loses to reconciliation truthfully;
- v1 and v2 rows remain reconcilable;
- scheduler generation change before commit rolls back all worker writes;
- no duplicate rating events;
- no-contest paths produce zero rating changes;
- active deadline adjudication remains exactly once;
- spoiler-safe reads remain unchanged.

At least ten clean-schema hostile runs remain required for independent QA.

### 14.5 CLI/operator regression

Ticket 202 found a separate real CLI startup defect after runtime readiness failed. Ticket 210 must include the already-assigned real compiled CLI/provider-readiness regression in its validation scope or coordinate it explicitly with the owning checkpoint ticket. A mocked provider test alone is not sufficient.

## 15. Hosted verification plan

Hosted steps are blocked until Ticket 210 is implemented, Ticket 211 independently passes, and Ashar explicitly approves Ticket 212 deployment.

After an approved checkpoint deploy, perform read-only verification only:

1. confirm immutable Railway deployment/commit/replica identity;
2. confirm exact capability leases;
3. confirm migrations/schema and dictionary readiness;
4. call public `/readyz` through the pinned canonical API origin;
5. observe reconciler readiness across a continuous minimum 30-second window;
6. require multiple fresh caught-up completions, not one startup sample;
7. require no backlog, failure, obsolete completion, or overlap signal;
8. require Standard healthy throughout;
9. run the real operator CLI in verify/dry-run mode only;
10. confirm lifecycle authority remains `v1_open`, generation `1`;
11. confirm zero activation/audit/queue/match/rating writes from the verification;
12. stop and record evidence on any mismatch.

This checkpoint does not authorize `closing_to_v2` or `v2_open`.

## 16. Rollout and rollback

### 16.1 Rollout

1. Ticket 209 publishes the reconciled RED acceptance matrix.
2. Ticket 210 implements locally.
3. Ticket 211 independently reviews unit, PostgreSQL, dependency-minimal, backlog, and Standard-isolation behavior.
4. Ticket 212 requests explicit merge/deployment approval.
5. Approved deployment starts with authority still `v1_open`.
6. Read-only hosted verification proves runtime readiness.
7. Activation remains a separate later approval under Ticket 198 or its successor.

### 16.2 Rollback

If the checkpoint implementation worsens readiness or causes errors:

- keep Speed creation closed;
- do not transition authority;
- revert only through an approved checkpoint rollback;
- preserve all v1/v2 rows;
- do not rewrite deadlines or lifecycle identities;
- keep Standard serving;
- continue request-path reconciliation where available;
- do not delete capability leases or audit evidence manually.

This contract requires no schema migration. A runtime-only rollback is therefore expected unless Ticket 210 introduces an unauthorized schema change, which must be rejected in review.

## 17. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Larger budget hides a genuinely hung pass | hard pass, statement, transaction, and freshness limits; fail closed |
| Redundant probes remain accidentally | dependency-spy tests and removal of readiness injection from persistence service |
| Batch transaction holds too many locks | batch reduced to 10; SKIP LOCKED; local lock timeout |
| Worker permanently behind | sentinel detection; immediate catch-up; backlog never establishes readiness |
| Immediate catch-up spins on failure | immediate scheduling only for committed backlog; failures wait one interval |
| Old pass revives health | epoch and generation identity plus pre-commit guard |
| Commit occurs after ownership | transaction envelope is one second shorter than pass ownership; local DB timeouts |
| Empty pass overstates full schema health | independent schema/product readiness remains mandatory |
| Dictionary outage strands persisted matches | dictionary removed from pass dependencies |
| Activation close stops drain | activation removed from pass dependencies |
| Multi-replica duplicate settlement | serializable transactions, row locks, SKIP LOCKED, terminal/idempotency guards |
| Speed outage harms Standard | mode-scoped readiness and catalog closure only |
| Public observability leaks data | sanitized fixed fields and allowlisted error classes |
| Unbounded backlog lacks honest maximum | explicit finite-backlog formula; fail closed under sustained overload |

## 18. Downstream handoff

### Jasmine — Ticket 209

- Reconcile the existing provisional RED matrix to batch `10`, selection `11`, structured `hasMore`, and caught-up readiness.
- Add dependency-minimal spies.
- Keep the measured `4,400ms` hosted case.
- Preserve hostile timeout, restart, overlap, backlog, and Standard-isolation coverage.

### Freya — Ticket 210

- Implement the fixed budget module.
- Extract dependency-minimal expiry persistence.
- Replace `setInterval` with the self-scheduling loop.
- Implement sentinel backlog detection and immediate catch-up.
- Apply local PostgreSQL timeouts and exact Prisma transaction options.
- Extend sanitized health/metrics.
- Do not add migrations, providers, Redis, endpoints, hosted variables, or deployment changes.

### Jasmine — Ticket 211

- Independently verify all deterministic and PostgreSQL cases.
- Review that no hidden dependency call remains.
- Run at least ten clean-schema hostile iterations.
- Verify Standard isolation and real CLI startup behavior.

### Yuna — Ticket 212

- Only after Ticket 211 PASS, prepare a checkpoint PR/CI record.
- Request explicit approval before merge/deploy.
- Keep authority `v1_open`.
- Perform read-only hosted verification only after approval.

## 19. Completion criteria

Ticket 208 is complete when:

- constants and dependency boundary are explicit;
- scheduler, transaction, backlog, failure, restart, and readiness contracts are implementation-ready;
- deterministic lateness formulas are recorded;
- Ticket 209 assumption differences are identified;
- downstream handoffs are updated;
- repository verification passes;
- no implementation, hosted mutation, deployment, or activation occurs.
