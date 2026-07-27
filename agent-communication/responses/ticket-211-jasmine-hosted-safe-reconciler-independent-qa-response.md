Task: Ticket 211 — Hosted-Safe Reconciler Independent QA rerun
Agent: Jasmine (QA)
Verdict: FAIL

## Verdict rationale

The Ticket 213/215 remediations close the previously reported scheduler-liveness, Speed-only readiness isolation, dependency-minimal composition, observability, and direct/nested SQLSTATE classification blockers. Independent rerun evidence confirms those repairs.

However, the extraction introduced an omitted converse ranked identity regression in `GameplayPersistenceService.finalizeRankedMatchRatingsInTransaction(...)`: a non-Speed persisted match carrying `speed_1v1_glicko_v1` is no longer rejected as `ranked_mode_algorithm_mismatch`. It proceeds into the generic participant/rating settlement path. That is a fail-closed ladder-identity and data-integrity blocker.

Ticket 212 remains blocked.

## Acceptance criteria checked

- Exact Ticket 208 timing and batching contract: PASS.
- Ticket 209 hosted-latency matrix: PASS.
- Same-epoch over-budget success/failure autonomous recovery: PASS.
- Previous-epoch and shutdown fencing/no overlap: PASS.
- Speed-only readiness degrades without core/Standard outage: PASS.
- Narrow reconciler provider graph: PASS.
- Fixed transaction/pass metrics and sanitized closed error classes: PASS.
- Direct and nested PostgreSQL SQLSTATE classification: PASS, 8/8 independent mappings.
- Compiled operator context excludes runtime workers: PASS.
- PostgreSQL generation fencing, sentinel batching, concurrency, gameplay, timing, and schema readiness: PASS for completed runs.
- Standard and Speed rating identity fail-closed behavior after service extraction: FAIL for the converse non-Speed + Speed-algorithm case.
- Security/secrets/public-surface review: PASS except for the rating identity integrity blocker.

## Blocking finding

### B1 — A non-Speed persisted match can enter generic settlement under the Speed algorithm identity

Severity: release-blocking data-integrity defect
Owner: Freya

Current flow:

1. `gameplay-persistence.service.ts` delegates to `SpeedRatingSettlementService` only when `match.rankedMode === 'speed_1v1'`.
2. For all other modes, `speed_1v1_glicko_v1` remains in the generic allowlist.
3. `expectedMode` is set only for `standard_1v1_glicko_v1`; the Speed algorithm identity maps to `null`.
4. Therefore, `rankedMode='standard_1v1'` with `algorithmConfigVersion='speed_1v1_glicko_v1'` reaches generic participant settlement instead of failing closed.

Independent reproduction:

```text
match.mode = ranked
match.rankedMode = standard_1v1
match.algorithmConfigVersion = speed_1v1_glicko_v1
```

The mocked `matchParticipant.findMany` sentinel was reached and emitted:

```text
REACHED_PARTICIPANT_READ
```

Expected result:

```text
ranked_mode_algorithm_mismatch
```

Impact:

- A contradictory persisted ranked identity can cross into generic placement-based settlement.
- The row can be handled under the wrong rating path rather than failing closed.
- This weakens exact ladder/rating identity guarantees and can corrupt rating/report truth if contradictory data exists.

Required fix:

1. Restore a two-way mode/algorithm identity map before any participant, profile, rating-event, or report access:
   - `standard_1v1_glicko_v1` requires `standard_1v1`.
   - `speed_1v1_glicko_v1` requires `speed_1v1`.
2. Keep the dedicated Speed delegation for valid Speed rows.
3. Add permanent regression coverage for at least:
   - Standard mode + Speed algorithm -> `ranked_mode_algorithm_mismatch`.
   - Speed mode + Standard algorithm -> `ranked_mode_algorithm_mismatch`.
   - null/other ranked mode + Speed algorithm -> `ranked_mode_algorithm_mismatch`.
4. Assert the rejection occurs before participant reads and before every write.

## Closed prior findings

- Over-budget same-epoch settlement now schedules exactly one normal-delay recovery pass after settlement.
- Old-epoch and stopped schedulers remain fenced.
- Speed-only runtime failure now returns top-level `degraded`, not global `unavailable`, while preserving `dependencies.speedRuntime.status='unavailable'`.
- The isolated runtime module resolves without product readiness, dictionary, Redis, provider, activation, gameplay facade, or HTTP providers.
- The reconciliation input is narrow and fixed.
- Direct and nested `40001`, `40P01`, `55P03`, and `57014` mappings classify correctly.
- Metrics remain bounded and do not serialize raw errors, SQL, URLs, credentials, or provider details.

## Commands run + exit codes

- Focused six-file reconciler/readiness gate: exit 0 — 43/43.
- Independent direct+nested SQLSTATE probe: exit 0 — 8/8.
- `pnpm test:speed-lifecycle-operator`: exit 0 — 37/37.
- API typecheck: exit 0.
- Independent contradictory rating-identity probe: exit 0 with sentinel `REACHED_PARTICIPANT_READ`; expected fail-closed code was not produced — blocker reproduced.
- Full API suite: exit 0 — 224/224, with PostgreSQL-only suites skipped by design.
- Contracts: exit 0 — 24/24.
- Web policy tests: exit 0 — 46/46.
- Nine-project workspace build: exit 0.
- PostgreSQL Speed gameplay: exit 0 — 5/5.
- PostgreSQL deterministic timing: exit 0 — 7/7.
- PostgreSQL schema readiness: exit 0 — 8/8.
- PostgreSQL hostile lifecycle fresh single iteration: exit 0 — 8/8.
- Hostile lifecycle stress attempt: the external 600-second harness limit interrupted iteration 9 after eight complete green iterations and seven green checks in iteration 9; the retained schema was explicitly dropped. This was a runner-duration interruption, not an assertion failure, and is not counted as a full ten-iteration pass.
- Workspace validation: exit 0.
- Prisma validation: exit 0.
- Secret scan: exit 0 — 289 files.
- Compiled operator context smoke: exit 0, `runtimeWorkersPresent=false`.
- Production API startup/readiness smoke: exit 0.
- `git diff --check`: exit 0.

## Browser/visual evidence

Not applicable. Ticket 211 concerns API worker, persistence, readiness, provider composition, and operator behavior. No user-facing UI behavior changed. Web policy tests and the web production build passed.

## Regression/security/scope review

- No new public reconciler or operator route was found.
- Provider proof, public-origin fencing, NAT64 rejection, immutable artifact/fleet binding, leases, audit digests, and command serialization remained green through the 37-test operator suite.
- Standard remained available during Speed runtime failure.
- No raw errors, SQL, credentials, provider responses, answers, hashes, or spoilers were exposed by reconciler metrics or readiness.
- The contradictory rating identity issue is a server-side integrity failure, not an information disclosure.
- No production source was edited during QA.
- The shared dirty worktree was preserved.

## Required fixes / owner

- Freya: restore converse mode/algorithm fail-closed validation before generic settlement and add the omitted permanent tests.
- Jasmine: rerun the targeted identity adversary, rating suites, full API suite, and relevant PostgreSQL rating/gameplay checks after remediation.
- Yuna: keep Ticket 212 blocked until Ticket 211 receives a clean PASS.

## Residual risks

- Canonical rating tests cover Speed mode with mismatched identity, but not the converse Standard/non-Speed mode carrying the Speed algorithm. This omission is why the broad green suite did not catch B1.
- The hostile ten-iteration rerun exceeded the tool's 600-second foreground limit because individual iterations were unusually slow on this host. Completed assertions were green and a fresh full iteration passed, but no ten-iteration PASS is claimed for this rerun.
- No hosted Railway query, hosted database access, deployment, activation, gameplay smoke, merge, or release was performed or authorized.

## Cleanup

- The schema retained when the foreground hostile runner timed out was identified and explicitly dropped.
- All other disposable schemas were dropped by their runners.
- Local PostgreSQL/Redis containers, volumes, and network were removed.
- Production startup smoke process terminated.
- No QA temporary test file or matching worker/API process remains.
