# Ticket 27 — NestJS API Skeleton with Health, Auth Stub, and Lobby Stub

**Assigned agent:** Freya  
**Priority:** P0  
**Type:** Implementation  
**Response file:** `agent-communication/responses/ticket-27-freya-nestjs-api-skeleton-health-auth-lobby-response.md`  
**Latest context:** `docs/2026-06-23-athena-review-after-tickets-18-24.md`

## Objective

Replace the `apps/api` placeholder with a minimal NestJS backend skeleton that compiles and exposes local foundational routes.

## Scope

Implement:

1. NestJS app bootstrap.
2. Health/readiness endpoints: `GET /healthz`, `GET /readyz`.
3. Basic config module using env placeholders only.
4. Minimal auth/profile stub endpoints using shared contracts if available.
5. Minimal lobby stub endpoints using shared contracts if available: create lobby, join lobby, list public lobbies.
6. Global validation/error envelope pattern.
7. Local tests for health/readiness and at least one validation failure.

Dependency note: use Ticket 25 contracts and Ticket 26 schema if available. If not, use temporary local DTOs and clearly mark reconciliation work.

## Expected files / areas

Likely files:

- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/health/*`
- `apps/api/src/auth/*` or `apps/api/src/profile/*`
- `apps/api/src/lobby/*`
- `apps/api/test/*` or `apps/api/src/**/*.test.ts`
- `apps/api/package.json`

## Acceptance criteria

- Uses free/open-source dependencies only.
- Does not add paid SDKs.
- Does not implement real auth secrets/OAuth yet.
- Health/readiness endpoints work locally.
- Validation rejects malformed bodies with consistent error envelope.
- Uses `@wordle-royale/contracts` where possible.
- Adds package scripts for build/test/dev.
- `pnpm --filter @wordle-royale/api build` passes.
- `pnpm --filter @wordle-royale/api test` passes.
- Root `pnpm build` passes.

## Out of scope

- WebSocket gameplay server.
- Real auth provider integration.
- Production deployment.
- Full database-backed lobby persistence unless already safe and scoped.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-27-freya-nestjs-api-skeleton-health-auth-lobby-response.md`

Use this structure:

```markdown
# NestJS API Skeleton with Health, Auth Stub, and Lobby Stub — Response

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
