# Ticket 111 — Rating Algorithm Simulation and Mode Ladders

Task: Prototype/simulate candidate rating formulas for chess-style Wordle ranked modes.

Agent: Ruby (backend/tools)

Status: Done

## Summary

Extended `packages/rating-tools` from a placement-MMR/Elo-only comparison into a reproducible rating simulation tool that compares:

- Elo-compatible pairwise placement candidates:
  - `conservative_beta`
  - `baseline_v1`
  - `fast_convergence`
- A Glicko-style internal candidate:
  - `baseline_glicko`

The generated report now models mode ladders for:

- `standard_1v1`
- `speed_1v1`
- `classic_1v1`
- `multiplayer_lobby`

The simulation covers 1v1 wins/losses/draws, upsets, provisional players, inactive players, and multiplayer pairwise placement conversion with lobby-size averaging.

## Decisions / Recommendations

### Recommended MVP parameters

- Starting rating: `1500` per ranked mode.
- Provisional duration: `10` games per mode.
- Recommended internal target: `baseline_glicko` for `standard_1v1` and `speed_1v1`, if Ticket 112 can store rating deviation/confidence fields.
- Safe Elo fallback: `baseline_v1` if implementation must ship before Glicko-ready fields are stored.
- Classic ladder: use lower-volatility `conservative_beta` initially.
- Multiplayer/lobby ranked: use pairwise placement conversion averaged by opponent count, but keep feature-flagged until abuse/abandon policy is locked.

### Suggested defaults by model

#### Elo-compatible fallback (`baseline_v1`)

- Initial rating: `1500`
- Established K: `24`
- Provisional K: `36`
- Established delta cap: `40`
- Provisional delta cap: `60`
- Provisional games: `10`

#### Glicko-style internal (`baseline_glicko`)

- Initial rating: `1500`
- Initial RD: `350`
- Established RD target: `80`
- Minimum RD: `50`
- Maximum RD: `350`
- Inactivity inflation: `+25 RD / 30 inactive days`
- Established delta cap: `40`
- Provisional delta cap: `64`
- Provisional games: `10`

### Trade-offs

- Elo fallback is easier to reason about and matches current placement-MMR behavior, but it cannot naturally model uncertainty for new/inactive players.
- Glicko-style internals preserve a simple user-facing rating while giving better convergence and matchmaking confidence for provisional/inactive players.
- The current Glicko-style implementation is intentionally lightweight/prototype-grade: it models RD/confidence and inactivity but does not yet implement full Glicko-2 volatility iteration.
- Multiplayer pairwise conversion is easy to explain, but public ranked lobbies need anti-collusion controls before being trusted for serious rating movement.

## Detailed Output

Generated reports:

- `packages/rating-tools/data/reports/rating-parameter-comparison.json`
- `packages/rating-tools/data/reports/rating-parameter-comparison.md`

Reproducible command:

```bash
pnpm rating:simulate
```

Observed final output:

```text
Generated rating comparison reports for 4 parameter sets and 10 scenarios.
JSON: /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/reports/rating-parameter-comparison.json
Markdown: /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/reports/rating-parameter-comparison.md
```

Key report evidence:

- Equal-rating 1v1:
  - `baseline_v1`: `A:+12, B:-12`
  - `baseline_glicko`: `A:+12, B:-12`
- Upset 1v1:
  - `baseline_v1`: `A:-18, B:+18`
  - `baseline_glicko`: `A:-18, B:+18`
- Provisional win:
  - `baseline_v1`: `A:+18, B:-12`
  - `baseline_glicko`: `A:+21, B:-8`
- Inactive return win:
  - `baseline_v1`: `A:+12, B:-12`
  - `baseline_glicko`: `A:+17, B:-10`
- Draw with equal ratings:
  - All candidates: `A:+0, B:+0`
- 4-player equal placement with lobby-size averaging:
  - `baseline_v1`: `A:+12, B:+4, C:-4, D:-12`
  - `baseline_glicko`: `A:+12, B:+4, C:-4, D:-12`

## Open Questions

Product/fairness decisions still affect the final math:

1. Whether Speed/Blitz same-guess ties always use server-received solve time from day one.
2. Whether both-fail Speed/Blitz games are draws or use progress/time tiebreaks.
3. Exact abandon threshold for “meaningful play.”
4. Whether abandon grants full opponent gains, partial gains, fixed penalty only, or voids early.
5. Whether multiplayer ranked launches in MVP or remains prepared/disabled.
6. Anti-collusion policy for ranked public lobbies and repeat opponents.
7. Whether to implement full Glicko-2 volatility now or store volatility-ready fields and start with RD-only Glicko-style internals.

## Follow-up Tickets

- Ticket 112 should add per-mode rating profile fields for rating, games played, W/L/D/abandons, peak rating, last rated time, rating deviation/confidence, and volatility-ready storage.
- A future backend ticket should implement final mode-specific adjudication rules once Speed/Classic/fail/abandon policies are approved.
- A future QA ticket should stress-test collusion/repeat-opponent scenarios before enabling ranked multiplayer/lobby by default.

## Files Changed

- `packages/rating-tools/README.md`
- `packages/rating-tools/data/reports/rating-parameter-comparison.json`
- `packages/rating-tools/data/reports/rating-parameter-comparison.md`
- `packages/rating-tools/src/configs.ts`
- `packages/rating-tools/src/glicko-formula.ts`
- `packages/rating-tools/src/glicko-formula.test.ts`
- `packages/rating-tools/src/reports.test.ts`
- `packages/rating-tools/src/reports.ts`
- `packages/rating-tools/src/scenarios.ts`
- `packages/rating-tools/src/simulation-runner.test.ts`
- `packages/rating-tools/src/simulation-runner.ts`
- `packages/rating-tools/src/types.ts`
- `agent-communication/responses/ticket-111-ruby-rating-algorithm-simulation-and-mode-ladders-response.md`

## Tests / Commands Run

### RED phase

- `pnpm --filter @wordle-royale/rating-tools test` — exit `1`
  - Failed as expected before `glicko-formula.ts` and report-mode changes existed.

### Final verification

- `pnpm --filter @wordle-royale/rating-tools test` — exit `0`
  - `14/14` passed.
- `pnpm --filter @wordle-royale/rating-tools typecheck` — exit `0`
  - `tsc --noEmit -p tsconfig.json` passed.
- `pnpm rating:simulate` — exit `0`
  - Generated deterministic JSON and Markdown reports for `4` parameter sets and `10` scenarios.
- `pnpm --filter @wordle-royale/rating-tools build` — exit `0`
  - Package build/typecheck passed.
- `pnpm build` — exit `0`
  - Root workspace build passed for packages/apps, including web/mobile/API.
- `pnpm validate:workspace` — exit `0`
  - `Workspace scaffold validation passed (9 workspace packages).`
- `pnpm secret-scan` — exit `0`
  - `Secret scan passed (192 source/config files scanned).`
- `git diff --check -- packages/rating-tools` — exit `0`
  - No whitespace errors.

## Evidence / Result

The report at `packages/rating-tools/data/reports/rating-parameter-comparison.md` now includes:

- `baseline_glicko` parameter set.
- Mode ladder table for Standard, Speed/Blitz, Classic, and Multiplayer/Lobby.
- Glicko-style internal notes.
- Scenario comparison for 10 scenarios, including draw and inactive-player cases.
- Recommendation to use `baseline_glicko` internally where schema support exists, with `baseline_v1` as an Elo-compatible fallback.

## Risks / Blockers

- This is simulation/tooling only; no production rating schema or live rating finalization behavior was changed.
- The Glicko-style formula is prototype-grade and does not yet implement full Glicko-2 volatility iteration.
- Multiplayer/lobby ranked remains high-risk for collusion until abuse controls and abandon policy are locked.
- Generated report timestamp remains deterministic for reproducible artifacts rather than wall-clock current time.
