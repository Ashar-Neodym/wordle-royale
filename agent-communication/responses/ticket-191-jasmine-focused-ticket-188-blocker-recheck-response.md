# Ticket 191 — Focused Ticket 188 Blocker Recheck — Response

Task: Ticket 191 — Focused Ticket 188 Blocker Recheck
Agent: Jasmine (QA)
Verdict: **FAIL**
Date: 2026-07-21

Ticket 190's activation-index blocker is closed. Ticket 189 fixes the originally reported same-phase field regressions and historical-snapshot deadline check, but independent delayed-response testing found that a newly accepted snapshot can move the server-time anchor backward and reopen retry after a deadline already proven closed. A second equal-time readiness-phase conflict is also accepted. Ticket 180 remains blocked.

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---|---|
| Lower same-phase ready count/viewer-ready/correlation cannot replace newer truth | PASS | Canonical tests and source review cover lower count, viewer-ready rollback, ready timestamp removal, and operation-ID replacement. |
| Accepted-guess, deadline/start, participant/opponent terminal truth is monotonic | PASS | Canonical focused suite passed 44/44 and the new comparison preserves these established values. |
| Readiness phase itself is monotonic/consistent | **FAIL** | Equal-time `opponent_ready -> invitation` was accepted when `readyCount` increased. |
| Delayed render/tab suspension/exact boundary | PASS for checked historical-anchor cases | Canonical helper tests cover elapsed monotonic time and exact deadline equality. |
| Delayed/stale response cannot move current authoritative time backward | **FAIL** | Independent probe reopened retry after the prior anchor already proved the deadline passed. |
| Retry rechecked at dispatch | CONDITIONAL | A dispatch guard exists, but it consumes the same potentially regressed anchor and therefore does not close the stale-response defect. |
| Exact activation-index collation/opclass and shape | PASS | Independent wrong-collation, wrong-opclass, DESC, and INCLUDE probe passed; restoration recovered each time. |
| Activation/schema and hostile lifecycle regressions | PASS | Activation 60/60, schema readiness 8/8, hostile races 70/70. |
| Standard isolation | PASS | Standard matchmaking 3/3; activation suite also proved Standard remains writable when Speed fails closed. |
| Browser uncertainty/expiry/accessibility/spoiler safety | PASS for exercised flow | One ready POST, expiry disabled retry, zero console errors, no overflow or spoiler text. |

## Blocking findings

### 1. A delayed progressive response can regress the authoritative clock and reopen retry

**Owner:** Luna

`shouldApplySpeedSnapshot()` compares an incoming snapshot with the serialized `current.serverTime`. It does not compare that response against the current lower bound derived from the existing `ServerClockAnchor` at receipt time. When accepted, `SpeedGameplayPanel` creates a fresh anchor directly from the delayed response's `serverTime` and the current receipt time.

Independent reproduction:

1. Existing snapshot and anchor begin at server `00:00:00`, monotonic receipt `0`.
2. Ten monotonic seconds elapse, so the existing anchor proves authoritative time is at least `00:00:10`.
3. The ready deadline is `00:00:09`; it is already closed.
4. A delayed but field-progressing response arrives with serialized server time `00:00:05` and a higher `readyCount`.
5. `shouldApplySpeedSnapshot()` accepts it because `00:00:05` is later than the stored snapshot's `00:00:00`.
6. The panel can re-anchor at `00:00:05` on receipt.
7. `speedRetryIsSafe()` returns `true`, reopening retry even though the prior anchor already proved server time was after `00:00:09`.

Independent test result: expected `false`, actual `true`.

This directly violates Ticket 191's delayed response, stale response, tab suspension, and display/dispatch deadline authority requirements. The pre-dispatch check is not sufficient because it evaluates the regressed anchor.

**Required fix:** On every accepted response, preserve a non-decreasing authoritative-time lower bound. At receipt, the effective server time must be at least `max(incoming serverTime, anchoredServerNow(previousAnchor, receiptMonotonicTime))`, or the stale anchor-changing response must be rejected. Add a checked-in delayed-in-transit test that proves an already-closed deadline never reopens at render or dispatch.

### 2. Equal-time readiness-phase conflict can ride another progress field

**Owner:** Luna

`preservesMonotonicSnapshotTruth()` checks readiness count, viewer readiness, timestamp, and operation ID, but not `readiness.phase`. `hasStrictSnapshotProgress()` can therefore accept a conflicting/regressive phase if another field increases.

Independent reproduction:

1. Current state: `waiting_opponent_ready`, readiness phase `opponent_ready`, `readyCount=1`.
2. Incoming state: same match, round, lifecycle state, and `serverTime`; readiness phase `invitation`, `readyCount=2`.
3. Expected: reject inconsistent/regressive readiness phase.
4. Actual: accepted (`true`).

**Required fix:** Include `readiness.phase` in the authoritative monotonic/identity rules and add same-time phase-conflict cases. Do not allow an unrelated progress field to legalize a contradictory phase.

## Closed Ticket 190 backend blocker

Ticket 190 passes this recheck.

Independent fresh-schema probe mutated and restored canonical indexes after every case:

- `releaseId COLLATE "C"` — readiness unavailable, restoration returned ok.
- `controlProtocol text_pattern_ops` — unavailable, restoration ok.
- `expiresAt DESC` — unavailable, restoration ok.
- `INCLUDE (releaseId)` — unavailable, restoration ok.

The production query checks active schema, canonical name/table, B-tree method, key/attribute count, no expression/predicate, order options, exact key names, qualified opclasses, qualified collations, validity/readiness, uniqueness/primary identity, and same-schema key-shape singularity.

## Commands run and exit codes

### Independent adversarial probes

- Temporary frontend stale-anchor/readiness-phase suite — exit **1**, **0/2**:
  - delayed progressive response reopened retry after a previously proven deadline;
  - equal-time readiness-phase conflict was accepted.
- Temporary fresh-schema activation-index suite — exit **0**, **1/1**; four independent mutations plus exact restoration passed.

### Canonical suites

- Focused web recovery/order/policy/presentation suite — exit **0**, **44/44**.
- Full API suite — exit **0**, **162/162**.
- Contracts — exit **0**, **24/24**.
- Mixed-version activation — exit **0**, **10 × 6/6 = 60/60**.
- Schema-isolated lifecycle readiness — exit **0**, **8/8**.
- Hostile lifecycle race matrix — exit **0**, **10 × 7/7 = 70/70**.
- Standard PostgreSQL matchmaking — exit **0**, **3/3**.

### Release gates

- Workspace build — exit **0**.
- Workspace validation — exit **0**, 9 packages.
- API typecheck — exit **0**.
- Web typecheck — exit **0**.
- Prisma validation — exit **0**.
- Secret scan — exit **0**, 269 source/config files.
- `git diff --check` — exit **0**.

## Browser/visual evidence

A production Next artifact was run against a deterministic mock API:

- One ready POST was sent with one stable UUID.
- Exact duplicate authoritative reads did not produce an automatic replay.
- At authoritative expiry the UI showed `EXPIRED`, stated that the current server-anchored time no longer proved an open deadline, and disabled the ready control as `Awaiting authoritative ready outcome`.
- Browser console: zero messages and zero JavaScript errors.
- Horizontal overflow: false.
- Live-region status included truthful expiry copy.
- No answer, hash, salt, or opponent-word material was visible.
- Visual inspection found no clipping, overlap, misleading enabled retry control, or material contrast defect. The large invitation heading remained within its card.

This browser path validates the ordinary current-anchor expiry behavior. It does not negate the independent delayed-response anchor-regression failure.

## Regression, security, and scope review

- Backend activation, readiness, hostile races, and Standard isolation remained green.
- No credential, cookie, database URL, answer authority, hash, salt, or spoiler was exposed in this report.
- No hosted environment, deployment, provider setting, branch, remote, or production database was changed.
- Official focused tests remain green because neither newly identified adversarial case is checked in.

## Required fixes / owner

1. **Luna:** Preserve the prior anchored authoritative lower bound when accepting/re-anchoring delayed responses.
2. **Luna:** Fence conflicting/regressive `readiness.phase` values at equal time.
3. **Luna:** Add durable helper/component tests for delayed-in-transit progressive responses, post-deadline display, and forced late dispatch.
4. **Jasmine:** Recheck only these frontend blockers plus focused/browser regressions after handoff.

## Residual risks

- Ticket 180 remains blocked; Wave U must stay unreleased/fail-closed.
- Local green PostgreSQL and browser results do not authorize deployment.
- Final hosted two-client ready delivery, latency, settlement, and public read-model convergence remain out of scope until this focused blocker recheck passes.

## Cleanup

- Temporary frontend/API tests, Python helpers, and mock server removed.
- All temporary Ticket 191/187/184/185/130 schemas removed.
- Local ports 3191/3192 closed.
- No QA background processes remained.
- `git diff --check` passed after cleanup.
