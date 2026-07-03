# Ticket 75 — Web Route Depth: Profile, History, and Match Detail UI — Response

## Summary

Ticket 75 is complete.

I turned the Wave J placeholder Profile/History surfaces into live read-model pages that consume the Ticket 74 endpoints when available, while preserving honest offline/empty states when the API is unavailable or seeded data is empty.

Implemented web route depth:

- `/profile` now calls `GET /profiles/me/summary` and shows rated summary, rank/games/status metrics, recent matches, and existing leaderboard context.
- `/history` now calls `GET /matches/history/me?limit=20` and shows recent ranked match rows or an honest empty/offline state.
- `/profile/:handle` now calls `GET /profiles/:handle/summary` for public spoiler-safe profile summaries.
- `/matches/:matchId` now composes the existing ranked match result/state endpoints into a simple spoiler-safe match detail page.
- Leaderboard live rows now link to `/profile/:handle` when a handle exists.

No backend/API behavior was changed in this ticket.

## Decisions / Recommendations

1. **Use Ticket 74 read models directly.**
   - Added web client methods for `GET /profiles/me/summary`, `GET /profiles/:handle/summary`, and `GET /matches/history/me`.
   - Did not add extra page-specific API logic beyond small display helpers.

2. **Keep empty/offline states honest.**
   - History does not fall back to fake fixture match rows.
   - Offline history says the API is unavailable and shows an empty call-to-action instead of pretending data exists.

3. **Add match detail without over-expanding backend scope.**
   - `/matches/:matchId` first attempts the existing completed result endpoint.
   - It also attempts server state for active matches.
   - If both are unavailable, it shows a compact unavailable state.
   - It does not require the optional `GET /matches/:matchId/summary` endpoint that Ticket 74 left as a future convenience.

4. **Preserve spoiler safety.**
   - Active match detail explicitly avoids answer/hash/salt/hidden-guess authority.
   - History/detail rows use public summaries/result/state only.

## Detailed Output

### Web API client

Updated `apps/web/src/lib/api-client.ts` with:

- `getCurrentProfileSummary()` → `/profiles/me/summary`
- `getPublicProfileSummary(handle)` → `/profiles/:handle/summary`
- `getMatchHistory(limit, cursor?)` → `/matches/history/me?limit=...&cursor=...`

### Shared profile/history UI

Added `apps/web/src/components/ProfileHistory.tsx` with:

- `ProfileSummaryCard`
- `MatchHistoryRows`
- `HistoryStatusPanel`

These components keep profile/history compact, responsive, keyboard-linkable, and spoiler-safe.

### Profile routes

Updated `/profile`:

- live current-player rated summary;
- rating/rank/games/status metrics;
- recent matches from profile summary;
- action links to Play/History/Settings;
- leaderboard context preserved.

Added `/profile/[handle]`:

- public profile summary by handle;
- public recent match summaries;
- private account data intentionally omitted.

### History route

Updated `/history`:

- live current-user match history list;
- compact rows linking to `/matches/:matchId`;
- real empty state when API returns no rows;
- explicit offline state when the API is unavailable.

### Match detail route

Added `/matches/[matchId]`:

- completed result rows when `GET /matches/:matchId/result` is available;
- active server state summary when `GET /matches/:matchId/state` is available;
- unavailable state with Back to history link otherwise;
- active-state warning that answer/hash/salt and hidden player authority are not exposed.

### Styling

Updated `apps/web/src/components/web-shell.module.css` with:

- compact profile hero card;
- profile metric cards;
- history/match rows;
- leaderboard profile link styling;
- mobile wrapping for profile metrics and match rows.

## Open Questions

None blocking Ticket 75.

Potential future improvement:

- Add the optional `GET /matches/:matchId/summary` endpoint if the match detail page needs one-call active/completed/history composition.

## Follow-up Tickets

1. **Jasmine QA — Wave K product-depth QA**
   - Verify `/profile`, `/profile/:handle`, `/history`, and `/matches/:matchId` in live and offline modes.
   - Confirm no active-match answer/hash/salt leakage.
   - Confirm keyboard navigation and small-screen layout remain usable.

2. **Freya/Ruby optional API follow-up**
   - Add `GET /matches/:matchId/summary` only if product detail pages need richer one-call match context.
   - Keep active matches spoiler-safe.

## Files Changed

Changed for this ticket:

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/components/ProfileHistory.tsx`
- `apps/web/src/components/ReportAndProfile.tsx`
- `apps/web/src/components/web-shell.module.css`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/profile/[handle]/page.tsx`
- `apps/web/src/app/history/page.tsx`
- `apps/web/src/app/matches/[matchId]/page.tsx`
- `agent-communication/responses/ticket-75-luna-web-route-depth-profile-history-match-detail-ui-response.md`

Pre-existing dirty working-tree changes from other Wave K tickets were present before this work. This list is scoped to Ticket 75.

## Tests / Commands Run

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

```bash
pnpm --filter @wordle-royale/web typecheck
```

Exit code: `0`

```text
$ tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @wordle-royale/web build
```

Exit code: `0`

Key output:

```text
✓ Compiled successfully
Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /history
├ ƒ /leaderboard
├ ○ /learn/rules
├ ƒ /lobbies
├ ƒ /matches/[matchId]
├ ƒ /play
├ ƒ /profile
├ ƒ /profile/[handle]
├ ƒ /server
└ ○ /settings
```

```bash
pnpm build
```

Exit code: `0`

Key output:

```text
apps/mobile build: Done
apps/web build: ✓ Compiled successfully
apps/api build: Done
```

```bash
pnpm secret-scan
```

Exit code: `0`

Key output:

```text
Secret scan passed (184 source/config files scanned).
```

### Offline web smoke

Started web production server on `127.0.0.1:3075`, then stopped it.

Checked routes:

```text
/profile                                               200
/history                                               200
/profile/alice                                         200
/matches/11111111-1111-4111-8111-111111111111          200
```

Spoiler-key check on those route HTML responses:

```text
answerHash False
answerSalt False
answer\" False
```

Browser smoke:

```text
/profile showed Profile summary, Profile unavailable, Recent matches, Empty history.
/history showed Match history, Recent ranked games, History API unavailable, Empty history.
No browser console errors.
No horizontal overflow in checked browser route state.
```

### Live API smoke

Started local dependencies and seeded DB:

```bash
pnpm deps:up && pnpm ranked:smoke:reset
```

Exit code: `0`

Started API on `127.0.0.1:3076` and web on `127.0.0.1:3077` with:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3076
```

Verified Ticket 74 endpoints:

```text
/profiles/me/summary            200 player_one 1200 recent 0
/matches/history/me?limit=20    200 items 0 next None
/profiles/player_one/summary    200 player_one 1200 recent 0
```

Browser smoke against live API-backed web:

```text
/profile showed Player One, @player_one · 1200 rating, Profile summary, Empty history, LIVE RATINGS.
/history showed live empty-state history without fake fixture rows.
/matches/11111111-1111-4111-8111-111111111111 showed unavailable detail state with Back to history.
No browser console errors.
No horizontal overflow in checked browser route state.
```

Cleanup:

```bash
pnpm deps:down
```

Exit code: `0`

All started background processes were stopped. `process list` returned no tracked background processes.

## Evidence / Result

Acceptance criteria status:

- **Profile page should show rated profile/rating/matches summary when live API data exists:** done; live smoke showed `Player One`, `@player_one`, `1200 rating`, metrics, and live leaderboard.
- **History page should show recent matches or honest empty state:** done; live seeded DB returned an honest empty state with no fake match rows.
- **Add simple match detail/result view if contracts/backend support it:** done via `/matches/:matchId`, composing existing state/result endpoints and showing unavailable state when the test ID does not exist.
- **Preserve lichess-like human style:** done; compact rows/cards, no glossy SaaS treatment added.
- **Maintain fallback/offline clarity without making fallback dominate:** done; offline states are local and direct, history does not fake rows.
- **Keep routes responsive and keyboard navigable:** done; real links are used for profile/history/match navigation, and CSS wraps profile/match rows on small screens.

## Risks / Blockers

### Blockers

None for Ticket 75.

### Risks / warnings

1. Seeded reset data currently returns an empty current-player history (`items 0`), so live positive match-row rendering was build/typechecked and structurally exercised, but not populated from a completed seeded match in this smoke.
2. `/matches/:matchId` does not yet use a one-call summary endpoint. It composes result/state endpoints and shows an honest unavailable state for nonexistent IDs.
3. Final visual/taste review by Ashar/Jasmine is still recommended for the new route depth pages.
