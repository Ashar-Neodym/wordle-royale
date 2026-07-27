# Ticket 212 — Runtime-Readiness Checkpoint PR and CI Response

Task: Runtime-Readiness Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: In progress — authoritative Ticket 216 PASS and local/disposable-PostgreSQL gates confirmed; focused branch/PR/final-head checks pending.

## What I understood

Create a focused branch from exact current `origin/main`, checkpoint the reviewed runtime-readiness implementation/tests/evidence plus the mandatory Tickets 213–216 remediation and final QA chain, run canonical and disposable PostgreSQL gates, open and monitor the PR, then stop before merge, deployment, hosted access, provider mutation, database write, or lifecycle transition.

Ticket 212's original wording names Tickets 208–212. Ticket 211's first rerun found a final two-way ranked identity defect; Tickets 213–216 are therefore included only as the required remediation/review chain that made the runtime implementation checkpointable. Ticket 216 explicitly closes the remaining Ticket 211 blocker and procedurally unblocks Ticket 212.

## QA authorization

Authoritative final result: Ticket 216 **PASS**.

It verifies:

- Standard mode plus Speed algorithm fails closed;
- Speed mode plus Standard algorithm fails closed;
- null/other mode plus Speed algorithm fails closed;
- rejection precedes participant/profile/rating-event/report access and all writes;
- valid Standard remains generic Standard settlement;
- valid Speed delegates exactly once to the dedicated Speed settlement path;
- unsupported algorithm precedence is preserved;
- permanent rating matrix, API/contracts, PostgreSQL Speed rating/read-model, and gameplay paths pass.

Ticket 216 explicitly authorizes Ticket 212 checkpoint/PR/CI and does not authorize hosted access, deployment, lifecycle activation, merge, or release.

## Local verification

```text
CI=true pnpm install --frozen-lockfile                     0
CI=true pnpm --filter @wordle-royale/api db:generate       0
CI=true pnpm lint                                          0
CI=true pnpm typecheck                                     0
CI=true pnpm test                                          0
CI=true pnpm --filter @wordle-royale/api test              0 — 225/225
CI=true pnpm --filter @wordle-royale/contracts test        0 — 24/24
CI=true pnpm --filter @wordle-royale/rating-tools test     0 — 14/14
CI=true pnpm --filter @wordle-royale/api test:speed-lifecycle-operator
                                                             0 — 37/37
CI=true pnpm --filter @wordle-royale/api db:validate       0
CI=true pnpm build                                         0
CI=true pnpm --filter @wordle-royale/api smoke:speed-lifecycle-operator-context
                                                             0
CI=true pnpm smoke:api:prod-start                          0
CI=true pnpm smoke:local                                   0
CI=true pnpm deps:check                                    0
CI=true pnpm secret-scan                                   0 — 289 files
git diff --check                                           0
CI=true pnpm deps:down                                     0
```

Compiled operator-context smoke:

```json
{"result":"PASS","mode":"context-smoke","runtimeWorkersPresent":false}
```

Production-start smoke:

```text
7 migrations discovered and applied to isolated prod_start_smoke schema
API production build passed
/readyz returned status=ok
API process terminated
```

No public reconciler/operator mutation route was added.

## Disposable PostgreSQL verification

Used isolated PostgreSQL 16 containers with process-only generated credentials, loopback-only dynamic ports, tmpfs storage, guarded per-suite schema prefixes, and unconditional cleanup.

```text
hostile lifecycle races = 80/80 across ten schemas
operator proof/transition = 50/50 across ten schemas
mixed-version activation = 60/60 across ten schemas
schema readiness = 8/8
deterministic timing = 7/7
Speed gameplay = 5/5
Speed rating/read-model = 2/2, non-skipped
all disposable schemas dropped by their owners
temporary containers absent
ordinary Compose dependencies down
```

An initial Speed rating invocation supplied the generic `DATABASE_URL`; the suite intentionally skipped all tests because it requires `SPEED_RATING_INTEGRATION_DATABASE_URL` and an owned `ticket159_*`/`ticket169_*` schema. No result was claimed from that invocation. The corrected isolated `ticket159_*` rerun executed and passed 2/2.

No provider URL, hosted database URL, generated password, credential, raw provider output, answer, or gameplay spoiler was printed or persisted.

## Reviewed checkpoint scope

Runtime source/build/test changes include:

- dependency-minimal reconciler runtime module;
- immutable budget contract;
- internally owned expiry reconciliation transaction;
- completion-driven single-flight scheduler and epoch/generation fencing;
- Speed runtime health and readiness isolation;
- shared Speed expiry adjudication and rating settlement;
- two-way ranked mode/algorithm fail-closed validation;
- direct and nested SQLSTATE classification;
- compiled operator-context isolation smoke;
- permanent hosted-latency, composition/observability, scheduler, readiness, rating, and PostgreSQL race regressions.

Communication scope includes Tickets 208–216 and their responses plus the runtime architecture document and this response.

Preserved but excluded:

- pre-existing Ticket 198 edit;
- Ticket 202 preflight rerun/response;
- Tickets 202–204;
- broader shared `agent-communication/index.md` changes mixing unrelated hosted activation sequencing.

Also excluded: real environment files, generated builds/caches, provider sessions, hosted URLs, logs, dumps, coverage, and temporary database artifacts.

## Branch/PR/CI

Pending.

## Safety boundaries

- No direct push to `main`.
- No merge.
- No production deployment.
- No authenticated Railway query.
- No provider/environment change.
- No hosted database access, migration, seed, or write.
- No lifecycle transition, generation acknowledgement, queue/gameplay mutation, or rollback.
- Automatic Vercel PR checks are preview-only.

## Rollback

Before merge, close the PR and delete the topic branch if rejected. After a separately approved merge, use only a reviewed revert PR and green current-main CI. This checkpoint adds no database migration. A code rollback must not be treated as authorization for hosted close/open or another lifecycle mutation.

## Follow-up tickets

### PR review and merge decision

- Target agent: Ashar/Athena
- Why needed: explicit merge authority.
- Exact task: Review final PR head, Ticket 216 PASS, runtime architecture/source chain, canonical/PostgreSQL evidence, and final checks; approve or reject merge.
- Inputs/context: PR URL/head, Tickets 208–216, this response.
- Expected output back to Athena: merge/no-merge decision and post-merge preflight sequencing.

### Read-only hosted preflight rerun

- Target agent: Yuna
- Why needed: hosted exact fleet/lease/authority/readiness proof is operations-owned and separately access-gated.
- Exact task: Only after approved merge, successful current-main CI, exact deployment correlation, and separate read-only authorization, rerun Ticket 202 with approved Railway/DB access. Stop before apply.
- Inputs/context: approved merge SHA, provider deployment, trusted operator shell, process-only hosted DB injection.
- Expected output back to Athena: sanitized exact fleet/runtime readiness/no-write PASS/WARN/FAIL.

### Independent hosted QA

- Target agent: Jasmine
- Why needed: hosted release confidence must remain independent.
- Exact task: Remain blocked until read-only preflight and any separately approved activation/hosted-smoke sequence completes.
- Inputs/context: Ticket 212 PR/CI plus future operations evidence.
- Expected output back to Athena: independent hosted PASS/WARN/FAIL and release recommendation.
