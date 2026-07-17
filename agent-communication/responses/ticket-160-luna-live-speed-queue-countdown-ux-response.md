# Ticket 160 — Live Speed Queue and Countdown UX Response

Task: Ticket 160 — Live Speed Queue and Countdown UX
Agent: Luna (coder)
Status: **Implementation complete; ready for Ticket 161 independent integration QA**

## Result

Implemented a separate catalog-gated live Speed flow without changing Standard queue identity:

- dedicated Speed find/search/cancel/reconnect/matched states;
- matched navigation derived only from `matchedMatchId`;
- explicit session, feature-disabled, recoverable-timeout, expiry, and cancellation copy;
- client-generated join request identity retained while the ticket outcome is uncertain;
- 20-second ready gate, three-second countdown, 75-second live round, state polling, refresh recovery, and terminal/result handoff;
- countdown display anchored from `snapshot.serverTime` to `performance.now()` rather than browser wall-clock time;
- fresh snapshots re-anchor drift without extending the server deadline;
- displayed zero pauses input and requests authoritative state; it never declares expiry, placement, or rating locally;
- zero-state synchronization is keyed to the authoritative phase deadline so repeated snapshots cannot create an immediate fetch loop;
- accessible announcements only at 30, 10, 5, and 0 seconds;
- non-color-only urgent-time treatment, busy states, labeled input, spoiler-safe opponent progress, and explicit forfeit consequence copy;
- ready, guess, and forfeit retries retain the same client request UUID after uncertain responses rather than automatically replaying mutations;
- Speed results/history/profile cards and leaderboards use mode-specific live fields and rating identity;
- Classic and Multiplayer remain `Not live yet`;
- live Speed claims are gated by `/ranked/modes` `enabled && queueEnabled`.

## Required contract closure

The landed Speed snapshot did not expose the `roundId` required by the existing guess route/body. A live matched client therefore could not submit a legal Speed guess from public API data.

Added `roundId` to `speedMatchSnapshotSchema` and to the server snapshot builder, plus updated the contract fixture. This is a narrow additive contract correction; no persistence or timing authority changed.

## Primary Ticket 160 files

- `apps/web/src/components/SpeedQueuePanel.tsx`
- `apps/web/src/components/SpeedGameplayPanel.tsx`
- `apps/web/src/components/speed-live-state.ts`
- `apps/web/src/components/speed-live-state.test.ts`
- `apps/web/src/app/actions.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/app/play/page.tsx`
- `apps/web/src/app/leaderboard/page.tsx`
- `apps/web/src/app/matches/[matchId]/page.tsx`
- `apps/web/src/components/GameplayScreen.tsx`
- `apps/web/src/components/ProfileHistory.tsx`
- `apps/web/src/components/ReportAndProfile.tsx`
- `apps/web/src/components/StandardQueuePanel.tsx`
- `apps/web/src/components/web-shell.module.css`
- `apps/web/src/lib/profile-read-presentation.test.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/matchmaking/speed-contracts.test.ts`
- `apps/api/src/gameplay/speed-gameplay.service.ts`

Parallel Ticket 157–159 files already present in the shared worktree are preserved and are not attributed to Luna.

## Commands run and evidence

```text
pnpm exec tsx --test \
  apps/web/src/components/speed-live-state.test.ts \
  apps/web/src/components/standard-queue-state.test.ts
exit 0 — 10 passed, 0 failed

pnpm --filter @wordle-royale/api exec node --import tsx --test \
  test/speed-gameplay-controller.test.ts \
  test/speed-1v1-rules.test.ts
exit 0 — 6 passed, 0 failed

pnpm --filter @wordle-royale/web typecheck
exit 0

pnpm --filter @wordle-royale/web build
exit 0 — final production build compiled, TypeScript completed, and all routes generated

pnpm --filter @wordle-royale/api typecheck
exit 0

pnpm validate:workspace
exit 0 — 9 packages

pnpm secret-scan
exit 0 — 243 source/config files

git diff --check
exit 0
```

Two broader test invocations found fixture-only expectation drift introduced by the additive reads/contracts:

1. The combined web suite passed 20/21; the only failure was expected sorted request-path order after adding `/ranked/modes`. The expected order was corrected.
2. The contracts suite passed 21/22; the only failure was the existing Speed snapshot fixture missing the newly required `roundId`. The fixture was corrected.

A subsequent multi-command rerun request was blocked by the execution approval layer timing out without user response, and the tool explicitly prohibited retrying that same outcome. Therefore this handoff does **not** claim a post-fix rerun of those two complete suites. The final production build and both app/API typechecks passed after the fixes. Ticket 161 should rerun both suites independently.

## Production-artifact browser verification

Served the final standalone Next artifact against a deterministic contract-compatible local API with Speed enabled in the authoritative mode catalog.

Observed:

- initial live match rendered a server-synchronized `3` countdown;
- countdown transitioned to the 75-second Speed round without local outcome inference;
- same-URL reload restored the same authoritative deadline and reduced remaining display from `69s` to `60s` rather than resetting;
- an expired snapshot rendered `FINALIZING`, disabled input, `deadline timeout`, and “The browser does not decide expiry, placement, or rating”;
- finalizing state exposed no forfeit action and no stale zero announcement;
- Speed leaderboard route selected `Speed`, displayed `speed_1v1_glicko_v1`, and rendered a live Speed row;
- Classic and Multiplayer remained `Not live yet` / `aria-disabled`;
- countdown/status live regions and `aria-busy` state were present;
- document width stayed within viewport (`1265 <= 1280`);
- after clearing earlier browser instrumentation noise, final countdown and leaderboard checks reported zero JavaScript console errors.

The browser harness did not prove a real two-user PostgreSQL queue/pairing/ready/guess/forfeit lifecycle. Ticket 161 owns that independent real-backend integration gate and production-browser mutation verification.

## Cleanup

- deterministic API stopped;
- standalone Next server stopped;
- `/tmp/ticket-160-api.py` removed;
- ports `3160` and `3161` confirmed closed;
- final `git diff --check` passed.

## Risks / follow-ups

- Ticket 161 must rerun the full contracts and combined web suites because the final post-fixture rerun was blocked as described above.
- Ticket 161 should exercise two real sessions through queue, ready, countdown, refresh, accepted guess, expiry, forfeit, result, and rating settlement against disposable PostgreSQL.
- The Speed feature remains fail-closed unless the authoritative catalog/backend feature gate enables it.
- No hosted deployment, provider mutation, hosted database operation, migration execution, commit, push, PR, or merge was performed.
