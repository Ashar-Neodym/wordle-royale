# Ticket 207 — Provider-Compatibility Checkpoint PR and CI Response

Task: Provider-Compatibility Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: **PASS** — Ticket 206 authorized checkpointing; focused local/provider-mock/PostgreSQL gates passed; branch pushed; PR #13 opened; implementation-head GitHub/Vercel checks passed; no merge or hosted/provider/lifecycle action performed.

## What I understood

Create a focused branch from exact current `origin/main`, checkpoint only Tickets 205–207 provider-compatibility code, tests, sanitized fixture, tickets, and evidence; run canonical, focused provider/operator, production-start, security, and ten-schema disposable PostgreSQL gates; open and monitor a PR; stop before merge, deployment, Railway access, hosted database access, or lifecycle mutation.

## QA authorization

Ticket 206 returned **PASS** and explicitly authorized Ticket 207 checkpoint/PR/CI only. It verified the Railway CLI 5.27.1 live-status fixture and exact-fleet proof without weakening fail-closed behavior. It did not authorize merge, hosted access, provider mutation, deployment, lifecycle transition, or release.

## Checkpoint verification

```text
CI=true pnpm install --frozen-lockfile                     0
CI=true pnpm --filter @wordle-royale/api db:generate       0
CI=true pnpm lint                                          0
CI=true pnpm typecheck                                     0
CI=true pnpm test                                          0
CI=true pnpm --filter @wordle-royale/api test              0 — 199/199
CI=true pnpm --filter @wordle-royale/contracts test        0 — 24/24
CI=true pnpm --filter @wordle-royale/rating-tools test     0 — 14/14
CI=true pnpm --filter @wordle-royale/api test:speed-lifecycle-operator
                                                             0 — 36/36
CI=true pnpm --filter @wordle-royale/api db:validate       0
CI=true pnpm build                                         0
CI=true pnpm smoke:api:prod-start                          0
CI=true pnpm smoke:local                                   0
CI=true pnpm deps:check                                    0
CI=true pnpm secret-scan                                   0 — 282 files
git diff --check                                           0
CI=true pnpm deps:down                                     0
```

Focused coverage preserved:

- permanent sanitized Railway CLI 5.27.1 live-status shape;
- nullable `numReplicas` accepted only with complete positive regional cardinality;
- exact numeric-count/regional/RUNNING/operator expectation agreement;
- exact `RUNNING` serving and `REMOVED` terminal semantics;
- rejection of unknown, transitional, failed, lowercase, legacy, malformed, duplicate, blank, or contradictory states;
- exact successful unstopped deployment identity;
- linked/scoped observation agreement;
- deterministic replica, regional, and inventory digests;
- closed sanitized provider-error allowlist;
- command serialization, deadlines, origin/DNS/NAT64 fencing, dry-run zero-write behavior, and explicit approval/confirmation boundaries.

Production-start smoke:

```text
7 migrations discovered
no pending migration in isolated prod_start_smoke schema
API production build passed
/readyz returned status=ok
API process terminated
```

No public provider/operator/activation endpoint was added.

## Disposable PostgreSQL verification

Used an isolated PostgreSQL 16 container with generated ephemeral credentials, loopback-only dynamic port, tmpfs storage, unique guarded `ticket195_*` schemas, and unconditional cleanup.

```text
iterations = 10
assertions per iteration = 5
total = 50/50 passed
migrations per iteration = 7
all disposable schemas dropped
temporary container absent
ordinary Compose dependencies down
```

The matrix preserved fresh migration, dry-run zero writes, hostile lease/provider identity rejection, schema/index and append-only audit protections, audit-failure rollback, creator serialization, close/open separation, drain/generation checks, rollback symmetry, and Standard availability.

No provider URL, provider credential, hosted database URL, generated password, or raw provider output was printed or persisted.

## Focused intended scope

Implementation/test files:

- `apps/api/src/gameplay/railway-inventory.adapter.ts`
- `apps/api/src/gameplay/speed-lifecycle-operator.service.ts`
- `apps/api/test/railway-inventory-adapter.test.ts`
- `apps/api/test/speed-lifecycle-operator.test.ts`
- `apps/api/test/fixtures/railway-status-5.27.1-live-sanitized.json`

Communication/evidence:

- Tickets 205–207;
- Ticket 205 implementation response;
- Ticket 206 independent PASS;
- this Ticket 207 response.

Preserved but intentionally excluded from the checkpoint:

- pre-existing Ticket 198 edit;
- Tickets 202–204 and Ticket 202 response;
- the broader shared `agent-communication/index.md` edit because it includes unrelated activation sequencing outside Tickets 205–207.

Also excluded: all real environment files, generated builds/caches, provider auth/session material, hosted URLs, logs, dumps, coverage, and temporary database artifacts.

## Branch/PR/CI

```text
base = main @ 6992ce1ef12b4d1b7e51869be7b2f7c70340e839
branch = wave-v/railway-live-schema-compatibility
checkpoint commit = a6d94f6e1fbf989b1dbc03ca122a26a8956f29b4
commit subject = fix: support railway live fleet schema
local SHA = remote SHA
staged paths = 11
blocked staged paths = []
```

Pull request:

- PR #13: https://github.com/Ashar-Neodym/wordle-royale/pull/13
- base: `main`
- head: `wave-v/railway-live-schema-compatibility`
- state at implementation checkpoint: open, non-draft

Implementation-head checks:

```text
Workspace checks = PASS, 1m28s
run = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29986440329
job = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29986440329/job/89139243027
Vercel PR Preview = PASS
Vercel Preview Comments = PASS
preview = https://vercel.com/ashar-neodyms-projects/wordle-royale-web/mzbDcQe1hhPVqujugjUxZkdHPx4V
```

The Vercel result is an automatic PR Preview, not production deployment evidence or authorization.

The checkpoint used explicit staging. The broader dirty communication files listed in the exclusions were preserved in the working tree and were not staged or committed.

## Safety boundaries

- No direct push to `main`.
- No merge.
- No production deployment.
- No authenticated Railway query.
- No provider/environment setting mutation.
- No hosted database access, migration, seed, or audit read/write.
- No lifecycle transition, generation acknowledgement, queue/gameplay mutation, or rollback.
- Automatic Vercel PR checks are preview-only.

## Rollback

Before merge, close the PR and delete the topic branch if rejected. After a separately approved merge, use only a reviewed revert PR and green current-main CI. Provider compatibility is parser/test behavior with no new migration in this checkpoint. Never use rollback as authorization for a hosted activation mutation.

## Follow-up tickets

### Follow-up 1

- Target agent: Ashar/Athena
- Why needed: explicit merge authority.
- Exact task: Review the final provider-compatibility PR head, Ticket 206 PASS, local/PostgreSQL evidence, and final checks; approve or reject merge.
- Inputs/context: this response, PR URL/head, Tickets 205–207.
- Expected output back to Athena: merge/no-merge decision and post-merge read-only preflight sequencing.

### Follow-up 2

- Target agent: Yuna
- Why needed: read-only hosted preflight remains operations-owned and separately access-gated.
- Exact task: After approved merge, green current-main CI, and exact deployment evidence, rerun only the separately authorized read-only Ticket 202 preflight with approved Railway/DB access. Stop before any apply operation.
- Inputs/context: approved merge SHA, exact provider deployment, authenticated trusted operator shell, process-only hosted DB injection.
- Expected output back to Athena: sanitized PASS/WARN/FAIL exact-fleet/lease/authority/no-write proof.

### Follow-up 3

- Target agent: Jasmine
- Why needed: independent hosted verification after any future separately authorized activation sequence.
- Exact task: Remain blocked until read-only preflight and separate close/open tickets complete under their own approvals.
- Inputs/context: checkpoint evidence plus future operations evidence.
- Expected output back to Athena: independent hosted PASS/WARN/FAIL and release recommendation.
