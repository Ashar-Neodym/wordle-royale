# Ticket 98 — Preview Infrastructure and Environment Runbook Response

Task: Preview Infrastructure and Environment Runbook
Agent: Yuna (operations)
Status: Completed — runbook created; no deployment/provisioning/secrets performed

## What I understood

Ticket 98 asked for a concrete controlled-preview deployment runbook and environment map, using Ticket 97's decision if available, without provisioning resources, deploying, logging into providers, adding secrets, creating real `.env` files, or adding paid services.

Ticket 97 was available and locked the Wave N scope:

- first preview is web + hosted API, not production and not public mobile;
- preview auth is explicit demo sessions only;
- no durable accounts;
- sessions/data may reset;
- mobile remains Expo Go/manual smoke only until physical-device verification is closed;
- preferred shape is separate web host + Node API host + managed preview Postgres;
- Redis should be minimized or explicitly justified.

## What I did

- Read Ticket 98, Ticket 97's decision lock, the Wave N ticket index, current environment templates, and package/API scripts.
- Created a provider-neutral but concrete runbook for later operator use.
- Included provider/project layout, env var names, secret classifications, DB/Redis requirements, build/start/migration/smoke commands, rollback/reset plans, cost/free-tier notes, and approval gates.
- Kept this plan-only: no provider CLIs, no resource creation, no deployment, no real env files, and no secrets.

## Files changed

- `docs/2026-07-06-preview-infrastructure-env-runbook.md`
- `agent-communication/responses/ticket-98-yuna-preview-infrastructure-env-runbook-response.md`

## Runbook summary

Runbook path:

```text
docs/2026-07-06-preview-infrastructure-env-runbook.md
```

Recommended preview shape:

| Component | Planning route | Status |
|---|---|---|
| Web | Vercel-style free Next.js hosting | recommended after approval |
| API | Render/Fly/Railway-style long-running Node service | recommended after approval |
| Postgres | Neon/Supabase/Render isolated preview DB | required after approval |
| Redis | optionalize or use free/cheap Redis-compatible service only if required | open for Ticket 99 |
| Mobile | Expo Go/manual smoke only | not public mobile preview |

Key preview env lock:

```text
APP_ENV=preview
NODE_ENV=production
AUTH_MODE=preview_demo_session
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
COOKIE_SECURE=true
```

## Environment map included

The runbook classifies API, web, and mobile variables as public/internal/secret/optional, including:

- `APP_ENV`
- `NODE_ENV`
- `PORT`
- `PUBLIC_WEB_URL`
- `API_BASE_URL`
- `WS_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `DATABASE_URL`
- `DATABASE_DIRECT_URL`
- `REDIS_URL`
- `REDIS_KEY_PREFIX`
- `AUTH_MODE`
- `PREVIEW_DEMO_SESSION_TTL_SECONDS`
- `ENABLE_DEV_AUTH`
- `ENABLE_DEV_ROUTES`
- `COOKIE_DOMAIN`
- `COOKIE_SECURE`
- `JWT_ACCESS_SECRET`
- `REFRESH_TOKEN_PEPPER`
- `PASSWORD_HASH_PEPPER`
- `CSRF_SECRET`
- `SENTRY_*`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `NEXT_PUBLIC_*` / web API URL candidates
- `EXPO_PUBLIC_*`
- `EXPO_TOKEN`

Secret values are not included.

## Commands documented in the runbook

Install/build/start:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/api db:generate
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api start
```

Migration, only after approval and only against isolated preview DB:

```bash
pnpm --filter @wordle-royale/api db:validate
pnpm --filter @wordle-royale/api db:generate
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Health/smoke after deployment:

```bash
curl -fsS https://<preview-api-host>/healthz
curl -fsS https://<preview-api-host>/readyz
```

Preview demo-session smoke with a temporary cookie jar is also included.

CI/local parity commands documented:

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

## Verification run

Commands run locally for Ticket 98:

```bash
git diff --check -- docs/2026-07-06-preview-infrastructure-env-runbook.md agent-communication/responses/ticket-98-yuna-preview-infrastructure-env-runbook-response.md
pnpm secret-scan
git status --short --branch -- docs/2026-07-06-preview-infrastructure-env-runbook.md agent-communication/responses/ticket-98-yuna-preview-infrastructure-env-runbook-response.md
```

Results:

- Markdown whitespace check passed.
- Secret scan passed.
- Only the Ticket 98 doc/response files were intentionally added by this ticket.

## Evidence / result

Acceptance criteria:

- Produces a runbook that an operator can follow later: PASS.
- Includes exact env var names and secret classification: PASS.
- Includes commands for build/start/migrate/smoke: PASS.
- Includes rollback and data-reset policy for preview demo sessions: PASS.
- Calls out blockers/unknowns requiring Ashar approval: PASS.

## Blockers / risks

- Actual provider/resource selection still needs Ashar approval.
- Exact web env names need Ticket 99/100 verification against current Next.js code before provisioning.
- Hosted split-domain CORS/cookie behavior needs Ticket 99 validation.
- Redis should be made optional or explicitly justified before adding a managed Redis dependency.
- Preview DB reset/seed policy must be confirmed safe before use.
- Mobile physical Expo Go smoke remains deferred unless Ashar completes phone observation.
- Provider free-tier/cost details must be checked at provisioning time because free tiers change.

## Safety / approval boundaries

- Did not deploy.
- Did not create cloud resources.
- Did not log into provider CLIs.
- Did not create or print secrets.
- Did not create real `.env` files.
- Did not add paid services.
- Did not claim public mobile preview readiness.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Freya
- Why that agent is needed: Ticket 99 owns hosted API hardening and can verify/adjust actual API env, readiness, Redis, CORS, and cookie behavior.
- Exact task: Use the Ticket 98 runbook to harden hosted-preview API behavior without deploying: validate required preview envs, split web/API CORS and cookie settings, Redis readiness optionality/requirement, and safe migration/reset assumptions.
- Inputs/context they need: `docs/2026-07-06-preview-infrastructure-env-runbook.md`, Ticket 97 decision lock, current `.env.example`, API scripts, and Ticket 99.
- Expected output back to Athena: code/docs/tests proving hosted preview API config is safe, plus any changes to env names or runbook assumptions.

### Follow-up ticket 2

- Target agent: Luna
- Why that agent is needed: Ticket 100 owns user-facing preview copy/mobile caveats and must align UI copy with the runbook.
- Exact task: Ensure preview copy says demo-only, no durable accounts, sessions/data may reset, no real credentials, and mobile remains experimental/manual until physical smoke closes.
- Inputs/context they need: Ticket 97 decision lock and `docs/2026-07-06-preview-infrastructure-env-runbook.md`.
- Expected output back to Athena: updated copy/UX evidence and mobile smoke status.

### Follow-up ticket 3

- Target agent: Jasmine
- Why that agent is needed: Ticket 102 must independently verify the Wave N setup before Ashar is asked to provision/deploy.
- Exact task: Verify this runbook matches actual scripts/envs after Tickets 99–101, and confirm no provider resources/secrets/deployments were created prematurely.
- Inputs/context they need: Ticket 98 runbook/response, Tickets 99–101 responses, PR/CI evidence.
- Expected output back to Athena: pass/warn/fail recommendation and approval blockers before any real provisioning.
