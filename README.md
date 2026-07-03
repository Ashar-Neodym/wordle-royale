# Wordle Royale

Wordle Royale is a pnpm monorepo for the first local build wave.

## Workspace layout

- `apps/api` — future NestJS backend/API/Socket.IO/worker code.
- `apps/web` — future Next.js web app.
- `apps/mobile` — future Expo React Native app.
- `packages/contracts` — shared TypeScript/Zod contracts, enums, API envelopes, event names.
- `packages/game-engine` — pure deterministic gameplay/scoring/rating logic.
- `packages/design-tokens` — Crown Grid Arena design token exports.
- `packages/fixtures` — shared safe test fixtures.
- `packages/word-tools` — dictionary fixture/import/validation tooling.
- `packages/rating-tools` — MMR simulation tooling.

## Current scaffold commands

```bash
pnpm install
pnpm typecheck
pnpm -r list --depth -1
```

`pnpm typecheck` currently runs a workspace validation script because the app/package implementations are placeholders. Future tickets should replace or extend package-level `typecheck` scripts with real TypeScript checks as code is added.

## Local development infrastructure

Local-only PostgreSQL 16 and Redis 7 are defined in `docker-compose.yml`.

```bash
pnpm deps:up       # start local Postgres/Redis
pnpm deps:check    # validate Docker Compose v2 and compose config
pnpm deps:verify   # start, health-check, readiness-check, and stop local dependencies
pnpm smoke:local   # validate local config and workspace scaffold
pnpm deps:down     # stop local services
```

For setup details, see `docs/local-development.md`.

## CI

Initial PR-check skeleton lives at `.github/workflows/pr-checks.yml`. It uses existing pnpm scaffold scripts and does not require secrets.

See `docs/ci.md` for current behavior and future expansion notes.

## Safety notes

- No production infrastructure, secrets, or paid resources are created by this scaffold.
- Do not commit production third-party word-list sources until licensing is approved.
- Do not commit `.env` or `.env.local`; use `.env.example` and `.env.local.example` as placeholders only.

## Tooling/cost policy

Prioritize open-source, free, and local-first tooling by default. Do not add paid SaaS, managed cloud resources, proprietary datasets, or subscription dependencies without explicit approval from Ashar.

If a subscription or paid service seems necessary, document:

1. why it is needed,
2. the free/open-source alternative,
3. expected monthly cost range,
4. whether it is needed now or only later.
