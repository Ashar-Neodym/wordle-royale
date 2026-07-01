# Ticket 65 — Fix Ranked Reset Compose Resolver Response

Task: Fix Ranked Reset Compose Resolver
Agent: Yuna (operations)
Status: Completed

## What I understood

The Wave I blocker was that the documented demo reset command:

```bash
pnpm deps:up && pnpm ranked:smoke:reset
```

could fail in some Hermes/agent shells unless `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker` was manually exported. The reset script still called bare `docker compose` directly instead of using the repo's Docker Compose resolver from `scripts/docker-compose-env.mjs`.

The fix needed to keep the destructive local reset guards intact and prove the flow works without a manual `DOCKER_CONFIG` export.

## What I did

- Updated `scripts/reset-ranked-smoke-db.mjs` to import and use `resolveComposeEnv()` from `scripts/docker-compose-env.mjs`.
- Added a reset-script Compose availability check that fails with a clear local-only message if no Compose v2 path is available.
- Routed reset-script Compose calls through the resolved Compose environment:
  - PostgreSQL readiness check.
  - `psql` schema reset command.
- Kept the existing local-production safety guards:
  - production-like env refusal,
  - local host requirement,
  - expected local port/user/database checks,
  - `sslmode=require` refusal.
- Left the canonical command unchanged; no docs update was needed because `pnpm deps:up && pnpm ranked:smoke:reset` now works as documented.

## Files changed

- `scripts/reset-ranked-smoke-db.mjs`
- `agent-communication/responses/ticket-65-yuna-fix-ranked-reset-compose-resolver-response.md`

## Tests / commands run

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Syntax check — exit `0`:

```bash
node --check scripts/reset-ranked-smoke-db.mjs
```

Confirmed this shell had no manually exported `DOCKER_CONFIG` — exit `0`:

```bash
printf 'DOCKER_CONFIG=%s\n' "${DOCKER_CONFIG:-}"
```

Output:

```text
DOCKER_CONFIG=
```

Primary repro command, explicitly unsetting `DOCKER_CONFIG` — exit `0`:

```bash
CI=true env -u DOCKER_CONFIG pnpm deps:up && \
CI=true env -u DOCKER_CONFIG pnpm ranked:smoke:reset
```

Key output:

```text
$ node scripts/docker-compose.mjs up -d postgres redis
Using Docker Compose from current environment.
Container wordle-royale-redis Started
Container wordle-royale-postgres Started

$ node scripts/reset-ranked-smoke-db.mjs
Ranked smoke local DB reset guard passed.
Target: local Compose PostgreSQL database wordle_royale_local on localhost:5432.
Using Docker Compose from current environment.
/var/run/postgresql:5432 - accepting connections
DROP SCHEMA
CREATE SCHEMA
🚀  Your database is now in sync with your Prisma schema. Done in 5.86s
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
```

Bootstrap verification with API running locally — exit `0`:

```bash
curl -fsS http://127.0.0.1:4065/readyz
API_BASE_URL=http://127.0.0.1:4065 CI=true env -u DOCKER_CONFIG pnpm ranked:smoke:bootstrap
```

Key output:

```json
{
  "result": "ok",
  "apiBaseUrl": "http://127.0.0.1:4065",
  "note": "Created and joined a rated lobby without calling /auth/me first.",
  "lobbyCode": "773E09",
  "members": [
    { "userId": "11111111-1111-4111-8111-111111111111", "handle": "player_one", "role": "host" },
    { "userId": "22222222-2222-4222-8222-222222222222", "handle": "guest_player", "role": "player" }
  ]
}
```

Production guard verification — expected failure / exit `1`:

```bash
NODE_ENV=production CI=true env -u DOCKER_CONFIG pnpm ranked:smoke:reset
```

Output:

```text
Refusing ranked smoke reset: production-like environment detected (production).
[ELIFECYCLE] Command failed with exit code 1.
```

Dependency verification and cleanup, explicitly unsetting `DOCKER_CONFIG` — exit `0`:

```bash
CI=true env -u DOCKER_CONFIG pnpm deps:verify
```

Key output:

```text
Using Docker Compose from current environment.
Docker Compose version v5.2.0
docker compose config passed.
/var/run/postgresql:5432 - accepting connections
PONG
Local dependency verification passed: PostgreSQL and Redis are healthy and accepting connections.
docker compose down
exit=0
```

Secret scan — exit `0`:

```bash
CI=true env -u DOCKER_CONFIG pnpm secret-scan
```

Output:

```text
Secret scan passed (168 source/config files scanned).
```

Final process/container cleanup checks:

- No tracked Hermes background process remained after the API test.
- Final `deps:verify` ran `docker compose down` successfully and removed the Wordle Royale containers/network.

## Evidence / result

- The exact failing flow now succeeds without manual `DOCKER_CONFIG` export:

```bash
CI=true env -u DOCKER_CONFIG pnpm deps:up && CI=true env -u DOCKER_CONFIG pnpm ranked:smoke:reset
```

- The reset script logs which Compose resolver path it selected.
- The reset script continues to refuse production-like environments before any destructive action.
- Seed/bootstrap proof succeeded against the reset local DB through the API.
- Cleanup and secret scan passed.

## Blockers or risks

- No blocker remains for this ticket.
- I verified the no-manual-export path in the current Yuna shell with `DOCKER_CONFIG` explicitly unset. The resolver selected `current environment` here because this host has a usable Docker Compose v2 available. The script now shares the same resolver path as `deps:up`/`deps:check`, so shells that need a repo-known fallback should use that same fallback instead of direct bare Compose calls.

## Follow-up tickets

None required from Yuna for this blocker.

Recommended next handoff:

- Target agent: Jasmine
- Why that agent is needed: Independent release-confidence verification after the Wave I blocker fix.
- Exact task: Rerun the Ticket 65 repro and key Wave I demo smoke from a QA shell without manually exporting `DOCKER_CONFIG`.
- Inputs/context they need: `scripts/reset-ranked-smoke-db.mjs` changed to reuse `scripts/docker-compose-env.mjs`; canonical command remains `pnpm deps:up && pnpm ranked:smoke:reset`.
- Expected output back to Athena: Pass/fail evidence with command output, cleanup confirmation, and any remaining demo-friction findings.
