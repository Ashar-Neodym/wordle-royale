# Ticket 210 — Hosted-Safe Reconciler Runtime Implementation

Task: Hosted-Safe Reconciler Runtime Implementation
Agent: Freya (frontend, reconciler runtime remediation)
Status: Complete — permanent RED matrix green, PostgreSQL hostile matrix green, independent architecture/security review PASS

## Scope and authorization

- Local implementation and verification only.
- No Railway/provider query, hosted mutation, deployment, lifecycle transition, commit, push, merge, or PR occurred.
- Existing Ticket 202/208/209 artifacts and unrelated shared-worktree changes were preserved.

## Implementation

### Centralized immutable budget

Added `speed-reconciler-budget.ts` with the exact Ticket 208 constants and executable invariants:

- runtime identity `speed_reconciler_runtime_v2_dependency_minimal_10s`;
- interval 1,000 ms;
- batch size 10;
- selection limit 11;
- transaction acquisition 1,000 ms;
- lock timeout 1,000 ms;
- statement timeout 7,000 ms;
- transaction timeout 8,000 ms;
- pass ownership 10,000 ms;
- readiness freshness 12,000 ms;
- pass reserve 1,000 ms.

### Dependency-minimal persistence path

Added `SpeedExpiryReconciliationService` and removed product-readiness probing from persisted expiry reconciliation.

Each pass now:

1. opens one Serializable transaction with exact finite acquisition/transaction limits;
2. applies transaction-local lock, statement, and idle-in-transaction timeouts;
3. uses the existing authoritative PostgreSQL clock semantics;
4. selects at most 11 due rows with strict ordering and `FOR UPDATE OF match SKIP LOCKED`;
5. mutates only the first 10 rows;
6. invokes the generation/epoch completion guard immediately before commit;
7. returns `{ selected, processed, hasMore }`.

The narrow deterministic hostile-race timeout seam remains gated by the full local test tuple; production receives the exact 8-second transaction limit.

### Self-scheduling worker and caught-up readiness

Replaced `setInterval` with completion-driven `setTimeout` scheduling:

- backlog (`hasMore:true`) schedules immediate catch-up;
- caught-up success schedules the normal one-second interval;
- current-epoch failure schedules bounded retry after one second;
- one unresolved pass suppresses overlap;
- shutdown clears timers and pending demand;
- epoch/generation fencing rejects stale success and failure symmetrically;
- readiness is established only by a fresh, current-epoch, in-budget caught-up success;
- backlog, failure, obsolete completion, over-budget work, shutdown, and stale freshness fail readiness closed.

Independent review initially found restart liveness could strand a new epoch behind unresolved old work. The worker now records `pendingTickEpoch`; once obsolete work settles, it fulfills only the separately queued current-epoch demand with a zero-delay pass. The follow-up review reproduced automatic recovery and returned PASS.

Metrics now expose pass starts, caught-up/backlog/failure classes, skipped overlaps, immediate catch-ups, obsolete completions, processed rows, duration, backlog state, and health identity.

### Real compiled operator isolation regression

- API build now compiles `scripts/**/*.ts`.
- Added a read-only `--context-smoke` path to the compiled lifecycle operator.
- The smoke boots `SpeedLifecycleOperatorModule`, verifies runtime workers are absent, strictly resolves the operator service, closes the context, and emits:

```json
{"result":"PASS","mode":"context-smoke","runtimeWorkersPresent":false}
```

This exercises the actual built CLI/module selection, not only a mocked provider or direct class test.

## Hostile coverage

- Permanent Ticket 209 hosted-latency matrix: all 15 cases green.
- Automatic restart recovery without manual tick.
- Automatic 61-row catch-up in seven non-overlapping generations.
- Real PostgreSQL 11-row sentinel proof:
  - first pass selects 11 and mutates exactly 10;
  - one row remains unadjudicated;
  - second pass selects/processes the remaining one;
  - no duplicate terminalization or rating side effects.
- Pre-commit epoch change rolls the transaction back.
- Exact boundary, two-worker, cancellation, ready/worker, replay, timing, and settlement races remain green.

## Files changed

- `apps/api/package.json`
- `apps/api/tsconfig.build.json`
- `apps/api/scripts/speed-lifecycle-operator.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/gameplay/speed-reconciler-budget.ts` (new)
- `apps/api/src/gameplay/speed-expiry-reconciliation.service.ts` (new)
- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts`
- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/src/gameplay/speed-runtime-health.service.ts`
- `apps/api/test/speed-lifecycle-races-postgres.integration.test.ts`
- `apps/api/test/speed-operational-paths.test.ts`
- `apps/api/test/speed-reconciler-health.test.ts`
- `agent-communication/responses/ticket-210-freya-hosted-safe-reconciler-runtime-implementation-response.md` (new)
- `agent-communication/index.md`

## Verification evidence

### Focused and review

- Focused reconciler/operational matrix: 33/33 PASS.
- Permanent Ticket 209 matrix: 15/15 PASS.
- Independent initial review: FAIL on restart liveness; blocker fixed and regression added.
- Independent follow-up review: PASS; no concrete blocker remains.
- Compiled operator context smoke: PASS.

### PostgreSQL

- Hostile lifecycle races: 80/80 across 10 clean schemas.
- Operator proof/transition: 50/50 across 10 clean schemas.
- Lifecycle activation: 60/60 across 10 clean schemas.
- Schema readiness: 8/8.
- Deterministic timing: 7/7.
- Speed gameplay: 5/5.
- Final attributable disposable schemas: 0.
- Final PostgreSQL advisory locks: 0.

### Canonical gates

- API: 217/217 PASS.
- Contracts: 24/24 PASS.
- Prisma validate/generate: PASS.
- API typecheck: PASS.
- Workspace validation: PASS (9 packages).
- Root production build: PASS.
- Production startup smoke: `/readyz status=ok`.
- Secret scan: PASS (285 source/config files).
- `git diff --check`: PASS.

## Browser/visual and accessibility

- Not applicable; no rendered UI changed.

## Risks and follow-ups

- Ticket 211 must independently rerun the hosted-latency, PostgreSQL, scheduler-liveness, compiled-CLI, canonical, and residue gates.
- Ticket 212 remains blocked on Ticket 211 PASS and remains approval-gated for any checkpoint PR/deployment action.
- Local PostgreSQL and Redis remain running for Ticket 211 reuse.
- No hosted readiness claim is made by this local implementation ticket.
