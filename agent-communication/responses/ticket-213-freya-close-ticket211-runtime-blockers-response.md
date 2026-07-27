# Ticket 213 — Freya Close Ticket 211 Runtime Blockers — Response

**Owner:** Freya
**Status:** Complete
**Date:** 2026-07-23
**Hosted actions:** None

## Result

Ticket 211's two surgical runtime regressions remain closed, and its remaining architecture/source blockers are now closed. The persisted-work scheduler resolves and runs from a dependency-minimal Nest module, caller-supplied SQL/mutation callbacks are absent from the production reconciliation input, request and worker paths share one Speed expiry/adjudication/rating implementation, and runtime observability is fixed-name, bounded, sanitized, and fail-closed.

Independent architecture/security/source review: **PASS** after two review rounds closed a broad rating-persistence graph leak and removed a stale duplicate Speed settlement implementation.

Ticket 214 is ready for the required independent pre-QA source gate. Ticket 212 remains blocked on Ticket 214 PASS and a subsequent Ticket 211 rerun PASS.

## Implementation

### Dependency-minimal production graph

Added `SpeedReconcilerRuntimeModule`. Its persisted-work graph contains only:

- `PrismaService`
- `SpeedRatingSettlementService`
- `SpeedExpiryAdjudicationService`
- `SpeedExpiryReconciliationService`
- `SpeedRuntimeHealthService`
- `SpeedExpiryReconcilerService`

The graph excludes `SpeedGameplayService`, generic `GameplayPersistenceService`, activation/capability/operator/provider services, product readiness, dictionary readiness, Redis, HTTP controllers, and controller facades.

A permanent Nest composition test resolves and runs this module in isolation and proves forbidden providers are absent.

### Narrow reconciliation API and transaction ownership

`SpeedExpiryReconciliationService.reconcileDue()` accepts only:

- fixed `batchSize`
- fixed `selectionLimit`
- `completionGuard`

The service internally owns PostgreSQL timeout setup, due-row selection, match locking/adjudication, and commit-time ownership verification. Production callers cannot inject SQL, arbitrary match mutation callbacks, or test hooks. The hostile pre-commit race seam remains constructor-injected, exact-test-environment-only, and time-bounded.

The fixed Ticket 208 contract remains unchanged:

- pass budget: 10 seconds
- transaction budget: 8 seconds
- acquisition/lock budget: 1 second
- normal interval: 1 second
- select 11 / mutate at most 10
- structured `{ selected, processed, hasMore }`

### Single-source Speed adjudication and rating settlement

Added `SpeedExpiryAdjudicationService` and `SpeedRatingSettlementService`.

- Request-path reconciliation and persisted-worker reconciliation call the same expiry/adjudication service.
- Generic gameplay persistence delegates all Speed rating settlement to the same Speed-only settlement service.
- The prior dead `buildSpeedFinalStandings` and `applySpeed1v1Settlement` implementations were removed from generic persistence.
- Existing error precedence was preserved: algorithm mismatch still returns `ranked_mode_algorithm_mismatch` before adjudication validation.

### Sanitized observability

The worker now publishes the fixed Ticket 208 metrics:

- `speed_reconciler_pass_started_total`
- `speed_reconciler_pass_caught_up_total`
- `speed_reconciler_pass_backlog_total`
- `speed_reconciler_pass_failed_total`
- `speed_reconciler_pass_obsolete_total`
- `speed_reconciler_tick_skipped_overlap_total`
- `speed_reconciler_matches_processed_total`
- `speed_reconciler_immediate_catchup_total`
- `speed_reconciler_pass_duration_ms`
- `speed_reconciler_transaction_duration_ms`
- `speed_reconciler_success_age_ms`
- `speed_reconciler_inflight_age_ms`
- `speed_reconciler_last_processed`
- `speed_reconciler_backlog_observed`

Closed error classes are:

- `connection`
- `serialization`
- `deadlock`
- `transaction_timeout`
- `lock_timeout`
- `statement_timeout`
- `obsolete_pass`
- `unknown`

Classification uses structured allowlisted codes only. Raw SQL, connection strings, provider details, exception messages, and causes are not exposed through metrics or public readiness.

### Readiness semantics

The Ticket 211 surgical readiness fixes remain preserved:

- same-epoch late success/failure autonomously queues recovery after obsolete work settles
- a Speed-only runtime failure yields top-level `degraded`, not core `unavailable`
- direct readiness and real HTTP `/readyz` envelope tests cover this behavior
- Standard remains available while Speed fails closed

## Permanent regressions

Added `apps/api/test/speed-reconciler-composition-observability.test.ts` covering:

1. isolated production Nest graph resolution and execution
2. forbidden provider absence
3. production reconciliation input source boundary
4. every closed error class and unknown fallback
5. transaction/pass duration metrics and fixed metric identities
6. raw SQL/connection/error leakage rejection
7. real HTTP Speed-only degraded readiness

Updated the hostile PostgreSQL race test to use the internal test-only pre-commit seam and assert sanitized `obsolete_pass` classification rather than a raw internal exception string.

## Review findings closed

### Independent review round 1 — FAIL, fixed

The first extracted adjudication service still depended on the 1,367-line generic `GameplayPersistenceService` for rating settlement. `SpeedRatingSettlementService` was extracted, the runtime module was narrowed, and the composition test now explicitly forbids generic gameplay persistence.

### Independent review round 2 — FAIL, fixed

Early Speed delegation temporarily shadowed the established algorithm-mismatch error, and dead duplicate Speed settlement source remained. Error precedence was restored, dead helpers/methods and unreachable branches were removed, and focused rating regressions passed.

### Final independent verdict

**PASS — no concrete architecture, security, DI, source, scheduler, observability, readiness, or settlement blocker remains.**

## Verification

### Focused and canonical

- Focused runtime/readiness/rating: **49/49 passed**
- Reviewer-expanded focused/operator set: **67/67 passed**
- API: **224/224 passed**
- Contracts: **24/24 passed**
- Prisma validate: passed
- Prisma generate: passed
- API typecheck: passed
- Workspace validation: **9 packages passed**
- Secret scan: passed across **289 source/config files**
- `git diff --check`: passed

### PostgreSQL

All suites used attributable disposable schemas and ran sequentially:

- hostile lifecycle races: **80/80 across ten schemas**
- lifecycle operator: **50/50 across ten schemas**
- lifecycle activation: **60/60 across ten schemas**
- schema readiness: **8/8**
- deterministic timing: **7/7**
- Speed gameplay: **5/5**

The extracted settlement path also passed the complete permanent rating-finalization matrix, including Speed win/draw/forfeit/no-contest/idempotency/concurrency/mismatch behavior.

### Production/runtime smoke

- root production build: passed
- production startup: `/readyz status=ok`
- compiled operator context: `runtimeWorkersPresent:false`
- attributable startup schema: dropped
- final advisory locks: zero

## Files added

- `apps/api/src/gameplay/speed-expiry-adjudication.service.ts`
- `apps/api/src/gameplay/speed-rating-settlement.service.ts`
- `apps/api/src/gameplay/speed-reconciler-runtime.module.ts`
- `apps/api/test/speed-reconciler-composition-observability.test.ts`

## Principal files updated

- `apps/api/src/app.module.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/src/gameplay/speed-expiry-reconciliation.service.ts`
- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts`
- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/test/speed-lifecycle-races-postgres.integration.test.ts`

Ticket 211's existing permanent readiness/scheduler adversaries in `speed-reconciler-health.test.ts`, `readiness-dictionary.test.ts`, and `readiness.service.ts` were preserved.

## Safety and scope

No hosted Railway access, hosted database access, provider mutation, deploy, lifecycle transition, activation, commit, push, merge, or PR occurred. Credentials and connection strings remain `[REDACTED]`.
