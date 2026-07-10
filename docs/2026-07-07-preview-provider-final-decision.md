# Preview provider final decision and approval gate — Wave O

Date: 2026-07-07
Owner: Elisa
Ticket: 103 — Preview Provider Final Decision and Approval Gate
Status: revised decision-only; no provisioning/deployment/secrets

## Executive decision

Athena revised the Wave O direction after Ashar clarified the desired long-term shape. Ticket 103 is revised to match it.

For the first controlled hosted public preview, use this provider route:

| Component | Final target | Decision |
|---|---|---|
| Web | **Vercel** project for the Next.js web app | Approved recommendation for provisioning only after Ashar explicitly approves. |
| API | **Separate long-running Node/Nest API server** | Keep the backend as an authoritative server process. Yuna should preflight the cheapest acceptable long-running host before provisioning. Render remains acceptable, but not locked if another free/cheap long-running host is better. |
| Postgres | **Supabase Postgres first** | Use Ashar's Supabase/free account context first. Treat Supabase as managed Postgres for this phase, not as app auth/business-logic infrastructure. |
| Postgres fallback | **Neon Postgres** | Fallback only if Supabase cannot satisfy preview requirements, free-tier limits, connection handling, or migration needs. |
| Redis | **Omit initially** with `REDIS_REQUIRED=false` and no `REDIS_URL` | Approved for first preview. Add Redis later only when a real runtime requirement needs it and Ashar approves. |
| Mobile | **No public mobile deployment**; Expo Go/manual smoke only | Keep caveat visible until physical smoke is completed. |

This route is intentionally simple but not toy-shaped: Vercel serves the web client, a separate API owns authority and secrets, and Postgres remains provider-portable. It supports a path toward thousands of concurrent users without prematurely buying infrastructure before the preview proves product demand.

## Scale posture: preview now, robust product path preserved

Ashar's target is a large competitive app, potentially with thousands of people active at the same time. The architecture should therefore avoid decisions that trap the app in a serverless-only or single-process-only shape.

### What Wave O should optimize for

- **Correct product architecture:** web client + authoritative API + managed Postgres.
- **Provider portability:** standard Postgres and Node process contracts, not provider-specific business logic.
- **Low initial spend:** free/cheap controlled preview until traffic justifies upgrades.
- **Clean upgrade path:** scale API horizontally, upgrade Postgres/pooling, and add Redis/realtime infrastructure when actual traffic demands it.

### What Wave O should not promise

- The first free/cheap preview is **not** a guarantee for thousands of simultaneous users.
- Free tiers may sleep, throttle, cap connections, or pause compute.
- Demo sessions and preview data remain non-production durability.
- Production-scale anti-abuse, observability, queues, realtime fanout, and load testing are later waves.

### Robust end-state direction

When traffic grows, keep the same boundaries and scale each layer independently:

1. **Web/CDN:** Vercel handles static/Next web delivery and edge caching where safe.
2. **API:** run multiple stateless Nest API instances behind the host/load balancer; never store critical match/session state only in process memory for production.
3. **Database:** Supabase Postgres can start the preview; use connection pooling, indexes, query budgets, and plan upgrades when concurrency rises. Neon remains a viable Postgres fallback/migration target.
4. **Redis or equivalent:** add later for rate limits, ephemeral match/lobby coordination, pub/sub, queueing, cache, or durable preview sessions if required.
5. **Realtime:** keep WebSocket/SSE decisions attached to the long-running API/server boundary, not Vercel serverless.
6. **Observability:** add logs/metrics/tracing and synthetic checks before large public traffic.
7. **Load testing:** before a broad launch, run staged load tests against API endpoints and DB queries with realistic lobby/ranked flows.

## Why this route

### Web — Vercel

Use Vercel for the web app because it is the simplest fit for the current Next.js app and supports the expected preview-web shape:

- repo-connected Next.js build;
- public environment variable support for `NEXT_PUBLIC_API_URL`;
- easy rollback/redeploy from a known commit;
- CDN-backed web delivery that can scale separately from the API.

Required web env after approval:

```text
NEXT_PUBLIC_API_URL=https://<preview-api-host>
NEXT_PUBLIC_APP_ENV=preview
PUBLIC_WEB_URL=https://<preview-web-host>
```

Do not include `/api/v1` in `NEXT_PUBLIC_API_URL`; current clients append root-level API paths.

### API — separate long-running Node/Nest service

Keep the API as a long-running Nest service with an existing production build/start path. The first preview should not force the Nest API into Vercel serverless.

Yuna should choose the exact long-running host through Ticket 104 preflight. Acceptable candidates include Render/Fly/Railway or an equivalent provider if it satisfies these requirements:

- supports a long-running Node process;
- supports repo-connected deploys or reproducible deploy command;
- supports provider env/secret storage;
- supports HTTPS public URL;
- supports `/healthz` and `/readyz` health checks;
- has a free/cheap setting Ashar approves;
- can later scale beyond one instance without changing client/API contracts.

Render remains an acceptable first controlled-preview host if it wins the preflight, but Ticket 103 no longer locks Render as the only API provider.

Required API build/start commands after approval:

```bash
pnpm install --frozen-lockfile
pnpm --filter @wordle-royale/api db:generate
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api start
```

Provider health checks should use:

```text
/healthz
/readyz
```

Required API env shape after approval:

```text
APP_ENV=preview
NODE_ENV=production
AUTH_MODE=preview_demo_session
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
COOKIE_SECURE=true
PUBLIC_WEB_URL=https://<preview-web-host>
API_BASE_URL=https://<preview-api-host>
CORS_ALLOWED_ORIGINS=https://<preview-web-host>
DATABASE_URL=<supabase-preview-pooled-postgres-url>
DATABASE_DIRECT_URL=<supabase-preview-direct-postgres-url-if-needed-for-migrations>
REDIS_REQUIRED=false
PREVIEW_DEMO_SESSION_TTL_SECONDS=7200
```

No real values belong in repo docs, committed files, or chat. Yuna should record provider project IDs and URLs only after provisioning is approved.

### Postgres — Supabase first, Neon fallback

Use Supabase Postgres first because Ashar already has account/context there and it keeps the preview on standard managed Postgres. Do not treat this as approval to adopt Supabase Auth, storage, realtime, edge functions, or vendor-specific app services.

Preview DB policy:

- isolate from local and future production;
- no imported private/production data;
- migrations only after confirming the connection string targets preview;
- use pooled connection URL for app runtime if Supabase provides it;
- use direct connection URL only where Prisma migrations require it;
- preview data may reset;
- ratings/lobbies/matches created during preview are not production-durable.

Neon fallback is allowed only if Supabase preflight fails or creates unacceptable risk/cost. Examples:

- no usable free/cheap preview project/database is available;
- connection limits/pooling do not fit the hosted API;
- Prisma migration requirements cannot be satisfied cleanly;
- account/ownership/secrets handling is blocked;
- Supabase settings would require unapproved paid commitment.

Migration commands after approval:

```bash
pnpm --filter @wordle-royale/api db:validate
pnpm --filter @wordle-royale/api db:generate
pnpm --filter @wordle-royale/api db:migrate:deploy
```

### Redis — omit initially

Final Redis decision for first hosted preview:

```text
REDIS_REQUIRED=false
REDIS_URL=<unset>
```

Rationale:

- Ticket 99 made Redis optional for readiness when not product-critical.
- Preview demo sessions are currently in-memory/non-durable and do not require Redis.
- Adding Redis now increases provider/account/cost/secret surface without first-preview product value.
- `/readyz` can remain provider-friendly with DB OK and Redis reported as skipped/not required.

Redis is a likely production-scale dependency, but not a first-preview dependency. Add it later when one of these becomes true:

- rate limiting must work across multiple API instances;
- WebSocket/SSE fanout or lobby presence needs shared state/pub-sub;
- background jobs/queues are introduced;
- preview/demo sessions must survive API restarts/redeploys;
- cache pressure justifies a separate cache layer;
- Ashar approves adding a Redis-compatible provider and any related cost/secret.

If Redis is later added, use a preview-specific key prefix such as:

```text
REDIS_KEY_PREFIX=wr:preview
```

## Cost posture

Target posture: **free/cheap controlled preview; no paid commitment without explicit approval.**

Cost/spend risks to call out before provisioning:

- Vercel may have bandwidth/build/function limits depending on account/project settings.
- The selected API host may sleep, cold-start, require account verification, or require paid settings for always-on behavior.
- Supabase may have database size, project pause, connection, egress, or compute limits on the free tier.
- Neon fallback may have compute/storage/branching limits or pause behavior on free tiers.
- Provider egress/log retention/custom domains/always-on settings can create spend.
- Redis is intentionally omitted to avoid another provider/cost surface.
- No paid observability, analytics, auth, email, anti-abuse, or monitoring service is approved.

Controlled-preview copy must tolerate free-tier limitations: cold starts, intermittent availability, data reset, and no durable accounts.

## Human approval checklist before Yuna provisions anything

Yuna must not provision or deploy until Ashar explicitly approves this checklist.

Ashar approval should name:

1. **Web provider:** Vercel.
2. **API provider:** separate long-running Node/Nest API host selected through preflight.
3. **Database provider:** Supabase Postgres first.
4. **Database fallback:** Neon Postgres only if Supabase is blocked or unsafe.
5. **Redis:** omitted initially with `REDIS_REQUIRED=false` and no `REDIS_URL`.
6. **Branch/source:** deploy from reviewed/merged `main` unless Athena explicitly approves a temporary preview branch.
7. **Cost posture:** free/cheap only; no paid plan, always-on upgrade, paid add-on, custom domain purchase, or subscription without separate approval.
8. **Secrets policy:** provider env/secret store only; no real `.env` files; no secrets in repo or chat.
9. **Data policy:** preview database only; no production/private data; preview ratings/lobbies/matches may reset.
10. **Auth policy:** preview demo sessions only; no durable accounts, passwords, OAuth, magic links, or account recovery.
11. **Redis policy:** omitted unless later explicitly approved.
12. **Mobile policy:** no public mobile preview claim; Expo Go/manual smoke only.
13. **Rollback owner:** Yuna records provider rollback handles/URLs after provisioning, without secret values.

Recommended explicit approval phrase:

```text
I approve Wave O provisioning for Wordle Royale preview using Vercel web, Supabase Postgres first with Neon fallback only if Supabase is blocked, a separate long-running Node API host selected from the free/cheap option verified by Yuna, and no Redis initially (`REDIS_REQUIRED=false`). Use free/cheap settings only, store secrets only in provider env stores, and do not add paid plans/custom domains without asking me again.
```

Without a statement equivalent to that approval, Ticket 105 remains blocked.

## What Ticket 104 should verify before Ticket 105

Yuna should complete a provisioning preflight that confirms:

- accounts/access are available for Vercel and Supabase;
- exact candidate API host is selected from free/cheap long-running Node providers;
- Supabase preview DB can provide the needed pooled runtime URL and direct migration URL if required;
- Supabase limits and pause/connection behavior are acceptable for controlled preview;
- Neon fallback criteria are documented but not used unless Supabase fails preflight;
- each provider can use the selected repo/branch;
- build/start/migration commands fit provider settings;
- `NEXT_PUBLIC_API_URL`, `PUBLIC_WEB_URL`, and `CORS_ALLOWED_ORIGINS` will use host origins without `/api/v1`;
- API host health checks can hit `/readyz` or `/healthz`;
- database connection strings are stored only in provider env;
- migration command targets only the preview DB;
- no Redis resource is created unless the plan changes;
- rollback path exists for web/API and preview DB reset;
- any non-free setting is blocked pending Ashar approval.

## What Ticket 105 may do after explicit approval

If Ashar approves, Yuna may provision only:

- one Vercel preview web project;
- one separate long-running preview API service;
- one Supabase preview Postgres database/project;
- Neon preview Postgres only as fallback if Supabase is blocked and the fallback is recorded;
- provider env vars/secrets required for those services;
- no Redis resource initially.

Ticket 105 must still not:

- purchase domains;
- upgrade paid plans;
- enable paid observability/analytics/email/auth;
- create production resources;
- use real user data;
- create durable account-auth providers;
- claim mobile public-preview readiness;
- claim the free/cheap preview is production-scale for thousands of concurrent users.

## Final locks

1. **Provider route locked:** Vercel web + Supabase Postgres first + separate long-running Node/Nest API server.
2. **Fallback locked:** Neon is fallback only, not first choice.
3. **API boundary locked:** do not move the Nest API into Vercel serverless as part of Wave O.
4. **Redis locked out initially:** `REDIS_REQUIRED=false`, no `REDIS_URL`, no Redis provider.
5. **Preview remains demo-only:** no durable auth/account launch.
6. **Scale direction preserved:** architecture can grow to thousands of concurrent users by scaling API, Postgres/pooling, Redis/realtime, observability, and load testing in later waves.
7. **Approval gate remains hard:** no provisioning/deployment/secrets until Ashar explicitly approves provider/resource/secret creation.
8. **Cost gate remains hard:** no paid resources or paid plan settings without separate approval.
