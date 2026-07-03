# Ranked Gameplay Persistence Service Plan and First Live Match Slice — Response

## Summary

Implemented a small service-level ranked gameplay persistence slice for the backend.

Delivered:

- `GameplayPersistenceService` with:
  - `startRankedMatch(...)` for creating a ranked active match, participants, and first round.
  - `submitGuess(...)` for server-authoritative validation, feedback, scoring, and persistence.
- Tests proving:
  - Ranked match start persists match/participants/round.
  - The round stores only `answerWordHash` + `answerWordSaltRef`, not plaintext answer.
  - Banned guesses are rejected without consuming an attempt or leaking answer/feedback.
  - Solved guesses persist `GuessAttempt` and `ScoreBreakdown`, update participant outcome, and complete the round.
- API module provider registration for the gameplay persistence service.
- API README documentation for current service boundaries and ranked/MMR next steps.
- API dependency on `@wordle-royale/game-engine`.
- A small `@wordle-royale/game-engine` type-safety fix exposed when the API imported the source package under strict TypeScript checking.

No public gameplay endpoint was added yet. This keeps the slice small and avoids exposing a route before live DB/runtime verification and auth/player identity boundaries are ready.

## Decisions / Recommendations

- Treat this as the first internal backend slice, not the full live match API.
- Keep clients intent-only: clients submit guesses; the server resolves answer authority, validates dictionary legality, calculates feedback, assigns scores, and later applies ratings.
- Preserve spoiler safety by storing `answerWordHash` and a salt reference on `MatchRound`, not plaintext answer.
- For the local fixture dictionary, the server can resolve the answer by recomputing hashes against server-side dictionary rows; public responses and round rows do not reveal the answer.
- Keep rating application as the next backend slice after match-finalization is explicit. Recommended sequence:
  1. Complete/forfeit/timeout all participants.
  2. Build placement groups from persisted standings.
  3. Apply `placement_mmr_v1` deltas in a transaction.
  4. Persist `RatingEvent` rows with idempotency keys.
  5. Update `RatingProfile` rows.
  6. Generate `MatchReport` / leaderboard snapshot.

## Detailed Output

Implemented service boundary:

```ts
startRankedMatch({
  dictionaryReleaseId,
  participantUserIds,
  idempotencyKey,
  lobbyId?,
  now?,
})
```

Behavior:

- Requires at least two participants.
- Loads answer candidates from `DictionaryWord` for the selected release.
- Creates a ranked active `Match` with `algorithmConfigVersion: 'placement_mmr_v1'`.
- Creates `MatchParticipant` rows with deterministic seat numbers.
- Creates first `MatchRound` with:
  - `roundNumber: 1`
  - `maxAttempts: 6`
  - `answerWordHash`
  - `answerWordSaltRef: 'fixture-local-v1'`
- Does not write plaintext answer to `MatchRound`.

```ts
submitGuess({
  matchId,
  roundId,
  participantId,
  guess,
  clientRequestId,
  now?,
})
```

Behavior:

- Loads the round and participant server-side.
- Resolves answer authority by hashing server-side answer dictionary rows and matching `answerWordHash`.
- Validates the guess with `@wordle-royale/game-engine` against guess/answer/banned dictionary rows.
- Rejected invalid guesses return a contract-shaped rejection and do not create `GuessAttempt` rows.
- Accepted guesses:
  - Persist `GuessAttempt` with feedback and server validation metadata.
  - Persist `ScoreBreakdown` with `standard_v1` score details.
  - Update participant final score/outcome when solved/failed.
  - Mark the round completed when solved.

Small type fix:

- `packages/game-engine/src/index.ts` now uses `Array.from(values, normalizeWord)` in `toReadonlySet(...)`, so API strict typechecking can consume the source package path cleanly.

## Open Questions

- Should the next implementation expose REST endpoints now, or wait until live DB auth/profile/lobby flow is verified end-to-end?
- Should answer selection for ranked V1 be random with a persisted server seed, deterministic by match id, or controlled by a future anti-repeat scheduler?
- Should ranked matches require all participants to submit/timeout before applying ratings, or should early solved states support provisional standings while the match is active?

## Follow-up Tickets

1. Add gameplay REST endpoints:
   - `POST /matches/ranked/start` or lobby transition endpoint.
   - `POST /matches/:matchId/rounds/:roundId/guesses`.
   - `GET /matches/:matchId/snapshot`.
2. Add match finalization service:
   - timeout/forfeit handling.
   - final standings from persisted attempts/scores.
   - `MatchReport` creation.
3. Add rating transaction service:
   - load `RatingProfile` rows.
   - compute placement MMR deltas.
   - write idempotent `RatingEvent` rows.
   - update `RatingProfile` and optional `LeaderboardSnapshot`.
4. Add live DB integration smoke once Docker/Postgres/Redis are verified.

## Files Changed

- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/test/gameplay-persistence.test.ts`
- `apps/api/src/app.module.ts`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/README.md`
- `packages/game-engine/src/index.ts`
- `pnpm-lock.yaml`

## Tests / Commands Run

- `pnpm --filter @wordle-royale/api test` — exit `1` initially, expected RED failure because `GameplayPersistenceService` did not exist.
- `CI=true pnpm install --no-frozen-lockfile && pnpm --filter @wordle-royale/api test` — exit `1`; Prisma client was missing after node_modules recreation.
- `pnpm --filter @wordle-royale/api db:generate && pnpm --filter @wordle-royale/api test` — exit `0`; API tests passed, 16/16.
- `pnpm --filter @wordle-royale/api build` — exit `2` initially; strict typecheck exposed test typing and `game-engine` source narrowing issue.
- `pnpm --filter @wordle-royale/api build && pnpm --filter @wordle-royale/api test` — exit `0` after fixes.
- `CI=true pnpm install --frozen-lockfile` — exit `0`.
- `pnpm --filter @wordle-royale/game-engine build` — exit `0`.
- `pnpm --filter @wordle-royale/api test` — exit `0`; 16/16.
- `pnpm build` — exit `0`.
- `pnpm secret-scan` — exit `0`; `Secret scan passed (154 source/config files scanned).`
- `pnpm test` — exit `0`; workspace scaffold validation passed.
- `pnpm --filter @wordle-royale/api db:validate` — exit `0`; Prisma schema valid.
- `pnpm --filter @wordle-royale/rating-tools build` — exit `0`.

## Evidence / Result

API test evidence:

```text
▶ GameplayPersistenceService
  ✔ starts a ranked match with hashed answer authority and no plaintext answer on the round
  ✔ rejects banned guesses without consuming an attempt or leaking feedback
  ✔ accepts a solved guess, persists feedback and score server-side, and completes participant and round state
✔ GameplayPersistenceService
ℹ tests 16
ℹ pass 16
ℹ fail 0
```

Root verification evidence:

```text
pnpm build: exit 0
pnpm secret-scan: Secret scan passed (154 source/config files scanned).
pnpm test: Workspace scaffold validation passed (9 workspace packages).
pnpm --filter @wordle-royale/api db:validate: The schema at prisma/schema.prisma is valid 🚀
```

Acceptance criteria status:

- Relevant API tests pass.
- Root build passes.
- Elo/MMR/ranked implications are documented and scoped to the next transaction slice.
- Server-authoritative scoring is implemented in the service.
- Spoiler safety is preserved by not storing plaintext answer on `MatchRound` and by not exposing answers in service results.
- No production/proprietary dictionary data was imported.
- No push performed.

## Risks / Blockers

- Live DB execution was not performed; Docker/Postgres/Redis verification remains a Wave F runtime gate.
- No public gameplay route was added yet; this is intentional to keep auth/player identity and live DB behavior from drifting before runtime verification.
- Current answer selection is minimal/deterministic for the first slice. Ranked production play needs stronger answer scheduling/randomization and anti-repeat policy.
- Rating deltas are not applied yet; standings/finalization and rating events need a follow-up transaction service.
- Current round completion logic handles solved guesses; timeout/forfeit/failure finalization still needs explicit implementation.
