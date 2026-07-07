# Preview Deployment, CI, and Environment Plan

> Supersession note (Wave N): this older planning document contains historical `/api/v1` and `EXPO_PUBLIC_API_BASE_URL` examples. For current controlled public-preview setup, use `docs/2026-07-06-preview-infrastructure-env-runbook.md`, which sets API origins without `/api/v1` and uses the current client env names `NEXT_PUBLIC_API_URL` and `EXPO_PUBLIC_API_URL`.

Date: 2026-07-01
Owner: Yuna
Wave: L — Public-preview readiness
Scope: plan/config-readiness only; no deployment or external resource provisioning

## Recommendation

Use a low-cost split preview layout for the current monorepo:

| Surface | Recommended preview target | Why | Current readiness |
|---|---|---|---|
| Web frontend | Vercel Preview for `apps/web` | Best free/cheap Next.js preview ergonomics, branch previews, simple env management | `pnpm --filter @wordle-royale/web build` works. Needs Vercel project root/build settings. |
| API backend | Render Web Service or Fly.io app for `apps/api` | NestJS API wants a long-running Node process, not a Vercel serverless function yet | Not ready for production start: API `build` is typecheck-only and no `start` script exists. |
| Postgres | Neon or Supabase preview/staging database | Free/cheap managed Postgres; avoids operating DB in Docker for preview | Prisma schema exists. Needs migration policy and preview DB URL. |
| Redis | Upstash Redis or provider-managed Redis | Cheap/free serverless Redis; no self-hosted ops for preview | API readiness can check `REDIS_URL`. Needs preview URL secret. |
| Mobile | Expo Go/manual real-device preview first; EAS Preview later | Current mobile is an Expo shell; avoid EAS tokens and paid build complexity until needed | `pnpm --filter @wordle-royale/mobile build` validates config/typecheck only. |

Do **not** add CD yet. Add source-only preview-readiness CI first, then create hosting resources only after Ashar approves provider choices and secret creation.

## Hosting options and tradeoffs

### Web frontend

1. **Vercel Preview — recommended**
   - Pros: best Next.js support, automatic PR previews, free/cheap, easy env scoping.
   - Cons: API must live elsewhere unless the backend is refactored into Vercel functions.
   - Setup shape after approval:
     - Root directory: repo root or `apps/web` depending Vercel monorepo settings.
     - Install: `pnpm install --frozen-lockfile`
     - Build: `pnpm --filter @wordle-royale/web build`
     - Output: Next.js-managed.

2. **Render Static Site / Netlify**
   - Pros: easy previews.
   - Cons: less ideal for current Next.js version/runtime than Vercel.

### API backend

1. **Render Web Service — recommended for first preview**
   - Pros: simple long-running Node web service, free/cheap path, easy env var UI.
   - Cons: free tier may spin down; cold starts are acceptable for preview but bad for production.
   - Current gap: API package lacks a production `start` command and compiled JS artifact.

2. **Fly.io**
   - Pros: production-like, Docker-friendly, good for persistent services.
   - Cons: more ops surface and billing/account complexity.

3. **Railway**
   - Pros: smooth monorepo deploy and managed DB/Redis options.
   - Cons: generally paid; less aligned with free-first preference.

4. **Vercel Serverless API**
   - Pros: one provider with web.
   - Cons: current NestJS app is written as a long-running HTTP server; serverless adaptation would be implementation work and should not be done in this ops ticket.

### Data services

| Service | Recommended preview option | Notes |
|---|---|---|
| Postgres | Neon or Supabase | Use one preview/staging DB, not local Docker. Use pooled URL for app runtime if provider recommends it and direct URL for migrations. |
| Redis | Upstash Redis | Use TLS URL if provider requires it. Keep key prefix environment-specific, e.g. `wr:preview`. |

## Environment tiers

### Local

Purpose: developer machines and Hermes agent validation.

- `APP_ENV=local`
- `NODE_ENV=development`
- local Docker Compose Postgres/Redis
- fixture/stub auth allowed
- local reset scripts allowed only against local DB shape
- no real user secrets

### Preview / staging

Purpose: public-preview candidate used by Ashar/testers before production.

- `APP_ENV=preview`
- `NODE_ENV=production`
- managed Postgres + managed Redis
- no destructive reset scripts
- no fixture auth side effects for public users once Ticket 82 lands
- public handles/ratings/lobby/match summaries allowed
- emails/tokens/answer hashes/salts/internal analytics remain private

### Future production

Purpose: public launch.

- `APP_ENV=production`
- `NODE_ENV=production`
- separate production DB/Redis from preview
- stricter cookie/domain/security settings
- backups, monitoring, incident/rollback plan required before launch
- no local dev fixtures or reset paths

## Required environment variables and secrets

### Shared runtime

| Variable | Local | Preview | Production | Secret? | Notes |
|---|---|---|---|---:|---|
| `APP_ENV` | `local` | `preview` | `production` | No | Runtime tier guard. |
| `NODE_ENV` | `development` | `production` | `production` | No | Build/runtime mode. |
| `PORT` | `4000` | provider-assigned or `4000` | provider-assigned | No | API service port. |
| `LOG_LEVEL` | `debug` | `info` | `info`/`warn` | No | Avoid noisy preview logs. |
| `PUBLIC_WEB_URL` | localhost | Vercel preview URL | production domain | No | Used for links/CORS planning. |
| `API_BASE_URL` | local API | deployed API URL | production API URL | No if public URL | Server/client scripts use this shape. |
| `WS_BASE_URL` | local API | deployed API WS URL | production WS URL | No if public URL | Future realtime path. |
| `CORS_ALLOWED_ORIGINS` | localhost web/mobile | exact preview web origins | exact prod origins | No | Must not be `*` for preview/prod. |

### Data services

| Variable | Local | Preview | Production | Secret? | Notes |
|---|---|---|---|---:|---|
| `DATABASE_URL` | local Compose URL | managed preview DB URL | managed prod DB URL | Yes | App runtime and Prisma by default. |
| `DATABASE_DIRECT_URL` | same as local | direct migration URL if needed | direct migration URL | Yes | Keep separate if provider uses pooling. |
| `REDIS_URL` | local Redis | managed preview Redis URL | managed prod Redis URL | Yes | Use provider TLS form if required. |
| `REDIS_KEY_PREFIX` | `wr:local` | `wr:preview` | `wr:prod` | No | Prevent cross-tier key collision. |

### Auth/security

| Variable | Local | Preview | Production | Secret? | Notes |
|---|---|---|---|---:|---|
| `JWT_ACCESS_SECRET` | local disposable | generated preview secret | generated prod secret | Yes | Generate outside git. |
| `REFRESH_TOKEN_PEPPER` | local disposable | generated preview secret | generated prod secret | Yes | Rotate per tier. |
| `PASSWORD_HASH_PEPPER` | local disposable | generated preview secret | generated prod secret | Yes | Only needed when password auth exists. |
| `COOKIE_DOMAIN` | empty | preview domain if cookies used | prod domain | No | Empty is acceptable for localhost. |
| `COOKIE_SECURE` | `false` | `true` | `true` | No | Required over HTTPS. |
| `CSRF_SECRET` | local disposable | generated preview secret | generated prod secret | Yes | Required for state-changing browser auth flows. |

### Observability/mobile

| Variable | Local | Preview | Production | Secret? | Notes |
|---|---|---|---|---:|---|
| `SENTRY_DSN` | empty | optional preview DSN | production DSN | Usually no | Do not add until approved. |
| `SENTRY_ENVIRONMENT` | `local` | `preview` | `production` | No | Keep separate events. |
| `SENTRY_RELEASE` | `local` | commit SHA | release SHA/tag | No | CI can set later. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | optional | optional | Maybe | Depends provider. |
| `EXPO_PUBLIC_APP_ENV` | `local` | `preview` | `production` | No | Embedded public mobile config. |
| `EXPO_PUBLIC_API_BASE_URL` | local API | preview API public URL | prod API URL | No | Public by definition. |
| `EXPO_PUBLIC_WS_BASE_URL` | local API | preview WS public URL | prod WS URL | No | Public by definition. |
| `EXPO_TOKEN` | unset | EAS only if approved | EAS only if approved | Yes | Do not create/use for this ticket. |

## Current script readiness

### Adequate now

- Root validation/build gates:
  - `pnpm install --frozen-lockfile`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm --filter @wordle-royale/api test`
  - `pnpm build`
  - `pnpm smoke:local`
  - `pnpm secret-scan`
  - `pnpm deps:check`
- Web build:
  - `pnpm --filter @wordle-royale/web build`
- Mobile validation:
  - `pnpm --filter @wordle-royale/mobile build`
- API tests and Prisma validation:
  - `pnpm --filter @wordle-royale/api test`
  - `pnpm --filter @wordle-royale/api db:validate`

### Not adequate for real preview deploy yet

- API `build` currently runs TypeScript typecheck only; it does not emit a deployable `dist/` artifact.
- API has no production `start` script.
- No migration-run policy is locked for preview. `db:migrate:deploy` exists, but should only run against a managed preview DB after Ashar approves the DB provider and secrets.
- Web has no provider config, which is fine for Vercel if configured in the Vercel UI, but should be documented before first deploy.
- Mobile has no EAS profile or deployment lane; keep Expo Go/manual preview for now unless Ashar approves EAS setup.

Recommended implementation follow-up before first API preview deploy:

```json
{
  "@wordle-royale/api": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js"
  }
}
```

That change may require tsconfig/module output adjustments and should be implemented/tested as an implementation ticket, not silently added here.

## Recommended CI additions, no CD

Keep `.github/workflows/pr-checks.yml` as the main required PR gate. Add a second non-deploy preview-readiness job when source changes begin targeting deployability:

1. API deploy-shape check:
   - `pnpm --filter @wordle-royale/api db:validate`
   - once API emits JS: `pnpm --filter @wordle-royale/api build`
   - optionally start API against mocked/local env and curl `/healthz` if no DB is required.
2. Web env/build check:
   - build with placeholder preview public URLs:
     - `NEXT_PUBLIC_API_URL=https://api-preview.example.invalid pnpm --filter @wordle-royale/web build`
3. Mobile public config check:
   - `EXPO_PUBLIC_APP_ENV=preview EXPO_PUBLIC_API_BASE_URL=https://api-preview.example.invalid pnpm --filter @wordle-royale/mobile build`
4. Keep secret scan as a required gate.
5. Do not add deployment jobs, cloud login actions, or provider tokens until approved.

## First approved deployment sequence

Only after Ashar approves providers and secret creation:

1. Create managed preview Postgres and Redis.
2. Store secrets in provider secret stores, not git.
3. Add/verify API deploy build/start scripts.
4. Run migrations against preview DB using `pnpm --filter @wordle-royale/api db:migrate:deploy` from a controlled one-off job or provider deploy command.
5. Deploy API preview.
6. Verify:
   - `GET /healthz`
   - `GET /readyz`
   - no fixture answer leakage in logs/responses
7. Configure web preview with `NEXT_PUBLIC_API_URL` pointing at API preview.
8. Deploy web preview.
9. Run a public-preview smoke checklist and Jasmine QA.
10. Only then consider a merge/deploy handoff.

## Safety constraints

- No real deployment was performed for this plan.
- No external resources were created.
- No provider tokens or real secret values should be committed.
- Preview DB/Redis must be separate from future production.
- Local reset scripts must never run against preview/production service URLs.
