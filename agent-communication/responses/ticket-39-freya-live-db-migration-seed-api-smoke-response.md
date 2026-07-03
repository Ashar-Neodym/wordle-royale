# Live Local DB Migration Seed and API Endpoint Smoke — Response

## Summary

Ticket 39 is complete.

I verified the API against live local PostgreSQL and Redis dependencies instead of only mocks/doubles:

- Docker Compose v2 is available to this Freya run via the user-level plugin installed by Ticket 38 under Yuna’s Hermes profile path, so I used `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker` for Compose commands.
- PostgreSQL and Redis were started and verified healthy.
- Prisma client generation passed.
- Prisma migration deploy applied the initial schema to local Postgres.
- Safe fixture seed apply passed.
- Live local DB contains the expected fixture rows: 1 dictionary release, 63 dictionary words, 4 users, 4 profiles, 4 rating profiles.
- API runtime smoke passed for `/healthz`, `/readyz`, `/auth/me`, `/profile/me`, `/lobbies`, create lobby, join lobby by ID, and join lobby by code.
- Redis readiness reported `ok`.
- Auth remains stubbed/non-production.

No repository source changes were needed for this ticket; this was runtime verification plus this response artifact.

## Decisions / Recommendations

1. **Use Ticket 38’s Compose plugin via `DOCKER_CONFIG` in this Freya environment.**
   - Plain `docker compose version` failed in this profile.
   - `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose version` succeeded with Docker Compose `v5.2.0`.

2. **Apply migrations with `prisma migrate deploy`, not `migrate dev`.**
   - Ticket 39 asks to apply migrations to local Postgres.
   - `migrate deploy` cleanly applied the checked-in migration without generating a new migration or requiring interactive development prompts.

3. **Preserve the stub auth boundary.**
   - `/auth/me` creates/returns the existing local stub user/profile through live Prisma-backed services.
   - No OAuth, JWT signing, password hashing, external auth provider, production secret, cloud service, or deployment was added.

4. **Leave live Postgres/Redis running for follow-on Wave F runtime tickets.**
   - The tracked API dev process was stopped after smoke testing.
   - Compose services remain healthy/running so Ticket 40/41 can reuse live local dependencies if desired.
   - Stop with `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose down` when no longer needed.

## Detailed Output

### Dependency startup

Initial plain Compose check in this Freya profile failed:

```text
docker: unknown command: docker compose
```

Using Ticket 38’s user-level plugin path worked:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose version
```

Output:

```text
Docker Compose version v5.2.0
```

Dependency check passed:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker CI=true pnpm deps:check
```

Output:

```text
$ node scripts/check-local-deps.mjs --check
$ docker compose version
Docker Compose version v5.2.0
exit=0
docker compose config passed.
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
```

Started local services:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose up -d postgres redis
```

Final health check:

```text
attempt 1 postgres=healthy redis=healthy
```

Final Compose state:

```text
NAME                     IMAGE                SERVICE    STATUS
wordle-royale-postgres   postgres:16-alpine   postgres   Up 5 minutes (healthy)
wordle-royale-redis      redis:7-alpine       redis      Up 5 minutes (healthy)
```

### Prisma migration and seed

Prisma schema validation passed:

```bash
DATABASE_URL='<local-compose-postgres-url>' pnpm --filter @wordle-royale/api db:validate
```

Output:

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

Prisma client generation passed:

```bash
DATABASE_URL='<local-compose-postgres-url>' pnpm --filter @wordle-royale/api db:generate
```

Output:

```text
✔ Generated Prisma Client (v6.19.3) to ./../../node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client in 139ms
```

Migration deploy passed:

```bash
DATABASE_URL='<local-compose-postgres-url>' pnpm --filter @wordle-royale/api db:migrate:deploy
```

Output:

```text
Datasource "db": PostgreSQL database "wordle_royale_local", schema "public" at "localhost:5432"

1 migration found in prisma/migrations

Applying migration `20260623000000_initial_schema`

All migrations have been successfully applied.
```

Seed apply initially failed when I used the placeholder credential copied from docs/output redaction:

```text
Authentication failed against database server, the provided database credentials for `wordle` are not valid.
```

Retried with the actual local Docker Compose credential from `docker-compose.yml`; seed apply passed:

```bash
DATABASE_URL='<local-compose-postgres-url>' pnpm --filter @wordle-royale/api db:seed:local
```

Output:

```text
Applied local fixture seed: en-5-test-vfixture.001
```

Database row-count verification:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose exec -T postgres psql -U wordle -d wordle_royale_local -c 'select ... counts ...;'
```

Output:

```text
releases | words | users | profiles | ratings
----------+-------+-------+----------+---------
        1 |    63 |     4 |        4 |       4
(1 row)
```

### Live API smoke

Started API on an alternate port to avoid any existing port-3001 conflict:

```bash
PORT=3016 DATABASE_URL='<local-compose-postgres-url>' REDIS_URL='<local-redis-url>' pnpm --filter @wordle-royale/api dev
```

Smoke checks used:

```bash
base='http://127.0.0.1:3016'
curl -sS -w '\nHTTP_STATUS:%{http_code}\n' "$base/healthz"
curl -sS -w '\nHTTP_STATUS:%{http_code}\n' "$base/readyz"
curl -sS -w '\nHTTP_STATUS:%{http_code}\n' "$base/auth/me"
curl -sS -w '\nHTTP_STATUS:%{http_code}\n' "$base/profile/me"
curl -sS -w '\nHTTP_STATUS:%{http_code}\n' "$base/lobbies"
```

Results:

- `GET /healthz` → HTTP `200`, `data.status: "ok"`.
- `GET /readyz` → HTTP `200`, `data.status: "ok"`, database `ok`, Redis `ok`.
- `GET /auth/me` → HTTP `200`, returned stub user/profile via live DB.
- `GET /profile/me` → HTTP `200`, returned stub public profile via live DB.
- `GET /lobbies` before create → HTTP `200`, empty `data.items`, `pagination.nextCursor: null`.

Representative `/readyz` response:

```json
{
  "data": {
    "status": "ok",
    "service": "wordle-royale-api",
    "environment": "development",
    "dependencies": {
      "database": { "status": "ok" },
      "redis": { "status": "ok" }
    }
  },
  "error": null,
  "requestId": "23cc57bf-d461-4586-a080-243f0e88f663"
}
```

Lobby create/join smoke used:

```bash
POST /lobbies
POST /lobbies/:lobbyId/join
POST /lobbies/join-code
GET /lobbies
```

Results:

- `POST /lobbies` → HTTP `201`, created lobby `4122089e-1c54-47f3-a1ad-cc8266c5175a`, code `94F238`.
- `POST /lobbies/4122089e-1c54-47f3-a1ad-cc8266c5175a/join` → HTTP `201`, members length `2`.
- `POST /lobbies/join-code` with code `94F238` → HTTP `201`, members length `2`.
- `GET /lobbies` after create/join → HTTP `200`, returned the created lobby under `data.items`.

The API dev process was killed after smoke testing. PostgreSQL/Redis Compose services remain running and healthy.

## Open Questions

1. Should Ticket 40 assume Postgres/Redis remain running from Ticket 39, or should each runtime ticket start and stop dependencies independently?
2. Should Freya’s Hermes profile get its own Docker Compose plugin install, or is using Yuna’s `DOCKER_CONFIG` acceptable for Wave F runtime checks?
3. Should we add a small scripted live API smoke command to avoid repeating long curl sequences manually?

## Follow-up Tickets

1. **Luna / Ticket 40 — Web live API flow smoke**
   - Use the live local API/DB verification from this ticket as the backend baseline.
   - Confirm web behavior with live `/readyz`, `/lobbies`, and fallback paths.

2. **Ruby / Ticket 41 — Ranked gameplay persistence first live match slice**
   - Use the migrated/seeded local DB as the baseline for first ranked gameplay persistence verification.

3. **Yuna/Freya — Compose plugin profile consistency**
   - Either install Compose for the Freya profile too or document the shared `DOCKER_CONFIG` workaround in local dev docs/scripts.

## Files Changed

Repository files changed by this ticket:

- `agent-communication/responses/ticket-39-freya-live-db-migration-seed-api-smoke-response.md`

Runtime/local state changed outside source files:

- Started `wordle-royale-postgres` and `wordle-royale-redis` containers.
- Applied Prisma migration `20260623000000_initial_schema` to local Postgres.
- Applied safe local fixture seed data.
- Generated Prisma client artifacts under installed dependencies.
- Created one live smoke-test lobby in local Postgres.

No production secrets, cloud resources, paid services, deployment, GitHub push, or production auth were added.

## Tests / Commands Run

```bash
docker compose version
# exit code: 1 in Freya profile without DOCKER_CONFIG
```

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose version
# exit code: 0
```

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker CI=true pnpm deps:check
# exit code: 0
```

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose up -d postgres redis
# exit code: 0
```

```bash
# container health polling
# exit code: 0; postgres=healthy redis=healthy
```

```bash
DATABASE_URL='<local-compose-postgres-url>' pnpm --filter @wordle-royale/api db:validate
# exit code: 0
```

```bash
DATABASE_URL='<local-compose-postgres-url>' pnpm --filter @wordle-royale/api db:generate
# exit code: 0
```

```bash
DATABASE_URL='<local-compose-postgres-url>' pnpm --filter @wordle-royale/api db:migrate:deploy
# exit code: 0
```

```bash
DATABASE_URL='<placeholder-redacted-url>' pnpm --filter @wordle-royale/api db:seed:local
# exit code: 1; authentication failed, corrected by using actual local compose credential
```

```bash
DATABASE_URL='<local-compose-postgres-url>' pnpm --filter @wordle-royale/api db:seed:local
# exit code: 0
```

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose exec -T postgres psql -U wordle -d wordle_royale_local -c 'select ... counts ...;'
# exit code: 0
```

```bash
PORT=3016 DATABASE_URL='<local-compose-postgres-url>' REDIS_URL='<local-redis-url>' pnpm --filter @wordle-royale/api dev
# started as tracked background process, then killed after smoke
```

```bash
curl live API endpoints on http://127.0.0.1:3016
# exit code: 0
```

```bash
pnpm --filter @wordle-royale/api test
# exit code: 0; 16/16 tests passed
```

```bash
pnpm --filter @wordle-royale/api build
# exit code: 0
```

```bash
pnpm build
# exit code: 0
```

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose ps
# exit code: 0; postgres and redis healthy/running
```

## Evidence / Result

Acceptance criteria status:

- **`pnpm --filter @wordle-royale/api db:validate` passes:** yes.
- **`pnpm --filter @wordle-royale/api db:generate` passes:** yes.
- **`pnpm --filter @wordle-royale/api test` passes:** yes, 16/16 tests passed.
- **`pnpm --filter @wordle-royale/api build` passes:** yes.
- **DB available, migration evidence included:** yes, migration applied successfully.
- **Seed evidence included:** yes, seed apply passed and row counts verified.
- **API curl smoke evidence included:** yes, health/readiness/auth/profile/lobby create/join/list all passed against live local DB/Redis.
- **Do not push:** no push performed.

Key live runtime result:

```text
/readyz -> HTTP 200, data.status=ok, database.status=ok, redis.status=ok
/auth/me -> HTTP 200
/profile/me -> HTTP 200
/lobbies -> HTTP 200
POST /lobbies -> HTTP 201
POST /lobbies/:id/join -> HTTP 201
POST /lobbies/join-code -> HTTP 201
```

## Risks / Blockers

1. **Compose plugin is profile-scoped.** Freya’s plain `docker compose` is unavailable; I used the Yuna profile’s Docker plugin via `DOCKER_CONFIG`.
2. **Local DB now contains smoke state.** The migration, seed data, stub user/profile, and one smoke lobby remain in the local Postgres volume.
3. **Postgres/Redis remain running.** This is intentional for follow-on Wave F runtime checks, but they can be stopped with `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker docker compose down`.
4. **Auth is still intentionally non-production.** `/auth/me` and `/profile/me` verify DB-backed stub behavior only, not real authentication.
5. **A failed seed attempt occurred with placeholder credentials.** This was corrected and final seed apply passed with the actual local compose credential.
