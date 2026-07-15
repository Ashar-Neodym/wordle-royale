# Ticket 151 — Wave S Reliability Checkpoint PR and CI Response

Task: Wave S Reliability Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: In progress — Ticket 156 PASS and local gates confirmed; branch/PR/remote checks pending

## What I understood

Checkpoint the independently verified Wave S hosted-read reliability, truthful failure/retry UX, profile identity correction, and favicon/metadata polish. Include the still-uncommitted Ticket 128/129 hosted evidence and Wave S Tickets 148–156 implementation/evidence, while excluding credentials, local environment files, generated output, caches, logs, and dumps. Push `wave-s/hosted-read-reliability-polish`, open a PR to `main`, monitor the latest PR head through terminal GitHub/Vercel checks, and stop before merge or production deployment.

## QA prerequisite

Ticket 150 originally returned **FAIL** for two blockers:

1. same-document retry links did not rerun server reads; and
2. partial failures could present the unrelated hard-coded `alice` profile as the current user.

Tickets 154–155 corrected both issues. Ticket 156 independently returned **PASS** and explicitly authorized Ticket 151 to proceed within checkpoint/PR/CI scope.

Ticket 156 verified:

- real retry buttons rerender/refetch and preserve the exact `/play?matchId=...` URL;
- exhausted state transitions to connected after a user retry;
- no generic `/profiles/alice/rating` request or unrelated fixture identity appears;
- the real delayed-read regression waits approximately 1.5 seconds;
- first-failure/second-success recovery remains bounded;
- mutations remain single-attempt;
- matchmaking 90/95/100/110-second deadlines remain unchanged;
- metadata/favicon/build/browser/security gates pass.

## Intended checkpoint scope

- Ticket 128 resumed hosted two-session Wave R smoke evidence.
- Ticket 129 final hosted Wave R QA evidence.
- Tickets 148–150 Wave S implementation and initial QA evidence.
- Tickets 151–153 checkpoint/hosted-smoke/final-QA assignments.
- Tickets 154–156 release-blocker fixes and final focused QA evidence.
- Wave S web read policy, fallback presentation, retry control, metadata/favicon, route/component updates, and focused tests.
- `agent-communication/index.md` ticket-state updates.
- This Ticket 151 response.

## Local gate evidence

All commands were run from repository root on current `main` before creating the checkpoint branch.

```text
CI=true pnpm install --frozen-lockfile                       exit 0
CI=true pnpm lint                                            exit 0
CI=true pnpm typecheck                                       exit 0
CI=true pnpm test                                            exit 0
CI=true pnpm --filter @wordle-royale/api test                exit 0
CI=true pnpm --filter @wordle-royale/contracts test          exit 0
CI=true pnpm --filter @wordle-royale/rating-tools test       exit 0
CI=true pnpm build                                           exit 0
CI=true pnpm smoke:api:prod-start                            exit 0
CI=true pnpm smoke:local                                     exit 0
CI=true pnpm deps:check                                      exit 0
CI=true pnpm secret-scan                                     exit 0
git diff --check                                             exit 0
CI=true pnpm deps:down                                       exit 0
```

Observed test/build evidence:

```text
workspace validation = 9 packages
API tests = 119 passed, 0 failed
contracts tests = 19 passed, 0 failed
rating-tools tests = 14 passed, 0 failed
web production build = compiled successfully
mobile/API builds = completed
API production-start smoke = /readyz status=ok
secret scan = 228 source/config files scanned
local dependencies = removed after smoke
```

The ordinary API test run reports three opt-in PostgreSQL suites as skipped by their explicit environment gates. Ticket 147 and the prior Ticket 140 checkpoint already independently covered the Wave R PostgreSQL matchmaking/bootstrap harnesses; Ticket 151 changes only web reliability/presentation assets and does not alter those backend paths.

## Artifact and secret boundary

Ignored/generated paths observed after local gates and excluded from checkpoint staging:

```text
.env.preview.local
apps/api/dist/
apps/mobile/.expo/
apps/web/.next/
apps/web/tsconfig.tsbuildinfo
```

The ignored `.env.preview.local` was not read, printed, staged, or committed.

Additional blocked path classes:

- `.env` and `.env.local`;
- `node_modules/`;
- generated `dist/`, `build/`, `.next/`, `.expo/`;
- `.turbo/`, coverage, caches, TypeScript build info;
- logs and database dumps.

No cookie, token, connection string, provider credential, or environment secret is recorded in this response.

## Git / PR / CI evidence

Pending branch creation, staged-path safety inspection, commit, push, PR creation, and latest-head terminal check monitoring.

## Safety boundary

This ticket does not authorize and did not perform:

- merge into `main`;
- direct push to `main`;
- production Vercel/Railway deployment;
- hosted database, migration, dictionary, or provider mutation;
- provider environment/secret changes;
- paid-resource creation.

Automatic Vercel PR Preview checks are allowed as PR checks and must not be represented as production deployment.

## Rollback

Before merge, rollback is to close the PR and delete the checkpoint branch. Do not reset or force-push `main`. If a later approved merge requires rollback, use a reviewed revert PR and monitor main CI/provider redeploys.

## Follow-up tickets

### Follow-up 1

- Target agent: Ashar/Athena
- Why needed: merge authorization and release sequencing remain human/orchestrator decisions.
- Exact task: Review the final Ticket 151 PR head and terminal checks; explicitly approve or reject merge. Do not treat PR Preview success as production rollout approval.
- Inputs/context: PR URL, final branch SHA, Ticket 156 PASS, local and remote gate evidence from this response.
- Expected output back to Athena: explicit merge/no-merge decision and, if merged, authorization to begin Ticket 152 hosted smoke.

### Follow-up 2

- Target agent: Jasmine
- Why needed: independent hosted verification is required after an approved merge/deployment.
- Exact task: Keep Ticket 153 blocked until Ticket 152 captures hosted reliability smoke; then independently verify the deployed Wave S behavior.
- Inputs/context: Ticket 151 PR/CI evidence, Ticket 152 response, hosted URLs.
- Expected output back to Athena: final hosted Wave S PASS/WARN/FAIL and release recommendation.
