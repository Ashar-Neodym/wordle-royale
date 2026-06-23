# Ticket 16 — Local Dev, CI, and Operational Readiness Plan — Response

## Summary

Created an operational implementation plan for Wordle Royale local development, CI checks, staging readiness, health/readiness endpoints, worker queue health, Prisma migrations, backups, release smoke checks, logging, secrets handling, and Sentry environment tagging.

This plan follows the locked defaults from Athena and Elisa:

- Web: Next.js / React.
- Mobile: Expo React Native.
- Backend: TypeScript + NestJS.
- Realtime: Socket.IO V1.
- Database: PostgreSQL.
- ORM/migrations: Prisma.
- Redis: matchmaking, presence, locks, cache, rate limits, Socket.IO adapter, BullMQ backing.
- Queue/jobs: BullMQ.
- CI/CD: GitHub Actions with PR checks, staging deploy, and manual production approval.
- Observability: Sentry + structured JSON logs initially.

No infrastructure was provisioned, no secrets were changed, and no commands were run against production or staging.

## Decisions / Recommendations

1. **Use Docker Compose for local PostgreSQL and Redis only.** Keep app processes running locally via package scripts so developers can see logs and restart API/worker/web independently.
2. **Use separate NestJS process modes for API and worker.** The API serves REST + Socket.IO. The worker runs BullMQ jobs and emits heartbeat/queue-health signals.
3. **Use Prisma migrations as the only schema migration path.** No manual production SQL changes except emergency break-glass with explicit approval and written audit notes.
4. **Use GitHub Actions PR gates before merge.** Required gates should include lint, typecheck, unit tests, integration tests with Postgres/Redis, Prisma migration check, web build, and API Docker build once Dockerfile exists.
5. **Use manual approval for production deploys.** Staging can be automated from `main`; production should remain manually approved until the project has operational history.
6. **Expose backend operational endpoints early.** Freya should implement `/healthz`, `/readyz`, and worker/queue-health reporting before staging release work begins.
7. **Treat Redis as rebuildable operational state.** PostgreSQL remains the durable source of truth. Redis loss may disrupt active matches/lobbies but should not corrupt completed match/rating history.
8. **Do not add paid services or create production resources without Ashar approval.** This ticket is planning/spec only.

## Detailed Output

### 1. Proposed file paths/scripts

These are proposed implementation targets for future agents. They were not created by this ticket.

#### Repository-level files

| Proposed path | Owner | Purpose |
|---|---|---|
| `docker-compose.yml` | Ruby/Yuna/Freya | Local PostgreSQL + Redis services. |
| `.env.example` | Yuna/Freya/Luna | Root-level documented environment template. No secrets. |
| `.env.local.example` | Yuna/Freya/Luna | Local-development defaults matching Docker Compose. |
| `.gitignore` | Implementation agent | Ensure `.env`, `.env.local`, logs, build output, and local DB dumps are ignored. |
| `README.md` or `docs/local-development.md` | Yuna/Ruby | Developer startup instructions. |
| `docs/ops/environment-variables.md` | Yuna | Full env var matrix and secret handling notes. |
| `docs/ops/staging-deployment.md` | Yuna | Staging deploy flow and readiness gates. |
| `docs/ops/migrations.md` | Yuna/Freya | Prisma migration workflow and rollback rules. |
| `docs/ops/backup-restore-rehearsal.md` | Yuna/Ruby | Backup/restore rehearsal procedure. |
| `docs/ops/release-smoke-checks.md` | Yuna/Jasmine | Release smoke checklist and expected evidence. |
| `docs/ops/logging-redaction.md` | Yuna/Freya | Log safety and redaction policy. |
| `.github/workflows/pr-checks.yml` | Yuna/Ruby | PR validation pipeline. |
| `.github/workflows/staging-deploy.yml` | Yuna/Ruby | Staging deployment workflow after provider selection. |
| `.github/workflows/production-release.yml` | Yuna/Ruby | Manual production deployment workflow after provider approval. |

#### Backend/NestJS files

| Proposed path | Owner | Purpose |
|---|---|---|
| `apps/api/src/health/health.module.ts` | Freya | NestJS health/readiness module. |
| `apps/api/src/health/health.controller.ts` | Freya | `/healthz`, `/readyz`, queue health endpoints if kept in API. |
| `apps/api/src/health/health.service.ts` | Freya | DB/Redis/queue readiness checks. |
| `apps/api/src/common/logging/redaction.ts` | Freya | Redaction helpers for secrets/tokens/PII. |
| `apps/api/src/common/logging/request-id.middleware.ts` | Freya | Request ID injection/correlation. |
| `apps/api/src/common/sentry/sentry.module.ts` | Freya | Sentry setup and env tagging. |
| `apps/api/prisma/schema.prisma` | Freya | Prisma schema. |
| `apps/api/prisma/migrations/` | Freya | Committed Prisma migrations. |
| `apps/api/Dockerfile` | Freya/Yuna | API/worker image build. |
| `apps/api/scripts/wait-for-deps.ts` | Ruby/Freya | Local dependency readiness helper. |

#### Worker/queue files

| Proposed path | Owner | Purpose |
|---|---|---|
| `apps/api/src/worker/main.ts` | Freya | Worker bootstrap. |
| `apps/api/src/worker/worker.module.ts` | Freya | BullMQ worker module. |
| `apps/api/src/worker/heartbeat.service.ts` | Freya | Worker heartbeat state/logging. |
| `apps/api/src/queues/queue-health.service.ts` | Freya | BullMQ queue status/depth/failures. |
| `apps/api/src/queues/queues.constants.ts` | Freya | Canonical queue names. |

#### Script/package command proposals

Exact commands depend on package manager and repo layout. Proposed package scripts:

| Script | Purpose |
|---|---|
| `dev` | Start all app dev processes via task runner if used. |
| `dev:web` | Start Next.js web. |
| `dev:api` | Start NestJS API with watch mode. |
| `dev:worker` | Start BullMQ worker with watch mode. |
| `dev:mobile` | Start Expo. |
| `deps:up` | Start Docker Compose Postgres/Redis. |
| `deps:down` | Stop local dependencies. |
| `deps:reset` | Reset local dependencies; must warn before deleting volumes. |
| `db:migrate:dev` | Run Prisma dev migration locally. |
| `db:migrate:deploy` | Run Prisma deploy migrations for staging/prod. |
| `db:seed` | Seed local/staging-safe data. |
| `db:studio` | Open Prisma Studio for local/dev only. |
| `lint` | Lint. |
| `typecheck` | TypeScript checks. |
| `test` | Unit tests. |
| `test:integration` | Integration tests with Postgres/Redis. |
| `build` | Build all packages. |
| `build:web` | Next.js production build. |
| `build:api` | NestJS/API build. |
| `smoke:local` | Local smoke checks after startup. |
| `smoke:staging` | Staging smoke checks after deploy. |

### 2. Local Docker Compose plan

Proposed `docker-compose.yml` services:

| Service | Image | Port | Purpose |
|---|---|---:|---|
| `postgres` | `postgres:16-alpine` | `5432:5432` | Local development database. |
| `redis` | `redis:7-alpine` | `6379:6379` | Local Redis for BullMQ, Socket.IO adapter, locks, cache. |

Recommended local defaults:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: wordle
      POSTGRES_PASSWORD: wordle_local_password
      POSTGRES_DB: wordle_royale_local
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wordle -d wordle_royale_local"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres_data:
  redis_data:
```

Do not commit real production credentials into Compose files. Local passwords can be documented as disposable development values only.

### 3. Environment variable matrix

#### Core app variables

| Variable | Local | Preview | Staging | Production | Notes |
|---|---|---|---|---|---|
| `APP_ENV` | `local` | `preview` | `staging` | `production` | Use explicit app env everywhere. |
| `NODE_ENV` | `development` | `production` | `production` | `production` | Runtime mode. |
| `PORT` | `4000` | provider-set | provider-set | provider-set | API HTTP/Socket.IO port. |
| `PUBLIC_WEB_URL` | `http://localhost:3000` | Vercel preview URL | staging web URL | production web URL | Used for CORS/callbacks. |
| `API_BASE_URL` | `http://localhost:4000/api/v1` | preview/staging URL | staging API URL | production API URL | Used by web/mobile clients. |
| `WS_BASE_URL` | `http://localhost:4000` | preview/staging URL | staging WS URL | production WS URL | Socket.IO base URL. |
| `CORS_ALLOWED_ORIGINS` | localhost web/mobile dev origins | preview + staging | staging web URL | production web URL | Explicit allowlist. |
| `LOG_LEVEL` | `debug` | `info` | `info` | `info` or `warn` | Avoid noisy production logs. |

#### Data services

| Variable | Local | Preview | Staging | Production | Notes |
|---|---|---|---|---|---|
| `DATABASE_URL` | local Compose Postgres | preview/dev DB | staging DB | production DB | Required for API/worker/migrations. |
| `DATABASE_DIRECT_URL` | optional | provider-specific | provider-specific | provider-specific | Needed by some managed providers. |
| `REDIS_URL` | local Compose Redis | preview/dev Redis | staging Redis | production Redis | Required for BullMQ, locks, Socket.IO adapter. |
| `REDIS_KEY_PREFIX` | `wr:local` | `wr:preview:<branch>` | `wr:staging` | `wr:prod` | Production should still use separate Redis. |

#### Auth/session/security

| Variable | Local | Preview | Staging | Production | Notes |
|---|---|---|---|---|---|
| `JWT_ACCESS_SECRET` | local dummy secret | provider secret | provider secret | provider secret | Strong unique value per env. |
| `REFRESH_TOKEN_PEPPER` | local dummy secret | provider secret | provider secret | provider secret | Unique per env. |
| `PASSWORD_HASH_PEPPER` | local dummy secret | provider secret | provider secret | provider secret | If email/password enabled. |
| `COOKIE_DOMAIN` | blank/localhost | preview domain | staging domain | production domain | Only if cookie auth is used. |
| `COOKIE_SECURE` | `false` | `true` | `true` | `true` | Production must be true. |
| `CSRF_SECRET` | local dummy secret | provider secret | provider secret | provider secret | If cookie auth requires CSRF. |

#### Observability

| Variable | Local | Preview | Staging | Production | Notes |
|---|---|---|---|---|---|
| `SENTRY_DSN` | blank or dev DSN | preview DSN/tag | staging DSN/tag | production DSN/tag | Do not fail app if absent locally. |
| `SENTRY_ENVIRONMENT` | `local` | `preview` | `staging` | `production` | Required tag. |
| `SENTRY_RELEASE` | git SHA | git SHA | release SHA | release tag/SHA | Set in CI/CD. |
| `SENTRY_AUTH_TOKEN` | not needed | CI secret | CI secret | CI secret | CI only for source maps/releases. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | optional | optional | optional | Later tracing/metrics if adopted. |

#### Mobile/build variables

| Variable | Local | Preview | Staging | Production | Notes |
|---|---|---|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | local/staging API | preview/staging API | staging API | production API | Expo public client config. |
| `EXPO_PUBLIC_WS_BASE_URL` | local/staging WS | preview/staging WS | staging WS | production WS | Expo public client config. |
| `EXPO_PUBLIC_APP_ENV` | `local` | `preview` | `staging` | `production` | Visible to client. |
| `EXPO_TOKEN` | developer local if needed | CI secret | CI secret | CI secret | Required for EAS automation. |

### 4. Local dev startup workflow

Recommended local startup sequence:

1. Copy environment template:
   - `.env.local.example` to `.env.local`, once such files exist.
2. Start local dependencies:
   - `deps:up` script, expected to wrap `docker compose up -d postgres redis`.
3. Confirm dependencies are healthy:
   - Postgres healthcheck passes.
   - Redis healthcheck passes.
4. Install dependencies with the project package manager.
5. Generate Prisma client.
6. Run local migrations:
   - `db:migrate:dev` for development migrations.
7. Seed local data if seed script exists:
   - `db:seed`.
8. Start API:
   - `dev:api`.
9. Start worker:
   - `dev:worker`.
10. Start web:
    - `dev:web`.
11. Start Expo if mobile work is needed:
    - `dev:mobile`.
12. Run local smoke check:
    - `smoke:local`, once implemented.

Expected local smoke assertions once implemented:

- API `/healthz` returns healthy.
- API `/readyz` confirms Postgres and Redis connectivity.
- Socket.IO connection succeeds.
- Worker heartbeat is recent.
- Queue-health endpoint can report BullMQ status.

### 5. CI workflow outline

Proposed `.github/workflows/pr-checks.yml` jobs:

| Job | Needs Postgres/Redis? | Required before merge? | Purpose |
|---|---:|---:|---|
| `lint` | No | Yes | Formatting/lint rules. |
| `typecheck` | No | Yes | TypeScript validation. |
| `unit-tests` | No | Yes | Pure logic tests: game, scoring, validation, contracts. |
| `integration-tests` | Yes | Yes | API + Prisma + Postgres + Redis + BullMQ integration. |
| `prisma-migration-check` | Yes | Yes | Apply migrations to disposable DB. |
| `web-build` | No | Yes | Next.js production build. |
| `mobile-check` | No | Yes if mobile package exists | Expo config/typecheck. Native builds can be manual/scheduled. |
| `api-build` | No | Yes | NestJS build. |
| `docker-build-api` | No | Yes once Dockerfile exists | Ensures API/worker image builds. |
| `secret-scan` | No | Yes | Prevent committed secrets. |
| `dependency-audit` | No | Advisory initially; required before launch | Dependency vulnerability signal. |

CI service container requirements:

- PostgreSQL 16.
- Redis 7.
- Test env variables must use disposable test credentials.
- CI must not connect to staging or production databases.

Proposed CI stages:

1. Checkout.
2. Setup Node/package manager.
3. Install dependencies with lockfile enforcement.
4. Generate Prisma client.
5. Run lint/typecheck/unit jobs.
6. Start Postgres/Redis service containers for integration jobs.
7. Apply Prisma migrations to CI database.
8. Run integration tests.
9. Build web/API.
10. Upload coverage/test artifacts if configured.

### 6. Staging deployment flow

Provider-specific implementation depends on Fly.io vs Render, but the logical flow should be:

1. Merge to `main` after required PR checks pass.
2. Build web and deploy/promote staging web.
3. Build API/worker image.
4. Deploy API image to staging.
5. Run `prisma migrate deploy` against staging database as a discrete logged step.
6. Deploy worker using the same image/release SHA.
7. Run staging smoke checks.
8. Record release SHA, migration output location, smoke results, and known risks.
9. Jasmine runs staging acceptance matrix before production approval.

Staging should use:

- Separate staging Postgres.
- Separate staging Redis.
- Staging Sentry environment tag.
- Staging web/API/WS URLs.
- No production user data unless explicitly approved and scrubbed.

### 7. Migration/rollback workflow

#### Local development migrations

- Developers use Prisma dev migrations locally.
- Migration files must be committed.
- Avoid editing already-applied shared migrations; create a new migration instead.

#### PR migration checks

- CI applies all migrations to a fresh disposable PostgreSQL database.
- CI should fail if Prisma schema and migration history drift.
- CI should run relevant integration tests after migrations.

#### Staging migrations

- Run `prisma migrate deploy` as part of staging deployment.
- Capture migration logs.
- Run `/readyz` and smoke checks after migration/deploy.

#### Production migrations

- Production migrations require explicit release approval.
- Confirm backup/PITR status before migration.
- Prefer backwards-compatible migrations.
- Deploy sequence should be documented per release.

Safe migration pattern:

1. Add new nullable/backward-compatible column/table.
2. Deploy code that can tolerate both old and new shape.
3. Backfill using monitored worker/script.
4. Switch reads/writes.
5. Remove old shape in a later release.

#### Rollback rules

- **App rollback:** redeploy prior web/API/worker artifact if migration is backward-compatible.
- **Migration rollback:** prefer forward-fix migration; do not rely on destructive down migrations in production.
- **Worker rollback:** pause/scale worker down if rating/finalization jobs are misbehaving.
- **Data repair:** for rating/leaderboard errors, use compensating events/reconciliation rather than deleting audit history.
- **DB restore:** point-in-time restore is last resort and requires explicit approval because it can lose post-restore user activity.

### 8. Health/readiness check requirements for Freya

Freya should implement these backend operational endpoints.

#### `GET /healthz`

Purpose: lightweight liveness check.

Requirements:

- Does not perform expensive dependency checks.
- Returns process alive status.
- Should be safe for load balancers/provider checks.
- Expected healthy response shape:

```json
{
  "status": "ok",
  "service": "api",
  "appEnv": "staging",
  "version": "git-sha-or-release",
  "timestamp": "2026-..."
}
```

#### `GET /readyz`

Purpose: dependency readiness check.

Requirements:

- Checks PostgreSQL connectivity with a cheap query.
- Checks Redis connectivity with ping or equivalent.
- Checks whether required config/secrets are present without exposing values.
- Returns non-2xx if API should not receive traffic.
- Should include dependency statuses but never secret values.

Expected response categories:

```json
{
  "status": "ok",
  "dependencies": {
    "postgres": "ok",
    "redis": "ok"
  },
  "timestamp": "2026-..."
}
```

#### Worker heartbeat/queue health

Options:

1. API endpoint reads worker heartbeat from Redis/Postgres.
2. Worker exposes an internal health endpoint if provider supports private checks.
3. Both.

Recommended V1:

- Worker writes heartbeat key to Redis, e.g. `health:worker:<workerName>` with TTL.
- API `/readyz` may warn but not always fail if worker heartbeat is stale, depending on route criticality.
- Separate queue-health endpoint for operational checks.

Proposed queue health signals:

| Signal | Why it matters |
|---|---|
| Worker heartbeat age | Detect dead worker. |
| Queue depth by queue | Detect stuck processing. |
| Failed job count | Detect rating/finalization failures. |
| Oldest waiting job age | Detect backlog. |
| Dead-letter/retry count | Detect poison jobs. |
| BullMQ Redis connectivity | Detect queue substrate failure. |

Queues expected from architecture:

- Match finalization.
- Rating finalization/application.
- Leaderboard reconciliation.
- Match/lobby expiry cleanup.
- Analytics aggregation/flush if implemented.
- Dictionary activation/admin jobs if needed.

### 9. Release smoke checks

These checks should become scripts where possible, but Jasmine should also use them as QA evidence inputs.

#### API/ops smoke checks

- [ ] API `/healthz` returns healthy.
- [ ] API `/readyz` returns Postgres and Redis healthy.
- [ ] API response includes/request logs include request ID.
- [ ] Socket.IO handshake succeeds against deployed WS URL.
- [ ] Worker heartbeat is current.
- [ ] Queue health endpoint shows no unexpected failed jobs.
- [ ] Sentry release/environment tag is set for deployed version.
- [ ] Logs redact auth headers/tokens/secrets.

#### Product smoke checks

- [ ] User can register/login in staging.
- [ ] User can complete profile/handle flow.
- [ ] User can create casual lobby.
- [ ] Second user can join by code.
- [ ] Lobby ready/start flow works.
- [ ] Round starts with server-authoritative timer.
- [ ] Valid guess is accepted.
- [ ] Invalid guess is rejected without consuming attempt.
- [ ] Disconnect/reconnect triggers snapshot resync.
- [ ] Match completes and report is available to participants.
- [ ] Rating/finalization queue behavior works for rated beta path when enabled.
- [ ] Leaderboard/reconciliation behavior works once implemented.

#### Deployment smoke evidence to capture

- Release SHA/tag.
- Deployed web URL.
- Deployed API/WS URL.
- Migration step result/log path.
- Health/readiness response status.
- Worker heartbeat timestamp.
- Queue health summary.
- Sentry environment/release visible.
- Jasmine QA pass/fail summary.

### 10. Backup/restore rehearsal

Minimum staging rehearsal before production launch:

1. Seed staging-like test data.
2. Confirm managed Postgres backup exists or trigger an approved staging snapshot.
3. Restore backup into a separate restore-test database.
4. Run migrations if needed to reach expected schema.
5. Point a temporary/staging-local API instance at restored DB, or run validation scripts against restored DB.
6. Verify expected users/matches/ratings/dictionary versions exist.
7. Document restore duration and issues.
8. Do not overwrite active staging or production during rehearsal.

Production backup requirements before launch:

- Automated managed PostgreSQL backups enabled.
- PITR enabled if provider supports it within budget.
- Restore process rehearsed in staging.
- Backup/restore responsibilities documented.
- Redis rebuild/reconciliation plan documented.

### 11. Log redaction and secret handling

#### Do not log

- Passwords.
- Password hashes or peppers.
- JWTs.
- Refresh tokens.
- Auth headers.
- OAuth codes/tokens.
- Session cookies.
- API keys.
- Full database URLs.
- Full Redis URLs.
- Apple/Google/Expo credentials.
- Raw free-text sensitive content.

#### Safe to log with care

- Request IDs.
- User IDs where operationally necessary.
- Lobby IDs.
- Match IDs.
- Job IDs.
- Error codes.
- Status transitions.
- Latency/duration metrics.

#### Redaction requirements

- Central logger redacts known sensitive field names.
- Never log entire `process.env`.
- Never log full request headers by default.
- Mask URLs that contain credentials.
- Sentry `beforeSend` should scrub tokens, cookies, auth headers, and known secret fields.

#### Secret handling cautions

- No real secrets in Git.
- No production secrets in local `.env`.
- GitHub Actions production secrets must use protected environments.
- Production secret changes require explicit Ashar approval.
- Rotate secrets only with a rollback plan and downtime/compatibility note.

### 12. Sentry/environment tagging

Required tags/fields:

| Field | Value |
|---|---|
| `environment` | `local`, `preview`, `staging`, `production`. |
| `release` | Git SHA or release tag. |
| `service` | `web`, `api`, `worker`, `mobile-ios`, `mobile-android`. |
| `app.version` | App/package version where available. |
| `runtime` | Node/browser/mobile runtime where useful. |

Recommended Sentry setup:

- Separate projects or at least clear service tags for web/API/worker/mobile.
- Upload source maps from CI only with `SENTRY_AUTH_TOKEN`.
- Do not expose Sentry auth token to runtime clients.
- Configure PII scrubbing before production.
- Alert only on staging/production issues initially to avoid local noise.

## Open Questions

1. Has the repository package manager been chosen: npm, pnpm, yarn, or bun?
2. Will the repo be a monorepo with `apps/web`, `apps/mobile`, `apps/api`, and shared packages?
3. Which provider is preferred for API/WebSocket + worker: Fly.io or Render?
4. Which managed Postgres/Redis providers should be used for staging?
5. Should production deploy automation be implemented now as manual-dispatch only, or deferred until staging proves stable?
6. Should queue-health be public behind auth/admin, internal-only, or exposed only to provider health checks?
7. What are the initial alert thresholds for staging and production?

## Follow-up Tickets

### Follow-up 1

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns tooling/scripts and can implement the local developer automation.
- **Exact task:** Create `docker-compose.yml`, `.env.local.example`, and package scripts for `deps:up`, `deps:down`, `deps:reset`, and `smoke:local` once repo structure/package manager are known.
- **Inputs/context they need:** Ticket 16 Yuna response; locked stack: PostgreSQL 16, Redis 7, NestJS, Prisma, BullMQ.
- **Expected output back to Athena:** Files changed, exact scripts added, and local startup verification evidence.

### Follow-up 2

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/core implementation.
- **Exact task:** Implement NestJS health/readiness module with `/healthz`, `/readyz`, Postgres check, Redis check, config presence check, worker heartbeat read, and queue-health service.
- **Inputs/context they need:** Health/readiness requirements section from this response.
- **Expected output back to Athena:** Endpoint implementation, response examples, tests/commands run, and any operational caveats.

### Follow-up 3

- **Target agent:** Freya
- **Why that agent is needed:** Prisma migration workflow depends on backend schema ownership.
- **Exact task:** Add Prisma migration commands and document safe migration practices in backend README/docs, including CI migration check requirements.
- **Inputs/context they need:** Migration/rollback workflow from this response and Elisa Ticket 10 Prisma amendments.
- **Expected output back to Athena:** Migration scripts/docs, sample local migration verification, and rollback caveats.

### Follow-up 4

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns CI/tooling glue.
- **Exact task:** Create GitHub Actions PR checks for lint, typecheck, unit tests, integration tests with Postgres/Redis services, Prisma migration check, web build, API build, and Docker build once Dockerfile exists.
- **Inputs/context they need:** CI workflow outline from this response and actual package scripts after implementation begins.
- **Expected output back to Athena:** Workflow file(s), exact jobs, and CI run evidence or local action validation if available.

### Follow-up 5

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent acceptance verification.
- **Exact task:** Convert the release smoke checks in this response into a staging smoke/acceptance matrix with evidence fields and pass/fail criteria.
- **Inputs/context they need:** Release smoke checks section from this response, Elisa API contract, and Freya backend health endpoints once implemented.
- **Expected output back to Athena:** QA smoke matrix and release confidence criteria.

### Follow-up 6

- **Target agent:** Yuna
- **Why that agent is needed:** Yuna owns provider-specific deployment and release ops.
- **Exact task:** After Ashar/Athena pick Fly.io or Render and managed Postgres/Redis providers, create provider-specific staging deployment runbook and GitHub Actions staging deploy workflow plan.
- **Inputs/context they need:** Provider decision, repo layout, package scripts, Dockerfile, secret names.
- **Expected output back to Athena:** Provider-specific deployment runbook and CI/CD setup plan.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-16-yuna-local-dev-ci-ops-plan-response.md`

## Tests / Commands Run

No test commands were run — planning/spec task only.

Hermes file tools used:

- Searched for ticket 16 in `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/`.
- Read `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/ticket-16-yuna-local-dev-ci-ops-plan.md`.
- Read `/home/ashar/Desktop/hermes-projects/wordle-royale/docs/2026-06-22-athena-decision-locks-after-tickets-01-10.md`.
- Searched for Ticket 10 response in `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/`.
- Read `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-10-elisa-contract-reconciliation-amendments-response.md`.
- Read relevant prior Ticket 7 response content from `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-07-yuna-infrastructure-deployment-plan-response.md`.

## Evidence / Result

Created the requested Markdown response file at:

`/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-16-yuna-local-dev-ci-ops-plan-response.md`

Acceptance criteria coverage:

1. Proposed file paths/scripts — included.
2. Environment variable matrix — included.
3. Local dev startup workflow — included.
4. CI workflow outline — included.
5. Migration/rollback workflow — included.
6. Health/readiness check requirements for Freya — included.
7. Smoke test checklist for Jasmine — included.
8. Security/secrets cautions — included.
9. Follow-up implementation tickets — included.

## Risks / Blockers

- Repo structure and package manager are not yet confirmed, so file paths/scripts are proposed targets rather than implemented files.
- Provider choice between Fly.io and Render is still open for provider-specific deployment steps.
- Managed Postgres/Redis providers are not selected, so backup/PITR details remain provider-dependent.
- No CI workflows, Docker Compose files, health endpoints, migrations, or smoke scripts were implemented in this ticket.
- No staging or production resources were created.
- No secrets were created, read, rotated, or modified.
