# NestJS API Skeleton with Health, Auth Stub, and Lobby Stub — Response

## Summary

Replaced the `apps/api` placeholder with a minimal NestJS API skeleton that compiles, runs locally, and exposes foundational local routes.

Implemented:

- NestJS bootstrap and app module.
- `GET /healthz` and `GET /readyz` response-envelope endpoints.
- Env-placeholder config via `@nestjs/config` with no real `.env` or secrets.
- Auth/profile stubs using Ticket 25 `@wordle-royale/contracts` schemas where possible.
- Lobby stubs using Ticket 25 `createLobbyRequestSchema`, `joinLobbyByCodeRequestSchema`, `clientRequestSchema`, and `lobbyDtoSchema`.
- Global exception filter and Zod validation pipe with a consistent error envelope.
- API tests covering health/readiness, malformed lobby validation, and create/join lobby stubs.
- API package scripts for `dev`, `build`, `typecheck`, and `test`.

## Decisions / Recommendations

1. **Used NestJS 11 with Express platform.** This matches the ticket’s NestJS direction and uses free/open-source dependencies only.
2. **Used Ticket 25 contracts directly for DTO validation.** The API imports shared Zod schemas from `@wordle-royale/contracts` rather than duplicating local DTO definitions for auth/profile/lobby shapes.
3. **Kept auth/lobby persistence stubbed.** Routes return contract-shaped local stub payloads only; no real auth provider, OAuth secret, Prisma client service, Redis, or database-backed lobby persistence was introduced.
4. **Readiness intentionally reports dependency placeholders.** `readyz` returns `database: "not_checked_stub"` and `redis: "not_checked_stub"` because this ticket only asks for skeleton/readiness, not live dependency checks.
5. **Added `esbuild` to pnpm approved build dependencies.** `tsx` depends on esbuild and pnpm 11 blocked its postinstall until explicitly allowed. This is a local/open-source build dependency required for the API dev/test runner.
6. **Used parameter-level validation pipes.** Method-level Nest pipes also validate route params/request objects, which caused a join-lobby false validation failure. Body validation now applies directly to `@Body(...)` parameters.
7. **Avoided constructor injection for the health controller.** In the current ESM/tsx test path, constructor metadata injection did not populate `ConfigService` reliably, so health reads `process.env.NODE_ENV` directly while `ConfigModule` still establishes env-placeholder config at the module level.

## Detailed Output

### Routes implemented

Health/readiness:

- `GET /healthz`
- `GET /readyz`

Auth/profile stubs:

- `GET /auth/me`
- `POST /auth/register`
- `GET /profile/me`
- `PATCH /profile/me`
- `GET /profile/handles/:handle/availability`

Lobby stubs:

- `GET /lobbies`
- `POST /lobbies`
- `POST /lobbies/join-code`
- `POST /lobbies/:lobbyId/join`

### Envelope pattern

Success responses use:

```json
{
  "data": {},
  "error": null,
  "requestId": "..."
}
```

Validation failures use:

```json
{
  "data": null,
  "error": {
    "code": "validation_failed",
    "message": "Request validation failed.",
    "details": { "issues": [] }
  },
  "requestId": "..."
}
```

### Contract usage

Imported and used these shared contract schemas/types from `@wordle-royale/contracts`:

- `authTokenResponseSchema`
- `currentUserSchema`
- `handleAvailabilityResponseSchema`
- `publicProfileSchema`
- `registerRequestSchema`
- `updateProfileRequestSchema`
- `clientRequestSchema`
- `createLobbyRequestSchema`
- `joinLobbyByCodeRequestSchema`
- `lobbyDtoSchema`
- `RegisterRequest`
- `UpdateProfileRequest`
- `CreateLobbyRequest`
- `JoinLobbyByCodeRequest`
- `LobbyDto`

### Local dev behavior

`pnpm --filter @wordle-royale/api dev` starts the Nest app on port `3001` by default.

Verified with curl:

```bash
curl -sS -i http://127.0.0.1:3001/healthz
curl -sS -i http://127.0.0.1:3001/readyz
```

Both returned HTTP `200 OK` with response envelopes.

## Open Questions

1. Should later API tickets switch from direct `process.env` health metadata to injected config once the runtime/build path is finalized for ESM + Nest metadata?
2. Should the shared contracts package add explicit REST response envelope schemas for list payloads like `{ items, nextCursor }`, or should those stay API-local until the frontend client is implemented?
3. Should lobby IDs in `POST /lobbies/:lobbyId/join` be validated with `idSchema` at the route-param layer now, or deferred until real persistence/service logic is added?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Backend service implementation should follow this skeleton.
- **Exact task:** Add Prisma-backed services for profile/lobby persistence using `apps/api/prisma/schema.prisma`, replacing the current in-memory/static stubs while preserving contract validation and response envelopes.
- **Inputs/context they need:** Ticket 26 Prisma schema, this Ticket 27 response, `apps/api/src/**`.
- **Expected output back to Athena:** Service implementation, persistence tests, and mismatch notes against Ticket 25 contracts / Ticket 26 schema.

### Follow-up ticket 2

- **Target agent:** Jasmine
- **Why that agent is needed:** QA should independently verify API contract and error-envelope behavior before frontend integration.
- **Exact task:** Add/confirm QA gates for health/readiness, malformed bodies, private-rated-lobby rejection, auth/profile stub boundaries, and lobby list/create/join responses.
- **Inputs/context they need:** `apps/api/test/api-skeleton.test.ts`, Ticket 25 contracts, this response.
- **Expected output back to Athena:** Pass/fail QA matrix and any missing API skeleton tests.

### Follow-up ticket 3

- **Target agent:** Elisa
- **Why that agent is needed:** Elisa owns shared contracts and can decide whether to formalize list/envelope response schemas.
- **Exact task:** Decide whether REST response envelopes and lobby list envelopes should be added to `@wordle-royale/contracts` instead of only implemented in the API skeleton.
- **Inputs/context they need:** `apps/api/src/shared/envelope.ts`, `apps/api/src/lobby/lobby.controller.ts`, Ticket 25 contracts.
- **Expected output back to Athena:** Contract update or explicit decision to keep envelopes API-local for now.

## Files Changed

Ticket 27 files changed/created:

- `apps/api/README.md`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/shared/envelope.ts`
- `apps/api/src/shared/zod-validation.pipe.ts`
- `apps/api/src/shared/api-exception.filter.ts`
- `apps/api/src/health/health.controller.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/lobby/lobby.controller.ts`
- `apps/api/test/api-skeleton.test.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `agent-communication/responses/ticket-27-freya-nestjs-api-skeleton-health-auth-lobby-response.md`

Pre-existing/unrelated working-tree changes observed but not owned by this ticket:

- `apps/mobile/README.md`
- `apps/mobile/package.json`
- `apps/mobile/App.tsx`
- `apps/mobile/app.json`
- `apps/mobile/index.ts`
- `apps/mobile/src/components/**`
- `apps/mobile/src/lib/**`
- `apps/mobile/tsconfig.json`
- `agent-communication/responses/ticket-29-luna-expo-mobile-shell-design-token-screens-response.md`

## Tests / Commands Run

### Context/status command

```bash
git status --short
```

Exit code: `0`.

Result showed existing mobile/Ticket 29 working-tree changes alongside this ticket’s API changes. I did not edit the mobile files.

### Dependency install attempt

```bash
CI=true pnpm install --no-frozen-lockfile
```

Exit code: `1`.

Relevant output:

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.1
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

Resolution: added `esbuild` to `allowBuilds` / `onlyBuiltDependencies` in `pnpm-workspace.yaml`, matching the existing explicit allowlist pattern for Prisma and sharp.

### Successful dependency install

```bash
CI=true pnpm install --no-frozen-lockfile
```

Exit code: `0`.

Relevant output:

```text
.../esbuild@0.28.1/node_modules/esbuild postinstall: Done
Done in 3s using pnpm v11.1.1
```

### Initial API build/test command

```bash
pnpm --filter @wordle-royale/api build && pnpm --filter @wordle-royale/api test
```

Exit code: `1`.

Build passed, tests failed initially:

```text
✖ serves health and readiness envelopes
✖ creates and joins lobby stubs with shared contract-shaped payloads
```

Root causes fixed:

- Health controller constructor metadata injection left `ConfigService` undefined in the ESM/tsx test path; health now reads environment directly.
- Method-level validation pipes validated route params/request objects too; body validation is now parameter-level.

### Final API build/test command

```bash
pnpm --filter @wordle-royale/api build && pnpm --filter @wordle-royale/api test
```

Exit code: `0`.

Output:

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
$ node --import tsx --test prisma/*.test.mjs test/*.test.ts
✔ schema uses PostgreSQL provider and app env datasource
✔ schema covers users profiles consent and analytics audit basics
✔ schema stores dictionary versions and per-word metadata without production source content
✔ schema covers lobby match round participant guesses scores and reports
✔ schema supports rating events idempotency voids reversals and leaderboard profiles
▶ api skeleton
  ✔ serves health and readiness envelopes
  ✔ rejects malformed lobby creation with the shared error envelope
  ✔ creates and joins lobby stubs with shared contract-shaped payloads
✔ api skeleton
ℹ tests 8
ℹ suites 1
ℹ pass 8
ℹ fail 0
```

### Frozen install + root build + root test

```bash
CI=true pnpm install --frozen-lockfile && pnpm build && pnpm test
```

Exit code: `0`.

Relevant output:

```text
Scope: all 10 workspace projects
Already up to date
Done in 399ms using pnpm v11.1.1
apps/api build: $ tsc --noEmit -p tsconfig.json
apps/api build: Done
apps/web build: ✓ Compiled successfully in 2.1s
apps/web build: Done
Workspace scaffold validation passed (9 workspace packages).
```

### API database validation

```bash
pnpm --filter @wordle-royale/api db:validate
```

Exit code: `0`.

Output:

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

### Local health/readiness smoke

Started the API locally:

```bash
pnpm --filter @wordle-royale/api dev
```

Then checked:

```bash
curl -sS -i http://127.0.0.1:3001/healthz
curl -sS -i http://127.0.0.1:3001/readyz
```

Exit code: `0`.

Relevant output:

```text
HTTP/1.1 200 OK
{"data":{"status":"ok","service":"wordle-royale-api","environment":"development",...},"error":null,"requestId":"..."}
---
HTTP/1.1 200 OK
{"data":{"status":"ok","service":"wordle-royale-api","environment":"development",...,"dependencies":{"database":"not_checked_stub","redis":"not_checked_stub"}},"error":null,"requestId":"..."}
```

The local dev process was stopped after smoke verification.

## Evidence / Result

Acceptance criteria status:

- **Uses free/open-source dependencies only:** Passed. Added NestJS, reflect-metadata, rxjs, zod, tsx, supertest, TypeScript types.
- **Does not add paid SDKs:** Passed.
- **Does not implement real auth secrets/OAuth:** Passed. Auth/profile endpoints are explicit stubs with placeholder tokens.
- **Health/readiness endpoints work locally:** Passed via API tests and curl smoke against local dev server.
- **Validation rejects malformed bodies with consistent error envelope:** Passed via `api-skeleton.test.ts` malformed lobby test.
- **Uses `@wordle-royale/contracts` where possible:** Passed for auth/profile/lobby request/response validation.
- **Adds package scripts for build/test/dev:** Passed in `apps/api/package.json`.
- **`pnpm --filter @wordle-royale/api build` passes:** Passed.
- **`pnpm --filter @wordle-royale/api test` passes:** Passed with 8 total API/prisma tests.
- **Root `pnpm build` passes:** Passed.

## Risks / Blockers

- **Stubs are not persistent.** Lobby/auth/profile routes return static contract-shaped data and must be replaced with services in later backend tickets.
- **Readiness dependencies are placeholders.** `readyz` does not yet verify live Postgres/Redis connectivity.
- **No real auth security yet.** Placeholder tokens are deliberately marked not-for-production.
- **ESM + Nest metadata caveat.** Constructor injection did not work reliably in the current tsx test execution path for `HealthController`; future backend setup may revisit build/runtime settings before deeper dependency injection.
- **Working tree contains unrelated mobile/Ticket 29 changes.** Root build/test passed with those changes present, but they are outside Ticket 27 ownership.
