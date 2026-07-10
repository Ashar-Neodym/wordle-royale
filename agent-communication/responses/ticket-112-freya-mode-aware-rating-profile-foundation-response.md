# Ticket 112 — Mode-Aware Rating Profile Foundation Response

Agent: Freya (frontend/API)
Status: Complete
Date: 2026-07-09

## Summary

Implemented the backend foundation for separate chess-style ranked ladders without rolling out new live matchmaking behavior.

## Changes

- Added `RankedMode` enum and migrated rating-related mode columns from generic `ranked` to `standard_1v1` as the primary ladder.
- Extended `RatingProfile` with per-mode/Glicko-ready fields:
  - `wins`, `losses`, `draws`, `abandons`
  - `peakRating`
  - `ratingDeviation`
  - `ratingVolatility`
  - `lastRatedAt`
- Added migration:
  - `apps/api/prisma/migrations/20260709000000_mode_aware_rating_profiles/migration.sql`
- Updated constants/contracts for ranked modes:
  - `standard_1v1`
  - `speed_1v1`
  - `classic_1v1`
  - `multiplayer_lobby`
- Updated rating creation/finalization so new ranked rating profiles use:
  - `mode = standard_1v1`
  - default rating `1500`
  - provisional games from shared contract constants
  - win/loss/draw/abandon and peak/last-rated fields on update
- Added read model support for mode-aware profile and leaderboard data:
  - `GET /ranked/modes`
  - `GET /leaderboard?mode=standard_1v1`
  - `GET /profiles/:handle/rating?mode=standard_1v1`
  - `GET /profiles/:handle/ratings`
- Preserved backward-compatible current web/profile shapes by keeping `rating` plus adding `ratings` in profile summary contracts.
- Updated seeds and tests to use default `1500` rating and `standard_1v1` rating profile mode.

## Files changed for this ticket

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260709000000_mode_aware_rating_profiles/migration.sql`
- `apps/api/prisma/seed-fixtures.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/src/leaderboard/leaderboard-read.service.ts`
- `apps/api/src/leaderboard/leaderboard.controller.ts`
- `apps/api/src/profile/profile-read.service.ts`
- `apps/api/src/profile/profile.service.ts`
- `apps/api/test/gameplay-controller.test.ts`
- `apps/api/test/leaderboard-controller.test.ts`
- `apps/api/test/leaderboard-read-model.test.ts`
- `apps/api/test/profile-history-read-model.test.ts`
- `apps/api/test/rating-finalization.test.ts`
- `packages/contracts/src/auth/schemas.ts`
- `packages/contracts/src/gameplay/constants.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`

## Verification

```bash
CI=true pnpm --filter @wordle-royale/api test
# exit 0 — 48 tests passed

CI=true pnpm --filter @wordle-royale/api build
# exit 0

CI=true pnpm smoke:api:prod-start
# exit 0 — readyz passed, production-mode API started successfully
```

## Notes / follow-ups

- `multiplayer_lobby` is exposed as a prepared ranked mode but marked `enabled: false` until multiplayer abuse policy and rules are locked.
- Existing live ranked start/finalization remains mapped to `standard_1v1`; no new live matchmaking paths were enabled.
- The prod-start smoke script started local Postgres/Redis and left them running for reuse, consistent with its output; use `pnpm deps:down` when those local dependencies should be stopped.
