# Ticket 64 — QA Review Wave I Demo-Stable Ranked Loop Response

Task: QA review Wave I demo-stable ranked loop
Agent: Jasmine (QA)
Verdict: **CONDITIONAL PASS**

## Summary

Wave I materially satisfies the demo-stable ranked-loop goal: the API, web, mobile build checks, seeded stub users, guarded dev multi-user helpers, natural terminalization regression coverage, HTTP-only ranked demo smoke, and web live-match presentation all verify successfully.

I am not giving a clean PASS because the documented copy-paste reset command is not fully stable in this Hermes/Jasmine shell: `pnpm ranked:smoke:reset` failed after `pnpm deps:up` unless I manually exported the Yuna Docker Compose plugin path. This is exactly the kind of demo friction Wave I was supposed to remove. The workaround is known and the ranked loop itself works once the reset is run with `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker`, so this is a conditional pass rather than a functional fail.

## Acceptance criteria checked

- Reviewed Ticket 58–63 response files and Wave H carry-forward warnings.
- Inspected relevant script/API/web surfaces for the new ranked reset/bootstrap/demo/helper/live-match paths.
- Reran broad repo gates and package gates.
- Verified seeded local stub users can create/join a lobby without calling `/auth/me`.
- Verified ranked E2E demo completes through HTTP only, including create lobby, join, start match, guess, dev-helper terminalization, rating finalization, repeated completion idempotency, result, leaderboard, and spoiler leak check.
- Verified production-mode dev terminalization helper is rejected with `403 dev_helper_disabled`.
- Verified web live match URL renders a focused live board/result/rating view with practice fixture board hidden.
- Verified browser console for the live match page showed no JS errors.
- Verified mobile build/config gates from the repo; Ticket 63's real-phone observation remains based on Ashar/Luna handoff, not re-run by Jasmine on a physical phone.
- Checked for obvious secrets/destructive-production risk; reset guard still targets local DB shape only, and `pnpm secret-scan` passed.
- Did not push.

## Commands run + exit codes

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Broad gate chain — **exit 0**:

```bash
pnpm install --frozen-lockfile && \
pnpm lint && \
pnpm typecheck && \
pnpm test && \
pnpm build && \
pnpm smoke:local && \
pnpm secret-scan && \
pnpm deps:check && \
pnpm --filter @wordle-royale/api test && \
pnpm --filter @wordle-royale/web build && \
pnpm --filter @wordle-royale/mobile build
```

Key output:

```text
Already up to date
Workspace scaffold validation passed (9 workspace packages).
Local smoke passed. This smoke test validates local config only; it does not start app services.
Secret scan passed (168 source/config files scanned).
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
ℹ tests 32
ℹ suites 6
ℹ pass 32
ℹ fail 0
apps/web build: ✓ Compiled successfully
apps/mobile build: $ expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json
```

Documented reset flow — **exit 1** in Jasmine shell:

```bash
pnpm deps:up && pnpm ranked:smoke:reset
```

Failure evidence:

```text
$ node scripts/reset-ranked-smoke-db.mjs
Ranked smoke local DB reset guard passed.
Target: local Compose PostgreSQL database wordle_royale_local on localhost:5432.
unknown shorthand flag: 'T' in -T
Refusing ranked smoke reset: local Compose PostgreSQL did not become ready within 20 seconds.
[ELIFECYCLE] Command failed with exit code 1.
```

Reset workaround using the known local Compose plugin path — **exit 0**:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm ranked:smoke:reset
```

Key output:

```text
/var/run/postgresql:5432 - accepting connections
DROP SCHEMA
CREATE SCHEMA
🚀  Your database is now in sync with your Prisma schema. Done in 10.66s
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
```

API readiness — **exit 0**:

```bash
PORT=4064 DATABASE_URL='<local-postgres-url>' REDIS_URL='<local-redis-url>' pnpm --filter @wordle-royale/api dev
curl -fsS http://127.0.0.1:4064/readyz
```

Key output:

```json
{"data":{"status":"ok","service":"wordle-royale-api","environment":"development","dependencies":{"database":{"status":"ok"},"redis":{"status":"ok"}}},"error":null}
```

Direct lobby bootstrap without `/auth/me` — **exit 0**:

```bash
API_BASE_URL=http://127.0.0.1:4064 pnpm ranked:smoke:bootstrap
```

Key output:

```json
{
  "result": "ok",
  "note": "Created and joined a rated lobby without calling /auth/me first.",
  "members": [
    { "userId": "11111111-1111-4111-8111-111111111111", "handle": "player_one", "role": "host" },
    { "userId": "22222222-2222-4222-8222-222222222222", "handle": "guest_player", "role": "player" }
  ]
}
```

Ranked E2E demo smoke — **exit 0**:

```bash
API_BASE_URL=http://127.0.0.1:4064 pnpm ranked:demo:e2e
```

Key output:

```json
{
  "result": "ok",
  "note": "Ranked demo E2E completed through HTTP only; no manual DB edits required.",
  "statuses": {
    "ready": 200,
    "createLobby": 201,
    "joinLobby": 201,
    "startMatch": 201,
    "hostGuess": 201,
    "guestState": 200,
    "terminalizeHost": 201,
    "terminalizeGuest": 201,
    "complete": 201,
    "repeatComplete": 201,
    "result": 200,
    "leaderboard": 200
  },
  "hostGuessAccepted": true,
  "guestPlayerRoundStateBeforeHelper": "active",
  "terminalStates": { "host": "solved", "guest": "failed" },
  "ratingDeltas": [
    { "userId": "11111111-1111-4111-8111-111111111111", "ratingDelta": 16 },
    { "userId": "22222222-2222-4222-8222-222222222222", "ratingDelta": -16 }
  ],
  "leaderboardEntries": 2,
  "leaks": []
}
```

Production-mode dev helper guard — **exit 0** for the curl command; API returned expected HTTP 403:

```bash
NODE_ENV=production PORT=4065 DATABASE_URL='<local-postgres-url>' REDIS_URL='<local-redis-url>' pnpm --filter @wordle-royale/api dev
curl -sS -w '\nHTTP %{http_code}\n' \
  -X POST http://127.0.0.1:4065/matches/dev/11111111-1111-4111-8111-111111111111/users/11111111-1111-4111-8111-111111111111/terminalize \
  -H 'content-type: application/json' \
  -d '{"outcome":"failed","finalScore":0}'
```

Output:

```json
{"data":null,"error":{"code":"dev_helper_disabled","message":"Local ranked smoke helpers are disabled outside local/dev/test environments.","details":{}},"requestId":"71b30a81-af5d-4b3c-b2f4-432cb04b6a9e"}
HTTP 403
```

Web smoke — **pass**:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:4064 pnpm --filter @wordle-royale/web exec next dev --hostname 127.0.0.1 --port 4066
```

Visited:

```text
http://127.0.0.1:4066/?matchId=ff82edc1-d89b-4435-83e5-71464228bfc9#gameplay
```

Browser console:

```text
console_messages: []
js_errors: []
total_errors: 0
```

## Browser / visual evidence

Observed live match page state:

- Header: `LIVE RANKED MATCH` and `Board first. Result and ratings stay with the match.`
- Server status: `Server online · ok`, `database: ok · redis: ok`.
- Current game section: `LIVE BOARD`, completed server game board rendered.
- Standings/result panel is adjacent to the live board and shows rating deltas `1200 → 1216 (+16)` and `1200 → 1184 (-16)`.
- Explicit note: `Practice board hidden during live match.`
- Lower section is labeled `Ratings after this match` and shows Player One / Guest Player ratings.
- No fixture practice Wordle board appears in the live-match view; the fixture board still appears on `/` without `matchId`, as intended.

## Findings

### Conditional blocker before demo handoff — `ranked:smoke:reset` does not reuse Docker Compose discovery

Severity: Medium
Owner: Yuna

Repro:

1. From the Jasmine/Hermes shell, run:
   ```bash
   pnpm deps:up
   pnpm ranked:smoke:reset
   ```
2. Observe `unknown shorthand flag: 'T' in -T` and reset timeout.
3. Run:
   ```bash
   DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm ranked:smoke:reset
   ```
4. Reset succeeds.

Expected:

- The documented Wave I copy-paste command `pnpm ranked:smoke:reset` should work after `pnpm deps:up` in the same supported Hermes environment, or the docs should explicitly include the needed `DOCKER_CONFIG` prefix.

Actual:

- `deps:up` uses the repo Docker Compose resolver successfully.
- `reset-ranked-smoke-db.mjs` calls raw `docker compose exec -T ...` and fails in this shell unless `DOCKER_CONFIG` is manually exported.

Likely fix:

- Update `scripts/reset-ranked-smoke-db.mjs` to use the same Docker Compose environment/resolver path as `scripts/docker-compose.mjs` / `check-local-deps.mjs`, or document the prefix in the demo flow. Prefer fixing the script so the copy-paste demo remains stable.

### Warning — mobile real-phone runtime not independently rerun by Jasmine

Severity: Low
Owner: Luna / Ashar if physical-device confirmation is required

- I verified mobile build/config gates through the repo command chain.
- Ticket 63 reports Ashar confirmed Expo Go opened without red-screen/runtime error.
- I did not personally rerun a physical phone smoke in this QA pass.

### Warning — ranked demo still depends on dev helper for deterministic guest terminalization

Severity: Low / accepted MVP constraint
Owner: Freya/Ruby for future production-auth multiplayer

- The demo no longer requires DB edits and the helper is correctly production-guarded.
- This is acceptable for Wave I, but it is still not a true two-authenticated-user production gameplay flow.

## Regression / security / scope notes

- No paid SaaS, cloud resources, proprietary datasets, deployment, or GitHub push observed.
- Secret scan passed.
- Spoiler leak check in `ranked:demo:e2e` returned `"leaks": []`.
- Production-mode helper guard returned `403 dev_helper_disabled`.
- Reset script maintains local DB shape guards, but its Docker Compose discovery is inconsistent with the other repo scripts.
- Running Next dev generated `apps/web/next-env.d.ts` / `apps/web/tsconfig.tsbuildinfo` locally; I reverted/removed those verification artifacts before finishing.

## Required fixes / owner

1. **Yuna** — fix `scripts/reset-ranked-smoke-db.mjs` to use shared Docker Compose discovery or update the documented demo flow. This is required before calling the local demo copy-paste-stable.

## Residual risks

- Auth remains local/stubbed; real multi-user auth remains future scope.
- Rating algorithm remains placeholder/provisional rather than full competitive Elo/Glicko.
- Mobile phone result relies on prior Ashar/Luna confirmation, not fresh Jasmine device access.
- The current working tree contains many prior-wave uncommitted/untracked files; I reviewed and tested the Wave I surface but did not attempt to normalize repository history.
