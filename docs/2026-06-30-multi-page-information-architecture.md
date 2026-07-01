# Wordle Royale multi-page information architecture — Wave J

Date: 2026-06-30
Owner: Elisa
Input: Ticket 66, Athena Wave I review, Luna lichess-style UI direction

## Goal

Move Wordle Royale from a mostly one-page demo shell to the first real multi-page product shell: game-first, rating-oriented, calm, and practical, inspired by lichess-style information architecture without copying lichess branding or layout wholesale.

This is an MVP navigation contract for Luna Ticket 67. It deliberately favors a small set of useful pages over a broad marketing site.

## Design principles

1. **Play is primary.** The default route should lead users toward playing or resuming a match, not reading a product pitch.
2. **Navigation is product structure, not section anchors.** Top nav links should point to routes, with dropdowns grouping related actions.
3. **Lobbies and ratings are first-class.** Competitive Wordle needs visible room discovery, leaderboard, and profile/rating affordances.
4. **Placeholders are honest.** Coming-soon pages are allowed, but they must be labeled clearly and not pretend to have full functionality.
5. **No active-play spoilers.** Navigation and page extraction must preserve the current rule: active state never exposes answer, answer hash, or salt.
6. **Small enough for Ticket 67.** Reuse existing components and API client functions; do not introduce a new data layer or large design system rewrite.

## Top-level web navigation

Recommended desktop top bar:

```text
Wordle Royale | Play ▾ | Lobbies | Leaderboard | Learn ▾ | Profile ▾ | Server
```

Recommended compact/mobile top bar:

```text
Wordle Royale | Play | Lobbies | Ratings | Menu
```

`Menu` opens grouped links for Learn, Profile, Settings, History, and Server.

## Dropdown/menu groups

### Play dropdown

Purpose: quick access to the game loop.

Items:

| Label | Route | Status in Ticket 67 | Notes |
|---|---|---:|---|
| Play rated | `/play` | Real | Main board-first route. Reuse current gameplay/lobby layout. |
| Create lobby | `/lobbies?intent=create` or `/play?intent=create` | Real-ish | Can scroll/focus existing create-lobby panel. |
| Join by code | `/lobbies?intent=join` | Real-ish | Can focus existing join-code form. |
| Current match | `/play?matchId=<id>` | Real when query exists | Preserve existing match query behavior. |
| Practice preview | `/play/practice` | Placeholder or fixture-backed | Optional; only if easy to reuse fixtures without confusing live ranked. |

MVP recommendation: implement `/play`, `/lobbies`, and query-driven focus states only. Skip `/play/practice` unless it is nearly free.

### Learn dropdown

Purpose: rules and player education without cluttering the play page.

Items:

| Label | Route | Status in Ticket 67 | Notes |
|---|---|---:|---|
| Rules | `/learn/rules` | Real static page | Explain ranked Wordle Royale rules, max guesses, timing, scoring. |
| Scoring | `/learn/scoring` | Placeholder/static | Can be a concise static explanation of server scoring and rating caveat. |
| Fair play | `/learn/fair-play` | Placeholder/static | Spoiler safety, server-authoritative play, no answer exposure. |

MVP recommendation: create one real `/learn/rules` page and keep scoring/fair-play links as sections on that page or simple coming-soon cards. Avoid too many empty pages.

### Profile dropdown

Purpose: player identity and account settings.

Items:

| Label | Route | Status in Ticket 67 | Notes |
|---|---|---:|---|
| My profile | `/profile` | Real | Reuse rated profile and compact leaderboard/profile component. |
| Match history | `/history` | Placeholder | Useful product direction; no real history API required yet. |
| Settings | `/settings` | Placeholder | Account/settings placeholder. |
| Account | `/account` | Placeholder | Auth remains stubbed; make that clear. |

MVP recommendation: implement `/profile`, `/settings`, and optionally `/history` as simple pages. Keep `/account` folded into `/settings` unless Luna wants a separate placeholder.

### Server/status link

Purpose: preserve honest live/fallback state without making every page feel technical.

Route:

| Label | Route | Status in Ticket 67 | Notes |
|---|---|---:|---|
| Server | `/server` | Real small status page | Reuse health/readiness/lobby source status from existing `StatusStrip` data. |

MVP recommendation: top-level `Server` can be a small text link rather than a dropdown. It helps QA verify live/fallback state after page splitting.

## Route structure

Use Next App Router routes under `apps/web/src/app/`.

Recommended MVP routes:

| Route | Page purpose | Real vs placeholder | Reused components/data |
|---|---|---:|---|
| `/` | Thin home/landing redirect-like entry; game-site front door | Real but minimal | Link to `/play`, lobbies, leaderboard. No large hero. |
| `/play` | Main board-first ranked play page | Real | `GameplayScreen`, `LobbyBrowser`, `StatusStrip`, existing actions/API calls. |
| `/lobbies` | Lobby list/create/join page | Real | `LobbyBrowser`, `WaitingRoom`, existing lobby actions. |
| `/leaderboard` | Ratings/leaderboard page | Real | `ProfileLeaderboard`, `getWebApiSnapshot`. |
| `/profile` | Current stub/local profile page | Real | `ProfileLeaderboard` or smaller profile/rating component. |
| `/learn/rules` | Rules/how-to-play page | Real static | Static content; link to Play/Lobbies. |
| `/settings` | Settings/account placeholder | Placeholder | Static page explaining auth/settings are coming later. |
| `/history` | Match history/analysis placeholder | Placeholder | Static page; maybe link to result if `matchId` query exists later. |
| `/server` | Server status/live-vs-fixture page | Real | `StatusStrip`, readiness info from `getWebApiSnapshot`. |

Optional later routes, not for Ticket 67 unless trivial:

| Route | Purpose |
|---|---|
| `/analysis` | Post-match board/guess analysis. Wait until result/history APIs are richer. |
| `/players` | Community/player directory. Wait until real profiles/search exist. |
| `/tournaments` | Future competitive mode. Do not add yet except as roadmap copy. |

## Page contracts for Ticket 67

### `/`

Role: compact game-site front door.

Content:

- small brand/title,
- direct `Play rated` action to `/play`,
- compact secondary links to `/lobbies`, `/leaderboard`, `/learn/rules`,
- maybe a small server status line.

Avoid:

- large marketing hero,
- SaaS-style product claims,
- duplicating the entire play page.

### `/play`

Role: primary gameplay workspace.

Content:

- existing board/current match as visual anchor,
- compact left/right rail for lobbies/status,
- guess form and match actions when `matchId` exists,
- query support for existing `matchId`, `roundId`, action status, and messages.

Implementation notes:

- This can initially reuse most of current `page.tsx` layout.
- If Luna extracts shared loaders/components, keep them small:
  - `components/SiteNav.tsx`
  - `components/PageFrame.tsx`
  - `components/PageHeader.tsx`
  - optional `app/play/page.tsx` helper functions.

### `/lobbies`

Role: room discovery and lobby actions.

Content:

- lobby list/create/join controls,
- status notes small and secondary,
- waiting-room/room explanation if needed.

Do not show the full match board unless entering `/play?matchId=...`.

### `/leaderboard`

Role: rankings and rating loop.

Content:

- rating table from current API snapshot,
- explanation of provisional/local/demo status if applicable,
- link to `/profile` and `/play`.

### `/profile`

Role: current user's profile/rating identity.

Content:

- display name/handle if available,
- rating/provisional status,
- small match/history placeholder section,
- link to `/settings`.

### `/learn/rules`

Role: static player education.

Content:

- What Wordle Royale is,
- ranked match basics,
- guess/feedback rules,
- scoring/rating summary,
- fair-play/spoiler safety summary.

### `/settings`

Role: account/settings placeholder.

Content:

- clear copy: authentication/account settings are not production-ready yet,
- local/stub account note,
- future settings list: display name, notifications, privacy, accessibility.

### `/history`

Role: match history placeholder.

Content:

- coming-soon page,
- explain future match reports/replays/analysis,
- link to current result page behavior if a live `matchId` exists later.

### `/server`

Role: operational status page.

Content:

- API health/readiness,
- dependency summary,
- live-vs-fixture source,
- small troubleshooting copy for local demo mode.

## Mobile navigation implications

Mobile should not try to mirror desktop dropdowns exactly.

Recommended mobile structure:

1. Bottom tabs or compact top tabs:
   - `Play`
   - `Lobbies`
   - `Ratings`
   - `Menu`
2. `Menu` contains:
   - Profile
   - Rules
   - History
   - Settings
   - Server
3. Keep `/play` single-column:
   - board/current match first,
   - actions below board,
   - lobbies/status below actions,
   - long rules/profile content never above board.
4. Respect safe areas and avoid fixed dropdowns that can overflow small screens.
5. Dropdowns on mobile should become a full-width menu/list or disclosure, not hover-dependent UI.

## Accessibility and keyboard behavior

Ticket 67 should include:

- real links for primary nav, not only buttons with click handlers,
- keyboard-openable dropdowns/disclosures,
- visible focus states,
- `aria-label` for primary navigation,
- `aria-expanded`/`aria-controls` if dropdowns are interactive,
- no hover-only access to menu items,
- skip overly clever animations.

If implementation time is short, prefer always-visible grouped links on mobile over custom dropdown behavior.

## Recommended component boundaries for Luna

Small extraction plan:

| Component | Responsibility |
|---|---|
| `SiteNav` | Top nav/dropdowns; pure navigation, no API calls. |
| `PageFrame` | Shared shell/main wrapper and optional status line. |
| `HomeLanding` | Compact home page content. |
| `RulesPageContent` | Static learn/rules content. |
| `PlaceholderPage` | Reusable honest coming-soon page for settings/history. |

Avoid:

- a central route registry with complex permissions,
- a new client-side router abstraction,
- duplicating API client functions per page,
- moving gameplay state into nav components.

## Implementation scope boundary for Ticket 67

Ticket 67 should do:

- create the routes listed in the MVP table,
- move/reuse current one-page content into `/play`, `/lobbies`, `/leaderboard`, `/profile`, and `/server`,
- add simple dropdown/disclosure navigation,
- keep style calm and game-site-like,
- preserve existing server actions and query parameter behavior.

Ticket 67 should not do:

- implement new backend endpoints,
- implement real auth/settings,
- implement real match history API,
- implement tournaments/analysis,
- change gameplay contracts,
- redesign mobile app internals beyond documenting implications.

## Acceptance checklist for Ticket 67

- [ ] `/` is no longer the whole application crammed into one page.
- [ ] `/play`, `/lobbies`, `/leaderboard`, `/profile`, `/learn/rules`, `/settings`, and `/server` exist.
- [ ] Top navigation exposes pages and menu groups, not section anchors only.
- [ ] Dropdown/menu links work with keyboard and touch.
- [ ] Existing live/fallback behavior remains visible and honest.
- [ ] Active match page remains spoiler-safe.
- [ ] Web build passes.
- [ ] Root build passes unless blocked by unrelated existing issues, which must be documented.
