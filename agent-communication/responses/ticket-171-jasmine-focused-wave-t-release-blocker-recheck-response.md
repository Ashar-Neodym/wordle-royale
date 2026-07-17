# Ticket 171 — Focused Wave T Release-Blocker Recheck Response

Task: Focused Wave T Release-Blocker Recheck
Agent: Jasmine (QA)
Verdict: **FAIL**

Ticket 162 remains blocked.

## Acceptance criteria checked

| Criterion | Result | Independent evidence |
|---|---:|---|
| Flag + database + schema + dictionary + reconciler gate | **FAIL** | Flag/database/schema/dictionary/explicit-failure cases fail closed, but reconciler readiness remains true indefinitely after a previously successful pass hangs. Reproducer below failed. |
| Locked public Speed identity | PASS | Catalog exposes `75/20/3/6/100ms`, `server_solve_time_bucket`, `speed_1v1_v1_75s`, and `speed_1v1_glicko_v1`; contract suite passed 24/24. |
| Same-word uncertain-response request identity | PASS | Production browser committed operation B, dropped its response, retained `Retry … with same request`, replayed B, and ended with two accepted rows, two distinct operations, no operation C. PostgreSQL separately proved repeated identical accepted words preserve participant-scoped IDs through reconstruction. |
| Immutable forfeit/deadline/no-contest reads | PASS | Fresh PostgreSQL settlement/read suite passed 2/2. Repeated reads and stale-report repair preserved public and persisted completion identity with rating-event counts 2/2/0. |
| Deterministic PostgreSQL time authority | PASS | Fresh PostgreSQL suite passed 4/4: exact ready/reveal/deadline boundaries, post-edge rejection without attempt, concurrent ready immutability, same/adjacent 100ms buckets, guess priority, and client-time irrelevance. |
| Speed queue/gameplay/settlement/read convergence | PASS | Speed PostgreSQL gameplay passed 5/5; settlement/read convergence passed 2/2. |
| Standard regression | PASS | Standard fresh-PostgreSQL concurrency passed 3/3, including delayed cold joins. |
| Browser countdown/accessibility/spoiler safety | PASS | Production build showed authoritative countdown, exact-operation retry copy, disabled uncertain input, two final accepted rows, `aria-busy` recovery, no overflow, zero console/JS errors, and no answer/hash/salt disclosure. |
| Canonical gates | PASS | Focused tests, full API 143/143, web typecheck/build, full workspace build, workspace validation, Prisma validation, secret scan, and diff check passed. |
| Cleanup | PASS | No Ticket 130/158/159/169/170/171 schema, QA file, server, port, or background process remains. |

## Blocking finding

### Reconciler readiness can stay live indefinitely after a hung reconciliation pass

**Owner:** Freya
**Severity:** Release blocker

The public catalog and all Speed operations correctly consume `SpeedOperationalReadinessService`, but its reconciler dependency is a process-lifetime boolean:

- `apps/api/src/gameplay/speed-runtime-health.service.ts:4-13`
- `apps/api/src/health/speed-operational-readiness.service.ts:23-37`

A successful reconciliation sets the boolean true:

- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts:43-49`

It is cleared only when that pass rejects or the module is destroyed:

- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts:25-29`
- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts:50-55`

If a subsequent `reconcileDue()` hangs, `running` remains true, later interval ticks return immediately, and the last true health bit never expires. `/ranked/modes` continues advertising Speed as enabled and queue/gameplay operations continue passing readiness even though expiry reconciliation is no longer making progress.

### Independent reproduction

A temporary test performed:

1. Enable Speed.
2. Let the first reconciliation pass succeed; confirm ready becomes true.
3. Start a second pass whose `reconcileDue()` never resolves.
4. Wait 2.2 seconds—more than two one-second scheduling intervals.
5. Assert readiness fails closed.

Result:

```text
Ticket 171 reconciler health fails closed after a hung pass exceeds two scheduling intervals
exit 1
actual: true
expected: false
```

The temporary test was removed immediately afterward and the clean build was rerun successfully.

### Required fix

Replace the unbounded boolean with bounded health evidence, for example:

- track `lastSuccessfulCompletionAt` using a monotonic/server-owned timestamp;
- track in-flight start time;
- define a documented freshness and maximum-pass budget tied to the one-second cadence;
- mark reconciler unavailable when success is stale or a pass exceeds that budget;
- ensure `/ranked/modes`, readiness, and every Speed operation fail closed with the existing sanitized `speed_1v1_unavailable` response.

Required focused regression:

1. successful pass → live;
2. later explicit failure → unavailable;
3. later never-resolving pass → unavailable after bounded threshold;
4. scheduler stops/no fresh completion → unavailable;
5. recovery success → live again;
6. Standard remains unaffected.

## Commands run + exit codes

- `pnpm --filter @wordle-royale/contracts test` — exit 0, **24/24**.
- Focused API blocker/read/Standard suites — exit 0, **66/66**.
- Focused web retry/countdown/read suites — exit 0, **23/23**.
- `pnpm --filter @wordle-royale/api test:postgres:speed-timing` — exit 0, **4/4**, fresh schema dropped.
- `pnpm --filter @wordle-royale/api test:postgres:speed-gameplay` — exit 0, **5/5**, fresh schema dropped.
- `pnpm --filter @wordle-royale/api test:postgres:matchmaking` — exit 0, **3/3**, fresh schema dropped.
- Guarded `ticket169_*` Speed settlement/read suite — exit 0, **2/2**, schema dropped.
- One initial rating-suite invocation used the wrong enable variable and skipped 0 tests; it was not credited. The corrected guarded invocation passed 2/2.
- Temporary hung-reconciler QA probe — exit 1 as expected, release blocker reproduced; probe removed.
- `pnpm --filter @wordle-royale/api test` — exit 0, **143/143**; gated PostgreSQL suites were run separately above.
- `pnpm --filter @wordle-royale/web typecheck` — exit 0.
- `pnpm --filter @wordle-royale/web build` — exit 0.
- `pnpm validate:workspace` — exit 0, nine packages.
- `pnpm --filter @wordle-royale/api db:validate` — exit 0.
- `pnpm secret-scan` — exit 0, 249 files.
- Final clean `pnpm build` — exit 0.
- Final `git diff --check` — exit 0.

## Browser/visual evidence

A production Next build was exercised against a deterministic contract-compatible API:

1. Initial snapshot contained one accepted repeated-word operation A.
2. The browser submitted the same word under operation B.
3. The server committed B and closed the response without replying.
4. Authoritative refresh intentionally exposed only A.
5. The browser retained B, disabled the input, and displayed `Retry “CRANE” with same request`.
6. Retrying sent the same B identity.
7. The final snapshot contained exactly two accepted rows and two distinct operations; no operation C existed.
8. Input returned to idle, Submit was disabled while empty, and `aria-busy=false`.

Additional observations:

- prominent server-authoritative countdown;
- Standard and Speed marked live, Classic and Multiplayer marked unavailable;
- labeled guess input and polite atomic live region retained;
- opponent details remained count-only;
- no layout overlap, clipping, or horizontal overflow;
- zero console messages and zero JavaScript errors;
- no answer authority or sensitive operation IDs rendered publicly.

The deterministic browser server and PostgreSQL evidence were separate streams: browser proof covered client retry state; fresh PostgreSQL proof covered durable operation correlation and mutation rows.

## Findings resolved from Ticket 161

1. **Catalog source and locked identity:** fixed for ordinary success/explicit dependency failure paths.
2. **Repeated-word uncertain mutation:** fixed and independently exercised.
3. **Immutable completion identity:** fixed and independently rerun on PostgreSQL.
4. **Deterministic DB timing:** fixed and independently rerun on PostgreSQL.

The remaining hung-reconciler condition is inside Ticket 171 criterion 1: reconciler health is not fail-closed when progress stalls without an exception.

## Security/scope review

- No hosted system, provider configuration, deployment, or hosted database was touched.
- No product files were modified by Jasmine.
- No credentials, connection strings, answer words, hashes, salts, or sensitive operation identifiers are retained in this report.
- The shared intentionally uncommitted Wave T worktree was preserved.
- The deterministic timing seam is triple-gated to test environment variables and absent from migrations; as defense in depth, startup should also reject its flag in preview/production-like runtime configurations.

## Cleanup

- Stopped production Next and deterministic API processes.
- Removed all Ticket 171 temporary scripts and the failing QA probe.
- Verified zero matching disposable PostgreSQL schemas.
- Verified zero Jasmine background processes.
- Final full build and diff check passed after cleanup.

## Required fixes / owner

- **Freya:** make reconciler health bounded and freshness-aware; add stale/hung/scheduler-stop/recovery regressions.
- **Jasmine:** focused recheck of that single blocker.
- **Yuna:** Ticket 162 remains blocked until Jasmine records PASS.

## Residual risks

- No load, soak, multi-process reconciler-leader, or physical-device test was run.
- The rating identity PostgreSQL test seeds authoritative terminal rows directly; gameplay transitions and repeated-read behavior were independently covered in separate fresh-schema suites rather than one monolithic browser-to-database test.

## Final recommendation

**FAIL.** The four original Ticket 161 defects are substantially corrected, and all gameplay, timing, idempotency, completion, browser, Standard, and canonical checks passed. However, Speed can still remain advertised live indefinitely after a reconciler pass hangs. That directly violates the fail-closed reconciler-readiness criterion, so Ticket 162 must remain blocked.
