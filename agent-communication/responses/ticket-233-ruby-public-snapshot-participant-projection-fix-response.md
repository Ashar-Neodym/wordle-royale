# Ticket 233 — Ruby public snapshot participant projection fix

## Result

Fixed locally in `/tmp/wordle-ticket181-rerun-1d8ef`. No network, hosted environment, provider, or GitHub access was used. No lifecycle was executed, and no commit/push/PR was created.

## Changes

- Removed the harness assumption that the initial public Speed snapshot contains `initial.participants`.
- Kept distinct-actor/match proof on committed surfaces only:
  - two unique session identities, user IDs, and handles;
  - two distinct ticket IDs;
  - one shared fresh `matchedMatchId`;
  - reciprocal `matchedOpponent.userId` values matching the opposite session user.
- Updated the positive local fixture so all public Speed snapshots omit `participants`.
- Added local RED coverage proving duplicate, missing, and incorrect reciprocal `matchedOpponent` identities all fail with `distinct_match_participants_required` before either ready POST is dispatched.
- Updated the positive test to explicitly assert the fixture has no own `participants` property and still reaches both ready dispatches and a passing lifecycle.

## Contract inspection

Compared the fixture with committed `speedMatchSnapshotV2Schema` in `packages/contracts/src/gameplay/schemas.ts` (base fields at lines 114–145; V2 fields at lines 159–172). The schema has no `participants` field. After the fix, the initial fixture uses only committed V2 snapshot fields: match/round/mode/ruleset/state/timestamps/time control/readiness/viewer state/opponent progress. Result/history participant arrays remain because those are separate committed result/history contracts, not public Speed state snapshots.

Also confirmed `matchedOpponent.userId` is a committed matchmaking ticket field via `matchmakingOpponentSchema` and `matchmakingTicketBaseSchema` in `packages/contracts/src/matchmaking/schemas.ts`.

## Files modified

- `/tmp/wordle-ticket181-rerun-1d8ef/scripts/hosted-speed-smoke-core.mjs`
- `/tmp/wordle-ticket181-rerun-1d8ef/scripts/hosted-speed-smoke.test.mjs`

The existing Ticket 181 worktree also still contains its previously added `package.json` scripts and `scripts/hosted-speed-smoke.mjs`; this ticket did not perform a commit.

## Verification

All local checks passed:

- Syntax: `node --check` on all three hosted smoke `.mjs` files.
- Harness: `pnpm test:smoke:speed:hosted` — **33 tests passed, 0 failed**.
- Lint: `pnpm lint` — workspace validation passed (9 packages).
- Typecheck: `pnpm typecheck` — workspace validation passed (9 packages).
- Test: `pnpm test` — workspace validation passed (9 packages).
- Security: `pnpm secret-scan` — **passed, 301 source/config files scanned**.
- Diff hygiene: `git diff --check` — passed.
- Inspected untracked-file diffs with `git diff --no-index` (200 total diff lines across core and test) because the Ticket 181 harness files remain untracked in this detached worktree.

## Issues

None encountered. No hosted or network calls were made.
