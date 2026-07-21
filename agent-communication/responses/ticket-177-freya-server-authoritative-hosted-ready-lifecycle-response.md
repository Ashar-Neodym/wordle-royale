# Ticket 177 — Server-Authoritative Hosted Ready Lifecycle — Response

Task: Ticket 177 — Server-Authoritative Hosted Ready Lifecycle
Agent: Freya (frontend/backend reliability)
Status: Complete; final post-review execution and independent review PASS
Date: 2026-07-17

## Implemented

- Added expand-only Speed ready lifecycle v2 persistence and migration:
  - `readyLifecycleVersion=speed_ready_v2_first_ack_90s`;
  - immutable 90-second `invitationExpiresAt` from one PostgreSQL-owned creation time;
  - nullable `readyWindowStartedAt` and `readyDeadlineAt` before first acknowledgement;
  - additive `invitation_timeout` and `pre_start_cancelled` completion reasons;
  - separate partial due-work indexes for zero-ready invitations and one-ready windows.
- Preserved null-version/existing-deadline rows as `speed_ready_v1_match_created_20s` without extending or reviving them.
- Implemented the server-owned v2 state machine:
  - zero ready → `waiting_invitation`;
  - first valid ready atomically persists `readyAt`, ready-window origin, and origin + 20 seconds;
  - second valid ready atomically persists the immutable 3-second reveal and 75-second deadline;
  - exact deadline equality is accepted and expiry occurs only after the deadline.
- Made ready replay operation-first so a committed response-loss replay remains confirmable after later expiry.
- Preserved the participant's first ready operation identity; a different later ID cannot move `readyAt`, restart a window, or replace correlation.
- Added viewer-only `viewerReadyAt` and `viewerReadyOperationId`; opponent operation identities and exact ready times remain private.
- Added distinct exactly-once no-contest outcomes:
  - zero-ready expiry → `invitation_timeout`;
  - one-ready expiry → `ready_timeout`;
  - pre-reveal cancellation → `pre_start_cancelled`;
  - all produce zero rating apply events.
- Late ready reconciliation now commits before the sanitized conflict is returned, avoiding rollback of terminalization.
- Ready after a persisted pre-start cancellation returns the current authoritative terminal snapshot instead of a false expiry error.
- Added one finite Speed mutation policy for ready, guess, and forfeit:
  - 24,000 ms complete backend lifecycle;
  - three total transaction attempts;
  - 8,000 ms max-wait cap;
  - 12,000 ms execution cap;
  - 1,000 ms completion reserve;
  - bounded 50–250 ms retry jitter;
  - sanitized Speed-specific lifecycle, transaction-timeout, and busy errors.
- Started the lifecycle ledger before operational readiness and bounded that readiness wait inside the same envelope.
- Kept reconciler transactions inside the existing two-second health envelope rather than applying the 24-second request policy to worker passes.
- Passed scheduler epoch/generation completion eligibility into the reconciliation transaction; an obsolete pass throws before commit so its expiry mutations roll back.
- Preserved Tickets 172/174 freshness and generation-fenced health evidence.
- Extended `/readyz` and all Speed operations to fail closed unless lifecycle-v2 columns, enum values, and exact due-index shapes exist.
- Extended the locked Speed catalog identity with the v2 lifecycle, 90-second invitation, and first-valid-ready origin.
- Kept Standard behavior, competitive ruleset, rating identity, settlement, PostgreSQL timing authority, and spoiler safety unchanged.

## Files changed

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260717000000_speed_ready_lifecycle_v2/migration.sql`
- `apps/api/scripts/run-speed-timing-postgres-integration.mjs`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/src/gameplay/speed-1v1-rules.ts`
- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts`
- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/src/gameplay/speed-mutation-policy.ts`
- `apps/api/src/gameplay/speed-runtime-health.service.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/health/speed-operational-readiness.service.ts`
- `apps/api/src/leaderboard/leaderboard-read.service.ts`
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/test/speed-gameplay-postgres.integration.test.ts`
- `apps/api/test/speed-mutation-policy.test.ts`
- `apps/api/test/speed-operational-readiness.test.ts`
- `apps/api/test/speed-reconciler-health.test.ts`
- `apps/api/test/speed-timing-postgres.integration.test.ts`
- `apps/web/src/components/speed-live-state.test.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`
- `packages/contracts/src/matchmaking/speed-contracts.test.ts`

Concurrent Wave T/U ticket files and pre-existing `agent-communication/index.md` edits were preserved.

## Commands run + exit codes

Final post-review verification after explicit sandbox consent:

- `pnpm deps:up` and `pnpm deps:check` — local PostgreSQL/Redis configuration and startup passed, exit 0.
- `pnpm --filter @wordle-royale/api db:generate` — Prisma client generated, exit 0.
- `pnpm --filter @wordle-royale/api db:validate` — Prisma schema valid, exit 0.
- `pnpm --filter @wordle-royale/api typecheck` — exit 0.
- `pnpm --filter @wordle-royale/web typecheck` — exit 0.
- Focused Ticket 177 mutation/readiness/reconciler tests — 15/15 passed, exit 0.
- `pnpm --filter @wordle-royale/contracts test` — 24/24 passed, exit 0.
- `pnpm --filter @wordle-royale/api test` — 154/154 passed, exit 0.
- `pnpm --filter @wordle-royale/api test:postgres:speed-timing` — disposable-schema Ticket 177 deterministic lifecycle/timing suite 7/7 passed and schema dropped, exit 0.
- `pnpm --filter @wordle-royale/api test:postgres:speed-gameplay` — disposable-schema Speed gameplay suite 5/5 passed and schema dropped, exit 0.
- `MATCHMAKING_TEST_DATABASE_URL=[REDACTED] pnpm --filter @wordle-royale/api test:postgres:matchmaking` — disposable-schema Standard concurrency suite 3/3 passed and schema dropped, exit 0.
- `PREVIEW_DICTIONARY_TEST_DATABASE_URL=[REDACTED] pnpm --filter @wordle-royale/api test:postgres:preview-dictionary` — disposable-schema dictionary/readiness suite 4/4 passed and schema dropped, exit 0.
- `pnpm validate:workspace` — 9 workspace packages validated, exit 0.
- `pnpm build` — all workspace builds passed, including API emit and optimized Next.js production build, exit 0.
- `pnpm smoke:api:prod-start` — production-built API started and `/readyz` returned `status=ok`; API process terminated cleanly, exit 0.
- `pnpm secret-scan` — 252 source/config files scanned, exit 0.
- `git diff --check` — exit 0.

The first Standard matchmaking and preview-dictionary harness invocations exited 1 before tests started because their required local test database variables were omitted. They were rerun with explicit repository-local disposable database URLs represented here as `[REDACTED]`; both final harnesses passed and cleaned up their schemas.

Independent review state:

- Initial static review findings were resolved: transaction-level generation guard, full lifecycle readiness budget, cancellation semantics, and `/readyz`/index-shape readiness.
- A PostgreSQL canonical index-definition quoting mismatch found on re-review was corrected.
- Final independent static review: PASS, no blockers.
- Final executable verification after the last correction: PASS, no blockers.

## Browser/visual checks

Not applicable. Ticket 177 changes backend lifecycle, contracts, persistence, readiness, and test fixtures; it does not implement Ticket 178's rendered recovery UX.

## Accessibility notes

No rendered labels, focus order, keyboard behavior, live regions, or contrast changed in Ticket 177. Ticket 178 owns invitation/opponent-ready/uncertain-state UI behavior and accessibility.

## Risks/follow-ups

- Ticket 177 is complete and Ticket 178 may proceed.
- The readiness probe raced by the finite mutation envelope is not forcibly cancelled when the envelope expires; it holds no gameplay locks and cannot start the mutation afterward.
- Reconciler database work is bounded below the two-second health budget and checks current epoch/generation immediately before transaction commit; obsolete callbacks remain fenced from health evidence.
- The production-start smoke intentionally left repository-local PostgreSQL and Redis running for reuse; stop them with `pnpm deps:down` when concurrent local work no longer needs them.
- No commit, push, deployment, hosted database mutation, feature activation, provider change, or hosted infrastructure change was performed.
- Credentials and connection details are represented as `[REDACTED]`.
