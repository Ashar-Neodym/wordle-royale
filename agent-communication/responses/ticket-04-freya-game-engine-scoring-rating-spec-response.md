# Ticket 4 — Game Engine, Scoring, and Rating Specification — Response

## Summary

This response defines the deterministic server-authoritative Wordle Royale game-engine specification for standard 5-letter gameplay, including word validation, duplicate-letter feedback, round/match state machines, scoring, tie-breakers, match reports, rated vs unranked behavior, a V1 rating/MMR recommendation, pure function boundaries, unit test coverage, and implementation follow-up tickets.

This is a specification task only. No game-engine implementation files were created.

## Decisions / Recommendations

1. **Launch gameplay should be fixed standard 5-letter Wordle-style mode.** Keep word length configurable in data structures, but lock ranked V1 to `wordLength = 5`, `maxGuesses = 6`.
2. **The server must be authoritative for all competitive decisions.** Clients submit intent only; they never authoritatively validate guesses, compute feedback, compute score, reveal answers, finalize matches, or update ratings.
3. **Invalid guesses should not consume attempts, but should consume time.** This matches the ticket assumption and creates a forgiving UX while preserving competitive pressure.
4. **Use a two-pass duplicate-letter feedback algorithm.** First mark exact-position letters, then allocate remaining answer-letter counts to present letters. This is the most important correctness rule for Wordle-style behavior.
5. **Use the proposed score formula for V1 with one small precision rule:** speed bonus is calculated from server timestamps and rounded with JavaScript-style `Math.round` semantics in implementation. Formula remains simple and explainable.
6. **Use a custom placement-based MMR for V1, with an upgrade path to TrueSkill-style uncertainty later.** Reason: Wordle Royale needs multiplayer placement support, transparent tuning, easy simulation, and predictable product behavior. Full TrueSkill/Glicko-2 is more mathematically rich but adds complexity before product balance is proven.
7. **Store rating state with uncertainty/provisional fields even if V1 uses custom MMR.** This keeps the database compatible with future Glicko-2 or TrueSkill-style upgrades.
8. **Rated matches should use locked ranked-compatible settings.** Unranked matches may be more flexible but should still use the same deterministic engine.

## Detailed Output

## 1. Standard Game Rules

### Launch mode

- Mode name: `standard`.
- Language: `en` for V1 unless later expanded.
- Word length: exactly 5 letters.
- Max guesses per player per round: 6 valid guesses.
- All players in the same round receive the same hidden answer.
- The answer is selected by the server from the active approved answer list for the selected language, word length, difficulty, and dictionary version.
- The answer is never sent to clients before round end.
- Each guess must be exactly 5 alphabetic characters after normalization.
- Each accepted guess receives per-letter feedback:
  - `correct`: letter exists in answer at the same index.
  - `present`: letter exists in answer but at a different index, subject to duplicate-letter limits.
  - `absent`: letter is not available in the answer after exact/present allocations.
- A player's round ends when any of these occurs:
  - player solves the word,
  - player submits 6 valid guesses without solving,
  - server-authoritative round timer expires,
  - player forfeits/abandons,
  - player disconnects beyond the configured grace policy and is marked timed out/forfeited.
- A round ends globally when all active players have reached a terminal player-round state or the round timer expires.
- A match contains one or more rounds according to lobby settings.
- Match winner/placement is determined from final standings using deterministic tie-breakers.

### Rated V1 locked settings

Recommended ranked-compatible settings for V1:

| Setting | Rated V1 value |
|---|---:|
| Mode | `standard` |
| Word length | `5` |
| Max guesses | `6` |
| Round time | one approved value, recommended `120s` |
| Dictionary | active ranked dictionary version |
| Difficulty | one ranked-supported value or separate rating bucket per difficulty |
| Scoring preset | `standard_v1` |
| Custom word packs | not allowed |
| Experimental modifiers | not allowed |

Unranked lobbies can later allow broader settings, but every setting should be persisted on `matches` so reports remain reproducible.

## 2. Word Validation Rules

### Normalization

Before validation, the server normalizes guesses and answers:

1. Trim leading/trailing whitespace.
2. Convert to lowercase.
3. Reject if normalized string contains non-ASCII letters for English V1.
4. Reject if normalized string length is not exactly `wordLength`.
5. Reject if word is in banned/excluded list.
6. Check dictionary membership.

Recommended V1 behavior:

- `answerList`: words eligible as target answers.
- `guessList`: words accepted as guesses; may be broader than `answerList`.
- A valid answer must also be valid as a guess.
- Guess validation checks `guessList`, not just `answerList`.
- Dictionary version used for a match/round must be stored so old match reports remain reproducible.

### Invalid guess behavior

Invalid guesses:

- do not increment `guess_count`,
- do not consume one of the 6 attempts,
- do consume elapsed time because the server timer continues,
- should return a rejection reason,
- should be idempotent by `clientRequestId`,
- should be rate-limited to avoid spam.

Recommended rejection reasons:

- `wrong_length`
- `invalid_characters`
- `not_in_dictionary`
- `banned_word`
- `round_not_active`
- `already_solved`
- `max_guesses_reached`
- `deadline_passed`
- `duplicate_request`

## 3. Duplicate-Letter Feedback Algorithm

### Feedback states

Use exact enum values:

```ts
type LetterFeedbackState = 'correct' | 'present' | 'absent';
```

### Required algorithm

The feedback algorithm must be deterministic and must not over-credit duplicate letters.

Inputs:

- `answer`: normalized answer string, length N.
- `guess`: normalized guess string, length N.

Output:

- array of N feedback cells: `{ letter, state }`.

Algorithm:

1. Initialize all feedback cells as `absent`.
2. Create an empty count map `remainingAnswerLetters`.
3. **First pass: exact matches.**
   - For each index `i`:
     - If `guess[i] === answer[i]`, mark feedback `correct`.
     - Otherwise, increment `remainingAnswerLetters[answer[i]]`.
4. **Second pass: present matches.**
   - For each index `i` where feedback is not already `correct`:
     - Let `letter = guess[i]`.
     - If `remainingAnswerLetters[letter] > 0`, mark feedback `present` and decrement that count.
     - Otherwise leave feedback as `absent`.
5. Return feedback in original guess order.

### Pseudocode

```ts
export function scoreGuess(answer: string, guess: string): LetterFeedback[] {
  assert(answer.length === guess.length);

  const feedback = guess.split('').map((letter) => ({ letter, state: 'absent' as const }));
  const remaining = new Map<string, number>();

  for (let i = 0; i < answer.length; i += 1) {
    if (guess[i] === answer[i]) {
      feedback[i].state = 'correct';
    } else {
      remaining.set(answer[i], (remaining.get(answer[i]) ?? 0) + 1);
    }
  }

  for (let i = 0; i < guess.length; i += 1) {
    if (feedback[i].state === 'correct') continue;
    const letter = guess[i];
    const count = remaining.get(letter) ?? 0;
    if (count > 0) {
      feedback[i].state = 'present';
      remaining.set(letter, count - 1);
    }
  }

  return feedback;
}
```

## 4. Duplicate-Letter Examples

Legend: `C = correct`, `P = present`, `A = absent`.

| Answer | Guess | Feedback | Why |
|---|---|---|---|
| `apple` | `allee` | `C P A A C` | `a` and final `e` exact; one remaining `l` exists; extra `l/e` beyond answer availability are absent. |
| `cigar` | `civic` | `C C A A A` | `c` and `i` exact; no second `c`, no `v`, no second `i` availability after exacts. |
| `belle` | `level` | `P C A P A` | `e` at index 1 exact; one `l` and one remaining `e` can be present; extra `l` absent. |
| `allee` | `eagle` | `P P A P C` | final `e` exact; first `e`, `a`, and `l` can be present; `g` absent. |
| `mamma` | `maxim` | `C C A A P` | `m` and `a` exact; final `m` present from remaining answer `m`; `x/i` absent. |
| `array` | `rarer` | `P P A A P` | answer has two `r`s and one `a`; guess receives only available counts not already consumed. |
| `banal` | `llama` | `A A P A P` | answer has one `l` and two `a`s; one `l` and one later `a` can be credited after exact pass. |

These examples should be encoded as unit tests because duplicate-letter mistakes are among the most visible Wordle-engine bugs.

## 5. Round Lifecycle / State Machine

### Round states

Recommended persisted round states:

```ts
type RoundState =
  | 'pending'
  | 'countdown'
  | 'active'
  | 'finalizing'
  | 'completed'
  | 'voided';
```

### Player-round states

Recommended per-player round states:

```ts
type PlayerRoundState =
  | 'not_started'
  | 'active'
  | 'solved'
  | 'failed'
  | 'timed_out'
  | 'forfeited'
  | 'disconnected'
  | 'voided';
```

### Round transitions

| From | To | Trigger | Notes |
|---|---|---|---|
| `pending` | `countdown` | match enters next round setup | Answer selected server-side; no answer sent to clients. |
| `countdown` | `active` | `serverTime >= startsAt` | Timer uses `startsAt` and `endsAt`; no per-second server ticks required. |
| `active` | `finalizing` | all players terminal or `serverTime >= endsAt` | Lock round before scoring to prevent races. |
| `finalizing` | `completed` | scores persisted and round report ready | Reveal answer after this point. |
| any non-completed | `voided` | admin/system integrity issue | No score/rating impact unless policy says otherwise. |

### Per-player transitions

| From | To | Trigger |
|---|---|---|
| `not_started` | `active` | round starts |
| `active` | `solved` | valid guess equals answer before deadline |
| `active` | `failed` | 6 valid guesses used without solve |
| `active` | `timed_out` | round deadline passes |
| `active` | `disconnected` | socket/session lost; timer continues |
| `disconnected` | `active` | reconnect before round end/grace expiry |
| `disconnected` | `timed_out` or `forfeited` | grace expiry or round deadline |
| any non-voided | `voided` | round voided |

### Timer behavior

- Server stores `startsAt` and `endsAt`.
- Every guess submission is evaluated against server receipt time, not client-submitted time.
- A guess received after `endsAt` is rejected with `deadline_passed` unless already accepted idempotently before the deadline.
- Client timers are display-only and should be derived from `serverTime` snapshots/events.
- Disconnects and mobile backgrounding do not pause the timer.

## 6. Match Lifecycle / State Machine

### Match states

Recommended persisted match states:

```ts
type MatchState =
  | 'initializing'
  | 'countdown'
  | 'in_progress'
  | 'round_intermission'
  | 'finalizing'
  | 'completed'
  | 'abandoned'
  | 'cancelled'
  | 'voided';
```

### Match transitions

| From | To | Trigger | Notes |
|---|---|---|---|
| `initializing` | `countdown` | lobby start accepted, participants locked, rounds generated | Validate ranked settings here. |
| `countdown` | `in_progress` | match start time reached | First round enters countdown/active flow. |
| `in_progress` | `round_intermission` | round completed and more rounds remain | Interim standings shown. |
| `round_intermission` | `in_progress` | next round starts | Next answer remains hidden. |
| `in_progress` or `round_intermission` | `finalizing` | last round completed or all remaining players terminal | Lock match before final standings. |
| `finalizing` | `completed` | scores, placements, reports, stats, rating jobs persisted | Rating update may be synchronous for V1 or queued, but must be idempotent. |
| pre-start states | `cancelled` | host/system cancellation before match starts | No rating impact. |
| active states | `abandoned` | insufficient viable players, all players leave, or abandon policy triggers | Rated impact depends on timing/policy. |
| any | `voided` | admin/system integrity issue | Reverse or suppress rating changes. |

### Concurrency rules

- Use a per-match or per-round lock for guess processing and finalization.
- Guess submissions must include `clientRequestId`.
- Store idempotency records for accepted/rejected guess submissions.
- Apply match finalization exactly once.
- Apply rating update exactly once per rated match via unique `(user_id, match_id, mode)` rating events.

## 7. Score Formula

### V1 score formula

Use the ticket's proposed formula as `standard_v1`:

```text
base_score = solved ? 100 : 0

guess_bonus_by_guess_count:
1 guess: +60
2 guesses: +50
3 guesses: +40
4 guesses: +25
5 guesses: +10
6 guesses: +0

remaining_time_ratio = clamp((round_time_seconds - solve_elapsed_seconds) / round_time_seconds, 0, 1)
speed_bonus = solved ? round(50 * remaining_time_ratio) : 0
round_score = base_score + guess_bonus + speed_bonus
```

### Precision rules

- `solve_elapsed_seconds` is computed from server timestamps: `solvedAt - round.startsAt`.
- Use millisecond precision internally; convert ratio using milliseconds to avoid rounding artifacts.
- Use implementation language's standard half-up/user-facing rounding consistently; in TypeScript use `Math.round`.
- Failed, timed-out, or forfeited players receive `0` round score.
- Invalid guesses do not affect guess count or score directly.
- Score events should be persisted as components:
  - `solve_base`
  - `guess_bonus`
  - `speed_bonus`
  - optional `penalty`/`adjustment` for future admin actions, not V1 normal scoring.

## 8. Example Scoring Calculations

The following examples use `round_time_seconds = 120` and were computed with the specified formula.

| Scenario | Calculation | Round score |
|---|---|---:|
| Solved in 3 guesses at 45s | base `100` + guess bonus `40` + speed bonus `round(50 * 75/120) = 31` | `171` |
| Solved in 5 guesses at 90s | base `100` + guess bonus `10` + speed bonus `round(50 * 30/120) = 12` | `122` |
| Timeout/failed at 120s | base `0` + guess bonus `0` + speed bonus `0` | `0` |
| Solved in 1 guess at 10s | base `100` + guess bonus `60` + speed bonus `round(50 * 110/120) = 46` | `206` |

## 9. Tie-Breaker Order

Final match placement should be deterministic and visible in match reports.

Recommended order:

1. Higher `totalScore`.
2. More `roundsSolved`.
3. Lower `totalValidGuesses` across solved/failed rounds.
4. Lower `totalSolveMs` across solved rounds.
5. Better final-round result:
   - solved beats failed/timed out,
   - fewer guesses wins,
   - faster solve wins.
6. Better best single-round score.
7. If still equal, declared tie.

For rated calculation, declared ties should be represented as equal placement groups.

## 10. Match Report Fields

Recommended match report shape:

```ts
interface MatchReport {
  matchId: string;
  lobbyId?: string | null;
  mode: 'standard';
  rated: boolean;
  scoringPreset: 'standard_v1';
  dictionaryVersion: string;
  language: string;
  wordLength: number;
  roundsCount: number;
  roundTimeSeconds: number;
  startedAt: string;
  completedAt: string;
  state: 'completed' | 'abandoned' | 'voided';
  voidReason?: string | null;
  participants: MatchReportParticipant[];
  rounds: MatchReportRound[];
  finalStandings: FinalStanding[];
}

interface MatchReportParticipant {
  userId: string;
  displayName: string;
  handle?: string | null;
  placement: number | null;
  outcome: 'won' | 'lost' | 'tied' | 'forfeited' | 'abandoned' | 'voided';
  totalScore: number;
  roundsSolved: number;
  totalValidGuesses: number;
  totalSolveMs: number;
  ratingBefore?: number | null;
  ratingAfter?: number | null;
  ratingDelta?: number | null;
  provisional?: boolean | null;
}

interface MatchReportRound {
  roundId: string;
  roundNumber: number;
  answer: string; // reveal only after round/match policy allows
  startedAt: string;
  endedAt: string;
  playerResults: RoundPlayerReport[];
}

interface RoundPlayerReport {
  userId: string;
  state: 'solved' | 'failed' | 'timed_out' | 'forfeited' | 'voided';
  validGuessCount: number;
  solveMs?: number | null;
  roundScore: number;
  scoreBreakdown: {
    base: number;
    guessBonus: number;
    speedBonus: number;
  };
}
```

Do not expose hidden answer before the round is completed. Public report visibility should obey match visibility/profile privacy rules from product requirements.

## 11. Rated vs Unranked Differences

| Area | Rated | Unranked |
|---|---|---|
| Auth | Required | Recommended; guest mode possible only if product approves |
| Settings | Locked ranked-compatible settings | Flexible lobby settings allowed |
| Dictionary | Approved ranked dictionary only | Can allow broader/future dictionaries after moderation |
| Score | Always persisted | Persisted for reports/stats if authenticated |
| Rating/MMR | Updated after valid completion | No rating impact |
| Leaderboards | Counts toward ranked leaderboard | Does not count toward ranked leaderboard |
| Anti-cheat telemetry | Required for integrity | Basic telemetry/rate limits still recommended |
| Abandon/forfeit | Penalized by rating policy | Reported as abandon/forfeit but no rating delta |
| Voiding | Suppresses/reverses rating changes | Suppresses stats if integrity is affected |
| Match report | Includes rating before/after/delta | Omits or nulls rating fields |

## 12. Rating/MMR Recommendation

### Recommendation: Custom placement-based MMR for V1

Use a custom multiplayer placement-based MMR inspired by pairwise Elo expectations, with provisional multipliers and future-compatible uncertainty fields.

Why this recommendation:

- Wordle Royale supports more than 2 players, so plain two-player Elo is insufficient by itself.
- Placement-based pairwise calculation handles 1v1 and multiplayer with the same core logic.
- It is easier to explain, simulate, tune, and debug than full TrueSkill/Glicko-2 during early product balancing.
- It supports ties naturally via equal placement groups.
- It can store rating deviation/provisional fields now, allowing later upgrade to Glicko-2 or TrueSkill-style uncertainty if ranked population justifies it.

### V1 rating state

```ts
interface RatingState {
  userId: string;
  seasonId: string;
  mode: string;
  rating: number;           // default 1500
  ratingDeviation?: number;  // optional/future-compatible, default 350 for new players
  provisional: boolean;      // true until enough rated matches completed
  matchesPlayed: number;
  peakRating: number;
}
```

### Placement-based MMR formula

For each rated participant `i`, compare them against every other participant `j`.

```text
expected_i_vs_j = 1 / (1 + 10 ^ ((rating_j - rating_i) / 400))

actual_i_vs_j:
  1.0 if i placed above j
  0.5 if i tied with j
  0.0 if i placed below j

raw_delta_i = K * sum(actual_i_vs_j - expected_i_vs_j for every j != i)
```

Recommended K values:

- `K = 24` standard.
- `K = 36` for provisional players, or multiply raw delta by `1.5` for first 10 rated matches.
- Optional cap: max gain/loss `±60` per match for V1 to avoid extreme movement in large lobbies.

### Placement groups

Represent ties as placement groups:

```ts
// A wins, B and C tie for second, D fourth
const placementGroups = [['A'], ['B', 'C'], ['D']];
```

## 13. Rating Calculation Examples

These examples use the recommended pairwise placement MMR with `K = 24` and no provisional multiplier.

### Example A: 4 equal-rated players, clear placement

Input:

```text
A rating 1500, placement 1
B rating 1500, placement 2
C rating 1500, placement 3
D rating 1500, placement 4
```

Result:

| Player | Delta | New rating |
|---|---:|---:|
| A | `+36` | `1536` |
| B | `+12` | `1512` |
| C | `-12` | `1488` |
| D | `-36` | `1464` |

### Example B: Upset result

Input:

```text
A rating 1700, placement 2
B rating 1500, placement 1
C rating 1500, placement 3
D rating 1300, placement 4
```

Result:

| Player | Delta | New rating |
|---|---:|---:|
| A | `-10` | `1690` |
| B | `+36` | `1536` |
| C | `-12` | `1488` |
| D | `-14` | `1286` |

B gains strongly for beating a higher-rated player. A loses rating despite second place because A was expected to beat B.

### Example C: Tie for second

Input:

```text
A rating 1500, placement 1
B rating 1500, tied placement 2
C rating 1500, tied placement 2
D rating 1500, placement 4
```

Result:

| Player | Delta | New rating |
|---|---:|---:|
| A | `+36` | `1536` |
| B | `0` | `1500` |
| C | `0` | `1500` |
| D | `-36` | `1464` |

## 14. Pure Function / API Proposal for Game Engine Package

Recommended package boundary:

```text
packages/game-engine/
  src/
    constants.ts
    types.ts
    normalize.ts
    word-validator.ts
    feedback-engine.ts
    scoring-engine.ts
    round-state-machine.ts
    match-state-machine.ts
    standings.ts
    rating-engine.ts
    match-report.ts
    index.ts
```

### Core pure functions

```ts
export function normalizeWord(input: string, options: NormalizeOptions): string;

export function validateGuess(input: ValidateGuessInput): ValidateGuessResult;

export function scoreGuess(input: {
  answer: string;
  guess: string;
}): LetterFeedback[];

export function isSolved(feedback: LetterFeedback[]): boolean;

export function calculateRoundScore(input: {
  solved: boolean;
  validGuessCount: number;
  roundStartedAtMs: number;
  solvedAtMs?: number;
  roundTimeMs: number;
  scoringPreset: 'standard_v1';
}): RoundScoreBreakdown;

export function reducePlayerRoundState(input: {
  current: PlayerRoundStateSnapshot;
  event: PlayerRoundEvent;
  serverTimeMs: number;
  config: RoundConfig;
}): PlayerRoundStateSnapshot;

export function reduceRoundState(input: {
  current: RoundStateSnapshot;
  playerStates: PlayerRoundStateSnapshot[];
  event: RoundEvent;
  serverTimeMs: number;
}): RoundStateSnapshot;

export function reduceMatchState(input: {
  current: MatchStateSnapshot;
  rounds: RoundStateSnapshot[];
  event: MatchEvent;
  serverTimeMs: number;
}): MatchStateSnapshot;

export function calculateFinalStandings(input: {
  participants: ParticipantScoreSummary[];
  tieBreakers: TieBreakerConfig;
}): FinalStanding[];

export function calculateRatingDeltas(input: {
  participants: RatedParticipant[];
  placementGroups: string[][];
  config: RatingConfig;
}): RatingDelta[];

export function buildMatchReport(input: MatchReportInput): MatchReport;
```

### Side-effect boundaries

The game-engine package should not directly:

- query the database,
- access Redis,
- emit WebSocket events,
- read wall-clock time itself,
- generate random words itself without injected seed/random source,
- mutate external state.

Instead, backend services should inject:

- `serverTimeMs`,
- selected answer word,
- dictionary snapshots/version,
- current persisted state,
- event payloads.

This keeps unit tests deterministic and allows shared validation logic without trusting clients for authoritative decisions.

## 15. Unit Test Plan

### Feedback engine tests

- Exact all-correct solve.
- All absent letters.
- Mixed correct/present/absent.
- Duplicate guess letters where answer has fewer copies.
- Duplicate answer letters where guess has fewer copies.
- Exact matches consume letters before present matches.
- All examples in section 4.
- Case normalization happens before feedback.

### Word validation tests

- Valid 5-letter dictionary word accepted.
- Wrong length rejected.
- Non-alpha characters rejected.
- Uppercase normalized and accepted if dictionary contains lowercase.
- Banned word rejected even if dictionary-valid.
- Answer list and guess-valid list distinguished.
- Dictionary version included in validation context.

### Scoring tests

- Solved in each guess count 1–6 receives correct guess bonus.
- Speed bonus at full remaining time.
- Speed bonus at zero remaining time.
- Speed bonus clamps negative remaining time to zero.
- Failed/timed-out/forfeited score is zero.
- Invalid guesses do not increment valid guess count.
- Score breakdown sums to total.

### Round state tests

- Pending → countdown → active → finalizing → completed.
- Solve transitions player to solved.
- Sixth non-solving valid guess transitions player to failed.
- Deadline transitions active player to timed_out.
- Disconnect does not pause timer.
- Reconnect before deadline restores active state.
- Late guess after deadline rejected.
- Duplicate submission by same `clientRequestId` returns same result.

### Match state tests

- Match initializes with locked participants and generated rounds.
- Match progresses through multiple rounds.
- Final standings use deterministic tie-breakers.
- Abandoned match policy triggers when all players leave.
- Voided match suppresses/reverses rating effect.
- Finalization is idempotent.

### Rating tests

- 1v1 winner gains and loser loses.
- 4-player equal-rated placement produces expected deltas.
- Tie placement uses 0.5 actual score between tied players.
- Higher-rated player gains less for expected win.
- Lower-rated player gains more for upset.
- Provisional multiplier applies only to provisional players.
- Rating delta cap applies if configured.
- Rating event uniqueness prevents duplicate application.

### Integration/contract tests

- REST/WS guess submission path uses engine feedback and scoring.
- Match report matches stored round/player/score/rating records.
- Reconnect snapshot never includes answer during active round.
- Round-ended event includes answer only after completion.

## 16. Edge Cases and Required Behavior

### Timeout

- If `serverTime >= endsAt`, active players become `timed_out`.
- Timeout score is `0`.
- Any guess received after deadline is rejected with `deadline_passed`, unless it is an idempotent replay of a request already accepted before deadline.

### Disconnect

- Disconnect changes presence, not the authoritative timer.
- Player may be marked `disconnected` for UI/presence.
- Round timer continues.
- If deadline passes while disconnected, player becomes `timed_out`.
- Rated voluntary abandon/disconnect beyond policy should count negatively.

### Reconnect

- Server returns current lobby/match/round snapshot.
- If round is active and player is still eligible, existing guesses and remaining time are restored.
- If round ended while away, server shows completed round result.
- Active round snapshot must not include answer.

### Abandoned match

Recommended policy:

- Before match start: cancel/expire lobby, no rating impact.
- Early rated match before meaningful play: mark `abandoned` or `cancelled`, no rating impact if no competitive result exists.
- After meaningful rated play has started: remaining/forfeiting player outcomes should be finalized according to abandon policy.
- If all players disconnect due to server/system issue, void rather than penalize players.

### Invalid guesses

- Reject without consuming attempt.
- Timer continues.
- Rate-limit repeated invalid guesses.
- Persist invalid guess events if useful for analytics/anti-cheat, but do not assign a `guess_number` used by valid guesses.

### Duplicate submissions

- Every guess request should include `clientRequestId`.
- If the same player submits the same `clientRequestId` again, return the original result.
- Do not create a second guess row or increment guess count.
- If same `clientRequestId` has different payload, reject with `idempotency_key_conflict`.

### Simultaneous final guesses

- Process using server receipt timestamps and/or per-round lock ordering.
- Two players can both solve before deadline; both are valid.
- Tie-breakers use server `solvedAt` timestamps after score and guess count.
- If two solves have equal score/guesses/time at stored precision, continue tie-breakers or declare tie.

### Voided match

- Voided match state: `voided`.
- Suppress rating update if not applied.
- If rating already applied, create reversing rating events; never silently mutate history.
- Match report should show `voided` and public-safe reason.
- Admin/moderation action must create audit log.

## Open Questions

1. Should ranked V1 allow multiplayer lobbies beyond 1v1 immediately, or should ranked start with 1v1 while unranked supports 2–4 players?
2. Should difficulty be one shared ranked queue at launch or separate rating buckets by difficulty?
3. What exact round timer should be locked for ranked V1? This spec uses `120s` for examples because Ticket 2 API examples used `roundTimeSeconds: 120`.
4. Should unranked authenticated matches count toward casual profile stats by default?
5. What is the exact rated abandon threshold for “meaningful play” before rating impact applies?
6. Should match reports be visible only to participants or publicly shareable?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Athena
- **Why that agent is needed:** Athena owns decision routing and sequencing.
- **Exact task:** Resolve open product decisions for ranked player count, ranked timer, difficulty/rating buckets, casual stats, abandon policy, and match report visibility.
- **Inputs/context they need:** This response, Elisa PRD, Elisa architecture/API contract.
- **Expected output back to Athena:** Approved game/rating policy decisions and updated implementation sequencing.

### Follow-up ticket 2

- **Target agent:** Elisa
- **Why that agent is needed:** Architecture/API contract should align with the finalized engine spec.
- **Exact task:** Review this game-engine spec against the existing REST/WebSocket/database contract and identify any schema/event additions needed for idempotency, score breakdowns, dictionary versions, rating placement groups, and void/reversal records.
- **Inputs/context they need:** This response and Ticket 02 architecture/API response.
- **Expected output back to Athena:** Architecture/API amendment list or confirmation that the existing contract is sufficient.

### Follow-up ticket 3

- **Target agent:** Freya
- **Why that agent is needed:** Freya will implement backend/core game-engine logic when implementation begins.
- **Exact task:** Implement `packages/game-engine` pure functions for normalization, word validation, duplicate-letter feedback, scoring, standings, rating deltas, and state reducers.
- **Inputs/context they need:** This response, approved open decisions, existing monorepo/backend stack decision.
- **Expected output back to Athena:** Implementation summary, files changed, unit tests run, and evidence for duplicate-letter/scoring/rating correctness.

### Follow-up ticket 4

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns tooling/data/scripts and can support rating/word simulations.
- **Exact task:** Build simulation scripts for scoring distribution and placement-MMR tuning across 1v1 and 2–4 player matches, including provisional multiplier and delta cap scenarios.
- **Inputs/context they need:** Rating formula and scoring formula from this response.
- **Expected output back to Athena:** Simulation script paths, sample outputs, recommended K/provisional/cap tuning values.

### Follow-up ticket 5

- **Target agent:** Jasmine
- **Why that agent is needed:** QA should independently verify game-engine correctness.
- **Exact task:** Convert this spec into an acceptance/regression matrix for duplicate-letter feedback, scoring, state transitions, reconnects, finalization, rating deltas, and voided matches.
- **Inputs/context they need:** This response and any implementation PR/branch when available.
- **Expected output back to Athena:** QA matrix with expected results and release-blocker criteria.

### Follow-up ticket 6

- **Target agent:** Luna
- **Why that agent is needed:** Frontend UX must reflect server-authoritative rules clearly.
- **Exact task:** Ensure gameplay UI/wireframes account for invalid guess rejection, server timer display, reconnect snapshots, round-end answer reveal, scoring breakdown, tie-breakers, rating delta display, and voided match messaging.
- **Inputs/context they need:** This response plus Elisa API/WebSocket events.
- **Expected output back to Athena:** UX notes or UI implementation updates covering gameplay/report edge states.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-04-freya-game-engine-scoring-rating-spec-response.md`

## Tests / Commands Run

This was a planning/specification task; no implementation tests were run.

Command run to compute the scoring and rating examples used in this response:

```bash
python3 - <<'PY'
from math import prod
# Scoring examples only, using ticket formula.
def score(solved, guesses, elapsed, round_time=120):
    bonuses = {1:60, 2:50, 3:40, 4:25, 5:10, 6:0}
    if not solved:
        return (0, 0, 0, 0)
    remaining_ratio = max(0, min(1, (round_time - elapsed) / round_time))
    speed_bonus = round(50 * remaining_ratio)
    total = 100 + bonuses[guesses] + speed_bonus
    return (100, bonuses[guesses], speed_bonus, total)
for name, args in [
    ('solved in 3 guesses at 45s of 120s', (True,3,45,120)),
    ('solved in 5 guesses at 90s of 120s', (True,5,90,120)),
    ('timeout/failed at 120s', (False,6,120,120)),
    ('solved in 1 guess at 10s of 120s', (True,1,10,120)),
]:
    print(name, score(*args))

# Pairwise placement Elo-style MMR examples for spec illustration.
def expected(ra, rb):
    return 1/(1+10**((rb-ra)/400))
def deltas(ratings, placement_groups, k=24):
    rank = {p:i for i,g in enumerate(placement_groups) for p in g}
    out = {}
    for p, ra in ratings.items():
        total = 0.0
        for q, rb in ratings.items():
            if p == q: continue
            actual = 1 if rank[p] < rank[q] else 0 if rank[p] > rank[q] else 0.5
            total += actual - expected(ra, rb)
        out[p] = round(k * total)
    return out
print('equal 4p A>B>C>D', deltas({'A':1500,'B':1500,'C':1500,'D':1500}, [['A'],['B'],['C'],['D']]))
print('upset 4p B>A>C>D ratings A1700 B1500 C1500 D1300', deltas({'A':1700,'B':1500,'C':1500,'D':1300}, [['B'],['A'],['C'],['D']]))
print('tie second A > B=C > D', deltas({'A':1500,'B':1500,'C':1500,'D':1500}, [['A'],['B','C'],['D']]))
PY
```

Result:

```text
solved in 3 guesses at 45s of 120s (100, 40, 31, 171)
solved in 5 guesses at 90s of 120s (100, 10, 12, 122)
timeout/failed at 120s (0, 0, 0, 0)
solved in 1 guess at 10s of 120s (100, 60, 46, 206)
equal 4p A>B>C>D {'A': 36, 'B': 12, 'C': -12, 'D': -36}
upset 4p B>A>C>D ratings A1700 B1500 C1500 D1300 {'A': -10, 'B': 36, 'C': -12, 'D': -14}
tie second A > B=C > D {'A': 36, 'B': 0, 'C': 0, 'D': -36}
```

Exit code: `0`.

## Evidence / Result

- Read assigned ticket file: `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/ticket-04-freya-game-engine-scoring-rating-spec.md`.
- Checked for an existing Ticket 04 response file matching `ticket-04-*`; none was present at the time of writing.
- Created the requested response file at:
  - `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-04-freya-game-engine-scoring-rating-spec-response.md`
- Acceptance criteria addressed in this document:
  - exact standard game rules,
  - duplicate-letter algorithm and examples,
  - round and match state machines,
  - score formula and example calculations,
  - tie-breakers,
  - rated/unrated differences,
  - MMR recommendation and multiplayer examples,
  - game-engine function/API proposal,
  - unit test plan,
  - specified edge cases,
  - follow-up implementation tickets.

## Risks / Blockers

- Rating/MMR recommendation is ready for V1, but should be simulation-tested before production ranked launch.
- Ranked player count, timer, difficulty buckets, abandon thresholds, and match report visibility remain product decisions for Athena/Ashar.
- Exact implementation rounding should be standardized in TypeScript tests to avoid language differences.
- Duplicate-letter feedback must be treated as release-blocking correctness because users will notice mistakes immediately.
- This was a specification task only; implementation and automated tests still need follow-up tickets.
