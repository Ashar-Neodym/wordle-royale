# Ticket 62 — Ranked E2E Demo Script and Documentation Response

Task: Ranked E2E demo script and documentation
Agent: Yuna (devops)
Status: Completed

## What I understood

Ticket 62 asked for a short, repeatable local demo flow for the first playable ranked loop: install/check, start dependencies, reset/seed, start API, start web, run an API-only ranked smoke if safe, include cleanup, avoid manual DB edits, and write the response file.

## What I changed

1. Added a root demo smoke command:

   ```bash
   API_BASE_URL=http://127.0.0.1:4000 pnpm ranked:demo:e2e
   ```

2. Added `scripts/ranked-demo-e2e.mjs`, an HTTP-only ranked loop smoke that:
   - checks `/readyz`;
   - creates a rated public lobby;
   - joins the seeded guest fixture user;
   - starts a ranked match;
   - submits a host guess using the local/dev fixture-user header;
   - reads guest state;
   - terminalizes host + guest through the guarded local/dev helper;
   - completes the match through the normal rating finalization endpoint;
   - repeats completion to verify idempotency;
   - reads match result and leaderboard;
   - fails if spoiler-sensitive fields appear in checked payloads.

3. Updated docs with a short copy-paste local demo flow:
   - install/check;
   - `pnpm deps:up`;
   - `pnpm ranked:smoke:reset`;
   - start API;
   - start web;
   - run `pnpm ranked:demo:e2e`;
   - open `/?matchId=<matchId>#gameplay`;
   - cleanup with `pnpm deps:down`.

## Files changed

- `scripts/ranked-demo-e2e.mjs`
- `package.json`
- `docs/local-development.md`
- `apps/api/README.md`
- `agent-communication/responses/ticket-62-yuna-ranked-e2e-demo-script-and-documentation-response.md`

Note: starting Next dev changed `apps/web/next-env.d.ts` transiently; I reverted that generated dev-server artifact before finishing.

## Verification evidence

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

### Dependency check / reset / API tests

```bash
CI=true pnpm deps:check
CI=true pnpm deps:up
CI=true pnpm ranked:smoke:reset
CI=true pnpm --filter @wordle-royale/api test
```

Results:

- `pnpm deps:check` → exit `0`
- `pnpm deps:up` → exit `0` after cleaning up a transient already-created container conflict from the first attempted run
- `pnpm ranked:smoke:reset` → exit `0`
- `pnpm --filter @wordle-royale/api test` → exit `0`

Key evidence:

```text
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
Ranked smoke local DB reset guard passed.
Target: local Compose PostgreSQL database wordle_royale_local on localhost:5432.
DROP SCHEMA
CREATE SCHEMA
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
ℹ tests 32
ℹ suites 6
ℹ pass 32
ℹ fail 0
```

### Ranked demo E2E script

Started API locally on `127.0.0.1:4062`, then ran:

```bash
API_BASE_URL=http://127.0.0.1:4062 pnpm ranked:demo:e2e
```

Result: exit `0`.

Evidence:

```json
{
  "result": "ok",
  "apiBaseUrl": "http://127.0.0.1:4062",
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
  "lobbyId": "e305b650-15ed-4d08-846d-c8f525ce64b6",
  "lobbyCode": "890179",
  "matchId": "6d939c65-de1c-46a3-9b9e-541be424d539",
  "roundId": "0b6e2666-b927-4b81-a5ca-962f2807410e",
  "hostGuessAccepted": true,
  "guestPlayerRoundStateBeforeHelper": "active",
  "terminalStates": {
    "host": "solved",
    "guest": "failed"
  },
  "ratingDeltas": [
    {
      "userId": "11111111-1111-4111-8111-111111111111",
      "ratingDelta": 16
    },
    {
      "userId": "22222222-2222-4222-8222-222222222222",
      "ratingDelta": -16
    }
  ],
  "leaderboardEntries": 2,
  "leaks": []
}
```

This verifies the demo loop requires no manual SQL or direct DB edits.

### Web demo start check

Started web locally against the same API on `127.0.0.1:4063`, then checked the live-match URL with the generated match id:

```bash
curl -fsS -o /tmp/wordle-demo.html -w '%{http_code}\n' \
  'http://127.0.0.1:4063/?matchId=6d939c65-de1c-46a3-9b9e-541be424d539#gameplay'
```

Result: exit `0`, output `200`.

### Static/local/security checks

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm smoke:local
CI=true pnpm secret-scan
```

Results: all exit `0`.

Key evidence:

```text
Already up to date
Workspace scaffold validation passed (9 workspace packages).
Local smoke passed. This smoke test validates local config only; it does not start app services.
Secret scan passed (168 source/config files scanned).
```

### Cleanup

Stopped API and web background processes, then ran:

```bash
CI=true pnpm deps:down

docker ps --filter 'name=wordle-royale' --format '{{.Names}} {{.Status}}'
```

Result: exit `0`; final Docker query returned no Wordle Royale containers.

## Git / CI / release impact

- No push performed.
- No deployment performed.
- No secrets or real `.env` files created.
- Added local-only demo smoke tooling and docs.
- The demo script depends on a running local API and the guarded local/dev fixture helpers from Tickets 59–60.

## Risks / notes

- `ranked:demo:e2e` intentionally uses the local/dev terminalization helper so the demo is deterministic and fast. It still finalizes ratings through the normal `POST /matches/:matchId/complete` endpoint.
- The first `pnpm deps:up` attempt encountered a transient Docker container-name conflict because Compose had partially created containers; `pnpm deps:down` cleaned it up and the verified rerun passed.
- The first API start without explicit local DB URL showed the known local credential placeholder issue; the documented flow remains correct when using the local Compose DB environment/path already wired by the reset and local config.

## Follow-up tickets

- Target agent: Jasmine
  - Why needed: Independent QA should verify the complete Wave I demo flow after Tickets 58–63.
  - Exact task: Use `docs/local-development.md` first playable ranked demo commands, then run `API_BASE_URL=<local-api> pnpm ranked:demo:e2e` and browser-check the emitted `matchId` page.
  - Inputs/context: This response; `scripts/ranked-demo-e2e.mjs`; docs updated in `docs/local-development.md`; API helper behavior from Tickets 59–60.
  - Expected output back to Athena: Pass/fail verification matrix, command outputs, browser observations, and any release-blocking demo issues.
