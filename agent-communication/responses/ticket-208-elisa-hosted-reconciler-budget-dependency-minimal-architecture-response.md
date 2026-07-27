# Ticket 208 — Hosted Reconciler Budget and Dependency-Minimal Architecture — Response

Task: Ticket 208 — Hosted Reconciler Budget and Dependency-Minimal Architecture
Agent: Elisa (architect)
Status: Complete — architecture and downstream contracts delivered; no hosted action authorized
Date: 2026-07-23

## Design outputs

Primary contract:

- `docs/2026-07-23-hosted-reconciler-budget-dependency-minimal-architecture.md`

The contract covers:

- measured hosted failure and current call graph;
- dependency-minimal worker boundary;
- fixed scheduler and transaction budgets;
- self-scheduling, non-overlapping pass lifecycle;
- empty-queue, due-work, backlog, timeout, restart, and stale-completion behavior;
- deterministic passive expiry-lateness formulas;
- local PostgreSQL safeguards;
- readiness, metrics, security, rollout, rollback, and hosted verification;
- reconciled handoffs for Tickets 209–212.

## Root cause

Ticket 202 proved the Railway fleet and database dependencies were healthy but observed approximately `4,400ms` in the current reconciler dependency path.

The implementation permits only:

```text
Prisma transaction timeout = 1,000ms
scheduler pass ownership    = 2,000ms
```

Every pass currently performs database, application-schema, lifecycle-schema, and dictionary readiness checks before opening the expiry transaction. Those checks are product-readiness dependencies, not expiry-settlement dependencies.

The worker therefore cannot establish a valid hosted success even when the system is otherwise healthy.

## Decisions

### Runtime identity

```text
speed_reconciler_runtime_v2_dependency_minimal_10s
```

This does not change the public Speed ruleset, rating identity, ready-lifecycle identity, or activation protocol.

### Fixed budgets

| Constant | Value |
|---|---:|
| scheduler interval | `1,000ms` |
| mutation batch | `10` |
| selection limit | `11` |
| transaction max wait | `1,000ms` |
| PostgreSQL lock timeout | `1,000ms` |
| PostgreSQL statement timeout | `7,000ms` |
| Prisma transaction timeout | `8,000ms` |
| pass ownership | `10,000ms` |
| success freshness | `12,000ms` |
| pass reserve | `1,000ms` |

The `10,000ms` pass budget leaves `5,600ms` over the measured `4,400ms` path. Transaction acquisition plus lifetime is bounded at `9,000ms`, leaving a `1,000ms` ownership reserve.

### Dependency-minimal pass

The pass may depend only on PostgreSQL, persisted Speed match/round/participant state, existing rating/event finalization, scheduler ownership, and monotonic local health time.

It must not call:

- operational/product readiness;
- separate database/schema probes;
- dictionary readiness;
- activation authority;
- capability leases;
- Railway inventory;
- Redis;
- HTTP or another service.

Product readiness remains comprehensive and fail-closed outside the pass.

### Scheduler

Replace `setInterval()` with one self-scheduling timeout:

- immediate startup pass;
- one pass at a time;
- normal one-second delay after caught-up success or failure;
- zero-delay new-generation catch-up only after a committed `hasMore=true` pass;
- old epochs and late generations cannot establish health.

### Backlog

Select `11`, mutate at most `10`, and treat the eleventh row as a sentinel.

A committed pass with `hasMore=true`:

- counts its useful work;
- remains unavailable/not caught up;
- schedules immediate catch-up;
- cannot establish Speed readiness.

Ticket 209's provisional batch expectation of `25` must be changed to the architecture value `10`.

### Lateness bounds

Caught-up healthy case:

```text
maximum passive expiry lateness = 11,000ms
```

Finite backlog `B`:

```text
1,000ms + ceil(B / 10) * 10,000ms
```

There is deliberately no invented finite bound for unbounded arrivals or repeated database failure. Speed fails closed in that condition.

### Failure behavior

- Current explicit failure clears readiness immediately.
- Hung pass becomes unhealthy after `10,000ms`.
- Previous success becomes stale after `12,000ms`.
- No transaction retry occurs inside a pass.
- A later pass with a new generation performs the retry.
- All ownership loss before commit rolls back the batch.
- No overlapping pass is allowed.

### Standard isolation

A reconciler failure closes Speed queue/catalog availability only. Standard remains available when its own dependencies are healthy. A Speed-only runtime failure must not be represented as a global Standard/core outage.

## Files changed

- `docs/2026-07-23-hosted-reconciler-budget-dependency-minimal-architecture.md`
- `agent-communication/responses/ticket-208-elisa-hosted-reconciler-budget-dependency-minimal-architecture-response.md`
- `agent-communication/tickets/ticket-208-elisa-hosted-reconciler-budget-dependency-minimal-architecture.md`
- `agent-communication/tickets/ticket-209-jasmine-reconciler-hosted-latency-red-acceptance-matrix.md`
- `agent-communication/index.md`

## Commands and inspections

- Read Tickets 208–210 and Wave V board state.
- Read Ticket 202 hosted preflight evidence and Ticket 207 checkpoint evidence.
- Inspected:
  - `speed-expiry-reconciler.service.ts`
  - `speed-runtime-health.service.ts`
  - `speed-gameplay.service.ts`
  - `speed-operational-readiness.service.ts`
  - Prisma readiness checks
  - existing reconciler unit/acceptance tests
- Calculated budget headroom and backlog bounds using code execution.
- Repository verification results are recorded below.

## Verification

```text
# CI=true pnpm typecheck
Workspace scaffold validation passed (9 workspace packages).

# git diff --check
passed with no output

# pnpm secret-scan
Secret scan passed (283 source/config files scanned).

# manual Markdown placeholder/credential-pattern scan
passed after replacing this verification marker; no credential-shaped values found

# node --import tsx --test test/speed-reconciler-hosted-latency.acceptance.test.ts
9 tests: 7 passed, 2 expected RED failures
- current 2,000ms pass budget rejects the modeled 4,400ms hosted path
- current 1,000ms transaction timeout cannot contain the modeled 4,400ms hosted path
```

The focused RED command intentionally exits non-zero. It confirms the present source still reproduces the exact budget blocker that Ticket 208 contracts and Ticket 210 must repair; no production code was changed.

## Implementation handoff

### Ticket 209 — Jasmine

Ready to reconcile the RED matrix to:

- batch `10`;
- selection `11`;
- structured backlog result;
- backlog does not establish readiness;
- dependency-minimal call spies;
- retained `4,400ms` hosted case.

### Ticket 210 — Freya

Remains blocked until Ticket 209 publishes the reconciled RED matrix. Then implement locally only.

### Ticket 211 — Jasmine

Remains blocked on Ticket 210.

### Ticket 212 — Yuna

Remains blocked on Ticket 211 PASS and explicit checkpoint merge/deployment approval.

## Risks and follow-ups

- A larger budget alone is not acceptable; redundant probes must be removed.
- Empty-pass health must remain combined with independent schema/product readiness.
- A full batch must not claim caught-up health.
- The real compiled operator CLI regression discovered after Ticket 202 remains required downstream.
- No schema migration is expected or authorized.

## Hosted state

No implementation, migration, deployment, provider/configuration change, database mutation, activation transition, queue enablement, or gameplay smoke was performed.

Authority remains unchanged. Speed remains closed pending the full downstream gates.
