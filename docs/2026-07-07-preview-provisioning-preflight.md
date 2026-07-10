# Preview Provisioning Preflight Checklist — Wave O

Date: 2026-07-07
Owner: Yuna
Ticket: 104 — Preview Provisioning Preflight Checklist
Status: revised preflight only; no provisioning/deployment/resources/secrets created

## Purpose

This checklist defines what Yuna should verify and then perform later **only after Ashar explicitly approves provider/resource/secret creation**. It is revised to match Athena's Wave O architecture direction and Ashar's clarification:

- Vercel free account first for the web app.
- Supabase Postgres first because Ashar already has Supabase/account context.
- Neon is fallback only, not first choice.
- Keep a separate long-running Node/Nest API server.
- Do not force the Nest API into Vercel serverless.
- Redis remains omitted initially with `REDIS_REQUIRED=false`.
- No provisioning, deployment, provider login, secret creation, or paid resources during this preflight.

## Provider decision carried from Ticket 103

| Component | Provider/resource direction | Project/resource name shape | Approval status |
|---|---|---|---|
| Web | **Vercel free account first** for Next.js web | `wordle-royale-preview-web` | Requires Ashar approval |
| API | **Separate long-running Node/Nest server**; exact host chosen by preflight from free/cheap candidates such as Render/Fly/Railway/equivalent | `wordle-royale-preview-api` | Requires Ashar approval |
| Database | **Supabase Postgres first** | `wordle-royale-preview-postgres` or Supabase project DB equivalent | Requires Ashar approval |
| Database fallback | **Neon Postgres fallback only** if Supabase fails preflight | `wordle-royale-preview-postgres` | Requires Ashar/Athena acknowledgement of fallback trigger |
| Redis | Omitted initially | none | Use `REDIS_REQUIRED=false`; provision Redis only after separate approval |
| Mobile | No public mobile deploy | none | Expo Go/manual verification only |

Reasoning:

- Wordle Royale's long-term shape needs server authority for ranked gameplay, lobbies, sessions, anti-cheat/spoiler-safe validation, and future realtime.
- The API should stay as a long-running Nest/Node service instead of being reshaped into Vercel serverless during Wave O.
- Vercel remains the correct web host and can later transfer/upgrade if the product warrants it.
- Supabase should be used as managed Postgres only for now; this is **not** approval to adopt Supabase Auth, Storage, Realtime, Edge Functions, or vendor-specific app logic.
- Current API routes are rooted at the API origin. Do **not** append `/api/v1` to provider API env values.
- Current web client reads `NEXT_PUBLIC_API_URL`.
- Current mobile client reads `EXPO_PUBLIC_API_URL`, but mobile public preview remains out of scope.
- Redis is optional for first hosted preview via `REDIS_REQUIRED=false`.

## Hard approval gate

Do not begin provisioning until Ashar explicitly approves all of the following:

1. Provider choices: Vercel web, Supabase Postgres first, selected long-running API host, Neon fallback policy, Redis omitted.
2. Any account signup/login steps.
3. Any free-tier limitations, sleep/cold-start behavior, project pause, connection caps, or required payment method.
4. Creation of provider projects/resources.
5. Creation and storage of preview secrets in provider dashboards.
6. Running Prisma migrations against the isolated preview DB.
7. Deployment from `main`.
8. Public preview URLs being shared with testers.

Recommended approval phrase from Ticket 103:

```text
I approve Wave O provisioning for Wordle Royale preview using Vercel web, Supabase Postgres first with Neon fallback only if Supabase is blocked, a separate long-running Node API host selected from the free/cheap option verified by Yuna, and no Redis initially (`REDIS_REQUIRED=false`). Use free/cheap settings only, store secrets only in provider env stores, and do not add paid plans/custom domains without asking me again.
```

## Non-negotiable safety rules

- Do not push directly to `main`; use merged PRs as the deployment source.
- Do not create real `.env` or `.env.local` files in the repo.
- Do not commit provider credentials, database URLs, tokens, or generated secrets.
- Do not deploy from unreviewed local changes.
- Do not use production/user-critical data.
- Do not enable password/OAuth auth for this preview.
- Do not claim public mobile preview readiness.
- Do not provision Redis unless explicitly approved; default to `REDIS_REQUIRED=false`.
- Do not turn on paid plans, custom domains, paid observability, paid auth, or paid email without separate approval.

## Pre-approval local verification

Run before asking Ashar to approve provisioning:

```bash
cd /home/ashar/Desktop/hermes-projects/wordle-royale

git checkout main
git pull --ff-only origin main

git status --short --branch

git status --ignored --short -- \
  .env .env.local \
  apps/api/dist apps/web/.next apps/web/tsconfig.tsbuildinfo apps/mobile/.expo \
  dist build .turbo coverage

CI=true pnpm install --frozen-lockfile
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm build
CI=true pnpm smoke:api:prod-start
CI=true pnpm smoke:local
CI=true pnpm deps:check
CI=true pnpm secret-scan
git diff --check
CI=true pnpm deps:down
```

Expected:

- clean tracked working tree except known uncommitted Wave O tickets/docs if still pre-checkpoint;
- no real `.env`/`.env.local` tracked or staged;
- generated artifacts appear only as ignored outputs;
- all commands exit `0`;
- secret scan passes;
- local Docker dependencies are stopped after smoke.

## Cost/free-tier verification checklist

Verify in provider UI before creating resources. If a payment method, paid plan, paid team, paid add-on, always-on upgrade, or custom domain purchase is required, stop and ask Ashar.

### Web provider — Vercel first

- Ashar's Vercel free account can create/import the project.
- No paid team/project upgrade is required to deploy from GitHub.
- Build minutes, bandwidth, and function/request limits are acceptable for a small controlled preview.
- Environment variable management is included.
- Rollback/redeploy from prior commit is available.
- Project can later transfer to a Pro/team account or upgraded plan without changing app architecture.

### API provider — separate long-running Node host

Compare free/cheap candidates such as Render, Fly, Railway, or equivalent. Select one only after preflight confirms:

- long-running Node process is supported;
- custom install/build/start commands are supported;
- provider can run the Nest API production start path;
- provider supports HTTPS public URL;
- provider supports `/healthz` and `/readyz` checks;
- environment variables/secrets can be configured without committed files;
- logs are available for startup/health smoke;
- free/cheap tier limits, sleep/cold-start behavior, region, and payment-method requirements are documented;
- the service can later scale beyond one instance or migrate without changing public API contracts.

Stop if the only available option requires forcing the API into Vercel serverless for Wave O.

### Postgres provider — Supabase first

Verify Supabase first:

- Ashar has account/project access suitable for preview.
- A free/cheap isolated Postgres project/database can be created.
- Project/database can be deleted/reset without touching any production data.
- Runtime pooled connection URL is available or documented.
- Direct connection URL for Prisma migrations is available if required.
- Storage/compute/sleep/connection/egress limits are acceptable for a controlled preview.
- Connection pooling behavior is understood for a long-running API host.
- Supabase Auth/Storage/Realtime/Edge Functions are not enabled for app behavior in Wave O.

Use Neon fallback only if Supabase fails preflight, for example:

- no usable free/cheap Supabase project/database is available;
- connection/pooling or migration URL handling blocks Prisma deploy migrations;
- account/ownership/secrets handling is unsafe or blocked;
- Supabase requires unapproved paid commitment;
- Athena/Ashar explicitly accept using fallback.

### Redis provider

Default is no Redis resource.

Only if Ashar/Ticket 103 explicitly approves Redis later:

- free/cheap Redis-compatible resource is available;
- request/storage limits are acceptable;
- preview prefix can be isolated, e.g. `wr:preview`;
- deleting/flushing only preview keys is possible.

## Exact provider setup steps after approval

### 1. Confirm GitHub source

Use the merged `main` branch only:

```bash
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
```

Record the commit SHA in the deployment evidence note.

### 2. Create preview Postgres — Supabase first

Provider UI steps, assuming Supabase Postgres:

1. Open Supabase dashboard.
2. Create or select an isolated preview project/database named like `wordle-royale-preview-postgres`.
3. Select the lowest free/cheap preview-suitable region/tier.
4. Create/use one database/schema for preview only, e.g. `wordle_royale_preview` or Supabase's default project database with preview-only credentials.
5. Copy runtime pooled Postgres URL to provider secret storage later as `DATABASE_URL`.
6. Copy direct Postgres URL to provider secret storage later as `DATABASE_DIRECT_URL` if Prisma migrations require it.
7. Do not paste either URL into repo files, chat, screenshots, or docs.
8. Record only non-secret metadata:
   - provider name: Supabase;
   - project/resource name;
   - region;
   - database/schema name if non-secret;
   - dashboard URL without tokens.

If Supabase fails preflight, stop and record the fallback reason before using Neon.

Neon fallback setup, only after fallback acceptance:

1. Create a Neon preview project/resource named like `wordle-royale-preview-postgres`.
2. Select the lowest free/cheap preview-suitable region/tier.
3. Create one database for preview only, e.g. `wordle_royale_preview`.
4. Store pooled/direct URLs only in provider secret storage.
5. Record only non-secret metadata and the accepted fallback reason.

### 3. Select/create API service — long-running Node host

Provider UI steps, after Yuna chooses the exact API host:

1. Create a long-running Web/API service named `wordle-royale-preview-api`.
2. Connect GitHub repo `Ashar-Neodym/wordle-royale`.
3. Select branch `main`.
4. Set runtime/environment to Node.
5. Set root directory to repo root, unless provider requires a service root.
6. Set install/build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter @wordle-royale/api db:generate && pnpm --filter @wordle-royale/api build
```

7. Set start command:

```bash
pnpm --filter @wordle-royale/api start
```

8. Set health check path:

```text
/readyz
```

9. Configure API environment variables in the provider dashboard; see the API env table below.
10. Do not deploy/start until all required env values are configured.

### 4. Configure API env vars/secrets

Use root API-origin shape. No `/api/v1` suffix.

| Name | Example preview value shape | Class | Required | Source/notes |
|---|---|---:|---:|---|
| `APP_ENV` | `preview` | internal | Yes | Hosted preview mode. |
| `NODE_ENV` | `production` | internal | Yes | Production-start runtime. |
| `PORT` | provider-supplied | internal | Usually | Let provider inject if possible. |
| `LOG_LEVEL` | `info` | internal | Recommended | Avoid debug logs. |
| `PUBLIC_WEB_URL` | `https://<preview-web-host>` | public/internal | Yes | Fill after web URL exists; temporary provider preview URL is acceptable. |
| `API_BASE_URL` | `https://<preview-api-host>` | public/internal | Yes | Root API origin only; no `/api/v1`. |
| `WS_BASE_URL` | `https://<preview-api-host>` | public/internal | Maybe | Only if WebSocket path is enabled. |
| `CORS_ALLOWED_ORIGINS` | `https://<preview-web-host>` | internal | Yes | Comma-separated approved web origins only; no wildcard. |
| `DATABASE_URL` | Supabase pooled Postgres URL | secret | Yes | Store only in API provider secret/env UI. Neon URL only if fallback accepted. |
| `DATABASE_DIRECT_URL` | Supabase direct Postgres URL | secret | Yes for migrations | Store only in provider secret/env UI. Neon URL only if fallback accepted. |
| `REDIS_URL` | blank/unset | secret | No by default | Set only if Redis approved. |
| `REDIS_REQUIRED` | `false` | internal | Yes | First preview default. |
| `REDIS_KEY_PREFIX` | `wr:preview` | internal | If Redis used | Leave unset or set harmlessly if no Redis. |
| `AUTH_MODE` | `preview_demo_session` | internal | Yes | Explicit demo sessions only. |
| `PREVIEW_DEMO_SESSION_TTL_SECONDS` | `7200` | internal | Yes | Short-lived demo sessions. |
| `ENABLE_DEV_AUTH` | `false` | internal | Yes | Must be false. |
| `ENABLE_DEV_ROUTES` | `false` | internal | Yes | Must be false. |
| `COOKIE_DOMAIN` | blank initially | internal | Maybe | Blank is often correct for provider domain cookies. |
| `COOKIE_SECURE` | `true` | internal | Yes | HTTPS-only cookie. |
| `JWT_ACCESS_SECRET` | generated high-entropy secret | secret | If runtime requires | Generate in provider/secret manager only. |
| `REFRESH_TOKEN_PEPPER` | generated high-entropy secret | secret | If runtime requires | Generate in provider/secret manager only. |
| `PASSWORD_HASH_PEPPER` | generated high-entropy secret | secret | If runtime requires | Generate in provider/secret manager only; password auth remains off. |
| `CSRF_SECRET` | generated high-entropy secret | secret | If runtime requires | Generate in provider/secret manager only. |
| `SENTRY_DSN` | unset | secret/optional | No | Do not enable without approval. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | secret/optional | No | Do not enable without approval. |

Secret generation guidance after approval:

- Generate secrets in a local terminal only when ready to paste directly into provider secret UI, or use provider secret-generation tools.
- Do not write generated values to files.
- Do not paste generated values into agent chat.
- Record only that the secret was set, not its value.

Example local generation command after approval only:

```bash
openssl rand -base64 32
```

### 5. Run preview DB migration

Only after the API provider has the isolated preview `DATABASE_DIRECT_URL` configured and Ashar approved migrations:

Preferred provider shell/job command:

```bash
pnpm --filter @wordle-royale/api db:validate
pnpm --filter @wordle-royale/api db:generate
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Rules:

- Confirm the direct URL points to the isolated Supabase preview database/project before running.
- If Neon fallback is used, confirm the accepted fallback reason and preview DB name before running.
- Do not run `db:migrate:dev` against hosted preview.
- Do not run destructive reset commands unless Ashar separately approves reset.
- Do not seed hosted preview unless Athena/Freya provide an approved preview-safe seed plan.

### 6. Deploy API service

After env and DB migration:

1. Trigger API deployment from provider UI.
2. Watch build logs.
3. Confirm startup command runs:

```bash
pnpm --filter @wordle-royale/api start
```

4. Confirm service has an HTTPS URL.
5. Run health checks from local terminal:

```bash
API="https://<preview-api-host>"
curl -fsS "$API/healthz"
curl -fsS "$API/readyz"
```

Expected:

- HTTP 200;
- service `wordle-royale-api`;
- overall readiness `ok`;
- database dependency `ok`;
- Redis skipped/not required when omitted with `REDIS_REQUIRED=false`.

### 7. Create web project — Vercel free account first

Provider UI steps for Vercel:

1. Create/import project named `wordle-royale-preview-web` using Ashar's Vercel free account.
2. Connect GitHub repo `Ashar-Neodym/wordle-royale`.
3. Select branch `main`.
4. Set project/root directory:

```text
apps/web
```

Alternative if Vercel builds from repo root:

```bash
pnpm install --frozen-lockfile && pnpm --filter @wordle-royale/web build
```

5. Set framework preset to Next.js if available.
6. Configure web environment variables.
7. Deploy only after API URL is known and API health passes.
8. Record whether transfer/upgrade would be possible later without changing architecture; do not upgrade now.

### 8. Configure web env vars

Use root API-origin shape. No `/api/v1` suffix.

| Name | Example preview value shape | Class | Required | Notes |
|---|---|---:|---:|---|
| `NEXT_PUBLIC_API_URL` | `https://<preview-api-host>` | public | Yes | Exact current web client env name. |
| `NEXT_PUBLIC_APP_ENV` | `preview` | public | Recommended | Public preview mode/copy. |
| `NEXT_PUBLIC_WS_URL` | `https://<preview-api-host>` | public | Maybe | Only if active WebSocket features require it. |
| `PUBLIC_WEB_URL` | `https://<preview-web-host>` | public/internal | Recommended | Also mirror in API `PUBLIC_WEB_URL`/CORS. |

After the final web URL is known, update API env vars if needed:

```text
PUBLIC_WEB_URL=https://<preview-web-host>
CORS_ALLOWED_ORIGINS=https://<preview-web-host>
```

Then redeploy/restart the API so CORS uses the final web origin.

### 9. Hosted smoke checks after provisioning

Run from local terminal after API and web deploy:

```bash
API="https://<preview-api-host>"
WEB="https://<preview-web-host>"
COOKIE_JAR="$(mktemp)"

curl -fsS "$API/healthz"
curl -fsS "$API/readyz"

curl -fsS -i \
  -c "$COOKIE_JAR" \
  -H "Origin: $WEB" \
  -H "Content-Type: application/json" \
  -X POST "$API/auth/preview-demo/start"

curl -fsS \
  -b "$COOKIE_JAR" \
  -H "Origin: $WEB" \
  "$API/auth/me"

curl -fsS "$WEB/" >/tmp/wordle-royale-preview-home.html
rm -f "$COOKIE_JAR"
```

Expected:

- API health and readiness pass.
- Preview demo-session start succeeds.
- Cookie is HttpOnly/Secure on HTTPS.
- `auth/me` returns preview demo-session identity.
- Web home page loads.
- Web copy says demo sessions are non-durable and preview data may reset.
- Web copy does not claim public mobile readiness.

## Scale-readiness notes for future broad launch

This preflight is for controlled preview, not full production scale. The selected architecture should remain stable for a large product, but before inviting broad traffic Yuna/Athena should add a later scale-readiness ticket covering:

- API horizontal scaling and statelessness across multiple instances;
- Supabase/Postgres connection pooling, index review, query budgets, and backup/restore posture;
- Redis or equivalent for cross-instance rate limiting, presence/lobby coordination, pub/sub, queues, cache, or durable sessions;
- observability: logs, metrics, traces, uptime checks, alerting, and error reporting;
- staged load testing for ranked/lobby/demo-session flows;
- abuse/spoiler/cheat controls under concurrency.

## Rollback/delete plan

### Immediate web rollback

1. Use Vercel rollback/redeploy previous commit UI.
2. If rollback is unavailable, disable deployment or remove public preview link.
3. Verify web env still points to intended API.
4. Run home page smoke.

### Immediate API rollback

1. Use selected API provider rollback/redeploy previous commit UI.
2. Restart service.
3. Run:

```bash
API="https://<preview-api-host>"
curl -fsS "$API/healthz"
curl -fsS "$API/readyz"
```

4. If API stays unhealthy, remove/disable web preview CTA until fixed.

### Preview DB reset/delete

Preview DB is disposable, but reset/delete still requires explicit approval because tester sessions/results may be affected.

Delete path after approval:

1. Confirm provider/resource name matches the approved Supabase preview project/database, or accepted Neon fallback resource.
2. Confirm no production data is present.
3. Export non-secret metadata if needed.
4. Delete database/project in provider UI.
5. Remove associated API `DATABASE_URL`/`DATABASE_DIRECT_URL` values from provider settings.
6. Record deletion evidence without secret values.

Reset path after approval:

1. Recreate isolated preview database or restore a known preview snapshot.
2. Re-run `db:migrate:deploy`.
3. Do not run unapproved seed/reset scripts.
4. Announce that preview sessions/ratings/history may reset.

### API/web project deletion

After approval:

1. Disable/delete Vercel project `wordle-royale-preview-web`.
2. Disable/delete selected API service `wordle-royale-preview-api`.
3. Delete provider env vars/secrets for both projects.
4. Confirm URLs no longer serve stale preview content.
5. Record provider deletion timestamps and resource names only.

### Redis deletion if ever provisioned

After approval:

1. Flush only preview-prefixed keys, e.g. `wr:preview:*`, if a flush is needed.
2. Delete resource `wordle-royale-preview-redis`.
3. Remove `REDIS_URL` from API provider env.
4. Keep `REDIS_REQUIRED=false` if Redis remains omitted.

## Post-provision evidence note template

Create a later deployment evidence doc with this structure, without secrets:

```text
Date/time:
Operator:
Approved by:
Git commit SHA:
Web provider/project: Vercel / <project>
API provider/project: <selected long-running host> / <service>
Postgres provider/project/database: Supabase / <project/db> OR Neon fallback / <project/db + fallback reason>
Redis: omitted or provider/project:
Web URL:
API URL:
Migration command/result:
Health smoke result:
Demo-session smoke result:
Web smoke result:
Rollback handles:
Known caveats:
```

## Stop conditions

Stop and ask Ashar/Athena before proceeding if any of these occur:

- provider asks for payment method or paid plan;
- API provider cannot run a long-running Node service with the required start command;
- the only available API route requires moving Nest into Vercel serverless;
- Supabase cannot provide a safe preview database and fallback has not been accepted;
- provider requires committing env files;
- provider UI would expose secrets in logs or public settings;
- hosted API readiness fails after migration;
- CORS/cookie demo-session smoke fails;
- current `main` is not the reviewed/merged Wave N+O commit;
- Redis appears required despite `REDIS_REQUIRED=false`;
- any real secret appears in terminal output, git diff, logs, or docs.
