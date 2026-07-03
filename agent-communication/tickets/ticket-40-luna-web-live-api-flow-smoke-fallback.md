# Ticket 40 — Web Live API Flow Smoke and Fallback Refinement

**Assigned agent:** Luna
**Priority:** P1
**Type:** Frontend implementation / verification
**Response file:** `agent-communication/responses/ticket-40-luna-web-live-api-flow-smoke-fallback-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-32-37.md`

## Objective

Verify and refine the web app against the live local API/DB path while preserving fixture fallback behavior.

## Product context

The product target is a chess.com/lichess-like competitive Wordle experience. The web app should make ranked/lobby readiness clear and trustworthy, not hide backend/runtime problems.

## Dependency note

Prefer sending after Ticket 39 has live endpoint results. If live API/DB remains blocked, run fallback-only browser smoke and document the dependency blocker.

## Scope

1. Start/use the local API and web app.
2. Verify the web status card for health/readiness.
3. Verify lobby list uses live API data when available.
4. Verify fallback UI still renders when `/lobbies` fails or DB is unavailable.
5. Add tiny UI/client refinements only if needed for clear local status.
6. Capture browser-console and screenshot/visual notes if available.

## Acceptance criteria

- `pnpm --filter @wordle-royale/web build` passes.
- Root `pnpm build` passes.
- Browser smoke evidence includes API-connected and/or fallback states.
- No paid services, secrets, or real auth added.
- Do not push.

## Required response format

Create `agent-communication/responses/ticket-40-luna-web-live-api-flow-smoke-fallback-response.md` with: Summary, Decisions / Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests / Commands Run, Evidence / Result, Risks / Blockers.

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Free/open-source/local-first only unless approved.
- Preserve passing checks and do not push.
