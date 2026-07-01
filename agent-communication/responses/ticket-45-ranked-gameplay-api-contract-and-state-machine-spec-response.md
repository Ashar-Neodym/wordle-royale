# Ranked Gameplay API Contract and State Machine Spec — Response

## Summary

Ticket 45 is complete.

I defined the minimal ranked gameplay REST contract and server-authoritative state machine for the first playable ranked loop. The contract is intentionally small and builds on the existing Ticket 41 `GameplayPersistenceService` instead of inventing a parallel gameplay model.

I also updated `@wordle-royale/contracts` because the added shapes are clear, small, and immediately useful for Tickets 47/48/49:

- ranked match start request and response data,
- current ranked match state response data alias,
- ranked match completion request,
- ranked match result summary,
- V1 rating/MMR event contract,
- rating participant delta contract,
- constants for ranked start source, completion reason, rating event kind/status, and default rating `1200`.

The client remains non-authoritative: clients submit intents only. The server owns answer authority, validation, feedback, scoring, completion, and rating deltas.

## Decisions / Recommendations

1. **Use REST for the first playable ranked loop.**
   - Keep WebSocket/realtime as a later enhancement.
   - REST is sufficient for local first-playable ranked flow: start, fetch state, submit guess, complete/result.

2. **Start ranked matches from an existing lobby by default.**
   - Primary V1 route should require `lobbyId`.
   - `quick_match` and `debug_seed` are contract-supported sources for future/local development, but implementation can initially reject unsupported sources.

3. **Use existing response envelopes from Ticket 32.**
   - All endpoints return either `SuccessEnvelope<T>` or `ErrorEnvelope` from `@wordle-royale/contracts`.
   - Top-level shape remains `{ data, error, requestId }`.

4. **Do not leak answers in active gameplay state.**
   - `matchSnapshotSchema.currentRound` includes `roundId`, `roundNumber`, timing, word length, max guesses, dictionary version, and state.
   - It does not include `answer`, `answerWordHash`, or `answerWordSaltRef`.
   - Feedback is returned only for the requesting participant’s submitted guesses.

5. **Keep guess submission intent-only.**
   - Existing `submitGuessRequestSchema` remains the request body contract.
   - It accepts `clientRequestId`, `matchId`, `roundId`, `guess`, and optional `clientSubmittedAt` only.
   - It still excludes answer/score/feedback/rating authority.

6. **Rating V1 uses placement MMR with default baseline 1200.**
   - New/unrated players should enter `placement_mmr_v1` calculations as rating `1200`.
   - Rating event persistence must be idempotent by match and algorithm version, recommended key: `rating:<matchId>:placement_mmr_v1`.

7. **Ticket 47 should implement endpoints; Ticket 48 should implement rating finalization.**
   - This ticket defines contracts/state machine and shared schemas only.
   - It does not add NestJS controllers or rating transaction services.

## Detailed Output

### REST endpoint contract

All endpoints use the shared Ticket 32 envelope shape.

#### 1. Start ranked match

```http
POST /matches/ranked/start
```

Request body:

```ts
startRankedMatchRequestSchema
```

Shape:

```json
{
  "clientRequestId": "uuid",
  "lobbyId": "uuid",
  "source": "lobby"
}
```

Optional/future fields:

```json
{
  "dictionaryReleaseId": "uuid",
  "participantUserIds": ["uuid", "uuid"],
  "source": "quick_match"
}
```

Response envelope:

```ts
SuccessEnvelope<RankedMatchStartResponseData>
```

Data shape:

```json
{
  "matchId": "uuid",
  "roundId": "uuid",
  "state": "in_progress",
  "snapshot": { "...": "matchSnapshotSchema" }
}
```

Implementation notes for Freya:

- Use `GameplayPersistenceService.startRankedMatch(...)` from Ticket 41.
- For `source: "lobby"`, derive participants from the lobby membership server-side.
- Do not trust client-supplied `participantUserIds` for normal lobby starts.
- Use `clientRequestId` as the match creation idempotency key or derive a stable key from lobby + client request.

#### 2. Current ranked match state

```http
GET /matches/:matchId/state
```

Response envelope:

```ts
SuccessEnvelope<CurrentRankedMatchStateResponseData>
```

`CurrentRankedMatchStateResponseData` is currently `matchSnapshotSchema`.

Required server behavior:

- Identify the current user/participant server-side.
- Return only that participant’s `myState` guesses/feedback/score.
- Return standings that are safe for active play.
- Do not return answer, answer hash, or salt reference.

#### 3. Submit ranked guess

```http
POST /matches/:matchId/rounds/:roundId/guesses
```

Request body:

```ts
submitGuessRequestSchema
```

Shape:

```json
{
  "clientRequestId": "uuid",
  "matchId": "uuid",
  "roundId": "uuid",
  "guess": "crane",
  "clientSubmittedAt": "2026-06-29T00:00:00.000Z"
}
```

Response envelope:

```ts
SuccessEnvelope<GuessResult>
```

Accepted result:

```json
{
  "accepted": true,
  "valid": true,
  "clientRequestId": "uuid",
  "guessNumber": 1,
  "feedback": [
    { "letter": "c", "state": "correct" }
  ],
  "playerRoundState": "active",
  "roundState": "active",
  "score": 0,
  "serverReceivedAt": "2026-06-29T00:00:00.000Z"
}
```

Rejected result:

```json
{
  "accepted": false,
  "valid": false,
  "clientRequestId": "uuid",
  "reason": "banned_word",
  "attemptConsumed": false,
  "playerRoundState": "active"
}
```

Implementation notes:

- Route params and body must agree on `matchId`/`roundId`; mismatch should return validation/error envelope.
- Guess normalization stays server-side.
- Invalid/banned guesses should not consume attempts.
- Duplicate `clientRequestId` should be idempotent: return the prior result if payload matches; return `idempotency_key_conflict` if payload differs.

#### 4. Complete/finalize ranked match

```http
POST /matches/:matchId/complete
```

Request body:

```ts
completeRankedMatchRequestSchema
```

Shape:

```json
{
  "clientRequestId": "uuid",
  "matchId": "uuid",
  "reason": "all_players_final"
}
```

Response envelope:

```ts
SuccessEnvelope<RankedMatchResultSummary>
```

Data shape:

```json
{
  "matchId": "uuid",
  "state": "completed",
  "completedAt": "2026-06-29T00:00:00.000Z",
  "completionReason": "all_players_final",
  "finalStandings": [],
  "ratingEvent": null
}
```

Implementation notes:

- Initially, this route can be backend/admin/internal-triggered if product UI does not need a button.
- Ticket 48 should attach a non-null `ratingEvent` after rating finalization is implemented.

#### 5. Match result summary

```http
GET /matches/:matchId/result
```

Response envelope:

```ts
SuccessEnvelope<RankedMatchResultSummary>
```

Implementation notes:

- Before match completion, return either `409 match_not_completed` or the current state endpoint instead; do not pretend a result exists.
- After completion, this endpoint can power web/mobile result screens and share/report flows.

### Server-authoritative state machine

#### Match states

Use existing contract states but narrow the first playable loop to:

```text
initializing -> in_progress -> finalizing -> completed
```

Exceptional terminal states:

```text
abandoned | cancelled | voided
```

Transition rules:

1. `initializing`
   - Server has accepted a start request but has not fully persisted participants/round.
   - Client should show loading/resync.
2. `in_progress`
   - Active round exists.
   - Guess submission is allowed while round state is `active` and participant state is `active`.
3. `finalizing`
   - All required player outcomes are known or completion was triggered by timeout/forfeit.
   - Guess submission should be rejected with `round_not_active` or `deadline_passed`.
   - Rating/event/report generation may be running.
4. `completed`
   - Final standings exist.
   - Rating event is applied or explicitly null/pending depending on Ticket 48 implementation.
5. `voided`
   - No rating changes should apply, or prior rating events must be reversed/voided.

#### Round states

First playable loop should use:

```text
pending -> active -> completed
```

Future states already supported by contracts:

```text
countdown | finalizing | voided
```

#### Participant/player round states

Main path:

```text
not_started -> active -> solved | failed | timed_out | forfeited
```

Rules:

- `solved`: participant guessed answer within max guesses/time.
- `failed`: participant used max guesses without solving.
- `timed_out`: round deadline passed.
- `forfeited`: user explicitly abandoned/left ranked match.
- `disconnected`: transport state only; should not by itself finalize unless timeout/forfeit policy says so.
- `voided`: admin/system invalidation.

### Server-authoritative web/mobile state shape

Use `matchSnapshotSchema` for active state.

Safe fields:

- `matchId`
- `state`
- `serverTime`
- `currentRound.roundId`
- `currentRound.roundNumber`
- `currentRound.state`
- `currentRound.startsAt`
- `currentRound.endsAt`
- `currentRound.wordLength`
- `currentRound.maxGuesses`
- `currentRound.dictionaryVersion`
- `myState.guesses[].guess`
- `myState.guesses[].guessNumber`
- `myState.guesses[].feedback`
- `myState.guesses[].submittedAt`
- `myState.playerRoundState`
- `myState.score`
- `standings[]`

Forbidden in active state:

- plaintext answer,
- answer hash,
- answer salt reference,
- other players’ guesses before result visibility policy allows them,
- rating deltas before finalization.

### Minimal V1 rating/MMR event contract

Added `ratingEventContractSchema`.

Shape:

```json
{
  "eventId": "uuid",
  "matchId": "uuid",
  "kind": "placement_mmr_v1",
  "status": "applied",
  "idempotencyKey": "rating:<matchId>:placement_mmr_v1",
  "algorithmVersion": "placement_mmr_v1",
  "defaultRating": 1200,
  "participants": [
    {
      "userId": "uuid",
      "ratingBefore": 1200,
      "ratingAfter": 1216,
      "ratingDelta": 16,
      "placement": 1,
      "placementGroup": 1,
      "provisional": false
    }
  ],
  "createdAt": "2026-06-29T00:00:00.000Z",
  "appliedAt": "2026-06-29T00:00:00.000Z"
}
```

Rating rules for Ticket 48:

1. If no `RatingProfile` exists for a participant, treat `ratingBefore` as `1200`.
2. Persist one idempotent rating event per completed ranked match and algorithm version.
3. Recommended unique/idempotency key: `rating:<matchId>:placement_mmr_v1`.
4. Rating application must be transactional:
   - lock/load participant rating profiles,
   - compute standings and deltas,
   - insert rating event,
   - update rating profiles,
   - attach summary to match report/result.
5. Voided matches must not apply deltas; already-applied events must be voided/reversed rather than overwritten.

### Contract files changed

Updated:

- `packages/contracts/src/gameplay/constants.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`
- `packages/contracts/src/common/contracts.test.ts`

No NestJS controller, Prisma migration, paid dependency, production auth behavior, real `.env`, deployment, or GitHub push was added.

## Open Questions

None blocking Ticket 47/48 implementation.

Non-blocking product decisions for later:

1. Should ranked V1 expose `POST /matches/:matchId/complete` publicly, or should completion be purely server-triggered by the guess/timeout flow?
2. Should active standings hide other players’ current scores until everyone finishes, or show live provisional scores for excitement?
3. What is the exact V1 MMR delta formula: fixed placement deltas, Elo-like expected score, or rating-tools simulation output?

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/API implementation.
- **Exact task:** Implement Ticket 47 REST endpoints using the Ticket 45 contracts: `POST /matches/ranked/start`, `GET /matches/:matchId/state`, `POST /matches/:matchId/rounds/:roundId/guesses`, `POST /matches/:matchId/complete`, and `GET /matches/:matchId/result`.
- **Inputs/context they need:** This response file, `packages/contracts/src/gameplay/*`, Ticket 41 `GameplayPersistenceService`, Ticket 32 envelope contracts.
- **Expected output back to Athena:** API source changes, tests proving envelopes and spoiler-safe snapshots, API build/test output, and any route/contract mismatch notes.

### Follow-up Ticket 2

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns rating/finalization transaction slice.
- **Exact task:** Implement Ticket 48 rating finalization using `ratingEventContractSchema`, default rating `1200`, idempotency key `rating:<matchId>:placement_mmr_v1`, transactional `RatingEvent`/`RatingProfile` updates, and result summary attachment.
- **Inputs/context they need:** This response file, Prisma `RatingEvent`/`RatingProfile` schema, rating-tools package, Ticket 41 service outputs.
- **Expected output back to Athena:** Rating transaction implementation, tests for new/unrated default 1200, idempotency, void/reversal behavior, and leaderboard/profile updates.

### Follow-up Ticket 3

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns web/mobile-facing client flows.
- **Exact task:** After Ticket 47, wire web ranked entry/gameplay screens to the REST endpoints using shared contracts and render only server-shaped state.
- **Inputs/context they need:** This response file, Ticket 47 API response, web API client from Ticket 40.
- **Expected output back to Athena:** Web source changes, browser smoke evidence, fallback/error-state notes, and no duplicated DTOs.

### Follow-up Ticket 4

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA.
- **Exact task:** In Ticket 50, verify active ranked state never leaks answer/hash/salt, invalid guesses do not consume attempts, duplicate `clientRequestId` behavior is idempotent, and final result/rating summary matches persisted DB state.
- **Inputs/context they need:** Ticket 45, 47, 48, and 49 responses.
- **Expected output back to Athena:** Pass/fail matrix with exact HTTP samples, DB evidence, browser evidence, and blockers/warnings separated.

## Files Changed

- `packages/contracts/src/gameplay/constants.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`
- `packages/contracts/src/common/contracts.test.ts`
- `agent-communication/responses/ticket-45-ranked-gameplay-api-contract-and-state-machine-spec-response.md`

## Tests / Commands Run

Environment note: the shell `PATH` in this Elisa session was corrupted when first running pnpm (`spawn sh ENOENT` / missing basic commands). I reran verification with a sanitized PATH:

```bash
export PATH=/home/ashar/.nvm/versions/node/v26.3.0/bin:/home/ashar/.hermes/hermes-agent/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

### Command

```bash
pnpm --filter @wordle-royale/contracts test
```

Exit code: `0`.

Relevant output:

```text
✔ ranked match start request requires lobby id for lobby source
✔ ranked match start response wraps server-shaped snapshot without answer leakage
✔ rating event contract defaults V1 placement MMR baseline to 1200
✔ ranked match result summary includes final standings and nullable rating event
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

### Command

```bash
pnpm --filter @wordle-royale/contracts build
```

Exit code: `0`.

Output:

```text
$ tsc -p tsconfig.json
```

### Command

```bash
pnpm typecheck
```

Exit code: `0`.

Output:

```text
Workspace scaffold validation passed (9 workspace packages).
```

### Command

```bash
pnpm --filter @wordle-royale/api db:generate && pnpm --filter @wordle-royale/api build && pnpm --filter @wordle-royale/api test
```

Exit code: `0`.

Relevant output:

```text
✔ Generated Prisma Client (v6.19.3)
$ tsc --noEmit -p tsconfig.json
▶ api skeleton
  ✔ serves health and healthy readiness envelopes with dependency checks
  ✔ serves unhealthy readiness when a dependency check fails
  ✔ uses Prisma-backed profile service behavior while auth remains stubbed
  ✔ rejects malformed lobby creation with the shared error envelope
  ✔ creates, lists, and joins lobbies through the Prisma-backed lobby service
▶ GameplayPersistenceService
  ✔ starts a ranked match with hashed answer authority and no plaintext answer on the round
  ✔ rejects banned guesses without consuming an attempt or leaking feedback
  ✔ accepts a solved guess, persists feedback and score server-side, and completes participant and round state
ℹ tests 16
ℹ pass 16
```

### Command

```bash
pnpm build
```

Exit code: `1`.

Relevant output:

```text
packages/contracts build: Done
apps/mobile build: Done
apps/web build: Failed to type check.
./src/app/layout.tsx:10:25
Type error: The inferred type of 'RootLayout' cannot be named without a reference to '.pnpm/@types+react@19.1.17/node_modules/@types/react'. This is likely not portable. A type annotation is necessary.
```

This root build failure is in the Next.js web app `apps/web/src/app/layout.tsx`, outside the ranked gameplay contract package. The contracts package built successfully before the web failure.

## Evidence / Result

Acceptance criteria status:

- **Requested deliverable clearly implemented/documented:** yes.
- **REST endpoints/envelopes proposed:** yes; see Detailed Output.
- **Server-authoritative state shape defined:** yes; `matchSnapshotSchema` remains active-state source and forbids answer leakage.
- **Minimal rating/MMR event contract defined:** yes; `ratingEventContractSchema` with default rating `1200`, placement deltas, status, algorithm version, and idempotency key guidance.
- **Contracts updated where clear/small:** yes; gameplay constants/schemas/types and tests updated.
- **Migration/API compatibility notes included:** yes; see Follow-up Tickets and implementation notes.
- **Relevant verification run:** yes; contracts test/build, workspace typecheck, and API build/test passed after Prisma generate.
- **Blockers separated from warnings:** yes; see below.

## Risks / Blockers

### Blockers

None for Ticket 45 contract/spec completion.

### Warnings / follow-up risks

1. **Root `pnpm build` currently fails in `apps/web`.** The failure is a Next.js type portability issue in `apps/web/src/app/layout.tsx`, not a contracts compile failure. Route this to Luna unless Athena wants Elisa to patch web build hygiene separately.
2. **No REST controller was implemented in this ticket.** Ticket 47 must expose the actual endpoints and map route params/body validation to these contracts.
3. **Rating formula remains algorithmically underspecified.** The contract fixes event shape/default 1200/idempotency, but Ticket 48 must choose or reuse the exact placement MMR delta formula.
4. **Answer scheduling remains minimal.** Ticket 41 currently uses a simple answer selection path; production ranked fairness needs anti-repeat/randomization policy later.
5. **Idempotency must be enforced in persistence, not only schemas.** The contracts expose `clientRequestId` and rating idempotency guidance; Ticket 47/48 must implement DB uniqueness/conflict semantics.
