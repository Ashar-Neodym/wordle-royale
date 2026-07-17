# Ticket 159 — Ruby — Speed Rating Settlement and Read Models

## Status

Complete. Ticket 159 now settles server-adjudicated Speed 1v1 results atomically and idempotently under `speed_1v1_glicko_v1`, then exposes the same authoritative identity through result, profile, leaderboard, and mode-specific history reads.

## Implementation

### Atomic Speed settlement

- Added `apps/api/src/rating/speed-1v1-rating.ts` with the approved separate Speed calculation identity.
- Speed outcomes are derived only from persisted adjudication fields (`result`, `terminalReason`, `guessesUsed`, `solveTimeBucket`, and server receipt timing). Clients cannot submit an outcome or rating delta.
- `SpeedGameplayService` invokes rating finalization inside the same serializable transaction that writes terminal adjudication. Match terminal state, both active Speed profile updates, both apply events, placements, and the authoritative match report commit together.
- The settlement path uses the existing bounded whole-transaction retry behavior for retryable Prisma contention and unique races.
- Per-participant event keys are deterministic. Replays and concurrent calls read the already committed pair rather than applying a second delta.
- Forfeit and timeout outcomes use persisted server authority. Voided/no-contest or unranked matches create no apply events.
- Standard remains `standard_1v1_glicko_v1`; legacy `placement_mmr_v1` records remain unchanged.

### Authoritative read models

- Speed leaderboards and individual/all-mode profiles select only active rows whose exact mode/config identity is `speed_1v1` + `speed_1v1_glicko_v1`.
- Suspended, mismatched, prepared, and legacy rows cannot override the live Speed profile.
- Completed Speed results expose mode, ruleset, completion reason, participant result/terminal reason, guesses used, solve elapsed time, and rating algorithm/configuration.
- Cached `MatchReport.publicSummary` is not trusted as authority for Speed. Result reads rebuild it from persisted participant/adjudication/event truth, including repair of a stale legacy report.
- Public Speed timing/guess/terminal fields are omitted before terminal completion.
- Added mode-specific history reads:
  - `GET /profiles/:handle/ratings/:mode/history`
  - `GET /profiles/:handle/matches?mode=speed_1v1`
- Mode-specific Speed history requires terminal status, `speed_1v1_v1_75s`, non-null adjudication, and `speed_1v1_glicko_v1`, excluding prepared or legacy matches.
- The ranked mode catalog derives Speed `enabled`/`queueEnabled` from `SPEED_1V1_QUEUE_ENABLED` and exposes the exact ruleset/config identity. It remains fail-closed when the feature gate is off.

### Contracts and documentation

- Shared gameplay/result/history contracts recognize the Speed algorithm/config and optional Speed-specific terminal fields without breaking Standard payloads.
- API documentation covers settlement, guarded PostgreSQL verification, history routes, legacy coexistence, and feature-gated mode exposure.
- Ticket 159 adds no migration. It consumes the first-class Speed persistence introduced by the adjacent Ticket 158 migration.

## Primary files

- `apps/api/src/rating/speed-1v1-rating.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/src/leaderboard/leaderboard-read.service.ts`
- `apps/api/src/leaderboard/leaderboard.controller.ts`
- `apps/api/src/profile/profile-read.service.ts`
- `packages/contracts/src/gameplay/constants.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/api/test/speed-1v1-rating.test.ts`
- `apps/api/test/rating-finalization.test.ts`
- `apps/api/test/speed-rating-postgres.integration.test.ts`
- `apps/api/test/speed-gameplay-postgres.integration.test.ts`
- `apps/api/test/leaderboard-read-model.test.ts`
- `apps/api/test/leaderboard-controller.test.ts`
- `apps/api/test/profile-history-read-model.test.ts`
- `packages/contracts/src/common/contracts.test.ts`
- `apps/api/README.md`

## Verification evidence

All final commands exited `0`:

- `pnpm --filter @wordle-royale/api test` — 135/135 passed.
- `pnpm --filter @wordle-royale/api typecheck` — passed.
- `pnpm --filter @wordle-royale/contracts test` — 22/22 passed.
- `pnpm --filter @wordle-royale/rating-tools test` — 14/14 passed.
- `pnpm --filter @wordle-royale/api test:postgres:speed-gameplay` — 5/5 passed in a disposable PostgreSQL schema; proves automatic adjudication-to-settlement handoff for concurrent final guesses, forfeit, timeout, and no-contest.
- `pnpm --filter @wordle-royale/api test:speed-rating:postgres` with a guarded run-unique `ticket159_*` schema — 1/1 passed after all four migrations; proves exactly-once settlement and convergence across result, leaderboard, profile, and history reads, including stale-report repair. The schema was dropped afterward.
- `pnpm build` — passed for API, web, mobile, and workspace packages.
- `pnpm --filter @wordle-royale/api db:validate` — Prisma schema valid.
- `pnpm validate:workspace` — passed for 9 workspace packages.
- `pnpm secret-scan` — passed; 239 source/config files scanned.
- `/usr/bin/git diff --check` — passed.

Independent final review: PASS. Earlier review findings around automatic settlement, pre-completion timing exposure, stale report authority, suspended profile rows, feature gating, and mode-specific history were remediated and re-reviewed.

## Security and data notes

- No production database or hosted service was changed.
- Disposable PostgreSQL schemas were guarded by `ticket159_*` names and dropped after verification.
- No credential was persisted in source or response artifacts.
- No answer word, answer hash, salt, dictionary content, or raw opponent guess was added to result/profile/history DTOs.
- No destructive rewrite or relabeling of Standard or legacy rating history occurs.

## Follow-ups

- Yuna can wire the Speed feature gate only after the Wave T readiness/deployment checkpoint approves it.
- Classic and Multiplayer remain disabled and require separate algorithm/product approval before settlement or live read authority is enabled.
