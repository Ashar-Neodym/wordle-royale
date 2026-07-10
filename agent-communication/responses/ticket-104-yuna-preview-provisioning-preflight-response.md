# Ticket 104 — Preview Provisioning Preflight Checklist Response

Task: Preview Provisioning Preflight Checklist
Agent: Yuna (operations)
Status: Revised — preflight checklist updated; no provisioning/deployment/resources/secrets performed

## What I understood

Ashar/Athena corrected the Wave O provider direction. Ticket 104 must no longer assume Neon-first or Render-locked deployment.

Required revised direction:

- Use **Vercel free account first** for web; transfer/upgrade later only if product justifies it.
- Use **Supabase Postgres first** because Ashar already has Supabase/subscription context.
- Keep **Neon as fallback only**, not first choice.
- Keep a stable architecture for a large long-term product.
- Do **not** force the Nest API into Vercel serverless.
- Use a **separate long-running Node/Nest API server** for ranked gameplay, lobbies, server authority, sessions, and future realtime.
- Keep Redis omitted initially with `REDIS_REQUIRED=false`.
- Do not provision, deploy, log into providers, create secrets, or create real `.env` files.

## What I did

- Read `docs/2026-07-07-athena-wave-o-architecture-direction.md`.
- Replaced the old Render/Neon-first assumption in the Ticket 104 preflight.
- Revised the durable preflight document:

```text
docs/2026-07-07-preview-provisioning-preflight.md
```

- Kept the document explicitly conditional on Ashar approval and Ticket 103 provider confirmation.
- Preserved the corrected root API-origin shape:
  - `API_BASE_URL=https://<preview-api-host>`
  - `NEXT_PUBLIC_API_URL=https://<preview-api-host>`
  - `EXPO_PUBLIC_API_URL=https://<preview-api-host>`
  - no `/api/v1` suffix.

## Files changed

- `docs/2026-07-07-preview-provisioning-preflight.md`
- `agent-communication/responses/ticket-104-yuna-preview-provisioning-preflight-response.md`

## Revised preflight summary

Provider set now documented:

| Component | Revised provider route | Resource name shape |
|---|---|---|
| Web | **Vercel free account first** | `wordle-royale-preview-web` |
| API | **Separate long-running Node/Nest API host** selected by preflight from free/cheap candidates | `wordle-royale-preview-api` |
| Postgres | **Supabase Postgres first** | `wordle-royale-preview-postgres` or Supabase project DB equivalent |
| Postgres fallback | **Neon fallback only** if Supabase fails preflight | `wordle-royale-preview-postgres` plus recorded fallback reason |
| Redis | omitted initially | none; `REDIS_REQUIRED=false` |
| Mobile | no public deployment | Expo Go/manual only |

The revised preflight includes:

- hard approval gate;
- Vercel free-account checks;
- separate long-running API-host comparison/selection checks;
- Supabase-first Postgres checks;
- Neon fallback triggers;
- exact API/web env tables;
- migration command sequence;
- hosted API/web/demo-session smoke commands;
- rollback/delete steps;
- scale-readiness notes for future broad launch;
- stop conditions.

## Exact env shape documented

API env highlights:

```text
APP_ENV=preview
NODE_ENV=production
PUBLIC_WEB_URL=https://<preview-web-host>
API_BASE_URL=https://<preview-api-host>
WS_BASE_URL=https://<preview-api-host>
CORS_ALLOWED_ORIGINS=https://<preview-web-host>
DATABASE_URL=<supabase pooled postgres URL stored only in provider env>
DATABASE_DIRECT_URL=<supabase direct postgres URL stored only in provider env>
REDIS_REQUIRED=false
AUTH_MODE=preview_demo_session
PREVIEW_DEMO_SESSION_TTL_SECONDS=7200
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
COOKIE_SECURE=true
```

Web env highlights:

```text
NEXT_PUBLIC_API_URL=https://<preview-api-host>
NEXT_PUBLIC_APP_ENV=preview
PUBLIC_WEB_URL=https://<preview-web-host>
```

Mobile/Expo remains manual-only:

```text
EXPO_PUBLIC_API_URL=https://<preview-api-host>
EXPO_PUBLIC_APP_ENV=preview
```

No secret values are included.

## Commands documented for later use

Pre-approval local gates:

```bash
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

API provider build/start, after approval only:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter @wordle-royale/api db:generate && pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api start
```

Migration after approval only:

```bash
pnpm --filter @wordle-royale/api db:validate
pnpm --filter @wordle-royale/api db:generate
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Hosted smoke after provisioning only:

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

## Verification run

Commands run locally for this revised Ticket 104 doc-only task:

```text
# date +%F
2026-07-07

# git diff --check
<no output; exit 0>

# pnpm secret-scan
$ node scripts/secret-scan.mjs
Secret scan passed (190 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.

# git status --short --branch
## main...origin/main
 M agent-communication/index.md
?? agent-communication/responses/ticket-103-elisa-preview-provider-final-decision-response.md
?? agent-communication/responses/ticket-104-yuna-preview-provisioning-preflight-response.md
?? agent-communication/tickets/ticket-103-elisa-preview-provider-final-decision.md
?? agent-communication/tickets/ticket-104-yuna-preview-provisioning-preflight.md
?? agent-communication/tickets/ticket-105-yuna-controlled-preview-provisioning.md
?? agent-communication/tickets/ticket-106-freya-hosted-api-deploy-smoke.md
?? agent-communication/tickets/ticket-107-luna-hosted-web-preview-smoke.md
?? agent-communication/tickets/ticket-108-yuna-wave-o-checkpoint-pr-ci-deploy-evidence.md
?? agent-communication/tickets/ticket-109-jasmine-qa-review-wave-o-hosted-preview.md
?? docs/2026-07-07-athena-wave-o-architecture-direction.md
?? docs/2026-07-07-preview-provider-final-decision.md
?? docs/2026-07-07-preview-provisioning-preflight.md
```

## Evidence / result

Acceptance criteria:

- Revise provider direction to Vercel web + Supabase Postgres first: PASS.
- Make Neon fallback only: PASS.
- Keep separate long-running API server; do not force Nest into Vercel serverless: PASS.
- Keep Redis omitted with `REDIS_REQUIRED=false`: PASS.
- List exact provider UI/CLI steps that will be performed after approval: PASS.
- List exact env vars/secrets using current root API-origin shape: PASS.
- Include rollback/delete steps and cost/free-tier verification: PASS.
- Include local commands to run before and after provisioning: PASS.
- Do not provision/deploy/log into providers/create secrets: PASS.

## Blockers / risks

- Ticket 105 remains blocked until Ashar explicitly approves provider/resource/secret creation.
- The exact API host is intentionally not hard-coded; Yuna must choose it after free/cheap long-running Node host preflight.
- Supabase free-tier limits may be enough for controlled preview but are not a production-scale guarantee.
- Neon fallback requires a recorded Supabase failure/blocker and acceptance before use.
- Provider free tiers may change; verify current limits/costs before resource creation.
- Any required payment method is a hard stop until Ashar approves.
- Secret values must be generated/stored only in provider secret UI after approval, never in repo/chat/docs.
- Hosted migrations must run only against the isolated preview DB.
- Public mobile preview remains out of scope.

## Safety / approval boundaries

- Did not deploy.
- Did not create cloud resources.
- Did not log into provider CLIs.
- Did not create, rotate, print, or store secrets.
- Did not create real `.env` files.
- Did not add paid services.
- Did not claim public mobile preview readiness.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Yuna / Ticket 105
- Why that agent is needed: Ticket 105 is the actual provisioning task, but it is blocked until Ashar explicitly approves providers/resources/secrets.
- Exact task: After approval only, follow the revised Ticket 104 preflight to create Vercel web, Supabase Postgres first, a selected long-running API service, provider env vars, migrations, and non-secret evidence. Use Neon only if Supabase fallback criteria are met and accepted.
- Inputs/context they need: Ticket 103 final decision, revised Ticket 104 preflight, explicit Ashar approval, selected provider dashboards/accounts.
- Expected output back to Athena: provider project/resource names, hosted URLs, migration/health evidence, no secret values.

### Follow-up ticket 2

- Target agent: Jasmine
- Why that agent is needed: Jasmine should independently verify no premature provisioning/secrets/deployments happened and that the preflight is safe before Ticket 105.
- Exact task: Review revised Ticket 104 preflight for Supabase-first correctness, no Vercel-serverless API drift, root API-origin correctness, env coverage, rollback/delete clarity, and approval gate completeness.
- Inputs/context they need: `docs/2026-07-07-preview-provisioning-preflight.md`, this response, Ticket 103 response.
- Expected output back to Athena: pass/warn/fail recommendation before Ashar approves real provisioning.
