# Ticket 230 — Ruby Hosted Smoke Contract-Realism Repair Response

## Result: PASS

Closed the contract-realism blockers in the uncommitted harness at `/tmp/wordle-ticket181-rerun-1d8ef` using local deterministic tests only. No environment inspection, network/hosted/provider/GitHub access, confirmed harness execution, commit, push, or PR was performed.

## Changes

- Replaced the broad spoiler-key regex with an explicit answer-authority/secret denylist. Public `maxGuesses`, `acceptedGuesses`, `guess`, `guessNumber`, `guessesUsed`, and `acceptedGuessCount` are accepted and tested; nested `answerWordHash` is rejected.
- Made catalog validation require the committed full Speed `timeControl` identity: 75-second round, 90-second invitation, 20-second first-ack ready window, 3-second countdown, six guesses, 100 ms solve bucket, and server bucket tie-breaker.
- Made snapshot shape validation require committed public `timeControl`, `myState`, and `opponentProgress` fields.
- Replaced latency-flaky full-remaining-time equality checks with future/request+recovery budget validation. Stable timestamp pairs still verify first-ack-to-ready-deadline (20 seconds) and start-to-round-deadline (75 seconds); countdown remaining time is bounded rather than required to equal three seconds.
- Modeled the realistic first ready response as `waiting_opponent_ready` with null start/deadline, followed by second-ready/countdown and an authoritative post-both-ready snapshot.
- Merged both concurrent ready outcomes and exactly one bounded GET recovery. Ready mutations remain exactly two POSTs with no client mutation retry; timeout-after-commit recovery is covered.
- Split actor identity failures into independent duplicate cookie, duplicate handle, and duplicate user checks.
- Added independent RED coverage for ready-window duration mismatch, ready identity mismatch, start/deadline immutable identity mismatch, countdown remaining mismatch, catalog countdown/round mismatch, duplicate cookie/handle/user, split match identity, duplicate tickets/participants, and public-field/spoiler policy.

## Files modified/created

- `package.json`
- `scripts/hosted-speed-smoke-core.mjs`
- `scripts/hosted-speed-smoke.mjs`
- `scripts/hosted-speed-smoke.test.mjs`
- This response file

## Local evidence

- `pnpm test:smoke:speed:hosted` — PASS: **26 tests, 26 passed, 0 failed**.
  - Includes GREEN realistic first-ready waiting → second-ready/countdown lifecycle.
  - Includes timeout-after-commit merge with one GET recovery, two ready POSTs, and no mutation retry.
  - Includes all requested independent RED cases.
- `node --check scripts/hosted-speed-smoke-core.mjs scripts/hosted-speed-smoke.mjs scripts/hosted-speed-smoke.test.mjs` — PASS.
- `pnpm lint` — PASS (`validate:workspace`; 9 workspace packages).
- `pnpm test` — PASS (`validate:workspace`; 9 workspace packages).
- `pnpm typecheck` — PASS (`validate:workspace`; 9 workspace packages).
- `pnpm secret-scan` — PASS (301 source/config files scanned).
- `git diff --check` — PASS.

A direct `pnpm exec eslint ...` probe was not applicable because this repository has no ESLint v9 flat config; the repository-defined `pnpm lint` command passed. Working tree remains intentionally uncommitted.
