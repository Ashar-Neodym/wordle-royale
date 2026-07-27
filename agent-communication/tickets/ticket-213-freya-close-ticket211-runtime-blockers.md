# Ticket 213 — Close Ticket 211 Reconciler Liveness, Isolation, Composition, and Observability Blockers

Agent: Freya (backend implementation)
Wave: V-Runtime-Readiness-Fix
Status: Reopened by Ticket 214 — surgical SQLSTATE classifier/test fix required

## Starting evidence

Athena permanently added and locally fixed the two exact Ticket 211 adversaries:

- autonomous same-epoch over-budget success/failure recovery without manual `tick()`;
- top-level core readiness remains `degraded`, not `unavailable`, when only Speed runtime fails.

Focused result after these surgical fixes: 12/12 PASS; API typecheck PASS. Preserve these edits.

## Required remaining implementation

1. Remove `SpeedExpiryReconcilerService -> SpeedGameplayService -> SpeedOperationalReadinessService` from the production provider graph. The scheduler must inject a narrow expiry-reconciliation port/service.
2. The production reconciliation input must expose only fixed batch/selection constants and `completionGuard`; arbitrary authoritative SQL, reconciliation callbacks, and test callbacks must not be production API.
3. Reuse authoritative expiry/adjudication/rating logic through a narrow dependency or shared internal component—do not duplicate gameplay rules.
4. Add a Nest composition test proving the production persisted-work scheduler resolves and runs without operational-readiness, dictionary, activation, capability, provider, Redis, or HTTP providers.
5. Implement Ticket 208 §11.2 sanitized observability: pass and transaction duration, fixed counters/gauges, and allowlisted error classes `connection|serialization|deadlock|transaction_timeout|lock_timeout|statement_timeout|obsolete_pass|unknown`. Never expose raw error text, SQL, IDs, URLs, credentials, answers, or guesses.
6. Add permanent tests for every allowlisted class, unknown fallback, transaction duration, no raw leakage, and source/provider-graph boundary.
7. Preserve 10/11 batching, 1s/8s/10s/12s budgets, self-scheduling, no overlap, epoch/generation fencing, pre-commit rollback, exactly-once settlement, Standard isolation, and compiled operator-only context.

## Mandatory pre-handoff gates

- Permanent Ticket 209 matrix and Athena Ticket 211 regressions.
- Focused runtime/readiness/composition/observability tests.
- PostgreSQL hostile race 80/80 and operator/activation matrices.
- API/contracts/web/build/typecheck/Prisma/security/diff checks.
- No hosted access, provider mutation, deployment, transition, push, PR, or merge.

Do not mark complete if any architecture requirement is deferred. Handoff goes to Ticket 214, not directly to Jasmine.

## Ticket 214 blocker

Production classification recognizes PostgreSQL SQLSTATEs `40001`, `40P01`, `55P03`, and `57014` only through nested `meta.code`. Direct structured `{ code: SQLSTATE }` values fall through to `unknown`, and permanent tests do not cover those direct forms. Fix the classifier without inspecting raw messages and add direct plus nested cases for all four SQLSTATEs, then return to Ticket 214 rerun.
