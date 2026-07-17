# Ticket 173 — Final Reconciler Health Focused Recheck Response

Task: Final Reconciler Health Focused Recheck
Agent: Jasmine (QA)
Verdict: **FAIL**

Ticket 162 remains blocked.

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---:|---|
| Startup unavailable until first completed success | PASS | Deterministic probe observed unavailable while the initial reconciliation promise remained unresolved. |
| Success live only inside documented freshness window | PASS | Monotonic 2,000 ms freshness bound is implemented and focused tests passed. |
| Explicit failure immediately disables catalog and Speed operations | PASS | Focused readiness/operation suites passed with sanitized `speed_1v1_unavailable`. |
| Never-resolving pass disables after bounded pass budget | PASS | Monotonic 2,000 ms in-flight budget correctly made readiness false. |
| Scheduler stop/stale heartbeat disables Speed | PASS | Focused tests prove stale success and explicit scheduler stop fail closed. |
| Late obsolete completion cannot revive health | **FAIL** | Independent adversarial probe showed a pass that had exceeded the 2,000 ms budget became healthy when that same obsolete promise later resolved. |
| Safe later success restores without unbounded overlap | **FAIL / not reached correctly** | Existing code suppresses overlap, but the obsolete pass itself restores health before a new pass is required. Current tests explicitly encode that incorrect behavior. |
| Catalog, `/readyz`, and operation paths agree with sanitized errors | CONDITIONAL PASS | They share the same runtime-health source and correctly agree while health is false. Because obsolete completion incorrectly sets that source healthy, all surfaces can agree on the wrong live state. |
| Standard, Ticket 171 fixes, PostgreSQL, build, security, cleanup | PASS | Full API, contracts, Speed/Standard PostgreSQL suites, workspace build/validation, Prisma validation, secret scan, and cleanup passed. |

## Blocking defect

### A timed-out reconciliation completion is not fenced and can revive Speed

**Owner:** Freya
**Severity:** Release blocker

`SpeedRuntimeHealthService` tracks timestamps but no scheduler epoch or pass-generation token:

- `apps/api/src/gameplay/speed-runtime-health.service.ts:50-59`

`SpeedExpiryReconcilerService.tick()` unconditionally calls `markPassSucceeded()` whenever `reconcileDue()` eventually resolves:

- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts:49-62`

The pass budget only affects the computed snapshot while work is in flight. Exceeding the budget does not invalidate that pass. Therefore:

1. reconciliation starts;
2. monotonic age exceeds 2,000 ms;
3. Speed correctly becomes unavailable;
4. the old pass eventually resolves;
5. `markPassSucceeded()` treats the obsolete completion as fresh evidence;
6. Speed becomes live again without a new reconciliation pass.

This directly violates Ticket 173 check 6.

## Independent reproduction

A temporary deterministic test used injected monotonic time:

1. Enable Speed.
2. Start the initial pass with an unresolved promise.
3. Confirm startup health is false.
4. Advance monotonic time by `SPEED_RECONCILER_MAX_PASS_MS + 1`.
5. Confirm timed-out health is false.
6. Resolve the obsolete promise.
7. Require health to remain false until a new pass succeeds.

Result:

```text
obsolete timed-out completion cannot revive Speed; a later new pass can
exit 1
AssertionError: obsolete completion must not revive health
actual: true
expected: false
```

The temporary probe was removed before canonical build and cleanup checks.

## Existing test defect

The Ticket 172 focused suite currently asserts the opposite of Ticket 173:

- `apps/api/test/speed-reconciler-health.test.ts:53-54`
- `apps/api/test/speed-reconciler-health.test.ts:96-98`

It expects the timed-out/stalled pass itself to restore readiness when it completes. The required sequence is instead:

1. obsolete pass completes;
2. health remains unavailable;
3. a new pass starts after the old work settles;
4. only the new in-budget success restores availability.

## Required fix / owner

**Freya:** fence health updates with scheduler and pass identity.

Minimum expected behavior:

- create a scheduler epoch on start/restart;
- assign an identity/generation to each pass;
- success/failure completion updates must include that identity;
- reject completion evidence when the pass exceeded its budget, is no longer current, belongs to an earlier scheduler epoch, or completed after scheduler stop;
- preserve single-flight execution while old work is unresolved;
- after obsolete work settles, permit one new pass;
- require that new in-budget successful pass before health becomes live.

Required regression cases:

1. initial hung pass → unavailable;
2. timed-out pass resolves → still unavailable;
3. no overlap while old pass is unresolved;
4. new pass succeeds → available;
5. stop/restart while old work exists → old completion cannot revive the new scheduler epoch;
6. catalog, `/readyz`, and every Speed operation remain unavailable until the new valid success;
7. Standard remains available.

## Commands run + exit codes

- Focused reconciler/readiness/operation suites — exit 0, **10/10 passed**.
- Temporary obsolete-completion adversarial probe — exit 1 as expected, **blocker reproduced**.
- `pnpm --filter @wordle-royale/api test` — exit 0, **146/146 passed**; guarded PostgreSQL tests run separately.
- `pnpm --filter @wordle-royale/contracts test` — exit 0, **24/24 passed**.
- Speed PostgreSQL gameplay — exit 0, **5/5 passed**; disposable schema dropped.
- Deterministic Speed PostgreSQL timing — exit 0, **4/4 passed**; disposable schema dropped.
- Standard PostgreSQL concurrency — exit 0, **3/3 passed**; disposable schema dropped.
- `pnpm validate:workspace` — exit 0, nine packages.
- `pnpm --filter @wordle-royale/api db:validate` — exit 0.
- `pnpm secret-scan` — exit 0, 250 files.
- `pnpm build` — exit 0.
- Final `git diff --check` — exit 0.

## Browser/visual evidence

Not applicable. Ticket 172 changes backend runtime health and operational gating only; no UI/layout code changed. The browser retry/countdown/accessibility behavior approved during Ticket 171 was not altered.

## Security and scope review

- No hosted provider, deployment, or hosted database was touched.
- No product implementation files were changed by Jasmine.
- No credential, connection string, answer authority, or sensitive operation identifier is retained in this response.
- The shared intentionally uncommitted Wave T worktree was preserved.

## Cleanup

- Removed the adversarial QA test and PostgreSQL runner.
- Confirmed zero matching disposable Ticket 130/158/170/173 schemas.
- Confirmed no Jasmine background process remains.
- Final build and diff check passed after QA artifact removal.

## Residual risks

- No multi-process leader-election or database-cancellation behavior was tested.
- A hung database operation remains uncancelled by design; this is acceptable only if its eventual completion is fenced from health state and a later clean pass is required for recovery.

## Final recommendation

**FAIL.** Freshness and hung-pass detection now work while the pass remains unresolved, but late completion of that already-obsolete pass incorrectly revives Speed. Ticket 162 must remain blocked until completion updates are generation-fenced and Jasmine records PASS on the focused recheck.
