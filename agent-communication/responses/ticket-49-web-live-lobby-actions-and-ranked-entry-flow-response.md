# Ticket 49 — Web Live Lobby Actions and Ranked Entry Flow

Task: Move the web UI from live display/fallback into the first live action flow.
Agent: Luna (coder)
Status: Completed

## Summary

Implemented the first web live-action flow against the local REST API while preserving fixture fallback behavior:

- Added server actions for live ranked lobby creation, lobby join by code, lobby join by card, and ranked match start.
- Extended the web API client with `POST /matches/ranked/start` and `GET /matches/:matchId/state` helpers.
- Updated the lobby browser to render live API lobbies when reachable, fixture cards when not reachable, and explicit live-vs-fixture labels.
- Added visible success/error/empty/disabled states for live actions.
- Added a guarded ranked start button that enables only for live ranked-compatible lobbies with at least two members.
- Added live ranked match snapshot rendering above the existing fixture gameplay board after a ranked start.
- Kept answer/hash/salt authority out of the web UI; the live panel only displays spoiler-safe match state.

## Files changed

- `apps/web/src/app/actions.ts` — new Next server actions for create/join/start flow.
- `apps/web/src/app/page.tsx` — dynamic page wiring, query-state feedback, live match-state fetch.
- `apps/web/src/app/layout.tsx` — React type annotations needed for portable web build.
- `apps/web/src/lib/api-client.ts` — ranked start/state API helpers.
- `apps/web/src/components/LobbyScreens.tsx` — live lobby actions, fallback labels, empty/error/disabled states.
- `apps/web/src/components/GameplayScreen.tsx` — live ranked snapshot panel plus fixture fallback board.
- `apps/web/src/components/StatusPanels.tsx` — API status card now receives live API snapshot.
- `apps/web/src/components/ReportAndProfile.tsx` — React return type annotations needed for build.
- `apps/web/src/components/WordTile.tsx` — React return type annotations needed for build.
- `apps/web/src/components/web-shell.module.css` — styles for forms, action rows, success/error panels, guarded buttons, compact live gameplay layout.
- `agent-communication/responses/ticket-49-web-live-lobby-actions-and-ranked-entry-flow-response.md` — this handoff.

## Verification

### Static/build checks

```bash
pnpm --filter @wordle-royale/web typecheck
```

Exit code: `0`

Output summary:

```text
$ tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @wordle-royale/web build
```

Exit code: `0`

Output summary:

```text
$ next build
▲ Next.js 16.2.9 (Turbopack)
✓ Compiled successfully in 5.2s
Running TypeScript ...
Finished TypeScript in 2.4s ...
Route (app)
┌ ƒ /
└ ○ /_not-found
```

### API setup used for live smoke

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:up
```

Exit code: `0`; Postgres/Redis containers started.

```bash
DATABASE_URL='<local-compose-database-url>' pnpm --filter @wordle-royale/api db:migrate:deploy && \
DATABASE_URL='<local-compose-database-url>' pnpm --filter @wordle-royale/api db:seed:local
```

Exit code: `0`

Output summary:

```text
No pending migrations to apply.
Applied local fixture seed: en-5-test-vfixture.001
```

```bash
DATABASE_URL='<local-compose-database-url>' pnpm --filter @wordle-royale/api test
```

Exit code: `0`; 22/22 API tests passed.

### Live API flow smoke

Started API on `http://127.0.0.1:3019`, then ran a direct live REST smoke:

- `POST /lobbies` created a public ranked-compatible lobby.
- `POST /lobbies/:lobbyId/join` added the local guest stub.
- `POST /matches/ranked/start` returned an in-progress match.
- `GET /matches/:matchId/state` returned spoiler-safe live match state.

Exit code: `0`

Output summary:

```json
{
  "lobby": {
    "id": "5c6023c5-be5c-4888-ab88-3324e16a0a7a",
    "code": "8D0025",
    "rankedCompatible": true,
    "membersAfterJoin": 2
  },
  "start": {
    "matchId": "b47a1daa-cbd0-4ca8-a67d-592b5d0d6ce1",
    "roundId": "97fe6736-df96-401a-9929-0009a00e9434",
    "state": "in_progress"
  },
  "state": {
    "matchId": "b47a1daa-cbd0-4ca8-a67d-592b5d0d6ce1",
    "state": "in_progress",
    "roundState": "active",
    "standings": 2,
    "guesses": 0
  }
}
```

### Web live API smoke

Started web dev server with:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3019 pnpm --filter @wordle-royale/web exec next dev --hostname 127.0.0.1 --port 3020
```

Fetched the page with the live `matchId` and verified live markers in server-rendered HTML.

Exit code: `0`

Output summary:

```text
Local API route: True
Started ranked match b47a1daa-cbd0-4ca8-a67d-592b5d0d6ce1: True
Live ranked REST: True
Live standings: True
```

### API-stopped fallback smoke

Stopped API/deps and started web dev server without `NEXT_PUBLIC_API_URL` override:

```bash
pnpm --filter @wordle-royale/web exec next dev --hostname 127.0.0.1 --port 3021
```

Fetched the root page and verified fallback markers in server-rendered HTML.

Exit code: `0`

Output summary:

```text
Fixture fallback: True
API unavailable at http://127.0.0.1:3001: True
Live actions disabled: True
Gameplay fixture: True
```

Cleanup:

- Killed the temporary API and web dev server background processes.
- Ran `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:down` successfully to stop/remove local Compose containers.

## Result

Ticket 49 acceptance criteria are met. The web shell now supports the first live local action flow: create ranked lobby, join, start ranked match, and render live match state, while retaining clear fixture fallback behavior when the API is unavailable.

## Risks / follow-ups

- The current flow still uses stub auth/users from the backend slice; real authenticated user routing remains future work.
- Ranked start is intentionally guarded in the UI until the lobby has at least two members; for local smoke, joining the newly created lobby once adds the backend stub guest.
- The page uses URL query parameters for post-action feedback. A future client-side controller can improve UX with optimistic pending states after the realtime/client-state layer exists.
