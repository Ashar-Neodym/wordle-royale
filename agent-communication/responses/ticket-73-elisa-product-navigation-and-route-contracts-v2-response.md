# Product Navigation and Route Contracts v2 — Response

## Summary

Ticket 73 is complete.

I refined the Wave J multi-page information architecture into Wave K route/data contracts for product depth, focused on the pages that should now become real instead of decorative:

- Profile
- History
- Match detail/result
- Leaderboard profile links/details
- Lobby discovery/readiness
- Learn/Rules
- Settings/account placeholder

I saved the detailed route contract note here:

- `docs/2026-07-01-product-navigation-route-contracts-v2.md`

The plan is MVP-friendly and compatible with the current backend. It primarily requires read-model endpoints over existing Prisma models rather than new product systems.

## Decisions / Recommendations

1. **Keep the Wave J navigation, but deepen route meaning.**
   - Recommended desktop nav:
     ```text
     Wordle Royale | Play ▾ | Lobbies ▾ | Leaderboard | Learn ▾ | Profile ▾ | Server
     ```
   - Recommended mobile nav:
     ```text
     Play | Lobbies | Ratings | Menu
     ```
   - `Menu` contains Profile, History, Rules, Settings, Server.

2. **Make Profile and History real in Wave K.**
   - `/profile` should show current-player profile/rating summary plus recent matches.
   - `/history` should show current-player recent ranked matches or a real API empty state.

3. **Add a match detail route.**
   - Recommended web route: `/matches/:matchId`.
   - Use existing `GET /matches/:matchId/state` and `GET /matches/:matchId/result`, or add a convenience `GET /matches/:matchId/summary` if Freya can implement it cleanly.

4. **Keep Settings honest as a placeholder.**
   - `/settings` should not fake real account/auth settings while auth is stubbed.
   - It can list future sections: display name, accessibility, privacy, notifications.

5. **Do not add broad product surface yet.**
   - No tournaments, full player directory, full matchmaking queue, or analysis engine in Wave K.

6. **Preserve spoiler safety.**
   - Active/in-progress match history/detail must not expose plaintext answer, answer hash, salt, other players' hidden guesses, or dictionary internals.

## Detailed Output

### Route maturity targets

| Route | Wave J state | Wave K target | Owner |
|---|---|---|---|
| `/play` | Real | Keep real; improve links into match detail/result when available | Luna |
| `/lobbies` | Real | Real with better filters/status/readiness and lobby detail affordance | Ruby/Luna |
| `/lobbies/:lobbyId` | Missing | Add only if cheap; otherwise use query/detail drawer | Ruby/Luna |
| `/leaderboard` | Real list | Real list with profile links and stable empty/offline states | Luna |
| `/profile` | Real current-player stub | Real current-player rated summary + recent matches | Freya/Luna |
| `/profile/:handle` | Missing | Add public profile read model/page if Ticket 74 capacity allows | Freya/Luna |
| `/history` | Placeholder | Real current-user recent ranked match list or honest empty state | Freya/Luna |
| `/matches/:matchId` | Missing | Real spoiler-safe match detail/result page | Freya/Luna |
| `/learn/rules` | Static real | Keep static real; no backend needed | Luna |
| `/settings` | Placeholder | Keep placeholder until auth/account settings exist | Luna |
| `/server` | Real status | Keep real; no product expansion needed | Luna/Jasmine |

### Placeholder policy

#### Must become real in Wave K

- `/profile`
- `/history`
- `/matches/:matchId`
- `/leaderboard` links/empty/offline states
- `/lobbies` discovery/readiness states

#### Can remain honest placeholders

- `/settings`
- `/learn/rules` as static real page
- `/analysis` — do not add yet
- `/tournaments`, `/players`, `/teams`, `/notifications` — do not add yet

### Recommended API priority for Ticket 74

Freya should implement in this order:

1. `GET /profiles/me/summary`
2. `GET /matches/history/me?limit=20&cursor=<cursor>`
3. `GET /matches/:matchId/summary` or document that Luna should compose from existing state/result endpoints
4. `GET /profiles/:handle/summary` if capacity remains

Recommended stable contract additions if Freya updates shared contracts:

- `matchHistorySummarySchema`
- `matchHistoryListSchema`
- `profileSummarySchema`
- optional `matchDetailSummarySchema`

No write endpoints are recommended for Wave K profile/settings/history.

### Current player profile contract

Web route:

```text
/profile
```

Recommended API:

```http
GET /profiles/me/summary
```

Response data shape:

```ts
type CurrentProfileSummary = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  rating: {
    mode: 'ranked';
    rating: number;
    matchesPlayed: number;
    provisional: boolean;
    provisionalRemaining: number;
    algorithm: 'placement_mmr_v1';
    algorithmConfigVersion: string;
    rank: number | null;
  };
  recentMatches: MatchHistorySummary[];
};
```

Minimum data sources:

- `UserAccount`
- `UserProfile`
- `RatingProfile`
- `MatchParticipant` joined to `Match`
- optional `MatchReport.publicSummary` / `MatchReport.spoilerSafeShare`

### Public profile contract

Web route:

```text
/profile/:handle
```

Recommended API:

```http
GET /profiles/:handle/summary
```

Response data shape:

```ts
type PublicProfileSummary = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  rating: RatedProfilePayload;
  recentMatches: MatchHistorySummary[];
};
```

Privacy rule: no email, consent records, private account state, active answers, active answer hashes, or hidden active-match details.

### Match history contract

Web route:

```text
/history
```

Recommended API:

```http
GET /matches/history/me?limit=20&cursor=<cursor>
```

Optional public profile history:

```http
GET /profiles/:handle/matches?limit=20&cursor=<cursor>
```

Response data shape:

```ts
type MatchHistoryList = {
  items: MatchHistorySummary[];
  pagination: { nextCursor: string | null };
};

type MatchHistorySummary = {
  matchId: string;
  mode: 'ranked' | 'casual';
  status: 'pending' | 'active' | 'completed' | 'voided' | 'cancelled';
  startedAt: string | null;
  completedAt: string | null;
  participants: Array<{
    userId: string;
    handle: string | null;
    displayName: string;
    placement: number | null;
    outcome: 'pending' | 'solved' | 'failed' | 'abandoned' | 'voided';
    finalScore: number;
    ratingDelta: number | null;
  }>;
  viewer: {
    userId: string;
    placement: number | null;
    outcome: string;
    finalScore: number;
    ratingDelta: number | null;
  } | null;
};
```

### Match detail/result contract

Web route:

```text
/matches/:matchId
```

Recommended API use:

- active/current: `GET /matches/:matchId/state`
- completed: `GET /matches/:matchId/result`
- optional convenience: `GET /matches/:matchId/summary`

Optional summary shape:

```ts
type MatchDetailSummary = {
  matchId: string;
  status: 'active' | 'completed' | 'voided' | 'cancelled';
  activeState: CurrentRankedMatchStateResponseData | null;
  result: RankedMatchResultSummary | null;
  history: MatchHistorySummary;
};
```

Only one of `activeState` or `result` should be present depending on match status.

### Leaderboard contract refinement

Keep:

```http
GET /leaderboard?limit=20
```

Wave K refinement:

- entries link to `/profile/:handle` when `handle` exists;
- provisional state remains textual;
- no new leaderboard detail route is needed.

Optional non-blocking API addition:

```ts
type LeaderboardPayload = {
  mode: 'ranked';
  algorithm: 'placement_mmr_v1';
  algorithmConfigVersion: string;
  generatedAt: string;
  entries: LeaderboardEntry[];
  viewerEntry?: LeaderboardEntry | null;
};
```

### Lobby discovery contract refinement

Keep compatible default:

```http
GET /lobbies
```

Recommended filters:

```http
GET /lobbies?status=waiting&mode=ranked&visibility=public&limit=20&cursor=<cursor>
```

Optional detail:

```http
GET /lobbies/:lobbyId
```

Recommended lobby discovery item:

```ts
type LobbyDiscoveryItem = {
  id: string;
  code: string;
  hostUserId: string;
  hostHandle: string | null;
  status: 'waiting' | 'ready' | 'in_match' | 'closed';
  visibility: 'public' | 'private';
  mode: 'ranked' | 'casual';
  playerCount: number;
  maxPlayers: number;
  canJoin: boolean;
  canStart: boolean;
  blockerReason: string | null;
  createdAt: string;
};
```

Do not build a full matchmaking queue in Wave K. Improve filtering, readiness, and calls to action first.

### Mobile implications

Mobile should mirror product depth without desktop dropdowns:

```text
Primary: Play, Lobbies, Ratings, Menu
Menu: Profile, History, Rules, Settings, Server
```

Rules:

- no hover menus;
- no fixed-width desktop dropdowns;
- board and match actions stay above long profile/history text;
- use scrollable full-width menu/disclosure;
- preserve live/offline status but keep it secondary.

## Open Questions

None blocking.

Product choices that can wait:

1. Should public `/profile/:handle` ship in Wave K, or only `/profile` for current user? Recommendation: current user first; public profile if Freya has capacity.
2. Should `/lobbies/:lobbyId` be a full page or a drawer/query-state on `/lobbies`? Recommendation: drawer/query-state first unless Ruby adds a cheap detail endpoint.
3. Should completed match detail reveal the answer? Recommendation: only if it comes from a completed `MatchReport.publicSummary` designed for safe reveal; do not derive from active round authority.

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/API read models.
- **Exact task:** Implement Ticket 74 using the v2 contracts: `GET /profiles/me/summary`, `GET /matches/history/me`, optional `GET /matches/:matchId/summary`, optional `GET /profiles/:handle/summary`.
- **Inputs/context:** `docs/2026-07-01-product-navigation-route-contracts-v2.md`, current profile/leaderboard/gameplay services, Prisma `Match`, `MatchParticipant`, `RatingProfile`, `RatingEvent`, `MatchReport` models.
- **Expected output:** API/controller/service changes, shared schemas if needed, tests for empty/seeded/completed history, spoiler-safety checks, build/test output.

### Follow-up Ticket 2

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns web UI route depth.
- **Exact task:** Implement Ticket 75 so `/profile`, `/history`, and `/matches/:matchId` use live read models where available and honest empty/offline states otherwise.
- **Inputs/context:** Ticket 73 response/doc, Ticket 74 response if available, current `apps/web/src/lib/api-client.ts`, Wave J routes.
- **Expected output:** Route/page updates, compact game-site styling, profile/history/match detail UI, web/root build output.

### Follow-up Ticket 3

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns lobby/matchmaking UX slice.
- **Exact task:** Implement Ticket 76 lobby discovery refinements: filters/status/readiness/action blockers while preserving current `GET /lobbies` compatibility.
- **Inputs/context:** Ticket 73 response/doc, current lobby service/controller, ranked start flow.
- **Expected output:** API and/or UI contract changes, tests for open/rated lobby discovery, join/start readiness, build/test output.

### Follow-up Ticket 4

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns mobile UX follow-up.
- **Exact task:** Implement or document Ticket 77 mobile navigation/bounds follow-up using `Play`, `Lobbies`, `Ratings`, `Menu` with Profile/History/Rules/Settings/Server under Menu.
- **Inputs/context:** Ticket 73 response/doc, Ticket 68 response, current Expo app.
- **Expected output:** Mobile navigation/safe-area changes or explicit deferred plan, mobile build/config verification, phone-smoke instructions if needed.

### Follow-up Ticket 5

- **Target agent:** Jasmine
- **Why that agent is needed:** QA ownership.
- **Exact task:** In Ticket 79, verify that Wave K pages show real data where required, placeholders are honest, navigation is responsive/keyboard safe, and no active-match spoiler leakage exists.
- **Inputs/context:** Tickets 73–78 responses.
- **Expected output:** Pass/fail matrix with route/API evidence and blockers/warnings separated.

## Files Changed

- `docs/2026-07-01-product-navigation-route-contracts-v2.md`
- `agent-communication/responses/ticket-73-elisa-product-navigation-and-route-contracts-v2-response.md`

No source code, contracts, package files, migrations, or backend/frontend implementation files were changed.

## Tests / Commands Run

Planning/spec ticket only. No build/test commands were required because no source code was edited.

Read/inspection performed:

- `agent-communication/tickets/ticket-73-elisa-product-navigation-and-route-contracts-v2.md`
- `agent-communication/index.md`
- `docs/2026-07-01-athena-review-after-tickets-65-71.md`
- `docs/2026-06-30-multi-page-information-architecture.md`
- `docs/2026-06-30-lichess-style-web-ui-direction.md`
- `agent-communication/tickets/ticket-74-freya-profile-and-match-history-api-read-model-slice.md`
- `agent-communication/tickets/ticket-75-luna-web-route-depth-profile-history-match-detail-ui.md`
- `agent-communication/tickets/ticket-76-ruby-lobby-discovery-and-matchmaking-ux-slice.md`
- `agent-communication/tickets/ticket-77-luna-mobile-navigation-and-bounds-follow-up.md`
- `agent-communication/tickets/ticket-78-elisa-privacy-safe-product-analytics-event-taxonomy-plan.md`
- current web route files under `apps/web/src/app`
- current API controllers/services for gameplay, leaderboard, profile, and lobby
- Prisma match/rating/report schema sections

Command run for date grounding:

```bash
date +%F
```

Output:

```text
2026-07-01
```

## Evidence / Result

Acceptance criteria status:

- **Define which routes should become real next:** yes; `/profile`, `/history`, `/matches/:matchId`, and lobby/leaderboard refinements prioritized.
- **Specify minimal data requirements and API needs per route:** yes; profile summary, history list, match detail, leaderboard, and lobby discovery contracts defined.
- **Define placeholder policy:** yes; settings remains placeholder, analysis/tournaments/players deferred, profile/history/match detail must become real.
- **Include mobile navigation implications:** yes; `Play`, `Lobbies`, `Ratings`, `Menu` structure defined.
- **Keep MVP-friendly and backend-compatible:** yes; uses existing models/endpoints and recommends read-only endpoints only.
- **Write/update concise docs file:** yes; `docs/2026-07-01-product-navigation-route-contracts-v2.md`.

## Risks / Blockers

### Blockers

None for Ticket 73.

### Risks / warnings

1. **Scope creep risk:** Public profiles, lobby detail pages, and match summary endpoints are useful but optional. Current-user profile/history should come first.
2. **Spoiler leakage risk:** Match history/detail must not expose active answers, answer hashes, salts, or other players' hidden active guesses.
3. **Duplication risk:** Luna should not stitch many page-specific API calls if Freya can provide summary endpoints.
4. **Placeholder fatigue risk:** Settings can remain placeholder, but Profile and History should not remain decorative after Wave K.
5. **Mobile bounds risk:** More routes/menu depth can reintroduce small-screen overflow; Ticket 77 should verify safe-area and scroll behavior.
