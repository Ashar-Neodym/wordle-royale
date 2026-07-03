# Ticket 44 — Dev Runtime Compose Normalization and Smoke Scripts Response

## What I understood

Yuna needed to normalize the Wave F Docker Compose workaround into repeatable repo-local scripts/docs so other Hermes profiles/sessions do not have to remember the Yuna-specific `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker` prefix for standard local dependency checks.

Scope constraints I followed:

- No system-wide package installs.
- No paid/cloud resources.
- No real `.env` files or secrets created.
- No GitHub push/deploy.
- Keep changes focused to local-dev scripts/docs.

## What I did

Implemented a repo-local Docker Compose resolver and wired the local dependency commands through it.

### Script behavior now

The repo scripts try Docker Compose v2 from:

1. the current shell environment,
2. explicit `DOCKER_CONFIG`, if set,
3. the current `$HOME/.docker`,
4. `/home/ashar/.docker`,
5. known Hermes profile Docker configs under `/home/ashar/.hermes/profiles/*/home/.docker`, including Yuna's Compose plugin path.

This means standard repo commands can work from a profile/session whose `$HOME` does not contain the Compose plugin, as long as the known user-local plugin remains available.

### Canonical commands

Kept these as the canonical checks:

```bash
pnpm deps:check
pnpm deps:verify
pnpm smoke:local
```

Also normalized service lifecycle scripts so they do not directly depend on bare `docker compose` discovery:

```bash
pnpm deps:up
pnpm deps:down
pnpm deps:reset
```

## Files changed

- `scripts/docker-compose-env.mjs`
  - New shared helper for resolving a usable Docker Compose v2 environment.
- `scripts/docker-compose.mjs`
  - New wrapper for `docker compose ...` lifecycle commands using the resolver.
- `scripts/check-local-deps.mjs`
  - Uses the resolver for `deps:check` and `deps:verify`.
  - Logs which Compose environment was selected.
  - Uses the resolved environment for `docker compose config`, `up`, `exec`, and `down`.
- `scripts/local-smoke.mjs`
  - Uses the resolver before deciding whether Compose config validation should run or be skipped.
- `package.json`
  - Routes `deps:up`, `deps:down`, and `deps:reset` through `scripts/docker-compose.mjs`.
  - Keeps `deps:check` and `deps:verify` as canonical scripts.
- `docs/local-development.md`
  - Documents Compose discovery behavior.
  - Documents that normal repo checks no longer require remembering the Yuna `DOCKER_CONFIG` prefix.
  - Keeps the manual `DOCKER_CONFIG=... docker compose version` command as a fallback for direct Docker usage.

## Verification commands run

### 1. Frozen install

```bash
CI=true pnpm install --frozen-lockfile
```

Result: exit 0

Summary:

```text
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Done in 1m 8.2s using pnpm v11.1.1
```

### 2. Local smoke

```bash
CI=true pnpm smoke:local
```

Result: exit 0

Evidence:

```text
PASS docker-compose.yml exists
PASS .env.example exists
PASS .env.local.example exists
INFO docker compose resolution — current environment
PASS docker compose config validates — configuration is syntactically valid
PASS workspace scaffold validates — pnpm validate:workspace passed
Local smoke passed. This smoke test validates local config only; it does not start app services.
```

### 3. Canonical dependency check

```bash
CI=true pnpm deps:check
```

Result: exit 0

Evidence:

```text
Using Docker Compose from current environment.
Docker Compose version v5.2.0
docker compose config passed.
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
```

### 4. Canonical dependency verification with live PostgreSQL/Redis

```bash
CI=true pnpm deps:verify
```

Result: exit 0

Evidence:

```text
Using Docker Compose from current environment.
Docker Compose version v5.2.0
docker compose config passed.
$ docker compose up -d postgres redis
exit=0
postgres health attempt 1/24: starting
postgres health attempt 2/24: starting
$ docker compose exec -T postgres pg_isready -U wordle -d wordle_royale_local
/var/run/postgresql:5432 - accepting connections
exit=0
$ docker compose exec -T redis redis-cli ping
PONG
exit=0
Local dependency verification passed: PostgreSQL and Redis are healthy and accepting connections.
$ docker compose down
exit=0
```

### 5. Secret scan

```bash
CI=true pnpm secret-scan
```

Result: exit 0

Evidence:

```text
Secret scan passed (157 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

### 6. Simulated non-Yuna profile/session fallback

I simulated a session without Yuna's `$HOME` and without `DOCKER_CONFIG`:

```bash
CI=true env -u DOCKER_CONFIG HOME=/tmp/nonexistent-hermes-profile pnpm deps:check
CI=true env -u DOCKER_CONFIG HOME=/tmp/nonexistent-hermes-profile pnpm smoke:local
```

Result: both exit 0

Evidence:

```text
Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker.
Docker Compose version v5.2.0
docker compose config passed.
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.

PASS docker-compose.yml exists
PASS .env.example exists
PASS .env.local.example exists
INFO docker compose resolution — DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker
PASS docker compose config validates — configuration is syntactically valid
PASS workspace scaffold validates — pnpm validate:workspace passed
Local smoke passed. This smoke test validates local config only; it does not start app services.
```

### 7. Simulated non-Yuna lifecycle wrapper

```bash
CI=true env -u DOCKER_CONFIG HOME=/tmp/nonexistent-hermes-profile pnpm deps:up
CI=true env -u DOCKER_CONFIG HOME=/tmp/nonexistent-hermes-profile pnpm deps:down
```

Result: both exit 0

Evidence:

```text
$ node scripts/docker-compose.mjs up -d postgres redis
Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker.
Container wordle-royale-postgres Started
Container wordle-royale-redis Started

$ node scripts/docker-compose.mjs down
Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker.
Container wordle-royale-redis Removed
Container wordle-royale-postgres Removed
Network wordle-royale_default Removed
```

### 8. Cleanup verification

```bash
docker ps -a --filter 'name=wordle-royale' --format '{{.Names}} {{.Status}}'
```

Result: exit 0 with empty output, confirming no `wordle-royale-*` containers remained.

## Evidence/result

Ticket 44 acceptance criteria are met:

- Implemented repo-local Compose environment discovery.
- `pnpm deps:check` and `pnpm deps:verify` remain canonical and passed.
- `pnpm smoke:local` now uses the same resolver and validates Compose config when the profile fallback is available.
- Verified PostgreSQL and Redis start, report ready, and stop cleanly.
- Verified the fallback path by simulating a non-Yuna `$HOME` without `DOCKER_CONFIG`.
- Wrote this response to the required response path.

## Blockers

None.

## Warnings / risks

- The fallback intentionally depends on the existing user-local Compose plugin path, especially `/home/ashar/.hermes/profiles/yuna/home/.docker`. If that plugin is deleted, profiles without their own Compose plugin will fall back to the usual unavailable-Compose warning.
- This does not install Compose system-wide, by design and per ticket constraints.
- `pnpm deps:reset` remains destructive for local Docker volumes only; docs still call that out.

## Follow-up tickets

None required from Yuna for Ticket 44.

Optional future ticket if Athena wants stronger profile independence:

- Target agent: Yuna
- Why that agent is needed: This is local-dev operations/tooling.
- Exact task: Add a documented `pnpm deps:compose:install-user` helper that installs or refreshes a user-local Docker Compose plugin for the active Hermes profile after explicit human approval.
- Inputs/context they need: Ticket 38 Compose install notes, Ticket 44 resolver behavior, target profile path.
- Expected output back to Athena: A script/doc update plus checksum-verified install evidence, without system-wide package installs.
