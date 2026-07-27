# Ticket 218 — Operator Compatibility Checkpoint PR and CI Response

Task: Operator Compatibility Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: In progress — Ticket 219 final PASS and required local gates confirmed; focused branch/PR/final-head checks pending.

## What I understood

After Ticket 219 PASS, create a narrow checkpoint from exact current `origin/main` containing only the operator public-readiness compatibility source/tests and Tickets 217–219 evidence. Use explicit staging, exclude all unrelated activation/preflight coordination and sensitive/generated artifacts, run focused operator/API/contracts/build/context/secret/diff gates, open and monitor the PR, and stop before merge, deployment, hosted/provider/database access, or lifecycle transition.

## QA chain

- Ticket 217 originally returned **FAIL** because falsey malformed duplicate readiness-envelope branches bypassed ambiguity rejection.
- Ticket 219 returned the authoritative final **PASS** after strict own-property XOR discrimination and non-null/non-array object checks were added.
- Ticket 219 explicitly closes Ticket 217's sole blocker and authorizes Ticket 218 checkpoint/PR/CI only.
- Merge, deployment, hosted access, provider mutation, database access/write, lifecycle transition, and release remain unauthorized.

## Local verification

```text
CI=true pnpm install --frozen-lockfile                     0
CI=true pnpm --filter @wordle-royale/api db:generate       0
CI=true pnpm --filter @wordle-royale/api test:speed-lifecycle-operator
                                                             0 — 40/40
CI=true pnpm --filter @wordle-royale/api typecheck         0
CI=true pnpm --filter @wordle-royale/api test              0 — 228/228
CI=true pnpm --filter @wordle-royale/contracts test        0 — 24/24
CI=true pnpm --filter @wordle-royale/contracts typecheck   0
CI=true pnpm build                                         0
CI=true pnpm --filter @wordle-royale/api smoke:speed-lifecycle-operator-context
                                                             0
CI=true pnpm secret-scan                                   0 — 289 files
git diff --check                                           0
CI=true pnpm deps:down                                     0
```

Compiled operator context:

```json
{"result":"PASS","mode":"context-smoke","runtimeWorkersPresent":false}
```

No public controller, runtime worker, or browser-accessible operator mutation route was added.

## Compatibility evidence

Readiness envelope:

- accepts current `{data:{dependencies}}`;
- accepts legacy `{dependencies}`;
- requires exactly one own top-level `data` or `dependencies` branch;
- requires body, nested `data`, and selected dependencies to be non-null, non-array objects;
- rejects dual, missing, primitive, null, array, falsey malformed, and structurally incomplete shapes;
- maps all discriminator failures to `reconciler_readiness_failed` without raw-body leakage.

DNS/transport:

- supports scalar and `options.all=true` pinned lookup callback forms;
- rejects mixed public/private DNS before transport;
- keeps RFC 8215 local-use NAT64, private, loopback, mapped, translated, encoded, and special-use origins blocked;
- deterministically selects validated public IPv4 before IPv6;
- passes exactly the selected address to pinned HTTPS transport;
- introduces no ordinary DNS fallback;
- caps readiness transport at 12,000 ms inside the absolute operator deadline.

Provider/operator proofs remain green:

- exact provider scope/deployment/artifact/fleet/replica/region/lease/origin binding;
- serialized Railway command fencing;
- cancellation-ignoring settlement fencing;
- read-only dry-run and explicit approval/confirmation boundaries;
- no raw provider/readiness leakage;
- isolated compiled operator context.

PostgreSQL integration was intentionally not rerun: this checkpoint changes only in-memory public-readiness parsing, DNS address ordering, pinned lookup compatibility, and transport timeout selection. No schema, transaction, audit, lease, or lifecycle SQL changed.

## Reviewed checkpoint scope

Expected source/test scope:

- `apps/api/src/gameplay/public-origin-readiness.ts`
- `apps/api/src/gameplay/speed-lifecycle-operator.service.ts`
- `apps/api/test/public-origin-readiness.test.ts`
- `apps/api/test/speed-lifecycle-operator.test.ts`

Communication scope:

- Tickets 217–219;
- Ticket 217 and 219 QA evidence;
- this Ticket 218 response.

Preserved and excluded:

- Ticket 198 edit;
- Tickets 202–204;
- all Ticket 202 preflight coordination/evidence;
- shared `agent-communication/index.md` changes mixing unrelated lifecycle work.

Also excluded: real environment files, generated builds/caches, provider sessions, hosted URLs/database strings, raw provider output, logs, dumps, coverage, and temporary artifacts.

## Branch/PR/CI

Pending.

## Safety boundaries

- No direct push to `main`.
- No merge.
- No production deployment.
- No Railway/API/CLI authentication or query.
- No provider or environment mutation.
- No hosted database access, migration, seed, read, or write.
- No close/drain/open, generation acknowledgement, queue/gameplay mutation, disable, or rollback.
- Automatic Vercel checks are PR Preview only.

## Rollback

Before merge, close the PR and delete the topic branch if rejected. After an independently approved merge, use only a reviewed revert PR and normal green current-main CI. This checkpoint adds no migration. Code rollback does not authorize a hosted lifecycle transition.

## Follow-up tickets

### PR review and merge decision

- Target agent: Ashar/Athena
- Why needed: explicit merge authority.
- Exact task: Review the final PR head, Tickets 217/219 QA chain, source/test scope, local evidence, and remote checks; approve or reject merge.
- Inputs/context: PR URL/head and this response.
- Expected output back to Athena: merge/no-merge decision and post-merge sequencing.

### Read-only hosted preflight

- Target agent: Yuna
- Why needed: provider/database proof remains separately access- and authorization-gated.
- Exact task: Only after approved merge, successful current-main CI, exact deployment correlation, approved access, and separate read-only authorization, rerun the trusted preflight and stop before apply.
- Inputs/context: approved merge SHA, exact provider deployment, trusted operator shell, process-only database injection.
- Expected output back to Athena: sanitized PASS/WARN/FAIL with authoritative no-write proof.

### Independent hosted verification

- Target agent: Jasmine
- Why needed: hosted behavior was intentionally outside Tickets 217–219.
- Exact task: Remain blocked until a separately authorized preflight/activation/hosted-smoke sequence completes.
- Inputs/context: Ticket 218 PR/CI plus future operations evidence.
- Expected output back to Athena: independent hosted PASS/WARN/FAIL and release recommendation.
