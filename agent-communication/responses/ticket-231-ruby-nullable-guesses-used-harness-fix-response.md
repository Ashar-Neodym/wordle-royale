# Ticket 231 — Ruby nullable `guessesUsed` harness fix

**PASS**

## Changes
- Updated `scripts/hosted-speed-smoke-core.mjs` so `snapshotShape` accepts the committed contract: `myState.guessesUsed` is either `null` or an integer from `1` through `timeControl.maxGuesses` (6). Values such as `0`, negatives, fractions, missing/undefined, and values above 6 remain rejected.
- Updated `scripts/hosted-speed-smoke.test.mjs` fixtures to use `null` for preterminal snapshots and a valid terminal value (`1`) for terminal snapshots.
- Added independent contract tests proving preterminal `null` is accepted and invalid `0` is rejected.
- Exported `snapshotShape` solely to test the validator directly without relying on lifecycle side effects.

## Verification (local only; no network/provider/hosted access)
- `node --test scripts/hosted-speed-smoke.test.mjs` — **28/28 passed**.
- `node --check` on the smoke core, test, and CLI modules — **passed**.
- `pnpm lint` — **passed** (`validate:workspace`, 9 packages).
- `pnpm typecheck` — **passed** (`validate:workspace`, 9 packages).
- `pnpm secret-scan` — **passed** (301 files scanned).
- `git diff --check` — **passed**.

## Files modified
- `/tmp/wordle-ticket181-rerun-1d8ef/scripts/hosted-speed-smoke-core.mjs`
- `/tmp/wordle-ticket181-rerun-1d8ef/scripts/hosted-speed-smoke.test.mjs`

## Notes
- No commit, push, PR, network call, hosted/provider call, or confirmed harness was used.
- The task worktree already had `package.json` modified and all three hosted-smoke scripts untracked; those pre-existing worktree conditions were preserved. No blocker encountered.
