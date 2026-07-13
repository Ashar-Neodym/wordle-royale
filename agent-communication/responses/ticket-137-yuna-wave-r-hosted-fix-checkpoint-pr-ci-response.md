# Ticket 137 — Wave R Hosted-Fix Checkpoint PR and CI Response

Task: Wave R Hosted-Fix Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: In progress — Ticket 136 PASS and local gates confirmed; branch/PR/remote CI pending

## What I understood

Checkpoint only the intended Ticket 128 and 134–136 evidence plus the reviewed dictionary-only preview bootstrap/readiness implementation on `wave-r/preview-dictionary-bootstrap`. Run the canonical local gates and a real-PostgreSQL disposable-schema integration, push the branch, open a PR to `main`, monitor GitHub/Vercel checks, and stop before merge/deploy/hosted-data mutation.

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
- one shared non-self Standard match for two distinct users after bootstrap;
- production rejection of the preview fixture.

No hosted data-operation approval was granted by Ticket 136.

## Intended scope

Included source/config:

- `README.md`
- `apps/api/package.json`
- `apps/api/prisma/bootstrap-preview-dictionary.ts`
- `apps/api/prisma/dictionary-fixture.ts`
- `apps/api/prisma/dictionary-fixture.test.mjs`
- `apps/api/prisma/seed-fixtures.ts`
- `apps/api/scripts/run-preview-dictionary-postgres-integration.mjs`
- `apps/api/src/app.module.ts`
- `apps/api/src/dictionary/standard-dictionary.service.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/matchmaking/matchmaking-config.ts`
- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/test/api-skeleton.test.ts`
- `apps/api/test/matchmaking.test.ts`
- `apps/api/test/preview-dictionary-postgres.integration.test.ts`
- `apps/api/test/readiness-dictionary.test.ts`
- `apps/api/test/standard-dictionary.test.ts`
- `scripts/api-prod-start-smoke.mjs`

Included evidence/docs:

- Ticket 128 response.
- Tickets/responses 134–136.
- Ticket 137 assignment and this response.
- Athena dictionary-bootstrap review.
- Elisa preview dictionary/bootstrap readiness contract.
- communication index update.

## Local verification

Canonical gates passed:

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

Dry-run aggregate output:

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

No words, database URL, cookies, provider secrets, or credentials were printed by the bootstrap dry-run.

## Real-PostgreSQL integration

The first command invocation without an explicit disposable local database URL correctly failed closed before any database operation:

```text
Set PREVIEW_DICTIONARY_TEST_DATABASE_URL (or DATABASE_URL) to a disposable local PostgreSQL database.
exit 1
```

The local Compose PostgreSQL dependency was then started and the integration rerun with an explicit local test database URL supplied only to the process:

```text
3 migrations applied to unique disposable schema
3 integration tests passed
0 failed/skipped
disposable schema dropped
exit 0
```

Verified behaviors:

1. unavailable readiness and zero-write first joins before bootstrap;
2. exact dictionary-only first apply and idempotent rerun;
3. readiness transition to `ok`;
4. ineligible-release pairing rollback;
5. one exact-release shared non-self match after bootstrap.

Local PostgreSQL/Redis containers and the Compose network were removed afterward.

## Artifact and secret hygiene

Excluded and unstaged:

- `.env.preview.local`
- `apps/api/dist/`
- `apps/mobile/.expo/`
- `apps/web/.next/`
- `apps/web/tsconfig.tsbuildinfo`
- generated package `dist/` and `node_modules/` paths

No env files, credentials, database dumps, logs, or generated build outputs are intended for the checkpoint.

## Git / PR / CI evidence

Pending until branch creation, push, PR creation, and terminal check monitoring.

## Safety boundary

This checkpoint does **not** authorize or perform:

- PR merge;
- deployment;
- hosted Supabase dictionary bootstrap;
- `db:seed:local` on hosted preview;
- provider env/secret changes;
- paid resource changes.

Even after a future merge, hosted dictionary bootstrap remains blocked until Ashar explicitly approves the exact reviewed dictionary-only data operation in chat.

## Follow-up tickets

Pending final PR/check status. At minimum:

- Ashar/Athena: review the PR and explicitly decide merge; do not infer hosted-data approval from merge approval.
- Yuna: after merge/current-main CI and separate explicit hosted-data approval, execute only the guarded dictionary-only bootstrap and resume Ticket 128 smoke.
- Jasmine: independently verify resumed hosted Wave R behavior after the approved bootstrap.
