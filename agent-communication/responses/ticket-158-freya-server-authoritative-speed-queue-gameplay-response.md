# Ticket 158 — Server-Authoritative Speed Queue and Gameplay Response

Task: Ticket 158 — Server-Authoritative Speed Queue and Gameplay
Agent: Freya (backend implementation)
Status: **Complete; Ticket 158 backend is ready for Ticket 160 after Ticket 159 completes, then Ticket 161 independent QA**
Date: 2026-07-16

## Summary

Implemented the approved `speed_1v1` backend contract as a fail-closed, rated-only automatic queue with server-authoritative match creation, readiness, countdown, puzzle timing, guess validation, reconnect state, terminal adjudication, expiry reconciliation, and durable idempotency.

Speed matches now use one persisted shared puzzle, a 20-second ready window, 3-second synchronized countdown, 75-second database-clock round deadline, six accepted guesses, and 100 ms solve-time buckets. Client timestamps are retained only as advisory metadata and never decide acceptance, elapsed time, standings, or rating outcomes.

Standard matchmaking behavior and its shared lifecycle budget remain intact. No hosted database, deployment, provider configuration, or production environment was modified.

## Implemented behavior

### Speed queue and ranked-activity exclusion

- Added dedicated Speed ticket contracts and routes under `/matchmaking/speed-1v1/tickets`.
- Added the fail-closed `SPEED_1V1_QUEUE_ENABLED` feature flag; only explicit `1`, `true`, or `yes` enables the queue.
- Kept the queue rated-only and mode-exact.
- Generalized automatic queue policy without changing Standard's rating algorithm, candidate windows, provisional filtering, repeat-opponent policy, transaction budget, or lifecycle coordinator.
- Added one-active-ranked-activity enforcement across Standard and Speed tickets.
- Same-user queue mutations and status-triggered pairing use transaction-scoped PostgreSQL advisory locks.
- Candidate activity locks are acquired non-blockingly to avoid symmetric first-join waits and foreign-key row-lock deadlocks.
- Both users' exact active ticket and active match state are revalidated under activity locks immediately before match creation.
- Pairing remains serializable, dictionary-locked/revalidated, idempotent, and conditional on both tickets still being queued.

### Server-authoritative match lifecycle

- Speed pairing creates one pending ranked match with:
  - `rankedMode=speed_1v1`;
  - locked ruleset `speed_1v1_v1_75s`;
  - locked adjudication version `speed_1v1_adjudication_v1`;
  - locked rating identity `speed_1v1_glicko_v1`;
  - one shared hashed dictionary answer;
  - two participants;
  - a persisted 20-second ready deadline.
- The second ready acknowledgement persists one shared reveal instant three seconds in the future.
- `MatchRound.startedAt` is the reveal instant and `deadlineAt` is persisted once as `startedAt + 75 seconds`.
- All authoritative timing samples PostgreSQL `clock_timestamp()`.
- Guess acceptance is inclusive at the deadline edge and rejects later receipts without consuming an attempt.
- Solve elapsed time is clamped to the approved round envelope and bucketed in exact 100 ms intervals.

### Guess validation and idempotency

- The server validates dictionary membership, banned words, feedback, solve state, attempt count, and terminal state.
- Ready, guess, and forfeit mutations persist request hashes and replay snapshots.
- Reusing a participant-scoped request ID with different input returns a stable conflict.
- The legacy globally unique `GuessAttempt.idempotencyKey` is namespaced by participant ID, so two players or later matches may safely reuse the same client UUID.
- A real PostgreSQL regression submits the same request UUID concurrently for both players and verifies both accepted guesses persist.
- Generic client-driven match completion is rejected for Speed; only authoritative gameplay/reconciliation can terminalize it.

### Deterministic adjudication and reconciliation

- Result ordering is:
  1. void/no-contest;
  2. explicit post-reveal forfeit;
  3. solve status;
  4. fewer accepted guesses;
  5. lower server solve-time bucket;
  6. draw for equal guess count/equal bucket or both failures.
- Pre-reveal ready expiry becomes a no-contest with no rating application.
- Post-reveal forfeit produces one winner and one loser.
- Deadline expiry terminalizes unresolved participants exactly once and invokes authoritative settlement.
- Concurrent final guesses serialize through match, round, and participant locks and produce one terminal adjudication.
- The background reconciler claims due matches with `FOR UPDATE ... SKIP LOCKED` and uses the same reconciliation path as reconnect and gameplay requests.
- Replayed rating finalization preserves the match's persisted completion time instead of replacing it with the replay time.

### Spoiler and readiness boundaries

- Participant snapshots expose the viewer's accepted guesses and feedback.
- Opponent state is progress-only: accepted guess count and terminal state, with no answer, guess text, feedback, exact solve time, or bucket leakage.
- Dictionary selection remains locked and revalidated before match creation.
- Readiness reports Speed's schema/dictionary dependency only when the feature flag is enabled.
- Expiry reconciliation is registered as an application service without changing hosted infrastructure.

## Schema and migration

Added expand-only Speed persistence fields and supporting indexes for:

- match ruleset, ready deadline, adjudication, and completion identity;
- round deadline;
- participant readiness, authoritative event time, terminal reason, guess count, elapsed time, bucket, and result;
- durable match mutation requests;
- due ready/deadline reconciliation work;
- one active ranked queue ticket per user across supported automatic queue modes.

The migration applied cleanly to fresh disposable PostgreSQL schemas and to the production-start smoke schema.

## Ticket 158 files changed

- `.env.example`
- `apps/api/package.json`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260716000000_speed_1v1_gameplay/migration.sql`
- `apps/api/scripts/run-speed-gameplay-postgres-integration.mjs`
- `apps/api/src/app.module.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/src/gameplay/gameplay.controller.ts`
- `apps/api/src/gameplay/speed-1v1-rules.ts`
- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts`
- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/matchmaking/matchmaking-config.ts`
- `apps/api/src/matchmaking/matchmaking-lifecycle.ts`
- `apps/api/src/matchmaking/matchmaking.controller.ts`
- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/test/matchmaking.test.ts`
- `apps/api/test/speed-1v1-rules.test.ts`
- `apps/api/test/speed-gameplay-controller.test.ts`
- `apps/api/test/speed-gameplay-postgres.integration.test.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`
- `packages/contracts/src/matchmaking/schemas.ts`
- `packages/contracts/src/matchmaking/speed-contracts.test.ts`
- `packages/contracts/src/matchmaking/types.ts`
- `agent-communication/responses/ticket-158-freya-server-authoritative-speed-queue-gameplay-response.md`
- `agent-communication/index.md`

Concurrent Ticket 159 rating/read-model changes in the shared worktree were preserved and were not treated as solely owned Ticket 158 work.

## Commands run + exit codes

```text
pnpm --filter @wordle-royale/contracts test
exit 0 — 22 passed, 0 failed

pnpm --filter @wordle-royale/api exec node --import tsx --test \
  test/matchmaking.test.ts \
  test/speed-1v1-rules.test.ts \
  test/speed-gameplay-controller.test.ts
exit 0 — 34 passed, 0 failed

pnpm --filter @wordle-royale/api test:postgres:speed-gameplay
exit 0 — 5 passed, 0 failed; fresh schema migrated, seeded, tested, and dropped

pnpm --filter @wordle-royale/api test:postgres:matchmaking
exit 0 — 3 passed, 0 failed; Standard concurrency preserved on a fresh schema

pnpm --filter @wordle-royale/api test:postgres:preview-dictionary
exit 0 — 4 passed, 0 failed; dictionary readiness/revalidation/rollback preserved

pnpm --filter @wordle-royale/api test
exit 0 — 135 passed, 0 failed

pnpm --filter @wordle-royale/api typecheck
exit 0

pnpm validate:workspace
exit 0 — workspace scaffold validation passed for 9 packages

pnpm build
exit 0 — contracts, API, web, mobile, and shared packages built successfully

pnpm --filter @wordle-royale/api db:validate
exit 0 — Prisma schema valid

pnpm smoke:api:prod-start
exit 0 — migrations applied/no pending migrations; `/readyz` returned status=ok

pnpm secret-scan
exit 0 — 239 source/config files scanned

git diff --check
exit 0
```

The normal API suite reports environment-gated PostgreSQL tests as skipped internally; each dedicated disposable-schema harness was run separately and passed as recorded above.

One production-smoke attempt initially timed out on Prisma's migration advisory lock while another local process held it. The immediate retry passed. A few Standard harness attempts also failed before schema creation when a redacted placeholder URL was accidentally supplied; the corrected credential-safe local invocation passed. No hosted database was contacted or mutated, and no credential is recorded here.

## Independent review

Three focused independent review passes were completed.

- The first identified a candidate activity race and globally colliding client-controlled `GuessAttempt` keys.
- Those findings were fixed with candidate advisory locking, final two-user ticket/match revalidation, participant-namespaced guess keys, and a same-request-ID concurrent PostgreSQL regression.
- The second found that status-triggered pairing did not yet acquire the requester's activity lock. Both current-ticket and by-ID paths now acquire it before any pairing work.
- The final review inspected the resulting locking and idempotency paths and returned **PASS — no blocker remains**.

## Browser/visual checks

Not applicable. Ticket 158 changes backend contracts, persistence, queueing, reconciliation, and gameplay authority only; it does not change UI or layout.

## Accessibility notes

No UI changes.

## Risks and follow-ups

- Ticket 160 owns the live Speed queue, ready gate, countdown, reconnect, and gameplay UX against these contracts.
- Ticket 161 should independently rerun end-to-end queue, same-puzzle timing, reconnect, expiry, idempotency, spoiler, and rating checks.
- Feature enablement remains fail-closed. Operators must explicitly set `SPEED_1V1_QUEUE_ENABLED=true` only after the approved checkpoint/deployment sequence.
- The expiry worker is process-local polling over database-claimed work; correctness is database-locked and multi-instance safe, but operational cadence should be observed in hosted smoke testing.
- No commit, push, deployment, hosted database mutation, or provider change was performed.
