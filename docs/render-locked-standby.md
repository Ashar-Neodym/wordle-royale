# Render Free locked-standby readiness candidate

Status: independently reviewable local candidate only, based exactly on released `origin/main` commit `1755626ce8d7efbe768a6fbe6c12ec119a3327d1`. Provider setup is not authorized. No provider account/login/configuration, payment method, billing, secret, database, deployment, push, or hosted mutation is authorized or performed.

## Narrow eligibility decision

Only **Render Free with no payment method attached** is a candidate for a future, separately owner-approved checkpoint. If Render requires or has a payment method attached, stop: this candidate does not authorize proceeding. The intended Free instance is 512 MB RAM / 0.1 CPU and the workspace allowance is 750 running hours per month. Official Render Free behavior is to suspend Free services rather than bill when Free usage is exhausted; a Free web service spins down after 15 idle minutes and wakes on the next HTTP request or WebSocket connection. This makes cold-start latency expected, not a readiness failure.

Koyeb is disqualified because its signup path requires a card, a $29 hold, and a prorated signup charge. Railway remains retired because it requires paid service. Existing Koyeb/Railway history, migrations, inventory adapters, audit records, and fixtures grant no deployment authority.

## Future service shape (not authorized)

Exactly one Render **Web Service**, Free instance type, with Frankfurt preferred. Use the linked GitHub repository, root `Dockerfile`, Docker runtime, and image `CMD`; Render supports this Docker/GitHub shape and WebSockets. The provider-neutral image reads Render's assigned `PORT`. Configure HTTP health check `GET /healthz`; do not use `/readyz` for liveness. Do not create a database, Redis, web service/static site, auth integration, queue/worker, cron job, or any second service. Do not add migration, seed, bootstrap, or pre-deploy commands.

## Locked environment

A future separately owner-approved service must set exactly these non-secret application variables:

```text
NODE_ENV=production
APP_ENV=preview
API_SURFACE_MODE=standby
DURABLE_AUTH_ENABLED=false
STANDARD_1V1_QUEUE_ENABLED=false
SPEED_1V1_QUEUE_ENABLED=false
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
```

Do not manually set `PORT`; Render assigns it. Render also supplies `RENDER_GIT_COMMIT`, its documented commit SHA, which the API recognizes for immutable public revision reporting. No explicit `GIT_COMMIT_SHA` manifest override is needed. `DATABASE_URL`, `DATABASE_DIRECT_URL`, `REDIS_URL`, `PUBLIC_WEB_URL`, `CORS_ALLOWED_ORIGINS`, and all secrets must remain unset. Standby validation rejects durable auth, queue enablement, or hosted web/CORS binding. Hosted omission or an unknown value of `API_SURFACE_MODE` fails startup. `active` exists only for compatibility, is not authorized here, and retains its existing hosted security/database requirements.

## Exact standby surface

Only these raw request targets pass the first middleware boundary:

- `GET /healthz`
- `GET /readyz`
- `GET /.well-known/wordle-runtime-compatibility`
- `GET /ranked/modes`

Queries, encoded forms, duplicate/trailing slashes, `HEAD`, `OPTIONS`, all mutation methods, auth/profile/history/leaderboard routes, and unknown paths return HTTP 503 with the existing error envelope, code `backend_standby`, message `Backend is in standby mode.`, empty details, and `Cache-Control: no-store`.

`/readyz` reports `unavailable` with every dependency `not_checked_stub`; Render liveness must therefore use `/healthz`. `/ranked/modes` preserves catalog identity but marks every mode disabled and Speed queueing false. Neither route touches database, Redis, auth, dictionary, queue, or reconciler state.

## Build and local verification

```bash
docker build --pull -t wordle-royale-api:standby .
docker run --rm -p 3001:3001 \
  -e NODE_ENV=production -e APP_ENV=preview -e API_SURFACE_MODE=standby \
  -e DURABLE_AUTH_ENABLED=false -e STANDARD_1V1_QUEUE_ENABLED=false \
  -e SPEED_1V1_QUEUE_ENABLED=false -e ENABLE_DEV_AUTH=false \
  -e ENABLE_DEV_ROUTES=false wordle-royale-api:standby
```

Do not add migration execution to this command. Any future schema work requires a separate explicit operator approval and target-specific database context. None is part of this cardless standby candidate.
