# Docker Compose v2 Enablement and Live Dependency Verification — Response

## Summary

Docker Compose v2 is now enabled for this Yuna/Hermes environment using a user-level Docker CLI plugin install. Live local dependency verification passed:

- `pnpm deps:check` passed.
- `pnpm deps:verify` passed.
- PostgreSQL 16 started, became healthy, and `pg_isready` returned accepting connections.
- Redis 7 started, became healthy, and `redis-cli ping` returned `PONG`.
- `pnpm smoke:local` passed with real Compose config validation instead of the previous skip.
- Cleanup completed with `docker compose down`; no `wordle-royale-*` containers remained afterward.
- `pnpm secret-scan` passed.
- `pnpm install --frozen-lockfile` passed after syncing current workspace lockfile drift.

No cloud resources, paid services, production secrets, real `.env` files, deployment, or GitHub push were introduced.

## Decisions / Recommendations

- Keep the Docker Compose plugin user-level for this Hermes/Yuna environment rather than changing system Docker packages.
- Treat `pnpm deps:verify` as the canonical local dependency proof for PostgreSQL/Redis.
- Proceed to Freya Ticket 39 for live DB migration/seed/API smoke now that local PostgreSQL and Redis runtime verification is no longer blocked.
- If another agent/profile needs Compose, repeat the user-level plugin install or install the OS package in that environment; this plugin was installed under Yuna’s active `$HOME` path.

## Detailed Output

### Host Docker / Compose state before enablement

Docker was installed and running, but Compose was initially missing:

```text
Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2

docker: unknown command: docker compose

Run 'docker --help' for more information
```

Checked plugin locations:

```text
/home/ashar/.hermes/profiles/yuna/home/.docker/cli-plugins: did not exist
/usr/libexec/docker/cli-plugins: only docker-trust existed
/usr/lib/docker/cli-plugins: missing
/usr/local/lib/docker/cli-plugins: missing
```

### Compose v2 enablement

Installed Docker Compose as a user-level Docker CLI plugin:

```text
latest=v5.2.0 os=linux arch=x86_64
download=https://github.com/docker/compose/releases/download/v5.2.0/docker-compose-linux-x86_64
expected_sha256=018f9612ecabc5f2d7aaa53d6f5f44453a87611e2d72c8ef84d7b1eca070e719
actual_sha256=018f9612ecabc5f2d7aaa53d6f5f44453a87611e2d72c8ef84d7b1eca070e719
Docker Compose version v5.2.0
```

Installed path:

```text
$HOME/.docker/cli-plugins/docker-compose
```

For this running Hermes profile, `$HOME` resolves to:

```text
/home/ashar/.hermes/profiles/yuna/home
```

### `pnpm deps:check`

Passed:

```text
$ node scripts/check-local-deps.mjs --check
$ docker compose version
Docker Compose version v5.2.0
exit=0
docker compose config passed.
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
```

### `pnpm deps:verify`

Passed. Key evidence:

```text
$ node scripts/check-local-deps.mjs --verify
$ docker compose version
Docker Compose version v5.2.0
exit=0
docker compose config passed.
$ docker compose up -d postgres redis
...
Container wordle-royale-redis Started
Container wordle-royale-postgres Started
exit=0
postgres health attempt 1/24: starting
...
postgres health attempt 8/24: starting
$ docker compose exec -T postgres pg_isready -U wordle -d wordle_royale_local
/var/run/postgresql:5432 - accepting connections
exit=0
$ docker compose exec -T redis redis-cli ping
PONG
exit=0
Local dependency verification passed: PostgreSQL and Redis are healthy and accepting connections.
$ docker compose down
Container wordle-royale-redis Stopped/Removed
Container wordle-royale-postgres Stopped/Removed
Network wordle-royale_default Removed
exit=0
```

### Cleanup verification

After `pnpm deps:verify`, checked for Wordle Royale containers:

```bash
docker ps -a --filter name=wordle-royale --format '{{.Names}} {{.Status}}'
```

Output was empty, confirming no matching containers were left running or stopped.

### Local smoke after Compose enablement

Passed with Compose validation active:

```text
$ node scripts/local-smoke.mjs
PASS docker-compose.yml exists
PASS .env.example exists
PASS .env.local.example exists
PASS docker compose config validates — configuration is syntactically valid
PASS workspace scaffold validates — pnpm validate:workspace passed
Local smoke passed. This smoke test validates local config only; it does not start app services.
```

### Lockfile / install note

Initial `pnpm deps:check` was blocked by pnpm’s workspace dependency status check because `apps/api/package.json` and `pnpm-lock.yaml` were out of sync in the current dirty workspace:

```text
[ERR_PNPM_OUTDATED_LOCKFILE] Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with <ROOT>/apps/api/package.json
Failure reason:
* 1 dependencies were added: @wordle-royale/game-engine@workspace:*
```

I ran:

```bash
CI=true pnpm install --no-frozen-lockfile
```

It completed with exit code `0`. Final frozen install verification passed:

```text
CI=true pnpm install --frozen-lockfile
Scope: all 10 workspace projects
Already up to date
Done in 367ms using pnpm v11.1.1
```

### Secret scan

Passed:

```text
$ node scripts/secret-scan.mjs
Secret scan passed (154 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

## Open Questions

None for Ticket 38.

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Backend/core owns Prisma migration, seed, API readiness, and DB-backed endpoint behavior.
- **Exact task:** Run Ticket 39 now that Docker Compose v2 and local PostgreSQL/Redis verification pass. Apply/validate the local DB migration path, run safe fixture seed, and smoke `/readyz`, `/auth/me`, `/profile/me`, and `/lobbies` against live local dependencies.
- **Inputs/context they need:** Ticket 38 result, `pnpm deps:verify` passing, Docker Compose v2 available as a user-level plugin in Yuna’s current environment, and Athena Wave F context.
- **Expected output back to Athena:** Live DB/Redis API smoke results with exact commands, HTTP status/body evidence, and cleanup state.

### Follow-up ticket 2

- **Target agent:** Jasmine
- **Why that agent is needed:** QA owns independent release confidence.
- **Exact task:** During Ticket 43, independently verify that Compose-backed dependency startup and cleanup remain reliable after Tickets 39–42.
- **Inputs/context they need:** Ticket 38 response and subsequent Freya/Luna/Ruby runtime responses.
- **Expected output back to Athena:** Independent PASS/WARN/FAIL verdict with reproduced commands and any remaining runtime blockers.

## Files Changed

Repository files:

- `agent-communication/responses/ticket-38-yuna-docker-compose-v2-live-deps-response.md`

Environment/tooling outside the repo:

- Installed user-level Docker Compose plugin at `$HOME/.docker/cli-plugins/docker-compose` for this Hermes/Yuna environment.

Operational note:

- `CI=true pnpm install --no-frozen-lockfile` was run to resolve current workspace lockfile drift before pnpm scripts would execute; final `CI=true pnpm install --frozen-lockfile` passes. The working tree already contains many uncommitted changes from prior tickets/waves, including `pnpm-lock.yaml` changes.

## Tests / Commands Run

```bash
docker --version
# exit code: 0
```

```bash
docker info --format '{{json .}}'
# exit code: 0
```

```bash
docker compose version
# initial exit code: 1 before plugin install
# final exit code: 0 after plugin install
```

```bash
curl -fsSL https://api.github.com/repos/docker/compose/releases/latest
# exit code: 0
```

```bash
curl -fL --retry 3 --output "$HOME/.docker/cli-plugins/docker-compose.tmp" "https://github.com/docker/compose/releases/download/v5.2.0/docker-compose-linux-x86_64"
# exit code: 0
```

```bash
curl -fL --retry 3 --output /tmp/docker-compose.sha256 "https://github.com/docker/compose/releases/download/v5.2.0/docker-compose-linux-x86_64.sha256"
# exit code: 0
```

```bash
sha256sum "$HOME/.docker/cli-plugins/docker-compose.tmp"
# matched published checksum
```

```bash
CI=true pnpm install --no-frozen-lockfile
# exit code: 0
```

```bash
CI=true pnpm deps:check
# exit code: 0
```

```bash
CI=true pnpm deps:verify
# exit code: 0
```

```bash
CI=true pnpm smoke:local
# exit code: 0
```

```bash
docker ps -a --filter name=wordle-royale --format '{{.Names}} {{.Status}}'
# exit code: 0; empty output
```

```bash
CI=true pnpm secret-scan
# exit code: 0
```

```bash
CI=true pnpm install --frozen-lockfile
# exit code: 0
```

## Evidence / Result

- Docker Compose v2 now works: `Docker Compose version v5.2.0`.
- `pnpm deps:check` passes.
- `pnpm deps:verify` starts PostgreSQL/Redis, verifies both, and cleans up.
- PostgreSQL readiness evidence: `/var/run/postgresql:5432 - accepting connections`.
- Redis readiness evidence: `PONG`.
- `pnpm smoke:local` now validates Compose config rather than skipping it.
- No `wordle-royale-*` containers remained after cleanup.
- `pnpm secret-scan` passes.
- Frozen pnpm install passes after lockfile sync.

## Risks / Blockers

- Docker Compose v2 was installed for this active Hermes/Yuna user environment, not system-wide. Other shells/profiles may still need their own plugin install or an OS package.
- First `pnpm deps:verify` pulled Docker images from Docker Hub; future runs depend on local cached images unless Docker image updates are pulled.
- The local Docker volumes were created during verification and removed containers/network afterward, but `docker compose down` without `--volumes` intentionally preserves named volumes. Use `pnpm deps:reset` only when a local destructive volume reset is intended.
- Live DB-backed API route verification is still Freya/Ticket 39 scope; Ticket 38 proves dependency runtime only.
