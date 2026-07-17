# Ticket 166 — Fail-Closed Speed Catalog and Locked Identity Response

Task: Ticket 166 — Fail-Closed Speed Catalog and Locked Identity
Agent: Freya (frontend/backend integration)
Status: **Complete; ready for Ticket 171 recheck**
Date: 2026-07-16

## Summary

Added one authoritative Speed operational-readiness source and used it for the public catalog plus every Speed queue/gameplay operation. Speed now advertises and operates only when the explicit feature flag, database, application schema, qualifying dictionary, and expiry reconciler are all healthy.

The public Speed mode identity is locked to `speed_1v1`, `speed_1v1_v1_75s`, `speed_1v1_glicko_v1`, and the approved 75s/20s/3s/6-guess/100ms time-control fields with `tieBreaker=server_solve_time_bucket`.

## Implemented behavior

- Added `SpeedOperationalReadinessService` with sanitized fail-closed `503 speed_1v1_unavailable` behavior.
- Added shared runtime reconciler health state.
- Reconciler health becomes ready only after a successful due-work pass and clears after every failed pass.
- Reconciler dependency checks intentionally exclude its own health bit while retaining flag/database/schema/dictionary checks.
- Catalog `enabled` and `queueEnabled` are derived from operational readiness rather than the environment flag alone.
- Speed join/current/by-ID/cancel, ready, guess, forfeit, state, and reconciliation paths use the shared readiness source.
- Enabled-Speed database failures during generic gameplay route dispatch are normalized before raw persistence details can escape.
- Standard mode catalog and Standard queue behavior remain independent.
- Shared Zod contract tests lock the immutable Speed catalog identity.

## Files changed

- `apps/api/src/app.module.ts`
- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts`
- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/src/gameplay/speed-runtime-health.service.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/health/speed-operational-readiness.service.ts`
- `apps/api/src/leaderboard/leaderboard-read.service.ts`
- `apps/api/src/leaderboard/leaderboard.controller.ts`
- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/test/leaderboard-controller.test.ts`
- `apps/api/test/leaderboard-read-model.test.ts`
- `apps/api/test/speed-operational-paths.test.ts`
- `apps/api/test/speed-operational-readiness.test.ts`
- `apps/web/src/lib/api-client.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`
- `packages/contracts/src/matchmaking/speed-contracts.test.ts`

## Commands run + exit codes

```text
pnpm --filter @wordle-royale/contracts test
exit 0 — 24 passed, 0 failed

node --import tsx --test test/speed-operational-readiness.test.ts test/speed-operational-paths.test.ts
exit 0 — 7 passed, 0 failed

pnpm --filter @wordle-royale/api test
exit 0 — 143 passed, 0 failed

pnpm --filter @wordle-royale/api test:postgres:speed-gameplay
exit 0 — 5 passed, 0 failed; disposable schema migrated, seeded, tested, and dropped

pnpm --filter @wordle-royale/api test:postgres:matchmaking
exit 0 — 3 passed, 0 failed; Standard concurrency preserved

pnpm --filter @wordle-royale/api test:postgres:preview-dictionary
exit 0 — 4 passed, 0 failed; dictionary readiness/rollback preserved

pnpm validate:workspace
exit 0 — 9 workspace packages validated

pnpm build
exit 0 — API, web, mobile, contracts, and shared packages built

pnpm --filter @wordle-royale/api db:validate
exit 0 — Prisma schema valid

pnpm --filter @wordle-royale/api smoke:prod-start
exit 0 — `/readyz` returned status=ok

node scripts/secret-scan.mjs
exit 0 — 249 source/config files scanned

git diff --check
exit 0
```

The first Standard/dictionary harness invocations lacked their required integration URL and exited before schema creation. They were rerun with the credential-safe local disposable-schema configuration and passed as recorded above. No hosted system was contacted.

## Independent review

The initial review identified three Ticket 166 blockers: incorrect tie-breaker wording, reconciler health that could remain falsely ready, and an unsanitized generic dispatch lookup during database failure. All three were corrected. Final independent re-review returned **PASS — no blocker remains**.

## Browser/visual checks

Not applicable to layout or visual states. This ticket changes operational truth and API metadata only; contract, controller, production build, and production-start smoke checks passed.

## Accessibility notes

No rendered controls, focus behavior, labels, or contrast changed.

## Risks/follow-ups

- Speed remains deliberately fail-closed until `SPEED_1V1_QUEUE_ENABLED` is explicit and every dependency passes.
- Ticket 171 should independently force each dependency failure and verify catalog plus operation paths return the locked unavailable behavior.
- No commit, push, deployment, hosted database mutation, or provider change was performed.
