# Ticket 19 — Game Engine Core Implementation — Response

## Summary

Implemented the pure deterministic `packages/game-engine` core for Wordle Royale V1.

Implemented:

- Word normalization.
- Guess validation result types.
- Two-pass duplicate-letter Wordle feedback algorithm.
- Round scoring for `standard_v1`.
- Final standings / tie-break helper.
- Basic placement-MMR pure helper with locked candidate defaults.
- Node test coverage for normalization, invalid guesses, duplicate letters, scoring, tie-breaks, and rating examples.

No NestJS, database, Redis, or client-authoritative behavior was introduced.

## Decisions / Recommendations

- Used Node’s built-in test runner instead of adding a new test dependency.
- Kept all game-engine code pure and dependency-free.
- Implemented the rating helper in this ticket rather than deferring to Ticket 24 because package boundaries allowed it and the locked candidate defaults were available.
- Used TypeScript exports in `packages/game-engine/src/index.ts` for now, matching the current scaffold style.
- Used JavaScript/TypeScript `Math.round` for speed bonus rounding. This means a 90s solve in a 120s round has `round(12.5) = 13`, for total score `123`.
- Corrected duplicate-letter expectations in tests according to the two-pass Wordle algorithm where prior planning examples over/under-counted some letters:
  - `belle` vs `level` => `P C A P P`
  - `array` vs `rarer` => `P P C A A`
  - `banal` vs `llama` => `P A P A P`

## Detailed Output

### Implemented pure API surface

`packages/game-engine/src/index.ts` now exports:

- Constants:
  - `STANDARD_WORD_LENGTH`
  - `STANDARD_MAX_GUESSES`
  - `STANDARD_SCORING_PRESET`
- Types:
  - `LetterFeedbackState`
  - `LetterFeedback`
  - `GuessRejectReason`
  - `ValidateGuessInput`
  - `ValidateGuessResult`
  - `RoundScoreInput`
  - `RoundScoreBreakdown`
  - `ParticipantScoreSummary`
  - `FinalStanding`
  - `RatedParticipant`
  - `RatingConfig`
  - `RatingDelta`
- Functions:
  - `normalizeWord(input)`
  - `validateGuess(input)`
  - `scoreGuess(answer, guess)`
  - `isSolved(feedback)`
  - `calculateRoundScore(input)`
  - `compareForStandings(a, b)`
  - `calculateFinalStandings(participants)`
  - `expectedScore(ratingA, ratingB)`
  - `calculatePlacementMmrDeltas(participants, placementGroups, config)`
  - `dictionaryFrom(words)`

### Duplicate-letter algorithm

Implemented the required two-pass Wordle algorithm:

1. First pass marks exact `correct` letters and counts only unmatched answer letters.
2. Second pass walks unmatched guess letters left-to-right and marks `present` only while remaining answer-letter counts are available.
3. Extra duplicate guess letters become `absent` once answer availability is exhausted.

### Scoring behavior

Implemented `standard_v1` scoring:

```text
base_score = solved ? 100 : 0

guess_bonus:
1 guess: +60
2 guesses: +50
3 guesses: +40
4 guesses: +25
5 guesses: +10
6 guesses: +0

speed_bonus = solved ? Math.round(50 * remaining_time_ratio) : 0
round_score = base_score + guess_bonus + speed_bonus
```

Failures/timeouts return zero score.

### Tie-break behavior

Implemented tie-break comparison order:

1. Higher total score.
2. More rounds solved.
3. Lower total valid guesses.
4. Lower total solve time.
5. Better final-round solved state.
6. Lower final-round valid guesses.
7. Lower final-round solve time.
8. Higher best single-round score.
9. Declared tie if still equal.

### Rating helper

Implemented placement-MMR helper using the locked candidate defaults:

- Base pairwise Elo-style expected score.
- Placement groups support ties as `0.5` actual score.
- Established default `K = 24`.
- Provisional default `K = 36`.
- Established delta cap `±40`.
- Provisional delta cap `±60`.

## Open Questions

1. Should Ticket 04’s scoring example for 5 guesses at 90s be amended from `122` to `123` to align with TypeScript `Math.round(12.5) = 13`?
2. Should the corrected duplicate-letter examples be reflected back into the spec docs so Jasmine/Ruby do not preserve the older incorrect expected values?
3. Should future Ticket 24 simulation reuse `calculatePlacementMmrDeltas` directly or maintain separate simulation tooling in `packages/rating-tools` with this package as the source of truth?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Athena
- **Why that agent is needed:** Athena owns source-of-truth spec updates and cross-agent sequencing.
- **Exact task:** Decide whether to amend Ticket 04/spec docs for JS rounding and corrected duplicate-letter examples.
- **Inputs/context they need:** This response and `packages/game-engine/tests/index.test.ts`.
- **Expected output back to Athena:** Confirmation that implementation behavior is accepted or instructions for a follow-up correction ticket.

### Follow-up ticket 2

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA and release gates.
- **Exact task:** Review the new game-engine tests and add/confirm release-gate expectations for duplicate letters, scoring, standings, and rating helper behavior.
- **Inputs/context they need:** Files changed in this ticket and Ticket 14 release gates.
- **Expected output back to Athena:** QA confirmation or additional test cases required before backend gameplay integration.

### Follow-up ticket 3

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns rating simulation tooling.
- **Exact task:** Use or import `calculatePlacementMmrDeltas` from `packages/game-engine` when implementing Ticket 24 rating simulations, unless Athena wants simulation code to remain fully independent.
- **Inputs/context they need:** `packages/game-engine/src/index.ts` rating helper and Athena MMR locks.
- **Expected output back to Athena:** Rating simulation outputs and tuning recommendations.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/game-engine/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/game-engine/src/index.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/game-engine/tests/index.test.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-19-freya-game-engine-core-implementation-response.md`

## Tests / Commands Run

### Command 1

```bash
node --version && pnpm --version
```

Result: passed, exit code `0`.

Output:

```text
v26.3.0
11.1.1
```

### Command 2

```bash
pnpm --filter @wordle-royale/game-engine test
```

Result: failed, exit code `1`.

Reason: initial tests included several expected values copied from planning examples that did not match the actual two-pass Wordle algorithm / JS rounding behavior.

Failures corrected:

- `belle` vs `level` expected changed from `P C A P A` to `P C A P P`.
- `array` vs `rarer` expected changed from `P P A A P` to `P P C A A`.
- 5 guesses at 90s score expected changed from `122` to `123` because `Math.round(12.5) = 13`.

### Command 3

```bash
pnpm --filter @wordle-royale/game-engine test && pnpm --filter @wordle-royale/game-engine typecheck && pnpm test
```

Result: failed, exit code `1`.

Reason: one remaining duplicate-letter expectation was still incorrect.

Failure corrected:

- `banal` vs `llama` expected changed from `A A P A P` to `P A P A P`.

### Command 4

```bash
pnpm --filter @wordle-royale/game-engine test && pnpm --filter @wordle-royale/game-engine typecheck && pnpm test
```

Result: passed, exit code `0`.

Output summary:

```text
ℹ tests 21
ℹ suites 6
ℹ pass 21
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
Workspace scaffold validation passed (9 workspace packages).
```

### Command 5

```bash
git status --short && git diff -- packages/game-engine/package.json packages/game-engine/src/index.ts packages/game-engine/tests/index.test.ts | sed -n '1,240p'
```

Result: failed, exit code `128`.

Output:

```text
fatal: not a git repository (or any of the parent directories): .git
```

## Evidence / Result

- `packages/game-engine` no longer contains only a placeholder export.
- `pnpm --filter @wordle-royale/game-engine test` passes with 21 tests.
- `pnpm --filter @wordle-royale/game-engine typecheck` passes using Node syntax checks configured for this scaffold.
- Root `pnpm test` passes the current workspace validation script.
- Rating helper was implemented with tests and not deferred.
- No NestJS/database wiring was added.

## Risks / Blockers

- The current scaffold does not have a full TypeScript compiler dependency wired into package scripts; `typecheck` currently uses Node syntax checks. A future scaffold/tooling ticket should add real `tsc --noEmit` or equivalent.
- Some planning examples in Ticket 04 appear inconsistent with the strict two-pass feedback algorithm and TypeScript `Math.round`; Athena/Jasmine should decide whether to update specs or require alternate rounding.
- Rating helper is suitable for pure calculations, but production tuning still depends on Ticket 24 simulations.
- No backend API integration was performed in this ticket by design.
