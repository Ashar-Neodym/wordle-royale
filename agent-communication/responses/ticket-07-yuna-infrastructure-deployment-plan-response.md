# Ticket 7 — Infrastructure and Deployment Plan — Response

## Summary

Created the operations plan for Wordle Royale covering hosting, deployment, CI/CD, environments, secrets, observability, backup/restore, rollback, WebSocket scaling, app-store readiness, and launch readiness.

Recommended default: **Vercel for Next.js web + Fly.io or Render for the TypeScript API/WebSocket service and worker + managed PostgreSQL + managed Redis**. This is production-capable, understandable for a small team, and avoids forcing a full cloud platform before the product needs it.

No infrastructure was provisioned and no production state was changed.

## Decisions / Recommendations

### Recommended infra stack

| Area | Recommendation | Notes |
|---|---|---|
| Web | Vercel | Best fit for Next.js, preview deploys, CDN, fast rollback. |
| Mobile | Expo + EAS Build/Submit | Standard Expo path for iOS/Android staging and release builds. |
| API/WebSocket | Fly.io or Render | Long-running Node/TypeScript service with WebSocket support. Avoid pure serverless for gameplay WebSockets. |
| Worker | Same API image, separate process | Runs queue jobs, rating finalization, cleanup, leaderboard reconciliation. |
| PostgreSQL | Managed Postgres: Neon, Supabase, Render Postgres, Railway Postgres, Fly Postgres, or RDS later | Use separate staging/prod DBs. Production needs backups/PITR if available. |
| Redis | Managed Redis: Upstash, Redis Cloud, Railway/Render Redis, Fly Redis-compatible service | Used for matchmaking, presence, locks, cache, queues, rate limits, Socket.IO adapter/pubsub. |
| Object storage | Defer unless avatars/uploads are in V1; otherwise Cloudflare R2, S3, or Supabase Storage | Avoid unnecessary scope/cost if no uploads. |
| Error tracking | Sentry | Use separate environments/projects/tags for web, mobile, backend, worker. |
| Logs/metrics | Provider logs + structured JSON logs first; add Better Stack/Grafana/Datadog later if needed | Cost-conscious staged observability. |
| CI/CD | GitHub Actions | PR checks, staging deploy, manual production approval. |

### Alternative low-cost stack

| Area | Low-cost option | Trade-off |
|---|---|---|
| Web | Vercel free/low tier | Good fit for web, but backend still needs always-on runtime. |
| API/WebSocket | Railway or Render starter service, or one small VPS | Cheaper but requires close monitoring of sleep/resource limits and manual ops. |
| Worker | Same provider as API, one small always-on worker | Must not sleep if queue jobs are critical. |
| PostgreSQL | Neon/Supabase/Railway free or low tier for staging/MVP | Check connection limits, backup limits, and restore support. |
| Redis | Upstash free/low tier or provider Redis | Verify BullMQ compatibility/latency before production. |
| Observability | Sentry free tier + provider logs | Lower retention/search/alerting depth. |
| Object storage | Cloudflare R2 or Supabase Storage | Only if uploads are approved for V1. |

Recommendation: launch MVP with managed services, not self-hosted databases, unless cost pressure is extreme and the team accepts more operational work.

## Detailed Output

### Target deployment architecture

```text
Next.js web on Vercel
        │ HTTPS/WSS
        ▼
API + WebSocket service on Fly.io/Render
        │
        ├── PostgreSQL: durable source of truth
        ├── Redis: presence, matchmaking, locks, cache, queues, Socket.IO adapter/pubsub
        └── Worker process: queue jobs, rating finalization, cleanup, reconciliation

Expo mobile apps use the same API_BASE_URL and WS_BASE_URL per environment.
```

Runtime processes:

| Process | Purpose | Scaling |
|---|---|---|
| `web` | Next.js frontend | Vercel-managed. |
| `api` | REST API + WebSocket gateway | Start with one instance; scale horizontally after Redis pub/sub adapter is configured. |
| `worker` | BullMQ/queue jobs, rating finalization, cleanup, analytics flush, leaderboard reconciliation | Start with one worker. Add concurrency carefully. |
| `scheduler` | Periodic cleanup/recompute jobs | Can be worker mode or provider cron. |

### Environment matrix

| Environment | Purpose | Web | API/WS | DB | Redis | Deploy policy |
|---|---|---|---|---|---|---|
| Local | Development | `localhost` | `localhost` API/WS | Local Docker Postgres or dev DB | Local Docker Redis | Manual only. |
| Preview | PR review | Vercel preview URL | Optional preview API; otherwise staging API | Preview/dev DB only, no prod data | Preview/dev Redis namespace | Auto from PR if configured. |
| Staging | Production-like QA | Staging domain/subdomain | Staging API/WS | Separate staging Postgres | Separate staging Redis | Auto from `main` after CI, or manual promotion. |
| Production | Public users | Production domain | Production API/WS | Separate production Postgres | Separate production Redis | Manual approval gate until mature. |

Rules:

- Staging and production must not share PostgreSQL.
- Production Redis should be separate from staging, not only prefix-separated.
- Production secrets must live only in provider secret stores and GitHub protected environments.
- Mobile staging builds must point to staging API/WS; production builds must point to production API/WS.

### Required secrets/env vars

Final names can be adjusted by implementation, but these categories should exist.

#### App/runtime

| Variable | Used by | Purpose |
|---|---|---|
| `APP_ENV` | web/api/worker/mobile build | `local`, `preview`, `staging`, `production`. |
| `NODE_ENV` | Node services | Runtime mode. |
| `PUBLIC_WEB_URL` | api/web | Public web origin. |
| `API_BASE_URL` | web/mobile | REST API URL. |
| `WS_BASE_URL` | web/mobile | WebSocket URL. |
| `CORS_ALLOWED_ORIGINS` | api | Allowed browser origins. |
| `LOG_LEVEL` | api/worker | Runtime logging verbosity. |

#### Data services

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | api/worker/migrations | PostgreSQL connection string. |
| `DATABASE_DIRECT_URL` | migrations, if provider requires it | Direct migration connection. |
| `REDIS_URL` | api/worker | Redis connection string. |
| `REDIS_KEY_PREFIX` | api/worker | Non-prod isolation if sharing Redis. |

#### Auth/security

| Variable | Used by | Purpose |
|---|---|---|
| `JWT_ACCESS_SECRET` or `JWT_PRIVATE_KEY` | api | Access-token signing. |
| `JWT_PUBLIC_KEY` | api/clients if asymmetric | Token verification if asymmetric JWT is used. |
| `REFRESH_TOKEN_PEPPER` | api | Refresh-token hashing hardening. |
| `PASSWORD_HASH_PEPPER` | api | If email/password auth is enabled. |
| `COOKIE_DOMAIN` | api/web | Auth cookie scope if cookies are used. |
| `COOKIE_SECURE` | api/web | Must be true in production. |
| `CSRF_SECRET` | api/web | If cookie-based browser auth is used. |

#### OAuth/email if enabled

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login. |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Sign in with Apple. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord login if selected. |
| `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM` | Verification/password reset emails. |

#### Observability/storage/mobile release

| Variable | Purpose |
|---|---|
| `SENTRY_DSN` | Runtime error reporting. |
| `SENTRY_AUTH_TOKEN` | CI source-map upload only. |
| `POSTHOG_KEY`, `POSTHOG_HOST` | Product analytics if PostHog is selected. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional traces/metrics later. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Upload/avatar storage if enabled. |
| `EXPO_TOKEN`, `EAS_PROJECT_ID` | EAS build/submit automation. |
| Apple/Google Play submission credentials | CI only if automated submission is explicitly approved. |

Secrets rules:

- Commit only `.env.example`, never real `.env` files.
- Use distinct secrets per environment.
- Do not rotate production secrets or configure paid services without explicit approval.
- Production deploy and production secret access should use GitHub protected environments.

### CI/CD pipeline outline

Recommended GitHub Actions jobs:

1. `lint` — ESLint/Prettier/static checks.
2. `typecheck` — TypeScript across web/mobile/backend/shared packages.
3. `unit-tests` — game engine, scoring, rating, shared schemas.
4. `integration-tests` — API tests with PostgreSQL + Redis service containers.
5. `migration-check` — apply migrations to disposable PostgreSQL.
6. `web-build` — Next.js production build.
7. `mobile-check` — Expo config validation and TypeScript checks; full native builds can be manual/scheduled.
8. `docker-build-api` — build API/worker image.
9. `security-scan` — dependency audit and secret scanning.
10. `deploy-preview` — Vercel preview for PRs; backend preview optional.
11. `deploy-staging` — deploy on merge to `main` after green checks.
12. `deploy-production` — manual dispatch or release tag with approval gate.

Minimum required PR gates:

- Lint passes.
- Typecheck passes.
- Unit tests pass.
- Integration tests pass against Postgres + Redis.
- Migration check passes.
- Web build passes.
- API Docker image builds.

### Deployment workflow

#### Local

1. Start local Postgres and Redis, likely via Docker Compose once Ruby/Freya create it.
2. Run migrations locally.
3. Start API dev server.
4. Start worker dev process.
5. Start Next.js web.
6. Start Expo app pointed to local or staging API depending on device networking.

#### Preview

1. Open PR.
2. CI runs lint/typecheck/tests/build/migration checks.
3. Vercel creates web preview.
4. Optional backend preview can deploy if the team decides the added DB/Redis complexity is worth it.

Recommendation for MVP: use **web previews + shared staging API** first. Full per-PR backend previews can be added later.

#### Staging

1. Merge to `main` after green CI/review.
2. Deploy staging web.
3. Build/deploy API image to staging.
4. Run staging DB migrations.
5. Deploy staging worker using same image/version.
6. Run smoke checks:
   - API health endpoint.
   - DB readiness.
   - Redis readiness.
   - WebSocket connect/auth probe.
   - Basic lobby/gameplay flows once implemented.
   - Worker queue health once implemented.
7. Jasmine performs acceptance/regression testing.

#### Production

1. Create release candidate from staging-verified commit.
2. Confirm Jasmine staging sign-off.
3. Confirm backup/PITR status.
4. Confirm migration and rollback notes.
5. Run approved production migration step.
6. Deploy API/WebSocket service.
7. Deploy worker with same image/version.
8. Promote/deploy web.
9. Run production smoke checks.
10. Monitor errors, latency, WebSocket health, queue failures, match finalization, and ratings during launch window.

### Database migrations

Recommendations:

- Use Prisma or Drizzle migration tooling after Elisa/Freya finalize the stack.
- Every migration is committed and reviewed.
- CI applies migrations to disposable PostgreSQL.
- Production migrations run as a separate logged deploy step.
- Prefer backward-compatible migrations.

Safe schema-change pattern:

1. Add new schema in a backward-compatible way.
2. Deploy code that can read/write both old and new shape if needed.
3. Backfill with monitored job.
4. Switch reads to new shape.
5. Remove old schema in later release.

### Rollback strategy

#### Web

- Use Vercel rollback/promote previous deployment.
- Keep backend API compatible with at least one previous web/mobile version.

#### API/WebSocket

- Roll back to previous image/deployment if error rate, auth failures, WebSocket failures, or gameplay failures spike.
- Migrations must be backward-compatible to make API rollback safe.

#### Worker

- Roll worker back to same previous image as API when possible.
- If worker jobs corrupt ratings/leaderboards, scale worker to zero/pause queue processing and preserve raw match data for repair.

#### Database

- Prefer forward-fix migrations.
- Use point-in-time restore only as last resort because it can lose post-restore-point user activity.
- For rating bugs, use compensating rating events/reconciliation rather than full DB restore if match data is intact.

#### Redis

- Redis is not source of truth.
- If Redis is corrupted/flushed, active lobbies/matches may be disrupted, but durable records should be reconstructed from PostgreSQL where possible.
- Build cache/leaderboard rebuild jobs before production launch.

### Backup/restore plan

| Component | Backup | Restore |
|---|---|---|
| PostgreSQL | Managed automated backups; PITR preferred for production | Restore to new DB, verify, then repoint after approval. |
| Redis | Treat mostly ephemeral; optional snapshots if provider supports | Rebuild from PostgreSQL/cache jobs. |
| Object storage | Bucket versioning/lifecycle if uploads exist | Restore object versions or bucket copy. |
| Secrets | Provider secret stores + inventory, not plaintext backup | Rotate/recreate through provider after approval. |
| App artifacts | Git tags, Docker image digests, Vercel deployments, EAS builds | Redeploy previous artifact. |

Minimum launch requirements:

- Production Postgres backups enabled.
- Restore rehearsal completed in staging before launch.
- Release artifacts are traceable to commit/image/tag.
- Migration logs are retained.

### Monitoring, error tracking, logging, and alerting

Required checks:

| Check | Purpose |
|---|---|
| `GET /healthz` | Process liveness. |
| `GET /readyz` | DB/Redis readiness. |
| WebSocket probe | Confirms WS handshake and auth flow. |
| Worker heartbeat | Confirms jobs are being processed/polled. |
| Queue failed/depth metrics | Detect stuck rating/finalization jobs. |

Track:

- API request rate, p95/p99 latency, 4xx/5xx rate.
- WebSocket active connections, reconnects, handshake failures, room join failures.
- Guess submission latency and rejection reasons.
- Round/match finalization failures.
- Matchmaking queue depth, wait time, timeout rate.
- Rating job failures and duplicate/conflict attempts.
- Leaderboard reconciliation drift.
- PostgreSQL connections, storage, slow queries.
- Redis memory, evictions, latency, connection count.
- Worker throughput, retries, failed/dead-letter jobs.
- Sentry issues and crash-free sessions for web/mobile/backend.

Initial alerts:

- API 5xx spike.
- API p95 latency above target.
- WebSocket connection failures spike.
- Worker heartbeat missing.
- Queue failed jobs above threshold.
- Any production match/rating finalization failure.
- PostgreSQL storage near limit.
- Redis evictions/memory pressure.
- New critical Sentry issue in production.

Logging requirements:

- Structured JSON logs.
- Include request IDs.
- Include safe correlation IDs: `userId`, `lobbyId`, `matchId`, `jobId`, `socketId` where appropriate.
- Never log tokens, passwords, refresh tokens, secrets, full auth headers, or sensitive user content.

### WebSocket scaling notes

- Use Socket.IO for V1 unless Elisa/Athena choose raw WebSockets for a specific reason.
- Use Redis adapter/pubsub before running more than one API instance.
- Do not store authoritative lobby/match state only in process memory.
- Use PostgreSQL for durable records and Redis for active state/cache/locks.
- Use snapshot-based reconnect/resync for V1 instead of guaranteed event replay.
- Use per-match/per-round locks and idempotency keys for guess submission and state transitions.
- Avoid per-second timer broadcasts; send server timestamps and let clients render countdowns.
- Confirm provider/load-balancer WebSocket idle timeouts.

Operational warning: multiple API instances without correct Redis pub/sub can cause players in the same lobby/match to miss events.

### App-store readiness checklist

#### Expo/EAS

- [ ] Stable app identifiers configured.
- [ ] EAS project created.
- [ ] Separate staging/internal and production build profiles.
- [ ] Version/build number policy documented.
- [ ] Staging builds point to staging API/WS.
- [ ] Production builds point to production API/WS.
- [ ] OTA update policy decided.

#### iOS

- [ ] Apple Developer account available.
- [ ] Bundle ID reserved.
- [ ] App Store Connect app record created.
- [ ] Sign in with Apple configured if policy requires it due to other third-party login.
- [ ] Privacy nutrition labels drafted.
- [ ] Account deletion path available if accounts exist.
- [ ] TestFlight internal testing configured.
- [ ] Screenshots and metadata prepared.

#### Android

- [ ] Google Play Console account available.
- [ ] Application ID reserved.
- [ ] Play App Signing configured.
- [ ] Internal testing track configured.
- [ ] Data safety form drafted.
- [ ] Target SDK/permissions reviewed.
- [ ] Screenshots and metadata prepared.

#### Policy/product

- [ ] Privacy policy URL.
- [ ] Terms of service URL.
- [ ] Support/contact email.
- [ ] Account deletion flow.
- [ ] Age rating questionnaire.
- [ ] Analytics consent behavior matches product/legal decisions.
- [ ] Reporting/moderation flow if public profiles/handles/social features are included.

### Production launch checklist

#### Infrastructure

- [ ] Production domain and TLS active.
- [ ] Production Postgres provisioned.
- [ ] Production Redis provisioned.
- [ ] Production backups/PITR enabled.
- [ ] Restore rehearsal completed in staging.
- [ ] Production secrets in protected stores.
- [ ] API/worker health checks configured.
- [ ] WebSocket timeout/load-balancer settings verified.

#### CI/CD

- [ ] Required PR checks enabled.
- [ ] Production deploy has manual approval gate.
- [ ] Release tags/image digests used.
- [ ] Migration check exists in CI.
- [ ] Rollback procedure documented.

#### Backend/ops

- [ ] `/healthz` and `/readyz` implemented.
- [ ] DB/Redis readiness checks implemented.
- [ ] Structured request IDs/logs implemented.
- [ ] Sentry configured.
- [ ] Rate limits enabled for auth, guesses, lobby creation, and abuse-prone endpoints.
- [ ] Worker heartbeat exists.
- [ ] Queue failures visible.
- [ ] Rating finalization idempotency verified.
- [ ] Leaderboard reconciliation exists.

#### Web/mobile/QA

- [ ] Web production build verified.
- [ ] Mobile staging build tested.
- [ ] TestFlight/internal Play testing completed.
- [ ] WebSocket reconnect/resync verified.
- [ ] Lobby create/join/start verified.
- [ ] Gameplay and scoring verified.
- [ ] Rating/leaderboard finalization verified.
- [ ] Privacy/terms/support links accessible.
- [ ] Jasmine signs off on staging regression matrix.
- [ ] Launch monitoring owner identified.

### Cost estimate ranges

Planning ranges only; these are not provider quotes.

| Stage | Monthly range | Notes |
|---|---:|---|
| Prototype/local | $0–$25 | Free tiers and local Docker. |
| MVP staging | $20–$100 | Small managed Postgres/Redis + one API/worker runtime. |
| Early production | $75–$300 | Separate staging/prod data stores, always-on API/worker, basic observability. |
| Growing real-time usage | $300–$1,000+ | Multiple API instances, larger DB/Redis, better logs/metrics, more mobile build volume. |

Cost controls:

- Start in one region.
- Start with one API instance and one worker.
- Defer object storage unless uploads are in V1.
- Limit log retention.
- Use smaller staging resources than production.
- Add full backend preview environments only if QA/dev velocity needs them.

## Open Questions

1. Backend framework: NestJS or Fastify?
2. ORM/migrations: Prisma or Drizzle?
3. WebSocket library: Socket.IO or raw WS?
4. Are avatars/uploads in V1, or can object storage be deferred?
5. Which auth methods are V1: email/password, Google, Apple, Discord, magic link, guest?
6. Is the launch posture lowest-cost MVP or production-polished from day one?
7. Are backend preview environments required per PR, or is web preview + shared staging API enough?
8. Should App Store / Play Store submission be manual first, or automated later after approval?
9. Will public launch include moderation/admin tooling on day one?

## Follow-up Tickets

### Follow-up 1

- **Target agent:** Athena
- **Why that agent is needed:** Deployment scope depends on MVP launch posture and sequencing.
- **Exact task:** Decide low-cost MVP vs production-polished launch, whether backend PR previews are required, and whether uploads/object storage are in V1.
- **Inputs/context they need:** This Yuna infrastructure plan and Elisa architecture/API response.
- **Expected output back to Athena:** Approved deployment posture and environment strategy.

### Follow-up 2

- **Target agent:** Elisa
- **Why that agent is needed:** Ops needs final architecture decisions before provider-specific setup.
- **Exact task:** Confirm backend framework, ORM/migration tool, WebSocket library, and queue implementation.
- **Inputs/context they need:** This plan’s assumptions: Node/TypeScript, PostgreSQL, Redis, Socket.IO recommended for V1, BullMQ-style jobs.
- **Expected output back to Athena:** Final stack decision note.

### Follow-up 3

- **Target agent:** Freya
- **Why that agent is needed:** Backend must implement operational primitives.
- **Exact task:** Add `/healthz`, `/readyz`, DB/Redis readiness checks, structured request IDs, worker heartbeat, queue metrics, migration command, idempotent rating finalization, and leaderboard reconciliation hooks.
- **Inputs/context they need:** Monitoring, CI/CD, migration, and worker sections of this plan.
- **Expected output back to Athena:** Backend operational-readiness implementation plan or completed work evidence.

### Follow-up 4

- **Target agent:** Ruby
- **Why that agent is needed:** Tooling can reduce setup/release risk.
- **Exact task:** Create scripts/specs for local Docker Compose, migration dry-run, DB restore rehearsal, Redis cache rebuild, and release smoke checks.
- **Inputs/context they need:** Environment matrix, migration plan, backup/restore plan, production launch checklist.
- **Expected output back to Athena:** Tooling ticket breakdown or implemented scripts when assigned.

### Follow-up 5

- **Target agent:** Jasmine
- **Why that agent is needed:** Production readiness requires independent QA gates.
- **Exact task:** Convert staging and launch checklists into a QA acceptance matrix including WebSocket reconnect, lobby lifecycle, gameplay, rating finalization, and mobile staging builds.
- **Inputs/context they need:** This response plus Elisa API/WebSocket contract.
- **Expected output back to Athena:** QA release-readiness matrix.

### Follow-up 6

- **Target agent:** Luna
- **Why that agent is needed:** Client apps need environment-safe config and release UX.
- **Exact task:** Define frontend/mobile environment config for staging vs production API/WS URLs, privacy/terms/support links, downtime handling, and reconnect UX.
- **Inputs/context they need:** Environment matrix, app-store checklist, WebSocket reconnect notes.
- **Expected output back to Athena:** Client runtime config/release-readiness notes.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-07-yuna-infrastructure-deployment-plan-response.md`

## Tests / Commands Run

No test commands were run — planning/spec task only.

Hermes file tools used:

- Read `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/ticket-07-yuna-infrastructure-deployment-plan.md`.
- Listed existing response files in `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/`.
- Read the deployment/scaling section of `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-02-elisa-architecture-api-response.md`.
- Created `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-07-yuna-infrastructure-deployment-plan-response.md`.

## Evidence / Result

The Markdown response file was created at:

`/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-07-yuna-infrastructure-deployment-plan-response.md`

Acceptance criteria coverage:

1. Recommended infra stack — included.
2. Alternative low-cost stack — included.
3. Environment matrix — included.
4. Required secrets/env vars — included.
5. CI/CD pipeline outline — included.
6. Deployment workflow — included.
7. Rollback strategy — included.
8. Backup/restore plan — included.
9. Monitoring/alerting plan — included.
10. WebSocket scaling notes — included.
11. App-store readiness checklist — included.
12. Production launch checklist — included.
13. Cost estimate ranges — included as planning ranges.
14. Follow-up setup tickets — included.

## Risks / Blockers

- Provider choice is recommended but not approved.
- Cost ranges are estimates, not provider quotes.
- Backend framework, ORM/migration tool, WebSocket library, auth methods, and upload/avatar scope remain open.
- No production deployment, secret change, paid resource creation, or environment mutation was performed.
- Backup/restore and rollback procedures must be tested once real infrastructure exists.
