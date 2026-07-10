# @wordle-royale/rating-tools

MMR scenario and simulation tooling for Wordle Royale ranked balance work.

## Commands

From the repo root:

```bash
pnpm --filter @wordle-royale/rating-tools test
pnpm --filter @wordle-royale/rating-tools typecheck
pnpm rating:simulate
```

`pnpm rating:simulate` writes deterministic reports to:

- `packages/rating-tools/data/reports/rating-parameter-comparison.json`
- `packages/rating-tools/data/reports/rating-parameter-comparison.md`

## Scope

This package simulates candidate placement-MMR parameters only. It does not enable production ranked, finalize abandon policy, or write any production data.

Current candidate parameter sets:

- `conservative_beta`
- `baseline_v1`
- `fast_convergence`

Current scenario coverage includes 1v1 equal ratings, 1v1 upsets, provisional wins, inactive/high-RD players, 3-player placements, 4-player placements, 4-player upsets, ties, and abandon/void policy placeholders.

## Ticket 111 recommendation snapshot

The simulator now compares three Elo-compatible pairwise parameter sets against a Glicko-style internal candidate:

- `conservative_beta` — lower volatility; recommended for Classic and initially feature-flagged Multiplayer/Lobby.
- `baseline_v1` — safe Elo-compatible fallback if implementation needs to ship before RD storage is ready.
- `fast_convergence` — stress candidate only; useful to see bounds, not recommended for MVP default.
- `baseline_glicko` — recommended internal model for Standard and Speed/Blitz if Ticket 112 can store rating deviation/confidence fields.

Recommended MVP defaults:

- Starting rating: `1500` for every ranked mode.
- Provisional duration: `10` games per mode.
- Elo fallback: established K `24`, provisional K `36`, established cap `40`, provisional cap `60`.
- Glicko-style internal: initial RD `350`, established RD target `80`, min RD `50`, max RD `350`, inactivity inflation `+25 RD / 30 days`, established cap `40`, provisional cap `64`.
- Multiplayer/lobby ranked: pairwise placement conversion averaged by opponent count; keep separate from 1v1 ladders and feature-flag until collusion/abandon policy is locked.
