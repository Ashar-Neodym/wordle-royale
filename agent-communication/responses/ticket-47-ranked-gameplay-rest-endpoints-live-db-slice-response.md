# Ranked Gameplay REST Endpoints Live DB Slice — Response

## Summary

Ticket 47 is complete.

Implemented the first ranked gameplay REST API slice on top of the Ticket 41 gameplay persistence service and Ticket 45 contract shapes:

- `POST /matches/ranked/start`
- `GET /matches/:matchId/state`
- `POST /matches/:matchId/rounds/:roundId/guesses`

The slice is intentionally local/stub-auth scoped:

- Current player identity is still the existing safe local stub user `11111111-1111-4111-8111-111111111111`.
- Ranked starts currently support `source: "lobby"` only; `quick_match` and `debug_seed` return an explicit unsupported-source error for now.
- Lobby membership is derived server-side from the persisted lobby settings; client-supplied participant IDs are not trusted for normal lobby starts.
- Local stub participant user/profile rows are ensured before creating ranked `MatchParticipant` rows so live Postgres foreign keys do not break the local first-playable flow.
- Spoiler safety is preserved: active start/state/guess responses do not include plaintext answers, `answerWordHash`, or `answerWordSaltRef`.

Added API tests for success/error envelopes, route/body mismatch validation, server-authoritative feedback, and spoiler-safe state responses.

## Decisions / Recommendations

1. **Expose only the minimal REST loop now.**
   - Start, state, and guess submission are enough for Ticket 49 web ranked-entry work.
   - Match completion/result can remain with Ticket 48 rating/finalization scope.

2. **Keep auth explicit and stubbed.**
   - The controller documents this by using the existing local stub user.
   - No JWT/OAuth/password/session implementation was added.

3. **Use lobby membership as the participant source.**
   - `POST /matches/ranked/start` requires `source: "lobby"` and `lobbyId`.
   - Participant user IDs come from server-side lobby settings, not from the client request.

4. **Allow the local fixture dictionary for first playable ranked smoke.**
   - The seed fixture release is `draft`, so the API selects an available local 5-letter release from `active` or `draft` releases for this local-first slice.
   - This keeps production dictionary policy unchanged and does not import proprietary data.

5. **Root `pnpm build` is still blocked outside this ticket by web type-portability errors.**
   - API-level build/test passed.
   - Root build failed in `apps/web` on inferred React return types, beginning with `src/app/layout.tsx`; fixing every web component annotation is outside Ticket 47.

## Detailed Output

### Implemented routes

#### `POST /matches/ranked/start`

Request body uses `startRankedMatchRequestSchema`.

Implemented behavior:

- rejects non-lobby ranked start sources with `unsupported_ranked_start_source`;
- validates the request through the shared Zod validation pipe and response envelope filter;
- loads the lobby by `lobbyId`;
- derives member user IDs from server-side lobby settings;
- requires the current local stub user to be a lobby member;
- requires at least two members;
- ensures safe local stub user/profile rows for lobby participants;
- starts a ranked match via `GameplayPersistenceService.startRankedMatch(...)`;
- marks the lobby `in_match` when possible;
- returns `RankedMatchStartResponseData` with a safe snapshot.

#### `GET /matches/:matchId/state`

Implemented behavior:

- loads match, latest round, participants, current participant attempts, and dictionary metadata;
- returns `currentRankedMatchStateResponseDataSchema`;
- maps DB status `active` to contract state `in_progress`;
- includes only the current stub participant's guesses/feedback in `myState`;
- excludes answer plaintext/hash/salt.

#### `POST /matches/:matchId/rounds/:roundId/guesses`

Request body uses `submitGuessRequestSchema`.

Implemented behavior:

- rejects route/body `matchId` or `roundId` mismatch with `route_body_mismatch`;
- resolves the current stub user's participant row server-side;
- submits the guess to `GameplayPersistenceService.submitGuess(...)`;
- returns the existing contract-shaped accepted/rejected `GuessResult` envelope;
- keeps feedback/scoring server-authoritative.

### Live local DB smoke

Started local dependencies with Compose and used live Postgres/Redis.

Observed setup commands:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:up
```

Result summary:

```text
postgres and redis containers started
```

Migration deploy:

```bash
DATABASE_URL='<local-postgres-url>' pnpm --filter @wordle-royale/api db:migrate:deploy
```

Result summary:

```text
1 migration found in prisma/migrations
No pending migrations to apply.
```

Seed apply initially hit Prisma's 5s interactive transaction timeout once, then passed on retry:

```bash
DATABASE_URL='<local-postgres-url>' pnpm --filter @wordle-royale/api db:seed:local
```

Final result:

```text
Applied local fixture seed: en-5-test-vfixture.001
```

Live API was started on port `3017` and smoked with real HTTP calls against local Postgres/Redis.

Smoke sequence and results:

```text
GET /auth/me -> 200 error=null
POST /lobbies -> 201 error=null
POST /lobbies/<lobbyId>/join -> 201 error=null
POST /matches/ranked/start -> 201 error=null
GET /matches/<matchId>/state -> 200 error=null
POST /matches/<matchId>/rounds/<roundId>/guesses -> 201 error=null
GET /matches/<matchId>/state -> 200 error=null
matchId=d797b839-b667-4b51-b891-de420f63a765
roundId=77075612-4a63-4f64-b08b-88b49f3082d3
guessAccepted=true roundState=active
```

The smoke script also asserted that start/guess payloads did not contain `answerWordHash` or `answerWordSaltRef`.

The tracked API process was stopped after smoke testing. Compose Postgres/Redis were left running for follow-on Wave G tickets.

## Open Questions

- Should local fixture dictionary releases become `active` instead of `draft` once seeded, or should the ranked API continue allowing `draft` fixture releases only in local/dev mode?
- Should duplicate `clientRequestId` behavior for guesses return the prior result/idempotency conflict in this ticket, or remain a follow-up hardening item?
- Should Ticket 49 use `GET /matches/:matchId/state` immediately after start, or rely on the `snapshot` included in the start response?

## Follow-up Tickets

1. Add idempotent duplicate guess handling for `GuessAttempt.idempotencyKey` conflicts:
   - same payload returns prior result;
   - different payload returns `idempotency_key_conflict`.
2. Add match completion/result endpoints once Ticket 48 rating finalization is ready for public route exposure.
3. Add a DB reset or isolated smoke script for repeatable ranked live tests, because local DB state now accumulates smoke lobbies/matches.
4. Normalize local fixture dictionary release activation policy.
5. Address existing web build type-portability errors separately if root `pnpm build` is required as a Wave G gate.

## Files Changed

Ticket 47 implementation/testing:

- `apps/api/src/app.module.ts`
- `apps/api/src/gameplay/gameplay.controller.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/test/gameplay-controller.test.ts`
- `agent-communication/responses/ticket-47-ranked-gameplay-rest-endpoints-live-db-slice-response.md`

Note: the working tree is heavily untracked/modified from prior tickets, and `apps/api/src/gameplay/gameplay-persistence.service.ts` also contains Ticket 48 rating-finalization code present in the current working tree. I kept Ticket 47 changes focused to REST start/state/guess support.

## Tests / Commands Run

- `pnpm --filter @wordle-royale/api test` — exit `0`; 22/22 tests passed.
- `pnpm --filter @wordle-royale/api build` — exit `0`; API typecheck passed.
- `pnpm --filter @wordle-royale/api db:validate` — exit `0`; Prisma schema valid.
- `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:check` — exit `0`; Compose v5.2.0 config check passed.
- `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:verify` — exit `0`; Postgres and Redis reached healthy/ready, then the script stopped them as designed.
- `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:up` — exit `0`; local Postgres/Redis started for live smoke.
- `DATABASE_URL='<local-postgres-url>' pnpm --filter @wordle-royale/api db:migrate:deploy` — final exit `0`; no pending migrations.
- `DATABASE_URL='<local-postgres-url>' pnpm --filter @wordle-royale/api db:seed:local` — first attempt timed out inside Prisma transaction; retry exit `0` and applied fixture seed.
- Live HTTP smoke against `http://127.0.0.1:3017` — exit `0`; start/state/guess flow passed.
- `pnpm build` — exit `1`; API/contracts/mobile packages reached pass, but root build failed in `apps/web` on existing inferred React type portability errors.

## Evidence / Result

API test evidence:

```text
▶ ranked gameplay REST endpoints
  ✔ starts a lobby-backed ranked match and returns a spoiler-safe success envelope
  ✔ rejects route/body match mismatch with the shared error envelope
  ✔ submits guesses through server-authoritative scoring and exposes only my safe state
✔ ranked gameplay REST endpoints
ℹ tests 22
ℹ pass 22
ℹ fail 0
```

API build evidence:

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
```

DB validation evidence:

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

Live ranked smoke evidence:

```text
POST /matches/ranked/start -> 201 error=null
GET /matches/<matchId>/state -> 200 error=null
POST /matches/<matchId>/rounds/<roundId>/guesses -> 201 error=null
GET /matches/<matchId>/state -> 200 error=null
guessAccepted=true roundState=active
```

Acceptance criteria status:

- Minimal ranked REST routes are implemented.
- Auth/player identity boundary is explicit and stubbed/local only.
- Spoiler safety is preserved in active responses.
- API tests cover envelopes and server-authoritative feedback.
- Live local Postgres/Redis smoke passed.
- No paid SaaS, cloud resources, proprietary datasets, secrets, or GitHub push were added.

## Risks / Blockers

- Root `pnpm build` is blocked by existing `apps/web` React type-portability errors unrelated to the API slice.
- Local DB smoke is not isolated/reset; repeated runs can accumulate lobbies/matches and unique idempotency keys must vary.
- Guess idempotency conflict handling is not complete yet.
- The API still uses stub auth and local fixture participant provisioning; not production-ready identity handling.
- The ranked round can remain active after the current stub user submits a valid non-solving guess; full match finalization/rating remains Ticket 48 scope.
