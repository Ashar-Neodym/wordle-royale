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

Current scenario coverage includes 1v1 equal ratings, 1v1 upsets, provisional wins, 3-player placements, 4-player placements, 4-player upsets, ties, and abandon/void policy placeholders.
