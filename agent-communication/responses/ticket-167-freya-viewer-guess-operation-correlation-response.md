# Ticket 167 — Viewer Guess Operation Correlation Response

Task: Ticket 167 — Viewer Guess Operation Correlation
Agent: Freya (frontend/backend integration)
Status: **Complete; Ticket 168 may proceed, then Ticket 171 may recheck**
Date: 2026-07-16

## Summary

Extended each viewer-owned accepted Speed guess with its participant-scoped `clientRequestId`. The value is reconstructed from the durable `MatchMutationRequest` record created atomically with the accepted attempt, so retries, reconnects, and identical repeated words retain unambiguous operation identity.

The Speed UI now resolves uncertain pending guesses by operation ID rather than by normalized word text. Opponent snapshots remain progress-only and expose no opponent request IDs.

## Implemented behavior

- Added required `clientRequestId` to every `myState.acceptedGuesses[]` contract entry.
- Preserved participant-scoped idempotency: the mapping filters durable mutations by both match and viewer participant.
- Maps accepted mutation result snapshots to persisted attempt numbers; repeated identical words remain distinct.
- Exact request IDs survive service reconstruction/reconnect because they come from PostgreSQL, not process memory.
- Updated pending-guess reconciliation to compare `clientRequestId`, removing the stale repeated-word heuristic.
- Kept opponent output limited to accepted count and terminal state; no opponent operation IDs, words, feedback, exact elapsed time, or bucket are exposed.
- Added a real PostgreSQL regression that accepts the same legal word twice under two IDs, solves under a third, reconstructs the service, and verifies all identities in order.
- Added a frontend state regression with two identical words and distinct operation IDs.

## Files changed

- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/test/speed-gameplay-postgres.integration.test.ts`
- `apps/web/src/components/SpeedGameplayPanel.tsx`
- `apps/web/src/components/speed-live-state.ts`
- `apps/web/src/components/speed-live-state.test.ts`
- `apps/web/src/lib/api-client.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`

## Commands run + exit codes

```text
pnpm --filter @wordle-royale/contracts test
exit 0 — 24 passed, 0 failed

node --import tsx --test ../web/src/components/speed-live-state.test.ts
exit 0 — 6 passed, 0 failed

pnpm --filter @wordle-royale/api test:postgres:speed-gameplay
exit 0 — 5 passed, 0 failed; repeated-word/reconnect proof passed on a disposable schema

pnpm --filter @wordle-royale/api test
exit 0 — 143 passed, 0 failed

pnpm --filter @wordle-royale/web typecheck
exit 0

pnpm build
exit 0 — web production build and all workspace builds passed

node scripts/secret-scan.mjs
exit 0 — 249 source/config files scanned

git diff --check
exit 0
```

## Independent review

The first review found that the initial PostgreSQL evidence covered request replay but not two accepted identical words with different IDs. The integration and frontend regressions were strengthened to cover that exact case and reconnect durability. Final independent re-review returned **PASS — no blocker remains**.

## Browser/visual checks

No layout, copy, visual styling, or interaction controls changed. The behavior is a state-correlation fix verified through the frontend state test and production web build; no separate visual screenshot was necessary.

## Accessibility notes

No focus order, keyboard handling, labels, announcements, or contrast changed. Existing status presentation remains intact.

## Risks/follow-ups

- Ticket 168 can now preserve uncertain repeated-word submissions using the authoritative operation ID rather than word matching.
- Ticket 171 should independently test lost-response/reconnect behavior with identical repeated words.
- No commit, push, deployment, hosted database mutation, or provider change was performed.
