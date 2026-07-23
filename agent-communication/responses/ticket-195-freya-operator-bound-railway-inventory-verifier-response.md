# Ticket 195 — Operator-Bound Railway Inventory Verifier — Response

Task: Ticket 195 — Operator-Bound Railway Inventory Verifier
Agent: Freya (backend implementation / reliability)
Status: Complete — implementation, fresh-schema verification, canonical release gate, and independent review PASS

## Scope delivered

Implemented Ticket 194's trusted operator-bound Railway inventory proof and activation tooling as a local, isolated operator surface. No public transition endpoint and no hosted Railway credential were added.

### Provider-bound capability leases

- Live Railway capability heartbeats now require and persist complete immutable provider identity:
  - project;
  - environment;
  - service;
  - deployment;
  - replica;
  - region;
  - immutable artifact;
  - canonical deployment-derived release;
  - observed activation generation.
- Runtime identity derivation fails closed on missing or contradictory Railway variables.
- The database constraint explicitly enforces all-or-none provider identity and handles PostgreSQL `NULL` semantics safely.
- Exact canonical provider indexes use names below PostgreSQL's 63-byte identifier limit.

### Strict local Railway inventory adapter

- Added a bounded local Railway CLI adapter pinned fail-closed to the explicitly reviewed CLI schema for `railway 5.27.1`.
- The adapter verifies the linked and explicitly scoped project/environment/service/deployment identities.
- It rejects malformed JSON, unsupported versions, unknown/transitional statuses, pagination/truncation ambiguity, duplicate or extra successful deployments, artifact ambiguity, missing domains, and incomplete regional data.
- Provider inventory must prove:
  - the target deployment is the sole settled successful deployment;
  - prior deployments are explicitly inactive;
  - immutable full Git artifact identity matches;
  - provider replica count exactly matches both status and complete regional configuration;
  - provider-derived health hosts are exact and unambiguous.
- Commands are sequential and bounded by one monotonic provider-observation deadline.
- Railway CLI v5.27.1 source was inspected locally to ground the exact JSON and command shapes. No Railway login, authenticated inventory query, hosted mutation, or provider change occurred.

### Provider-bound readiness proof

- Non-local health verification requires an exact provider-observed HTTPS origin.
- Localhost, HTTP, credentials, ports, paths, queries, fragments, redirects, and operator-substituted hosts fail closed.
- Schema, lifecycle, and dictionary checks execute against one bounded PostgreSQL transaction.
- Transaction-local `statement_timeout` and `lock_timeout`, Prisma `maxWait`/transaction timeouts, and remaining-budget fetch cancellation prevent unbounded work.
- Closing/draining continues to report truthful persisted-runtime and expiry-reconciler health while new Speed creation is unavailable.
- Standard readiness and persisted Speed reads remain isolated from activation availability.

### Transaction-bound lifecycle operations

- Added explicit `close-v2`, `open-v2`, `disable`, `close-v1`, and `open-v1` operations.
- Dry-run/verify is the default and performs zero writes.
- Mutation requires `--apply`, an approval reference, sanitized reason, exact target release/artifact/replica/generation/phase inputs, and operation-specific confirmation text.
- Close and open remain separate commands; open never follows close automatically.
- Proof validation and transition occur in the same guarded serializable transaction:
  1. set database-native statement/lock timeout;
  2. lock canonical activation authority;
  3. revalidate phase and generation;
  4. recheck database-time proof freshness and anti-replay;
  5. revalidate exact fresh provider-bound lease set;
  6. revalidate drain when opening;
  7. perform the generation-fenced CAS transition;
  8. append immutable audit evidence;
  9. commit both together.
- One monotonic apply deadline covers convergence polling, final verification, database clocks, provider commands, readiness, health fetch, proof transaction, and mutation transaction.
- Timeout paths roll back and cannot commit after the operator receives a timeout.

### Append-only audit and isolated command context

- Added additive `SpeedLifecycleActivationAudit` persistence.
- Proof IDs are UUIDs, single-use, and phase/generation/scope bound.
- PostgreSQL triggers reject audit `UPDATE`, `DELETE`, and `TRUNCATE`.
- Audit append failure rolls the authority mutation back atomically.
- Human and JSON output is sanitized and excludes provider payloads, tokens, database URLs, user IDs, dictionary answers, and spoilers.
- The argument parser rejects unknown/duplicate/inapplicable flags, secret-shaped input, control characters, credentials, and malformed selectors before Nest starts.
- The CLI runs in an allowlisted Nest application context and asserts that heartbeat, reconciler, matchmaking, gameplay, and HTTP runtime providers are absent.

## Migration safety

- Added `20260719000000_railway_inventory_operator` as an additive migration.
- The migration does not alter or activate the canonical lifecycle authority.
- Existing migration state remains `v1_open`.
- Legacy/null lifecycle rows remain v1; incompatible lifecycle tickets cannot pair.
- No lifecycle-v2 activation was performed.

## Main files changed

- `apps/api/prisma/migrations/20260719000000_railway_inventory_operator/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/gameplay/speed-lifecycle-proof.ts`
- `apps/api/src/gameplay/railway-inventory.adapter.ts`
- `apps/api/src/gameplay/speed-lifecycle-capability.service.ts`
- `apps/api/src/gameplay/speed-lifecycle-operator.service.ts`
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/dictionary/standard-dictionary.service.ts`
- `apps/api/src/health/speed-operational-readiness.service.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/scripts/speed-lifecycle-operator-args.ts`
- `apps/api/scripts/speed-lifecycle-operator.module.ts`
- `apps/api/scripts/speed-lifecycle-operator.ts`
- `apps/api/scripts/run-speed-lifecycle-operator-postgres-integration.mjs`
- `apps/api/test/railway-inventory-adapter.test.ts`
- `apps/api/test/speed-lifecycle-capability-railway.test.ts`
- `apps/api/test/speed-lifecycle-operator-args.test.ts`
- `apps/api/test/speed-lifecycle-operator.test.ts`
- `apps/api/test/speed-lifecycle-operator-postgres.integration.test.ts`
- `apps/api/test/speed-operational-readiness.test.ts`
- `apps/api/package.json`

## Verification evidence

### Ticket 195 focused gate

- API typecheck — exit 0.
- Focused Railway/capability/parser/operator tests — 21/21 passed.
- Tests include:
  - strict provider scope and CLI-version handling;
  - malformed/ambiguous/extra provider state;
  - multi-region cardinality and contradictory count rejection;
  - provider-derived health-host binding;
  - strict pre-startup argument grammar;
  - dry-run zero writes;
  - explicit confirmation and sanitized evidence;
  - stale, extra, duplicate, and wrong-generation leases;
  - bounded provider, database-clock, readiness, fetch, convergence, and mutation work;
  - one shared apply deadline and zero-write timeout behavior.
- Fresh disposable PostgreSQL operator suite — 5/5 passed.
- The real bounded transactional readiness path was exercised against PostgreSQL before substituted-host rejection.
- PostgreSQL cases cover exact additive schema, hostile lease sets, provider identity constraint identity, provider-index/audit tampering and recovery, audit append rollback, creator-lock serialization, immutable audit rows, drain/generation acknowledgement, rollback symmetry, and Standard isolation.
- Every Ticket 195 schema was dropped.

### Canonical regressions

- Full API suite — 184/184 passed.
- Contracts — 24/24 passed.
- Existing lifecycle activation stability gate — 10 iterations, 60/60 passed.
- Existing hostile lifecycle race gate — 10 iterations, 70/70 passed.
- Existing lifecycle schema readiness — 8/8 passed.
- Speed timing PostgreSQL suite — 7/7 passed.
- Speed gameplay PostgreSQL suite — 5/5 passed.
- A first activation attempt encountered a transient local Prisma migration advisory-lock timeout during concurrent local database testing. Its disposable schema was dropped; the isolated canonical rerun passed all 10 iterations.

### Canonical release gate

- Prisma validate — exit 0.
- Prisma generate — exit 0.
- Workspace validation — 9 packages passed.
- Workspace production build — exit 0.
- Production API startup smoke — exit 0; `/readyz` returned `status=ok`, `service=wordle-royale-api`, `env=production`.
- Secret scan — 279 source/config files passed.
- `git diff --check` — exit 0.
- Final local PostgreSQL checks found:
  - zero Ticket 195/184/185/187 disposable schemas;
  - zero PostgreSQL advisory locks.
- Unrelated pre-existing local schemas were not changed.

## Independent review

Final strict read-only architecture/security review: **PASS — Ticket 195 has no remaining release blocker**.

Two earlier review rounds correctly rejected the implementation. Their findings drove concrete fixes for truthful closing-phase reconciler health, readiness-host binding, database-enforced audit immutability, SQL `NULL` identity semantics, CLI schema/version strictness, exact regional count agreement, strict arguments, sanitized evidence, bounded convergence, and end-to-end monotonic timeout propagation. The final reviewer confirmed all findings are closed, mutation/audit remain atomic, timeout paths cannot commit afterward, prior guards remain intact, and the migration remains v1-open.

## Browser / visual checks

Not applicable. Ticket 195 adds backend persistence, local operator tooling, and tests only; no rendered UI or interaction changed.

## Accessibility notes

No accessibility surface changed.

## Risks / follow-ups

- Ticket 195 is complete and unblocks Ticket 196 independent operator QA.
- Ticket 197 remains gated on Ticket 196 PASS.
- Hosted activation remains gated on an approved Ticket 197 merge and separate explicit Ticket 198 activation approval.
- Railway CLI `5.27.1` is the only accepted provider schema until a separately reviewed adapter update expands the allowlist.
- No commit, push, merge, deployment, hosted access/mutation, provider change, or lifecycle activation occurred.
- Local PostgreSQL and Redis remain running for concurrent work; stop later with `pnpm deps:down` when safe.
