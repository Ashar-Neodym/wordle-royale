# Ticket 53 — Leaderboard and Rated Profile Read Model Slice

Task: Add the first rated profile / leaderboard read-model slice.
Agent: Ruby (backend)
Status: Done

## Summary

Implemented a deterministic, local-first leaderboard/rated-profile read model backed by durable `RatingProfile` rows.

This gives Freya/Luna a simple chess.com/lichess-style competitive surface:

- leaderboard rows show rank, handle/display name, rating, matches played, provisional state, and provisional remaining count;
- profile rating lookup shows a known player’s current rated identity;
- known-but-unrated players get the shared default rating `1200`, `matchesPlayed: 0`, and `provisional: true` so profile pages can render before first ranked match;
- reads do not touch match rounds, guesses, dictionary words, answer hashes, or answer salts, preserving spoiler safety.

## Files changed

- `apps/api/src/leaderboard/leaderboard-read.service.ts`
  - New read service over `RatingProfile`.
  - Deterministic ordering: rating desc, matches played desc, then identity tie-break.
  - Rated profile lookup by handle with default unrated behavior.
- `apps/api/src/leaderboard/leaderboard.controller.ts`
  - New low-risk read endpoints.
- `apps/api/src/app.module.ts`
  - Registered `LeaderboardController` and `LeaderboardReadService`.
- `apps/api/test/leaderboard-read-model.test.ts`
  - Service tests for sorted leaderboard output and unrated/default profile behavior.
- `apps/api/test/leaderboard-controller.test.ts`
  - REST envelope tests for leaderboard and profile rating endpoints.
- `apps/api/README.md`
  - Documented endpoints and how the read model supports the competitive loop.
- `apps/api/src/gameplay/gameplay.controller.ts`
  - Small TypeScript exact-optional fix around ranked completion `reason` forwarding while verifying the current API build.

## API/data contract impact

Added read-only API routes:

- `GET /leaderboard?limit=20`
  - Returns shared envelope with `data.mode`, `data.algorithm`, `data.algorithmConfigVersion`, `data.generatedAt`, and `data.entries[]`.
  - Entries include: `rank`, `userId`, `handle`, `displayName`, `rating`, `matchesPlayed`, `provisional`, `provisionalRemaining`, `algorithm`, `algorithmConfigVersion`.
  - `limit` is normalized to `1..100`; default is `20`.
- `GET /profiles/:handle/rating`
  - Returns shared envelope with rated profile data for a known handle.
  - Known users without a ranked profile return default `rating: 1200`, `matchesPlayed: 0`, `provisional: true`, `unrated: true`.

No migration added. No external service added. No paid dependency added. No new `@wordle-royale/contracts` schema was required for this first local read slice.

## Verification

Commands run from `/home/ashar/Desktop/hermes-projects/wordle-royale`:

```bash
pnpm --filter @wordle-royale/api test
```

Exit code: 0

Evidence:

```text
ℹ tests 29
ℹ suites 6
ℹ pass 29
ℹ fail 0
```

```bash
pnpm --filter @wordle-royale/api build
```

Exit code: 0

Evidence:

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @wordle-royale/api db:validate
```

Exit code: 0

Evidence:

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

```bash
pnpm validate:workspace
```

Exit code: 0

Evidence:

```text
Workspace scaffold validation passed (9 workspace packages).
```

```bash
pnpm secret-scan
```

Exit code: 0

Evidence:

```text
Secret scan passed (165 source/config files scanned).
```

## Security/data risks

- Spoiler safety: low risk. The leaderboard/profile read service only reads `RatingProfile`, `UserAccount`, and `UserProfile` data; it does not read dictionary words, guesses, answers, or answer hashes.
- Auth/privacy: current endpoints are public local-first read models. Before production, decide whether profile/rating visibility should respect profile privacy settings.
- Ranking semantics: current `placement_mmr_v1` is a placeholder deterministic MMR-style rating, not a final Elo/Glicko/TrueSkill model.
- Data size: endpoint caps reads at 100 entries for now.

## Blockers

None.

## Warnings / follow-ups

- Freya can now wire calm lichess-style leaderboard/profile UI against:
  - `GET /leaderboard?limit=20`
  - `GET /profiles/:handle/rating`
- Elisa may want to promote these response shapes into `@wordle-royale/contracts` once the UI shape stabilizes.
- Production/privacy work should decide whether private profiles can appear on public leaderboards.
