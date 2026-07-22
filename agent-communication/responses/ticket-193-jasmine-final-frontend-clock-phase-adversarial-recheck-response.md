# Ticket 193 — Final Frontend Clock/Phase Adversarial Recheck — Response

Task: Ticket 193 — Final Frontend Clock/Phase Adversarial Recheck
Agent: Jasmine (QA)
Verdict: **PASS**
Date: 2026-07-21

Ticket 192 closes both frontend blockers from Ticket 191. Independent adversarial tests reproduced the original delayed-response and phase-conflict shapes and now pass. Ticket 180 may proceed under its own checkpoint/PR/CI authorization; this focused PASS does not authorize merge, deployment, hosted mutation, final hosted QA, or release.

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---|---|
| Delayed progressive response cannot move authoritative lower bound backward | PASS | Independent probe retained server `12:00:10` when a delayed response serialized `12:00:05`. |
| Proven-closed deadline cannot reopen | PASS | Retry remained false at render and forced later dispatch after the retained lower bound exceeded the deadline. |
| Exact deadline equality and tab suspension fail closed | PASS | Exact equality and a 60-second monotonic suspension both returned false. |
| Poll/recovery/mutation response re-anchoring is centralized and non-regressing | PASS | All accepted snapshots flow through `apply()` and `createNonRegressingServerClockAnchor()` with one receipt instant. |
| Equal-time readiness phase regression/conflict rejected despite other progress | PASS | Independent `opponent_ready/1 -> invitation/2` adversary returned false. |
| Valid invitation → opponent-ready → locked/countdown transitions accepted | PASS | Independent transition chain returned true for both steps. |
| Invalid state/phase/count/viewer-ready combinations fail closed | PASS | Three independent malformed combinations were rejected. |
| Generation fencing and duplicate behavior preserved | PASS | Older generation and equal duplicate were not applied; exact duplicate remained recognizable for read recovery. |
| Ticket 189 retry/recovery/terminal behavior preserved | PASS | Focused checked-in suite passed 46/46; no automatic mutation replay was observed in browser. |
| Accessibility, route, Standard, and spoiler boundaries preserved | PASS | Focused tests and production browser evidence passed. |

## Independent adversarial evidence

Temporary QA suite: **7/7 passed**, exit 0.

1. **Delayed progressive response:**
   - Prior anchor: server `12:00:00`, monotonic receipt `0`.
   - Response serialized server time: `12:00:05`.
   - Response receipt: monotonic `10,000ms`.
   - Effective anchor: server `12:00:10`, not `12:00:05`.
   - Deadline: server `12:00:09`.
   - Retry at receipt and forced `10,001ms` dispatch: both false.
2. **Exact deadline and suspended tab:** equality and a 60-second delayed dispatch both remained closed.
3. **Genuinely newer time:** incoming `12:00:12` correctly advanced the lower bound.
4. **Equal-time phase regression:** `opponent_ready/1 -> invitation/2` was rejected.
5. **Valid phases:** invitation/0 → opponent-ready/1 → locked/2 countdown was accepted.
6. **Invalid combinations:** opponent-ready state with locked/2, countdown with opponent-ready/1, and viewer-ready without timestamp were rejected.
7. **Generation/duplicate:** stale generation and equal duplicate were not applied.

Implementation review confirmed:

- `createNonRegressingServerClockAnchor()` uses `max(incoming serverTime, anchoredServerNow(previousAnchor, receipt))`.
- `SpeedGameplayPanel.apply()` captures one `performance.now()` receipt instant and updates snapshot plus anchor atomically through one path.
- Retry rendering and pre-dispatch both use strict `< deadline` checks.
- Readiness phase rank is included in monotonic truth.
- V2 state/phase/count and viewer-ready correlation consistency is checked before application.

## Commands run and exit codes

- Independent Ticket 193 clock/phase suite — exit **0**, **7/7**.
- Checked-in focused web suite — exit **0**, **46/46**.
- Full API suite — exit **0**, **162/162**.
- Contracts — exit **0**, **24/24**.
- Workspace build — exit **0**.
- Workspace validation — exit **0**, 9 packages.
- API typecheck — exit **0**.
- Web typecheck — exit **0**.
- Prisma validation — exit **0**.
- Secret scan — exit **0**, 268 source/config files.
- `git diff --check` — exit **0**.

## Browser/visual evidence

The optimized Next production build was run against a deterministic API fixture with a 40-second unresolved ready POST and unavailable authoritative recovery:

- Exactly one ready POST was sent.
- One stable operation ID was retained: UUID format verified; value omitted from this report.
- No automatic mutation replay occurred.
- While uncertain, the button remained disabled as `Awaiting authoritative ready outcome`.
- The polite atomic live region stated that safe retry prerequisites were incomplete.
- At displayed zero, the UI announced authoritative-state checking and kept retry disabled.
- Route remained `/play?matchId=…#speed-gameplay`.
- Horizontal overflow: false.
- Browser console: zero messages and zero JavaScript errors.
- No answer, hash, salt, exact opponent solve time, or opponent-word material was visible.
- Visual inspection found no clipping, overlap, misleading enabled retry control, or material contrast defect. The large invitation heading remained contained in its panel.

## Regression/security/scope review

- Stable ready/guess/forfeit identities remain intact.
- Retry still requires definitive settlement, successful authoritative absence proof, and an open current deadline.
- Forfeit remains fail-closed without public exact absence proof.
- Request-generation fencing and single-flight reads remain intact.
- Standard queue tests remain green and Speed remains isolated.
- Opponent state remains progress-only and spoiler-safe.
- No credentials, cookies, database URLs, answer authority, hashes, salts, or spoilers were recorded.
- No hosted environment, deployment, provider setting, branch, remote, or production database was changed.

## Findings

No Ticket 193 release blocker was reproduced.

## Required fixes / owner

None for Ticket 193.

Ticket 180 owner may proceed with the separate checkpoint/PR/CI workflow, preserving the reviewed worktree contents and all fail-closed activation requirements.

## Residual risks

- This is local frontend and cross-layer regression evidence, not hosted two-client proof.
- Hosted deployment identity, real delivery latency, concurrent ready behavior, settlement, history, and public read-model convergence remain for separately authorized hosted QA.
- PASS does not authorize release or hosted mutation.

## Cleanup

- Temporary adversarial test and deterministic API fixture removed.
- Production Next and mock API processes stopped.
- Ports 3193 and 3194 closed.
- No QA processes remained.
- `git diff --check` passed after cleanup.
