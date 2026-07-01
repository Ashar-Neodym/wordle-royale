# Ticket 34 — Luna Response: Web API Client Integration

## Status
Completed.

## Scope implemented
- Added a typed web API client at `apps/web/src/lib/api-client.ts`.
  - Default API base URL: `http://127.0.0.1:3001`.
  - Supports `NEXT_PUBLIC_API_URL` override.
  - Reads health/readiness, stub current user/profile, and lobby list.
  - Adds create/join helper functions using shared request/DTO contracts.
  - Wraps API failures/timeouts into safe `ApiClientResult` values so the web shell never hangs or crashes when the local API/DB is unavailable.
- Wired the Next.js app shell to fetch a server-side API snapshot and pass it into status/lobby components.
- Updated lobby browser to render local API lobbies when available, otherwise preserve the existing fixture fallback.
- Added an API status card showing connected/fallback state.
- Added `apps/web/.env.local.example` and documented API setup/fallback behavior in `apps/web/README.md`.
- Added `@wordle-royale/contracts` as a web dependency and enabled `allowImportingTsExtensions` for type-only contract imports.
- Small API runtime fix: `apps/api/src/prisma/prisma.service.ts` no longer uses invalid optional tagged-template syntax, which blocked starting the API process.

## Files changed
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/README.md`
- `apps/web/.env.local.example`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/StatusPanels.tsx`
- `apps/web/src/components/LobbyScreens.tsx`
- `apps/api/src/prisma/prisma.service.ts`
- `pnpm-lock.yaml`

## Verification
Commands run from repo root unless noted:

```bash
pnpm --filter @wordle-royale/web add @wordle-royale/contracts@workspace:*
# exit 1 first due existing node_modules store mismatch

pnpm --store-dir /home/ashar/.hermes/profiles/ruby/home/.local/share/pnpm/store/v11 --filter @wordle-royale/web add @wordle-royale/contracts@workspace:*
# exit 0

pnpm --filter @wordle-royale/web typecheck
# exit 0

pnpm --filter @wordle-royale/design-tokens build && pnpm --filter @wordle-royale/fixtures build && pnpm --filter @wordle-royale/web build
# exit 0

pnpm --filter @wordle-royale/api db:generate
# exit 0

pnpm --filter @wordle-royale/web typecheck && pnpm --filter @wordle-royale/web build && pnpm build
# exit 0
```

Runtime smoke:

```bash
pnpm --filter @wordle-royale/api exec tsx src/main.ts
# API process started after Prisma client generation and prisma.service syntax fix

curl -sS --max-time 10 http://127.0.0.1:3001/healthz
# returned 200 JSON envelope with wordle-royale-api status ok

curl -sS --max-time 10 http://127.0.0.1:3001/lobbies
# returned API error envelope because no local DB/seeded lobbies are available in this environment

NEXT_PUBLIC_API_URL=http://127.0.0.1:3001 pnpm exec next dev --hostname 127.0.0.1 --port 3100
curl -I --max-time 10 http://127.0.0.1:3100
# returned HTTP/1.1 200 OK
```

Browser smoke at `http://127.0.0.1:3100`:
- Page title: `Wordle Royale — Crown Grid Arena`.
- Status strip showed `API connected` from `/healthz`.
- Lobby browser showed `FIXTURE FALLBACK` because `/lobbies` returned an API error in this environment.
- Browser console had no JS errors.

## Notes / risks
- The web client is intentionally defensive: if any API endpoint is unavailable, slow, or returns an error envelope, the page renders fixture fallback UI.
- Local `/lobbies` currently depends on Prisma/local DB state; without a DB/seed it returns an API error envelope. The page handles that correctly.
- No real auth/gameplay/client-authoritative behavior was added.
