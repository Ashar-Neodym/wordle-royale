# Ticket 117 — Schema-Aware Readiness Check

Agent: Freya (backend implementation)
Wave: Q — Wave P QA follow-up and deploy hardening
Status: New

## Context

Read:

- `agent-communication/responses/ticket-114-yuna-hosted-preview-migration-readiness-hardening-response.md`
- `agent-communication/responses/ticket-115-jasmine-qa-review-wave-p-chess-style-ranked-foundation-response.md`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/prisma/schema.prisma`

Wave O showed `/readyz` could report DB ok while required application tables were missing. Ticket 114 recommended a backend follow-up.

## Task

Harden `/readyz` so it detects required app-schema/table availability, not just raw DB connectivity.

## Scope

- Add an app-schema readiness dependency/check using safe lightweight queries against required tables.
- Return unavailable/non-ok dependency details when DB is reachable but migrations/tables are missing.
- Preserve optional Redis behavior when `REDIS_REQUIRED=false`.
- Add tests for schema-ready and schema-missing/readiness-failure behavior.
- Avoid exposing secrets or DB URLs.

## Acceptance criteria

- `/readyz` still returns ok for migrated local/preview-shaped DB.
- Missing required app schema is represented as unavailable or clear migration-needed dependency status.
- API tests and prod-start smoke pass.
- No behavior regression for healthz.

## Verification commands

```bash
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm --filter @wordle-royale/api build
CI=true pnpm smoke:api:prod-start
CI=true pnpm secret-scan
git diff --check
```

## Output

Write response to:

`agent-communication/responses/ticket-117-freya-schema-aware-readyz-response.md`
