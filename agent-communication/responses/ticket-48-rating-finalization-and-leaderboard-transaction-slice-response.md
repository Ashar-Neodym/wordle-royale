# Ticket 48 — Rating Finalization and Leaderboard Transaction Slice Response

## Summary

Implemented the first rating finalization transaction slice on the ranked backend service.

The new service method `GameplayPersistenceService.finalizeRankedMatchRatings(...)`:

- finalizes a ranked match result summary from persisted participant outcomes/scores,
- creates default-1200 V1 rating events safely,
- updates ranked rating profiles for leaderboard-style reads,
- writes final participant placements,
- upserts a spoiler-safe `MatchReport.publicSummary`,
- is idempotent for already-finalized matches, and
- skips rating application for voided matches.

No public rating route was added for this ticket.

## Decisions / Recommendations

1. **Kept this as an internal service slice.**
   - Ticket 48 explicitly says not to expose a public route unless coordinated with Freya/Ticket 47.
   - The REST controller added by neighboring Wave G work remains gameplay-focused; this ticket only adds rating finalization logic.

2. **Used `placement_mmr_v1` placeholder MMR.**
   - New/unrated profiles are created at the shared contract default rating `1200`.
   - Two-player decisive matches apply `+16/-16`.
   - Larger matches scale placement deltas around the field midpoint.
   - Tied scores share placement/placement group.
   - This is documented in `apps/api/README.md` as a placeholder V1 algorithm.

3. **Mapped one logical rating event to per-participant Prisma rows.**
   - Existing schema models `RatingEvent` per profile/participant.
   - The service stores per-participant rows with unique physical idempotency keys: `rating:<matchId>:placement_mmr_v1:<participantId>`.
   - The shared logical idempotency key remains in metadata and returned contract output: `rating:<matchId>:placement_mmr_v1`.

4. **Preserved void/reversal compatibility.**
   - Applied events are `type: "apply"`.
   - `voidedByEventId` and `reversalOfEventId` are explicitly set to `null` for applied rows.
   - Voided matches do not apply new rating rows and produce a result summary with `ratingEvent: null`.
   - Future admin void/reversal work can populate the existing schema fields rather than overwriting applied history.

5. **Leaderboard V1 is profile-backed, not snapshot-backed.**
   - This ticket updates `RatingProfile.rating` transactionally.
   - `LeaderboardSnapshot` generation remains future work.

## Detailed Output

### Service behavior added

Added `finalizeRankedMatchRatings(input)` to `apps/api/src/gameplay/gameplay-persistence.service.ts`.

Input:

```ts
{
  matchId: string;
  reason?: 'all_players_final' | 'timeout' | 'forfeit' | 'abandoned' | 'voided';
  now?: Date;
}
```

Output:

```ts
RankedMatchResultSummary
```

Main flow:

1. Load the match by `matchId`.
2. Validate it is ranked and uses `placement_mmr_v1`.
3. Load participants and compute final standings from persisted `finalScore` values.
4. Check for existing applied rating events for the match/algorithm.
   - If found, reconstruct and return the logical rating event without applying deltas again.
5. If the match/reason/participant state is voided, skip rating application and write a result summary with `ratingEvent: null`.
6. Otherwise, for each participant:
   - find or create a ranked `RatingProfile` at default `1200`,
   - compute placement delta,
   - create a per-participant `RatingEvent`,
   - update profile rating/matches/provisional count.
7. Update participant placements.
8. Mark match completed.
9. Upsert `MatchReport` with `participantData`, `publicSummary`, and spoiler-safe share metadata.

### Tests added

Added `apps/api/test/rating-finalization.test.ts` covering:

- default-1200 profile creation,
- `+16/-16` V1 rating deltas,
- rating event row creation,
- rating profile/leaderboard update behavior,
- final participant placements and match report summary,
- idempotent repeated finalization with no double-application,
- voided match behavior with no rating rows/profiles created.

### Documentation updated

Updated `apps/api/README.md` to document:

- the internal `finalizeRankedMatchRatings` service boundary,
- `placement_mmr_v1` placeholder algorithm,
- default rating `1200`,
- logical and physical idempotency key behavior,
- voided-match no-rating behavior,
- leaderboard snapshot follow-up status.

## Open Questions

None blocking this ticket.

Non-blocking for later:

1. Should a future admin/internal endpoint trigger `finalizeRankedMatchRatings`, or should match completion call it automatically from gameplay endpoints once all participants are terminal?
2. Should `LeaderboardSnapshot` be generated eagerly after every applied rating event or periodically from `RatingProfile` rows?
3. Should V2 rating move from placeholder placement MMR to Elo/Glicko-style expected-score math?

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns public API endpoint integration.
- **Exact task:** Wire match completion/result endpoints to call `GameplayPersistenceService.finalizeRankedMatchRatings(...)` only when the server-authoritative match is terminal.
- **Inputs/context they need:** This response, Ticket 45 contract, Ticket 47 endpoints, `apps/api/src/gameplay/gameplay-persistence.service.ts`.
- **Expected output back to Athena:** Endpoint tests showing completed match result includes rating summary and active/incomplete matches do not finalize ratings.

### Follow-up Ticket 2

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns backend data/transaction correctness.
- **Exact task:** Implement explicit void/reversal service for already-applied rating events using `RatingEventType.void`/`reversal`, `voidedByEventId`, and `reversalOfEventId`.
- **Inputs/context they need:** This response, Prisma `RatingEvent` schema, current rating finalization tests.
- **Expected output back to Athena:** Tests proving applied rating deltas can be reversed without overwriting historical events.

### Follow-up Ticket 3

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA.
- **Exact task:** In Wave G QA, verify result/rating summary matches persisted `RatingProfile`, `RatingEvent`, `MatchParticipant`, and `MatchReport` state.
- **Inputs/context they need:** Ticket 45/47/48 responses and local DB smoke setup.
- **Expected output back to Athena:** DB-backed pass/fail matrix with exact commands/queries and mismatch notes.

## Files Changed

- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/src/gameplay/gameplay.controller.ts`
- `apps/api/test/rating-finalization.test.ts`
- `apps/api/README.md`
- `agent-communication/responses/ticket-48-rating-finalization-and-leaderboard-transaction-slice-response.md`

Note: `apps/api/src/gameplay/gameplay.controller.ts` existed from neighboring Wave G REST endpoint work. I made one narrow TypeScript compatibility fix so the API build passed with `exactOptionalPropertyTypes`.

## Tests / Commands Run

### RED check

```bash
pnpm --filter @wordle-royale/api test
```

Exit code: `1` before implementation.

Relevant failure:

```text
TypeError: service.finalizeRankedMatchRatings is not a function
```

### API test

```bash
pnpm --filter @wordle-royale/api test
```

Exit code: `0`.

Relevant output:

```text
▶ GameplayPersistenceService rating finalization
  ✔ creates default-1200 rating events, updates rating profiles, standings, and match report transactionally
  ✔ is idempotent for an already-finalized match and does not apply rating deltas twice
  ✔ does not apply rating events for voided matches
✔ GameplayPersistenceService rating finalization
ℹ tests 22
ℹ pass 22
ℹ fail 0
```

### API build/typecheck

```bash
pnpm --filter @wordle-royale/api build
```

Exit code: `0`.

Relevant output:

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
```

### Prisma validation

```bash
pnpm --filter @wordle-royale/api db:validate
```

Exit code: `0`.

Relevant output:

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

### Secret scan

```bash
pnpm secret-scan
```

Exit code: `0`.

Relevant output:

```text
Secret scan passed (160 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

### Root workspace test

```bash
pnpm test
```

Exit code: `0`.

Relevant output:

```text
Workspace scaffold validation passed (9 workspace packages).
```

### Root workspace build warning

```bash
pnpm build
```

Exit code: `1`.

The API, contracts, mobile, rating-tools, word-tools, fixtures, game-engine, and design-token builds reached/pass their local build steps, but the root build failed in the web app on an existing TypeScript portability issue:

```text
apps/web build: ./src/app/layout.tsx:10:25
Type error: The inferred type of 'RootLayout' cannot be named without a reference to '.pnpm/@types+react@19.1.17/node_modules/@types/react'. This is likely not portable. A type annotation is necessary.
```

This is outside the Ticket 48 backend rating slice. I did not modify the web layout in this ticket.

## Evidence / Result

Implemented and verified the requested backend/data transaction slice:

- Rating finalization service exists and is covered by service tests.
- New/unrated players use default rating `1200`.
- Per-participant rating rows are written with reversible/void-compatible schema fields.
- `RatingProfile.rating` is updated transactionally for leaderboard-style reads.
- Existing events make repeated finalization idempotent and prevent double-application.
- Voided matches do not create rating events or profiles.
- No public route was added.
- No secrets or real `.env` files were created.

## Risks / Blockers

### Blockers

None for Ticket 48 acceptance.

### Warnings

1. Root `pnpm build` currently fails in `apps/web/src/app/layout.tsx` with a TypeScript portability annotation issue outside this ticket's backend scope.
2. This slice uses mocked Prisma service tests, not a live Postgres transaction smoke. API schema validation passed, but DB-backed rating finalization should be smoke-tested once the endpoint/invocation path is wired.
3. `LeaderboardSnapshot` rows are not generated yet; V1 leaderboard reads should use `RatingProfile.rating` until a later snapshot job/service is added.
4. The rating algorithm is intentionally placeholder `placement_mmr_v1`; it should be revisited before competitive launch.
