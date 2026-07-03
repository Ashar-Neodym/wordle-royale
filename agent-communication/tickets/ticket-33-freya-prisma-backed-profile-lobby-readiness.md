# Ticket 33 — Prisma-backed Profile/Lobby Services and Readiness Checks

**Assigned agent:** Freya
**Priority:** P0
**Type:** Implementation
**Response file:** `agent-communication/responses/ticket-33-freya-prisma-backed-profile-lobby-readiness-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-25-31.md`

## Objective

Move the NestJS API from static auth/profile/lobby stubs toward local persistence-backed services while keeping the scope safe and local-only.

## Dependency note

Prefer sending this after Ticket 32 is complete or mostly complete, so Freya can use Elisa’s envelope/contract decision. If Ticket 32 is not done yet, proceed only with API-local envelopes and document the assumption.

## Scope

Implement a local-safe backend integration step:

1. Add a Prisma service/module or equivalent local Prisma client wiring.
2. Add profile/lobby service layers that use the Ticket 26 schema where feasible.
3. Replace static lobby create/join/list behavior with local persistence-backed behavior where feasible.
4. Preserve auth as a stub; do not implement real OAuth/password/JWT production auth.
5. Replace `/readyz` `not_checked_stub` values with actual dependency checks when local configuration is available.
6. Include healthy and unhealthy readiness tests using mocks or local-safe test doubles if live Docker is unavailable.
7. Preserve response-envelope and Zod validation behavior from Ticket 27.

## Expected files / areas

Likely files:

- `apps/api/src/app.module.ts`
- `apps/api/src/health/*`
- `apps/api/src/lobby/*`
- `apps/api/src/auth/*` / profile stubs if needed
- `apps/api/src/shared/*`
- `apps/api/prisma/*`
- `apps/api/test/*`
- `apps/api/package.json`

## Acceptance criteria

- `pnpm --filter @wordle-royale/api test` passes.
- `pnpm --filter @wordle-royale/api build` passes.
- `pnpm --filter @wordle-royale/api db:validate` passes.
- Root `pnpm build` passes.
- Health/readiness behavior is documented with exact curl/test evidence.
- No production auth secrets or real external auth provider added.
- If live DB/Redis is unavailable, use mocks/test doubles and clearly mark live integration as blocked/pending Yuna Docker verification.

## Out of scope

- Production auth.
- Real matchmaking queues.
- Full gameplay persistence.
- Deployment.
- Paid services.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-33-freya-prisma-backed-profile-lobby-readiness-response.md`

Use this structure:

```markdown
# Prisma-backed Profile/Lobby Services and Readiness Checks — Response

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
