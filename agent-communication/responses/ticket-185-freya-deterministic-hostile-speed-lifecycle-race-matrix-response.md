# Ticket 185 — Deterministic Hostile Speed Lifecycle Race Matrix

Task: Ticket 185 — Deterministic Hostile Speed Lifecycle Race Matrix
Agent: Freya (frontend / reliability)
Status: Complete — implementation, ten-schema stability gate, canonical regression gate, and independent blocker review PASS

## Scope delivered

- Added a real PostgreSQL hostile lifecycle race matrix using controlled database time and transaction-stage row/advisory lock barriers.
- Added a disposable runner that migrates, seeds, exercises, and drops ten consecutive fresh schemas by default.
- Proved two distinct ready backends reached the contested `Match` row lock before either request settled, using schema-unique `application_name` attribution and backend PID/blocker checks.
- Proved both ready-first and cancellation-first pre-start lock orderings.
- Proved ready versus expiry-worker ordering at the exact ready deadline and immediately after it.
- Proved two reconcilers select and terminalize one due match exactly once with `FOR UPDATE ... SKIP LOCKED`.
- Proved scheduler generation changes after eligibility but before commit roll back every expiry mutation.
- Proved pre-start cancellation immediately before `startsAt` is rating-neutral, while cancellation exactly at `startsAt` is a rated forfeit.
- Proved committed ready-operation replay after expiry but before read/worker terminalization remains idempotent, then replays the truthful terminal snapshot after worker adjudication.
- Asserted immutable first-ready time, ready deadline, countdown start, and round deadline across later ready/cancel/replay/reconciler activity.
- Asserted zero duplicate/no-contest rating events and spoiler-safe serialized snapshots.
- Added failure-safe barrier release and `Promise.allSettled()` cleanup so test failures do not strand row/advisory locks or operation promises.

## Production behavior adjustment

- `SpeedGameplayService.reconcileDue()` now evaluates due selection against one authoritative clock value. The exact PostgreSQL integration runtime can substitute the controlled `SpeedTimingTestClock`; normal runtime continues to use PostgreSQL `clock_timestamp()`.
- Added an optional pre-commit reconciliation hook used only by the hostile PostgreSQL matrix to change scheduler generation after eligibility and prove rollback fencing.
- Reconciler transaction timeout remains 1,000 ms in normal runtime. It becomes 10,000 ms only when `NODE_ENV=test`, `APP_ENV=test`, and the exact Ticket 185 integration flag are all active, keeping barrier orchestration independent from production timeout behavior.

## Files changed

- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/test/speed-lifecycle-races-postgres.integration.test.ts`
- `apps/api/scripts/run-speed-lifecycle-races-postgres-integration.mjs`
- `apps/api/package.json`
- `agent-communication/responses/ticket-185-freya-deterministic-hostile-speed-lifecycle-race-matrix-response.md`
- `agent-communication/index.md`

## Verification evidence

### Official hostile stability gate

- `pnpm --filter @wordle-royale/api test:postgres:speed-lifecycle-races` — exit 0.
- 10/10 consecutive fresh schemas passed.
- 7/7 hostile cases per schema; 70/70 total.
- Every schema was dropped after its iteration.
- Final Ticket 185 schema/session residue query returned zero rows.

### Canonical regression gate

- Prisma generate — exit 0.
- Prisma validate — exit 0.
- API typecheck — exit 0.
- Web typecheck — exit 0.
- Contracts — 24/24 passed.
- Full API suite — 156/156 passed.
- Ticket 184 schema-readiness PostgreSQL — 8/8 passed.
- Ticket 177 Speed timing PostgreSQL — 7/7 passed.
- Ticket 158 Speed gameplay PostgreSQL — 5/5 passed.
- Standard matchmaking PostgreSQL — 3/3 passed.
- Dictionary/readiness PostgreSQL — 4/4 passed.
- Workspace validation — 9 packages passed.
- Workspace production build — passed.
- Production API start and `/readyz` smoke — `status=ok`.
- Secret scan — 260 source/config files passed.
- `git diff --check` — exit 0.

The first Standard and dictionary commands used a redacted URL placeholder and failed authentication before creating schemas. Both were rerun through a credential-safe Node launcher that assembled the repository-local URL from components; the corrected fresh-schema runs passed and cleaned up.

## Independent review

Final strict read-only review: PASS.

The reviewer confirmed deterministic lock attribution, both contested orderings, exact database-clock boundaries, generation rollback, idempotent replay, immutable timing, spoiler safety, rating neutrality/exactly-once behavior, test-only timeout gating, and cleanup discipline.

## Browser / visual checks

Not applicable. No rendered UI, client state, interaction, or accessibility behavior changed.

## Accessibility notes

No accessibility surface changed.

## Risks / follow-ups

- Ticket 185 is complete and is no longer a dependency blocker for Ticket 188.
- Tickets 183 and 187 remain separate pending dependencies for Ticket 188; Ticket 186 is already complete.
- Local PostgreSQL and Redis remain running for concurrent work. Stop later with `pnpm deps:down` when safe.
- No commit, push, merge, deployment, hosted infrastructure/database access, hosted mutation, provider change, or feature activation occurred.
