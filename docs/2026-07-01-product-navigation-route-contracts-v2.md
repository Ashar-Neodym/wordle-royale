# Wordle Royale product navigation and route contracts v2 — Wave K

Date: 2026-07-01
Owner: Elisa
Input: Ticket 73, Wave J review, Ticket 66 IA, current web/API route inspection

## Goal

Turn the Wave J multi-page shell from route decoration into product depth. Wave K should make the pages that imply player identity, match history, lobby discovery, and match detail show useful real data while keeping the MVP small, spoiler-safe, and compatible with the current backend.

## Current baseline

Wave J already added web routes:

- `/`
- `/play`
- `/lobbies`
- `/leaderboard`
- `/learn/rules`
- `/profile`
- `/server`
- `/settings`
- `/history`

Current API capabilities already include:

- `GET /healthz`
- `GET /readyz`
- `GET /auth/me`
- `GET /profile/me`
- `GET /lobbies`
- `POST /lobbies`
- `POST /lobbies/join-code`
- `POST /lobbies/:lobbyId/join`
- `POST /matches/ranked/start`
- `GET /matches/:matchId/state`
- `POST /matches/:matchId/rounds/:roundId/guesses`
- `POST /matches/:matchId/complete`
- `GET /matches/:matchId/result`
- `GET /leaderboard?limit=N`
- `GET /profiles/:handle/rating`

Wave K should add only the missing read models needed to make existing pages useful.

## Navigation v2

Keep the Wave J top-level structure. Refine dropdowns so they point to pages with real product value:

```text
Wordle Royale | Play ▾ | Lobbies ▾ | Leaderboard | Learn ▾ | Profile ▾ | Server
```

Mobile remains:

```text
Play | Lobbies | Ratings | Menu
```

`Menu` contains Profile, History, Rules, Settings, Server.

## Route maturity targets

| Route | Wave J state | Wave K target | Owner |
|---|---|---|---|
| `/play` | Real | Keep real; improve links into match detail/result when available | Luna |
| `/lobbies` | Real | Real with better filters/status/readiness and lobby detail affordance | Ruby/Luna |
| `/lobbies/:lobbyId` | Missing | Add only if cheap; otherwise keep query/detail drawer | Ruby/Luna |
| `/leaderboard` | Real list | Real list with profile links and stable empty/offline states | Luna |
| `/leaderboard/:handle` | Missing | Do not add; use `/profile/:handle` instead | Freya/Luna |
| `/profile` | Real current-player stub | Real current-player rated summary + recent matches | Freya/Luna |
| `/profile/:handle` | Missing | Add public profile read model/page if Ticket 74 capacity allows | Freya/Luna |
| `/history` | Placeholder | Real current-user recent ranked match list or honest empty state | Freya/Luna |
| `/matches/:matchId` | Missing | Real spoiler-safe match detail/result page | Freya/Luna |
| `/learn/rules` | Static real | Keep static real; no backend needed | Luna |
| `/settings` | Placeholder | Keep placeholder until auth/account settings exist | Luna |
| `/server` | Real status | Keep real; no product expansion needed | Luna/Jasmine |

## Placeholder policy

### Must become real in Wave K

These pages imply product functionality and should stop being mostly decorative:

1. **Profile `/profile`**
   - Should show current player's handle/display name, rating, provisional state, match count, and recent matches when available.
2. **History `/history`**
   - Should show recent ranked matches or a real empty state from the API.
3. **Match detail `/matches/:matchId`**
   - Should show completed/result details when available and active-match safe state otherwise.
4. **Leaderboard `/leaderboard`**
   - Already real; should link into profile pages and handle empty/offline states cleanly.
5. **Lobbies `/lobbies`**
   - Already real; should improve discovery/readiness states rather than stay a flat widget transplant.

### Can remain honest placeholders

These are acceptable as static/placeholder for Wave K:

- `/settings`: auth/account settings are not production-ready.
- `/learn/rules`: static rules are enough.
- `/analysis`: do not add yet unless match detail needs a section header.
- `/tournaments`, `/players`, `/teams`, `/notifications`: do not add yet.

## Route contracts

### 1. Current player profile

Web route:

```text
/profile
```

Recommended API:

```http
GET /profiles/me/summary
```

Response data contract:

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

Compatibility note: existing `GET /profile/me` and `GET /profiles/:handle/rating` can stay. The new endpoint should aggregate current-player page needs so Luna does not stitch too many requests.

### 2. Public profile

Web route:

```text
/profile/:handle
```

Recommended API:

```http
GET /profiles/:handle/summary
```

Response data contract:

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

Privacy rules:

- Public summary may show completed ranked match outcomes and rating movement.
- Do not expose email, consent records, private settings, auth role, or hidden active-match details.
- For active/in-progress matches, either omit them or return a coarse `in_progress` row without answer/guess detail.

Scope rule: if Ticket 74 has limited time, prioritize `/profiles/me/summary` and `/history/me`; public `/profile/:handle` can use existing `/profiles/:handle/rating` plus placeholder recent matches.

### 3. Match history

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

Response data contract:

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

Spoiler policy:

- For completed matches, show participant results and rating deltas.
- For active matches, do not include answers, answer hashes, answer salts, other players' guesses, or hidden dictionary internals.
- If answer reveal is desired later, read it only from a completed `MatchReport.publicSummary` designed for reveal; do not derive from `MatchRound.answerWordHash`.

### 4. Match detail/result

Web route:

```text
/matches/:matchId
```

Recommended API use:

- If active/current: `GET /matches/:matchId/state`
- If completed: `GET /matches/:matchId/result`
- Optional new read endpoint for web convenience:

```http
GET /matches/:matchId/summary
```

Response shape for optional summary:

```ts
type MatchDetailSummary = {
  matchId: string;
  status: 'active' | 'completed' | 'voided' | 'cancelled';
  activeState: CurrentRankedMatchStateResponseData | null;
  result: RankedMatchResultSummary | null;
  history: MatchHistorySummary;
};
```

Rule: one of `activeState` or `result` can be present depending on match status. Completed result must stay consistent with `GET /matches/:matchId/result`.

### 5. Leaderboard details

Web route:

```text
/leaderboard
```

Keep API:

```http
GET /leaderboard?limit=20
```

Recommended small refinement:

- entries should link to `/profile/:handle` when `handle` exists;
- if no `handle`, link to `/profile?userId=<id>` only if such route is implemented, otherwise no link;
- keep provisional state textual;
- no new leaderboard detail route in Wave K.

Optional API improvement if Freya already touches leaderboard contracts:

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

Do not block Ticket 75 on `viewerEntry`.

### 6. Lobby discovery and lobby detail

Web route:

```text
/lobbies
```

Recommended API refinement:

```http
GET /lobbies?status=waiting&mode=ranked&visibility=public&limit=20&cursor=<cursor>
```

Current `GET /lobbies` can remain compatible with defaults.

Optional route:

```text
/lobbies/:lobbyId
```

Recommended API if detail route is added:

```http
GET /lobbies/:lobbyId
```

Lobby list item should include enough for discovery:

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

MVP note: do not build a full matchmaking queue yet. Use better lobby filtering and clear calls to action first.

### 7. Learn/rules

Web route:

```text
/learn/rules
```

Status: keep static real page.

No API needed.

Add links from rules to:

- `/play`
- `/lobbies`
- `/leaderboard`

### 8. Settings/account

Web route:

```text
/settings
```

Status: placeholder.

No API needed in Wave K.

Allowed content:

- local/stub auth note;
- future sections: display name, accessibility, privacy, notifications;
- link to `/profile`.

Do not implement real auth, email settings, notifications, or consent UI in Wave K.

## API priority for Ticket 74

Freya should implement in this order:

1. `GET /profiles/me/summary`
2. `GET /matches/history/me?limit=20&cursor=<cursor>`
3. `GET /matches/:matchId/summary` or document that Luna should compose from existing state/result endpoints
4. `GET /profiles/:handle/summary` if capacity remains

Shared contracts should be added only for stable response shapes:

- `matchHistorySummarySchema`
- `matchHistoryListSchema`
- `profileSummarySchema`
- optional `matchDetailSummarySchema`

Do not add write endpoints for profile/settings/history in Wave K.

## Web priority for Ticket 75

Luna should implement in this order:

1. `/profile` uses `GET /profiles/me/summary` when available; falls back to existing profile/rating data.
2. `/history` uses `GET /matches/history/me`; renders honest empty/offline state.
3. `/matches/:matchId` uses `GET /matches/:matchId/summary` if present, otherwise existing `state`/`result` endpoints.
4. `/leaderboard` links rows to `/profile/:handle` when safe.
5. `/lobbies` keeps clear route to play/start, coordinating with Ticket 76.

## Mobile navigation implications for Ticket 77

Mobile should mirror product depth without copying desktop dropdowns.

Recommended mobile information architecture:

```text
Primary: Play, Lobbies, Ratings, Menu
Menu: Profile, History, Rules, Settings, Server
```

Mobile route/page priorities:

1. Play and active match remain first.
2. Lobbies is second and must fit within safe area.
3. Ratings/Leaderboard can be compact table/list.
4. Profile/History can be read-only summary pages or sections under Menu.
5. Settings remains placeholder.

Mobile rules:

- no hover menus;
- no fixed-width desktop dropdowns;
- board and match actions must stay above long profile/history text;
- use scrollable full-width menu/disclosure;
- preserve live/offline state, but keep it visually secondary.

## Compatibility with current backend

This plan uses existing models and endpoints as much as possible:

- `UserAccount`, `UserProfile`, `RatingProfile` already support profile/rating read models.
- `Match`, `MatchParticipant`, `RatingEvent`, and `MatchReport` already support history/result summaries.
- Existing `GET /matches/:matchId/state` and `GET /matches/:matchId/result` cover match detail basics.
- Existing `GET /leaderboard` and `GET /profiles/:handle/rating` cover leaderboard/profile fallback.
- Existing `GET /lobbies` can be refined without breaking current clients.

No migration should be required for the first Ticket 74 read slice unless Freya finds an index need. If an index is needed, prefer documenting it as a follow-up unless tests demonstrate unacceptable query shape.

## Non-goals for Wave K

- real production auth/account settings;
- full player search/directory;
- tournaments;
- full matchmaking queue/rating pool;
- post-game analysis engine;
- public answer reveal for active or unfinished matches;
- analytics implementation beyond Ticket 78 planning;
- paid services, deployment, or proprietary datasets.

## Acceptance criteria for Wave K route depth

- `/profile` shows real current-player rating and recent-match data or a real API empty state.
- `/history` is no longer a decorative placeholder.
- `/matches/:matchId` exists or Ticket 75 documents why existing `/play?matchId=` remains the temporary detail view.
- `/leaderboard` rows link toward profile detail when handles are available.
- `/lobbies` has clearer ranked discovery/readiness states.
- `/settings` remains honest placeholder; no fake settings.
- Mobile navigation exposes Profile/History without overflowing bounds.
- No active-play spoiler leakage is introduced.
