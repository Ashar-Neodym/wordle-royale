# Ticket 175 — Adversarial Reconciler Generation-Fence Recheck Response

Task: Ticket 175 — Adversarial Reconciler Generation-Fence Recheck
Agent: Jasmine (QA)
Verdict: **PASS**

Ticket 162 may proceed within its separately authorized checkpoint/PR/CI scope. This PASS does not authorize merge, deployment, provider changes, or hosted database mutation.

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---:|---|
| Initial pass exceeds 2,000 ms and Speed becomes unavailable | PASS | Independent controlled-monotonic-time probe advanced beyond `SPEED_RECONCILER_MAX_PASS_MS`; operational readiness returned `reconciler_unavailable`. |
| Obsolete pass resolves and Speed remains unavailable | PASS | Deferred late success settled after timeout; runtime readiness stayed false and the public Speed catalog stayed disabled. |
| No overlapping pass while obsolete work is unresolved | PASS | An adversarial second `tick()` left the reconciliation call count at one. Canonical service-level coverage passed the same invariant. |
| New pass begins after settlement; only its in-budget success restores availability | PASS | After obsolete settlement, one new pass incremented the call count to two and only that pass restored readiness. |
| Stop/restart creates a new epoch; old success/failure cannot affect it | PASS | Independent deferred-success and deferred-failure restart cases both stayed unavailable after old completion, suppressed overlap, and required a new pass. Canonical generation/epoch tests also passed. |
| Catalog, `/readyz`, and Speed operations fail closed with sanitized errors until valid evidence | PASS | Dynamic probe proved operational readiness and catalog agreement; focused operation suites covered queue join/current/read/cancel plus ready/guess/forfeit/state/reconciliation with stable `speed_1v1_unavailable`. |
| Standard remains unaffected | PASS | Dynamic catalog probe kept `standard_1v1` enabled while Speed was unavailable. |
| Ticket 171/173 regressions, PostgreSQL, build, security, cleanup | PASS | Full/focused API, contracts, web policy, four PostgreSQL suites, workspace build/validation/typechecks, Prisma validation, secret scan, diff check, and cleanup passed. |

## Independent adversarial evidence

A temporary Jasmine-only test used injected monotonic time and deferred promises. It was removed before final gates.

Observed sequence:

1. unresolved initial pass: Speed unavailable;
2. monotonic age advanced beyond 2,000 ms: still unavailable;
3. attempted overlapping tick: no second reconciliation call;
4. obsolete pass resolved: runtime, operational readiness, and catalog remained unavailable;
5. a new in-budget pass ran: readiness became available;
6. separate stop/restart cases resolved an old pass successfully and exceptionally: neither completion satisfied the new epoch;
7. only a new pass restored the restarted scheduler.

Result: **2/2 independent adversarial tests passed**.

## Diff and implementation review

The Ticket 174 implementation now uses:

- a monotonically increasing scheduler epoch;
- a globally increasing pass generation;
- immutable pass identity containing epoch, generation, and monotonic start time;
- exact current-pass identity checks before completion can update health;
- a 2,000 ms completion-age gate for both success and failure;
- service-level single-flight suppression across timeout and restart;
- fail-closed readiness until a fresh, current-epoch, in-budget success.

Late, stopped, timed-out, superseded, and previous-epoch completions are rejected. A rejected completion cannot clear a newer pass, refresh success evidence, or update current error evidence.

## Commands run + exit codes

- Focused reconciler/readiness/operation suites — exit 0, **13/13 passed**.
- Temporary independent generation-fence probe — exit 0, **2/2 passed**; removed afterward.
- `pnpm --filter @wordle-royale/api test` — exit 0, **149/149 passed**; guarded PostgreSQL tests were run separately.
- `pnpm --filter @wordle-royale/contracts test` — exit 0, **24/24 passed**.
- All six web policy/state test files — exit 0, **30/30 passed**.
- Speed PostgreSQL gameplay — exit 0, **5/5 passed**; disposable schema dropped.
- Deterministic Speed PostgreSQL timing — exit 0, **4/4 passed**; disposable schema dropped.
- Speed settlement/read convergence PostgreSQL — exit 0, **2/2 passed**; disposable schema dropped.
- Standard PostgreSQL concurrency — exit 0, **3/3 passed**; disposable schema dropped.
- `pnpm build` — exit 0.
- `pnpm validate:workspace` — exit 0, nine packages.
- API typecheck — exit 0.
- Web typecheck — exit 0.
- Prisma validation — exit 0.
- `pnpm secret-scan` — exit 0, 250 source/config files.
- Final `git diff --check` — exit 0.

Two setup-only invocations were not credited: the first web-test command ran from a directory without `tsx` resolution, and the first Standard PostgreSQL command omitted its required disposable database URL. The corrected commands passed 30/30 and 3/3 respectively. Neither initial invocation reached product behavior or left resources.

## Browser/visual evidence

Not applicable to the Ticket 174 delta: it changes backend reconciler lifecycle and health evidence only. No UI/rendered file changed. The production web build and all relevant Speed retry/countdown/state policy tests passed; Ticket 171's browser behavior was outside the changed surface.

## Security and scope review

- Public operational failures remain sanitized as `speed_1v1_unavailable`; no internal failure detail is exposed.
- Standard behavior remains independent of Speed health.
- No hosted service, deployment, provider configuration, or hosted database was touched.
- No product implementation file was changed by Jasmine.
- No credential, connection string, token, session identifier, answer, or spoiler is retained in this report.
- The intentionally shared/uncommitted worktree was preserved.

## Cleanup

- Removed the temporary adversarial test.
- Confirmed no matching Ticket 130/158/159/169/170/175 disposable PostgreSQL schema remains.
- Confirmed no Jasmine background process remains.
- Confirmed no temporary Ticket 175 QA test remains.
- Final build and diff check passed after cleanup.

## Findings

No release-blocking defect reproduced. The Ticket 173 obsolete-completion revival defect is corrected.

## Required fixes / owner

None for Ticket 175.

## Residual risks

- Obsolete database work is not forcibly cancelled; it remains single-flight until settlement. Health updates from it are now fenced, which satisfies the approved contract.
- Multi-process leader election and database-level cancellation are outside this focused ticket and were not exercised.
- Hosted behavior remains subject to Ticket 162 checkpoint/PR/CI and later hosted Wave T validation.

## Final recommendation

**PASS.** The reconciler now fails closed after timeout, rejects obsolete success and failure completions across timeout and scheduler epochs, prevents overlap, and requires a new in-budget pass before restoring Speed. Ticket 162 may proceed within its own authorized scope.
