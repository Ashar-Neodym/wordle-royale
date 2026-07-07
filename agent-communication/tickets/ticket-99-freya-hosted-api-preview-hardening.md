# Ticket 99 — Hosted API Preview Hardening

Agent: Freya (backend/API)
Wave: N — Controlled public preview setup
Status: New

## Context

Wave M is merged to `main`; post-merge `main` CI passed.

Current API has:
- production build/start path;
- local prod-start smoke;
- explicit preview demo sessions;
- `/readyz` and `/healthz`;
- local Docker PostgreSQL/Redis validation.

## Task

Harden the API for a future hosted preview deployment without deploying or using provider secrets.

## Scope

Inspect and improve only if needed:
- env validation for preview/prod-like mode;
- CORS/cookie/security defaults for hosted web/API split;
- clear failure messages for missing `DATABASE_URL`, `REDIS_URL`, cookie/session config;
- migration/start command documentation if code-adjacent;
- tests around preview demo session behavior and hosted-mode restrictions;
- readiness behavior remains useful for provider health checks.

## Constraints

- Do not deploy.
- Do not add real secrets or `.env` files.
- Do not add full durable account auth.
- Do not add paid/proprietary dependencies.
- Keep preview-demo semantics explicit and honest.

## Acceptance criteria

- Hosted preview configuration risks are reduced or documented.
- API tests pass.
- `pnpm smoke:api:prod-start` still passes.
- No silent fixture impersonation is possible in preview/prod-like modes.
- Response explains any remaining deployment blockers.

## Response file

Write your response to:

`agent-communication/responses/ticket-99-freya-hosted-api-preview-hardening-response.md`
