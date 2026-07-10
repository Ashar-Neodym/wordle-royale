# Hosted Preview Migration/Readiness Hardening — Wave P

Date: 2026-07-09
Owner: Yuna
Ticket: 114 — Hosted Preview Migration/Readiness Hardening
Status: recommendation/runbook only; no provider changes performed

## Purpose

Wave O proved the hosted preview could look healthy at `/readyz` while product endpoints still failed because the Supabase schema migration had not been applied yet.

This document prevents that failure mode from recurring by defining:

1. the Railway migration policy for preview deploys;
2. the hosted preview smoke checklist that must include migration status;
3. the recommended readiness hardening follow-up so `/readyz` checks application schema/table availability, not only database connectivity.

## Current hosted preview context

From Athena/Jasmine evidence:

| Surface | Current preview |
|---|---|
| Web | `https://wordle-royale-web.vercel.app` |
| API | `https://wordle-royaleapi-production.up.railway.app` |
| Database | Supabase Postgres, `wordle-royale-preview-postgres` |
| Redis | omitted intentionally with `REDIS_REQUIRED=false` |

Observed incident:

```text
/readyz=ok,database=ok
POST /auth/preview-demo/start=500
GET /lobbies=500
GET /leaderboard=500
```

Root cause:

```text
Supabase schema migration had not been applied.
```

Fix that resolved it:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Observed migration:

```text
20260623000000_initial_schema applied
```

## Recommended Railway migration policy

### Decision

For the controlled hosted preview, use a Railway pre-deploy migration command for the API service when Railway account/UI access is available:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

This should run after install/build context is available and before the new API deployment is promoted to serve traffic.

If Railway pre-deploy command configuration is unavailable in the current account/project, use the manual fallback below and mark every deploy as blocked until migration status is verified.

### Why pre-deploy is preferred

- It binds schema deployment to each API deploy, reducing operator memory failures.
- Prisma `migrate deploy` is designed for deployed environments and applies only pending checked-in migrations.
- It prevents a false-safe state where DB connectivity passes but app routes fail due missing tables.
- It is safer than putting migration execution inside the API start command, which can re-run on restarts/scale events and couple boot reliability to migration locking.

### Provider setting to configure later

In the Railway API service, set the API service's pre-deploy command to:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Keep the API start command as:

```bash
pnpm --filter @wordle-royale/api start
```

Keep the build command as currently documented for the preview:

```bash
pnpm install --frozen-lockfile && pnpm --filter @wordle-royale/api db:generate && pnpm --filter @wordle-royale/api build
```

Do **not** append migrations to the start command unless Railway pre-deploy and manual one-off jobs are both unavailable and Athena/Ashar explicitly accept the restart/scale risk.

## Manual fallback runbook

Use this only if Railway pre-deploy command configuration is unavailable or temporarily disabled.

### Before deploying API changes

1. Confirm the target is the preview DB, not local or future production.
2. Confirm `DATABASE_URL`/`DATABASE_DIRECT_URL` are set only in Railway/Supabase/provider secret stores.
3. Confirm no real `.env`/`.env.local` files exist in the repo.
4. Run local gates:

```bash
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

5. In Railway, run the one-off command against the API service environment before redeploy/promote:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

6. Record non-secret evidence only:

```text
migration command: pnpm --filter @wordle-royale/api db:migrate:deploy
result: <applied migration names or "No pending migrations">
target: preview Supabase project/database name only, no URL/secret
time: <UTC timestamp>
operator: <name/tool>
```

### After deploying API changes

Run the hosted smoke checklist below. Do not treat `/readyz` alone as sufficient.

## Hosted preview smoke checklist with migration status

Use after every hosted API deploy and after any Supabase reset/restore/migration change.

Set variables locally without persisting secrets:

```bash
API="https://wordle-royaleapi-production.up.railway.app"
WEB="https://wordle-royale-web.vercel.app"
COOKIE_JAR="$(mktemp)"
```

### 1. Migration status evidence

Required evidence from Railway/Supabase logs or one-off command output:

```text
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Acceptable results:

```text
No pending migrations to apply.
```

or:

```text
<expected migration name> applied
```

For the current preview baseline, expected migration history includes:

```text
20260623000000_initial_schema
```

### 2. Health and readiness

```bash
curl -fsS "$API/healthz"
curl -fsS "$API/readyz"
```

Required result:

```text
status=ok
dependencies.database.status=ok
Redis omitted/optional, not blocking readiness
```

### 3. Schema-backed endpoint smoke

These endpoints must pass because they exercise application tables, not just TCP/database connectivity:

```bash
curl -fsS "$API/lobbies" >/tmp/wordle-royale-preview-lobbies.json
curl -fsS "$API/leaderboard" >/tmp/wordle-royale-preview-leaderboard.json
```

Required result:

```text
HTTP 200 for /lobbies
HTTP 200 for /leaderboard
```

### 4. Preview demo session smoke

```bash
curl -fsS -i \
  -c "$COOKIE_JAR" \
  -H "Origin: $WEB" \
  -H "Content-Type: application/json" \
  -X POST "$API/auth/preview-demo/start"

curl -fsS \
  -b "$COOKIE_JAR" \
  -H "Origin: $WEB" \
  "$API/auth/me"
```

Required result:

```text
POST /auth/preview-demo/start returns 201 or documented success status
GET /auth/me returns the preview demo/current-user envelope
```

### 5. Web smoke

```bash
curl -fsS "$WEB/" >/tmp/wordle-royale-preview-home.html
```

Then manually verify the browser demo-start flow if this is a release/PR checkpoint.

Cleanup:

```bash
rm -f "$COOKIE_JAR"
```

## Readiness hardening recommendation

Current readiness should be treated as a dependency-level readiness check. It confirmed database connectivity but did not prove required application schema/tables existed.

### Recommended implementation follow-up

Create a Freya backend implementation ticket to add an application schema readiness dependency to `/readyz`.

Recommended behavior:

- Keep `/healthz` shallow.
- Keep `/readyz` as the deploy gate.
- Add a non-mutating schema/application dependency check using Prisma or SQL.
- Verify at minimum that key application tables required by current preview routes are queryable.
- Return `status=unavailable` if a required table is missing.
- Include a clear dependency message such as `Required application schema is unavailable; run Prisma migrations.`
- Keep Redis optional while `REDIS_REQUIRED=false`.

Candidate required tables/routes for the current preview:

| Route or feature | Minimum schema dependency |
|---|---|
| preview demo session/current user | user/profile/session-related tables used by `POST /auth/preview-demo/start` and `GET /auth/me` |
| lobbies | lobby and participant tables used by `GET /lobbies` |
| leaderboard | rating profile/event tables used by `GET /leaderboard` |

Implementation should avoid expensive full-table scans. Use lightweight existence/queryability checks such as counting zero rows with a limit, `findFirst` on required Prisma models, or a database metadata query. The exact query should be owned by Freya because it touches backend runtime code and tests.

### Acceptance criteria for the Freya follow-up

- `/readyz` returns `unavailable` when the DB is reachable but required app tables are missing.
- `/readyz` returns `ok` after migrations are applied.
- Existing Redis optional behavior remains unchanged.
- Tests cover:
  - DB connected + schema ready;
  - DB connected + schema missing;
  - Redis omitted with `REDIS_REQUIRED=false`.
- Hosted preview smoke checklist still runs `/lobbies`, `/leaderboard`, and preview demo session even after `/readyz` is hardened.

## Stop conditions

Stop and ask Ashar/Athena before proceeding if any of these occur:

- migration command points at a non-preview DB;
- provider asks for paid plan/payment method/custom domain/paid add-on;
- migration would drop/reset hosted preview data unexpectedly;
- migration output includes destructive warnings;
- Railway pre-deploy command cannot be configured and no manual migration evidence is available;
- `/readyz` passes but schema-backed endpoints fail again.

## What was not changed by Ticket 114

- No Railway settings changed.
- No provider resources changed.
- No secrets viewed, created, rotated, or committed.
- No migrations were run against hosted Supabase.
- No readiness code was changed; a follow-up implementation ticket is recommended instead.
