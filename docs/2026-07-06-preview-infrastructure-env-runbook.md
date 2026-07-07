# Preview Infrastructure and Environment Runbook — Wave N

Date: 2026-07-06
Owner: Yuna
Ticket: 98 — Preview Infrastructure and Environment Runbook
Status: plan-only runbook; no provisioning/deployment performed

## Purpose

This runbook describes how an operator should later provision and validate the first controlled Wordle Royale public preview after Ashar explicitly approves resource creation and deployment.

This is not a production launch. It is a controlled public preview for hosted web + hosted API behavior, explicit preview demo sessions, isolated preview data, and rollback/reset rehearsal.

## Hard safety boundaries

Do not proceed past this runbook until Ashar explicitly approves provisioning/deployment.

During Ticket 98, I did **not**:

- deploy anything;
- create cloud resources;
- log in to provider CLIs;
- create or rotate secrets;
- create real `.env` files;
- add paid services;
- claim public mobile preview readiness.

## Scope decision baseline

Use Ticket 97's locked Wave N decision:

- First preview is **web + hosted API**, not production and not public mobile.
- Auth remains **explicit preview demo sessions only**.
- Demo sessions are not durable accounts.
- Preview sessions and preview gameplay data may reset.
- Mobile remains Expo Go/manual smoke only until physical-device verification is closed.
- Recommended shape is separate web host + Node API host + managed preview Postgres.
- Redis should be minimized or justified; if readiness remains Redis-hard-required, use a free/cheap Redis-compatible preview dependency or have Ticket 99 make Redis optional when runtime does not require it.

## Recommended provider/project layout

Default planning route, subject to Ashar approval and current free-tier availability check at provisioning time:

| Component | Recommended route | Required? | Notes |
|---|---:|---:|---|
| Web app | Vercel-style free Next.js project | Yes | Build `apps/web`, set public API env vars, easy rollback by redeploying an older commit. |
| API app | Render/Fly/Railway-style Node web service | Yes | Must support long-running Node process, `pnpm --filter @wordle-royale/api start`, env vars, health checks, and logs. |
| Postgres | Neon/Supabase/Render Postgres preview DB | Yes | Isolated preview DB only. No production/user-critical data. Must support Prisma migrations. |
| Redis | Upstash/Redis-compatible free tier or optionalized by Ticket 99 | Maybe | Current `/readyz` and local smoke include Redis. Avoid paid Redis unless Ashar approves or Freya confirms it is required. |
| Mobile | Expo Go manual smoke | No public deploy | Do not claim public mobile preview until phone visual smoke is complete. |

Recommended repository/project naming:

```text
wordle-royale-preview-web
wordle-royale-preview-api
wordle-royale-preview-postgres
wordle-royale-preview-redis   # only if required/approved
```

Recommended deployment branch:

```text
main
```

Use PR-based checkpoint branches for code review. Only deploy from reviewed/merged `main` unless Athena explicitly approves a temporary branch preview.

## Build and runtime commands

### Install

```bash
corepack enable
pnpm install --frozen-lockfile
```

### Web build

```bash
pnpm --filter @wordle-royale/web build
```

If the provider needs a project root, use:

```text
apps/web
```

If the provider runs from repo root, use:

```bash
pnpm install --frozen-lockfile
pnpm --filter @wordle-royale/web build
```

### API build

From repo root:

```bash
pnpm --filter @wordle-royale/api db:generate
pnpm --filter @wordle-royale/api build
```

### API start

From repo root:

```bash
pnpm --filter @wordle-royale/api start
```

Equivalent underlying command from `apps/api` after build:

```bash
node dist/apps/api/src/main.js
```

### Database migration

Only run after Ashar approves the preview DB and the operator has confirmed `DATABASE_DIRECT_URL` targets the isolated preview DB.

```bash
pnpm --filter @wordle-royale/api db:validate
pnpm --filter @wordle-royale/api db:generate
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Optional preview seed/reset commands require Athena/Freya confirmation before hosted use. Local scripts exist, but do not assume production-safe reset behavior for hosted preview until Ticket 99 confirms it.

## Environment map

Classification legend:

- `public`: safe for client exposure or non-sensitive operational metadata.
- `secret`: credential/token/connection string; store only in provider secret/env settings.
- `internal`: not inherently secret but should not be exposed to browsers unless prefixed/public by design.
- `optional`: leave blank unless provider/integration is explicitly enabled.

### API environment variables

| Name | Preview value shape | Class | Required | Notes |
|---|---|---:|---:|---|
| `APP_ENV` | `preview` | internal | Yes | Distinguishes hosted preview from local/prod. |
| `NODE_ENV` | `production` | internal | Yes | Required for production-start path. |
| `PORT` | provider-provided or e.g. `4000` | internal | Yes | Many providers inject this; do not hard-code if provider supplies it. |
| `LOG_LEVEL` | `info` | internal | No | Avoid debug logs in public preview. |
| `PUBLIC_WEB_URL` | `https://<preview-web-host>` | public | Yes | Canonical web origin. |
| `API_BASE_URL` | `https://<preview-api-host>/api/v1` | public-ish/internal | Yes | API base URL for server-side integrations. |
| `WS_BASE_URL` | `https://<preview-api-host>` | public-ish/internal | Maybe | Required only if WebSocket path is active. |
| `CORS_ALLOWED_ORIGINS` | `https://<preview-web-host>` | internal | Yes | Include only approved web origins, comma-separated if needed. |
| `DATABASE_URL` | managed Postgres pooled URL | secret | Yes | Runtime DB connection. Must point to preview DB only. |
| `DATABASE_DIRECT_URL` | direct Postgres URL | secret | Yes for migrations | Some providers require direct URL for Prisma migrations. |
| `REDIS_URL` | Redis-compatible URL | secret | Maybe | Optional for first hosted preview when `REDIS_REQUIRED=false`; required only if Redis-backed features are enabled or the operator chooses Redis health as a hard dependency. |
| `REDIS_REQUIRED` | `false` unless Redis is provisioned intentionally | internal | Yes | Keeps `/readyz` provider-friendly without creating a paid Redis dependency by accident. Set `true` only when `REDIS_URL` is configured and Redis should block readiness. |
| `REDIS_KEY_PREFIX` | `wr:preview` | internal | Maybe | Use a preview-specific prefix if Redis is configured. |
| `AUTH_MODE` | `preview_demo_session` | internal | Yes | Do not use `dev_stub` in hosted preview. |
| `PREVIEW_DEMO_SESSION_TTL_SECONDS` | `7200` or lower | internal | Yes | Demo sessions are short-lived and non-durable. |
| `ENABLE_DEV_AUTH` | `false` | internal | Yes | Must be false in preview. |
| `ENABLE_DEV_ROUTES` | `false` | internal | Yes | Must be false in preview. |
| `COOKIE_DOMAIN` | blank or provider-approved domain | internal | Maybe | For split hosts, leaving blank may be correct; Ticket 99 should verify cookie behavior. |
| `COOKIE_SECURE` | `true` | internal | Yes | Required for HTTPS preview cookies. |
| `JWT_ACCESS_SECRET` | random high-entropy string | secret | Maybe/current placeholder | Required if code path still validates it; generate/store in provider only. |
| `REFRESH_TOKEN_PEPPER` | random high-entropy string | secret | Maybe/current placeholder | Keep provider-only even if real auth is deferred. |
| `PASSWORD_HASH_PEPPER` | random high-entropy string | secret | Maybe/current placeholder | Keep provider-only; no password auth in preview. |
| `CSRF_SECRET` | random high-entropy string | secret | Maybe/current placeholder | Keep provider-only if CSRF path is active. |
| `SENTRY_DSN` | blank unless approved | secret/optional | No | Do not enable paid observability without approval. |
| `SENTRY_ENVIRONMENT` | `preview` | internal/optional | No | Only if Sentry approved. |
| `SENTRY_RELEASE` | commit SHA | internal/optional | No | Only if Sentry approved. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | blank unless approved | secret/optional | No | Do not add external telemetry without approval. |

### Web environment variables

| Name | Preview value shape | Class | Required | Notes |
|---|---|---:|---:|---|
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_API_BASE_URL` | `https://<preview-api-host>/api/v1` | public | Yes | Use whichever name the web app reads after Ticket 99/100 verification. Current templates use `EXPO_PUBLIC_API_BASE_URL`; web code should be verified before provisioning. |
| `NEXT_PUBLIC_WS_URL` / `NEXT_PUBLIC_WS_BASE_URL` | `https://<preview-api-host>` | public | Maybe | Only if active web socket features need it. |
| `NEXT_PUBLIC_APP_ENV` | `preview` | public | Recommended | Enables honest preview copy if web reads it. |
| `PUBLIC_WEB_URL` | `https://<preview-web-host>` | public/internal | Recommended | Useful for server actions and canonical URLs if read by web. |

Ticket 99/100 should verify exact web variable names before provisioning. If the web currently uses `API_BASE_URL` server-side rather than `NEXT_PUBLIC_*`, set both only if the code actually reads both; do not create unused provider secrets.

### Mobile/Expo variables

These are for manual Expo Go smoke only, not public mobile deployment:

| Name | Preview value shape | Class | Required | Notes |
|---|---|---:|---:|---|
| `EXPO_PUBLIC_APP_ENV` | `preview` | public | For manual smoke | Public config. |
| `EXPO_PUBLIC_API_BASE_URL` | `https://<preview-api-host>/api/v1` | public | For manual smoke | Points Expo Go to preview API if Ashar tests phone. |
| `EXPO_PUBLIC_WS_BASE_URL` | `https://<preview-api-host>` | public | Maybe | Only if mobile socket flow is active. |
| `EXPO_TOKEN` | provider token | secret | No | Do not set unless EAS is explicitly approved; out of scope now. |

## Provider setup checklist after approval

Only after Ashar says to provision/deploy:

1. Confirm selected providers and free-tier/cost posture.
2. Create isolated preview Postgres.
3. If needed, create preview Redis or confirm Ticket 99 made Redis optional for hosted preview.
4. Create API service pointing at this repo and `main`.
5. Configure API env vars in provider secret/env UI.
6. Run API build command.
7. Run DB validate/generate/migrate commands against preview DB.
8. Start API service.
9. Confirm API logs show production start and no dev auth routes enabled.
10. Create web project pointing at this repo and `main`.
11. Configure web public env vars.
12. Deploy web.
13. Run smoke validation below.
14. Record deploy URLs, provider project IDs, and rollback handles in an ops note without secret values.

## Health and smoke validation

Use the actual hosted URLs after deployment.

### API health

```bash
curl -fsS https://<preview-api-host>/healthz
curl -fsS https://<preview-api-host>/readyz
```

Expected:

- HTTP 200;
- service identifies as Wordle Royale API;
- readiness reports DB OK;
- Redis status is `ok` only if Redis remains required/configured; with `REDIS_REQUIRED=false` and no `REDIS_URL`, Redis reports `not_checked_stub` and does not block overall readiness.

### Preview demo-session smoke

Use a throwaway cookie jar:

```bash
API="https://<preview-api-host>"
WEB="https://<preview-web-host>"
COOKIE_JAR="$(mktemp)"

curl -fsS -i \
  -c "$COOKIE_JAR" \
  -H "Origin: $WEB" \
  -H "Content-Type: application/json" \
  -X POST "$API/auth/preview-demo/start"

curl -fsS \
  -b "$COOKIE_JAR" \
  -H "Origin: $WEB" \
  "$API/auth/me"

rm -f "$COOKIE_JAR"
```

Expected:

- demo-session start succeeds;
- session cookie is HttpOnly/Secure on HTTPS;
- `auth/me` returns a preview demo user/session;
- no email/password/OAuth credential flow appears.

### Web smoke

```bash
curl -fsS https://<preview-web-host>/ >/tmp/wordle-royale-preview-home.html
```

Manual browser checks:

- preview banner/caveat visible;
- no durable account promise;
- start-preview-demo CTA visible where relevant;
- public leaderboard/lobbies/profile/result surfaces load;
- mobile public-preview claim is not made.

### Post-deploy CI parity

After deployment, still require GitHub Actions passing on the reviewed commit:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @wordle-royale/api test
pnpm build
pnpm smoke:api:prod-start
pnpm smoke:local
pnpm deps:check
pnpm secret-scan
git diff --check
pnpm deps:down
```

## Rollback plan

### Web rollback

1. Redeploy previous known-good commit or use provider rollback UI.
2. Verify web points to the intended API URL.
3. Run home/leaderboard/lobbies/profile browser smoke.
4. If preview copy or API host is wrong, disable the web deployment or put up a clear maintenance notice if provider supports it.

### API rollback

1. Redeploy previous known-good commit on API provider.
2. Do not run destructive migrations during rollback unless Athena/Ashar explicitly approve.
3. Confirm `/healthz` and `/readyz`.
4. Run preview demo-session smoke with a fresh cookie jar.
5. If rollback fails, disable public web links/CTA until API is healthy.

### Database rollback/reset

Preview data is disposable, but destructive reset still requires explicit approval because it affects testers.

Safe default:

1. Prefer restore/recreate isolated preview DB from provider snapshot or migration baseline.
2. Re-run `db:migrate:deploy` against the preview DB.
3. Seed only approved preview-safe fixture data.
4. Announce that preview ratings/lobbies/history were reset.

Do **not** reset any database unless the connection string is confirmed to be the isolated preview DB.

### Redis/session reset

Preview demo sessions are intentionally non-durable/in-memory in the current design and may reset on API restart/redeploy. If Redis is added for preview dependency checks, do not treat Redis as the durable session source unless Freya changes the implementation and documents it.

If abuse or leakage is suspected:

1. Disable web demo-start CTA or take web preview offline.
2. Restart/redeploy API to clear in-memory demo sessions.
3. If Redis stores any preview state, flush only preview-prefixed keys, e.g. `wr:preview:*`, after approval.
4. Rotate preview-only secrets if cookie/session integrity may be affected.

## Data and privacy policy for preview

- Do not collect real passwords, OAuth tokens, or email credentials.
- Do not promise durable accounts or durable ratings.
- Do not import production/private data.
- Public sharing must remain spoiler-safe: no active answer words, salts, hashes, or hidden guesses.
- Keep provider logs free of raw session tokens and secret values.

## Cost/free-tier notes

Before provisioning, verify current pricing because free tiers change.

- Web: Vercel-style free tier is usually enough for a low-traffic preview; check bandwidth/build limits.
- API: Render/Fly/Railway-style services may sleep, cold-start, or require payment for always-on. This is acceptable only if preview copy says availability may be intermittent.
- Postgres: Neon/Supabase/Render free tiers may sleep, pause, limit storage/compute, or require account verification.
- Redis: Upstash/Redis-compatible free tiers may limit requests/storage. Avoid Redis unless current readiness/runtime truly requires it.
- Observability: keep provider-native logs first; do not add paid Sentry/OTel/analytics without Ashar approval.

## Approval checklist before provisioning/deployment

Athena should ask Ashar for explicit approval only when all are true:

1. Ticket 97 decision is accepted.
2. This Ticket 98 runbook is accepted.
3. Ticket 99 hosted API hardening is complete and verifies env/CORS/cookie/readiness behavior.
4. Ticket 100 copy/mobile caveat is complete.
5. Ticket 101 checkpoint PR exists and GitHub Actions pass on the reviewed head.
6. Ticket 102 QA approves controlled preview setup.
7. Provider choices are named.
8. Any non-free cost is called out and approved.
9. Full env var/resource list is ready with no secret values in repo/chat.
10. Rollback/reset owner and process are accepted.
11. Ashar explicitly says to provision/deploy.

## Open blockers / unknowns for Tickets 99–102

- Exact web runtime env names need final confirmation: `NEXT_PUBLIC_*` vs server-side names actually read by current Next.js code.
- Hosted API CORS/cookie behavior across split web/API domains needs Ticket 99 validation.
- Redis requirement should be reduced or justified before adding a managed Redis dependency.
- Preview DB reset/seed command must be confirmed safe for hosted preview before use.
- Mobile physical Expo Go visual smoke remains deferred unless Ashar completes phone observation.
- Provider free-tier constraints must be checked at provisioning time.
