# Koyeb-compatible locked standby checkpoint

Status: implementation checkpoint only. No provider account, billing, secret, database, deployment, push, or hosted mutation is authorized or performed.

## Eligible target and retired target

Koyeb is the eligible long-running API target for the next separately approved hosted checkpoint. Railway is retired as an eligible target because it requires paid service. Existing Railway migrations, inventory adapters, audit records, fixtures, and historical reports remain preserved as history; they do not authorize reuse or deployment. Provider fleet adapter replacement is deferred.

The image is provider-neutral and reads the provider-assigned `PORT`. Koyeb should use root `Dockerfile`, the image `CMD`, and HTTP health check `GET /healthz`. There is deliberately no migration, seed, bootstrap, queue worker command, or web deployment in the entrypoint.

## Locked environment

A future owner-approved standby service must set only non-secret runtime controls such as:

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

`DATABASE_URL`, `REDIS_URL`, `PUBLIC_WEB_URL`, and `CORS_ALLOWED_ORIGINS` are unnecessary and should remain unset. Standby validation rejects durable auth, queue enablement, or hosted web/CORS binding. Hosted omission or an unknown value of `API_SURFACE_MODE` fails startup. `active` exists to preserve the prior API contract but is not authorized by this checkpoint and retains its existing hosted security/database requirements.

## Exact standby surface

Only these raw request targets pass the first middleware boundary:

- `GET /healthz`
- `GET /readyz`
- `GET /.well-known/wordle-runtime-compatibility`
- `GET /ranked/modes`

Queries, encoded forms, duplicate/trailing slashes, `HEAD`, `OPTIONS`, all mutation methods, auth/profile/history/leaderboard routes, and unknown paths return HTTP 503 with the existing error envelope, code `backend_standby`, message `Backend is in standby mode.`, empty details, and `Cache-Control: no-store`.

`/readyz` reports `unavailable` with every dependency `not_checked_stub`; Koyeb liveness should therefore use `/healthz`. `/ranked/modes` preserves catalog identity but marks every mode disabled and Speed queueing false. Neither route touches database, Redis, auth, dictionary, queue, or reconciler state.

## Build and local verification

```bash
docker build --pull -t wordle-royale-api:standby .
docker run --rm -p 3001:3001 \
  -e NODE_ENV=production -e APP_ENV=preview -e API_SURFACE_MODE=standby \
  -e DURABLE_AUTH_ENABLED=false -e STANDARD_1V1_QUEUE_ENABLED=false \
  -e SPEED_1V1_QUEUE_ENABLED=false -e ENABLE_DEV_AUTH=false \
  -e ENABLE_DEV_ROUTES=false wordle-royale-api:standby
```

Do not add migration execution to this command. Any future schema work requires a separate explicit operator approval and target-specific database context.
