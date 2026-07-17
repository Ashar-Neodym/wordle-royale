# Ticket 157 — Live Speed/Blitz 1v1 Contract — Response

Task: Ticket 157 — Live Speed/Blitz 1v1 Contract
Agent: Elisa (architect)
Status: Complete — architecture/contract only; Speed v1 time control approved by Ashar on 2026-07-16
Date: 2026-07-14

## Design output

- `docs/2026-07-14-live-speed-blitz-1v1-contract.md`

## Decision summary

The contract defines `speed_1v1` as a true server-authoritative rated mode rather than a client-timed Standard variant.

Approved product lock:

```text
publicLabel=Speed
supportingLabel=75-second Blitz
rulesetVersion=speed_1v1_v1_75s
readyWindowMs=20_000
countdownMs=3_000
roundTimeMs=75_000
solveTimeBucketMs=100
maxGuesses=6
bothFailResult=draw
```

Derived timing:

```text
Maximum pairing-to-round-deadline path = 20s + 3s + 75s = 98s
75,000ms / 100ms = 750 ordinary solve-time buckets
```

## Acceptance mapping

### Exact time-control recommendation

- Recommends **75 seconds**.
- Explains the public presentation as **Speed / 75-second Blitz**.
- Versions the value as `speed_1v1_v1_75s`; future timing changes require a new ruleset.
- Ashar approved the exact value on 2026-07-16; local implementation in Tickets 158 and 159 is unblocked.

### Start/reveal clock origin

- Pairing creates a pending match, not an already-running clock.
- Players have 20 seconds to mark ready.
- Both-ready persists a single 3-second countdown.
- `MatchRound.startedAt` is the reveal instant.
- `deadlineAt = startedAt + 75 seconds` is immutable.
- Ready timeout before reveal is a no-contest with zero rating events.

### Server timestamp and monotonicity

- PostgreSQL `clock_timestamp()` is the cross-instance authority.
- Ready, guess, forfeit, and expiry operations lock rows and persist non-decreasing effective server event times.
- Node/browser wall time cannot adjudicate results.
- `clientSubmittedAt` is audit-only.
- Exact server elapsed time is stored, while equal-guess timing uses fixed 100ms buckets.

### Result ordering and tie precision

Locked ordering:

1. void/no-contest;
2. sole post-reveal forfeit loses;
3. solver beats failure;
4. both solve: fewer accepted guesses wins;
5. equal guesses: lower 100ms server solve-time bucket wins;
6. same bucket draws;
7. both fail draws.

A solve at exactly `deadlineAt` is valid. A receipt after it is rejected without consuming an attempt.

### Timeout, abandon, and reconnect

- The clock never pauses after reveal.
- Disconnect alone is not a forfeit.
- Reconnect restores the persisted start/deadline/result state.
- Explicit post-reveal forfeit is a rated loss.
- Pre-reveal withdrawal/no-ready is a no-contest.
- Request-path reconciliation plus a Postgres `FOR UPDATE SKIP LOCKED` worker completes expired matches without browser presence.

### Queue behavior

- Adds parallel `/matchmaking/speed-1v1/tickets` create/current/read/cancel endpoints.
- Reuses Standard's 60-second TTL, rating-window expansion, serializable transaction, row-lock, idempotency, lifecycle budget, repeat-opponent, dictionary, and spoiler guarantees.
- Mode, profile identity, query filters, idempotency key, ruleset, and match creation must be parameterized together.
- Adds cross-mode protection so one user cannot queue/play Standard and Speed simultaneously.

### Rating isolation

Locks:

```text
mode=speed_1v1
algorithm=glicko_style_internal
algorithmConfigVersion=speed_1v1_glicko_v1
startingRating=1500
startingRatingDeviation=350
provisionalGames=10
```

- Speed settlement consumes immutable adjudication fields, not `finalScore` ordering.
- Exactly one apply event per participant for valid rated results.
- Void/no-contest creates zero apply events.
- Standard rows are never read or updated by Speed settlement.
- Legacy/prepared Speed rows do not override the exact live config.

### Persistence implications

Requires first-class, nullable expand-only fields for:

- ruleset and readiness deadline;
- round deadline;
- participant ready/terminal timestamps;
- terminal reason;
- guesses used;
- solve elapsed milliseconds;
- solve time bucket;
- win/loss/draw/void result;
- immutable adjudication/completion identity.

Existing Standard rows remain unchanged with nullable new fields.

### Web countdown and accessibility

- Client display anchors `snapshot.serverTime` to `performance.now()`.
- Browser wall-clock changes do not alter the countdown.
- At displayed zero, the browser fetches authoritative state and does not declare a result.
- Distinct Speed queue/ready/countdown/reconnect state is required.
- Meaningful accessible announcements occur at 30, 10, 5, and 0 seconds.
- Classic and Multiplayer remain `Not live yet`.

## Implementation handoff

### Freya / Ticket 158

- Parameterize the proven queue lifecycle for literal `speed_1v1`.
- Add expand-only timing/readiness/adjudication fields.
- Implement DB-clock ready/countdown/deadline, guess, forfeit, and reconciliation transactions.
- Add real-PostgreSQL concurrency and rollback coverage.
- Preserve Standard and keep the Speed flag disabled pending approval/QA.

### Ruby / Ticket 159

- Activate exact `speed_1v1_glicko_v1` settlement and read identity.
- Consume immutable Speed adjudication exactly once.
- Implement Speed profile, leaderboard, history, and result reads.
- Prove Standard/Speed isolation and exclusion of prepared rows.

### Luna / Ticket 160

- Build separate live Speed queue, ready, countdown, reconnect, timeout, and result UX.
- Use server-time/monotonic display anchoring.
- Drive live claims from mode catalog/readiness.
- Preserve idempotency and accessibility.

### Jasmine / Ticket 161

Independently verify:

- concurrent pairing and cross-mode exclusion;
- one ready/start/deadline transition;
- exact boundary and 100ms bucket adjudication;
- guess/expiry/forfeit races;
- disconnect/reconnect and no clock reset;
- idempotent reconciler and settlement;
- separate Speed ratings and reads;
- Standard regression and spoiler safety;
- ten consecutive clean-schema adversarial runs;
- production-browser countdown/accessibility.

## Verification

```text
# date +%F
2026-07-16

# CI=true pnpm typecheck
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).

# git diff --check
Passed with no output.

# pnpm secret-scan
Secret scan passed (228 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

The ticket changes Markdown architecture artifacts only, so no implementation unit/integration/browser test was added or run. Because the repository secret scanner excludes `docs` and `agent-communication`, both new Markdown files were manually kept free of credentials, connection strings, dictionary answers, and answer hashes.

## Approval recorded

Ashar explicitly approved on 2026-07-16:

```text
Speed v1 = 75-second round,
20-second ready window,
3-second countdown,
100ms equal-guess time bucket.
```

This approval locks the product contract and unblocks Tickets 158 and 159 for local implementation behind the disabled feature flag. It does not authorize hosted enablement, deployment, provider mutation, secrets, or hosted data mutation.

## Safety / scope confirmation

- No application implementation was performed.
- No migration was generated or applied.
- No Speed feature was enabled.
- No hosted data/provider/deployment mutation occurred.
- No Redis requirement was introduced.
- Standard behavior was not changed.
