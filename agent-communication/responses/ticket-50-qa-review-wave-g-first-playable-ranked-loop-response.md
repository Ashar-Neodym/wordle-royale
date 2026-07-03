# Ticket 50 — QA Review Wave G First Playable Ranked Loop Response

Task: QA review Wave G first playable ranked loop foundation
Agent: Jasmine (QA)
Verdict: **PASS with warnings**

## Summary

I independently reviewed Wave G after Tickets 44–49 response files were present. I read the Wave F Athena review, ticket index, Wave G handoffs, inspected the changed-file surface, reran root/package gates, verified the normalized Docker Compose scripts, ran live Postgres/Redis readiness, applied migration/seed against local Postgres, exercised the ranked REST loop directly, browser-smoked the web live ranked entry flow and fallback mode, verified mobile build/readiness-card code path through package build, and repeated secret/dataset/free-local safety checks.

Wave G is a real improvement over Wave F: the project now has repeatable Compose scripts without manually exporting `DOCKER_CONFIG`, live ranked REST endpoints for start/state/guess, an internal rating finalization transaction slice with tests, web live lobby create/join/start flow, and mobile API readiness UI/build normalization.

I found **no P0/P1 blocker** for Wave G’s stated first-playable foundation scope.

## Ticket-by-ticket matrix

| Ticket | Area | QA status | Evidence | Blockers | Warnings |
|---|---|---:|---|---|---|
| 44 | Dev runtime Compose normalization | PASS | `pnpm deps:check`, `pnpm smoke:local`, and `pnpm deps:verify` resolved Compose via `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker` automatically and passed | None | Environment still ultimately depends on the Yuna-profile plugin path being present |
| 45 | Ranked gameplay API contract/state machine | PASS | Contracts tests/build pass via root gates; endpoint shapes implemented by Ticket 47 match start/state/guess scope | None | Contract includes future fields/sources not fully implemented yet; unsupported sources correctly rejected |
| 46 | Mobile API readiness card / Expo normalization | PASS with evidence caveat | `pnpm --filter @wordle-royale/mobile build` passed; `secret-scan` passed; no core SafeArea warning path observed in build | None | I did not repeat Expo Go on Ashar’s phone in this session; only local build/config/typecheck was independently rerun |
| 47 | Ranked REST endpoints live DB slice | PASS | Live curl smoke created/joined ranked lobby, started ranked match, fetched safe state, submitted guess; API tests 22/22 passed | None | Auth remains local stub auth; match completion/result route is not public yet |
| 48 | Rating finalization/leaderboard transaction slice | PASS for internal service | API tests include rating finalization 3/3 passing: default 1200, +16/-16, idempotency, voided no-rating | None | No public route triggers finalization yet; leaderboard snapshots are future work |
| 49 | Web live lobby actions and ranked entry flow | PASS with UX warnings | Browser smoke showed API connected, create/join/start flow, live ranked snapshot panel, and fixture fallback when API down; console 0 JS errors | None | Live gameplay panel is state display only; no web guess input yet. Existing older casual lobbies can make the visible list noisy |

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---:|---|
| Review Tickets 44–49 responses and changed files | PASS | Response files present and read; git status/diff surface inspected |
| Re-run root/package gates | PASS | Combined command passed with exit 0 |
| Verify Docker/Compose runtime instructions repeatable | PASS | `pnpm deps:check`, `pnpm smoke:local`, `pnpm deps:verify`, `pnpm deps:up`, and `pnpm deps:down` worked without manually exporting `DOCKER_CONFIG` |
| Verify ranked backend service/endpoints/rating slice | PASS | API tests 22/22 passed; live start/state/guess smoke passed; rating finalization tests passed |
| Verify web live action flow and fallback behavior | PASS | Browser live flow and fallback state both verified; console clean |
| Verify mobile readiness card/build | PASS with caveat | Mobile build passed; no phone smoke repeated |
| Separate PASS/WARN/FAIL/blockers | PASS | This report separates blockers and warnings |
| List files changed | PASS | Changed-file summary included below |
| Write response file | PASS | This file created at required response path |
| Do not push | PASS | No push performed |

## Commands run and results

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

### Context/discovery

```bash
read_file docs/2026-06-29-athena-review-after-tickets-38-43.md
read_file agent-communication/index.md
search_files agent-communication/responses 'ticket-4[4-9]*.md'
git status --short
git diff --stat
search_files content 'matches/ranked|RankedMatch|finalizeRanked|ApiReadiness|startRanked|submitGuess'
```

Result: Ticket 44–49 responses were present. Working tree is broad and still uncommitted.

### Root/package gates

```bash
pnpm install --frozen-lockfile && \
pnpm lint && \
pnpm typecheck && \
pnpm test && \
pnpm build && \
pnpm secret-scan && \
pnpm deps:check && \
pnpm smoke:local && \
pnpm --filter @wordle-royale/api test && \
pnpm --filter @wordle-royale/web build && \
pnpm --filter @wordle-royale/mobile build
```

Exit code: `0`.

Key output excerpts:

```text
Scope: all 10 workspace projects
Already up to date
Done in 352ms using pnpm v11.1.1
```

```text
Workspace scaffold validation passed (9 workspace packages).
```

```text
apps/web build: ✓ Compiled successfully
apps/api build: Done
apps/mobile build: $ expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json
```

```text
Secret scan passed (161 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

```text
Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker.
Docker Compose version v5.2.0
docker compose config passed.
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
```

```text
PASS docker-compose.yml exists
PASS .env.example exists
PASS .env.local.example exists
INFO docker compose resolution — DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker
PASS docker compose config validates — configuration is syntactically valid
PASS workspace scaffold validates — pnpm validate:workspace passed
Local smoke passed. This smoke test validates local config only; it does not start app services.
```

API tests:

```text
ℹ tests 22
ℹ suites 4
ℹ pass 22
ℹ fail 0
```

Included suites:

- `api skeleton`
- `ranked gameplay REST endpoints`
- `GameplayPersistenceService`
- `GameplayPersistenceService rating finalization`

### Repeatable dependency verification

```bash
pnpm deps:verify
```

Exit code: `0`.

Evidence:

```text
Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker.
Docker Compose version v5.2.0
docker compose config passed.
$ docker compose up -d postgres redis
postgres health attempt 1/24: starting
$ docker compose exec -T postgres pg_isready -U wordle -d wordle_royale_local
/var/run/postgresql:5432 - accepting connections
$ docker compose exec -T redis redis-cli ping
PONG
Local dependency verification passed: PostgreSQL and Redis are healthy and accepting connections.
$ docker compose down
```

### Live dependency start and readiness

```bash
pnpm deps:up
# then health loop + pg_isready + redis-cli ping
```

Exit code: `0`.

Output:

```text
Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker.
attempt 1 postgres=starting redis=starting
attempt 2 postgres=starting redis=starting
attempt 3 postgres=starting redis=starting
attempt 4 postgres=healthy redis=healthy
/var/run/postgresql:5432 - accepting connections
PONG
```

### Migration/seed and local DB counts

```bash
DATABASE_URL='postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public' pnpm --filter @wordle-royale/api db:migrate:deploy
DATABASE_URL='postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public' pnpm --filter @wordle-royale/api db:seed:local
```

Exit code: `0` for migration/seed.

Output:

```text
1 migration found in prisma/migrations
No pending migrations to apply.
Applied local fixture seed: en-5-test-vfixture.001
```

I initially queried an old table name (`"User"`) and got `relation "User" does not exist`; corrected to current Prisma table names. Corrected DB counts:

```text
releases | words | users | profiles | rating_profiles | matches
---------+-------+-------+----------+-----------------+--------
       1 |    63 |     6 |        6 |               4 |      2
```

Counts include prior local smoke data because the local DB is persistent/non-reset. I did not treat that as a failure.

### Live API readiness

Started API on `http://127.0.0.1:3020` with local Postgres/Redis.

Readiness check:

```bash
curl -sS -i --max-time 10 http://127.0.0.1:3020/readyz
```

Output excerpt:

```text
HTTP/1.1 200 OK
{"data":{"status":"ok","service":"wordle-royale-api","environment":"development","dependencies":{"database":{"status":"ok"},"redis":{"status":"ok"}}},"error":null,"requestId":"4594d584-214f-4bc9-a365-42c4163046c0"}
```

### Live ranked REST smoke

Flow:

1. `POST /lobbies` creates a public rated/ranked-compatible lobby.
2. `POST /lobbies/:lobbyId/join` adds local guest stub.
3. `POST /matches/ranked/start` starts ranked match.
4. `GET /matches/:matchId/state` returns active spoiler-safe match state.
5. `POST /matches/:matchId/rounds/:roundId/guesses` submits `CRANE` through server-authoritative scoring.

Exit code: `0` for the corrected live flow.

Evidence excerpt:

```json
{
  "lobby": {
    "id": "df4a974a-cae9-4f3c-a3e6-03652db2f536",
    "code": "3C5284",
    "rankedCompatible": true,
    "membersAfterJoin": 2
  },
  "start": {
    "matchId": "00931597-506f-44f5-b7d6-aaed80eb3ccd",
    "roundId": "0ec38e7b-50ab-4a11-afbc-d2951402746b",
    "state": "in_progress",
    "roundState": "active"
  },
  "state": {
    "state": "in_progress",
    "myGuesses": 0,
    "standingCount": 2
  },
  "guess": {
    "accepted": true,
    "valid": true,
    "guessNumber": 1,
    "feedbackLength": 5,
    "playerRoundState": "active",
    "roundState": "active",
    "score": 0
  }
}
```

Raw API responses inspected did **not** include plaintext answer, `answerWordHash`, or `answerWordSaltRef` in active start/state/guess output.

### Web live action flow and fallback smoke

Started web on `http://127.0.0.1:3102` with:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3020 pnpm --filter @wordle-royale/web dev --hostname 127.0.0.1 --port 3102
```

Browser live state at `http://127.0.0.1:3102/` showed:

- page title `Wordle Royale — Crown Grid Arena`;
- `API connected · readiness ok`;
- `database: ok · redis: ok`;
- `LOCAL API ROUTE`;
- live lobby browser;
- enabled live action buttons when API reachable.

Browser action flow verified:

- create ranked lobby succeeded and showed success message;
- join lobby succeeded and changed the created lobby to `2/4 players`;
- start ranked succeeded and redirected with `action=start_ranked&status=success`;
- live gameplay panel rendered `LIVE RANKED GAMEPLAY`, `Live ranked REST`, `in progress`, `Round 1 · active · 5 letters · max 6 guesses`, two live standings, and the text `Answer, hash, and salt are intentionally absent from active state.`

Browser console after live ranked state: `0` console messages, `0` JS errors.

Fallback verification after killing API and reloading web:

- status alert: `Using fixture fallbacks because http://127.0.0.1:3020 is unavailable: fetch failed`;
- lobby source label: `FIXTURE FALLBACK`;
- live action buttons disabled;
- fallback lobbies `CROWN1` and `GRID22` rendered;
- browser console: `0` console messages, `0` JS errors.

Visual evidence: screenshot captured during live ranked state showed the connected API status card, success panel for the ranked match, and the live ranked gameplay snapshot. I saw no visual blocker.

### Mobile readiness/build

Verified through package build in the root/package gate:

```bash
pnpm --filter @wordle-royale/mobile build
```

Exit code: `0`.

Output:

```text
$ expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json
```

I did not repeat Expo Go on Ashar’s phone because this session has no direct phone/simulator control. That remains a warning only.

### Safety checks

Files matching `.env*`:

```text
apps/web/.env.local.example
.env.local.example
.env.example
```

No real `.env` file was found.

Word-tool data files remained fixture/source-example only:

```text
packages/word-tools/data/fixtures/en-5-test-answer-vfixture.001.json
packages/word-tools/data/fixtures/en-5-test-guess-vfixture.001.json
packages/word-tools/data/fixtures/en-5-test-banned-vfixture.001.json
packages/word-tools/data/fixtures/manifest.fixture.json
packages/word-tools/data/reports/en-5-test-vfixture.001.validation-report.json
packages/word-tools/data/sources/sources.example.json
packages/word-tools/data/sources/README.md
```

`pnpm secret-scan` passed. Broad keyword search for secret/paid/proprietary/provider terms found expected placeholders, docs/planning references, and scanner source patterns. I did not find an obvious real secret, paid-service SDK/config, cloud provisioning, or proprietary dictionary dataset.

### Cleanup

Killed API and web background processes, then ran:

```bash
pnpm deps:down && docker ps --filter 'name=wordle-royale' --format '{{.Names}} {{.Status}}'
```

Exit code: `0`.

Output showed Postgres/Redis containers and network removed. Final `docker ps` output for `wordle-royale` containers was empty.

## Findings

### Blockers

None found for Wave G’s stated first-playable ranked-loop foundation scope.

### Warnings / follow-up risks

1. **Auth remains stubbed.** The ranked REST loop uses local stub user identity. This is acceptable for local first-playable foundation but not production-safe.
2. **No public match completion/rating finalization route yet.** Rating finalization is covered by service tests, but live end-to-end user flow stops at start/state/guess.
3. **Web has live start/state display but no live guess input yet.** The live gameplay panel proves server state rendering, not an interactive playable Wordle board.
4. **Mobile was not phone-smoked by Jasmine.** Build/config/typecheck passed; repeat Expo Go/device evidence should be captured in a later QA pass.
5. **Persistent local DB causes noisy state.** Counts and visible lobbies include prior smoke data unless the DB is reset. This made the web lobby list show older casual lobbies after the started ranked lobby moved out of open list.
6. **Compose normalization still relies on discovering a user/profile plugin path.** The repo scripts now hide the manual prefix, but the underlying environment dependency remains.
7. **Untracked build artifact present:** `apps/web/tsconfig.tsbuildinfo` appears in `git status`. It should not be committed unless intentionally tracked; likely add/remove via `.gitignore`/cleanup before Athena commits.
8. **Secret scan is lightweight.** It passed, but this is not a full security audit.

## Recommended Wave H blockers before calling it playable

1. Add web live guess submission against `POST /matches/:matchId/rounds/:roundId/guesses` and render returned feedback from the live API.
2. Add a match completion/result path that invokes rating finalization and exposes a spoiler-safe result summary.
3. Add deterministic QA reset/isolation for local DB, or document a standard `deps:reset` before browser QA.
4. Replace or explicitly label stub auth before any multiplayer trust/security claims.
5. Repeat mobile smoke with direct screenshot/log evidence from Expo Go or emulator.
6. Remove/ignore generated build artifacts such as `apps/web/tsconfig.tsbuildinfo` before commit.

## Files changed by Jasmine

Created:

- `agent-communication/responses/ticket-50-qa-review-wave-g-first-playable-ranked-loop-response.md`

No application/source implementation files were edited by Jasmine.

Runtime side effects from QA:

- Started/stopped local Postgres/Redis via `pnpm deps:up`/`pnpm deps:down`.
- Ran Prisma migration deploy and safe local seed against local Postgres.
- Created/joined multiple local smoke lobbies and started local ranked matches.
- Submitted a local test guess (`CRANE`) to a ranked round.
- Started/killed local API and web dev servers.
- Verified containers were cleaned up.

## Commit / push recommendation

- **Commit:** Yes, after Athena reviews broad working tree, removes/ignores generated artifacts, and groups the Wave G changes coherently.
- **Push:** No. I did not push, per constraint.
