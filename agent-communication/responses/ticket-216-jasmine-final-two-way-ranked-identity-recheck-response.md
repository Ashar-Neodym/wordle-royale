Task: Ticket 216 — Final Two-Way Ranked Identity Recheck
Agent: Jasmine (QA)
Verdict: PASS

## Acceptance criteria checked

- `standard_1v1` + `speed_1v1_glicko_v1` rejects with `ranked_mode_algorithm_mismatch`: PASS.
- `speed_1v1` + `standard_1v1_glicko_v1` rejects with `ranked_mode_algorithm_mismatch`: PASS.
- null ranked mode + `speed_1v1_glicko_v1` rejects with `ranked_mode_algorithm_mismatch`: PASS.
- An additional unknown/other ranked mode + Speed algorithm adversary rejects identically: PASS.
- All mismatches reject before participant, profile, rating-event, or report access and before any write: PASS.
- Valid Standard identity remains on generic Standard settlement and never delegates to Speed settlement: PASS.
- Valid Speed identity delegates exactly once to the dedicated Speed settlement path: PASS.
- Unsupported algorithm retains `unsupported_rating_algorithm` precedence before dependent access: PASS.
- Permanent rating finalization matrix: PASS, 13/13.
- Speed and Standard rating units plus gameplay persistence: PASS.
- Full API, contracts, typechecks, secret scan, and diff checks: PASS.
- PostgreSQL Speed rating/read-model and gameplay paths: PASS.

## Independent adversarial evidence

A Proxy-backed transaction exposed only `match.findUnique`; any attempted access to another transaction delegate threw `UNEXPECTED_ACCESS_<delegate>`. Four invalid identity pairs all returned `ranked_mode_algorithm_mismatch` without triggering that sentinel:

1. `standard_1v1` + `speed_1v1_glicko_v1`;
2. `speed_1v1` + `standard_1v1_glicko_v1`;
3. null + `speed_1v1_glicko_v1`;
4. `other_ranked` + `speed_1v1_glicko_v1`.

The same pre-access harness confirmed an unknown algorithm returns `unsupported_rating_algorithm` before mode mismatch or dependent access.

Separate route sentinels confirmed:

- Valid Speed invoked `SpeedRatingSettlementService.finalizeInTransaction` exactly once and returned its marker without generic participant access.
- Valid Standard reached the generic participant path and did not invoke Speed settlement.

This closes Ticket 211's sole remaining converse identity blocker.

## Commands run + exit codes

- Independent four-case mismatch/pre-access + unsupported precedence + valid route-separation probe: exit 0.
- Focused rating/gameplay command: exit 0 — 26/26 total, including permanent rating matrix 13/13.
- Full API suite: exit 0 — 225/225; PostgreSQL-only suites skipped by the broad runner as designed.
- API typecheck: exit 0.
- Contracts tests and typecheck: exit 0 — 24/24 plus TypeScript PASS.
- PostgreSQL Speed rating/read-model integration in isolated `ticket159_*` schema: exit 0 — 2/2.
- PostgreSQL Speed gameplay in disposable `ticket158_*` schema: exit 0 — 5/5.
- Secret scan: exit 0 — 289 source/config files.
- `git diff --check`: exit 0.

Setup notes:

- An initial rating invocation used a `ticket216_*` schema, which the integration test intentionally skip-gated because it accepts only its owned `ticket159_*`/`ticket169_*` prefixes. No test was claimed from that invocation.
- One subsequent local URL construction attempt returned Prisma P1000 before tests ran; the local credential interpolation was corrected, and the owned `ticket159_*` run then passed 2/2. This was local harness setup, not a product failure.

## Browser/visual evidence

Not applicable. Ticket 216 is a narrow server-side rating identity and persistence-ordering recheck with no UI changes.

## Regression/security/scope review

- Validation now occurs after ranked/non-ranked and unsupported-algorithm checks, but before Speed delegation or generic participant access.
- The dedicated Speed settlement boundary remains intact.
- Valid Standard and Speed rating behavior remained green in units and PostgreSQL integration.
- The fix introduces no new route, provider access, lifecycle transition, logging, or secret surface.
- No raw database/provider response, credential, answer authority, hash, or spoiler was exposed.
- No production code was modified during QA.
- The intentionally dirty shared worktree was preserved.

## Findings

No blocking or non-blocking defect found within Ticket 216 scope.

## Required fixes / owner

None for Ticket 216.

Ticket 212 is procedurally unblocked for its separately authorized checkpoint/PR/CI work. This PASS does not authorize hosted access, deployment, lifecycle activation, merge, or release.

## Residual risks

- Ticket 216 intentionally did not repeat the 80/80 lifecycle race matrix because the patch only moves mode/algorithm validation and adds unit regressions, as explicitly directed by the ticket.
- Hosted behavior remains untested and unauthorized in this recheck.

## Cleanup

- Both successful disposable PostgreSQL schemas were dropped.
- The skip-gated and failed-setup schemas were removed by shell traps.
- A direct database query showed no retained `ticket%` schema before teardown.
- Local PostgreSQL container, volume, and network were removed.
- No QA server, temporary test file, or matching process remains.
