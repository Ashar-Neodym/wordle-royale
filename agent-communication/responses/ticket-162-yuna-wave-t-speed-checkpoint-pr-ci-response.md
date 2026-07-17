# Ticket 162 — Wave T Speed Checkpoint PR and CI Response

Task: Wave T Speed Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: Completed — checkpoint pushed, PR opened, CI generation defect corrected, and latest implementation-head GitHub/Vercel checks passed; not merged or deployed to production

## What I understood

Checkpoint the reviewed Wave T Speed/Blitz 1v1 implementation and accumulated evidence on `wave-t/live-speed-1v1`, run canonical and PostgreSQL gates, exclude secrets/generated artifacts, open a PR to `main`, and monitor latest-head GitHub/Vercel checks. Do not merge, deploy, mutate hosted data, change provider settings, or enable Speed in production.

## QA prerequisite

Ticket 175 is the final independent QA authority and records **PASS**. It supersedes the earlier Tickets 161, 171, and 173 FAIL findings.

Ticket 175 verified:

- bounded generation-fenced reconciler health;
- no overlap while obsolete work remains unresolved;
- stale/old-epoch completions cannot revive Speed;
- a new in-budget pass is required for recovery;
- catalog, `/readyz`, and all Speed operations fail closed;
- Standard remains unaffected;
- Speed gameplay, timing, rating/read convergence, browser policy, build, security, and cleanup gates pass.

Its authorization is limited to Ticket 162 checkpoint/PR/CI and does not authorize merge or deployment.

## Intended checkpoint scope

The candidate includes:

- Speed 1v1 public contracts and locked timing/rating identity;
- additive Speed migration and Prisma model changes;
- server-authoritative Speed queue, readiness, gameplay, deadlines, forfeit, reconciliation, rating, profile, history, and leaderboard behavior;
- generation-fenced Speed reconciler health;
- Speed web queue/countdown/gameplay/retry presentation;
- deterministic PostgreSQL gameplay/timing/rating proofs;
- Ticket 152–175 assignments and accumulated evidence;
- this Ticket 162 response.

No hosted environment or provider state is part of this checkpoint.

## Canonical local gates

```text
CI=true pnpm install --frozen-lockfile                         exit 0
CI=true pnpm lint                                              exit 0
CI=true pnpm typecheck                                         exit 0
CI=true pnpm test                                              exit 0
CI=true pnpm --filter @wordle-royale/api test                  exit 0 — 149/149 passed
CI=true pnpm --filter @wordle-royale/contracts test            exit 0 — 24/24 passed
CI=true pnpm --filter @wordle-royale/rating-tools test         exit 0 — 14/14 passed
CI=true pnpm --filter @wordle-royale/api db:validate           exit 0
CI=true pnpm build                                             exit 0
CI=true pnpm --filter @wordle-royale/api smoke:prod-start      exit 0 on readiness-aware rerun
CI=true pnpm smoke:local                                       exit 0
CI=true pnpm deps:check                                        exit 0
CI=true pnpm secret-scan                                       exit 0 — 250 source/config files

git diff --check                                               exit 0
CI=true pnpm deps:down                                         exit 0
```

The first production-start smoke invocation reached PostgreSQL while its retained Compose container was still starting and exited 1 with `FATAL: the database system is starting up`. No product assertion failed. Yuna explicitly waited for `pg_isready` and reran the same smoke; migrations reported no pending work and `/readyz status=ok`. Dependency teardown then passed.

## Disposable PostgreSQL gates

An isolated PostgreSQL 16 container was used with an in-process generated credential, loopback-only dedicated port, `tmpfs` storage, unconditional cleanup, and unique schemas. No URL or credential was printed or persisted.

```text
Speed gameplay PostgreSQL                      exit 0 — 5/5 passed
Deterministic Speed timing PostgreSQL          exit 0 — 4/4 passed
Standard concurrent matchmaking PostgreSQL    exit 0 — 3/3 passed
Speed settlement/read convergence PostgreSQL  exit 0 — 2/2 passed
```

All four migrations applied in every disposable schema. The Ticket 158, 170, 130, and 169 schemas were dropped. Final evidence:

```text
temporary_container_absent=true
```

## Hygiene

- Two zero-byte `.hermes-tmp.*` ticket-writer artifacts were removed before staging.
- `.env.preview.local` remains ignored and was not inspected.
- Generated `dist/`, `.next/`, `.expo/`, and TypeScript build-info artifacts remain ignored.
- Real environment files, caches, coverage, logs, dumps, and generated output must not be staged.
- Secret scan is source-focused and excludes documentation/agent communication, so the staged response receives a separate credential-pattern scan before push.

## Git / PR / CI evidence

```text
branch = wave-t/live-speed-1v1
primary checkpoint = 79b5911de5cb7d27cedbe0cdbf38406840ea1ac8
CI fix head = 870aef2
PR = https://github.com/Ashar-Neodym/wordle-royale/pull/10
base = main
state = OPEN
```

The initial PR run reached the build step and failed because the clean GitHub runner had not generated a Prisma client from Wave T's changed schema. The stale local generated client had masked this ordering requirement. Failure evidence:

```text
run = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29558792584
job = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29558792584/job/87816634314
failure = TypeScript implicit-any errors in PostgreSQL tests because new Prisma delegates were unavailable
```

Yuna made one narrow CI/devops correction in `.github/workflows/pr-checks.yml`: run `pnpm --filter @wordle-royale/api db:generate` immediately after the frozen install and before lint/typecheck/tests/build. No product behavior changed.

Local verification of the correction:

```text
CI=true pnpm install --frozen-lockfile
CI=true pnpm --filter @wordle-royale/api db:generate
CI=true pnpm typecheck
CI=true pnpm --filter @wordle-royale/api test   — 149/149 passed
CI=true pnpm build
all exit 0
```

Latest implementation-head remote checks:

```text
Workspace checks = PASS (1m30s)
run = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29558929452
job = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29558929452/job/87817031988

Vercel PR Preview = PASS
preview = https://vercel.com/ashar-neodyms-projects/wordle-royale-web/5uXAwfd7vZK3teNJssfX53V3i18s
Vercel Preview Comments = PASS
```

The Vercel check is an automatic PR Preview, not production deployment. This evidence response will be committed after the implementation-head pass, changing the branch head once more; final chat evidence must confirm the resulting documentation-only head and its rerun checks.

## Safety

- No push to `main`.
- No merge.
- No hosted deployment.
- No Railway, Vercel, Supabase, environment, secret, or paid-resource change.
- No hosted data or dictionary mutation.
- Speed remains disabled in production until separately approved merge/deployment flow.

## Rollback

Before merge, close the PR and delete the checkpoint branch. Do not force-push or reset `main`. After any separately approved merge, rollback must use a reviewed revert PR followed by green main CI and provider verification. The additive migration requires forward-safe rollback planning rather than destructive schema removal.

## Follow-up tickets

### Follow-up 1

- Target agent: Ashar/Athena
- Why needed: merge approval and release sequencing are human/orchestrator responsibilities.
- Exact task: Review the final Ticket 162 PR head and green checks, then explicitly approve or reject merge.
- Inputs/context: Ticket 175 PASS, this response, checkpoint SHA, PR URL, and final-head check URLs.
- Expected output back to Athena: explicit merge/no-merge decision and authorization status for Ticket 163.

### Follow-up 2

- Target agent: Yuna
- Why needed: post-merge hosted deployment/runtime verification is operations-owned.
- Exact task: Only after explicit merge approval and successful main CI, execute Ticket 163 without changing providers or seeding unrelated data.
- Inputs/context: approved merge SHA, main CI, hosted URLs, Ticket 163 acceptance criteria.
- Expected output back to Athena: hosted Speed fail-closed/readiness/queue/gameplay smoke evidence and rollback notes.

### Follow-up 3

- Target agent: Jasmine
- Why needed: independent final hosted release confidence.
- Exact task: Keep Ticket 164 blocked until Ticket 163 completes, then independently verify hosted Wave T behavior.
- Inputs/context: Ticket 162 PR/CI response and Ticket 163 hosted smoke.
- Expected output back to Athena: final hosted Wave T PASS/WARN/FAIL and release recommendation.
