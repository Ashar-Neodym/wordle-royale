# Ticket 58 — Reset Seeds Stub Users and E2E Smoke Bootstrap Response

Task: Reset seeds stub users and E2E smoke bootstrap
Agent: Yuna (devops)
Status: Completed

## What I understood

Wave H QA found that `pnpm ranked:smoke:reset` left the local database in a state where direct `POST /lobbies` could 500 unless `/auth/me` had first created the stub local host user. Ticket 58 asked me to make the reset/seed path self-contained for local ranked smoke, preserve local-only safety guards, add or document a repeatable bootstrap proving direct lobby creation works without `/auth/me`, and update local demo docs.

## What I changed

1. Updated the local fixture seed plan to explicitly create the local stub smoke users after reset:
   - Host: `11111111-1111-4111-8111-111111111111` / `player_one` / `Player One`
   - Guest: `22222222-2222-4222-8222-222222222222` / `guest_player` / `Guest Player`
2. Added deterministic profile and ranked rating-profile records for those stub users so lobby/gameplay/leaderboard smoke has a stable local base.
3. Updated the seed dry-run test to expect the additional smoke users and to assert the stub handles appear in the spoiler-safe dry-run summary.
4. Added `scripts/ranked-smoke-bootstrap.mjs` and root script `pnpm ranked:smoke:bootstrap`.
   - It calls `/readyz`.
   - It directly calls `POST /lobbies`.
   - It calls `POST /lobbies/:id/join`.
   - It intentionally does **not** call `/auth/me`.
   - It verifies the resulting lobby contains the seeded host and guest stub user IDs.
5. Hardened `scripts/reset-ranked-smoke-db.mjs` after verification exposed an additional reset-repeatability edge:
   - Keeps the existing local Compose database URL guard.
   - Waits for the local Compose Postgres service to accept connections before resetting.
   - Drops/recreates only the guarded local `public` schema before Prisma `db push`, then applies the fixture seed.
   - This avoids stale local FK/data residue causing repeat resets to fail after a previous smoke created lobbies.
6. Updated local development/API docs with exact reset and bootstrap commands.

## Files changed

- `apps/api/prisma/seed-fixtures.ts`
- `apps/api/prisma/seed-fixtures.test.mjs`
- `scripts/reset-ranked-smoke-db.mjs`
- `scripts/ranked-smoke-bootstrap.mjs`
- `package.json`
- `docs/local-development.md`
- `apps/api/README.md`
- `agent-communication/responses/ticket-58-yuna-reset-seeds-stub-users-and-e2e-smoke-bootstrap-response.md`

## Verification evidence

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

### API tests

```bash
CI=true pnpm --filter @wordle-royale/api test
```

Result: exit `0`.

Key evidence:

```text
ℹ tests 31
ℹ suites 6
ℹ pass 31
ℹ fail 0
```

### Local dependency/reset verification

```bash
CI=true pnpm ranked:smoke:reset && CI=true pnpm deps:verify
```

Result: exit `0`.

Key evidence:

```text
Ranked smoke local DB reset guard passed.
Target: local Compose PostgreSQL database wordle_royale_local on localhost:5432.
DROP SCHEMA
CREATE SCHEMA
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "wordle_royale_local", schema "public" at "localhost:5432"
🚀  Your database is now in sync with your Prisma schema.
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
Local dependency verification passed: PostgreSQL and Redis are healthy and accepting connections.
```

### Direct lobby bootstrap without `/auth/me`

After reset, I started the API on a local-only port and ran:

```bash
API_BASE_URL=http://127.0.0.1:4058 pnpm ranked:smoke:bootstrap
```

Result: exit `0`.

Evidence:

```json
{
  "result": "ok",
  "apiBaseUrl": "http://127.0.0.1:4058",
  "note": "Created and joined a rated lobby without calling /auth/me first.",
  "lobbyId": "57aa66f2-b5c4-4fbc-b2c2-c2ee096dfcdc",
  "lobbyCode": "62903A",
  "members": [
    {
      "userId": "11111111-1111-4111-8111-111111111111",
      "handle": "player_one",
      "role": "host"
    },
    {
      "userId": "22222222-2222-4222-8222-222222222222",
      "handle": "guest_player",
      "role": "player"
    }
  ]
}
```

This directly verifies reset → create lobby → join lobby without relying on `/auth/me` as a side effect.

### Local static/smoke/security checks

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
Secret scan passed (167 source/config files scanned).
```

### Cleanup

```bash
CI=true pnpm deps:down
# API dev process stopped
# docker ps --filter 'name=wordle-royale' --format '{{.Names}} {{.Status}}'
```

Result: exit `0`; final Docker query returned no Wordle Royale containers.

## Git / CI / release impact

- No push performed.
- No deployment performed.
- No real `.env` files created or modified by this ticket.
- Added local-only destructive reset behavior, still guarded to local Compose Postgres only.
- Added a local bootstrap smoke command that requires a running local API.

## Risks / notes

- `ranked:smoke:reset` now uses `docker compose exec -T postgres psql ...` after validating the target DB URL. This keeps the reset robust against stale FK residue but means local Compose Postgres must be running before reset, consistent with the documented `pnpm deps:up && pnpm ranked:smoke:reset` flow.
- The bootstrap proves lobby creation/joining without `/auth/me`; full natural match terminalization is still owned by follow-up Ticket 59/60 territory.
- Broad pre-existing uncommitted working-tree state remains from prior tickets. This ticket did not attempt to normalize unrelated files.

## Follow-up tickets

None required from this ticket for the specific Wave H reset warning. Existing Wave I follow-ups remain relevant:

- Target agent: Freya
  - Why needed: Backend still needs a dev multi-user/natural ranked smoke path beyond lobby bootstrap.
  - Exact task: Complete Ticket 59/60 scope so ranked smoke can progress through terminal match states without direct DB edits.
  - Inputs/context: This ticket now guarantees reset seeds `player_one` and `guest_player`, and `pnpm ranked:smoke:bootstrap` proves direct lobby creation/join works.
  - Expected output back to Athena: Backend implementation notes, commands run, and live smoke evidence for natural multi-user match progression.

- Target agent: Jasmine
  - Why needed: Independent QA should verify the combined Wave I demo-stable ranked loop after Tickets 58–63.
  - Exact task: Re-run reset/bootstrap and full ranked loop verification for Ticket 64.
  - Inputs/context: Use `pnpm deps:up`, `pnpm ranked:smoke:reset`, local API start, and `API_BASE_URL=<local-api> pnpm ranked:smoke:bootstrap` as the reset/lobby prerequisite.
  - Expected output back to Athena: Pass/fail matrix with evidence and any remaining demo blockers.
