# Ticket 192 — Non-Regressing Authoritative Clock and Readiness Phase — Response

Task: Ticket 192 — Non-Regressing Authoritative Clock and Readiness Phase
Agent: Luna (web implementation)
Status: **Implementation complete; ready for Ticket 193 independent adversarial recheck**
Date: 2026-07-21

## Result

Closed both frontend blockers reported by Ticket 191 without changing server deadlines, mutation identity, replay behavior, or backend/hosted state.

1. Accepted snapshots now re-anchor through one non-regressing authoritative-time lower bound per mounted match/round. At the captured receipt instant, the effective anchor is:

   `max(incoming serverTime, anchoredServerNow(previousAnchor, receiptMonotonicTime))`

   A delayed progressive poll/recovery/mutation response can advance authoritative fields, but it cannot move already-proven server time backward or reopen a closed deadline.
2. Readiness phase is now part of monotonic snapshot truth. `invitation -> opponent_ready -> locked` can advance, but phase regression is rejected even when ready count or another field grows.
3. V2 readiness phase/count/state combinations are fail-closed:
   - `readyCount=0` requires `invitation`;
   - `readyCount=1` requires `opponent_ready`;
   - `readyCount=2` requires `locked`;
   - waiting invitation/opponent-ready and countdown/in-progress/finalizing states must match their legal readiness phase;
   - viewer-ready timestamp/operation fields cannot contradict viewer readiness.
4. Existing strict `< deadline` checks remain in both render-time retry presentation and the fresh `performance.now()` pre-dispatch guard. Deadline equality and all later instants remain closed.

## Files changed

- `apps/web/src/components/speed-live-state.ts`
  - Added `createNonRegressingServerClockAnchor()`.
  - Added readiness phase ordering and cross-field consistency validation.
  - Included readiness phase in monotonic snapshot truth.
- `apps/web/src/components/SpeedGameplayPanel.tsx`
  - Captures one monotonic receipt instant before applying a response.
  - Re-anchors accepted responses with the previous effective authoritative lower bound.
- `apps/web/src/components/speed-live-state.test.ts`
  - Added the exact delayed progressive response/deadline reopening probe from Ticket 191.
  - Added render-time, forced late-dispatch, exact-equality, and genuinely-newer-time checks.
  - Added equal-time phase-regression-with-ready-growth, valid phase transitions, and invalid cross-field cases.
  - Corrected two old countdown fixtures that represented impossible non-locked/one-ready countdown states.

## Commands run + exit codes

### TDD / focused tests

- `pnpm exec tsx --test apps/web/src/components/speed-live-state.test.ts` before implementation — exit `1`; expected missing non-regressing-anchor export.
- First post-implementation focused run — exit `1`; 15/16 passed and one old test fixture was correctly rejected because it modeled countdown with `opponent_ready`/one ready participant.
- Corrected focused run — exit `0`; **16/16 passed**.
- Full checked-in web test set:
  - `pnpm exec tsx --test apps/web/src/components/speed-live-state.test.ts apps/web/src/lib/speed-mutation-policy.test.ts apps/web/src/lib/speed-mutation-api-policy.test.ts apps/web/src/lib/server-read-policy.test.ts apps/web/src/components/standard-queue-state.test.ts apps/web/src/lib/matchmaking-deadline-policy.test.ts apps/web/src/lib/profile-read-presentation.test.ts apps/web/src/lib/application-metadata.test.ts`
  - exit `0`; **46/46 passed**.
- `pnpm exec tsx --test packages/contracts/src/matchmaking/speed-contracts.test.ts` — exit `0`; **3/3 passed**.

### Typecheck/build/release gates

- Initial `pnpm --filter @wordle-royale/web typecheck` after adding tests — exit `2`; test-only union narrowing errors found and corrected.
- Final `pnpm --filter @wordle-royale/web typecheck` — exit `0`.
- `pnpm --filter @wordle-royale/web build` — exit `0`; optimized Next.js production build completed.
- `pnpm build` — exit `0`; all applicable workspace builds completed, including web, mobile, API, and packages.
- `pnpm validate:workspace` — exit `0`; 9 workspace packages passed.
- `pnpm secret-scan` — exit `0`; 267 source/config files scanned.
- `git diff --check` — exit `0`.

## Verification evidence

### Exact Ticket 191 clock probe

- Prior anchor: server `12:00:00`, monotonic receipt `0`.
- Delayed progressive response: serialized server `12:00:05`, received at monotonic `10,000ms`.
- Effective accepted anchor: server `12:00:10`, not `12:00:05`.
- Ready deadline: server `12:00:09`.
- Retry at render instant: `false`.
- Forced dispatch at `10,001ms`: `false`.
- Exact deadline equality: `false`.
- A genuinely newer incoming server time (`12:00:12`) still advances the lower bound.

### Readiness phase matrix

- Accepted: `invitation/0 -> opponent_ready/1 -> locked/2` with matching lifecycle states.
- Rejected: equal-time `opponent_ready/1 -> invitation/2`, despite ready-count growth.
- Rejected: invitation state with opponent-ready phase; opponent-ready state with count two; countdown locked with count one; in-progress opponent-ready; viewer-ready without a viewer-ready timestamp.

### Production browser smoke

A deterministic local API fixture and the optimized Next production artifact were exercised at `/play?matchId=ticket-192#speed-gameplay`:

- Styled Speed panel rendered `waiting_opponent_ready`, `Ready 1/2`, and no opponent word/answer/hash/salt material.
- At displayed zero, the live region announced authoritative-state checking and the ready button was disabled.
- Route and `#speed-gameplay` fragment remained intact.
- Horizontal overflow: `false`.
- Browser console: **0 messages and 0 JavaScript errors**.
- Visual inspection found no clipping, overlap, broken panel layout, or spoiler exposure.
- The initial standalone launch lacked copied static assets; it was discarded and the same production build was relaunched through `next start` for the valid styled smoke.
- Temporary fixture/server processes were stopped, the fixture file was removed, and ports `3189`/`3190` were confirmed closed.

## Preserved behavior

- Stable ready/guess/forfeit operation identities.
- Definitive settlement plus successful post-settlement absence proof before retry.
- No automatic mutation replay.
- Request-generation fencing and single-flight reads.
- Fail-closed forfeit recovery.
- Accessibility live regions and disabled action states.
- Standard queue isolation and opponent spoiler boundaries.

## Risks / follow-up

- Ticket 193 should independently rerun delayed-in-transit, tab-suspension, reconnect, poll/recovery/mutation race, exact-boundary, forced late-event, and phase/state matrix probes against the checked-in implementation.
- Local deterministic browser evidence does not prove hosted latency or durable two-client/database behavior.
- Ticket 180 remains blocked until Ticket 193 returns PASS.
- No hosted mutation, database operation, deployment, production configuration change, commit, PR, or merge was performed.
