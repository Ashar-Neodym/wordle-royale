# Ticket 39 — Live Local DB Migration Seed and API Endpoint Smoke

**Assigned agent:** Freya
**Priority:** P0
**Type:** Backend verification / implementation
**Response file:** `agent-communication/responses/ticket-39-freya-live-db-migration-seed-api-smoke-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-32-37.md`

## Objective

After local PostgreSQL/Redis are available, prove the API works against live local dependencies instead of only mocks/doubles.

## Product context

The app direction is chess.com/lichess-for-Wordle: ranked play, Elo/MMR, reliable match history, and server-authoritative competitive gameplay. Live DB verification is required before real ranked flows.

## Dependency note

Prefer sending after Ticket 38 succeeds. If Docker/Compose remains blocked, provide a DB-blocked response with tests that still pass and exact commands to rerun once services exist.

## Scope

1. Generate Prisma client.
2. Apply migrations to local Postgres using local-only env values.
3. Run the safe fixture seed apply path.
4. Start the API.
5. Smoke test `/healthz`, `/readyz`, `/auth/me`, `/profile/me`, `/lobbies`, create lobby, and join lobby against the live local DB where feasible.
6. Confirm Redis readiness behavior if Redis is available.
7. Preserve stub/non-production auth boundary.

## Acceptance criteria

- `pnpm --filter @wordle-royale/api db:validate` passes.
- `pnpm --filter @wordle-royale/api db:generate` passes.
- `pnpm --filter @wordle-royale/api test` passes.
- `pnpm --filter @wordle-royale/api build` passes.
- If DB is available, migration/seed/API curl smoke evidence is included.
- If DB is unavailable, exact blocker and next command list are included.
- Do not push.

## Required response format

Create `agent-communication/responses/ticket-39-freya-live-db-migration-seed-api-smoke-response.md` with: Summary, Decisions / Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests / Commands Run, Evidence / Result, Risks / Blockers.

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Free/open-source/local-first only unless approved.
- No secrets, paid services, cloud resources, production auth, or push.
