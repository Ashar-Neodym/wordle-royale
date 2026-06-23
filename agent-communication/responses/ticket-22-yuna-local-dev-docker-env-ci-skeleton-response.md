# Ticket 22 — Local Dev Docker/Env/CI Skeleton — Response

## Summary

Implemented the local-only developer operations skeleton for Wordle Royale:

- Added Docker Compose for PostgreSQL 16 and Redis 7 only.
- Added environment example files with placeholders and no real production secrets.
- Added root pnpm scripts for local dependency lifecycle and config smoke checks.
- Added a local smoke script that validates config/workspace state without starting app services.
- Added a GitHub Actions PR-check skeleton that requires no unavailable secrets.
- Added local development and CI docs.

No cloud resources, staging resources, production resources, paid services, or secrets were created or modified.

## Decisions / Recommendations

1. **Docker Compose remains local dependency-only.** It contains only PostgreSQL 16 and Redis 7, matching Athena’s lock that app processes should run via pnpm scripts.
2. **Root scripts use Docker Compose v2 syntax.** `pnpm deps:up`, `pnpm deps:down`, and `pnpm deps:reset` call `docker compose ...`.
3. **Local smoke checks do not require running containers.** The smoke script checks expected files and workspace validation. It validates Docker Compose syntax only when Docker Compose v2 is available in the environment.
4. **CI skeleton avoids unavailable secrets.** The PR workflow runs install/lint/typecheck/test/local-smoke only. It does not deploy, access cloud services, or require staging/production credentials.
5. **`pnpm build` is intentionally not in the initial CI skeleton.** During verification, the workspace build failed in package code outside this Yuna ticket’s ops scope. The CI docs explicitly call this out and recommend adding build as a required gate after owning implementation agents stabilize package builds.

## Detailed Output

### Files implemented

#### `docker-compose.yml`

Added local services:

- `postgres` using `postgres:16-alpine`
- `redis` using `redis:7-alpine`

The Compose file includes:

- Local port mappings: `5432` for PostgreSQL, `6379` for Redis.
- Named local Docker volumes: `postgres_data`, `redis_data`.
- Health checks for PostgreSQL and Redis.
- No API/web/mobile/worker app containers.
- No cloud resources.

#### `.env.example` and `.env.local.example`

Added placeholder environment templates covering:

- Runtime/app URLs.
- PostgreSQL/Redis URLs.
- Auth/security placeholders.
- Sentry/environment tagging placeholders.
- Expo public local config placeholders.

The examples use placeholders such as `***`, `<local-development-secret>`, or empty values. They do not contain production secrets.

#### Root package scripts

Added these root scripts to `package.json`:

```json
{
  "deps:up": "docker compose up -d postgres redis",
  "deps:down": "docker compose down",
  "deps:reset": "docker compose down --volumes --remove-orphans",
  "smoke:local": "node scripts/local-smoke.mjs"
}
```

Existing scaffold scripts were preserved.

#### `scripts/local-smoke.mjs`

Added a local smoke script that checks:

- `docker-compose.yml` exists.
- `.env.example` exists.
- `.env.local.example` exists.
- Docker Compose config syntax when Docker Compose v2 is available.
- Workspace scaffold validation via `pnpm validate:workspace`.

If Docker Compose v2 is unavailable, the smoke script reports that Compose validation was skipped instead of failing the whole local config smoke check.

#### `.github/workflows/pr-checks.yml`

Added a secret-free GitHub Actions PR-check skeleton:

- Checkout.
- Setup pnpm 11.1.1.
- Setup Node.js 20.
- Install with `pnpm install --frozen-lockfile`.
- Run `pnpm lint`.
- Run `pnpm typecheck`.
- Run `pnpm test`.
- Run `pnpm smoke:local`.

It does not require secrets and does not deploy anything.

#### Docs

Added/updated:

- `docs/local-development.md` — local setup, env templates, Docker Compose services, scripts, and safety rules.
- `docs/ci.md` — current PR skeleton behavior, safety rules, and future CI expansion.
- `README.md` — references local infrastructure and CI docs.

## Open Questions

1. Should future implementation tickets add real Docker-backed integration tests with PostgreSQL 16 and Redis 7 GitHub Actions service containers?
2. Should `pnpm build` become required immediately after package build issues are fixed, or should build be split by workspace first?
3. Should `deps:reset` include an interactive confirmation wrapper later to reduce accidental local volume deletion?
4. Should the local Postgres password remain documented in `docker-compose.yml`, or should a future Ruby/Yuna ticket add `.env.docker.example` for Compose variable substitution?

## Follow-up Tickets

### Follow-up 1

- **Target agent:** Freya
- **Why that agent is needed:** The current workspace `pnpm build` fails in package TypeScript code outside this ops skeleton.
- **Exact task:** Fix package build issues so `pnpm build` can become a required CI gate. Current observed failure is in `packages/contracts` TypeScript test/import resolution involving `node:test`, `node:assert/strict`, and `./schemas.ts`.
- **Inputs/context they need:** Ticket 22 response; command output from `pnpm build`; package code under `packages/contracts`.
- **Expected output back to Athena:** Build fixes, command output showing `pnpm build` passes, and any contract/package caveats.

### Follow-up 2

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns tooling and can expand CI/service-container automation.
- **Exact task:** Add future GitHub Actions integration-test job with PostgreSQL 16 and Redis 7 service containers after backend/package test scripts exist.
- **Inputs/context they need:** `.github/workflows/pr-checks.yml`, `docs/ci.md`, Ticket 16 ops plan, Freya backend test scripts once implemented.
- **Expected output back to Athena:** CI workflow update, service-container config, and validation evidence.

### Follow-up 3

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent verification.
- **Exact task:** Verify Ticket 22 acceptance criteria independently: Compose has only Postgres/Redis, env examples have placeholders only, CI requires no secrets, and local smoke/typecheck/lint/test behavior is documented.
- **Inputs/context they need:** Files changed in this ticket and the command outputs listed below.
- **Expected output back to Athena:** Independent pass/fail QA report with any blockers.

### Follow-up 4

- **Target agent:** Yuna
- **Why that agent is needed:** Yuna owns ops/CI hardening.
- **Exact task:** After `pnpm build` is fixed, update `.github/workflows/pr-checks.yml` to include `pnpm build` as a required gate and rerun validation.
- **Inputs/context they need:** Freya/Ruby build-fix evidence and current CI skeleton.
- **Expected output back to Athena:** CI workflow update and successful verification output.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/docker-compose.yml`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/.env.example`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/.env.local.example`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/scripts/local-smoke.mjs`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/.github/workflows/pr-checks.yml`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/docs/local-development.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/docs/ci.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-22-yuna-local-dev-docker-env-ci-skeleton-response.md`

## Tests / Commands Run

### Passed

```bash
pnpm smoke:local && pnpm lint && pnpm typecheck && pnpm test
```

Result: **passed**, exit code `0`.

Relevant output:

```text
$ node scripts/local-smoke.mjs
PASS docker-compose.yml exists
PASS .env.example exists
PASS .env.local.example exists
INFO docker compose config validation skipped — Docker Compose v2 is not available in this environment; install Docker Compose to validate/start local services.
PASS workspace scaffold validates — pnpm validate:workspace passed
Local smoke passed. This smoke test validates local config only; it does not start app services.
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).
```

```bash
docker compose version
```

Result: **failed**, exit code `1`, because Docker Compose v2 is not available in this execution environment.

Output:

```text
docker: unknown command: docker compose

Run 'docker --help' for more information
```

```text
Searched `.env.example` / `.env.local.example` for common secret token patterns.
```

Result: **passed**, no matches found for the searched token/key patterns.

### Failed / informational

Initial combined verification attempted before adjusting the smoke script:

```bash
pnpm validate:workspace && docker compose config --quiet && pnpm smoke:local && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Result: **failed**, exit code `125`, because `docker compose` is unavailable in this environment.

Output included:

```text
Workspace scaffold validation passed (9 workspace packages).
unknown flag: --quiet
```

Later, after local smoke passed, `pnpm build` was also tested as an informational check:

```bash
pnpm build
```

Result: **failed**, exit code `2`, due to existing package build errors outside this ticket’s ops scope.

Relevant output:

```text
packages/contracts build: src/word-library/schemas.test.ts(1,18): error TS2307: Cannot find module 'node:test' or its corresponding type declarations.
packages/contracts build: src/word-library/schemas.test.ts(2,20): error TS2307: Cannot find module 'node:assert/strict' or its corresponding type declarations.
packages/contracts build: src/word-library/schemas.test.ts(3,91): error TS2307: Cannot find module './schemas.ts' or its corresponding type declarations.
packages/contracts build: Failed
```

Because this failure is in package implementation code outside the local ops skeleton, the initial CI skeleton does not require `pnpm build` yet. `docs/ci.md` records this caveat.

## Evidence / Result

Ticket 22 deliverable was created at:

`/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-22-yuna-local-dev-docker-env-ci-skeleton-response.md`

Acceptance criteria coverage:

1. **Docker Compose file has Postgres and Redis only** — satisfied by `docker-compose.yml` with only `postgres` and `redis` services.
2. **Env examples contain placeholders only, no real secrets** — satisfied by `.env.example` and `.env.local.example`; common secret-pattern search found no matches.
3. **Commands are documented and tested where possible** — documented in README/docs and tested with available environment constraints. Docker Compose could not be run because it is unavailable here.
4. **CI skeleton does not require unavailable secrets** — satisfied by `.github/workflows/pr-checks.yml`; it uses only checkout/setup/install/lint/typecheck/test/smoke.
5. **Response lists files changed and commands run** — included in this response.

## Risks / Blockers

- Docker Compose v2 is not available in this execution environment, so Compose startup and config validation could not be fully exercised here.
- `pnpm build` currently fails in `packages/contracts` code outside this ticket’s scope; build should be added to CI after Freya/Ruby or the owning implementation agent fixes package build/type declarations/imports.
- `pnpm deps:reset` is destructive to local Docker volumes; docs warn about this, but a future confirmation wrapper may be safer.
- The Compose file uses a documented local-only Postgres password for developer convenience. It is not a production secret, but teams should not reuse it outside local development.
- No cloud resources, staging resources, production resources, or secrets were created or modified.
