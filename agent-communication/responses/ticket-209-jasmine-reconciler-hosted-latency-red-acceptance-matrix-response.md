Task: Ticket 209 — Reconciler Hosted-Latency Red Acceptance Matrix, final Ticket 208 reconciliation
Agent: Jasmine (QA)
Verdict: PASS

## Verdict rationale

Ticket 209 is finalized against the completed Ticket 208 architecture and **only** its fixed constants and contracts. The permanent executable matrix now has **15 cases**:

- **5 passing safety/contract cases** on the current implementation;
- **10 intentional RED target cases** that fail for the exact pre-Ticket-210 reasons.

This is the required QA-first state. Ticket 210 is now unblocked for local implementation. Its acceptance target is to make all 15 cases GREEN without weakening generation fencing, rollback, single-flight behavior, failure closure, fresh-pass-only recovery, bounded batches, Standard isolation, or operator-only CLI composition.

No production implementation was added by Ticket 209.

## Exact Ticket 208 contract locked

The matrix locks these fixed values:

| Contract | Exact value |
|---|---:|
| runtime identity | `speed_reconciler_runtime_v2_dependency_minimal_10s` |
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
| maximum caught-up passive expiry lateness | `11,000ms` |

It also locks:

- `selectionLimit = batchSize + 1`;
- `maxWait + transactionTimeout + passReserve <= maxPass`;
- `lockTimeout <= statementTimeout < transactionTimeout`;
- `successFreshness >= maxPass + interval`;
- finite backlog bound `1,000 + ceil(B / 10) * 10,000ms`;
- no invented finite bound for unbounded arrivals or repeated database failure.

## Acceptance criteria checked

- [x] Exact Ticket 208 constants are encoded as immutable acceptance expectations.
- [x] One production budget module is required; duplicated/ad hoc constants cannot satisfy the matrix.
- [x] The retained `4,400ms` hosted fixture must succeed inside the exact `10,000ms` pass budget.
- [x] Reconciliation must not call product readiness, schema probes, dictionary readiness, activation, provider, Redis, HTTP, or other external dependencies.
- [x] Prisma transaction options are locked to Serializable / `1,000ms` max wait / `8,000ms` timeout.
- [x] PostgreSQL-local lock, statement, and idle-transaction safeguards are required.
- [x] Structured result is locked to `{ selected, processed, hasMore }`.
- [x] Selection `11`, mutation cap `10`, and sentinel backlog semantics are represented.
- [x] `hasMore=true` cannot establish readiness and must count only useful processed work.
- [x] `setInterval` is rejected; the scheduler must self-schedule with the normal `1,000ms` delay after caught-up success/failure.
- [x] Empty queue and due caught-up work establish health only after committed owned completion.
- [x] Transient over-budget work and transaction timeout fail closed; recovery requires a new current-epoch pass.
- [x] Hung work suppresses overlap and late completion remains obsolete.
- [x] Stop/restart epoch fencing remains required.
- [x] Finite backlog drains in bounded 10-row generations without overlap.
- [x] Success is fresh through exactly `12,000ms` and stale immediately afterward.
- [x] Standard remains available while Speed fails closed.
- [x] Existing real PostgreSQL generation-change-before-commit rollback proof is retained.
- [x] Existing real operator CLI composition regression remains green.

## Commands run + exit codes

1. Final focused RED matrix:
   - `pnpm exec node --import tsx --test test/speed-reconciler-hosted-latency.acceptance.test.ts`
   - Inner command exit **1**, expected RED; wrapper verified that exact exit.
   - **15 tests: 5 passed, 10 intentional RED failures, 0 cancelled**.

2. Full API suite with finalized matrix:
   - `pnpm test`
   - Inner command exit **1**, expected RED; wrapper verified that exact exit.
   - **215 tests: 205 passed, 10 intentional RED failures, 0 cancelled**.
   - Every failure came from the finalized Ticket 209 file; no unrelated regression failed.

3. Existing reconciler health + operational readiness:
   - `pnpm exec node --import tsx --test test/speed-reconciler-health.test.ts test/speed-operational-readiness.test.ts`
   - Exit **0**; **12/12 passed**.

4. Operator CLI/module and trusted-provider focused suite:
   - `pnpm test:speed-lifecycle-operator`
   - Exit **0**; **37/37 passed**.
   - The real operator application context resolved the operator service while runtime workers remained absent.

5. Contracts:
   - `pnpm test` in `packages/contracts`
   - Exit **0**; **24/24 passed**.

6. API typecheck:
   - `pnpm typecheck`
   - Exit **0**.

7. Workspace build:
   - `pnpm build`
   - Exit **0** across all build-bearing workspace projects.

8. Security and diff checks:
   - `pnpm secret-scan` — exit **0**, 283 files scanned.
   - `git diff --check` — exit **0**.

9. Retained real PostgreSQL safety proof from Ticket 209's initial phase, with no intervening production change:
   - `pnpm test:postgres:speed-lifecycle-races`
   - Exit **0**; **70/70 passed across ten disposable schemas**.
   - Generation change after eligibility but before commit rolled back expiry state on every iteration.
   - All schemas were dropped by the runner.

## Expected RED evidence

The ten current failures correspond exactly to missing Ticket 210 behavior:

1. centralized `speed-reconciler-budget.ts` and runtime identity do not yet exist;
2. current `2,000ms` pass ownership rejects the `4,400ms` hosted fixture;
3. `reconcileDue()` still invokes product operational readiness;
4. transaction options remain `500ms` max wait / `1,000ms` timeout and local PostgreSQL safeguards are absent;
5. persistence still returns a numeric count instead of the structured result and does not use selection `11`;
6. a sentinel backlog result incorrectly establishes health;
7. scheduler still uses `setInterval(1000)` rather than one self-scheduling timeout;
8. scheduler counters do not understand structured caught-up results;
9. finite 10-row backlog generations are not implemented;
10. current success freshness is `2,000ms`, not `12,000ms`.

These are target failures, not unrelated regressions. Freya must make them GREEN through production implementation rather than weakening or deleting the assertions.

## Permanent artifact

`apps/api/test/speed-reconciler-hosted-latency.acceptance.test.ts`

The test is finalized in the shared worktree. No standalone git commit was created because checkpoint/commit ownership remains separate and the worktree contains intentional multi-agent changes.

## Browser/visual evidence

Not applicable. This is a background scheduler, transaction-budget, and runtime-health acceptance task with no UI criterion.

## Findings

No QA blocker remains for Ticket 209.

The current production implementation is intentionally not compliant yet; that is Ticket 210's scope. The RED matrix now distinguishes target behavior from preserved safety behavior and is implementation-ready.

## Required fixes / owner

- **Freya / Ticket 210:** implement the dependency-minimal reconciler against all 15 permanent cases.
- Do not change the fixed constants, `4,400ms` fixture, structured result, sentinel semantics, arithmetic formulas, or safety expectations without Elisa/Jasmine review.
- Add/retain implementation-level PostgreSQL proof that 11 rows select only 10 mutations and that ownership loss before commit rolls back the full batch.

## Cleanup

- No container or QA server was started during final reconciliation.
- No matching Ticket 209, reconciler, or race-test process remains.
- Prior Ticket 209 PostgreSQL containers, volumes, networks, and disposable schemas had already been removed.
- Shared pre-existing dirty-worktree changes were preserved.

## Residual risks

- Ticket 209 is a RED acceptance deliverable, not proof that Ticket 210 is implemented.
- Unit sentinel mocks do not replace real PostgreSQL selection/mutation-cap and rollback verification; Ticket 210/211 must run those cases against disposable schemas.
- Local QA does not authorize merge, deployment, Railway access, hosted database access, lifecycle transition, queue activation, hosted gameplay smoke, or release.
