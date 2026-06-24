# Ticket 28 — Next.js Web App Shell with Design Tokens and Fixture Screens

**Assigned agent:** Luna  
**Priority:** P0  
**Type:** Implementation  
**Response file:** `agent-communication/responses/ticket-28-luna-nextjs-web-shell-design-token-screens-response.md`  
**Latest context:** `docs/2026-06-23-athena-review-after-tickets-18-24.md`

## Objective

Replace the `apps/web` placeholder with a minimal Next.js web app shell demonstrating main Wordle Royale UX using existing tokens and fixtures.

## Scope

Implement compileable web routes/screens for:

1. Landing/home.
2. Lobby browser / quick join mock state.
3. Lobby waiting room mock state.
4. Gameplay board mock state using fixtures.
5. Match report mock state.
6. Basic profile/leaderboard mock state if feasible.

Use `packages/design-tokens` and `packages/fixtures`, not random hardcoded data.

## Expected files / areas

Likely files:

- `apps/web/package.json`
- `apps/web/next.config.*`
- `apps/web/src/app/*` or `apps/web/pages/*`
- `apps/web/src/components/*`
- `apps/web/src/styles/*`

## Acceptance criteria

- Uses free/open-source dependencies only.
- App builds locally with no paid/cloud services.
- Uses `@wordle-royale/design-tokens` for core theme/tile states.
- Uses `@wordle-royale/fixtures` for mock gameplay/lobby/report data.
- Shows color + non-color tile feedback indicators where feasible.
- Includes loading/error/reconnect visual states or reusable components.
- Does not implement authoritative gameplay logic client-side.
- `pnpm --filter @wordle-royale/web build` passes.
- Root `pnpm build` passes.

## Out of scope

- Real backend integration.
- Real auth.
- Full pixel-perfect production UI.
- Mobile app work.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-28-luna-nextjs-web-shell-design-token-screens-response.md`

Use this structure:

```markdown
# Next.js Web App Shell with Design Tokens and Fixture Screens — Response

## Summary

## Decisions / Recommendations

## Detailed Output

## Open Questions

## Follow-up Tickets

## Files Changed
If no files changed, write: None.

## Tests / Commands Run
If none, write: None — planning/spec task only.

## Evidence / Result

## Risks / Blockers
```

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Prioritize open-source/free/local-first tools.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets. Do not create real `.env` files. Use `.env.example` / `.env.local.example` placeholders only.
- Preserve existing passing checks. If a check fails, include exact command/output and either fix it or explain the blocker.
- Do not push to GitHub unless explicitly asked by Athena/Ashar.
