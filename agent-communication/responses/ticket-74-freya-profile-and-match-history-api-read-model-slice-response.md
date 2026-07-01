# Ticket 74 — Profile and Match History API Read Model Slice — Response

## Summary

Ticket 74 is complete.

I added the first real API read-model slice for profile and ranked match history data so Wave K profile/history pages can use live, spoiler-safe data instead of placeholders.

Implemented endpoints:

- `GET /profiles/me/summary`
- `GET /profiles/:handle/summary`
- `GET /matches/history/me?limit=<n>&cursor=<cursor>`

The endpoints return shared success envelopes via the existing `ok(...)` helper and preserve the existing local/dev fixture-user header flow with `x-wordle-dev-user-id`.

## Decisions / Recommendations

1. **Profile summary is a read-only contract.**
   - No account/settings writes were added.
   - `profile/me` remains compatible with the older stub/profile endpoint.

2. **Current-user profile comes first; public handle summary is included.**
   - Ticket 73 marked public profile as optional if capacity allowed.
   - I added `GET /profiles/:handle/summary` because it was small once the current-user read model existed.

3. **History is spoiler-safe by construction.**
   - Match history summaries include match status, participant identity, placement/outcome/final score, and completed-match rating deltas.
   - They do **not** include active answer plaintext, answer hashes, answer salts, hidden guesses, dictionary internals, or raw report blobs.
   - Tests explicitly assert no `answerWordHash`, `answerWordSaltRef`, or fixture spoiler marker appears in API responses.

4. **Active/in-progress matches do not expose rating deltas.**
   - `ratingDelta` is only surfaced when the match status is completed.
   - Active-match participants show `ratingDelta: null`.

5. **Empty states are real.**
   - The API returns an unrated default profile (`rating: 1200`, `matchesPlayed: 0`, `unrated: true`) and an empty history list for a seeded user with no ranked matches.

## Detailed Output

### Shared contracts added/refined

Added gameplay read-model schemas/types:

- `matchHistoryParticipantSchema`
- `matchHistoryViewerSchema`
- `matchHistorySummarySchema`
- `matchHistoryListSchema`
- `matchDetailSummarySchema`

Added profile summary schemas/types:

- `profileRatingSummarySchema`
- `profileSummarySchema`
- `currentProfileSummarySchema`
- `publicProfileSummarySchema`

### API read model service

Added `ProfileReadService` with:

- current-profile summary lookup,
- public profile summary lookup by handle,
- ranked match history list lookup,
- spoiler-safe match-history summary mapping,
- rating/rank default handling for unrated users.

### API routes

Added to existing controllers:

```http
GET /profiles/me/summary
GET /profiles/:handle/summary
GET /matches/history/me?limit=20&cursor=<cursor>
```

All routes return the existing shared success envelope shape:

```ts
{
  data: ...,
  error: null,
  requestId: string
}
```

### Dev/auth stub consistency

- `GET /profiles/me/summary` accepts optional `x-wordle-dev-user-id` for local fixture switching.
- `GET /matches/history/me` uses the same fixture-switch header path as ranked gameplay endpoints.
- Added the seeded empty fixture user ID to the local fixture set for empty-state history verification.

## Open Questions

None blocking.

Potential future product/API refinements:

1. Add a dedicated `GET /matches/:matchId/summary` route using the new `matchDetailSummarySchema` if Ticket 75 needs a one-call match detail page.
2. Decide whether public profile match history should get its own route (`GET /profiles/:handle/matches`) or if `GET /profiles/:handle/summary` with recent matches is enough for Wave K.
3. Add cursor encoding/decoding beyond timestamp cursors if history pagination grows more complex.

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns web route depth.
- **Exact task:** Update `/profile`, `/history`, and optional public profile links to consume `GET /profiles/me/summary`, `GET /profiles/:handle/summary`, and `GET /matches/history/me` with empty/offline states.
- **Inputs/context:** This Ticket 74 response, `docs/2026-07-01-product-navigation-route-contracts-v2.md`, current `apps/web/src/lib/api-client.ts`.
- **Expected output:** Live web profile/history UI, route-level loading/error/empty states, web/root build output.

### Follow-up Ticket 2

- **Target agent:** Freya or Luna
- **Why that agent is needed:** Match detail may need a one-call API or page composition.
- **Exact task:** If `/matches/:matchId` needs a single read endpoint, implement `GET /matches/:matchId/summary` using `matchDetailSummarySchema` and preserve spoiler safety for active matches.
- **Inputs/context:** `matchDetailSummarySchema`, existing `GET /matches/:matchId/state`, `GET /matches/:matchId/result`.
- **Expected output:** Optional API convenience endpoint plus tests for active/completed/voided detail states.

## Files Changed

Ticket 74 files changed:

- `apps/api/src/app.module.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/gameplay/gameplay.controller.ts`
- `apps/api/src/profile/profile-read.service.ts`
- `apps/api/test/profile-history-read-model.test.ts`
- `packages/contracts/src/auth/schemas.ts`
- `packages/contracts/src/auth/types.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`
- `agent-communication/responses/ticket-74-freya-profile-and-match-history-api-read-model-slice-response.md`

Pre-existing unrelated working-tree changes were present before/alongside this ticket, including Ticket 72/73/78 response/doc changes and lobby/analytics files. I did not modify those for Ticket 74.

## Tests / Commands Run

Working directory:

```bash
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Commands:

```bash
pnpm --filter @wordle-royale/api test
```

Exit code: `0`

Key output:

```text
ℹ tests 37
ℹ suites 7
ℹ pass 37
ℹ fail 0
```

```bash
pnpm --filter @wordle-royale/api build
```

Exit code: `0`

Key output:

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @wordle-royale/contracts test
```

Exit code: `0`

Key output:

```text
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

```bash
pnpm --filter @wordle-royale/contracts build
```

Exit code: `0`

Key output:

```text
$ tsc -p tsconfig.json
```

```bash
pnpm build
```

Exit code: `0`

Key output:

```text
apps/web build: ✓ Compiled successfully in 2.6s
apps/mobile build: Done
apps/api build: Done
```

```bash
pnpm secret-scan
```

Exit code: `0`

Key output:

```text
Secret scan passed (181 source/config files scanned).
```

Additional hygiene check:

```bash
git diff --check
```

Exit code: `0`

## Evidence / Result

Acceptance criteria status:

- **Add/refine current user's rated profile endpoint:** yes, `GET /profiles/me/summary`.
- **Add/refine recent ranked match history endpoint:** yes, `GET /matches/history/me`.
- **Keep shared response envelopes:** yes, all endpoints use `ok(...)`.
- **Spoiler-safe summaries only:** yes, history mapper excludes answer authority fields and tests assert no spoiler markers leak.
- **Tests for empty state:** yes, seeded empty fixture user returns default unrated profile and empty history.
- **Tests for seeded data:** yes, current and public profile summaries return seeded handles/rating/rank/recent matches.
- **Tests for completed ranked match history:** yes, completed match returns viewer placement and participant rating deltas.
- **Shared contracts/types updated:** yes, profile and match-history schemas/types were added.
- **Auth stub/dev headers consistent:** yes, fixture switching remains header-based for local/dev read models.

## Risks / Blockers

### Blockers

None for Ticket 74.

### Risks / warnings

1. **Cursor semantics are intentionally simple.** The API currently uses timestamp-style cursors from `createdAt`; this is enough for the first read model but may need stable opaque cursors later.
2. **Rank computation is live/read-time.** The rank is derived from active ranked profiles at read time, which is acceptable for MVP but may eventually move to leaderboard snapshots.
3. **Public profile history is summary-only.** `GET /profiles/:handle/summary` includes recent matches, but there is not yet a paginated public profile history endpoint.
4. **Match detail summary route is contract-ready but not routed.** `matchDetailSummarySchema` exists for Ticket 75/route depth, but `GET /matches/:matchId/summary` was left as a follow-up to avoid over-expanding scope.
