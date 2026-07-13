# Ticket 137 — Wave R Hosted-Fix Checkpoint PR and CI Response

Task: Wave R Hosted-Fix Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: Completed — checkpoint pushed, PR opened, GitHub Actions and Vercel checks passed; not merged or deployed to hosted API/data

## What I understood

Checkpoint only the intended Ticket 128 and 134–136 evidence plus the reviewed dictionary-only preview bootstrap/readiness implementation on `wave-r/preview-dictionary-bootstrap`. Run canonical local gates and a real-PostgreSQL disposable-schema integration, push the branch, open a PR to `main`, monitor GitHub and Vercel checks, and stop before merge/deployment/hosted-data mutation.

## QA prerequisite

Ticket 136 verdict: **PASS**.

Independent QA confirmed:

- migrations-only readiness fails safely when no approved dictionary exists;
- sequential and concurrent missing-dictionary joins return the stable 503 with zero writes;
- guarded bootstrap refusal and spoiler/credential-safe output;
- exact dictionary-only `20 answer / 40 guess / 3 banned / 63 total` apply;
- idempotent rerun;
- no fixture users/profiles/ratings/lobbies/matches created by bootstrap;
- readiness transition to `ok`;
- one shared non-self Standard match after bootstrap;
- production rejection of the preview fixture.

No hosted data-operation approval was granted by Ticket 136 or this checkpoint.

## Intended scope

Checkpoint included 30 intended source/config/test/docs/ticket/response paths.

Core implementation includes:

- guarded dictionary-only bootstrap CLI;
- exact deterministic fixture plan and tests;
- environment-aware dictionary selection service;
- Standard dictionary readiness dependency;
- pre-write and pair-time dictionary eligibility checks;
- disposable PostgreSQL integration harness;
- production-start smoke adjustment for queue-disabled startup validation.

Evidence includes Ticket 128, Tickets/responses 134–137, Athena's Ticket 128 review, Elisa's readiness contract, README operator guidance, and the communication index update.

## Local verification

Canonical gates:

```text
CI=true pnpm install --frozen-lockfile -> 0
CI=true pnpm lint -> 0
CI=true pnpm typecheck -> 0
CI=true pnpm test -> 0
CI=true pnpm --filter @wordle-royale/api test -> 0
CI=true pnpm --filter @wordle-royale/contracts test -> 0
CI=true pnpm --filter @wordle-royale/rating-tools test -> 0
CI=true pnpm --filter @wordle-royale/api db:validate -> 0
CI=true pnpm --filter @wordle-royale/api db:bootstrap:preview-dictionary -- --dry-run --json -> 0
CI=true pnpm build -> 0
CI=true pnpm smoke:api:prod-start -> 0
CI=true pnpm smoke:local -> 0
CI=true pnpm deps:check -> 0
CI=true pnpm secret-scan -> 0
git diff --check -> 0
CI=true pnpm deps:down -> 0
```

Test totals:

```text
API: 89 passed, 0 failed
contracts: 19 passed, 0 failed
rating-tools: 14 passed, 0 failed
secret scan: 214 source/config files scanned
```

Dry-run aggregate:

```text
releaseId = dict_en_5_test_vfixture_001
version = en-5-test-vfixture.001
status = draft
answer = 20
guess = 40
banned = 3
total = 63
fixtureOnly = true
productionApproved = false
result = planned
```

No dictionary words, database URL, cookies, provider secrets, or credentials were printed by the dry-run.

## Real-PostgreSQL integration

The first invocation without an explicit disposable database URL failed closed as designed before database access:

```text
Set PREVIEW_DICTIONARY_TEST_DATABASE_URL (or DATABASE_URL) to a disposable local PostgreSQL database.
exit 1
```

After starting local Compose dependencies, the integration was rerun with an explicit local test database URL supplied only to the process:

```text
unique disposable schema created
3 migrations applied
3 integration tests passed
0 failed/skipped
disposable schema dropped
exit 0
```

Verified:

1. unavailable readiness and zero-write first joins before bootstrap;
2. exact dictionary-only apply and idempotent rerun;
3. readiness transition to `ok`;
4. ineligible-release pairing rollback;
5. one exact-release shared non-self match after bootstrap.

Local PostgreSQL/Redis containers and Compose network were removed afterward.

## Git checkpoint

```text
branch = wave-r/preview-dictionary-bootstrap
checkpoint commit = 838370b7612719e77bf648fc5d8ab6443a09a00a
remote checkpoint read-back = 838370b7612719e77bf648fc5d8ab6443a09a00a
staged_count = 30
blocked_staged = []
```

Three handoff Markdown files received mechanical trailing-whitespace normalization before commit; no semantic content was altered.

## Pull request

```text
PR #7
https://github.com/Ashar-Neodym/wordle-royale/pull/7
base = main
head = wave-r/preview-dictionary-bootstrap
state = open
```

## Initial remote checks

All terminal-success:

```text
Workspace checks = pass (1m6s)
https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29240862091/job/86786315040

Vercel = pass
https://vercel.com/ashar-neodyms-projects/wordle-royale-web/6V6mCuDMRpKxBWLU1Qw188itXvzV

Vercel Preview Comments = pass
```

The Vercel result is a PR preview check only. No production Vercel deployment, Railway API deployment, Supabase mutation, or provider configuration change was requested or performed.

A final documentation-only evidence commit follows this checkpoint and retriggers checks; current terminal status should be read from PR #7 before merge consideration.

## Artifact and secret hygiene

Excluded and unstaged:

- `.env.preview.local`
- generated `dist/`, `.next/`, `.expo/`, `node_modules/`, and TypeScript build-info paths
- database dumps and logs

`git diff --cached --check`, staged safety inspection, and source/config secret scan passed.

## Safety boundary

Not performed or authorized:

- PR merge;
- push to `main`;
- Railway API deployment;
- production Vercel deployment;
- hosted Supabase dictionary bootstrap;
- hosted `db:seed:local`;
- provider env/secret changes;
- paid resource changes.

Even after a future merge, the hosted dictionary bootstrap remains blocked until Ashar explicitly approves the exact reviewed dictionary-only data operation in chat.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Ashar/Athena
- Why needed: human/orchestrator approval gate.
- Exact task: Review PR #7 and its terminal checks. Explicitly approve or reject merge. Merge approval must not be interpreted as hosted-data-mutation approval.
- Inputs/context: PR #7, Ticket 136 PASS, this response.
- Expected output back to Athena: merge decision and, separately, whether to request hosted dictionary bootstrap approval.

### Follow-up ticket 2

- Target agent: Yuna
- Why needed: controlled hosted operation.
- Exact task: Only after PR #7 is merged, current-main CI is green, and Ashar separately approves the hosted data mutation, execute the exact guarded dictionary-only bootstrap and resume Ticket 128 smoke.
- Inputs/context: current main SHA, provider access, reviewed command, explicit approval, rollback notes.
- Expected output back to Athena: aggregate bootstrap output, readiness transition, two-session shared-match/reconnect/settlement evidence, and rollback status.

### Follow-up ticket 3

- Target agent: Jasmine
- Why needed: independent hosted verification.
- Exact task: After Yuna's approved hosted bootstrap and resumed Ticket 128 PASS, independently verify hosted Standard queue, shared match, reconnect, spoiler safety, and rating convergence.
- Inputs/context: hosted URLs and corrected Ticket 128/Yuna evidence.
- Expected output back to Athena: final hosted PASS/WARN/FAIL.
