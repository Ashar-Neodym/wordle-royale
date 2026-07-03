# Ticket 67 — Web Multi-Page Shell and Dropdown Navigation Response

Task: Move the web app from a mostly one-page shell toward a lichess-like multi-page product shell.
Agent: Luna
Status: Complete

## Summary

Implemented the first route-based web product shell for Wordle Royale.

The app now has real pages for:

- `/` — compact front door, not the whole app
- `/play` — board-first ranked match workspace
- `/lobbies` — lobby discovery/create/join flow
- `/leaderboard` — ratings page
- `/profile` — current local/stub player profile and rating context
- `/learn/rules` — static rules/scoring/fair-play page
- `/settings` — honest account/settings placeholder
- `/history` — honest match-history placeholder
- `/server` — live/fallback readiness/status page

Added a shared compact navigation shell with desktop dropdown groups and a mobile disclosure menu. The implementation reuses existing API clients, server actions, and live/fallback components; it does not add backend endpoints, auth, match history APIs, or gameplay contract changes.

## Decisions / Recommendations

1. **Moved one-page app content into product routes.**
   - `/play` owns the gameplay board and ranked match query behavior.
   - `/lobbies` owns room discovery and create/join/start controls.
   - `/leaderboard`, `/profile`, and `/server` reuse existing snapshot/API display logic.

2. **Kept navigation simple and accessible.**
   - Desktop uses native `<details>/<summary>` dropdown/disclosure groups for Play, Learn, and Profile.
   - Mobile uses a separate `Menu` disclosure with full-width links.
   - Links are real anchors, not section-only buttons.
   - Focus-visible states are explicit and high-contrast.

3. **Preserved spoiler safety and authority boundaries.**
   - No new client scoring or backend shortcuts were added.
   - `/play` continues to depend on server-ranked state for live matches.
   - Static rules mention answer/hash/salt safety, but route HTML smoke found no serialized `answerHash`, `answerSalt`, `answer\":`, `hash\":`, or `salt\":` keys.

4. **Kept placeholders honest.**
   - `/settings` and `/history` clearly state that auth/settings/history are not production-ready.
   - No fake account or match-history functionality was introduced.

## Detailed Output

### Shared shell/navigation

Added:

- `apps/web/src/components/SiteNav.tsx`
- `apps/web/src/components/PageFrame.tsx`

`SiteNav` provides:

```text
Wordle Royale | Play ▾ | Lobbies | Leaderboard | Learn ▾ | Profile ▾ | Server
```

Dropdown groups:

- Play:
  - `/play`
  - `/lobbies?intent=create`
  - `/lobbies?intent=join`
- Learn:
  - `/learn/rules`
  - `/learn/rules#scoring`
  - `/learn/rules#fair-play`
- Profile:
  - `/profile`
  - `/history`
  - `/settings`
- Mobile menu:
  - `/play`, `/lobbies`, `/leaderboard`, `/profile`, `/learn/rules`, `/history`, `/settings`, `/server`

### Pages/routes

Added/rewired:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/play/page.tsx`
- `apps/web/src/app/lobbies/page.tsx`
- `apps/web/src/app/leaderboard/page.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/learn/rules/page.tsx`
- `apps/web/src/app/settings/page.tsx`
- `apps/web/src/app/history/page.tsx`
- `apps/web/src/app/server/page.tsx`
- `apps/web/src/app/page-helpers.ts`

Route behavior:

- `/` is now a compact front door with direct links and a small status strip.
- `/play` keeps existing `matchId`, `roundId`, action status, guess feedback, ranked submit, and finalization behavior.
- `/lobbies` keeps live/fallback lobby behavior and existing server actions.
- `/leaderboard` and `/profile` reuse `ProfileLeaderboard`.
- `/server` exposes API URL, health/readiness, lobby/leaderboard/profile status, and dependency status.
- `/learn/rules` provides static rules/scoring/fair-play copy.
- `/settings` and `/history` are honest placeholders.

### Styling

Updated `apps/web/src/components/web-shell.module.css` with:

- compact dropdown/menu styles;
- focus-visible states;
- route cards;
- page headers;
- lobbies/server/rules route layouts;
- mobile menu behavior at small widths;
- no glow/gradient/SaaS treatment added.

## Open Questions

None blocking Ticket 67.

Optional follow-up for Ashar/Jasmine:

- Confirm whether `/history` should stay visible as a placeholder or be hidden until a real history API exists.
- Ticket 68 should do the dedicated responsive bounds audit after this route split.

## Follow-up Tickets

1. **Jasmine QA — Wave J route/navigation review**
   - Verify route coverage, dropdown keyboard/touch behavior, mobile menu, live/fallback state visibility, and spoiler safety.
   - Inputs: Ticket 66 IA doc, this Ticket 67 response, current web routes.

2. **Luna/Freya — optional visual polish after QA**
   - Only if Jasmine/Ashar flags taste/layout issues.
   - Keep changes narrow: spacing, active nav affordance, responsive tightening.

## Files Changed

Changed for this ticket:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/play/page.tsx`
- `apps/web/src/app/lobbies/page.tsx`
- `apps/web/src/app/leaderboard/page.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/learn/rules/page.tsx`
- `apps/web/src/app/settings/page.tsx`
- `apps/web/src/app/history/page.tsx`
- `apps/web/src/app/server/page.tsx`
- `apps/web/src/app/page-helpers.ts`
- `apps/web/src/components/SiteNav.tsx`
- `apps/web/src/components/PageFrame.tsx`
- `apps/web/src/components/web-shell.module.css`
- `agent-communication/responses/ticket-67-luna-web-multi-page-shell-and-dropdown-navigation-response.md`

Pre-existing dirty work remains in the repository from earlier tickets; this response lists only Ticket 67 changes.

## Tests / Commands Run

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

```bash
pnpm --filter @wordle-royale/web typecheck
```

Exit code: 0

```text
$ tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @wordle-royale/web build
```

Exit code: 0

Key output:

```text
✓ Compiled successfully
Route (app)
┌ ƒ /
├ ○ /_not-found
├ ○ /history
├ ƒ /leaderboard
├ ○ /learn/rules
├ ƒ /lobbies
├ ƒ /play
├ ƒ /profile
├ ƒ /server
└ ○ /settings
```

```bash
pnpm build
```

Exit code: 0

Key output:

```text
apps/web build: ✓ Compiled successfully
apps/mobile build: Done
apps/api build: Done
```

```bash
pnpm secret-scan
```

Exit code: 0

```text
Secret scan passed (179 source/config files scanned).
```

Browser/static route smoke:

```bash
pnpm --filter @wordle-royale/web exec next start --hostname 127.0.0.1 --port 3067
```

Started for smoke testing, then stopped.

Checked routes via HTTP:

```text
/              200
/play          200
/lobbies       200
/leaderboard   200
/profile       200
/learn/rules   200
/settings      200
/server        200
/history       200
```

Spoiler-key smoke on `/play` and `/learn/rules`:

```text
answerHash False
answerSalt False
answer\": False
salt\": False
hash\": False
```

Browser console smoke:

```text
0 JavaScript errors
```

Dropdown/menu DOM smoke:

```json
[
  { "summary": "Play", "links": ["/play", "/lobbies?intent=create", "/lobbies?intent=join"] },
  { "summary": "Learn", "links": ["/learn/rules", "/learn/rules#scoring", "/learn/rules#fair-play"] },
  { "summary": "Profile", "links": ["/profile", "/history", "/settings"] },
  { "summary": "Menu", "links": ["/play", "/lobbies", "/leaderboard", "/profile", "/learn/rules", "/history", "/settings", "/server"] }
]
```

Cleanup:

```text
Stopped Next server on port 3067.
Verified no tracked background processes remained.
```

## Evidence / Result

Acceptance criteria status:

- **Implement top-level navigation and dropdown/menu groups per Ticket 66:** done.
- **Add real routes/pages for Play, Lobbies, Leaderboard, Profile, Learn/Rules, Settings/Account placeholder:** done. Also added `/history` placeholder and `/server` status page from Ticket 66 IA.
- **Reuse existing live widgets without duplicating API logic:** done; reused `getWebApiSnapshot`, ranked match APIs, `LobbyBrowser`, `GameplayScreen`, `ProfileLeaderboard`, and `StatusStrip`.
- **Keep style calm, human, game-first:** done; browser visual smoke showed a compact dark game-site layout with board-first `/play` route and no obvious layout breakage.
- **Preserve live/fallback behavior and spoiler safety:** done; offline fixture fallback remains labeled, server status remains visible, and no active spoiler keys were serialized in smoke checks.
- **Make keyboard/focus states usable:** done via native disclosure menus and explicit focus-visible CSS.

## Risks / Blockers

### Blockers

None for Ticket 67.

### Risks / warnings

1. Visual QA is still recommended. I performed browser smoke and visual inspection, but final taste should be reviewed by Ashar/Jasmine.
2. `/history` and `/settings` are placeholders by design. They should either stay visibly honest or be hidden later if the product feels too empty.
3. Mobile/responsive bounds need Ticket 68's dedicated audit; Ticket 67 only added route/mobile menu structure and basic responsive CSS.
