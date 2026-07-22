# Ticket 176 — Hosted Speed Ready Lifecycle Contract — Response

Task: Ticket 176 — Hosted Speed Ready Lifecycle Contract
Agent: Elisa (architect)
Status: Complete — technical contract only; user-facing lifecycle approval required
Date: 2026-07-17

## Design output

- `docs/2026-07-17-hosted-speed-ready-lifecycle-contract.md`

## Root decision

The hosted defect is structural: the existing 20-second ready deadline starts during match creation, so 7–18-second queue responses consume most of it before clients can acknowledge readiness. Hosted ready mutations then take another 8–19 seconds.

The contract separates invitation/delivery from the two-player ready phase:

```text
readyLifecycleVersion=speed_ready_v2_first_ack_90s
invitationWindowMs=90_000
readyWindowMs=20_000
countdownMs=3_000
roundTimeMs=75_000
solveTimeBucketMs=100
```

A new match starts with a finite 90-second invitation deadline and **no ready deadline**. The first valid server-committed ready acknowledgement atomically starts the existing 20-second ready window. The second valid ready acknowledgement creates the immutable 3-second reveal countdown and 75-second round deadline.

## Timing rationale

Measured hosted path:

```text
17.760s join + 8.648s read + 18.894s ready = 45.302s
90.000s invitation - 45.302s = 44.698s headroom
90.000 / 45.302 = 1.99x observed path
```

Maximum match-creation-to-round-deadline path:

```text
90s invitation + 20s ready + 3s countdown + 75s round = 188s
```

The competitive clock remains 75 seconds. The 90-second value is only the finite pre-ready delivery/acceptance phase.

## State and timestamp contract

New v2 public waiting states:

```text
waiting_invitation       // zero ready
waiting_opponent_ready   // exactly one ready
countdown
in_progress
finalizing
completed
voided
```

At match creation:

```text
invitationExpiresAt=createdAt+90s
readyWindowStartedAt=null
readyDeadlineAt=null
startsAt=null
deadlineAt=null
```

First ready atomically persists:

```text
participant.readyAt=dbNow
readyWindowStartedAt=dbNow
readyDeadlineAt=dbNow+20s
```

Second ready atomically persists:

```text
participant.readyAt=dbNow
startsAt=dbNow+3s
deadlineAt=startsAt+75s
```

Boundary policy:

```text
command accepted when dbNow <= applicable deadline
expiry terminalized when dbNow > applicable deadline
```

## Lifecycle outcomes

| Condition | Result | Rating writes |
|---|---|---:|
| Zero ready after 90 seconds | `invitation_timeout`, no-contest | 0 |
| One ready after its 20-second deadline | `ready_timeout`, no-contest | 0 |
| Either participant cancels before reveal | `pre_start_cancelled`, no-contest | 0 |
| Both ready | one immutable countdown | Existing rated lifecycle |
| Forfeit at/after reveal | Existing rated forfeit | Existing exactly-once settlement |

Disconnect never pauses or extends a deadline. Reconnect returns persisted phase and timestamps.

## Idempotency and race decisions

- Ready operation lookup occurs before deadline rejection.
- A committed operation whose response was lost remains confirmable after later expiry/completion.
- Snapshot exposes the viewer's own `viewerReadyOperationId` for exact correlation.
- Browser/server action never automatically replays a mutation POST.
- User-approved retry reuses the same operation ID only after authoritative recovery proves it safe.
- Match → round → participants is the lock order.
- Concurrent ready calls create one first-ready window and one countdown.
- Request and generation-fenced worker reconciliation share the same exactly-once transition.

## Backend budgets

```text
backend Speed mutation lifecycle  24_000ms
maximum transaction attempts             3
per-attempt maxWait cap             8_000ms
per-attempt execution cap          12_000ms
completion reserve                  1_000ms
bounded retry jitter                50–250ms
```

One monotonic ledger covers all transaction attempts and jitter. It is not three independent 20-second attempts.

## Web/request budgets

```text
backend lifecycle                  24_000ms
API proxy/fetch timeout            26_000ms
Next server action                 30_000ms
browser operation envelope         35_000ms
soft uncertain threshold            8_000ms
recovery read timeout/attempt      12_000ms
recovery read attempts                     2
recovery retry delay                  250ms
soft start + worst recovery        32_250ms
```

At eight seconds, the browser starts an authoritative recovery GET while the original POST remains single-flight. It does not abort/replay the mutation.

Polling becomes single-flight because current 1.5-second interval requests overlap when hosted reads take 4–9 seconds.

## Persistence/migration

Add nullable `Match` fields:

```text
readyLifecycleVersion
invitationExpiresAt
readyWindowStartedAt
```

Expand completion reasons with:

```text
invitation_timeout
pre_start_cancelled
```

Legacy behavior is explicitly versioned:

```text
speed_ready_v1_match_created_20s
speed_ready_v2_first_ack_90s
```

Existing completed/active rows remain unchanged. Pending v1 rows retain their original deadline and are never extended into new 90-second invitations.

## Preserved contracts

- `speed_1v1_v1_75s` competitive ruleset
- `speed_1v1_glicko_v1` rating identity
- 3-second countdown
- 75-second round
- six guesses
- 100ms solve-time bucket
- PostgreSQL clock authority
- generation-fenced reconciler health
- exactly-once settlement/no-contest
- Standard isolation
- spoiler safety
- Redis optionality

## Implementation handoff

### Freya / Ticket 177

- Add v2 persistence/legacy handling.
- Implement first-ready-origin state machine and exact boundaries.
- Make replay operation-first.
- Bind ready/guess/forfeit to one 24-second backend lifecycle.
- Preserve generation fencing and add deterministic delayed concurrent PostgreSQL tests.

### Luna / Ticket 178

- Bind actual calls to 26/30/35-second budgets.
- Begin read-only recovery at eight seconds.
- Add exact operation correlation and stale-response fencing.
- Replace overlapping polling with single-flight scheduling.
- Render invitation versus opponent-ready states truthfully and accessibly.

### Jasmine / Ticket 179

Verify exact boundaries, simultaneous ready, delayed/dropped responses, replay correlation, cancellation/worker races, v1 compatibility, generation fencing, no-contest/settlement exactly once, Standard isolation, accessibility, spoilers, and ten consecutive hostile clean-schema runs.

## Verification

```text
# date +%F
2026-07-17

# CI=true pnpm typecheck
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).

# git diff --check
Passed with no output.

# pnpm secret-scan
Secret scan passed (250 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

The ticket changes Markdown architecture/workflow artifacts only, so no implementation unit, PostgreSQL, or browser test was added or run. Because the repository scanner excludes `docs` and `agent-communication`, the new Markdown was manually kept free of credentials, connection strings, cookies, provider tokens, dictionary answers, answer hashes, salts, and hosted user identifiers.

## Approval required

Ashar must explicitly approve:

```text
Speed ready lifecycle v2:
- 90-second invitation/delivery expiry from match creation;
- the existing 20-second ready window starts on the first valid server-committed ready acknowledgement;
- 3-second countdown, 75-second round, and 100ms bucket remain unchanged;
- local implementation may proceed behind the fail-closed Speed gate.
```

This product approval would not authorize deployment, hosted feature activation, provider changes, secrets, migration execution, or hosted data mutation.

## Scope confirmation

- No application implementation was performed.
- No migration was created/applied.
- No feature flag or hosted setting was changed.
- No provider, deployment, dictionary, secret, or hosted data mutation occurred.
- Tickets 177 and 178 remain blocked pending approval.
