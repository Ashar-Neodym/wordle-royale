# Live Speed / Blitz 1v1 contract — Wave T

Date: 2026-07-14
Owner: Elisa
Ticket: 157 — Live Speed/Blitz 1v1 Contract
Status: approved implementation decision lock; Ashar approved the exact Speed v1 time control on 2026-07-16; no application/provider/deployment mutation

## 1. Executive decision

Wave T should activate `speed_1v1` as the second automatic rated queue by extending the existing durable Postgres matchmaking and gameplay path. It must not be a client-timed variant of Standard.

Locked technical direction:

- Public mode id: `speed_1v1`.
- Public label: **Speed**; explanatory copy may say **75-second Blitz**.
- Approved round clock: **75 seconds**.
- One five-letter puzzle, two players, six accepted guesses maximum, one round.
- Result priority: forfeit override, solve/fail, fewer accepted guesses, then server-authoritative solve-time bucket.
- Equal-guess solve-time precision: **100 ms buckets**; the same bucket is a draw.
- Server-controlled ready gate: 20-second ready window, then a 3-second synchronized countdown.
- `MatchRound.startedAt` is the reveal instant, not queue pairing time.
- `MatchRound.deadlineAt = startedAt + 75 seconds` is persisted once and never extended.
- PostgreSQL clock time is the cross-instance authority. Client timestamps are advisory only.
- Disconnect does not pause the clock or itself cause a forfeit. Explicit forfeit after reveal is a rated loss; failure to become ready before reveal is a no-contest.
- Speed uses a separate queue, ruleset version, rating profile, rating events, leaderboard, profile card, history filter, and result identity.
- Standard remains behaviorally unchanged.
- Redis remains optional; Postgres transactions, row locks, polling, and a durable expiry reconciler are sufficient for this wave.

Ashar explicitly approved `roundTimeSeconds=75`, `readyWindowMs=20_000`, `countdownMs=3_000`, and `solveTimeBucketMs=100` on 2026-07-16. This approval locks the product constants and unblocks Tickets 158 and 159. It does not authorize deployment, hosted feature enablement, or hosted data/provider mutation.

## 2. Current-state findings and required gaps

The repository already contains useful mode preparation:

- Prisma `RankedMode` includes `speed_1v1`.
- `Match`, `RatingProfile`, `LeaderboardSnapshot`, and `MatchmakingTicket` carry a ranked-mode dimension.
- Shared contracts list Speed, while `authoritativeRatingAlgorithmByMode.speed_1v1` is still `null`.
- The web truthfully labels Speed as `Not live yet`.
- Standard has a DB-backed queue, serializable pairing, lifecycle budgeting, and an active rating algorithm.

The current gameplay path is not sufficient for live Speed:

- `ROUND_TIME_MS=120_000` is a global process constant.
- match and round start at match creation; there is no ready/countdown gate.
- no persisted `deadlineAt` exists.
- guess receipt time is supplied by Node wall time rather than a shared DB clock.
- no first-class `guessesUsed`, `solveElapsedMs`, time bucket, terminal reason, or win/loss/draw adjudication fields exist.
- standings currently derive from `finalScore`, which is not the Speed result contract.
- result summaries currently emit `totalValidGuesses=0` and `totalSolveMs=0`.
- completion can be requested through a generic client endpoint; Speed terminalization must instead be server-driven.
- only Standard settlement and read identity are authoritative.

Wave T must close these gaps rather than interpreting existing score totals as Speed truth.

## 3. Product and ruleset contract

### 3.1 Recommended versioned ruleset

```text
mode=speed_1v1
publicLabel=Speed
supportingLabel=75-second Blitz
rulesetVersion=speed_1v1_v1_75s
ratingAlgorithm=glicko_style_internal
ratingAlgorithmConfigVersion=speed_1v1_glicko_v1
players=2
wordLength=5
rounds=1
maxGuesses=6
readyWindowMs=20_000
countdownMs=3_000
roundTimeMs=75_000
solveTimeBucketMs=100
sameGuessTieBreaker=server_solve_time_bucket
bothFailResult=draw
rated=true
```

These values are immutable for a persisted match. A future change to 60 or 90 seconds requires a new `rulesetVersion`; it must not silently reinterpret old matches.

Derived timing, validated independently:

```text
ready window + countdown + round = 20s + 3s + 75s = 98s maximum from pairing to deadline
75,000ms / 100ms = 750 adjudication buckets (indices 0..749 before the inclusive deadline edge)
```

### 3.2 Result ordering

For a valid two-player, post-reveal Speed match, evaluate in this order:

1. **Void/no-contest:** operator void or pre-reveal readiness failure creates no rating event.
2. **Forfeit:** one explicit post-reveal forfeiter loses; the other player is awarded the win.
3. **Solve status:** if exactly one player solved, that player wins.
4. **Guess count:** if both solved, fewer accepted guesses wins.
5. **Solve-time bucket:** if both solved in the same number of guesses, lower `solveTimeBucket` wins.
6. **Draw:** same guess count and same time bucket is a draw.
7. **Both fail:** max-guesses failure and/or deadline timeout by both players is a draw.

Speed does not use `finalScore`, speed bonus, client latency estimate, client timestamp, keyboard timing, partial letter progress, or seat number to decide the result.

### 3.3 Time bucket definition

Persist the precise server-derived elapsed milliseconds for audit, but adjudicate using a coarse fixed bucket:

```ts
solveElapsedMs = clamp(serverReceivedAtMs - startedAtMs, 0, roundTimeMs);
solveTimeBucket = Math.floor(solveElapsedMs / 100);
```

Boundary policy:

- A guess whose authoritative DB receipt instant is `<= deadlineAt` may be accepted.
- A guess whose authoritative DB receipt instant is `> deadlineAt` is rejected with `deadline_passed` and consumes no guess.
- A solve exactly at `deadlineAt` is valid. Its bucket may be `750`; this explicit inclusive-edge bucket is valid even though ordinary pre-deadline buckets are `0..749`.
- Two solves in the same bucket draw after equal guess count, even if their stored exact elapsed values differ.

The 100ms policy avoids claiming millisecond fairness across network and database scheduling while still rewarding materially faster equal-guess solves.

## 4. Match lifecycle and clock authority

### 4.1 Lifecycle

```text
paired/pending
  -> waiting_ready
  -> countdown
  -> in_progress
  -> finalizing
  -> completed

waiting_ready -> no_contest (ready deadline expires)
countdown     -> voided     (operator/system integrity failure only)
in_progress   -> completed  (both terminal, sole forfeit, or deadline reconciliation)
any pre-rated state -> voided (audited operator action)
```

Pairing creates the match and round but does not reveal/start the puzzle clock.

### 4.2 Ready gate

Add an idempotent participant-ready command:

```http
POST /matches/{matchId}/ready
```

Request:

```ts
type MarkSpeedMatchReadyRequest = {
  clientRequestId: string; // UUID
};
```

Rules:

- Caller must be one of exactly two participants.
- Only `speed_1v1` queue-created matches use this path in Wave T.
- Pairing persists `readyDeadlineAt = databaseNow + 20 seconds`.
- Each participant has one nullable `readyAt`; replay returns the current snapshot.
- The transaction locks the match/round and both participant rows.
- When both `readyAt` values exist, exactly one transaction persists:
  - `Match.startedAt = databaseNow + 3 seconds`
  - `MatchRound.startedAt = Match.startedAt`
  - `MatchRound.deadlineAt = Match.startedAt + 75 seconds`
  - state `countdown`
- Replays cannot move these timestamps.
- If `readyDeadlineAt` passes before both participants are ready, the match becomes no-contest/voided and produces zero rating events.
- A no-show before reveal is not an abandonment loss because no puzzle clock began.

No answer, answer hash salt, or answer candidate is returned during readiness/countdown.

### 4.3 Clock source and monotonicity

PostgreSQL time is authoritative because requests may hit different API instances.

For every ready, guess, forfeit, and expiry transition:

1. enter a transaction;
2. lock the affected match, round, and participant rows;
3. acquire `clock_timestamp()` from PostgreSQL;
4. derive an effective event time with `GREATEST(dbNow, round.startedAt, participant.lastServerEventAt)` where fields exist;
5. persist the effective time and use it for all adjudication in that transaction.

Rules:

- Node `Date.now()` and browser time must not decide ranked outcomes.
- Process-monotonic time may bound request execution, but cannot compare players across processes.
- `clientSubmittedAt` may be retained in audit metadata and must never alter receipt, deadline, ordering, or rating.
- Accepted event times for one participant must be non-decreasing.
- `startedAt` and `deadlineAt` are immutable after countdown begins.
- A clock-integrity anomaly that violates persisted ordering fails closed and voids through an audited repair path; it does not guess a winner.

### 4.4 Deadline reconciliation

Speed matches must complete without relying on either browser staying connected.

Use both:

- request-path reconciliation on state reads, guess submission, ready, forfeit, and result reads;
- a long-running API reconciler, every approximately one second, claiming due rounds in bounded batches with `FOR UPDATE SKIP LOCKED`.

For a due active round:

1. lock match/round/participants;
2. re-read DB time and persisted deadline;
3. if already adjudicated, return existing result;
4. mark non-terminal participants `timed_out`;
5. compute the immutable Speed adjudication;
6. persist participant results and match completion;
7. hand off exactly once to rating settlement.

The reconciler is safe across multiple API instances. It must expose lag/count/error metrics. It does not require Redis.

## 5. Guess, terminal, disconnect, and forfeit semantics

### 5.1 Guess acceptance transaction

`POST /matches/{matchId}/rounds/{roundId}/guesses` remains the write path, with these Speed requirements:

- authenticate participant from server session;
- lock round and participant;
- obtain authoritative DB receipt time before validation/adjudication;
- reject before `startedAt` with `round_not_active`;
- reconcile and reject after `deadlineAt` with `deadline_passed`;
- enforce one logical result per `clientRequestId`;
- reject a reused idempotency key with different payload as `idempotency_key_conflict`;
- count only accepted dictionary-valid guesses;
- prevent concurrent submissions from creating the same attempt number;
- persist exact `submittedAt`, `attemptNumber`, feedback, and server-validation/ruleset identity;
- on solve, persist `guessesUsed`, `solveElapsedMs`, `solveTimeBucket`, `terminalAt`, and terminal reason in the same transaction;
- on sixth non-solve, persist max-guesses failure in the same transaction;
- after terminalization, attempt match adjudication under the same locked state.

Invalid/banned/wrong-length/deadline/countdown requests consume no attempt.

### 5.2 Disconnect and reconnect

- Transport loss never pauses or extends a Speed deadline.
- Transport loss alone is not a forfeit; browser/network connectivity is not sufficiently reliable evidence.
- A player may reconnect until the fixed deadline.
- `GET /matches/{matchId}/state` returns authoritative server time, reveal/deadline timestamps, ready state, own accepted guesses, and the persisted terminal/result state.
- After deadline, a reconnect receives the already-completed or request-path-reconciled result.
- Before reveal, failure to reconnect/ready by `readyDeadlineAt` is a no-contest.

### 5.3 Explicit forfeit

Add:

```http
POST /matches/{matchId}/forfeit
```

Request:

```ts
type ForfeitSpeedMatchRequest = {
  clientRequestId: string;
};
```

Rules:

- Before reveal: treat as withdrawal/no-contest, not a rated loss.
- At or after reveal and before terminalization: caller becomes `forfeited`, caller loses, opponent receives an awarded win, and the match terminalizes exactly once.
- Replay returns the same result.
- After completion, return the existing result without mutation.
- A solved/failed/timed-out participant cannot later forfeit.
- Concurrent guess/forfeit and forfeit/expiry races serialize on the match/round lock; the first valid committed terminal transition wins.
- A double-abandon integrity case with no unique committed first transition must be voided/no-rated rather than decided by seat order. Normal serialized explicit requests produce a single forfeiter and a deterministic awarded winner.

## 6. Persistence contract

### 6.1 Required first-class fields

Do not hide authoritative Speed timing only inside free-form JSON.

Recommended additions:

```text
Match
- rulesetVersion String?
- readyDeadlineAt DateTime?
- adjudicatedAt DateTime?
- completionReason String? or enum

MatchRound
- startedAt DateTime?       // existing; for Speed means reveal instant
- deadlineAt DateTime?      // new, immutable after start

MatchParticipant
- readyAt DateTime?
- lastServerEventAt DateTime?
- terminalAt DateTime?
- terminalReason enum/string?
- guessesUsed Int?
- solveElapsedMs Int?
- solveTimeBucket Int?
- result win|loss|draw|void nullable
```

If enums are added, prefer reusable values:

```text
terminalReason = solved|max_guesses|deadline_timeout|forfeit|awarded_forfeit_win|no_contest|operator_void
result = win|loss|draw|void
completionReason = all_players_terminal|deadline|forfeit|ready_timeout|operator_void
```

Constraints/checks:

- Speed `deadlineAt > startedAt` and difference equals the versioned 75-second control.
- `solveElapsedMs` and `solveTimeBucket` are present only for solved participants.
- `guessesUsed` is `1..6` for solves/max-guesses terminal states.
- exactly two participants for `speed_1v1`.
- completed rated Speed match has exactly one adjudication and either two rating apply events or zero when void.
- participant `result` pair must be `(win,loss)`, `(draw,draw)`, or `(void,void)`.

Prisma cannot express all check/partial constraints. Use reviewed raw SQL where necessary and retain service-level validation.

### 6.2 Immutable adjudication record

Rating and reads must consume persisted participant result/timing fields, not recompute from mutable score rows. Persist:

```ts
type SpeedAdjudicationV1 = {
  version: 'speed_1v1_adjudication_v1';
  rulesetVersion: 'speed_1v1_v1_75s';
  matchId: string;
  reason: 'all_players_terminal' | 'deadline' | 'forfeit' | 'ready_timeout' | 'operator_void';
  winnerUserId: string | null;
  loserUserId: string | null;
  draw: boolean;
  rated: boolean;
  participants: Array<{
    userId: string;
    result: 'win' | 'loss' | 'draw' | 'void';
    terminalReason: string;
    guessesUsed: number | null;
    solveElapsedMs: number | null;
    solveTimeBucket: number | null;
  }>;
  adjudicatedAt: string;
};
```

It may also be copied into an audit/report JSON snapshot, but the first-class columns remain authoritative.

## 7. Matchmaking contract

### 7.1 Endpoints

Use a parallel mode-explicit surface:

```http
POST   /matchmaking/speed-1v1/tickets
GET    /matchmaking/speed-1v1/tickets/current
GET    /matchmaking/speed-1v1/tickets/{ticketId}
DELETE /matchmaking/speed-1v1/tickets/{ticketId}
```

Request:

```ts
type CreateSpeed1v1TicketRequest = {
  clientRequestId: string;
  mode: 'speed_1v1';
  rated: true;
  allowProvisionalOpponent?: boolean; // default true
};
```

The response should share the existing ticket shape while preserving the literal mode:

```ts
type Speed1v1TicketDto = MatchmakingTicketBase & {
  mode: 'speed_1v1';
  rated: true;
  matchedMatchId: string | null;
};
```

Refactor contracts to a discriminated union/base rather than copying Standard fields and allowing `rankedModeSchema` in a supposedly Standard request. Each route must validate its own literal mode.

### 7.2 Pairing rules

Reuse Standard's proven DB/lifecycle guarantees:

- same-mode pairing only;
- same authoritative rating config only;
- queue TTL 60 seconds;
- windows `±100`, `±200`, `±300`, `±400` at 0/10/20/30 seconds;
- deterministic candidate ordering;
- active/non-suspended mode rating required;
- provisional preference/filter;
- 12-hour same-mode repeat-opponent cooldown, relaxable after 30 seconds only when no alternative exists;
- `Serializable`, row locks, `FOR UPDATE SKIP LOCKED`, bounded lifecycle/retry budget, and jitter;
- deterministic match idempotency key `matchmaking:speed_1v1:{minTicketId}:{maxTicketId}`;
- one dictionary selection/revalidation inside the transaction;
- no self-match, duplicate match, orphan participant, or partial ticket transition.

Speed candidates must never be found by a query hard-coded to `standard_1v1`; mode, rating identity, idempotency prefix, ruleset, and match creation must be parameterized together.

### 7.3 Cross-mode player isolation

A user must not enter Standard and Speed automatic queues/matches simultaneously.

Implementation rule:

1. lock the caller `UserAccount` row before join lifecycle state checks;
2. reject/return the existing active automatic queue ticket in any live ranked mode;
3. reject queue entry while the user participates in a pending/active ranked match;
4. when pairing, lock both user rows in stable user-id order;
5. recheck active queues/matches before match creation;
6. transition matched tickets to an internal `consumed` state when the match ready flow begins or terminalizes, while public historical DTOs remain stable.

Add a partial unique queued-ticket index on `userId` if migration review confirms compatibility. Application and transaction rechecks remain required because uniqueness alone cannot cover active match participation.

Stable error: `ranked_activity_conflict` with HTTP `409` and spoiler-safe details identifying only the public mode/state needed by the caller.

## 8. API/read contracts

### 8.1 Speed state snapshot

Extend the current state DTO with mode/ruleset/time authority:

```ts
type SpeedMatchSnapshot = {
  matchId: string;
  mode: 'speed_1v1';
  rulesetVersion: 'speed_1v1_v1_75s';
  state: 'waiting_ready' | 'countdown' | 'in_progress' | 'finalizing' | 'completed' | 'voided';
  serverTime: string;
  readyDeadlineAt: string;
  startsAt: string | null;
  deadlineAt: string | null;
  timeControl: {
    roundTimeMs: 75_000;
    solveTimeBucketMs: 100;
    maxGuesses: 6;
  };
  readiness: {
    viewerReady: boolean;
    readyCount: 0 | 1 | 2;
  };
  myState: {
    acceptedGuesses: Array<spoilerSafeGuess>;
    terminalReason: string | null;
    guessesUsed: number | null;
    solveElapsedMs: number | null;
    result: 'win' | 'loss' | 'draw' | 'void' | null;
  };
  opponentProgress: {
    acceptedGuessCount: number;
    terminal: boolean;
  };
};
```

Do not expose opponent guess words/feedback, answer/hash/salt, exact opponent solve time before completion, or rating delta before settlement.

### 8.2 Stable errors

| Code | HTTP/shape | Meaning |
|---|---:|---|
| `speed_1v1_queue_disabled` | 503 | Approval/flag/dependency not ready. |
| `unsupported_matchmaking_mode` | 400 | Route/body mode mismatch. |
| `rated_required` | 400 | Speed automatic queue is rated only. |
| `ranked_activity_conflict` | 409 | User already queued/in an active ranked match. |
| `speed_match_not_ready` | 409 | Action requires both-ready countdown/start. |
| `ready_deadline_passed` | 409 | Match became pre-reveal no-contest. |
| `round_not_active` | rejected guess | Guess before reveal or after terminal state. |
| `deadline_passed` | rejected guess | Server receipt was after deadline; no attempt consumed. |
| `idempotency_key_conflict` | 409 | Same request id with different payload. |
| `participant_terminal` | 409 | New mutation after participant terminalization. |
| `speed_ruleset_mismatch` | 409/500 | Persisted version cannot be safely interpreted. |
| `speed_settlement_unavailable` | 503 | Exact authoritative rating config unavailable. |

Never pass Prisma/provider messages to clients.

### 8.3 Mode catalog and readiness

`GET /ranked/modes` is the UI truth source. Speed is live only when all of these are true:

```text
enabled=true
queueEnabled=true
rulesetVersion=speed_1v1_v1_75s
timeControl.roundTimeSeconds=75
timeControl.tieBreaker=server_solve_time_bucket
ratingAlgorithmConfigVersion=speed_1v1_glicko_v1
```

Add readiness dependency:

```text
speed1v1=not_checked_stub  flag disabled
speed1v1=ok                migration + dictionary + ruleset + rating + reconciler ready
speed1v1=unavailable       flag enabled but any required dependency fails
```

Production/preview fails closed: the route must not advertise or accept Speed when readiness is unavailable.

Feature gate:

```text
SPEED_1V1_QUEUE_ENABLED=false by default
```

Do not make the time control a freely tunable environment variable. Version it in code/config so all API instances adjudicate identically.

## 9. Rating and read-model isolation

### 9.1 Identity

Lock:

```text
mode=speed_1v1
algorithm=glicko_style_internal
algorithmConfigVersion=speed_1v1_glicko_v1
startingRating=1500
startingRatingDeviation=350
provisionalGames=10
```

Ruby may reuse the reviewed Standard Glicko-style calculation mechanics, caps, and RD behavior, but the mode/config identity and rows must remain separate.

### 9.2 Exactly-once settlement

- Consume immutable `SpeedAdjudicationV1`, never `finalScore` ordering.
- One `apply` event per participant for a rated non-void match.
- Idempotency key includes match id, `speed_1v1_glicko_v1`, participant/profile id, and event type.
- Repeated completion/result/reconciler calls return the same events and summary.
- A void/no-contest writes zero apply events.
- Forfeit maps to actual scores `0/1`; draw maps `0.5/0.5`.
- Speed events update only the exact Speed profile row.
- Standard profiles/events/snapshots are never read or updated during Speed settlement.

### 9.3 Read model truth

Required reads:

```http
GET /leaderboard?mode=speed_1v1
GET /profiles/{handle}/ratings
GET /profiles/{handle}/ratings/speed_1v1/history
GET /profiles/{handle}/matches?mode=speed_1v1
GET /matches/{matchId}/result
```

All must filter exact mode and authoritative config. Prepared/legacy `speed_1v1` rows with `placement_mmr_v1`, null, or another version do not become live truth. Preserve them for audit but exclude them from active reads.

Result/history must expose, after completion:

- mode and ruleset;
- completion reason;
- result win/loss/draw/void;
- terminal reason;
- accepted guesses used;
- exact server solve duration for solved players;
- rating before/after/delta;
- rating algorithm/config version.

Share text remains spoiler-safe.

## 10. Web countdown and reconnect contract

### 10.1 Display clock

The browser never decrements an authoritative game clock. It renders an estimate from a server anchor:

```ts
anchor = { serverEpochMs: Date.parse(snapshot.serverTime), localMonoMs: performance.now() };
estimatedServerNow = anchor.serverEpochMs + (performance.now() - anchor.localMonoMs);
remainingMs = max(0, Date.parse(snapshot.deadlineAt) - estimatedServerNow);
```

Refresh the anchor from each snapshot. Correct displayed drift rather than extending the deadline. Browser wall-clock changes must not affect the anchored countdown.

At displayed zero:

- disable new local submissions;
- keep an in-flight request unresolved until the server answers;
- immediately fetch state/result;
- never locally declare winner, loser, draw, or timeout.

### 10.2 UX states

Speed needs distinct state and storage keys from Standard:

```text
idle -> joining -> queued -> matched -> waiting_ready -> countdown -> playing
playing -> reconnecting -> playing/completed
waiting_ready -> no_contest
playing -> completed/forfeited/timed_out
```

Requirements:

- show **75 seconds** before queue submission;
- separate Speed search/cancel/current endpoints and idempotency key;
- clear ready action and 3-second countdown;
- visible seconds, with tenths allowed below 10 seconds;
- accessible non-color-only urgency;
- `aria-live` announcements at meaningful thresholds such as 30, 10, 5, and 0 seconds, not every tick;
- refresh/reconnect restores persisted ready/start/deadline/result state;
- latency copy explains that server receipt determines acceptance;
- no duplicate mutation when browser timeout/retry occurs;
- Standard remains live and unchanged;
- Classic and Multiplayer remain `Not live yet`.

## 11. Migration and compatibility

### 11.1 Expand-only migration

1. Add nullable timing/readiness/adjudication fields.
2. Add reusable enums/checks where safe.
3. Add indexes for due active Speed rounds and exact Speed profile/read queries.
4. Add cross-mode active queue protection after checking existing rows.
5. Deploy code that can read nullable fields while Speed remains disabled.
6. Run fresh-schema and existing-data migration tests.
7. Enable Speed only after Tickets 158–161 pass and Ashar separately approves any hosted rollout.

Existing Standard rows keep null new fields and retain current behavior. Do not rewrite Standard timestamps, ruleset, ratings, events, tickets, or reports.

### 11.2 Rollback

Emergency rollback is feature-flag first:

- set Speed queue disabled;
- stop advertising it as live;
- allow already-started Speed matches to finish/reconcile if the compatible code remains running;
- preserve all Speed tickets, matches, timings, reports, and rating events;
- do not reinterpret Speed as Standard;
- do not drop columns/enums after hosted writes without export and explicit destructive approval.

## 12. Verification strategy

### 12.1 Contract/unit

- route-specific mode literals reject Standard/Classic on Speed route;
- result ordering table, including both-fail draw;
- 100ms bucket boundaries and inclusive deadline solve;
- client timestamps do not affect outcome;
- ruleset version mismatch fails closed;
- browser monotonic-anchor countdown handles wall-clock jumps;
- mode catalog/readiness does not advertise disabled/unready Speed.

### 12.2 Real PostgreSQL integration

- two compatible Speed users receive one match and exactly two participants;
- concurrent joins cannot duplicate/self/orphan pair;
- concurrent Standard/Speed joins for one user produce one active ranked activity;
- both-ready race persists one start/deadline pair;
- ready timeout produces no-contest and zero rating events;
- guesses before reveal and after deadline consume zero attempts;
- concurrent guesses preserve unique ordered attempt numbers;
- equal guesses, different buckets choose faster solve;
- equal guesses, same bucket draw;
- fewer guesses beats faster elapsed time;
- one solve vs timeout chooses solver;
- both timeout/max-guesses fail draws;
- guess/expiry and guess/forfeit races commit one deterministic result;
- disconnect/reconnect does not pause or reset deadline;
- reconciler is idempotent across two worker instances;
- completion/retry/result reads produce exactly two apply events once;
- Speed updates only Speed profiles and leaderboard;
- void/no-contest produces zero apply events;
- dictionary rollback and spoiler boundaries remain intact;
- the adversarial concurrency subset passes ten consecutive clean-schema runs.

### 12.3 Standard regression

Canonical Standard queue, gameplay, settlement, profile, leaderboard, history, browser, typecheck, lint, build, migration, and secret-scan gates remain green.

## 13. Handoff

### Freya / Ticket 158

- implement route-literal Speed queue by parameterizing, not duplicating, proven matchmaking mechanics;
- add expand-only timing/readiness/adjudication fields and reviewed constraints;
- implement DB-clock ready/countdown/deadline, guess receipt, forfeit, and reconciliation transactions;
- preserve one shared matchmaking lifecycle/retry budget;
- add real-PostgreSQL race and rollback coverage;
- keep Speed disabled until approval and QA.

### Ruby / Ticket 159

- add `speed_1v1_glicko_v1` as exact authoritative mode identity;
- settle immutable Speed adjudication exactly once;
- activate exact-config Speed profile, leaderboard, history, and result reads;
- exclude prepared/legacy rows from live truth;
- prove Standard/Speed isolation on real PostgreSQL.

### Luna / Ticket 160

- build separate Speed queue/ready/countdown/reconnect UX;
- anchor countdown to `serverTime` plus `performance.now()`;
- bind live state to catalog/readiness, not hard-coded claims;
- expose truthful 75-second and server-receipt copy;
- preserve accessibility and no duplicate mutation behavior;
- keep Classic/Multiplayer unavailable.

### Jasmine / Ticket 161

Return PASS/WARN/FAIL against the complete matrix, including real PostgreSQL races, exact time boundaries, reconnect, deadline worker, settlement/read convergence, Standard regression, spoiler safety, and browser accessibility. Ticket 162 remains blocked unless PASS.

## 14. Approval record and non-goals

Approved by Ashar on 2026-07-16:

```text
Speed v1: 75-second round,
20-second ready window, 3-second countdown,
and 100ms equal-guess solve-time bucket.
```

Approval effect:

- Tickets 158 and 159 are unblocked for local implementation behind the disabled feature flag.
- Tickets 160–164 retain their existing dependency gates.
- Speed remains `Not live yet` and `SPEED_1V1_QUEUE_ENABLED=false` until implementation, independent QA, merge, deployment, and hosted verification gates pass.
- The approval does not authorize hosted deployment, provider changes, secrets, database mutation, or feature enablement.

Non-goals:

- no Speed private rated lobbies;
- no best-of-N rounds;
- no latency/region-based pairing in Wave T;
- no client-authoritative timing/result;
- no partial-progress both-fail tiebreak;
- no Redis requirement;
- no hosted deployment, provider change, secret, dictionary mutation, or feature enablement in Ticket 157.
