# Ticket 55 — Repeatable Ranked Smoke DB Reset and Dev Script Response

## What I understood

Yuna needed to make live ranked smoke tests repeatable by adding or documenting a safe local-only reset/seed path. The reset must clear accumulated local lobbies/matches/rating smoke data without risking production data, should use existing deterministic fixture seed data, and should be verified with the normalized Docker dependency scripts from Ticket 44.

Scope constraints followed:

- No paid SaaS/cloud resources.
- No GitHub push/deploy.
- No real `.env` file created.
- No production/shared DB target used.
- Preserved spoiler safety: logs report fixture counts/version only, not plaintext fixture answer lists.

## What I did

Added a guarded repo-level ranked smoke reset script:

```bash
pnpm ranked:smoke:reset
```

Package-scoped alias:

```bash
pnpm --filter @wordle-royale/api db:reset:ranked-smoke
```

Expected local workflow:

```bash
pnpm deps:up
pnpm ranked:smoke:reset
pnpm deps:down
```

The reset script:

1. Requires a local Compose-shaped PostgreSQL target:
   - host: `localhost`, `127.0.0.1`, or `::1`
   - port: `5432`
   - user: `wordle`
   - database: `wordle_royale_local`
   - no `sslmode=require`
2. Refuses production-like environments:
   - `NODE_ENV=production`
   - `APP_ENV=production` / `prod`
   - `VERCEL_ENV=preview`, `staging`, or `production`
3. Runs Prisma reset/apply against the current local schema:
   - `prisma db push --force-reset --accept-data-loss --skip-generate`
4. Runs the existing local fixture seed:
   - `pnpm --filter @wordle-royale/api db:seed:local`

This clears accumulated local smoke data such as lobbies, matches, guesses, reports, rating events, snapshots, and participant state, then reseeds deterministic fixture users/dictionary/rating profiles.

## Files changed

- `scripts/reset-ranked-smoke-db.mjs`
  - New guarded local-only ranked smoke reset script.
- `package.json`
  - Added `ranked:smoke:reset` script.
- `apps/api/package.json`
  - Added `db:reset:ranked-smoke` alias.
- `docs/local-development.md`
  - Documented the repeatable ranked smoke reset workflow and safety constraints.
- `apps/api/README.md`
  - Documented the API package reset alias and local-only guard behavior.

## Verification commands run

### 1. Frozen install

```bash
CI=true pnpm install --frozen-lockfile
```

Result: exit 0

Evidence:

```text
Scope: all 10 workspace projects
Already up to date
Done in 378ms using pnpm v11.1.1
```

### 2. Compose check

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

### 3. Start local dependencies

```bash
CI=true pnpm deps:up
```

Result: exit 0

Evidence:

```text
$ node scripts/docker-compose.mjs up -d postgres redis
Using Docker Compose from current environment.
Container wordle-royale-postgres Started
Container wordle-royale-redis Started
```

### 4. Prisma schema validation

```bash
CI=true pnpm --filter @wordle-royale/api db:validate
```

Result: exit 0

Evidence:

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

### 5. Ranked smoke reset script

```bash
CI=true pnpm ranked:smoke:reset
```

Result: exit 0

Evidence:

```text
Ranked smoke local DB reset guard passed.
Target: local Compose PostgreSQL database wordle_royale_local on localhost:5432.
This will reset local schema data, apply the current Prisma schema, and seed deterministic fixture users/dictionary data.
$ pnpm --filter @wordle-royale/api exec prisma db push --schema prisma/schema.prisma --force-reset --accept-data-loss --skip-generate
The PostgreSQL database "wordle_royale_local" schema "public" at "localhost:5432" was successfully reset.
Your database is now in sync with your Prisma schema.
$ pnpm --filter @wordle-royale/api db:seed:local
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
```

### 6. Package-scoped alias + seeded counts

```bash
CI=true pnpm deps:up
# wait for pg_isready
CI=true pnpm --filter @wordle-royale/api db:reset:ranked-smoke
docker exec wordle-royale-postgres psql -U wordle -d wordle_royale_local -tAc 'select (select count(*) from "UserAccount") as users, (select count(*) from "DictionaryRelease") as dictionaries, (select count(*) from "DictionaryWord") as words, (select count(*) from "Match") as matches;'
```

Result: exit 0

Evidence:

```text
/var/run/postgresql:5432 - accepting connections
$ node ../../scripts/reset-ranked-smoke-db.mjs
Ranked smoke local DB reset guard passed.
...
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
4|1|63|0
```

Interpretation:

- 4 fixture users seeded.
- 1 fixture dictionary release seeded.
- 63 fixture dictionary words seeded.
- 0 matches after reset, confirming ranked smoke match/lobby accumulation was cleared.

### 7. Production guard check

```bash
NODE_ENV=production pnpm ranked:smoke:reset
```

Result: exit 1 as expected

Evidence:

```text
Refusing ranked smoke reset: production-like environment detected (production).
production_guard_exit=1
```

### 8. Cleanup

```bash
CI=true pnpm deps:down
docker ps -a --filter 'name=wordle-royale' --format '{{.Names}} {{.Status}}'
```

Results:

- `pnpm deps:down` exit 0
- `docker ps ...` exit 0 with empty output

Evidence:

```text
Container wordle-royale-redis Removed
Container wordle-royale-postgres Removed
Network wordle-royale_default Removed
```

### 9. Secret scan

```bash
CI=true pnpm secret-scan
```

Result: exit 0

Evidence:

```text
Secret scan passed (166 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

## Evidence/result

Ticket 55 acceptance criteria are met:

- Added a safe local-only ranked smoke DB reset/seed path.
- Added root and API-package pnpm scripts.
- Documented usage and safety constraints.
- Verified `deps:up`, reset/seed behavior, schema validation, production guard refusal, `deps:down`, no remaining containers, and secret scan.
- No production data path was used.

## Blockers

None.

## Warnings / risks

- The reset uses Prisma `db push --force-reset`, which is intentionally destructive for the local Compose database. The guard limits it to `wordle@localhost:5432/wordle_royale_local` and refuses production-like envs, but developers should still only run it for local ranked smoke reset.
- The reset does not start Docker itself. The intended sequence is still explicit and reviewable: `pnpm deps:up`, `pnpm ranked:smoke:reset`, `pnpm deps:down`.
- The script uses the current Prisma schema rather than historical migrations, which is appropriate for fast local smoke reset but not a production migration substitute.

## Follow-up tickets

None required from Yuna for Ticket 55.

Optional future ticket:

- Target agent: Jasmine
- Why that agent is needed: Independent QA should use the new reset path before Wave H final verification.
- Exact task: For Ticket 57, start from `pnpm deps:up && pnpm ranked:smoke:reset`, run the ranked loop smoke checks, then `pnpm deps:down`, and confirm match/rating/leaderboard behavior is repeatable from a clean local fixture state.
- Inputs/context they need: This Ticket 55 response, Ticket 52 endpoint names, Ticket 53 leaderboard read model, Ticket 54 web ranked UI behavior.
- Expected output back to Athena: QA evidence showing the complete ranked loop works from a clean reset state, plus any remaining P0/P1/P2 issues.
