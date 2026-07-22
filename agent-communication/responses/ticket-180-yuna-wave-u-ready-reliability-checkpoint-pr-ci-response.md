# Ticket 180 — Wave U Ready Reliability Checkpoint PR and CI Response

Task: Wave U Ready Reliability Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: **PASS** — Ticket 193 authorized checkpointing; canonical and disposable-PostgreSQL gates passed; branch pushed; PR #11 opened; implementation-head GitHub/Vercel checks passed; no merge or production action performed.

## What I understood

Checkpoint the reviewed Wave U ready-reliability implementation and evidence on a focused branch, run canonical and disposable-PostgreSQL gates, open a PR against `main`, monitor final-head GitHub/Vercel checks, preserve ignored/generated/secret-bearing files, and stop before merge or production deployment.

## QA authorization

- Ticket 179's original FAIL was followed by focused remediation/rechecks.
- Ticket 188 and Ticket 191 recorded narrower remaining blockers.
- Ticket 193 returned **PASS**, closed the final frontend clock/phase blockers, and explicitly authorized Ticket 180 checkpoint/PR/CI.
- Ticket 193 does not authorize merge, deployment, provider mutation, hosted data mutation, or release.

## Canonical local gates

```text
CI=true pnpm install --frozen-lockfile                     0
CI=true pnpm --filter @wordle-royale/api db:generate       0
CI=true pnpm lint                                          0
CI=true pnpm typecheck                                     0
CI=true pnpm test                                          0
CI=true pnpm --filter @wordle-royale/api test              0 — 162/162
CI=true pnpm --filter @wordle-royale/contracts test        0 — 24/24
CI=true pnpm --filter @wordle-royale/rating-tools test     0 — 14/14
CI=true pnpm --filter @wordle-royale/api db:validate       0
CI=true pnpm build                                         0
CI=true pnpm smoke:api:prod-start                          0
CI=true pnpm smoke:local                                   0
CI=true pnpm deps:check                                    0
CI=true pnpm secret-scan                                   0 — 267 files
git diff --check                                           0
CI=true pnpm deps:down                                     0
```

An initial attempt used the superseded/nonexistent root command `pnpm smoke:production-start` and exited 1 with a command-not-found error. The repository's actual script is `pnpm smoke:api:prod-start`; that exact production-start smoke then passed. No product assertion failed.

Production-start evidence:

```text
6 migrations discovered
no pending migration in isolated prod_start_smoke schema
API production build passed
/readyz returned status=ok
API process terminated
```

## Disposable PostgreSQL gates

An isolated PostgreSQL 16 container was used with generated ephemeral credentials, loopback-only dynamic ports, tmpfs storage, unique schemas, and unconditional cleanup. No retained developer volume or hosted database was changed.

```text
Standard concurrent matchmaking                       3/3
Speed queue/gameplay                                  5/5
Speed ready/timing boundaries                         7/7
Speed schema-isolated readiness                       8/8
Hostile lifecycle races                    10 × 7/7 = 70/70
Mixed-version lifecycle activation         10 × 6/6 = 60/60
Speed settlement/read convergence                      2/2
Standard rating/read convergence                       1/1
```

All migrations from the initial schema through:

- `20260717000000_speed_ready_lifecycle_v2`
- `20260718000000_speed_lifecycle_activation_gate`

applied successfully on fresh schemas.

One guarded invocation initially passed only the generic Speed test URL to the schema-readiness harness. It correctly fell back to local port 5432 and failed closed because that retained service was not running. The harness preamble was then read, the exact `SPEED_SCHEMA_READINESS_TEST_DATABASE_URL`, `SPEED_RACE_TEST_DATABASE_URL`, and `SPEED_ACTIVATION_TEST_DATABASE_URL` variables were supplied, and all authoritative reruns passed.

A first rating/read invocation used a `ticket180_*` schema and therefore skipped by design. Reading the guarded test preambles showed the required prefixes. Fresh `ticket169_*` and `ticket131_*` schemas were then migrated and the authoritative Speed 2/2 and Standard 1/1 suites passed.

Cleanup evidence:

```text
disposable schemas dropped
isolated containers absent
ordinary Compose dependencies down
no generated credential persisted or printed
```

## Checkpoint scope

Expected included areas:

- Wave T hosted evidence and Wave U tickets/responses;
- Speed lifecycle V2 and activation migrations;
- exact schema/readiness/activation checks;
- deterministic hostile PostgreSQL race and activation harnesses;
- server-authoritative ready lifecycle, mutation policy, reconciler, and health changes;
- frontend mutation uncertainty, monotonic snapshot ordering, authoritative clock anchoring, and tests;
- contracts and architecture documentation.

Expected excluded artifacts:

- `.env.preview.local` and all real env files;
- `dist/`, `.next/`, `.expo/`, tsbuildinfo, caches, coverage, logs, and dumps;
- temporary schemas, containers, test credentials, and generated QA helpers.

## Branch/PR/CI

```text
base = main @ 07aa546b157199a192cc8d156b52a26a4eeb8118
branch = wave-u/hosted-speed-ready-reliability
checkpoint commit = 05b3b6d889fbd1dcdc1700caf4ae0cfb2d17e918
commit subject = feat: checkpoint wave u ready reliability
local SHA = remote SHA
staged paths = 86
blocked staged paths = []
```

Pull request:

- PR #11: https://github.com/Ashar-Neodym/wordle-royale/pull/11
- base: `main`
- head: `wave-u/hosted-speed-ready-reliability`
- state at implementation checkpoint: open, non-draft

Implementation-head checks:

```text
Workspace checks = PASS, 1m28s
run = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29825948203
job = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29825948203/job/88619215300
Vercel PR Preview = PASS
Vercel Preview Comments = PASS
preview = https://vercel.com/ashar-neodyms-projects/wordle-royale-web/J4s5SpzMCdj2vrh3KiqbJDXUCXWe
```

The Vercel result is an automatic PR Preview, not production deployment evidence or authorization.

Checkpoint hygiene:

- `git diff --cached --check` passed after removing trailing whitespace from 13 Markdown evidence/contract files without semantic edits.
- `.env.preview.local`, generated builds, Expo/Next caches, tsbuildinfo, logs, dumps, coverage, and temporary PostgreSQL artifacts remained excluded.
- The branch was created from exact `origin/main`, not from the already-merged Wave T topic history.

## Safety and approval boundaries

- No direct push to `main`.
- No merge.
- No production deployment or provider setting change.
- No secret/env mutation.
- No hosted database migration or seed.
- Automatic Vercel PR Preview checks, if created, are preview-only and not production authorization.

## Rollback

Before merge, close the PR and delete the branch if rejected. After an approved merge, use a reviewed revert PR; do not force-push `main`. Treat the Wave U migrations as additive and do not destructively remove lifecycle/activation schema without a separate data-owner rollback plan.

## Follow-up tickets

### Follow-up 1

- Target agent: Ashar/Athena
- Why needed: explicit merge/no-merge authority.
- Exact task: Review the final Wave U PR head, Ticket 193 PASS, local/PostgreSQL evidence, and final remote checks; approve or reject merge.
- Inputs/context: this response, PR URL/head/checks, Tickets 179/188/191/193.
- Expected output back to Athena: explicit merge/no-merge decision and Ticket 181 authorization state.

### Follow-up 2

- Target agent: Yuna
- Why needed: hosted deployment identity and concurrent-ready smoke remain operations-owned.
- Exact task: Only after explicit merge approval, successful current-main CI, and exact provider deployment evidence, execute Ticket 181 without manual provider/env mutation unless separately approved.
- Inputs/context: approved merge SHA, Ticket 181 criteria, provider deployment statuses.
- Expected output back to Athena: hosted concurrent-ready, activation/readiness, settlement/read convergence, Standard regression, safety, and rollback evidence.

### Follow-up 3

- Target agent: Jasmine
- Why needed: independent final hosted release confidence.
- Exact task: Keep Ticket 182 blocked until Ticket 181 completes, then independently verify hosted Wave U.
- Inputs/context: Ticket 180 PR/CI evidence and Ticket 181 hosted smoke.
- Expected output back to Athena: final hosted PASS/WARN/FAIL and release recommendation.
