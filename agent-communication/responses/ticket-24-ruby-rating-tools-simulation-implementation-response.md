# Ticket 24 — Rating Tools Simulation Implementation — Response

## Summary

Implemented the `packages/rating-tools` placement-MMR simulation runner and generated deterministic JSON/Markdown comparison reports.

Delivered:

- Pairwise placement-MMR formula with averaged opponent deltas.
- Three candidate parameter sets: `conservative_beta`, `baseline_v1`, and `fast_convergence`.
- Required scenarios for 1v1, 3-player, 4-player, provisional players, upsets, ties, and abandon/void policy placeholders.
- JSON and Markdown report generation.
- Deterministic sample report artifacts committed under `packages/rating-tools/data/reports/`.
- Unit tests for formula outputs, scenario/report coverage, determinism, and CLI output-path handling.

No ranked rollout, production policy lock, database migration, production infra, paid resource, or secret was added.

## Decisions/Recommendations

1. **Recommend `baseline_v1` for first 1v1 ranked beta simulation candidate.**
   - The generated report recommends starting ranked beta with `baseline_v1` for 1v1 only.
   - 3–4 player ranked should remain feature-flagged until QA and telemetry pass.

2. **Keep abandon/void handling explicitly placeholder-only.**
   - The simulator includes candidate treatments and open decisions, but does not pretend the meaningful-play threshold or final abandon policy is locked.

3. **Use separate `provisionalK` instead of a blanket multiplier.**
   - This keeps provisional acceleration applied to the provisional player's own delta without over-penalizing established opponents.

4. **Generate deterministic reports with fixed timestamp.**
   - Report timestamp is fixed at `2026-06-22T00:00:00.000Z` so sample artifacts are stable and diff-friendly.

5. **Harden CLI output paths.**
   - Added `resolveOutputDir` so both package-local `data/reports` and root-style `packages/rating-tools/data/reports` output paths resolve to the intended package report directory.
   - Removed an accidentally nested `packages/rating-tools/packages/` output directory after approval.

## Detailed Output

### Implemented formula

The simulation uses Ticket 15's pairwise placement-MMR approach:

```text
expected_i_vs_j = 1 / (1 + 10 ^ ((rating_j - rating_i) / ratingScale))
actual_i_vs_j = 1.0 if i placed above j, 0.5 if tied, 0.0 if below
raw_delta_i = K_i * average(actual_i_vs_j - expected_i_vs_j)
delta_i = clamp(round(raw_delta_i), -cap_i, +cap_i)
new_rating_i = max(ratingFloor, old_rating_i + delta_i)
```

`K_i` and cap are selected per player based on whether `matchesPlayed < provisionalMatches`.

### Parameter sets compared

```text
conservative_beta: establishedK=20, provisionalK=32, establishedCap=32, provisionalCap=48
baseline_v1: establishedK=24, provisionalK=36, establishedCap=40, provisionalCap=60
fast_convergence: establishedK=28, provisionalK=48, establishedCap=48, provisionalCap=72
```

### Scenarios included

```text
1v1_equal_ratings
1v1_upset
1v1_provisional_win
3p_mixed_skill
4p_equal_placements
4p_upset
4p_middle_tie
abandon_last_after_meaningful_play_placeholder
```

Policy placeholders included in generated reports:

```text
last_place_after_meaningful_play
fixed_penalty_no_opponent_windfall
void_early_no_meaningful_play
```

### Generated report files

```text
packages/rating-tools/data/reports/rating-parameter-comparison.json
packages/rating-tools/data/reports/rating-parameter-comparison.md
```

Report generation output:

```text
Generated rating comparison reports for 3 parameter sets and 8 scenarios.
JSON: /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/reports/rating-parameter-comparison.json
Markdown: /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/reports/rating-parameter-comparison.md
```

### Sample Markdown report evidence

The Markdown report includes the required parameter comparison table:

```text
| Config | Established K | Provisional K | Established cap | Provisional cap | Use |
| --- | ---: | ---: | ---: | ---: | --- |
| conservative_beta | 20 | 32 | 32 | 48 | Conservative beta |
| baseline_v1 | 24 | 36 | 40 | 60 | Baseline V1 candidate |
| fast_convergence | 28 | 48 | 48 | 72 | Fast convergence stress candidate |
```

And includes abandon/void policy placeholders:

```text
These policies are intentionally marked not locked; the simulator includes placeholders without pretending final ranked abandon policy is approved.
```

### Deterministic checksum evidence

Two consecutive `pnpm rating:simulate` runs produced identical checksums:

```text
0b146bf664b021ae725a6c1515cb1af3ee2804a1488978e10f94e3535836d6d1  packages/rating-tools/data/reports/rating-parameter-comparison.json
8bed23d16f9591cce9c42ede6e352eec950489ff9d6d9a9496d65a619ccc30e2  packages/rating-tools/data/reports/rating-parameter-comparison.md
```

## Open Questions

1. What exact threshold defines “meaningful play” for rated abandon penalties?
2. Should closed ranked beta be strictly 1v1, or should internal testers exercise 3–4 player ranked behind a feature flag?
3. What acceptable drift/convergence thresholds should Jasmine use for beta release gates once synthetic bulk simulation/live telemetry exists?
4. Should rating config versions be stored as `baseline_v1` initially or include a date suffix such as `baseline_v1_2026_06`?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Athena
- **Why that agent is needed:** Athena owns product/ranked policy locks.
- **Exact task:** Decide meaningful-play threshold, closed beta player-count scope, beta reset policy, and whether `baseline_v1` is approved as the first backend implementation candidate.
- **Inputs/context they need:** Generated JSON/Markdown reports and Ticket 15 plan.
- **Expected output back to Athena:** Locked ranked beta policy and approved initial config version.

### Follow-up ticket 2

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend rating implementation.
- **Exact task:** Implement server-side `placement_mmr_v1` rating engine using this simulator's formula/config metadata, with idempotent apply events and void/reversal support.
- **Inputs/context they need:** `packages/rating-tools/src/rating-formula.ts`, generated reports, Tickets 04/10/15.
- **Expected output back to Athena:** Backend implementation evidence, unit/integration tests, and idempotency/void verification.

### Follow-up ticket 3

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA/release confidence.
- **Exact task:** Build QA acceptance cases from simulator scenarios for 1v1, 3–4 player placements, ties, provisional users, upsets, caps, abandon placeholders, and void behavior.
- **Inputs/context they need:** `packages/rating-tools/data/reports/rating-parameter-comparison.*` and simulator tests.
- **Expected output back to Athena:** Rating QA matrix with pass/fail release gates.

### Follow-up ticket 4

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns backend/data tooling.
- **Exact task:** Add seeded bulk synthetic simulations once basic formula scenarios are accepted, including rating distribution drift, cap hit rates, and provisional convergence metrics across thousands of matches.
- **Inputs/context they need:** Current `packages/rating-tools` implementation and Athena's thresholds.
- **Expected output back to Athena:** Bulk simulation command, deterministic seed, report metrics, and recommended tuning changes.

## Files Changed

- `package.json`
- `pnpm-lock.yaml`
- `packages/rating-tools/package.json`
- `packages/rating-tools/tsconfig.json`
- `packages/rating-tools/README.md`
- `packages/rating-tools/src/types.ts`
- `packages/rating-tools/src/configs.ts`
- `packages/rating-tools/src/rating-formula.ts`
- `packages/rating-tools/src/rating-formula.test.ts`
- `packages/rating-tools/src/scenarios.ts`
- `packages/rating-tools/src/simulation-runner.ts`
- `packages/rating-tools/src/simulation-runner.test.ts`
- `packages/rating-tools/src/reports.ts`
- `packages/rating-tools/src/reports.test.ts`
- `packages/rating-tools/src/cli.ts`
- `packages/rating-tools/src/cli.test.ts`
- `packages/rating-tools/src/index.ts`
- `packages/rating-tools/data/reports/rating-parameter-comparison.json`
- `packages/rating-tools/data/reports/rating-parameter-comparison.md`
- `agent-communication/responses/ticket-24-ruby-rating-tools-simulation-implementation-response.md`

Removed after approval because it was accidental generated output from a root-style path run inside package cwd:

- `packages/rating-tools/packages/`

Generated locally by pnpm but not listed as source files:

- `node_modules/`
- `packages/*/node_modules/` workspace dependency links

## Tests/Commands Run

### RED test command

```bash
pnpm --filter @wordle-royale/rating-tools test
```

Exit code: `1`

Expected RED failure evidence after adding the CLI output-path regression test:

```text
SyntaxError: The requested module './cli.ts' does not provide an export named 'resolveOutputDir'
✖ src/cli.test.ts
ℹ tests 10
ℹ pass 9
ℹ fail 1
```

### Rating-tools tests and typecheck

```bash
pnpm --filter @wordle-royale/rating-tools test && pnpm --filter @wordle-royale/rating-tools typecheck
```

Exit code: `0`

Output:

```text
✔ parseArgs defaults to package-local report directory
✔ resolveOutputDir treats root-style packages/rating-tools paths as repo-relative
✔ 1v1 equal ratings produces baseline +/-12 deltas
✔ 1v1 upset moves more than expected equal-rating win
✔ 4-player equal placement averages pairwise deltas to stay comparable with 1v1
✔ provisional player receives accelerated own delta without over-penalizing opponent
✔ delta caps and floor are applied per player
✔ markdown report includes parameter comparison and abandon placeholders
✔ report writer creates JSON and Markdown artifacts
✔ comparison reports at least three parameter sets across required scenarios
✔ comparison is deterministic for report generation
ℹ tests 11
ℹ pass 11
ℹ fail 0
$ tsc --noEmit -p tsconfig.json
```

### Simulation command and determinism check

```bash
rm -rf packages/rating-tools/packages && pnpm rating:simulate && sha256sum packages/rating-tools/data/reports/rating-parameter-comparison.json packages/rating-tools/data/reports/rating-parameter-comparison.md && pnpm rating:simulate >/tmp/rating-sim-2.log && sha256sum packages/rating-tools/data/reports/rating-parameter-comparison.json packages/rating-tools/data/reports/rating-parameter-comparison.md && cat /tmp/rating-sim-2.log
```

Exit code: `0`

Output included:

```text
Generated rating comparison reports for 3 parameter sets and 8 scenarios.
JSON: /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/reports/rating-parameter-comparison.json
Markdown: /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/reports/rating-parameter-comparison.md
0b146bf664b021ae725a6c1515cb1af3ee2804a1488978e10f94e3535836d6d1  packages/rating-tools/data/reports/rating-parameter-comparison.json
8bed23d16f9591cce9c42ede6e352eec950489ff9d6d9a9496d65a619ccc30e2  packages/rating-tools/data/reports/rating-parameter-comparison.md
```

### Root-style output path regression check

```bash
pnpm --filter @wordle-royale/rating-tools rating:simulate -- --output-dir packages/rating-tools/data/reports && test ! -d packages/rating-tools/packages && sha256sum packages/rating-tools/data/reports/rating-parameter-comparison.json packages/rating-tools/data/reports/rating-parameter-comparison.md
```

Exit code: `0`

Output:

```text
Generated rating comparison reports for 3 parameter sets and 8 scenarios.
JSON: /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/reports/rating-parameter-comparison.json
Markdown: /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/reports/rating-parameter-comparison.md
0b146bf664b021ae725a6c1515cb1af3ee2804a1488978e10f94e3535836d6d1  packages/rating-tools/data/reports/rating-parameter-comparison.json
8bed23d16f9591cce9c42ede6e352eec950489ff9d6d9a9496d65a619ccc30e2  packages/rating-tools/data/reports/rating-parameter-comparison.md
```

### Root scaffold validation and workspace discovery

```bash
pnpm typecheck && pnpm -r list --depth -1
```

Exit code: `0`

Output included:

```text
Workspace scaffold validation passed (9 workspace packages).
@wordle-royale/rating-tools@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools (PRIVATE)
```

### Cleanup/safety validation

```text
Hermes execute_code validation
```

Exit status: success

Output:

```text
nested rating-tools packages exists False
report files ['.gitkeep', 'rating-parameter-comparison.json', 'rating-parameter-comparison.md']
env files ['.env.local.example', '.env.example']
```

## Evidence/Result

Acceptance criteria status:

1. **Simulation command runs locally:** Passed. `pnpm rating:simulate` exits `0`.
2. **Reports compare at least 3 parameter sets:** Passed. Reports compare `conservative_beta`, `baseline_v1`, and `fast_convergence`.
3. **Includes provisional player and upset scenarios:** Passed. Includes `1v1_provisional_win`, `1v1_upset`, and `4p_upset`.
4. **Includes abandon/void policy placeholders without pretending final policy is locked:** Passed. Report has a dedicated `Abandon/Void Policy Placeholders` section and statuses are `not_locked`.
5. **Response lists files changed and commands run:** Included in this response.

## Risks/Blockers

- **Policy blocker:** Meaningful-play threshold for abandon penalties remains unlocked.
- **Ranked rollout blocker:** This is tooling only; no production ranked rollout should happen until backend idempotency, void/reversal handling, QA, and telemetry gates pass.
- **Simulation scope limitation:** Current reports are deterministic scenario comparisons, not large seeded population simulations. Bulk simulations should be added after Athena/Jasmine define acceptable drift/convergence thresholds.
- **Root typecheck limitation:** Root `pnpm typecheck` still runs scaffold validation only. Package-specific rating-tools `tsc --noEmit` passes.
- **Generated report timestamp is fixed intentionally:** Good for deterministic committed artifacts, but future live telemetry reports should include real run timestamps plus seed/config metadata.
