# @wordle-royale/api

NestJS backend/API skeleton for Wordle Royale.

## Local API skeleton

Implemented local foundational routes:

- `GET /healthz` — process health envelope.
- `GET /readyz` — readiness envelope with dependency placeholders (`not_checked_stub`).
- `GET /auth/me` — current-user auth stub using shared contract shape.
- `POST /auth/register` — register/auth-token stub using `@wordle-royale/contracts` validation.
- `GET /profile/me` — public profile stub.
- `PATCH /profile/me` — profile update stub using shared contract validation.
- `GET /profile/handles/:handle/availability` — handle availability stub.
- `GET /lobbies?status=waiting&mode=ranked&visibility=public&limit=20` — public lobby discovery with optional filters and join/start affordances.
- `POST /lobbies` — create lobby stub using `createLobbyRequestSchema`.
- `POST /lobbies/join-code` — join by code stub using `joinLobbyByCodeRequestSchema`.
- `POST /lobbies/:lobbyId/join` — join lobby stub using client request validation.
- `GET /leaderboard?limit=20` — ranked leaderboard read model from durable `RatingProfile` rows.
- `GET /profiles/:handle/rating` — rated profile read model with default unrated `1200` behavior.

Responses use a shared envelope shape:

```json
{ "data": {}, "error": null, "requestId": "..." }
```

Validation errors return:

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

Run locally:

```bash
pnpm --filter @wordle-royale/api dev
curl http://127.0.0.1:3001/healthz
curl http://127.0.0.1:3001/readyz
```

## Prisma database foundation

This package contains the local PostgreSQL/Prisma schema foundation in `prisma/schema.prisma`.

Implemented schema areas:

- Users/profiles: `UserAccount`, `UserProfile`, consent records/scopes.
- Word library metadata: dictionary releases and per-word metadata rows for answer/guess/banned fixture/import records.
- Lobby/match/gameplay: lobbies, matches, rounds, participants, guess attempts, score breakdowns, and match reports.
- Rating/leaderboard: rating profiles, rating events, leaderboard snapshots, and void/reversal support fields.
- Analytics/audit basics: `AnalyticsEvent` and `AuditLog`.

Local validation commands:

```bash
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api db:validate
```

`db:validate` uses a local placeholder `DATABASE_URL` only for Prisma schema validation and does not connect to a database. Do not commit real `.env` files or production credentials.

A deterministic initial SQL migration was generated with `prisma migrate diff --from-empty --to-schema-datamodel`; it has not been applied to any live database in this ticket.

## Lobby discovery and readiness slice

`GET /lobbies` remains backward-compatible and now accepts optional discovery filters:

```http
GET /lobbies?status=waiting&mode=ranked&visibility=public&limit=20
```

Discovery rows include the existing `LobbyDto` fields plus product-action metadata for `/lobbies` and `/play`:

- `status`, `visibility`, and `mode` for filtering/grouping.
- `playerCount` and `maxPlayers` for compact lobby cards.
- `canJoin` for open/non-full lobbies.
- `canStart` once the server sees enough joined players for the lobby's `minPlayers` rule.
- `blockerReason` for start readiness copy (`waiting_for_players`, `lobby_not_open`, or `null`).

The slice does not introduce a full matchmaking queue. Start readiness stays server-derived from persisted lobby settings and members, and gameplay/rating authority remains in the ranked match services.

## Ranked gameplay persistence slice

`src/gameplay/gameplay-persistence.service.ts` defines the first server-authoritative ranked match persistence slice.

Current service boundary:

- `startRankedMatch({ dictionaryReleaseId, participantUserIds, idempotencyKey, lobbyId?, now? })`
  - Requires at least two participants.
  - Creates a ranked active `Match`.
  - Creates `MatchParticipant` rows.
  - Selects a server-side answer from safe dictionary metadata.
  - Stores only `answerWordHash` + `answerWordSaltRef` on `MatchRound`, not plaintext answer.
- `submitGuess({ matchId, roundId, participantId, guess, clientRequestId, now? })`
  - Reconstructs answer authority server-side from dictionary rows + hash.
  - Validates guesses with `@wordle-royale/game-engine`.
  - Rejects invalid/banned/out-of-dictionary guesses without consuming attempts.
  - Scores accepted guesses server-side and persists `GuessAttempt` + `ScoreBreakdown`.
  - Marks participants terminal through normal game rules (`solved` or max-attempt `failed`).
  - Derives round/match completion server-side when every participant is terminal, so rating finalization remains gated on persisted terminal eligibility rather than direct database edits.

This is intentionally a service-level slice, not a public route yet. Future route work should expose only intent submission, for example `POST /matches/:matchId/rounds/:roundId/guesses`, and must keep answer, feedback authority, scoring, and rating deltas server-side.

Ranked/MMR finalization slice:

- `finalizeRankedMatchRatings({ matchId, reason?, now? })`
  - Loads persisted ranked participants and computes final standings from server-side `finalScore` values.
  - Uses placeholder V1 algorithm `placement_mmr_v1`: unrated players start at shared contract default `1200`; a two-player decisive match applies `+16/-16`, with larger matches scaled by placement around the field midpoint and ties sharing placement.
  - Runs inside a Prisma transaction when available.
  - Persists one per-participant `RatingEvent` row with reversal/void compatibility fields (`voidedByEventId`, `reversalOfEventId`) left null for applied events and a shared logical idempotency key in metadata: `rating:<matchId>:placement_mmr_v1`.
  - Updates/creates ranked `RatingProfile` rows, writes final participant placement, completes the match, and upserts a spoiler-safe `MatchReport.publicSummary`.
  - Is idempotent: if applied rating events already exist for the match + algorithm, it reconstructs the shared result summary and does not apply deltas twice.
  - Does not apply rating events for voided matches; the result summary records `ratingEvent: null`.

## Leaderboard and rated profile read model

`src/leaderboard/leaderboard-read.service.ts` provides the first local-first competitive read model on top of `RatingProfile` rows:

- `listLeaderboard({ limit?, algorithmConfigVersion?, now? })`
  - Reads active ranked `RatingProfile` rows for `placement_mmr_v1`.
  - Sorts deterministically by rating descending, matches played descending, then handle/display identity.
  - Returns rank, user id, handle, display name, rating, matches played, provisional status, and provisional remaining count.
- `getRatedProfileByHandle(handle)`
  - Resolves a public profile handle to a rated profile summary.
  - Uses the shared unrated default rating `1200`, `matchesPlayed: 0`, and `provisional: true` for known users without a ranked profile yet.

Public low-risk endpoints are exposed as `GET /leaderboard?limit=20` and `GET /profiles/:handle/rating`. They do not read match rounds, guesses, dictionary words, or answer hashes, so the lichess/chess.com-style competitive loop can show stable ratings, provisional identity, and post-match progression without any spoiler surface.

## Ranked result actions

Completed ranked results from `GET /matches/:matchId/result` include `resultActions` alongside final standings and rating events:

- `share` — spoiler-safe text plus `/matches/:matchId` path for copy/share UI.
- `links` — stable product routes for match detail, history, leaderboard, next ranked lobby discovery, and profile-by-handle template.
- `rematch` — a present but disabled affordance (`available: false`, `reason: not_implemented`) so Luna can render honest post-match copy now while a future backend helper creates a same-settings lobby from the completed match.

The result-action payload is generated from match id and final standings only. It does not expose hidden answers, answer hashes, salts, dictionary words, or raw opponent guesses, and active match state responses do not include result actions before completion.

## Repeatable ranked smoke reset

Use the repo-level reset script when local ranked smoke data has accumulated noisy lobbies/matches:

```bash
pnpm deps:up
pnpm ranked:smoke:reset
pnpm deps:down
```

The script is guarded for local development only. It refuses production-like environments and only accepts the local Compose PostgreSQL target (`wordle@localhost:5432/wordle_royale_local`, no required SSL). It drops/recreates the local `public` schema, runs Prisma `db push`, then applies the deterministic fixture seed. The seed explicitly includes the local stub host and guest users used by lobby/gameplay smoke (`player_one` and `guest_player`), so direct `POST /lobbies` does not depend on `/auth/me` creating the host as a side effect. This gives Jasmine/Yuna/Freya a repeatable base for live ranked loop smoke tests without exposing fixture answer words in logs.

To verify the direct-lobby bootstrap against a running local API without calling `/auth/me`:

```bash
API_BASE_URL=http://127.0.0.1:4000 pnpm ranked:smoke:bootstrap
```

To exercise the first playable ranked loop over HTTP without manual DB edits, run the full demo smoke against a running local API:

```bash
API_BASE_URL=http://127.0.0.1:4000 pnpm ranked:demo:e2e
```

Expected output includes `"result": "ok"`, lobby/match/result/leaderboard HTTP statuses, rating deltas, and `"leaks": []`. The script uses local/dev fixture-user helpers, then finalizes ratings through the normal `POST /matches/:matchId/complete` path.

Equivalent package-scoped alias:

```bash
pnpm --filter @wordle-royale/api db:reset:ranked-smoke
```

## Local safe fixture seed bridge

`prisma/seed-fixtures.ts` builds a deterministic local-only seed plan from existing safe fixture data:

- `@wordle-royale/word-tools` hand-curated fixture dictionary artifacts (`en-5-test-vfixture.001`).
- `@wordle-royale/fixtures` test users.
- No production dictionary, proprietary word source, real user email, real `.env`, or paid service dependency.

Database-free validation/dry-run:

```bash
pnpm --filter @wordle-royale/fixtures build
pnpm --filter @wordle-royale/word-tools build
pnpm --filter @wordle-royale/api db:seed:dry-run
```

The dry-run JSON intentionally reports counts, checksums, policy, and fixture user handles only; it does not print the fixture word list, so logs remain spoiler-safe for gameplay testing.

Once local Postgres is available and migrations have been applied, seed local data with a private local `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://wordle:<local-password>@localhost:5432/wordle_royale_local?schema=public" \
  pnpm --filter @wordle-royale/api db:seed:local
```

`db:seed:local` is idempotent for the fixture release/users: it upserts the dictionary release, test users, profiles, and rating profiles, and inserts missing dictionary word rows with `skipDuplicates`. It is for local development only; do not run it against production or any shared data environment.
