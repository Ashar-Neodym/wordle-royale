# Ticket 188 — Focused Wave U Release-Blocker Recheck — Response

Task: Ticket 188 — Focused Wave U Release-Blocker Recheck
Agent: Jasmine (QA)
Verdict: **FAIL**
Date: 2026-07-21

Ticket 189 final hosted QA remains blocked. The deterministic PostgreSQL race matrix, mixed-version gate, and most Ticket 179 frontend corrections passed. Three release-relevant defects remain.

## Acceptance criteria checked

| Area | Result | Evidence |
|---|---|---|
| Ready uncertainty and safe retry | PASS for tested browser path | One 40-second delayed ready POST with recovery withheld remained one POST and showed disabled `Awaiting authoritative ready outcome`. |
| Equal-time cross-phase snapshot ordering | PASS | Canonical tests and independent probe reject `countdown -> waiting_opponent_ready` at equal `serverTime`. |
| Equal-time same-phase snapshot ordering | **FAIL** | Independent probe accepts a lower `readyCount`/`viewerReady=false` snapshot in the same phase at equal `serverTime`. |
| Lost-ready fallback | PASS | `countdown` plus `viewerReady=true` confirms ready when exact operation correlation is unavailable; mismatched non-null operation IDs remain unconfirmed. |
| Forfeit causality | PASS for reviewed canonical cases | Terminal reason/result are now checked rather than treating every terminal snapshot as forfeit confirmation. |
| Retry deadline authority | **FAIL** | Retry-safe derivation uses the recovery snapshot's stale `serverTime`, not current anchored time when the retry is displayed. |
| Active-schema lifecycle readiness | PASS | Official two-schema/missing-object/type/enum/index suite passed 8/8. |
| Activation schema exactness | **FAIL** | Wrong-collation `SpeedLifecycleCapabilityLease_releaseId_expiresAt_idx` remained `ok`. |
| Hostile Speed lifecycle races | PASS | Ten fresh schemas, seven contested tests each: 70/70. |
| Mixed-version activation and rollback | PASS | Ten fresh schemas, six tests each: 60/60. |
| Standard isolation | PASS | Standard matchmaking 3/3 and rating/read convergence 1/1. |
| Builds, typechecks, validation, security | PASS | All commands exited 0. |

## Blocking findings

### 1. Same-phase, equal-time snapshots can still regress readiness

**Owner:** Luna

`shouldApplySpeedSnapshot()` only compares lifecycle phase rank when `serverTime` values are equal. When both snapshots are `waiting_opponent_ready`, it accepts the incoming snapshot even if it regresses `readyCount`, `viewerReady`, `viewerReadyAt`, or operation correlation.

Independent reproduction:

1. Current snapshot: `waiting_opponent_ready`, `readyCount=1`, `viewerReady=true`.
2. Incoming snapshot: same `serverTime` and phase, but `readyCount=0`, `viewerReady=false`.
3. Expected: reject stale/regressive snapshot.
4. Actual: accepted (`true`).

This can visually undo a confirmed ready state when equal-time responses arrive out of order.

**Required fix:** Add deterministic same-phase monotonic ordering/tie-breaking for readiness and gameplay progress, with adversarial tests for lower ready count, viewer-ready rollback, lower accepted-guess progress, and terminal/non-terminal conflicts at equal timestamps.

### 2. Retry-safe can be derived from an already-expired recovery snapshot

**Owner:** Luna

The safe-retry decision checks `snapshot.serverTime < invitationExpiresAt/readyDeadlineAt`. That proves only that the server observed the deadline open when it produced the snapshot. It does not prove the deadline remains open when the UI later exposes retry.

Independent reproduction:

1. Recovery snapshot reports `serverTime=00:00:00.000Z` and `invitationExpiresAt=00:00:00.001Z`.
2. The snapshot is evaluated after that deadline is already stale.
3. Expected: retry unavailable.
4. Actual: `speedRetryDeadlineOpen()` returns `true`.

A real delayed response can therefore expose retry after the authoritative deadline has passed.

**Required fix:** Anchor the returned server time to monotonic client receipt time and require the deadline to remain open at affordance/click time. Recheck immediately before retry dispatch. Keep the stable operation ID and settled-original-POST proof.

### 3. Activation readiness accepts a wrong-collation canonical index

**Owner:** Freya

Independent PostgreSQL probe:

1. Migrated a fresh isolated schema.
2. Confirmed baseline activation schema readiness was `ok`.
3. Replaced `SpeedLifecycleCapabilityLease_releaseId_expiresAt_idx` with the same keys using `"releaseId" COLLATE "C"`.
4. Expected readiness: `unavailable`.
5. Actual readiness: `ok`.

The readiness query validates key attnums, ordering, uniqueness, and predicates but not per-key collation/opclass. This conflicts with the exact canonical-structure requirement and with the stronger validation used for lifecycle indexes.

**Required fix:** Validate activation index collation and opclass exactly, and add wrong-collation/wrong-opclass tamper cases to the official Ticket 187 PostgreSQL suite.

## Commands run and exit codes

### Independent adversarial probes

- `pnpm exec tsx --test apps/web/src/components/.qa-ticket188-frontend.test.ts` — exit **1**, **2 passed / 2 failed as expected**:
  - fixed cross-phase ordering passed;
  - fixed lost-ready fallback passed;
  - same-phase readiness regression failed;
  - stale-deadline retry test failed.
- Fresh-schema activation-index collation probe — exit **1 as expected**; actual readiness stayed `ok` after wrong-collation replacement.

Temporary probe files and schemas were removed.

### Canonical unit and contract suites

- Focused web policy/live-state/read-policy suite — exit **0**, **31/31**.
- Full API suite — exit **0**, **162/162**.
- Contracts — exit **0**, **24/24**.

### Canonical PostgreSQL suites

- Ticket 185 hostile lifecycle races — exit **0**, **10 iterations × 7/7 = 70/70**.
- Ticket 187 mixed-version activation — exit **0**, **10 iterations × 6/6 = 60/60**.
- Ticket 184 schema readiness — exit **0**, **8/8**.
- Ticket 177 timing/deadlines — exit **0**, **7/7**.
- Speed gameplay — exit **0**, **5/5**.
- Speed rating/read convergence — exit **0**, **2/2**.
- Standard matchmaking — exit **0**, **3/3**.
- Standard rating/read convergence — exit **0**, **1/1**.
- Preview dictionary/readiness — exit **0**, **4/4**.

### Release gates

- `pnpm build` — exit **0**.
- `pnpm validate:workspace` — exit **0**.
- API typecheck — exit **0**.
- Web typecheck — exit **0**.
- Prisma validation — exit **0**.
- Secret scan — exit **0**, 269 source/config files scanned.
- `git diff --check` — exit **0**.

## Browser/visual evidence

A production Next server was exercised against a deterministic mock API:

- Ready POST intentionally remained pending for 40 seconds.
- Recovery reads were intentionally withheld with 503 responses.
- At the uncertainty envelope, API proof showed exactly **one POST** and one stable operation ID.
- UI showed `Ready is not confirmed, but safe retry prerequisites are incomplete. Retry remains disabled.`
- Ready button was disabled and labeled `Awaiting authoritative ready outcome`.
- Zero console/JavaScript errors.
- No horizontal overflow (`scrollWidth=clientWidth=1265`).
- Polite atomic live-region announcements were present for countdown and uncertainty.
- No answer, hash, salt, or opponent-word material was visible.
- No observed overlap, clipping, misleading retry affordance, or material contrast defect.

## Regression, security, and scope review

- Standard queue, rating, and read behavior remained isolated and passing.
- Contested ready/cancel/worker/reconciler/generation races passed repeatedly with deterministic barriers.
- Mixed-version close/drain/open/rollback behavior passed repeatedly.
- No credentials, cookies, database URLs, answer authority, hashes, salts, or spoilers were added to this report.
- No deployment, provider setting, hosted database, branch, or remote state was changed.

## Required fixes / owner

1. **Luna:** Add same-phase equal-time monotonic snapshot fencing.
2. **Luna:** Make retry deadline proof current at affordance and dispatch time using anchored server time.
3. **Freya:** Validate activation-index collation/opclass and add official tamper tests.
4. **Jasmine:** Re-run only these three blockers plus focused regressions after handoff.

## Residual risks

- Passing local PostgreSQL and browser tests does not authorize deployment or release.
- Final hosted latency, two-client ready delivery, settlement, and profile/history/leaderboard convergence remain Ticket 189 scope after this focused recheck passes.
- Wave U Speed must remain unreleased/fail-closed until all three findings pass independent QA.

## Cleanup

- Temporary frontend and API QA tests removed.
- Temporary helper and mock files removed.
- All Ticket 188/184/185/187/177/158/130/135/169/131 QA schemas removed.
- Local ports 3188/3189 and all QA background processes stopped.
- `git diff --check` passed after cleanup.
