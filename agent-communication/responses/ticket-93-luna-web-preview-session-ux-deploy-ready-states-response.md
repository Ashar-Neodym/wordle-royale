# Ticket 93 — Luna Response — Web Preview Session UX and Deploy-Ready States

## Status

Complete.

Implemented the smallest matching web flow for the Ticket 92 preview demo session path. The web preview no longer silently treats fixture users as the current user for profile/history/write actions, and it now exposes explicit `Start preview demo` CTAs where current-player state is required.

## Files changed

- `apps/web/src/lib/api-client.ts`
  - Forwards incoming Next server cookies to API requests so preview demo sessions work on server-rendered web pages.
- `apps/web/src/app/actions.ts`
  - Added `startPreviewDemoSessionAction` to call `POST /auth/preview-demo/start`, copy the API `Set-Cookie` session into the web response, and redirect with clear success/error params.
  - Made ranked action redirects route-aware (`/lobbies` for lobby actions, `/play` for gameplay/report actions) so routed pages retain feedback after server actions.
- `apps/web/src/app/page.tsx`
  - Replaced the fake local profile hero card with explicit preview access/session state.
  - Added `Start preview demo` on the home page when no current session is present.
- `apps/web/src/app/profile/page.tsx`
  - Added explicit preview demo session CTA for auth-limited current-player profile state.
- `apps/web/src/app/history/page.tsx`
  - Added explicit preview demo session CTA for auth-limited current-player history state.
- `apps/web/src/app/lobbies/page.tsx`
  - Passed preview session state and demo-start action into lobby UI.
- `apps/web/src/app/play/page.tsx`
  - Passed preview session state and demo-start action into lobby UI.
- `apps/web/src/components/ProfileHistory.tsx`
  - Extended auth-required panel to optionally render an explicit preview demo CTA.
- `apps/web/src/components/LobbyScreens.tsx`
  - Shows a preview demo session gate for live lobby write actions.
  - Disables create/join/start controls until API is live and a preview demo session is active.
  - Keeps public lobby browsing and invite/share visible.

## Verification

### Automated checks

All required checks passed:

```bash
pnpm --filter @wordle-royale/web typecheck
# exit 0

pnpm --filter @wordle-royale/web build
# exit 0
# Next routes built successfully, including dynamic /, /profile, /history, /lobbies, /play, /matches/[matchId]

pnpm build
# exit 0
# Workspace builds passed for contracts, design-tokens, fixtures, game-engine, rating-tools, mobile, web, word-tools, and api

pnpm secret-scan
# exit 0
# Secret scan passed (189 source/config files scanned)

git diff --check
# exit 0
```

### Local preview/API smoke

Started local dependencies, reset ranked smoke data, and ran API/web locally using redacted local environment values:

- API: `http://127.0.0.1:3093`
- Web: `http://127.0.0.1:3094`

Smoke results:

- `GET /readyz` returned `status: ok` with database and Redis `ok`.
- `POST /auth/preview-demo/start` returned `201 Created` with `mode: preview_demo_session`, a preview demo user, and session cookie metadata.
- Browser smoke on `/`:
  - Before session: showed `Preview access`, `No current user yet`, and `Start preview demo`.
  - After clicking `Start preview demo`: showed `Preview demo session` and an explicit preview demo user.
- Browser smoke on `/profile` after session:
  - Rendered the preview demo profile summary with handle, rating, and empty history instead of fake fixture account data.
  - No browser console errors observed.
- Browser smoke on `/lobbies` after session:
  - Create lobby action succeeded and stayed on `/lobbies` with success feedback.
  - Lobby create/join controls were enabled only after the explicit preview demo session.
  - Invite/share disclosure remained present on live lobby cards.
  - Share textareas contained spoiler-safe copy only, e.g. `Join my Wordle Royale room E31E8C: /lobbies?code=E31E8C`.
- No-auth HTML smoke for `/profile`, `/history`, and `/lobbies`:
  - `/profile` and `/history` rendered `Start preview demo` auth-required CTAs.
  - `/lobbies` rendered preview demo session gating and disabled create write action.
  - Checked rendered HTML did not include answer/hash/salt markers.
- Layout smoke:
  - Browser visual inspection of `/lobbies` showed coherent lobby cards, visible action buttons, success panel, status rail, and no obvious horizontal overflow.
  - DOM check reported no horizontal overflow at the desktop browser viewport (`overflow: false`).

## Cleanup

- Stopped the web dev server.
- Stopped the API dev server.
- Ran `pnpm deps:down` to stop local Postgres/Redis containers.
- Confirmed Hermes tracked background process list was empty.
- Confirmed ports `3093` and `3094` were not listening after cleanup.

## Risks / follow-ups

- This uses the Ticket 92 preview demo session path only; no OAuth/provider setup or production login was added.
- Preview demo session cookies are copied by the web server action from the API response for local/preview server-rendered pages. Production deployment should still verify final domain/proxy cookie behavior once deploy environment variables are wired.
- Lobby write actions are intentionally disabled without an explicit preview demo session; public browsing and invite/share remain available.
