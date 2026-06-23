# Ticket 15 — Rating/MMR Simulation and Balance Plan — Response

## Summary

This response defines a simulation and tuning plan for Wordle Royale's custom placement-based MMR system. The plan covers the locked V1 ranked direction from Athena/Freya/Elisa:

- Ranked V1 should support a **1v1 ranked beta first** if multiplayer ranked tuning remains risky.
- The rating engine should still be designed for **future 2–4 player placement matches**.
- Ranked V1 uses **one fixed official ranked dictionary/difficulty mix**, not separate difficulty buckets.
- Rating changes must be **server-authoritative, idempotent, reversible on void**, and simulation-tested before ranked launch.

Recommended starting point for simulation:

- Base rating: `1500`.
- Pairwise Elo-style expectation inside placement groups.
- Average pairwise deltas so multiplayer does not explode relative to 1v1.
- Baseline established-player K: `24`.
- Provisional K/multiplier: test `K=36` and/or `1.5x` for first `10` rated matches.
- Initial delta cap candidates: `±40` established, `±60` provisional.
- Ranked beta release gate: 1v1 only until simulations, QA fixtures, idempotency tests, and beta telemetry are stable.

## Decisions / Recommendations

1. **Simulate the custom placement-MMR before enabling public ranked.**
   - Freya's placement-based formula is accepted architecturally, but tuning is not production-safe until simulated across 1v1, multiplayer, provisional, abandon, and upset scenarios.

2. **Use averaged pairwise deltas for multiplayer.**
   - Without averaging, 4-player deltas can be much larger than 1v1 deltas for the same K value.
   - Averaging keeps K easier to reason about across player counts.

3. **Start ranked beta as 1v1 if time is limited.**
   - The model can support 2–4 players, but 1v1 has simpler fairness, matchmaking, and interpretability.
   - Keep multiplayer ranked behind a feature flag until simulation and telemetry prove stable.

4. **Use one ranked queue/difficulty mix for V1.**
   - Athena has locked this default. Separate difficulty rating buckets should be deferred.

5. **Treat abandons/forfeits as policy-driven placements.**
   - If meaningful play threshold is met, an abandon should rank the abandoning player last.
   - If meaningful play threshold is not met or server integrity is compromised, match should be cancelled/voided with no rating impact.

6. **Use idempotent rating jobs and reversible event history.**
   - Rating application must produce exactly one `apply` event per user/match/mode.
   - Voids after rating application must insert reversal events rather than mutating/deleting prior events.

## Detailed Output

### 1. Proposed MMR formula parameters to simulate

#### Core pairwise formula

For each rated match, convert final placements into pairwise outcomes:

```text
expected_i_vs_j = 1 / (1 + 10 ^ ((rating_j - rating_i) / rating_scale))

actual_i_vs_j =
  1.0 if player i placed above player j
  0.5 if player i tied player j
  0.0 if player i placed below player j
```

Recommended raw delta:

```text
raw_delta_i = K_i * average_for_all_opponents(actual_i_vs_j - expected_i_vs_j)
```

Then apply:

```text
provisional_adjusted_delta_i = raw_delta_i * provisional_multiplier_i
capped_delta_i = clamp(round(provisional_adjusted_delta_i), -delta_cap_i, +delta_cap_i)
new_rating_i = max(rating_floor, rating_i + capped_delta_i)
```

#### Parameters to simulate

| Parameter | Recommended baseline | Test range | Notes |
|---|---:|---:|---|
| `baseRating` | `1500` | `1200`, `1500` | 1500 is conventional and matches Freya examples. |
| `ratingScale` | `400` | `300`, `400`, `500` | Lower scale makes rating gaps matter more. |
| `establishedK` | `24` | `16`, `20`, `24`, `28`, `32` | Freya examples use 24. |
| `provisionalK` | `36` | `32`, `36`, `40`, `48` | Alternative to multiplier. |
| `provisionalMultiplier` | `1.5` | `1.25`, `1.5`, `2.0` | Apply only while provisional. |
| `provisionalMatches` | `10` | `5`, `10`, `15`, `20` | Ticket 10 default is 10 remaining provisional matches. |
| `establishedDeltaCap` | `40` | `24`, `32`, `40`, `48` | Prevents single-match shock. |
| `provisionalDeltaCap` | `60` | `40`, `60`, `72` | Lets new users converge faster. |
| `ratingFloor` | `100` | `0`, `100`, `500` | Prevents negative/unhelpful ratings. |
| `abandonPenaltyCap` | `40` | `24`, `40`, `60` | If abandon counts as last-place finish. |
| `minMeaningfulPlay` | TBD | 1 round completed, 50% match elapsed, first valid guess submitted | Needs product approval. |

### 2. Recommended parameter sets to compare

#### Set A — Conservative beta

```json
{
  "name": "conservative_beta",
  "ratingScale": 400,
  "establishedK": 20,
  "provisionalK": 32,
  "provisionalMatches": 10,
  "establishedDeltaCap": 32,
  "provisionalDeltaCap": 48,
  "ratingFloor": 100
}
```

Use if early beta risk tolerance is low.

#### Set B — Recommended baseline

```json
{
  "name": "baseline_v1",
  "ratingScale": 400,
  "establishedK": 24,
  "provisionalK": 36,
  "provisionalMatches": 10,
  "establishedDeltaCap": 40,
  "provisionalDeltaCap": 60,
  "ratingFloor": 100
}
```

This is the recommended first simulation target.

#### Set C — Faster convergence

```json
{
  "name": "fast_convergence",
  "ratingScale": 400,
  "establishedK": 28,
  "provisionalK": 48,
  "provisionalMatches": 10,
  "establishedDeltaCap": 48,
  "provisionalDeltaCap": 72,
  "ratingFloor": 100
}
```

Use only if provisional players converge too slowly.

### 3. Simulation scenarios and sample expected outputs

The following sample outputs were calculated with:

- `ratingScale = 400`
- `K = 24`
- averaged pairwise deltas
- no cap unless noted
- no provisional multiplier unless noted

#### Scenario A — 1v1 equal ratings

Input:

```json
{
  "ratings": { "A": 1500, "B": 1500 },
  "placements": [["A"], ["B"]]
}
```

Expected baseline output:

```json
{ "A": 12, "B": -12 }
```

Interpretation:

- Equal-rating 1v1 result should move ratings modestly.
- If this feels too slow, test `K=28` or `K=32`.

#### Scenario B — 1v1 upset

Input:

```json
{
  "ratings": { "A": 1700, "B": 1500 },
  "placements": [["B"], ["A"]]
}
```

Expected baseline output:

```json
{ "A": -18, "B": 18 }
```

Interpretation:

- Upsets should move more than equal-rating expected wins.
- Delta remains bounded enough for beta.

#### Scenario C — 4-player equal ratings

Input:

```json
{
  "ratings": { "A": 1500, "B": 1500, "C": 1500, "D": 1500 },
  "placements": [["A"], ["B"], ["C"], ["D"]]
}
```

Expected baseline output:

```json
{ "A": 12, "B": 4, "C": -4, "D": -12 }
```

Interpretation:

- Averaging keeps 4-player deltas comparable to 1v1.
- First place gains; last place loses; middle placements move less.

#### Scenario D — 4-player upset

Input:

```json
{
  "ratings": { "A": 1700, "B": 1500, "C": 1500, "D": 1300 },
  "placements": [["B"], ["A"], ["C"], ["D"]]
}
```

Expected baseline output:

```json
{ "A": -3, "B": 12, "C": -4, "D": -5 }
```

Interpretation:

- B gains for beating a stronger player and everyone else.
- A loses a little despite second place because A was expected to beat B.
- D loses less than equal-rating last place because D was expected to place lower.

#### Scenario E — 4-player tie

Input:

```json
{
  "ratings": { "A": 1500, "B": 1500, "C": 1500, "D": 1500 },
  "placements": [["A"], ["B", "C"], ["D"]]
}
```

Expected baseline output:

```json
{ "A": 12, "B": 0, "C": 0, "D": -12 }
```

Interpretation:

- Tied middle players should receive equal deltas.
- Tie handling must be deterministic and match Freya's final standings logic.

#### Scenario F — provisional player wins 1v1

Input:

```json
{
  "ratings": { "A": 1500, "B": 1500 },
  "placements": [["A"], ["B"]],
  "provisionalMultipliers": { "A": 1.5, "B": 1.0 },
  "deltaCap": 48
}
```

Expected baseline output:

```json
{ "A": 18, "B": -12 }
```

Interpretation:

- Only provisional player A gets accelerated movement.
- Established opponent B should not be over-penalized solely because A is provisional.

### 4. Proposed script paths/CLI commands for later implementation

Recommended package:

```text
packages/rating-tools/
  package.json
  tsconfig.json
  README.md
  src/
    cli.ts
    rating-formula.ts
    scenarios.ts
    simulation-runner.ts
    synthetic-players.ts
    telemetry-input.ts
    reports.ts
    charts.ts
    configs/
      conservative-beta.json
      baseline-v1.json
      fast-convergence.json
  data/
    scenarios/
      1v1-baseline.json
      1v1-upsets.json
      4p-placement.json
      provisional-users.json
      abandon-forfeit.json
      inflation-deflation.json
    reports/
      .gitkeep
```

Recommended scripts:

```json
{
  "scripts": {
    "rating:scenario": "tsx packages/rating-tools/src/cli.ts scenario",
    "rating:simulate": "tsx packages/rating-tools/src/cli.ts simulate",
    "rating:compare": "tsx packages/rating-tools/src/cli.ts compare",
    "rating:report": "tsx packages/rating-tools/src/cli.ts report"
  }
}
```

Example commands:

```bash
pnpm rating:scenario \
  --scenario packages/rating-tools/data/scenarios/1v1-baseline.json \
  --config packages/rating-tools/src/configs/baseline-v1.json
```

```bash
pnpm rating:simulate \
  --players 10000 \
  --matches 250000 \
  --mode 1v1 \
  --skill-distribution normal \
  --config packages/rating-tools/src/configs/baseline-v1.json \
  --output packages/rating-tools/data/reports/1v1-baseline-v1.json
```

```bash
pnpm rating:simulate \
  --players 10000 \
  --matches 250000 \
  --mode multiplayer \
  --player-counts 2,3,4 \
  --config packages/rating-tools/src/configs/baseline-v1.json \
  --output packages/rating-tools/data/reports/multiplayer-baseline-v1.json
```

```bash
pnpm rating:compare \
  --reports packages/rating-tools/data/reports/1v1-conservative.json,packages/rating-tools/data/reports/1v1-baseline-v1.json,packages/rating-tools/data/reports/1v1-fast-convergence.json \
  --output packages/rating-tools/data/reports/parameter-comparison.md
```

### 5. Simulation report format

Recommended JSON report:

```json
{
  "reportVersion": 1,
  "configName": "baseline_v1",
  "generatedAt": "2026-06-22T00:00:00.000Z",
  "simulation": {
    "players": 10000,
    "matches": 250000,
    "mode": "1v1",
    "seed": 12345
  },
  "parameters": {
    "ratingScale": 400,
    "establishedK": 24,
    "provisionalK": 36,
    "provisionalMatches": 10,
    "establishedDeltaCap": 40,
    "provisionalDeltaCap": 60
  },
  "summary": {
    "meanRating": 1500.2,
    "medianRating": 1498,
    "ratingStdDev": 180.5,
    "minRating": 812,
    "maxRating": 2290,
    "ratingInflationPer1000Matches": 0.1,
    "averageAbsoluteDelta": 13.4,
    "provisionalConvergenceMatchesMedian": 8
  },
  "qualityChecks": [
    {
      "id": "zero_sum_or_near_zero_sum",
      "passed": true,
      "message": "Mean rating remained stable within tolerance."
    },
    {
      "id": "provisional_converges",
      "passed": true,
      "message": "Most provisional players converge within configured provisional window."
    }
  ]
}
```

Recommended Markdown report sections:

- Config summary.
- Scenario summary table.
- Rating distribution before/after.
- Delta distribution.
- Provisional convergence.
- Upset sensitivity.
- Abandon/forfeit impact.
- Inflation/deflation checks.
- Recommended parameter changes.
- Release gate pass/fail.

### 6. Recommended provisional multiplier, K values, and delta caps to test

#### Recommended initial test matrix

| Config | Established K | Provisional K | Provisional multiplier | Established cap | Provisional cap | Use case |
|---|---:|---:|---:|---:|---:|---|
| Conservative | 20 | 32 | none | 32 | 48 | Low-risk closed beta. |
| Baseline | 24 | 36 | none or 1.5x equivalent | 40 | 60 | Recommended V1 candidate. |
| Fast | 28 | 48 | none or 1.75x equivalent | 48 | 72 | If new users converge too slowly. |
| High volatility test | 32 | 56 | 2.0x | 60 | 90 | Stress test only, not recommended default. |

Recommendation:

- Prefer explicit `provisionalK` over multiplying the whole delta if implementation simplicity allows.
- If using multiplier, apply multiplier only to the provisional player's own delta, not to opponents' deltas.
- Decrement `provisional_matches_remaining` only after successfully applied rated match events.

#### Suggested V1 beta default

```json
{
  "ratingScale": 400,
  "establishedK": 24,
  "provisionalK": 36,
  "provisionalMatches": 10,
  "establishedDeltaCap": 40,
  "provisionalDeltaCap": 60,
  "ratingFloor": 100
}
```

### 7. Release gates for enabling ranked beta

#### Internal alpha gate

Ranked remains disabled unless:

- [ ] Pure rating formula unit tests pass for 1v1, 3-player, 4-player, ties, provisional, caps, and upsets.
- [ ] Rating finalization is idempotent.
- [ ] Duplicate job retry does not duplicate rating events.
- [ ] Voided match creates reversal events or suppresses unapplied rating.
- [ ] Match report shows rating before/after/delta from stored server records.
- [ ] Leaderboard uses rating events/source of truth, not client-provided values.

#### Closed ranked beta gate

Ranked 1v1 beta can be enabled only if:

- [ ] Simulation report for 1v1 baseline config passes inflation/deflation checks.
- [ ] Provisional players converge within acceptable match count in simulation.
- [ ] Delta caps prevent extreme single-match swings.
- [ ] Abandon/forfeit policy is approved by Athena/Ashar.
- [ ] Admin can void a rated match and reverse rating impact.
- [ ] Observability exists for rating job failures, duplicate prevention, rating anomaly counts, and leaderboard reconciliation.
- [ ] Jasmine QA release gates for rated match, voided match, and duplicate finalization pass.

#### Multiplayer ranked expansion gate

2–4 player ranked should stay feature-flagged until:

- [ ] 3-player and 4-player simulations pass balance checks.
- [ ] Matchmaking can produce reasonably fair 3–4 player groups.
- [ ] Placement/rating explanations are understandable in match report.
- [ ] Telemetry shows no severe rating inflation or exploit pattern in 1v1 beta.
- [ ] Jasmine verifies multiplayer ties, abandons, and simultaneous finalization cases.

#### Public ranked release gate

Public ranked should not launch until:

- [ ] Closed beta telemetry validates parameter choice.
- [ ] Rating reset policy for beta is communicated.
- [ ] Leaderboards can be reset/recomputed if needed.
- [ ] Anti-cheat suspicious match flags can delay/void ranked impact.
- [ ] Support/admin runbook exists for rating disputes and voids.

### 8. Data needed from live beta telemetry

Collect server-side, necessary gameplay/ranked telemetry:

#### Rating telemetry

- Rating before/after/delta per player.
- Provisional status before/after.
- Provisional matches remaining before/after.
- K value/config version used.
- Delta cap applied or not.
- Match player count.
- Placement/tie group.
- Rating event IDs and idempotency keys.
- Rating job duration and retry count.
- Reversal/void event counts.

#### Match quality telemetry

- Matchmaking wait time.
- Rating spread at match start.
- Expected win probability per player.
- Actual placement.
- Upset frequency.
- Abandon/forfeit frequency.
- Disconnect/reconnect during rated match.
- Match duration.
- Rounds completed.

#### Balance/anomaly telemetry

- Rating distribution by day.
- Mean/median rating drift.
- Top percentile rating growth.
- New user provisional convergence.
- Repeated opponent farming patterns.
- First-guess/hard-word suspicious performance correlation with rating gains.
- Leaderboard churn.

### 9. Inflation/deflation checks

The simulator should fail or warn when:

- Mean rating drifts materially from baseline without intentional injection.
- Top 1% rating grows too quickly under stable synthetic skill.
- Low-rated players collapse to floor too often.
- Provisional players overshoot true skill and stay inflated after provisional period.
- Established players are over-penalized for losing to provisional players.
- Multiplayer matches produce larger average absolute deltas than intended.
- Abandon penalties become an exploit or over-punish network instability.

Suggested warning thresholds for first simulation pass:

| Check | Warning threshold |
|---|---:|
| Mean rating drift | `> ±5` after 100k simulated matches |
| Average absolute 1v1 delta | `< 6` or `> 24` |
| Average absolute 4p delta | `> 1.5x` 1v1 average unless intentional |
| Provisional median convergence | `> 15` matches |
| Single-match cap hit rate | `> 5%` established matches |
| Rating floor hit rate | `> 2%` active users |

### 10. Abandon/forfeit simulation policy

Simulate at least three abandon policies:

#### Policy A — Last-place after meaningful play

```text
If player abandons after meaningful play threshold:
  abandoning player is placed last
  remaining players keep normal relative placements
```

Recommended default if meaningful play threshold is approved.

#### Policy B — Fixed penalty plus no opponent windfall

```text
Abandoning player receives fixed negative delta
Other players receive normal or reduced positive deltas
```

Useful if abandon abuse gives opponents too much rating.

#### Policy C — Void early/no meaningful play

```text
If abandon occurs before meaningful play threshold:
  match cancelled/voided
  no rating apply events
```

Required to avoid punishing users for pre-game failures or server/network faults.

Open decision: exact meaningful play threshold is still needed.

### 11. Backend contract implications

Rating simulation and implementation should include a config version stored with every rating event:

```json
{
  "algorithm": "placement_mmr_v1",
  "algorithmConfigVersion": "baseline_v1_2026_06",
  "ratingScale": 400,
  "kApplied": 24,
  "deltaCapApplied": false,
  "provisionalApplied": false
}
```

Recommended additional metadata on `rating_events.metadata`:

- `expectedScores`
- `actualScores`
- `opponentRatings`
- `playerCount`
- `placementGroup`
- `rawDelta`
- `cappedDelta`
- `capReason`
- `provisionalMatchesRemainingBefore`
- `provisionalMatchesRemainingAfter`
- `algorithmConfigVersion`

This supports auditability, dispute review, and simulation-vs-production comparison.

## Open Questions

1. What exact threshold defines “meaningful play” for rated abandon penalties?
2. Should ranked beta start as strictly 1v1, or should internal testers also exercise 3–4 player ranked behind a feature flag?
3. Should provisional acceleration use separate `provisionalK` or a multiplier on raw delta? This plan prefers separate `provisionalK` for clarity.
4. Should beta ratings reset before public launch? Recommended: yes, unless Athena decides closed beta ratings are durable.
5. What is the acceptable closed-beta target for rating distribution stability before public ranked release?
6. Should suspicious matches delay rating publication synchronously, or apply rating then allow admin reversal? Recommended: delay only for high-confidence severe flags; otherwise apply and support reversal.

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Athena
- **Why that agent is needed:** Athena owns policy decisions and ranked rollout sequencing.
- **Exact task:** Decide ranked beta player count, meaningful-play abandon threshold, beta rating reset policy, and whether multiplayer ranked remains feature-flagged after 1v1 beta.
- **Inputs/context they need:** This response, Freya Ticket 04 rating spec, Jasmine Ticket 08 release gates, Elisa Ticket 10 rating amendments.
- **Expected output back to Athena:** Locked ranked beta policy and approved simulation parameter set.

### Follow-up ticket 2

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns tooling/simulation scripts.
- **Exact task:** Implement `packages/rating-tools` with scenario runner, synthetic player simulation, parameter comparison, and JSON/Markdown reports.
- **Inputs/context they need:** Formula/parameter/scenario sections in this response.
- **Expected output back to Athena:** Files changed, commands run, sample simulation reports, and recommended parameter set based on actual script output.

### Follow-up ticket 3

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend rating implementation.
- **Exact task:** Implement server-side `placement_mmr_v1` rating engine with config version metadata, idempotent apply events, provisional state updates, delta caps, and reversal support.
- **Inputs/context they need:** This response, Ticket 04 rating formula, Ticket 10 rating schema amendments.
- **Expected output back to Athena:** Backend rating implementation summary, unit/integration tests, and evidence that duplicate finalization does not duplicate rating events.

### Follow-up ticket 4

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA/release confidence.
- **Exact task:** Convert this simulation plan into QA acceptance cases for 1v1, multiplayer placements, ties, provisional users, delta caps, abandon policy, idempotency, void reversal, and leaderboard correction.
- **Inputs/context they need:** Sample scenarios and release gates in this response.
- **Expected output back to Athena:** Rating QA matrix with release-blocking checks.

### Follow-up ticket 5

- **Target agent:** Yuna
- **Why that agent is needed:** Yuna owns runtime reliability and observability.
- **Exact task:** Define monitoring/alerts for rating job failures, duplicate rating prevention, reversal events, leaderboard reconciliation drift, rating distribution anomalies, and ranked feature flags.
- **Inputs/context they need:** Live beta telemetry and release-gate sections in this response.
- **Expected output back to Athena:** Observability checklist and operational runbook for ranked beta.

### Follow-up ticket 6

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns product-facing UI.
- **Exact task:** Ensure match reports and ranked UI explain rating deltas, provisional status, beta/reset warning, and voided/reversed match states without implying client-side authority.
- **Inputs/context they need:** Rating output fields and beta policy decisions.
- **Expected output back to Athena:** UI plan for rating delta display and ranked beta messaging.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-15-ruby-rating-mmr-simulation-plan-response.md`

## Tests / Commands Run

- Ran an inline Python calculation script via Hermes `execute_code` to compute the sample rating deltas in this response.
- Result:

```text
1v1 equal A beats B {'A': 12, 'B': -12} cap40 {'A': 12, 'B': -12}
1v1 upset B1500 beats A1700 {'A': -18, 'B': 18} cap40 {'A': -18, 'B': 18}
4p equal A>B>C>D {'A': 12, 'B': 4, 'C': -4, 'D': -12} cap40 {'A': 12, 'B': 4, 'C': -4, 'D': -12}
4p upset B>A>C>D {'A': -3, 'B': 12, 'C': -4, 'D': -5} cap40 {'A': -3, 'B': 12, 'C': -4, 'D': -5}
4p tie A>(B=C)>D {'A': 12, 'B': 0, 'C': 0, 'D': -12} cap40 {'A': 12, 'B': 0, 'C': 0, 'D': -12}
provisional 1v1 equal A provisional beats B {'A': 18, 'B': -12}
```

No project tests were run — planning/spec task only.

## Evidence / Result

Created the required Markdown response file:

`/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-15-ruby-rating-mmr-simulation-plan-response.md`

The response covers the ticket acceptance criteria:

1. Proposed MMR formula parameters to simulate.
2. Simulation scenarios and sample expected outputs.
3. Proposed script paths/CLI commands for later implementation.
4. Recommended provisional multiplier, K values, and delta caps to test.
5. Release gates for enabling ranked beta.
6. Data needed from live beta telemetry.
7. Risks and follow-up implementation tickets.

## Risks / Blockers

- **Policy blocker:** Meaningful-play threshold for rated abandon penalties is not yet locked.
- **Balance risk:** Placement-MMR is architecturally accepted but must be simulation-tested before public ranked launch.
- **Multiplayer risk:** 3–4 player ranked can create matchmaking and perception issues; keep feature-flagged until simulations and beta telemetry pass gates.
- **Idempotency risk:** Duplicate rating jobs or match finalization retries can corrupt ratings unless unique rating events and idempotency keys are enforced.
- **Void/reversal risk:** Admin voids must create auditable reversal events; silent mutation/deletion of rating history would undermine trust.
- **Telemetry dependency:** Ranked beta tuning requires live telemetry for rating drift, upset frequency, provisional convergence, abandons, and leaderboard churn.
