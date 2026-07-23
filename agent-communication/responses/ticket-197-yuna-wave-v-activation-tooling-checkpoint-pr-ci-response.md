# Ticket 197 — Wave V Activation Tooling Checkpoint PR and CI Response

Task: Wave V Activation Tooling Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: **PASS** — Ticket 201 authorized checkpointing; canonical, provider-mock, and disposable-PostgreSQL gates passed; branch pushed; PR #12 opened; implementation-head GitHub/Vercel checks passed; no merge or hosted/provider/lifecycle action performed.

## What I understood

Checkpoint only the independently accepted trusted activation operator tooling, provider-bound proof, migration, runbook, tests, tickets, and evidence on a focused branch based on current `origin/main`; run canonical, provider-mock, security, build/startup, and ten-run disposable PostgreSQL gates; open and monitor a PR; stop before merge, deployment, provider query/mutation, hosted database access/mutation, or lifecycle transition.

## QA authorization

- Ticket 196 originally returned FAIL with four trusted-provider boundary blockers.
- Ticket 199 remediated exact active fleet proof, command serialization, public-origin fencing, and regional lease binding.
- Ticket 200 closed three groups but found an RFC 8215 local-use NAT64 `/48` omission.
- Ticket 201 returned **PASS**, closed that final blocker, and explicitly authorized Ticket 197 checkpoint/PR/CI only.
- Ticket 201 did not authorize merge, deployment, Railway access, hosted database access, lifecycle mutation, gameplay smoke, or release.

## Canonical and provider-mock gates

```text
CI=true pnpm install --frozen-lockfile                     0
CI=true pnpm --filter @wordle-royale/api db:generate       0
CI=true pnpm lint                                          0
CI=true pnpm typecheck                                     0
CI=true pnpm test                                          0
CI=true pnpm --filter @wordle-royale/api test              0 — 193/193
CI=true pnpm --filter @wordle-royale/contracts test        0 — 24/24
CI=true pnpm --filter @wordle-royale/rating-tools test     0 — 14/14
CI=true pnpm --filter @wordle-royale/api test:speed-lifecycle-operator
                                                             0 — 30/30
CI=true pnpm --filter @wordle-royale/api db:validate       0
CI=true pnpm build                                         0
CI=true pnpm smoke:api:prod-start                          0
CI=true pnpm smoke:local                                   0
CI=true pnpm deps:check                                    0
CI=true pnpm secret-scan                                   0 — 281 files
git diff --check                                           0
CI=true pnpm deps:down                                     0
```

Provider-mock evidence covered:

- RFC 8215 local-use NAT64 fencing before transport;
- exact Railway scope, deployment, immutable artifact, active replica count/identity, and regional allocation;
- linked/scoped provider observation agreement;
- command timeout serialization with maximum concurrency one;
- sanitized provider failures;
- exact capability identity;
- strict operator argument parsing;
- read-only dry-run and explicit approval/confirmation boundaries;
- bounded database, convergence, DNS, transport, and guarded transaction work;
- close/open separation and drain rejection.

Production-start smoke:

```text
7 migrations discovered
no pending migration in isolated prod_start_smoke schema
API production build passed
/readyz returned status=ok
API process terminated
```

No public activation/operator controller route was added; the operator remains an isolated local application context.

## Disposable PostgreSQL operator gate

Used an isolated PostgreSQL 16 container with generated ephemeral credentials, loopback-only dynamic port, tmpfs storage, unique guarded `ticket195_*` schemas, and unconditional cleanup.

```text
SPEED_OPERATOR_ITERATIONS=10
5 assertions per schema
50/50 passed
all 7 migrations applied fresh per iteration
all disposable schemas dropped
temporary container absent
ordinary Compose dependencies down
```

The matrix covered dry-run zero writes, exact additive schema, hostile lease/provider/generation sets, provider-index and audit tamper/recovery, partial identity rejection, atomic audit rollback, creator serialization, Standard availability, drain/generation acknowledgement, open separation, and rollback symmetry.

No generated credential was printed or persisted. No hosted URL or database was used.

## Intended checkpoint scope

- Wave U hosted follow-up evidence and Wave V Tickets 194–201;
- Railway inventory proof/V2 activation runbook;
- additive `20260719000000_railway_inventory_operator` migration;
- isolated operator entry point/module/argument parser;
- strict Railway inventory adapter and provider proof/digest types;
- public-origin resolver/transport fencing;
- activation operator service and capability identity changes;
- readiness/schema support for the additive operator tables/indexes;
- permanent focused/provider-mock/PostgreSQL tests;
- Ticket 201 final independent PASS.

Excluded:

- `.env.preview.local` and all real environment files;
- provider credentials/auth/session material;
- generated builds, `.next`, `.expo`, tsbuildinfo, caches, coverage, logs, and dumps;
- temporary schemas, containers, generated passwords, and QA files.

## Branch/PR/CI

```text
base = main @ e81e211e8995d594559d5cc2d33c88a7730ef2de
branch = wave-v/trusted-activation-tooling
checkpoint commit = f7b8dc0c62a30c46657c6286a7f77c3267ed64f6
commit subject = feat: checkpoint wave v activation tooling
local SHA = remote SHA
staged paths = 40
blocked staged paths = []
```

Pull request:

- PR #12: https://github.com/Ashar-Neodym/wordle-royale/pull/12
- base: `main`
- head: `wave-v/trusted-activation-tooling`
- state at implementation checkpoint: open, non-draft

Implementation-head checks:

```text
Workspace checks = PASS, 1m21s
run = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29980274506
job = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29980274506/job/89120427274
Vercel PR Preview = PASS
Vercel Preview Comments = PASS
preview = https://vercel.com/ashar-neodyms-projects/wordle-royale-web/GTSjYSPCVrtiUE6hi5UbLHJrxFvW
```

The Vercel result is an automatic PR Preview, not production deployment evidence or authorization.

Checkpoint hygiene:

- `git diff --cached --check` passed after removing trailing whitespace from six Markdown evidence/runbook files without semantic edits.
- `.env.preview.local`, generated builds, Expo/Next caches, tsbuildinfo, logs, dumps, coverage, provider/session material, and temporary PostgreSQL artifacts remained excluded.
- The branch was created from exact current `origin/main` after PR #11 merged, avoiding old topic-branch history.

## Safety boundaries

- No direct push to `main`.
- No merge.
- No production deployment.
- No Railway CLI/API query or mutation.
- No provider setting or environment mutation.
- No hosted database connection, migration, seed, or audit write.
- No `close-v2`, `open-v2`, rollback, generation acknowledgement, or other lifecycle transition.
- Any automatic Vercel PR Preview is preview-only.

## Rollback

Before merge, close the PR and delete the topic branch if rejected. After a separately approved merge, revert only through a reviewed revert PR and green main CI. The migration is additive; do not destructively remove audit/identity objects without a separate data-owner rollback plan. Ticket 198's close/drain/open sequence remains separately approval-bound and must preserve audit evidence.

## Follow-up tickets

### Follow-up 1

- Target agent: Ashar/Athena
- Why needed: explicit merge/no-merge authority.
- Exact task: Review the final Wave V PR head, Ticket 201 PASS, provider-mock/PostgreSQL evidence, and final remote checks; explicitly approve or reject merge.
- Inputs/context: this response, PR URL/head/checks, Tickets 196/199/200/201.
- Expected output back to Athena: merge/no-merge decision and whether Ticket 198 may be separately authorized.

### Follow-up 2

- Target agent: Yuna
- Why needed: hosted activation is an operations-owned, high-risk, multi-step state transition.
- Exact task: Keep Ticket 198 blocked until explicit merge approval, merged current-main CI, exact provider deployment evidence, required Railway/DB access, and separate exact hosted activation authorization are all present. Begin with read-only/dry-run proof; do not infer apply approval.
- Inputs/context: approved merge SHA, Ticket 198, operator runbook, provider inventory, database authority state.
- Expected output back to Athena: sanitized read-only proof and an explicit approval-needed boundary before any close/drain/open mutation.

### Follow-up 3

- Target agent: Jasmine
- Why needed: independently verify final hosted state only after authorized operations.
- Exact task: Remain blocked until Ticket 198's authorized hosted sequence completes, then independently verify activation/readiness, queue, concurrent ready, settlement/read convergence, Standard isolation, and rollback evidence.
- Inputs/context: Ticket 197 PR/CI and Ticket 198 operations evidence.
- Expected output back to Athena: hosted PASS/WARN/FAIL and release recommendation.
