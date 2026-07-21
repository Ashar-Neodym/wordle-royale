# Hosted Speed ready lifecycle contract — Wave U

Date: 2026-07-17
Owner: Elisa
Ticket: 176 — Hosted Speed Ready Lifecycle Contract
Status: technical decision lock complete; the new 90-second invitation value and first-ready meaning require Ashar approval; no implementation or hosted mutation

## 1. Executive decision

The current lifecycle conflates **match creation/delivery** with the approved **two-player ready window**. That is structurally incorrect under hosted latency: the server creates `readyDeadlineAt` during pairing, while clients may not receive the match for 7–18 seconds and ready writes may take another 8–19 seconds.

Wave U should introduce a separately versioned ready lifecycle:

```text
readyLifecycleVersion=speed_ready_v2_first_ack_90s
invitationWindowMs=90_000
readyWindowMs=20_000
countdownMs=3_000
roundTimeMs=75_000
solveTimeBucketMs=100
```

Core rule:

> Match creation starts a finite 90-second invitation/delivery period. The existing 20-second two-player ready window starts only when the first valid ready acknowledgement commits under the server-owned database clock.

This preserves the already-approved 20-second opponent-ready promise without letting queue response latency consume it. The first ready transaction persists the one immutable ready-window start/deadline pair; the second ready transaction persists the one immutable reveal/deadline pair.

No deadline is client-derived or extendable. Zero-ready invitations expire. One-ready matches expire. Cancellation remains no-contest before reveal. Disconnect does not pause any started deadline.

This changes a user-facing timing value and the meaning of the 20-second ready clock. Tickets 177–178 remain approval-blocked until Ashar explicitly approves the decision block in §16.

## 2. Hosted evidence and rationale

Ticket 164 independently measured:

```text
concurrent join responses: 7.519s and 17.760s
concurrent ready responses: 8.391s and 18.894s
ready dispatch skew: 0.535ms
persisted outcome: one ready, match voided
```

Ticket 163 additionally measured:

```text
join response: up to 16.915s
state read: up to 8.648s
forfeit response: 14.491s
one concurrent ready request: over 120s / transport timeout
```

The observed join + state-read + ready path is:

```text
17.760s + 8.648s + 18.894s = 45.302s
```

A 90-second invitation provides:

```text
90.000s - 45.302s = 44.698s headroom
90.000 / 45.302 = 1.99x the observed path
```

Why 90 seconds:

- 60 seconds leaves only 14.698 seconds beyond the observed path and is fragile during cold starts or a single retrying read.
- 120 seconds unnecessarily holds two users and one match for two minutes before either expresses intent.
- 90 seconds is finite, roughly twice the worst measured delivery/read/ready path, and does not alter competitive play time.
- A user who never acknowledges ready earns no rating outcome; repeated no-shows can be observed/rate-limited without inventing a rated loss.

Maximum lifecycle after match creation, if first ready occurs at the last valid invitation instant and the opponent uses the full ready window:

```text
90s invitation + 20s opponent-ready + 3s countdown + 75s round = 188s
```

This is an upper bound, not a displayed single countdown.

## 3. Version and compatibility identity

Do not reinterpret legacy hosted rows silently.

Keep competitive identities unchanged:

```text
rulesetVersion=speed_1v1_v1_75s
ratingAlgorithmConfigVersion=speed_1v1_glicko_v1
adjudicationVersion=speed_1v1_adjudication_v1
```

Add a distinct lifecycle identity:

```text
speed_ready_v1_match_created_20s  // existing rows/behavior
speed_ready_v2_first_ack_90s      // new Wave U matches
```

The game clock, countdown, guess limit, solve-time bucket, adjudication, and rating math are unchanged. A separate lifecycle version avoids stranding completed v1 matches or pretending that old `readyDeadlineAt` values had v2 semantics.

All newly paired Speed matches after activation must persist v2. Mixed API instances must fail readiness until every serving instance supports the same active lifecycle version.

## 4. Authoritative state machine

### 4.1 Public states

```text
paired
  -> waiting_invitation       // zero players ready
  -> waiting_opponent_ready   // exactly one player ready
  -> countdown                // both ready; reveal is in the future
  -> in_progress
  -> finalizing
  -> completed

waiting_invitation     -> voided (invitation_timeout or pre_start_cancelled)
waiting_opponent_ready -> voided (ready_timeout or pre_start_cancelled)
countdown              -> voided (pre_start_cancelled or operator/system integrity failure)
in_progress            -> completed (existing Speed adjudication)
```

The old `waiting_ready` state remains readable only for legacy v1 snapshots during migration compatibility. New v2 matches must emit the two explicit waiting states.

### 4.2 Transition ownership

| Transition | Sole owner | Required lock |
|---|---|---|
| Pairing → `waiting_invitation` | Speed matchmaking match-creation transaction | tickets, users, match creation rows |
| First ready → `waiting_opponent_ready` | `POST /matches/{id}/ready` transaction | match, round, participants, operation row |
| Second ready → `countdown` | same ready transaction | same lock set |
| Invitation/ready expiry → `voided` | request reconciliation or generation-fenced reconciler | match, round, participants |
| Pre-start cancellation → `voided` | `POST /matches/{id}/forfeit` compatibility route | match, round, participants, operation row |
| Countdown → `in_progress` | derived from immutable `startsAt`; no write required | none for display |
| Gameplay terminalization | existing Speed gameplay/adjudication transaction | existing lock set |

No browser owns a transition.

## 5. Immutable timestamp contract

### 5.1 New v2 match at creation

Use one PostgreSQL `clock_timestamp()` value as `createdAt` and invitation origin.

```text
createdAt               = dbNow
invitationExpiresAt     = dbNow + 90 seconds
readyWindowStartedAt    = null
readyDeadlineAt         = null
Match.startedAt         = null
MatchRound.startedAt    = null
MatchRound.deadlineAt   = null
```

`invitationExpiresAt` is immutable.

### 5.2 First valid ready acknowledgement

In the first successful ready transaction:

```text
firstReadyAt            = locked transaction dbNow
viewer.readyAt          = firstReadyAt
readyWindowStartedAt    = firstReadyAt
readyDeadlineAt         = firstReadyAt + 20 seconds
```

All four values are persisted atomically. `readyWindowStartedAt` and `readyDeadlineAt` are immutable afterward.

### 5.3 Second valid ready acknowledgement

In the second successful ready transaction:

```text
secondReadyAt           = locked transaction dbNow
viewer.readyAt          = secondReadyAt
Match.startedAt         = secondReadyAt + 3 seconds
MatchRound.startedAt    = Match.startedAt
MatchRound.deadlineAt   = Match.startedAt + 75 seconds
Match.status             = active
```

The reveal/deadline pair is persisted once and cannot be moved by replay, reconnect, retry, worker pass, or clock refresh.

### 5.4 Boundary policy

Use one inclusive request boundary and one exclusive expiry rule:

```text
ready valid when authoritative locked dbNow <= applicable expiry
expiry terminalization when authoritative locked dbNow > applicable expiry
```

Therefore:

- first ready exactly at `invitationExpiresAt` is valid;
- second ready exactly at `readyDeadlineAt` is valid;
- a request one database-clock instant later is late;
- the reconciler must not use `>=` if the command uses `<=`.

PostgreSQL is authoritative. Browser time, Node `Date.now()`, request dispatch time, client-submitted time, and proxy receipt time cannot establish readiness.

## 6. Ready command contract

Endpoint remains:

```http
POST /matches/{matchId}/ready
```

Request remains:

```ts
type MarkSpeedMatchReadyRequest = {
  clientRequestId: string; // UUID, stable for this logical ready operation
};
```

### 6.1 Transaction order

For each backend attempt:

1. assert operational readiness before opening the gameplay transaction;
2. begin one bounded serializable transaction;
3. lock `Match`, `MatchRound`, then both `MatchParticipant` rows in stable id order;
4. authenticate/resolve the viewer from locked participants;
5. look up `(participantId, speed_ready, clientRequestId)` before deadline rejection;
6. if the operation exists with another request hash, return `idempotency_key_conflict`;
7. if the operation exists with the same hash, return a current authoritative snapshot without mutating or re-extending timestamps;
8. acquire authoritative DB time;
9. reconcile an applicable expiry using the exact boundary policy;
10. reject new late operations with the phase-specific stable error;
11. atomically persist first-ready or second-ready fields;
12. persist the mutation-operation record and confirmation identity;
13. return the current snapshot;
14. commit.

Idempotency lookup precedes expiry rejection so a committed operation whose response was lost remains confirmable after the match later expires or completes.

Internal retry of a fully rolled-back serializable transaction is allowed. It is not a second logical mutation. Browser/server-action code must not automatically issue another POST.

### 6.2 Operation correlation

State recovery must prove the caller's logical operation, not merely observe an unrelated ready flag.

Extend snapshot readiness:

```ts
readiness: {
  phase: 'invitation' | 'opponent_ready' | 'locked' | 'legacy';
  viewerReady: boolean;
  readyCount: 0 | 1 | 2;
  viewerReadyAt: string | null;
  viewerReadyOperationId: string | null;
}
```

`viewerReadyOperationId` is the persisted `MatchMutationRequest.clientRequestId` that first set this participant ready. It is visible only to that participant.

A replay with the same ID returns confirmed current state. A different ID after `viewerReady=true` must not create a second operation or change `readyAt`; it may return `already_ready` or the current snapshot, but the original correlation ID remains authoritative.

## 7. Zero-ready, one-ready, both-ready, cancellation, and reconnect

### 7.1 Zero ready

- State: `waiting_invitation`.
- `invitationExpiresAt` is present.
- `readyWindowStartedAt` and `readyDeadlineAt` are null.
- Either participant may become first ready.
- At `dbNow > invitationExpiresAt`, reconcile to no-contest with `completionReason=invitation_timeout`.
- Exactly zero rating apply events are written.

### 7.2 One ready

- State: `waiting_opponent_ready`.
- `readyWindowStartedAt` and `readyDeadlineAt` are present.
- The ready participant reconnects as ready and cannot restart the window.
- The unready participant may acknowledge until and including the deadline.
- At `dbNow > readyDeadlineAt`, reconcile to no-contest with `completionReason=ready_timeout`.
- The first-ready user does not gain a rated win for an opponent no-show.

### 7.3 Both ready

- The second ready transaction creates one 3-second countdown.
- Both reconnect snapshots contain identical `startsAt` and gameplay `deadlineAt`.
- No ready replay can move either value.
- Existing 75-second round and 100ms solve bucket apply unchanged.

### 7.4 Explicit cancellation

The existing forfeit route remains the compatibility command:

```http
POST /matches/{matchId}/forfeit
```

Before `startsAt`:

- cancellation by either participant produces no-contest;
- use `completionReason=pre_start_cancelled` and participant terminal reason `no_contest`;
- zero rating apply events;
- this applies during invitation, opponent-ready, and countdown;
- replay with the same operation ID returns current terminal state;
- a concurrent ready/cancel race serializes on the same match lock and first valid committed transition wins.

At or after `startsAt`, preserve the existing rated forfeit semantics. The exact reveal instant is the boundary.

Do not introduce a destructive DELETE or silently cancel matched tickets.

### 7.5 Disconnect/reconnect

- Disconnect never pauses invitation, ready, countdown, or round clocks.
- Reconnect reads return the same match/round and immutable timestamps.
- Zero-ready reconnect shows the invitation deadline, not a fictional 20-second ready deadline.
- One-ready reconnect shows the actual opponent-ready deadline.
- A terminal reconnect returns the existing no-contest/completed state.
- Reads may trigger idempotent reconciliation.

## 8. Expiry reconciliation and exactly-once behavior

The generation-fenced reconciler from Tickets 172–175 remains mandatory.

V2 due selection:

```sql
rankedMode = 'speed_1v1'
AND adjudicatedAt IS NULL
AND status = 'pending'
AND (
  (readyLifecycleVersion = 'speed_ready_v2_first_ack_90s'
   AND readyWindowStartedAt IS NULL
   AND invitationExpiresAt < clock_timestamp())
  OR
  (readyLifecycleVersion = 'speed_ready_v2_first_ack_90s'
   AND readyWindowStartedAt IS NOT NULL
   AND readyDeadlineAt < clock_timestamp())
  OR
  (legacy-v1 due predicate)
)
```

Order by the applicable deadline, then match id. Claim bounded batches with `FOR UPDATE SKIP LOCKED` and preserve scheduler-generation/pass fencing.

Completion mappings:

| Condition | Match status | Completion reason | Rating apply events |
|---|---|---|---:|
| v2 zero-ready expiry | voided | `invitation_timeout` | 0 |
| v2 one-ready expiry | voided | `ready_timeout` | 0 |
| cancellation before reveal | voided | `pre_start_cancelled` | 0 |
| operator integrity void | voided | `operator_void` | 0 |
| existing post-reveal outcomes | completed/voided per adjudication | existing reason | existing exactly-once contract |

Request reconciliation and worker reconciliation call the same locked transition function. Repeated calls must observe `adjudicatedAt` and do nothing. No-contest must never create a Speed rating apply event, profile delta, leaderboard delta, or Standard record.

## 9. Backend mutation lifecycle budget

### 9.1 Unified finite Speed mutation envelope

Use one explicit policy for ready, guess, and forfeit rather than the current generic transaction loop:

```text
backend lifecycle cap          24_000ms
maximum transaction attempts  3 total
per-attempt maxWait cap         8_000ms
per-attempt execution cap      12_000ms
completion reserve              1_000ms
retry jitter                     50–250ms bounded
```

`maxWait + timeout` is clamped to remaining lifecycle time. No attempt starts if the reserve and minimum useful transaction envelope cannot fit. Three attempts are an attempt ceiling, not three full 20-second envelopes; one monotonic 24-second ledger covers acquisition, execution, retries, jitter, and response materialization.

Ready transactions must contain only DB work needed for lock, state, operation identity, timestamp, transition, and snapshot. No provider call, dictionary scan, rating calculation, network I/O, sleep, or health probe occurs while locks are held.

Stable sanitized errors:

| Code | HTTP | Meaning |
|---|---:|---|
| `speed_mutation_lifecycle_timeout` | 503 | Complete backend mutation budget expired. |
| `speed_mutation_transaction_timeout` | 503 | Interactive transaction expired. |
| `speed_gameplay_busy` | 503 | Retryable conflicts exhausted the shared attempt cap. |
| `invitation_expired` | 409 | New first-ready operation arrived after invitation expiry. |
| `ready_deadline_passed` | 409 | New second-ready operation arrived after opponent-ready expiry. |
| `pre_start_cancelled` | 409/current snapshot | Match was cancelled before reveal. |
| `idempotency_key_conflict` | 409 | Same operation ID was used with another payload. |

Provider/Prisma errors remain private.

### 9.2 Lock and concurrency guarantees

- Match → round → participant rows is the only ready/cancel lock order.
- Both simultaneous ready calls may start before either commits.
- The first lock holder creates the ready window.
- The second sees that fresh 20-second window, becomes second ready, and creates countdown.
- No code may hold a lock while waiting on the other request at an application barrier.
- Serialization/deadlock retry uses bounded jitter, not immediate synchronized retry.
- The loser of a retry race rechecks operation identity and all timestamps.

The deterministic PostgreSQL test must delay transaction stages through injected barriers/clock advancement, not 8–19 seconds of wall-clock sleeping.

## 10. Cross-layer web/request budgets

### 10.1 Ordering

```text
backend Speed mutation lifecycle  24_000ms
API proxy/fetch timeout            26_000ms   (+2s)
Next server-action maximum         30_000ms   (+4s)
browser operation envelope         35_000ms   (+5s)
```

Every outer layer is strictly larger than the inner layer it observes. These values cover the measured 18.894-second ready response and 14.491-second forfeit while remaining finite.

Use these constants from one imported policy module. Do not duplicate numeric literals in API client, actions, and components. The production function must pass `timeoutMs=26_000`; tests that inspect only a constant are insufficient.

### 10.2 Recovery-read policy

A mutation remaining pending at 8 seconds enters **uncertain** UI state and starts an authoritative state read without aborting or replaying the original POST.

```text
soft uncertain threshold            8_000ms
recovery read timeout/attempt       12_000ms
recovery read max attempts                 2
recovery read retry delay              250ms
worst recovery read envelope        24_250ms
soft threshold + worst recovery     32_250ms
browser operation envelope          35_000ms
```

The read is idempotent and may retry. The mutation must not.

### 10.3 Single-flight polling

Current 1.5-second interval polling can overlap when hosted reads take 4–9 seconds, amplifying contention. Replace interval fire-and-forget with single-flight scheduling:

- at most one state read per match/component is in flight;
- recovery reuses an existing state read rather than launching another;
- schedule the next waiting-state read after the prior one settles;
- waiting states: approximately 3 seconds after completion;
- countdown/in-progress may use approximately 1.5 seconds after completion;
- terminal state stops polling;
- unmount discards stale results; abort is advisory because the server may finish.

## 11. Browser mutation/recovery state machine

Per logical ready operation:

```text
idle
 -> pending                 // one POST, stable UUID
 -> uncertain               // 8s; parallel GET begins, no second POST
 -> confirmed               // POST response or exact operation correlation in snapshot
 -> expired/cancelled       // authoritative terminal snapshot/error
 -> retry_safe              // POST definitively ended + GET proves operation absent + deadline remains
```

Rules:

- Generate one `clientRequestId`; retain it across pending, timeout, reconnect, and user-approved retry.
- Never automatically replay POST after timeout, disconnect, server-action rejection, or uncertain GET.
- If a state read reports `viewerReadyOperationId` equal to the pending ID, mark confirmed and ignore any later stale error response.
- If state is countdown/in-progress and `viewerReady=true`, treat readiness as confirmed even if the operation response was lost.
- If the POST is still pending and a read shows unready, remain uncertain; absence is not proof that the in-flight transaction cannot commit.
- Enable **Retry same ready request** only after the POST definitively ended, an authoritative read confirms the operation absent/unready, and the applicable server deadline remains open.
- A retry is a user action with the same ID, never a new logical operation.
- Late/stale responses are generation-tagged locally and cannot overwrite a newer snapshot.

UI copy must distinguish:

- “Accept match” during the 90-second invitation period;
- “Waiting up to 20 seconds for opponent” after viewer is first ready;
- “Opponent is ready — confirm before the server deadline” for the unready player;
- “Still confirming with the server” after 8 seconds;
- invitation expired versus opponent-ready deadline expired;
- countdown and gameplay clocks unchanged.

Accessibility:

- do not announce every poll/tick;
- announce phase changes and meaningful deadline thresholds;
- `aria-busy` reflects the mutation, not background recovery reads;
- uncertain state cannot disable the separate authoritative-state control permanently.

## 12. API and shared-contract changes

### 12.1 Snapshot v2

```ts
type SpeedReadyLifecycleVersion =
  | 'speed_ready_v1_match_created_20s'
  | 'speed_ready_v2_first_ack_90s';

type SpeedMatchSnapshotV2 = {
  // existing identity/game fields
  readyLifecycleVersion: 'speed_ready_v2_first_ack_90s';
  state:
    | 'waiting_invitation'
    | 'waiting_opponent_ready'
    | 'countdown'
    | 'in_progress'
    | 'finalizing'
    | 'completed'
    | 'voided';
  invitationExpiresAt: string;
  readyWindowStartedAt: string | null;
  readyDeadlineAt: string | null;
  startsAt: string | null;
  deadlineAt: string | null;
  readiness: {
    phase: 'invitation' | 'opponent_ready' | 'locked';
    viewerReady: boolean;
    readyCount: 0 | 1 | 2;
    viewerReadyAt: string | null;
    viewerReadyOperationId: string | null;
  };
};
```

Prefer a discriminated union for v1/v2 compatibility. Do not make all fields optional on one ambiguous shape.

### 12.2 Mode catalog

When v2 is operational, Speed catalog identity adds:

```text
readyLifecycleVersion=speed_ready_v2_first_ack_90s
invitationWindowSeconds=90
readyWindowSeconds=20
readyWindowStartsOn=first_valid_ready_acknowledgement
```

The 20-second value must no longer be described as “from match creation.”

### 12.3 Completion enums

Expand `SpeedCompletionReason` additively:

```text
invitation_timeout
pre_start_cancelled
```

Keep `ready_timeout` for one-ready expiry and legacy v1 expiry interpretation where applicable. Participant result remains `void` and terminal reason remains `no_contest` for all three pre-reveal no-contest outcomes.

## 13. Persistence and migration

### 13.1 Expand-only schema

Add nullable fields to `Match`:

```text
readyLifecycleVersion String?
invitationExpiresAt DateTime?
readyWindowStartedAt DateTime?
```

Change `readyDeadlineAt` handling from required-in-practice to nullable before first v2 ready. Add enum values/indexes through a migration.

Recommended indexes:

```sql
CREATE INDEX speed_v2_invitation_due_idx
ON "Match" ("invitationExpiresAt", "id")
WHERE "rankedMode"='speed_1v1'
  AND "status"='pending'
  AND "readyLifecycleVersion"='speed_ready_v2_first_ack_90s'
  AND "readyWindowStartedAt" IS NULL
  AND "adjudicatedAt" IS NULL;

CREATE INDEX speed_v2_ready_due_idx
ON "Match" ("readyDeadlineAt", "id")
WHERE "rankedMode"='speed_1v1'
  AND "status"='pending'
  AND "readyLifecycleVersion"='speed_ready_v2_first_ack_90s'
  AND "readyWindowStartedAt" IS NOT NULL
  AND "adjudicatedAt" IS NULL;
```

Service/database invariants:

- v2 `invitationExpiresAt = createdAt + 90 seconds`;
- zero-ready v2 has null ready-window timestamps;
- one/two-ready v2 has `readyDeadlineAt = readyWindowStartedAt + 20 seconds`;
- `readyWindowStartedAt` equals the first persisted participant `readyAt`;
- two-ready active match retains existing 3-second and 75-second consistency;
- terminal no-contest has zero rating apply events.

Cross-table equality needs service/integration validation; do not invent a fragile trigger without review.

### 13.2 Existing preview-only rows

No wholesale backfill and no timestamp extension.

- Completed/voided v1 matches remain immutable and readable.
- Active v1 gameplay continues under its persisted start/deadline.
- Pending v1 matches continue to use their existing match-creation-based `readyDeadlineAt` until request/worker reconciliation terminalizes them.
- A null lifecycle version plus existing ready deadline is interpreted as `speed_ready_v1_match_created_20s` only in compatibility code.
- Never convert a v1 pending deadline into a new 90-second invitation; that would revive/extend an existing match.
- New matches switch to v2 only after schema/readiness confirms every dependency.

Before activation, record spoiler-safe counts of pending/active legacy Speed matches. Do not print users, answers, operation IDs, or secrets.

## 14. Readiness, rollout, rollback, and abuse controls

### 14.1 Fail-closed readiness

`speedRuntime=ok` for v2 requires:

- new columns and completion enum values;
- active lifecycle identity exact match;
- v2 due indexes/query support;
- generation-fenced reconciler healthy/fresh;
- ready mutation lifecycle policy loaded;
- existing dictionary/rules/rating dependencies healthy.

If the catalog advertises v2 but any dependency is unavailable, Speed queue fails closed. Standard remains independent.

### 14.2 Abuse resistance

- One active ranked activity per user remains enforced.
- Invitation and ready windows are finite and cannot be restarted.
- Reconnect/replay never extends timestamps.
- Pre-reveal cancellation/no-show yields no rating transfer.
- Rate-limit repeated joins/no-shows using existing authenticated user/session controls and telemetry; do not assign rated penalties in Wave U.
- Do not expose exact opponent operation IDs/timestamps.
- Preserve answer/hash/salt and guess spoiler boundaries.

### 14.3 Rollout

1. Obtain product approval for §16.
2. Merge additive schema/contracts with Speed lifecycle activation still fail-closed.
3. Deploy compatible readers/migration.
4. Verify readiness and legacy-row counts.
5. Activate v2 creation only when all API instances are compatible.
6. Run local/real-PostgreSQL QA, PR/CI, then separately approved merge/deployment.
7. Run hosted simultaneous-ready smoke and final independent QA.

### 14.4 Rollback

- Disable Speed queue through the reviewed fail-closed gate.
- Preserve and reconcile already-created v2 matches with compatible code.
- Revert v2 creation behavior through a reviewed PR; do not rewrite v2 rows as v1.
- Do not drop additive columns/enums/indexes while hosted v2 rows exist.
- Standard queue/gameplay/rating must stay live and unchanged.

## 15. Verification contract

### 15.1 Unit/contract

- v2 snapshot discriminates nullable pre-first-ready fields correctly;
- first-ready operation creates exactly `start` and `start+20s`;
- second ready creates exactly `now+3s` and `+75s`;
- exact deadline instants are accepted; one instant later expires;
- replay lookup precedes expiry rejection;
- stale response generation cannot overwrite newer state;
- client clock cannot change any server decision;
- mode catalog copy identifies first-ready origin.

### 15.2 Deterministic real PostgreSQL

- zero-ready expiry → `invitation_timeout`, zero rating events;
- first ready at invitation boundary succeeds;
- first ready after boundary fails/voids;
- one-ready expiry → `ready_timeout`, zero rating events;
- second ready at ready boundary succeeds;
- second ready after boundary fails/voids;
- simultaneous ready calls create one first-ready window and one countdown;
- lock contention/retry stays within one 24-second ledger;
- response-loss replay after expiry confirms the original operation;
- ready versus cancel and ready versus worker races commit one terminal/active truth;
- two reconcilers plus generation change cannot revive obsolete completion;
- v1 pending rows retain old semantics and are not extended;
- Standard activity/rating remains untouched;
- adversarial subset passes at least ten consecutive clean-schema runs.

Use barriers and an injectable database test clock to shape 8–19-second logical delay without sleeping real time.

### 15.3 Web/production-shaped

- actual ready/guess/forfeit API functions receive 26-second timeout;
- server action and browser envelopes are behaviorally bound to 30/35 seconds;
- pending mutation reaches uncertain at 8 seconds while original POST remains single-flight;
- recovery GET handles 8–19-second response and correlates exact ready operation;
- dropped response never causes automatic POST replay;
- manual retry reuses the same ID only after authoritative safe conditions;
- single-flight polling prevents overlapping reads;
- invitation versus opponent-ready copy/countdowns are truthful and accessible;
- reconnect/countdown/gameplay route identity remains stable.

### 15.4 Hosted acceptance

Under authorized preview-only smoke:

- two isolated users pair once;
- dispatch two ready operations behind one barrier;
- both commit successfully and converge on one 3-second countdown;
- no `ready_deadline_passed` caused by join response latency;
- timestamps prove first-ready-origin 20-second semantics;
- reconnect, controlled terminal path, exactly-once rating/read convergence, Standard isolation, readiness, browser accessibility, and spoiler safety pass;
- cleanup uses product APIs/natural expiry only;
- no provider configuration or dictionary mutation.

## 16. Approval required

Ashar approval requested:

```text
Approve Speed ready lifecycle v2:
- 90-second invitation/delivery expiry from match creation;
- existing 20-second ready window starts on the first valid server-committed ready acknowledgement;
- existing 3-second countdown, 75-second round, and 100ms equal-guess bucket remain unchanged;
- local implementation may proceed behind the existing fail-closed Speed gate;
- this does not authorize hosted deployment or hosted data/provider mutation.
```

Until approved:

- Ticket 176 is technically complete.
- Tickets 177 and 178 remain blocked from implementing the changed lifecycle semantics.
- No migration, feature activation, deployment, or hosted mutation is authorized.

## 17. Named handoff

### Freya / Ticket 177

- implement v2 schema, legacy classifier, lifecycle state machine, exact boundaries, operation-first replay, and generation-fenced due reconciliation;
- add the shared 24-second Speed mutation ledger and bounded jitter;
- make ready transaction DB-only and short;
- prove simultaneous/delayed behavior with deterministic PostgreSQL tests;
- keep Speed fail closed until migration/readiness is exact.

### Luna / Ticket 178

- implement imported 26/30/35-second mutation budgets and 8-second soft uncertainty;
- add dedicated 12-second/two-attempt recovery reads;
- preserve operation IDs and prohibit automatic mutation replay;
- add exact correlation, stale-response fencing, and single-flight polling;
- render invitation and opponent-ready phases truthfully/accessibly;
- preserve Standard and current gameplay timing.

### Jasmine / Ticket 179

Return PASS/WARN/FAIL against exact boundaries, simultaneous ready, delayed/dropped responses, operation replay/correlation, cancellation/worker races, legacy compatibility, generation fencing, exactly-once no-contest/settlement, Standard isolation, browser accessibility, spoiler safety, and ten repeated clean-schema hostile runs. Ticket 180 remains blocked unless PASS.

## 18. Non-goals

- no change to 20-second opponent-ready duration without a future version;
- no change to 3-second countdown, 75-second round, six guesses, 100ms bucket, adjudication, or rating algorithm;
- no automatic ready/guess/forfeit POST replay;
- no rated no-show penalty in Wave U;
- no Redis requirement;
- no destructive cleanup/backfill of existing Speed rows;
- no provider, deployment, secret, dictionary, or hosted-data mutation in Ticket 176.
