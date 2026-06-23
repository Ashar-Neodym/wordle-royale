# Wordle Royale Local Development

This document covers local-only developer infrastructure for the first build wave.

## Prerequisites

- Node.js 20+
- pnpm 11+
- Docker with Docker Compose v2

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

The example files intentionally do not contain production secrets. After copying locally, replace placeholder values such as `***` and `<local-development-secret>` with local-only disposable values. Do not commit `.env` or `.env.local`.

## Commands

Install dependencies:

```bash
pnpm install
```

Start local PostgreSQL and Redis:

```bash
pnpm deps:up
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
| PostgreSQL | 5432 | Database: `wordle_royale_local`; user: `wordle`; password is local-only and documented in Compose. |
| Redis | 6379 | Used by future BullMQ, Socket.IO adapter, locks, presence, and cache. |

## Safety rules

- Do not commit local `.env` files.
- Do not use production secrets locally.
- Do not point local scripts at staging/production DBs or Redis.
- Do not add cloud resources from local-dev scripts.
- Treat `pnpm deps:reset` as destructive for local Docker volumes only.
