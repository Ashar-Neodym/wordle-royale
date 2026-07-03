# Wordle Royale Local Development

This document covers local-only developer infrastructure for the first build wave.

## Prerequisites

- Node.js 20+
- pnpm 11+
- Docker with Docker Compose v2

## Docker Compose v2 discovery

The repo's local-dev scripts resolve Docker Compose v2 in this order:

1. the current shell environment,
2. `DOCKER_CONFIG` if already set,
3. the current `$HOME/.docker` plugin directory,
4. known user-local Hermes profile Docker configs such as `/home/ashar/.hermes/profiles/yuna/home/.docker`.

This keeps `pnpm deps:check`, `pnpm deps:verify`, `pnpm deps:up`, `pnpm deps:down`, `pnpm deps:reset`, and `pnpm smoke:local` usable from Hermes profiles that do not have their own Compose plugin installed. You should not need to remember the Yuna-specific `DOCKER_CONFIG` prefix for normal repo checks. If needed for manual Docker commands, this equivalent form remains available:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose version
```

Do not install Docker Compose system-wide from this project unless Ashar explicitly approves.

## Local services

`docker-compose.yml` starts only:

- PostgreSQL 16
- Redis 7

Application processes are intentionally not run in Docker. Run web/API/mobile/worker processes with pnpm scripts so developers can see and restart each process independently.

## Environment files

Templates:

- `.env.example` — shared placeholder template.
- `.env.local.example` — local-development placeholder template.

Create a local env file if your app package needs one:

```bash
cp .env.local.example .env.local
```

The example files intentionally do not contain production secrets. Local database URLs match the host/database in `docker-compose.yml`, while the password remains redacted as `***`; replace placeholder values with local-only disposable values after copying. Do not commit `.env` or `.env.local`.

## Commands

Install dependencies:

```bash
pnpm install
```

Start local PostgreSQL and Redis:

```bash
pnpm deps:up
```

Validate Docker Compose syntax only:

```bash
pnpm deps:check
```

Start PostgreSQL/Redis, wait for health/readiness, then stop them again:

```bash
pnpm deps:verify
```

`pnpm deps:verify` runs `docker compose config`, `docker compose up -d postgres redis`, container health polling, `pg_isready`, `redis-cli ping`, and `docker compose down` cleanup.

Reset the local ranked-smoke database schema and reseed deterministic fixture data:

```bash
pnpm deps:up
pnpm ranked:smoke:reset
pnpm deps:down
```

`pnpm ranked:smoke:reset` is intentionally local-only. It refuses production-like environments and only targets the local Compose PostgreSQL shape: `wordle` user, `wordle_royale_local` database, `localhost:5432`, and no required SSL. It drops/recreates the local `public` schema, runs Prisma `db push` against the current local schema, then applies the existing fixture seed. This clears accumulated local lobbies, matches, guesses, reports, rating events, and snapshots so ranked smoke tests start from repeatable fixture users/dictionary data. The fixture seed also explicitly creates the local stub host/guest users used by direct lobby smoke tests:

- `11111111-1111-4111-8111-111111111111` / `player_one` / `Player One`
- `22222222-2222-4222-8222-222222222222` / `guest_player` / `Guest Player`

For a local ranked demo bootstrap, start the API after reset and prove direct lobby creation works without first calling `/auth/me`:

```bash
pnpm deps:up
pnpm ranked:smoke:reset
PORT=4000 pnpm --filter @wordle-royale/api dev
# in another shell once /readyz is ok:
API_BASE_URL=http://127.0.0.1:4000 pnpm ranked:smoke:bootstrap
pnpm deps:down
```

`pnpm ranked:smoke:bootstrap` calls `/readyz`, then directly calls `POST /lobbies` and `POST /lobbies/:id/join`. It intentionally does **not** call `/auth/me`; success proves the reset seed contains the stub users needed by the lobby foreign keys.

## First playable ranked demo

Use this copy-paste flow for a local demo. It installs/checks the workspace, starts local dependencies, resets/seeds the local ranked DB, starts API + web, then runs an HTTP-only ranked E2E smoke without manual DB edits.

```bash
pnpm install --frozen-lockfile
pnpm deps:check
pnpm deps:up
pnpm ranked:smoke:reset
```

Terminal 1 — API:

```bash
PORT=4000 pnpm --filter @wordle-royale/api dev
```

Terminal 2 — web:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000 pnpm --filter @wordle-royale/web dev
```

Terminal 3 — once `http://127.0.0.1:4000/readyz` is ok:

```bash
API_BASE_URL=http://127.0.0.1:4000 pnpm ranked:demo:e2e
```

Expected `ranked:demo:e2e` output is JSON with `"result": "ok"`, `createLobby/startMatch/complete/result/leaderboard` statuses, rating deltas, and `"leaks": []`. The script uses local/dev HTTP helpers for fixture users and does not require direct SQL or manual DB edits.

Open the web demo at:

```text
http://127.0.0.1:3000/?matchId=<matchId-from-ranked-demo-e2e>#gameplay
```

Cleanup:

```bash
# stop API and web with Ctrl-C
pnpm deps:down
```

Stop local services:

```bash
pnpm deps:down
```

Reset local services and delete local Docker volumes:

```bash
pnpm deps:reset
```

Run local config smoke checks:

```bash
pnpm smoke:local
```

Current scaffold validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

These currently run the workspace validator until real app/package implementations replace placeholder scripts.

## Expected local service defaults

| Service | Host port | Notes |
|---|---:|---|
| PostgreSQL | 5432 | Database: `wordle_royale_local`; user: `wordle`; password: `wordle_local_password` for local Docker only. |
| Redis | 6379 | Used by future BullMQ, Socket.IO adapter, locks, presence, and cache. |

## Docker Compose unavailable fallback

If `docker compose version` fails, local service startup cannot be verified on that machine. Continue with source-only checks:

```bash
pnpm smoke:local
pnpm build
pnpm secret-scan
```

Then rerun `pnpm deps:verify` on a machine with Docker Compose v2 installed before relying on PostgreSQL/Redis-backed local integration.

## Safety rules

- Do not commit local `.env` files.
- Do not use production secrets locally.
- Do not point local scripts at staging/production DBs or Redis.
- Do not add cloud resources from local-dev scripts.
- Treat `pnpm deps:reset` as destructive for local Docker volumes only.
