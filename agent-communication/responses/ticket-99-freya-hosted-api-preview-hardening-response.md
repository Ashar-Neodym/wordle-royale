# Ticket 99 — Hosted API Preview Hardening Response

Task: Ticket 99 — Hosted API Preview Hardening
Agent: Freya (frontend/API)
Status: Complete

## Summary

Hardened the hosted-preview API startup/runtime shape without deploying, creating provider resources, adding secrets, or changing durable-auth scope.

Implemented:

- central API runtime config validation for preview/prod-like startup;
- required hosted-preview guardrails for DB URL, hosted web origin, CORS origins, disabled dev auth/routes, `AUTH_MODE=preview_demo_session`, and secure cookies;
- split-host CORS allow-listing with credentials enabled only for configured origins;
- optional Redis readiness for first hosted preview via `REDIS_REQUIRED=false`, so `/readyz` can stay provider-friendly without forcing a managed Redis dependency when Redis is not product-critical;
- additional API tests for hosted config rejection, optional Redis readiness, and secure preview demo cookies;
- env template/runbook updates documenting `REDIS_REQUIRED` and Redis optionality.

## Decisions / Recommendations

- **Hosted preview must use explicit demo sessions:** `APP_ENV=preview`, `NODE_ENV=production`, `AUTH_MODE=preview_demo_session`, `ENABLE_DEV_AUTH=false`, `ENABLE_DEV_ROUTES=false`.
- **Hosted preview must configure web/API split origins:** `PUBLIC_WEB_URL` and `CORS_ALLOWED_ORIGINS` are required in preview/prod-like mode; wildcard and insecure `http://` CORS origins are rejected there.
- **Cookies must be secure in preview/prod-like mode:** `COOKIE_SECURE=true` is required at startup.
- **Redis should stay optional for first hosted preview unless intentionally provisioned:** use `REDIS_REQUIRED=false` and leave `REDIS_URL` unset if no Redis-backed product behavior is needed. If Redis is provisioned and should gate health, set both `REDIS_URL` and `REDIS_REQUIRED=true`.
- **Database remains required:** `DATABASE_URL` is required for preview/prod-like startup and should point only to the isolated preview DB.

## Detailed Output

### Runtime config validation

Added `apps/api/src/config/runtime-config.ts` with:

- `validateRuntimeConfig(config)` for Nest `ConfigModule` validation;
- `allowedCorsOrigins()` for API CORS setup;
- shared env flag/CSV parsing helpers.

In preview/prod-like mode validation now fails fast with clear messages when:

- `DATABASE_URL` is missing;
- `PUBLIC_WEB_URL` is missing;
- `CORS_ALLOWED_ORIGINS` is missing;
- `CORS_ALLOWED_ORIGINS` uses `*` or insecure `http://`;
- `APP_ENV=preview` is not paired with `AUTH_MODE=preview_demo_session`;
- `ENABLE_DEV_AUTH` or `ENABLE_DEV_ROUTES` is enabled;
- `COOKIE_SECURE` is not true.

### CORS hardening

`apps/api/src/main.ts` now enables CORS only when configured origins are present:

- allows requests with no `Origin` header for health checks/curl/server-to-server requests;
- allows only configured origins for browser requests;
- enables credentials for preview demo session cookies.

### Readiness / Redis optionality

`RedisReadinessService` now treats missing Redis as `not_checked_stub` when Redis is not required.

`ReadinessService` does not let `not_checked_stub` dependencies degrade overall readiness. With DB OK and optional Redis skipped, `/readyz` remains overall `ok`; if Redis is configured/required and unavailable, readiness still reports an unavailable dependency.

### Tests added

`apps/api/test/api-skeleton.test.ts` now covers:

- optional Redis readiness stays overall OK;
- unsafe hosted preview config is rejected before startup;
- valid hosted preview config defaults Redis to optional;
- hosted preview demo cookie includes `Secure`, `HttpOnly`, and `SameSite=Lax`.

### Docs/templates updated

- `.env.example`
- `.env.local.example`
- `docs/2026-07-06-preview-infrastructure-env-runbook.md`

These now document `REDIS_REQUIRED` and the recommended hosted-preview Redis posture.

## Open Questions

None blocking Ticket 99.

Remaining deployment-time questions:

- Which provider will host API/web/Postgres after Ashar approves provisioning?
- Whether Ashar wants to provision Redis at all for preview, or keep `REDIS_REQUIRED=false` for the first controlled public preview.
- Exact hosted web/API URLs for `PUBLIC_WEB_URL`, `API_BASE_URL`, and `CORS_ALLOWED_ORIGINS`.

## Follow-up Tickets

Existing Wave N follow-ups still apply:

- Ticket 100: user-facing preview copy/mobile caveat.
- Ticket 101: checkpoint PR/CI monitor.
- Ticket 102: QA review before asking Ashar to provision/deploy.

No new follow-up ticket is required from this work.

## Files Changed

Ticket 99 files changed:

- `.env.example`
- `.env.local.example`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/runtime-config.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/health/redis-readiness.service.ts`
- `apps/api/src/main.ts`
- `apps/api/test/api-skeleton.test.ts`
- `docs/2026-07-06-preview-infrastructure-env-runbook.md`
- `agent-communication/responses/ticket-99-freya-hosted-api-preview-hardening-response.md`

Repository note: the working tree already had unrelated Wave N docs/tickets and web changes before/during this task; I did not edit those unrelated web files for Ticket 99.

## Tests / Commands Run

```text
pnpm --filter @wordle-royale/api test
```

Result: exit `0`; 44/44 tests passed.

```text
pnpm --filter @wordle-royale/api build
```

Result: exit `0`.

```text
pnpm smoke:api:prod-start
```

Result: exit `0`; local Docker Postgres/Redis started, API production build/start completed, and `/readyz` returned status `ok`.

```text
pnpm build
```

Result: exit `0`.

```text
pnpm secret-scan
```

Result: exit `0`; secret scan passed.

```text
git diff --check
```

Result: exit `0`.

```text
pnpm deps:down
```

Result: exit `0`; local Docker services stopped/removed after smoke.

## Evidence / Result

Acceptance criteria status:

- Hosted preview configuration risks are reduced or documented: **PASS**.
- API tests pass: **PASS** (`44/44`).
- `pnpm smoke:api:prod-start` still passes: **PASS**.
- No silent fixture impersonation is possible in preview/prod-like modes: **PASS**; preview config rejects dev auth/routes, preview mode requires `preview_demo_session`, and existing tests still verify current-user dev fixture headers are rejected in preview flows.
- Response explains remaining deployment blockers: **PASS**.

## Risks / Blockers

- No actual provider behavior was tested because Ticket 99 explicitly forbids deployment/provider secrets/resources.
- Redis is now optional for readiness when `REDIS_REQUIRED=false`; if future features depend on Redis at runtime, the operator must provision Redis and set `REDIS_REQUIRED=true`.
- In-memory preview demo sessions still reset on API restart/redeploy and are not durable account auth.
- CORS validation requires HTTPS origins in preview/prod-like mode; localhost/dev remains supported outside preview/prod-like mode.
- Actual `PUBLIC_WEB_URL`, `CORS_ALLOWED_ORIGINS`, and provider database URLs must be filled in provider env only after Ashar approves provisioning/deployment.
