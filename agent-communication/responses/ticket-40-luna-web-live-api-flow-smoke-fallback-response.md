# Web Live API Flow Smoke and Fallback Refinement — Response

## Summary

Ticket 40 is complete.

I verified the web app against the live local API/DB path left running by Ticket 39 and refined the web UI/client behavior so the lobby browser clearly distinguishes live API data from fixture fallback.

Key results:

- Live local Postgres/Redis containers were healthy via the Yuna-profile Docker Compose plugin path.
- Live API `/healthz`, `/readyz`, and `/lobbies` were reachable on `http://127.0.0.1:3016`.
- Web dev smoke showed:
  - API status card: `API connected · readiness ok`.
  - Dependency summary: `database: ok · redis: ok`.
  - Stub profile from live API/DB: `Player One · 1200 rating`.
  - Lobby browser source: `LOCAL API ROUTE`.
  - Live lobby card rendered from `/lobbies`, code `94F238`, `2/4 players`.
- Fallback smoke after stopping the API showed:
  - API status card: `API fixture fallback`.
  - Lobby fallback text with `fetch failed`.
  - Lobby browser source: `FIXTURE FALLBACK`.
  - Fixture lobbies `CROWN1` and `GRID22` rendered.
- Browser console had no JavaScript errors in both live and fallback states.
- `pnpm --filter @wordle-royale/web build` passed.
- Root `pnpm build` passed.

## Decisions / Recommendations

1. **Use live API data whenever `/lobbies` returns successfully, even if the list is empty.**
   - Before this refinement, the web UI only used API lobby data when `items.length > 0`, so a valid empty live response would silently show fixtures.
   - I changed the behavior so fallback only happens when the API result is unavailable/error/null.
   - If the live API returns an empty list, the UI now shows a live empty-state card instead of fixture lobbies.

2. **Expose readiness dependencies in the status card.**
   - The card now shows health and readiness separately, plus dependency status summaries like `database: ok · redis: ok`.
   - This makes local runtime problems visible instead of hiding them behind a generic “API connected” label.

3. **Keep fallback explicit and non-authoritative.**
   - The fallback copy names the unavailable API URL and states that shared fixture lobbies are being rendered.
   - No real auth, paid service, deployment, or client-authoritative gameplay/rating logic was added.

## Detailed Output

### Code refinements

- Updated `LobbyListPayload` in `apps/web/src/lib/api-client.ts` to match the actual API list envelope shape:
  - `items`
  - `pagination.nextCursor`
- Updated `apps/web/src/components/StatusPanels.tsx`:
  - status headline now includes readiness status;
  - body includes health plus dependency statuses;
  - profile and lobby fallback errors remain visible when available.
- Updated `apps/web/src/components/LobbyScreens.tsx`:
  - live API lobby data is used whenever `/lobbies` succeeds, including empty lists;
  - empty live lobby list renders a clear “No open lobbies” card;
  - fixture fallback only renders when API lobby data is unavailable;
  - copy spacing/readability was cleaned up.

### Live API/browser smoke

Local dependencies were already running from Ticket 39 and verified healthy:

```text
wordle-royale-postgres   postgres   Up ... (healthy)
wordle-royale-redis      redis      Up ... (healthy)
```

API process used for this ticket:

```bash
PORT=3016 DATABASE_URL='<local-compose-postgres-url>' REDIS_URL='<local-redis-url>' pnpm --filter @wordle-royale/api exec tsx src/main.ts
```

Representative API smoke:

```text
GET /healthz -> HTTP 200, data.status=ok
GET /readyz -> HTTP 200, data.status=ok, database.status=ok, redis.status=ok
GET /lobbies -> HTTP 200, returned one live lobby code 94F238
```

Web process used for browser smoke:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3016 pnpm exec next dev --hostname 127.0.0.1 --port 3100
```

Live browser state observed at `http://127.0.0.1:3100`:

```text
API connected · readiness ok
wordle-royale-api health ok · database: ok · redis: ok
Stub profile: Player One · 1200 rating
LOCAL API ROUTE
Rendering 1 live lobby stub(s) from http://127.0.0.1:3016/lobbies.
Lobby card: 94F238, public, 2/4 players, 3 rounds, 120s
```

Fallback browser state after stopping the API process and reloading the same web dev server:

```text
API fixture fallback
Using fixture fallbacks because http://127.0.0.1:3016 is unavailable: fetch failed
Lobby list fallback: fetch failed
FIXTURE FALLBACK
API unavailable at http://127.0.0.1:3016; rendering shared fixture lobbies instead.
Fixture lobby cards: CROWN1 and GRID22
```

Browser console check:

```text
console_messages: []
js_errors: []
total_errors: 0
```

## Open Questions

1. Should a future ticket add a dedicated `pnpm smoke:web:local-api` script to automate this browser/API fallback smoke?
2. Should the web shell expose separate badges for `health`, `database`, and `redis` rather than status-card text as the UI matures?
3. Should the quick join panel start calling a real API endpoint in the next frontend slice, or wait until gameplay persistence/auth boundaries are firmer?

## Follow-up Tickets

1. **Luna or Freya — Web live lobby actions**
   - Add a guarded frontend flow for create/join lobby against the local API.
   - Keep controls clearly marked as stub/local until auth/gameplay authority is finalized.
   - Expected output: UI flow plus browser smoke against live Postgres/Redis.

2. **Yuna — Profile-local Docker Compose availability**
   - Decide whether each Hermes profile should have its own Docker Compose plugin setup or whether the shared `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker` workaround should be formalized.
   - Expected output: updated local dev docs/scripts.

3. **Jasmine — Wave F QA review**
   - Re-run QA over Wave F with the refined web live/fallback status behavior.
   - Expected output: QA acceptance/blocker report for runtime verification.

## Files Changed

Ticket 40 source refinements:

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/components/StatusPanels.tsx`
- `apps/web/src/components/LobbyScreens.tsx`

Ticket response artifact:

- `agent-communication/responses/ticket-40-luna-web-live-api-flow-smoke-fallback-response.md`

Note: the working tree already contained prior uncommitted Wave E/F files from earlier tickets; this ticket did not push or attempt to commit.

## Tests / Commands Run

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose ps --format 'table {{.Name}}\t{{.Service}}\t{{.Status}}'
# exit code: 0
```

```bash
pnpm --filter @wordle-royale/web typecheck
# first run exit code: 2; caught a nullable apiLobbies.data issue from this ticket's refinement
```

```bash
pnpm --filter @wordle-royale/web typecheck
# final exit code: 0
```

```bash
PORT=3016 DATABASE_URL='<local-compose-postgres-url>' REDIS_URL='<local-redis-url>' pnpm --filter @wordle-royale/api exec tsx src/main.ts
# started as tracked background process for smoke, then killed for fallback verification
```

```bash
curl -sS -w '\nHTTP_STATUS:%{http_code}\n' --max-time 10 http://127.0.0.1:3016/healthz
# exit code: 0; HTTP_STATUS:200
```

```bash
curl -sS -w '\nHTTP_STATUS:%{http_code}\n' --max-time 10 http://127.0.0.1:3016/readyz
# exit code: 0; HTTP_STATUS:200; database ok; redis ok
```

```bash
curl -sS -w '\nHTTP_STATUS:%{http_code}\n' --max-time 10 http://127.0.0.1:3016/lobbies
# exit code: 0; HTTP_STATUS:200; returned live lobby 94F238
```

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3016 pnpm exec next dev --hostname 127.0.0.1 --port 3100
# started as tracked background process for browser smoke, then killed after verification
```

```bash
curl -I --max-time 15 http://127.0.0.1:3100
# exit code: 0; HTTP/1.1 200 OK
```

```bash
# Browser smoke via browser tools at http://127.0.0.1:3100
# live API state observed; console had no messages/errors
```

```bash
# Killed API process, reloaded http://127.0.0.1:3100
# fallback state observed; console had no messages/errors
```

```bash
pnpm --filter @wordle-royale/web build && pnpm build
# exit code: 0
```

## Evidence / Result

Acceptance criteria status:

- **`pnpm --filter @wordle-royale/web build` passes:** yes.
- **Root `pnpm build` passes:** yes.
- **Browser smoke evidence includes API-connected and/or fallback states:** yes, both live API-connected and API-stopped fallback states were observed.
- **No paid services, secrets, or real auth added:** yes.
- **Do not push:** no push performed.

Live browser evidence summary:

```text
API connected · readiness ok
wordle-royale-api health ok · database: ok · redis: ok
LOCAL API ROUTE
94F238 rendered from live /lobbies
```

Fallback browser evidence summary:

```text
API fixture fallback
Lobby list fallback: fetch failed
FIXTURE FALLBACK
CROWN1 and GRID22 fixture lobby cards rendered
```

## Risks / Blockers

1. **Compose plugin remains profile-scoped.** This Luna run used `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker` to inspect the running local dependencies, matching Ticket 39’s workaround.
2. **Local DB state includes prior smoke data.** The live lobby `94F238` came from Ticket 39’s local smoke state and remains in local Postgres.
3. **Auth remains intentionally stubbed.** The profile shown in the web UI is the local stub profile, not production authentication.
4. **No automated browser smoke script yet.** Browser verification was manual/tool-driven in this ticket.
