# Ticket 35 — Docker Compose Verification and Local Dev Orchestration

**Assigned agent:** Yuna
**Priority:** P0
**Type:** DevOps / verification / implementation
**Response file:** `agent-communication/responses/ticket-35-yuna-docker-compose-local-dev-orchestration-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-25-31.md`

## Objective

Close the Wave D ops caveat by verifying or improving local Docker Compose orchestration for PostgreSQL and Redis.

## Scope

1. Verify whether Docker Compose v2 is available in the working environment.
2. If available, run local PostgreSQL 16 and Redis 7 via `docker compose`.
3. Validate service health checks and document exact commands/output.
4. Validate or improve `.env.example` / `.env.local.example` placeholders for API/web/mobile local development.
5. Add or refine scripts/docs for local dependency startup if needed.
6. If Docker Compose v2 is unavailable, provide a concrete alternate verification plan and mark what remains blocked.
7. Do not provision cloud resources or paid services.

## Expected files / areas

Likely files:

- `docker-compose.yml`
- `.env.example`
- `.env.local.example`
- `scripts/local-smoke.mjs`
- `docs/ci.md`
- `README.md` or app README files

## Acceptance criteria

- `pnpm smoke:local` passes.
- If Docker Compose v2 is available:
  - `docker compose config` passes.
  - PostgreSQL and Redis start successfully.
  - Health checks or equivalent readiness commands pass.
  - Services are stopped/cleaned up after verification unless explicitly left running by the user.
- If Docker Compose v2 is unavailable, response clearly states the blocker and exact command output.
- Root `pnpm build` and `pnpm secret-scan` still pass after any changes.
- No secrets or paid services added.

## Out of scope

- Deployment.
- Managed databases/Redis.
- Production observability.
- Destructive data reset unless explicitly scoped and documented.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-35-yuna-docker-compose-local-dev-orchestration-response.md`

Use this structure:

```markdown
# Docker Compose Verification and Local Dev Orchestration — Response

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
