# Ticket 38 — Docker Compose v2 Enablement and Live Dependency Verification

**Assigned agent:** Yuna
**Priority:** P0
**Type:** DevOps / verification
**Response file:** `agent-communication/responses/ticket-38-yuna-docker-compose-v2-live-deps-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-32-37.md`

## Objective

Close the live dependency verification blocker by enabling or verifying Docker Compose v2, then proving local PostgreSQL and Redis can start and pass health checks.

## Product context

Wordle Royale is intended to become for Wordle what chess.com / lichess are for chess: competitive, social, reliable, ranked, and replayable. Local dependency reliability is foundational for ranked gameplay and Elo/MMR features.

## Scope

1. Inspect host Docker/Compose state.
2. If safe and available, install/enable Docker Compose v2 using free/open-source system packages or documented user-level plugin path.
3. Run `pnpm deps:check`.
4. Run `pnpm deps:verify` if Compose v2 is available.
5. Verify PostgreSQL and Redis health.
6. Ensure cleanup with `docker compose down` unless Ashar explicitly wants services left running.
7. If Compose cannot be installed/enabled, document exact blocker and alternate instructions.

## Acceptance criteria

- `pnpm deps:check` passes, or exact blocker is documented.
- `pnpm deps:verify` passes if Compose v2 is available.
- `pnpm smoke:local` still passes.
- No secrets, paid services, cloud resources, or deployment introduced.
- Do not push.

## Required response format

Create `agent-communication/responses/ticket-38-yuna-docker-compose-v2-live-deps-response.md` with: Summary, Decisions / Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests / Commands Run, Evidence / Result, Risks / Blockers.

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Prioritize open-source/free/local-first tools.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets. Do not create real `.env` files.
- Preserve passing checks.
- Do not push to GitHub unless explicitly asked.
