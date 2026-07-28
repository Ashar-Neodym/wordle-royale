# Ticket 232 — Ruby Standard catalog harness contract fix

## Result: PASS

Fixed the local hosted Speed smoke harness contract mismatch without network, hosted, provider, environment, or GitHub access.

## Changes

- Updated Standard catalog preflight validation to require the selected `standard_1v1` entry and `enabled === true` only.
- Removed the invalid Standard `queueEnabled` requirement; Standard fixtures now realistically omit that Speed-only field.
- Kept Speed gating strict with `enabled === true` and `queueEnabled === true`.
- Added permanent deterministic regression coverage proving:
  - healthy Standard without `queueEnabled` passes;
  - disabled Standard fails with `standard_catalog_unavailable` before any session/stateful request;
  - missing Standard fails with `standard_catalog_unavailable` before any session/stateful request;
  - Speed with false or missing `queueEnabled` fails with `speed_catalog_mismatch`.

## Files modified for this fix

- `/tmp/wordle-ticket181-rerun-1d8ef/scripts/hosted-speed-smoke-core.mjs`
- `/tmp/wordle-ticket181-rerun-1d8ef/scripts/hosted-speed-smoke.test.mjs`

## Verification

- Harness syntax: PASS (`node --check` on core, CLI, and test modules)
- Full hosted harness tests: PASS — 31 tests, 31 passed, 0 failed
- Workspace tests: PASS (`pnpm test`)
- Lint: PASS (`pnpm lint`)
- Typecheck: PASS (`pnpm typecheck`)
- Security scan: PASS — 301 source/config files scanned (`pnpm secret-scan`)
- Diff hygiene: PASS (`git diff --check`)

## Worktree note

The supplied worktree already/currently represents the hosted harness as untracked files and `package.json` as modified (`M package.json`, untracked `hosted-speed-smoke-core.mjs`, `hosted-speed-smoke.mjs`, and `hosted-speed-smoke.test.mjs`). I changed only the core and test harness files listed above. No network calls, hosted smoke execution, commit, push, or PR were performed.
