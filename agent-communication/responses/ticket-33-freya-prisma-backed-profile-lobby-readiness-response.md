# Prisma-backed Profile/Lobby Services and Readiness Checks — Response

## Summary

Ticket 33 is complete for the local-safe backend integration scope.

Implemented API service layers that move profile/lobby behavior away from static controller-local stubs and into Prisma-backed services, while keeping auth explicitly stubbed/non-production. Readiness now performs actual dependency checks when local configuration is present:

- Database: Prisma `$queryRaw` `SELECT 1` health probe.
- Redis: local TCP connectivity probe against `REDIS_URL` / localhost fallback.

Because this environment does not have live local Postgres/Redis services running, runtime `/readyz` correctly reports `unavailable` dependency statuses. API tests use Nest provider overrides/test doubles to cover both healthy and unhealthy readiness without requiring Docker.

## Decisions / Recommendations

1. **Kept auth as a stub.**
   - `POST /auth/register` still returns explicit stub tokens.
   - No OAuth, password hashing, JWT signing, production secrets, or external auth providers were added.

2. **Added service boundaries instead of growing controllers.**
   - `ProfileService` owns current-user/profile/handle-availability behavior.
   - `LobbyService` owns lobby list/create/join behavior.
   - `ReadinessService` owns aggregate dependency status.
   - `PrismaService` owns local Prisma client wiring and database readiness.

3. **Used Ticket 26 Prisma schema where feasible.**
   - Profile behavior uses `UserAccount` / `UserProfile` style operations.
   - Lobby behavior uses `Lobby` create/find/update style operations and stores V1 contract-shaped settings/members in the schema’s JSON `settings` field.
   - Full lobby membership normalization is deferred because Ticket 26 schema does not yet include a separate persisted lobby-members table.

4. **Preserved Ticket 32/Ticket 27 envelope shape.**
   - Success responses still return `{ data, error: null, requestId }`.
   - Error responses still return `{ data: null, error, requestId }` via `ApiExceptionFilter`.
   - Lobby list now uses the Ticket 32 list shape under `data.items` and `data.pagination.nextCursor`.

5. **Readiness response returns HTTP 200 with machine-readable status.**
   - `/readyz` reports `data.status: ok | degraded | unavailable`.
   - Local missing Postgres/Redis is reported inside dependency objects instead of crashing the API.

## Detailed Output

### Prisma/local service wiring

Added `apps/api/src/prisma/prisma.service.ts`:

- Creates a local `PrismaClient`.
- Exposes a narrow `client` surface used by profile/lobby services.
- Implements `checkDatabase()` using a lightweight Prisma raw query.
- Disconnects on module destroy.

### Readiness checks

Added:

- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/health/redis-readiness.service.ts`

`GET /readyz` now returns shared readiness-contract-shaped dependency objects, for example:

```json
{
  "data": {
    "status": "unavailable",
    "service": "wordle-royale-api",
    "environment": "development",
    "checkedAt": "...",
    "dependencies": {
      "database": { "status": "unavailable", "checkedAt": "...", "latencyMs": 74, "message": "..." },
      "redis": { "status": "unavailable", "checkedAt": "...", "latencyMs": 9, "message": "..." }
    }
  },
  "error": null,
  "requestId": "..."
}
```

### Profile/auth behavior

`AuthController` now delegates profile-backed routes to `ProfileService`:

- `GET /auth/me`
- `GET /profile/me`
- `PATCH /profile/me`
- `GET /profile/handles/:handle/availability`

`POST /auth/register` remains stubbed and non-production.

### Lobby behavior

`LobbyController` now delegates to `LobbyService`:

- `GET /lobbies`
- `POST /lobbies`
- `POST /lobbies/join-code`
- `POST /lobbies/:lobbyId/join`

The lobby service:

- Creates lobbies through Prisma-style `lobby.create`.
- Lists public waiting/ready lobbies through Prisma-style `lobby.findMany`.
- Joins by ID/code through Prisma-style `lobby.findUnique` + `lobby.update`.
- Returns `lobbyDtoSchema`-validated payloads.
- Stores contract-shaped lobby settings and members inside the existing JSON `Lobby.settings` field.

### Tests added/updated

`apps/api/test/api-skeleton.test.ts` now uses Nest provider overrides to inject local-safe test doubles for `PrismaService` and `RedisReadinessService`.

Coverage includes:

- Healthy readiness dependency status.
- Unhealthy readiness dependency status.
- Prisma-backed profile/current-user behavior while auth remains stubbed.
- Shared validation error envelope for malformed lobby creation.
- Prisma-backed lobby create/list/join/join-by-code behavior.

## Open Questions

1. Should lobby membership get its own normalized Prisma model soon, or is storing V1 lobby members in `Lobby.settings` JSON acceptable until gameplay/match persistence begins?
2. Should `/readyz` return non-200 for `data.status === "unavailable"`, or keep HTTP 200 for orchestrator-friendly JSON status during local dev?
3. Should Redis remain a raw TCP readiness probe, or should Yuna/Ruby add a real Redis client dependency once queue/session features require it?

## Follow-up Tickets

1. **Ruby/Yuna — live local DB apply + readiness verification**
   - Run migrations against Docker Compose Postgres once available.
   - Verify `/readyz` transitions database from `unavailable` to `ok`.

2. **Freya/Ruby — normalized lobby membership model**
   - If persistent lobby membership is needed before gameplay, add/adjust schema and migrate `Lobby.settings.members` into a first-class table.

3. **Jasmine — Wave E QA**
   - Independently verify runtime envelopes against shared schemas.
   - Include readiness healthy/unhealthy cases and lobby list shape.

## Files Changed

Ticket 33 files changed/created:

- `apps/api/src/app.module.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/health/health.controller.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/health/redis-readiness.service.ts`
- `apps/api/src/lobby/lobby.controller.ts`
- `apps/api/src/lobby/lobby.service.ts`
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/profile/profile.service.ts`
- `apps/api/test/api-skeleton.test.ts`
- `agent-communication/responses/ticket-33-freya-prisma-backed-profile-lobby-readiness-response.md`

Pre-existing/unrelated working-tree changes from other Wave D/E tickets remain present in the repository. I did not claim ownership of those unrelated files.

## Tests / Commands Run

### API build

```bash
pnpm --filter @wordle-royale/api build
```

Exit code: `0`.

Output:

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
```

### API tests

```bash
pnpm --filter @wordle-royale/api test
```

Exit code: `0`.

Relevant output:

```text
✔ schema uses PostgreSQL provider and app env datasource
✔ schema covers users profiles consent and analytics audit basics
✔ schema stores dictionary versions and per-word metadata without production source content
✔ schema covers lobby match round participant guesses scores and reports
✔ schema supports rating events idempotency voids reversals and leaderboard profiles
✔ local fixture seed plan uses only the safe fixture dictionary policy
✔ seed dry-run summary is deterministic and spoiler-safe
✔ seed CLI dry-run emits JSON summary without requiring DATABASE_URL or a live database
▶ api skeleton
  ✔ serves health and healthy readiness envelopes with dependency checks
  ✔ serves unhealthy readiness when a dependency check fails
  ✔ uses Prisma-backed profile service behavior while auth remains stubbed
  ✔ rejects malformed lobby creation with the shared error envelope
  ✔ creates, lists, and joins lobbies through the Prisma-backed lobby service
✔ api skeleton
ℹ tests 13
ℹ pass 13
ℹ fail 0
```

### Prisma schema validation

```bash
pnpm --filter @wordle-royale/api db:validate
```

Exit code: `0`.

Relevant output:

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

### Root build

```bash
pnpm build
```

Exit code: `0`.

Relevant output:

```text
packages/contracts build: Done
packages/design-tokens build: Done
packages/fixtures build: Done
packages/game-engine build: Done
packages/rating-tools build: Done
apps/mobile build: Done
packages/word-tools build: Done
apps/web build: ✓ Compiled successfully
apps/web build: Done
apps/api build: Done
```

### Root test/workspace validation

```bash
pnpm test
```

Exit code: `0`.

Output:

```text
Workspace scaffold validation passed (9 workspace packages).
```

### Runtime smoke curl

First attempt:

```bash
pnpm --filter @wordle-royale/api dev
```

Observed port blocker:

```text
Error: listen EADDRINUSE: address already in use :::3001
```

Resolution: started the API on alternate port `3013`.

```bash
PORT=3013 pnpm --filter @wordle-royale/api dev
curl -sS -i http://127.0.0.1:3013/healthz
curl -sS -i http://127.0.0.1:3013/readyz
```

Exit code for curl command: `0`.

`/healthz` returned HTTP `200 OK` with:

```json
{"data":{"status":"ok","service":"wordle-royale-api","environment":"development","timestamp":"2026-06-24T11:46:36.262Z","uptimeSeconds":15},"error":null,"requestId":"adbb5592-5f58-4651-b828-2ebc968a06fe"}
```

`/readyz` returned HTTP `200 OK` with `data.status: "unavailable"` because live local Postgres and Redis were not running:

```json
{
  "data": {
    "status": "unavailable",
    "service": "wordle-royale-api",
    "environment": "development",
    "dependencies": {
      "database": { "status": "unavailable", "message": "Can't reach database server at `localhost:5432`" },
      "redis": { "status": "unavailable", "message": "connect ECONNREFUSED 127.0.0.1:6379" }
    }
  },
  "error": null
}
```

## Evidence / Result

Acceptance criteria status:

- **`pnpm --filter @wordle-royale/api test` passes:** yes, 13/13 tests passed.
- **`pnpm --filter @wordle-royale/api build` passes:** yes.
- **`pnpm --filter @wordle-royale/api db:validate` passes:** yes.
- **Root `pnpm build` passes:** yes.
- **Health/readiness documented with curl/test evidence:** yes.
- **No production auth secrets or real external auth provider added:** yes.
- **Live DB/Redis unavailable handled with tests/test doubles and documented blocker:** yes.

## Risks / Blockers

1. **Live Postgres/Redis unavailable in this environment.** Runtime `/readyz` correctly reports both dependencies as `unavailable`. Healthy integration remains pending Yuna/Ruby local Docker/database verification.
2. **Lobby membership is JSON-backed for now.** The current Ticket 26 schema has `Lobby.settings Json?` but no dedicated lobby-member table, so V1 lobby members are persisted inside `settings.members`.
3. **Port 3001 was already in use during smoke testing.** I used `PORT=3013` for curl verification and stopped the tracked background process afterward.
4. **Auth remains intentionally non-production.** Stub tokens are unchanged and clearly not suitable for production auth.
