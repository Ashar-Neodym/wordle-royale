# Ticket 144 — Complete Matchmaking Lifecycle Budget and Retry Contract — Response

Task: Ticket 144 — Complete Matchmaking Lifecycle Budget and Retry Contract
Agent: Elisa (architect)
Status: Complete — architecture/contract only; no code, provider, deployment, or hosted mutation

## Summary

Locked one complete Standard matchmaking request budget covering:

- initial serializable transaction attempts;
- serialization/deadlock retries;
- bounded decorrelated jitter;
- late active-ticket `P2002` recovery;
- per-attempt Prisma `maxWait`/`timeout` clamping;
- API proxy;
- server action;
- browser deadline.

Initial and recovery phases must share one monotonic deadline and one four-attempt ledger. Recovery cannot start a new full retry loop.

## Design output

Created:

- `docs/2026-07-14-complete-matchmaking-lifecycle-budget-retry-contract.md`

## Locked budgets

```text
backend lifecycle cap                 90,000 ms
completion reserve                     1,000 ms
maximum Prisma transaction attempts        4 total
transaction maxWait default/max       5,000 / 10,000 ms
transaction timeout default/max      20,000 / 30,000 ms
minimum clamped maxWait                  250 ms
minimum clamped timeout                1,000 ms
jitter base/cap                           50 / 1,000 ms
API proxy deadline                    95,000 ms
server-action maximum                100,000 ms
browser deadline                     110,000 ms
```

Required ordering:

```text
backend 90s < proxy 95s < server 100s < browser 110s
```

## Attempt/recovery contract

Every Prisma interactive transaction invocation consumes one attempt. Four is the complete request maximum.

Examples:

- initial success -> one attempt;
- two initial serialization failures + success -> three attempts;
- initial serialization failure + recognized ticket `P2002` + successful recovery -> three attempts;
- recognized `P2002` on attempt four -> no recovery transaction; retry exhausted;
- recovery serialization/deadlock retries consume the original remaining attempts and time.

Only a known matchmaking-ticket active/idempotency uniqueness conflict may enter recovery. Unrelated `P2002` errors must not silently become ticket replays.

## Jitter contract

Fixed 10/20ms sleeps are replaced with decorrelated jitter:

```text
base=50ms
upper=min(1,000ms, previousDelay×3)
delay=random integer from 50ms through upper
```

Production uses a runtime random source. Tests inject randomness, monotonic/wall clocks, and sleep so exact delay sequences are deterministic and concurrent sequences can prove lockstep breaking.

## Per-attempt clamping

Before each transaction:

```text
remaining = monotonic deadline - monotonic now
usable = remaining - 1,000ms reserve
maxWait = min(configured maxWait, floor(usable/5))
timeout = min(configured timeout, usable-maxWait)
```

Do not start the attempt unless:

```text
maxWait >= 250ms
timeout >= 1,000ms
maxWait + timeout <= remaining - 1,000ms
attemptsUsed < 4
```

Every invocation retains `isolationLevel='Serializable'`.

## Public errors

All are sanitized HTTP `503` responses:

| Code | Meaning |
|---|---|
| `matchmaking_lifecycle_timeout` | Complete monotonic lifecycle/minimum remaining envelope exhausted. |
| `matchmaking_transaction_timeout` | Prisma interactive transaction expired with `P2028`; no retry. |
| `matchmaking_retry_exhausted` | Four retryable concurrency/recovery attempts consumed while lifecycle time remains. |

No Prisma/PostgreSQL code, SQL, constraint, provider, credential, dictionary-answer, or internal timing detail may reach clients.

## Preserved invariants

The repair must preserve:

- serializable isolation;
- row locks and `SKIP LOCKED`;
- one-active-ticket constraints and idempotency replay;
- exact dictionary locking/revalidation before match creation;
- deterministic match idempotency key;
- self-match prevention;
- complete rollback of partial rating/ticket/audit/match writes;
- server authority and spoiler safety.

Persisted queue timestamps must use a fresh wall clock for each transaction attempt. Since the lifecycle cap is longer than the 60-second queue TTL, a late successful attempt must set `expiresAt=successfulAttemptNow+60s`, not reuse stale request-entry time.

## Worst-case arithmetic

```text
Default attempt envelope = 5,000 + 20,000 = 25,000ms
Four attempts            = 4 × 25,000    = 100,000ms
Maximum jitter           = 150+450+1,000 =   1,600ms
Unconstrained total                        101,600ms
```

The enforced 90,000ms lifecycle cap therefore must clamp/refuse late attempts. All transaction waits, execution, and jitter must finish by 89,000ms, preserving a 1,000ms normalization reserve.

Cross-layer margins:

```text
backend -> proxy:  5,000ms
proxy -> server:   5,000ms
server -> browser: 10,000ms
```

There is no valid `90s + separate recovery loop` path.

## Verification requirements

Ticket 145 must add deterministic coordinator tests proving:

- exact four-attempt exhaustion separately for `P2034`, `40001`, and `40P01`;
- `P2028` is not retried;
- recognized `P2002` recovery shares attempts/deadline;
- late attempt budgets never exceed remaining time;
- jitter is bounded, deterministic under injection, and differs across concurrent sequences;
- stale request-entry wall time cannot produce an expired newly committed ticket;
- real partial writes roll back.

It must also pass the canonical fresh-schema PostgreSQL matchmaking harness **10 consecutive times**.

Ticket 146 must replace regex-only deadline proof with imported/instrumented behavior showing actual join, reconnect, current-ticket, and cancel operations use `95s/100s/110s` boundaries.

## Files changed

Created:

- `docs/2026-07-14-complete-matchmaking-lifecycle-budget-retry-contract.md`
- `agent-communication/responses/ticket-144-elisa-complete-matchmaking-lifecycle-budget-retry-contract-response.md`

No source implementation, configuration, provider, deployment, dictionary, or hosted database was changed by Ticket 144.

## Verification

```text
# date +%F
2026-07-14

# CI=true pnpm typecheck
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).

# git diff --check
<no output; exit 0>

# pnpm secret-scan
$ node scripts/secret-scan.mjs
Secret scan passed (218 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.

# arithmetic validation
Default attempt envelope: 25,000ms
Four attempts + maximum jitter: 101,600ms
Backend lifecycle cap: 90,000ms
All attempts/backoff finish by: 89,000ms
Backend-to-proxy margin: 5,000ms
Proxy-to-server margin: 5,000ms
Server-to-browser margin: 10,000ms
```

`pnpm secret-scan` excludes `docs` and `agent-communication`, where Ticket 144's Markdown artifacts live. The new artifacts were manually kept free of credentials, connection strings, tokens, cookies, and dictionary-answer content.

## Acceptance criteria

| Criterion | Status |
|---|---:|
| One monotonic complete lifecycle deadline | Pass |
| Shared initial/recovery attempt ledger | Pass |
| Bounded testable decorrelated jitter | Pass |
| Per-attempt Prisma clamping formula | Pass |
| Lifecycle/transaction/retry public errors | Pass |
| Serializable/locks/idempotency/revalidation retained | Pass |
| Complete worst-case arithmetic and cross-layer margins | Pass |
| Behaviorally tied test requirements | Pass |
| No code/provider/hosted mutation | Pass |

## Implementation handoff

### Freya / Ticket 145

Implement the shared coordinator, four total attempts, decorrelated jitter, remaining-budget clamping, per-attempt wall time, error precedence, and repeated real-PostgreSQL stability proof.

### Luna / Ticket 146

Bind actual proxy/server/browser call paths to `95s/100s/110s`, replace regex-only proof, and preserve retryable UI/current-ticket reconciliation after ambiguous transport timeouts.

### Jasmine / Ticket 147

Independently verify lifecycle arithmetic, exact retry exhaustion, bounded jitter, rollback, shared recovery ledger, behaviorally tied web deadlines, and at least 10 consecutive clean-schema PostgreSQL passes.

Ticket 140 remains blocked unless Ticket 147 returns PASS.

## Risks / follow-ups

- Hosting must support the 100-second server-action maximum; otherwise all four layers must be lowered together.
- Jitter reduces lockstep but does not replace serializable correctness or idempotency.
- Long requests can outlive queue TTL duration numerically, making fresh per-attempt wall time mandatory.
- No dictionary re-bootstrap is needed or authorized.
