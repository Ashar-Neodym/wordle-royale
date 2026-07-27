# Ticket 214 — Pre-QA Reconciler Architecture and Source Gate — Response

Task: Ticket 214 — Pre-QA Reconciler Architecture and Source Gate
Agent: Elisa (architect/source review)
Verdict: **FAIL — one concrete sanitized-observability blocker remains**
Date: 2026-07-23

## Gate decision

Ticket 213 closes the dependency graph, transaction ownership, shared adjudication/rating, scheduler liveness, backlog, readiness isolation, and raw-leak blockers identified by Ticket 211.

Ticket 214 nevertheless cannot pass because the production reconciler error classifier does not recognize direct PostgreSQL SQLSTATE error shapes for four required allowlisted classes. The permanent test claims every class is covered but exercises those SQLSTATEs only through nested Prisma `meta.code` values.

Ticket 211 remains blocked. Ticket 212 remains blocked. No hosted action is authorized.

## Blocking finding

### B1 — direct PostgreSQL SQLSTATEs are misclassified as `unknown`

**Severity:** Medium operational contract failure; blocking Ticket 214 because the required PASS checklist explicitly includes Ticket 208 §11.1–11.3 allowlisted error classes and permanent coverage.
**Owner:** Freya
**Required scope:** surgical classifier and permanent test correction only.

Production source:

```text
apps/api/src/gameplay/speed-expiry-reconciliation.service.ts:52-70
```

The implementation extracts both:

```ts
code
metaCode
```

but recognizes PostgreSQL SQLSTATEs only as `metaCode`:

```ts
P2034 or metaCode 40001 -> serialization
metaCode 40P01         -> deadlock
metaCode 55P03         -> lock_timeout
metaCode 57014         -> statement_timeout
```

Direct structured errors therefore produce:

```text
40001 -> unknown
40P01 -> unknown
55P03 -> unknown
57014 -> unknown
```

Independent reproduction:

```bash
pnpm exec node --import tsx --input-type=module -e \
"import { classifySpeedReconcilerError as classify } from './src/gameplay/speed-expiry-reconciliation.service.ts'; for (const code of ['40001','40P01','55P03','57014']) console.log(code, classify({ code }));"
```

Actual output:

```text
40001 unknown
40P01 unknown
55P03 unknown
57014 unknown
```

This is not a raw-data leak and does not weaken transaction correctness. It does make required operational diagnosis incomplete and contradicts Ticket 213's claim that every closed class is permanently covered.

### Test gap

Current permanent coverage:

```text
apps/api/test/speed-reconciler-composition-observability.test.ts:91-104
```

It tests:

- direct Prisma codes such as `P1001`, `P2028`, and `P2034`;
- PostgreSQL SQLSTATEs only under `meta.code`;
- unknown fallback.

It does not test direct structured PostgreSQL `code` values, so the suite remains green despite the production gap.

## Required correction

Without inspecting raw messages, SQL, causes, URLs, IDs, or connection data, classify either structured location:

```text
code=40001 or meta.code=40001 -> serialization
code=40P01 or meta.code=40P01 -> deadlock
code=55P03 or meta.code=55P03 -> lock_timeout
code=57014 or meta.code=57014 -> statement_timeout
```

Preserve existing mappings:

```text
P1001|P1002|P1008|P1017 -> connection
P2028                    -> transaction_timeout
P2034                    -> serialization
obsolete internal code   -> obsolete_pass
all other shapes         -> unknown
```

Permanent tests must cover both direct `code` and nested `meta.code` for all four SQLSTATEs, while retaining the poisoned-message/no-raw-leak assertions.

No architecture redesign, migration, new endpoint, new metric name, hosted variable, provider dependency, or deployment change is required.

## PASS evidence retained

### 1. Dependency-minimal production graph — PASS

- `SpeedReconcilerRuntimeModule` contains only Prisma, Speed rating settlement, expiry adjudication/reconciliation, runtime health, and scheduler providers.
- Scheduler injects only `SpeedExpiryReconciliationService` and `SpeedRuntimeHealthService`.
- Reconciliation injects only Prisma and the narrow Speed adjudication service, plus guarded constructor-level test seams.
- The isolated Nest composition test resolves and runs without gameplay persistence, operational readiness, dictionary, activation, capability, Redis, readiness, or HTTP providers.

Evidence:

```text
apps/api/src/gameplay/speed-reconciler-runtime.module.ts:9-24
apps/api/src/gameplay/speed-expiry-reconciler.service.ts:56-59
apps/api/src/gameplay/speed-expiry-reconciliation.service.ts:79-86
apps/api/test/speed-reconciler-composition-observability.test.ts:44-88
```

### 2. Narrow transaction ownership — PASS

Production `reconcileDue()` accepts only:

```text
batchSize
selectionLimit
completionGuard
```

Transaction setup, due SQL, mutation, timeout policy, and pre-commit ownership validation are internally owned. Caller-supplied SQL and reconciliation callbacks are absent. The hostile-race hook is constructor-injected and triple-gated to exact test environments.

Evidence:

```text
apps/api/src/gameplay/speed-expiry-reconciliation.service.ts:20-24,95-167
```

### 3. Shared adjudication and rating semantics — PASS

Worker and request paths use the same `SpeedExpiryAdjudicationService`. Speed rating effects use the same `SpeedRatingSettlementService`; no separate worker rules or stale duplicate settlement algorithm remain.

Evidence:

```text
apps/api/src/gameplay/speed-expiry-reconciliation.service.ts:137-142
apps/api/src/gameplay/speed-gameplay.service.ts
apps/api/src/gameplay/speed-expiry-adjudication.service.ts
apps/api/src/gameplay/speed-rating-settlement.service.ts
apps/api/src/gameplay/gameplay-persistence.service.ts
```

### 4. Budget and backlog contract — PASS

Verified:

```text
interval            1,000ms
batch               10
selection           11
max wait            1,000ms
lock timeout        1,000ms
statement timeout   7,000ms
transaction timeout 8,000ms
pass ownership      10,000ms
success freshness   12,000ms
```

The sentinel row is not mutated. `hasMore=true` remains unavailable/not caught up and schedules bounded immediate catch-up.

### 5. Epoch/generation and autonomous recovery — PASS

- Same-epoch obsolete success and failure schedule exactly one normal-delay retry after settlement.
- No overlap occurs.
- Shutdown and old epochs cannot schedule or establish health.
- Pre-commit ownership loss rolls back the transaction.

Permanent liveness regression passed.

### 6. Standard and readiness isolation — PASS

A Speed-only runtime failure produces:

```text
dependencies.speedRuntime.status = unavailable
top-level status                 = degraded
Standard/core                    = available when their dependencies are healthy
```

No new controller or public/operator mutation route was added.

### 7. Sanitization — PASS except classification completeness

- Raw errors are replaced with fixed `speed_reconciliation_failed`.
- Metrics expose fixed names and allowlisted classes only.
- No SQL, connection string, provider data, answer, guess, match ID, or raw exception message was found in readiness or metrics.
- Transaction and pass duration evidence is implemented.

The sole failure is incomplete recognition of direct SQLSTATE shapes.

## Verification performed

### Focused Ticket 209/211/213 gates

```bash
node --import tsx --test \
  test/speed-reconciler-composition-observability.test.ts \
  test/speed-reconciler-health.test.ts \
  test/speed-reconciler-hosted-latency.acceptance.test.ts \
  test/speed-operational-readiness.test.ts \
  test/speed-operational-paths.test.ts \
  test/readiness-dictionary.test.ts
```

Result:

```text
43/43 passed
```

### API canonical suite

```text
224/224 passed
```

### Hostile PostgreSQL lifecycle races

```text
80/80 passed across ten disposable schemas
all ten schemas dropped by the runner
```

### Build and static gates

```text
API typecheck                         PASS
workspace validation                 PASS — 9 packages
root production build                PASS
compiled operator context smoke      PASS — runtimeWorkersPresent=false
secret scan                          PASS — 289 files
                                      (docs and agent-communication excluded)
git diff --check                     PASS
manual Ticket 214 Markdown scan      recorded after response completion
```

### Independent source reviews

Two isolated reviews inspected the production graph and source boundaries:

- one found the direct-SQLSTATE classifier blocker reproduced above;
- one found no dependency, endpoint, raw-leak, DI, or composition blocker.

The concrete executable classifier failure governs the verdict.

## Required rerun

After Freya's surgical correction:

1. run direct and nested SQLSTATE classifier tests;
2. run the poisoned-message/no-raw-leak test;
3. rerun the full composition/observability file;
4. rerun focused Ticket 209/211 regressions;
5. rerun API typecheck and `git diff --check`;
6. return to Elisa for Ticket 214 source-gate rerun;
7. only after Ticket 214 PASS, unblock Jasmine's Ticket 211 rerun;
8. only after Ticket 211 PASS, unblock Ticket 212.

The 80/80 PostgreSQL matrix and full build need not be repeated for a classifier/test-only patch unless the remediation touches transaction, scheduler, adjudication, persistence, readiness, or build composition code. Jasmine may still require them under Ticket 211's independent QA scope.

## Scope and safety

- No production code patched.
- No hosted system accessed.
- No provider or database configuration changed.
- No deployment, lifecycle transition, activation, queue enablement, push, PR, merge, or release occurred.
- Existing shared dirty-worktree changes were preserved.
