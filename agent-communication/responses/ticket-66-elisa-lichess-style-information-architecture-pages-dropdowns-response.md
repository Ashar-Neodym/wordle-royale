# Lichess-Style Information Architecture, Pages, and Dropdowns — Response

## Summary

Ticket 66 is complete.

I designed the first real multi-page information architecture for Wordle Royale and saved the design note here:

- `docs/2026-06-30-multi-page-information-architecture.md`

The direction is lichess-inspired but not a copy: calm game-site navigation, route-based pages, compact dropdowns, rating/lobby/profile prominence, and honest placeholders where functionality is not ready.

The MVP is intentionally small enough for Luna Ticket 67 to implement by reusing existing web components and API calls rather than redesigning the app.

## Decisions / Recommendations

1. **Use real routes, not section-anchor navigation.**
   - Current one-page sections should become pages: `/play`, `/lobbies`, `/leaderboard`, `/profile`, `/learn/rules`, `/settings`, `/server`, plus optional `/history` placeholder.

2. **Make `/play` the primary product surface.**
   - The board/current match remains the visual anchor.
   - Existing query-driven behavior like `?matchId=...` should move with the play route.

3. **Keep top navigation compact and game-site-like.**
   - Recommended desktop nav:
     ```text
     Wordle Royale | Play ▾ | Lobbies | Leaderboard | Learn ▾ | Profile ▾ | Server
     ```
   - Recommended mobile nav:
     ```text
     Wordle Royale | Play | Lobbies | Ratings | Menu
     ```

4. **Use honest placeholders for not-yet-real product areas.**
   - Settings/account and history/analysis are useful product navigation affordances, but should be labeled clearly as coming soon or stub/local.

5. **Preserve live/fallback and spoiler-safety rules.**
   - Page extraction must not expose active-match answers, answer hashes, salts, or client-authoritative scoring.
   - Server/API state remains visible, but secondary.

6. **Do not broaden Ticket 67 into backend or product expansion.**
   - Ticket 67 should be route shell + navigation + component reuse only.
   - No new backend endpoints, auth, tournaments, real match history, or gameplay contract changes.

## Detailed Output

### Top-level pages

| Route | Page purpose | Real vs placeholder for Ticket 67 | Implementation guidance |
|---|---|---:|---|
| `/` | Compact game-site front door | Real, minimal | Small landing/front door with links to Play, Lobbies, Leaderboard, Rules. No large marketing hero. |
| `/play` | Main ranked play/game board workspace | Real | Reuse current `GameplayScreen`, `LobbyBrowser`, `StatusStrip`, server actions, and existing query-state handling. |
| `/lobbies` | Room discovery/create/join | Real | Reuse `LobbyBrowser` and `WaitingRoom`; no full board unless entering `/play?matchId=...`. |
| `/leaderboard` | Ratings/rankings | Real | Reuse `ProfileLeaderboard` data from `getWebApiSnapshot`. |
| `/profile` | Current local/stub player profile | Real | Show display/rating/provisional status and future history/settings links. |
| `/learn/rules` | Rules/how-to-play | Real static | Explain ranked Wordle Royale rules, scoring summary, and fair play/spoiler safety. |
| `/settings` | Settings/account placeholder | Placeholder | Clear stub/auth-not-production copy. |
| `/history` | Match history/analysis placeholder | Placeholder | Useful product direction; no history API required. |
| `/server` | API/readiness/source status | Real small page | Reuse existing status/readiness data so QA can verify live/fallback state. |

### Dropdown/menu groups

#### Play dropdown

| Label | Route | Ticket 67 status |
|---|---|---:|
| Play rated | `/play` | Real |
| Create lobby | `/lobbies?intent=create` or `/play?intent=create` | Real-ish focus/query state |
| Join by code | `/lobbies?intent=join` | Real-ish focus/query state |
| Current match | `/play?matchId=<id>` | Real when query exists |
| Practice preview | `/play/practice` | Optional; skip unless trivial |

#### Learn dropdown

| Label | Route | Ticket 67 status |
|---|---|---:|
| Rules | `/learn/rules` | Real static |
| Scoring | `/learn/rules#scoring` or `/learn/scoring` | Prefer section or placeholder |
| Fair play | `/learn/rules#fair-play` or `/learn/fair-play` | Prefer section or placeholder |

#### Profile dropdown

| Label | Route | Ticket 67 status |
|---|---|---:|
| My profile | `/profile` | Real |
| Match history | `/history` | Placeholder |
| Settings | `/settings` | Placeholder |
| Account | `/settings#account` or `/account` | Prefer folded into settings |

#### Server/status

| Label | Route | Ticket 67 status |
|---|---|---:|
| Server | `/server` | Real small page |

### Mobile navigation implications

Mobile should not mirror desktop dropdowns as hover menus.

Recommended mobile structure:

1. Top or bottom primary tabs:
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
3. `/play` mobile ordering:
   - board/current match first,
   - match actions/guess form next,
   - lobby/status below,
   - long explanatory content never above the board.
4. Use full-width disclosure/menu lists on mobile; avoid hover-only dropdowns and fixed-position menus that overflow safe areas.

### Accessibility requirements for Ticket 67

Luna should implement:

- real links for primary navigation,
- keyboard-openable dropdown/disclosure behavior,
- visible focus states,
- `aria-label` on primary navigation,
- `aria-expanded`/`aria-controls` for interactive dropdowns if used,
- no hover-only access,
- simple behavior over clever animation.

### Suggested component boundaries

| Component | Responsibility |
|---|---|
| `SiteNav` | Top nav/dropdowns; pure navigation, no API calls. |
| `PageFrame` | Shared shell/main wrapper and optional status line. |
| `HomeLanding` | Compact `/` front door content. |
| `RulesPageContent` | Static `/learn/rules` content. |
| `PlaceholderPage` | Honest coming-soon page for settings/history/account. |

Avoid:

- central route registry complexity,
- new client router abstraction,
- duplicating API client logic per page,
- putting gameplay state into nav components.

## Open Questions

None blocking Ticket 67.

Optional product questions for Ashar/Luna after implementation:

1. Should `/history` be visible now as a placeholder, or hidden until a real match-history API exists?
2. Should mobile use bottom tabs or compact top tabs? Recommendation: top tabs for web-responsive MVP; bottom tabs can be a later native/mobile decision.
3. Should `/analysis` appear now? Recommendation: no; wait until match history/result data is richer.

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns web UI implementation.
- **Exact task:** Implement Ticket 67 route shell and dropdown navigation using `docs/2026-06-30-multi-page-information-architecture.md`.
- **Inputs/context:** This response, IA doc, existing `apps/web/src/app/page.tsx`, existing components under `apps/web/src/components/`, and `docs/2026-06-30-lichess-style-web-ui-direction.md`.
- **Expected output:** Routes/pages, accessible nav/dropdowns, reused live widgets, web/root build results, screenshots or browser notes if possible.

### Follow-up Ticket 2

- **Target agent:** Jasmine
- **Why that agent is needed:** QA ownership.
- **Exact task:** In Wave J QA, verify route navigation, keyboard/touch menu usability, responsive bounds, live/fallback visibility, and spoiler safety after Ticket 67.
- **Inputs/context:** Ticket 66 and 67 responses.
- **Expected output:** Pass/fail matrix with blockers vs warnings.

## Files Changed

- `docs/2026-06-30-multi-page-information-architecture.md`
- `agent-communication/responses/ticket-66-elisa-lichess-style-information-architecture-pages-dropdowns-response.md`

No source code, contracts, package files, or backend files were changed.

## Tests / Commands Run

Planning/spec ticket only. No build/test commands were required because no source code was edited.

Read/inspection performed:

- `agent-communication/tickets/ticket-66-elisa-lichess-style-information-architecture-pages-dropdowns.md`
- `docs/2026-06-30-athena-review-after-tickets-58-64.md`
- `docs/2026-06-30-lichess-style-web-ui-direction.md`
- `agent-communication/tickets/ticket-67-luna-web-multi-page-shell-and-dropdown-navigation.md`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/layout.tsx`
- current web component list under `apps/web/src/components/`

Command run for date grounding:

```bash
date +%F
```

Output:

```text
2026-06-30
```

## Evidence / Result

Acceptance criteria status:

- **Propose top-level pages and dropdown/menu groups:** yes.
- **Cover Play, Lobbies, Leaderboard, Profile, Learn/Rules, Settings/Account placeholder, and maybe Analysis/History:** yes; History included as placeholder, Analysis deferred.
- **Specify real now vs placeholder/coming-soon:** yes; see route/status tables.
- **Define web route structure and mobile navigation implications:** yes.
- **Keep MVP small enough for Luna Ticket 67:** yes; route shell + component reuse, no backend/contracts/auth/history expansion.
- **Write short IA/design note under docs:** yes, `docs/2026-06-30-multi-page-information-architecture.md`.

## Risks / Blockers

### Blockers

None for Ticket 66.

### Risks / warnings

1. **Dropdown implementation can become overbuilt.** Luna should prefer simple accessible disclosure menus over custom animation/state complexity.
2. **Too many placeholder pages can feel empty.** MVP should make `/settings` and `/history` honest but lightweight; avoid adding more placeholders like tournaments/analysis now.
3. **Splitting routes may duplicate data loading.** Luna should extract small shared helpers/components instead of copying API calls into every page.
4. **Mobile safe-area/bounds remain a separate concern.** Ticket 66 defines implications; Ticket 68 should audit actual responsive behavior after implementation.
