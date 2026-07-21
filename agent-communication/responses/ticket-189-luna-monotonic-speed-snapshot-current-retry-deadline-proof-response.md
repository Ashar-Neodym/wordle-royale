# Ticket 189 — Monotonic Speed Snapshot and Current Retry-Deadline Proof — Response

Task: Ticket 189 — Monotonic Speed Snapshot and Current Retry-Deadline Proof
Agent: Luna (coder)
Status: Implementation complete; ready for Ticket 191 independent blocker recheck

## Files changed

- `apps/web/src/components/speed-live-state.ts`
  - Added deterministic monotonic truth preservation for readiness, accepted guess operations, opponent progress, deadline/start identity, participant terminal facts, and terminal state identity.
  - Equal-time snapshots now apply only when they contain real authoritative progress. Exact duplicates remain usable as successful read evidence but cannot reset the server-clock anchor.
  - Added exact snapshot-equivalence detection so post-settlement duplicate reads can prove absence without applying or re-anchoring stale time.
  - Extended recovery evidence with the monotonic server-clock anchor captured at receipt.
  - Changed retry safety to compare the authoritative deadline with current anchored server time rather than historical `snapshot.serverTime`.
- `apps/web/src/components/SpeedGameplayPanel.tsx`
  - Captures one monotonic receipt instant and corresponding server-time anchor for each accepted snapshot.
  - Rejects regressive recovery snapshots as absence proof while allowing exact duplicate post-settlement evidence without re-anchoring.
  - Stores retry proof as mutation kind plus stable request UUID, then recomputes eligibility against the latest accepted snapshot/anchor at every render.
  - Rechecks the same proof with `performance.now()` immediately before retry dispatch.
  - Converts expired proof to truthful accessible `expired` copy and disables retry; a late dispatch attempt is stopped before any mutation call.
  - Preserves definitive original-POST settlement, successful post-settlement absence proof, stable operation identity, no replay, and fail-closed forfeit behavior.
- `apps/web/src/components/speed-live-state.test.ts`
  - Added adversarial readiness rollback, ready correlation replacement, exact-duplicate, accepted-operation rollback/growth, start/deadline replacement, participant/opponent terminal rollback, terminal-state conflict, delayed render, tab suspension, one-millisecond stale recovery, deadline equality, and late-click-time checks.

## Commands run + exit codes

- `pnpm exec tsx --test apps/web/src/components/speed-live-state.test.ts` before implementation — exit `1`; 3 new regressions failed as expected.
- `pnpm exec tsx --test apps/web/src/components/speed-live-state.test.ts apps/web/src/lib/speed-mutation-policy.test.ts apps/web/src/lib/speed-mutation-api-policy.test.ts apps/web/src/lib/server-read-policy.test.ts apps/web/src/components/standard-queue-state.test.ts apps/web/src/lib/matchmaking-deadline-policy.test.ts apps/web/src/lib/profile-read-presentation.test.ts apps/web/src/lib/application-metadata.test.ts` — exit `0`; 44/44 passed.
- `pnpm exec tsx --test packages/contracts/src/matchmaking/speed-contracts.test.ts` — exit `0`; 3/3 passed.
- `pnpm --filter @wordle-royale/web typecheck` — exit `0`.
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:3189 pnpm --filter @wordle-royale/web build` — exit `0`; production artifact built.
- `pnpm build` — exit `0`; all build-bearing workspace packages completed.
- `pnpm validate:workspace` — exit `0`; 9 workspace packages passed.
- `pnpm secret-scan` — exit `0`; 267 source/config files passed.
- `git diff --check` — exit `0`.
- Final ticket-file credential-pattern scan — 0 matches.
- Cleanup check — exit `0`; ports `3189` and `3190` closed and `/tmp/ticket189_fixture.py` removed.

## Result

Ticket 188's two Luna-owned blockers are addressed:

1. Equal-time responses can no longer undo readiness, operation correlation, accepted guesses, deadline identity, or terminal truth. The client rejects regressions rather than synthesizing or merging client-owned progress.
2. Retry-safe is now a live predicate over monotonic elapsed time. A historical recovery snapshot cannot keep retry available after its anchored authoritative deadline, and an immediate pre-dispatch check prevents a stale UI event from sending the mutation.

## Verification evidence

### Deterministic helper/controller coverage

- Lower ready count, `viewerReady` rollback, ready-time removal, operation-ID replacement, accepted-operation removal, changed start/deadline identity, terminal participant rollback, opponent rollback, and `completed`/`voided` conflict all reject.
- Real cross-phase and accepted-operation-set growth still apply.
- Equal-time exact duplicates do not apply or re-anchor, but an exact duplicate returned by a post-settlement read remains valid absence evidence using the existing anchor.
- A recovery snapshot with only 1 ms remaining is not retry-safe when evaluated 2 ms after receipt.
- Deadline equality, delayed rendering, and simulated tab suspension all fail closed.

### Production-artifact browser probe

A temporary deterministic API fixture and the built Next artifact exercised two hostile routes without hosted or database mutation:

- Same-phase rollback route:
  - Initial state was `waiting_opponent_ready`, `viewerReady=true`, `readyCount=1`.
  - Subsequent polls returned the same phase and equal `serverTime` with `viewerReady=false`, `readyCount=0`, and removed ready correlation.
  - The rendered panel remained **Ready confirmed**, **Waiting for your opponent**, and `Ready 1/2`; no ready control reappeared.
- Current retry-deadline route:
  - One ready POST returned a definitive non-commit response.
  - A post-settlement exact-duplicate state read proved operation absence without resetting the original clock anchor.
  - The UI briefly showed **retry safe** and **Retry same ready request** while anchored time remained open.
  - At the deadline it changed to an accessible **EXPIRED** status, truthful current-time copy, and disabled **Awaiting authoritative ready outcome** control despite continuing duplicate polls.
  - A forced late control event exercised the immediate dispatch guard; fixture proof remained exactly one ready POST with one UUID.
- Route identity and `#speed-gameplay` remained intact.
- Browser console: 0 messages, 0 JavaScript errors.
- Horizontal overflow: false.
- Opponent-word leakage probe: false.
- Visual inspection found the expired status, recovery alert, and control legible with no overlap.

## Risks / follow-ups

- Ticket 191 should independently rerun Ticket 188's same-phase readiness/gameplay/terminal matrix and stale-deadline probe, including an exact duplicate poll stream, deadline equality, a suspended tab, and a forced late event.
- Public Speed snapshots still cannot prove persisted forfeit-operation absence, so forfeit retry remains deliberately unavailable.
- No hosted environment, PostgreSQL database, migration, deployment, production configuration, commit, PR, or merge was touched.
