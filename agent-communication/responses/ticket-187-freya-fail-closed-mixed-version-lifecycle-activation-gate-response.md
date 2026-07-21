# Ticket 187 — Fail-Closed Mixed-Version Lifecycle Activation Gate

Task: Ticket 187 — Fail-Closed Mixed-Version Lifecycle Activation Gate
Agent: Freya (backend implementation / reliability)
Status: Complete — implementation, ten-schema mixed-version stability gate, canonical regression gate, and independent blocker review PASS

## Scope delivered

- Added one canonical PostgreSQL activation authority row for `speed_1v1`, seeded safely as lifecycle v1 open. The migration does not activate v2 and does not rewrite legacy null lifecycle identities.
- Added renewable process capability leases with release, protocol, supported lifecycle, build compatibility, expiry, and observed activation-generation identity.
- Added mandatory trusted provider-inventory verification before any lifecycle transition. With no verifier bound, transition execution fails closed.
- Added generation-fenced, monotonic, database-guarded transitions for `v1_open`, `closing_to_v2`, `v2_open`, and `closing_to_v1`.
- Required exact fresh fleet cardinality and exact capability agreement across every fresh lease; extra, malformed, stale-generation, wrong-release, wrong-protocol, or incompatible leases block transitions.
- Added shared-authority `FOR SHARE` locking inside the same serializable matchmaking transaction that creates or pairs Speed tickets, while transitions take `FOR UPDATE` and wait for guarded creators.
- Pinned new Speed tickets and matches to the authority-selected lifecycle and activation generation. Legacy/null ticket lifecycle remains equivalent to v1.
- Prevented pairing across incompatible lifecycle identities and made retries reacquire shared authority.
- Preserved Standard matchmaking independently of Speed activation state and database guards.
- Split core persisted-gameplay dependencies from creation/activation availability. Closing, missing, or activation-only schema failure closes new Speed creation but does not hide or block valid reads, snapshots, mutations, or reconciliation for persisted matches.
- Exposed truthful configured, queue-enabled, lifecycle-version, phase, and sanitized closure state through readiness and ranked-mode catalog contracts without leaking process/fleet details.
- Kept activation-only schema failure nonblocking for global `/readyz` and Standard while exposing Speed activation as unavailable.
- Added active-schema-only readiness validation for exact activation/lease columns, nullability, timestamp precision, defaults, constraints, function-body digests, trigger timing/events/functions, canonical authority row, and exact lease-index structure.
- Added hostile tamper tests for function replacement, trigger-event changes, constraint replacement, and a correct-name/wrong-column index.

## Principal files changed

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260718000000_speed_lifecycle_activation_gate/migration.sql`
- `apps/api/src/app.module.ts`
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/gameplay/speed-lifecycle-activation.constants.ts`
- `apps/api/src/gameplay/speed-lifecycle-activation.types.ts`
- `apps/api/src/gameplay/speed-lifecycle-activation.service.ts`
- `apps/api/src/gameplay/speed-lifecycle-capability.service.ts`
- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/src/health/speed-operational-readiness.service.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/leaderboard/leaderboard-read.service.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `apps/api/test/speed-lifecycle-activation.test.ts`
- `apps/api/test/speed-lifecycle-activation-postgres.integration.test.ts`
- `apps/api/test/speed-operational-paths.test.ts`
- `apps/api/test/speed-operational-readiness.test.ts`
- `apps/api/test/speed-gameplay-postgres.integration.test.ts`
- `apps/api/test/speed-timing-postgres.integration.test.ts`
- `apps/api/test/speed-lifecycle-races-postgres.integration.test.ts`
- `apps/api/scripts/run-speed-lifecycle-activation-postgres-integration.mjs`
- `apps/api/package.json`
- `packages/contracts/src/matchmaking/speed-contracts.test.ts`
- `agent-communication/responses/ticket-187-freya-fail-closed-mixed-version-lifecycle-activation-gate-response.md`
- `agent-communication/index.md`

## Deterministic Ticket 187 PostgreSQL proof

- `SPEED_ACTIVATION_ITERATIONS=10 pnpm --filter @wordle-royale/api test:postgres:speed-lifecycle-activation` — exit 0.
- 10/10 uniquely attributed fresh schemas passed.
- 6/6 cases per schema; 60/60 total.
- Coverage includes v1 compatibility, v2 rejection before activation, Standard isolation, a real transaction-lock barrier, all creation paths closed during transitions, stale/undrained rejection, mandatory provider proof, exact capability/cardinality checks, v2 activation, drain-first rollback, v1 reopen, missing authority, and structural tamper detection.
- Every final stability schema was dropped after its iteration.
- One older schema from an interrupted pre-final helper was identified by the `ticket187_*` prefix and explicitly dropped.
- Final residue check: zero Ticket 187 schemas and zero Ticket 187 database sessions.

## Canonical verification evidence

- Prisma generate — exit 0.
- Prisma validate — exit 0.
- API typecheck — exit 0.
- API unit/integration-mock suite — 162/162 passed.
- Contracts — 24/24 passed.
- Ticket 184 schema-readiness PostgreSQL — 8/8 passed.
- Ticket 177 Speed timing PostgreSQL — 7/7 passed.
- Ticket 158 Speed gameplay PostgreSQL — 5/5 passed.
- Ticket 185 hostile lifecycle race stability — 10 schemas × 7 cases = 70/70 passed.
- Standard matchmaking PostgreSQL — 3/3 passed.
- Dictionary/readiness PostgreSQL — 4/4 passed.
- Workspace validation — 9 packages passed.
- Workspace production build — passed.
- Production API start and `/readyz` smoke — `status=ok`.
- Secret scan — 267 source/config files passed.
- `git diff --check` — exit 0.

The initial direct Standard and dictionary commands lacked their explicit disposable database URL and did not create schemas. Corrected credential-safe launcher runs passed. Several diagnostic residue/introspection commands used a literal redaction placeholder and failed authentication before database access; corrected credential-safe checks were used for final evidence. Connection details remain `[REDACTED]`.

## Independent review

Final strict read-only review: **PASS — no release blockers**.

The reviewer independently checked the Ticket 187 contract, additive migration, exact capability and generation checks, mandatory provider proof, transaction-locked creation authority, v1/null compatibility, v2 and rollback transitions, readiness/catalog isolation, persisted snapshot availability during activation closure, semantic schema tamper checks, and cleanup discipline. Independent verification observed API 162/162, contracts 24/24, Ticket 187 60/60, typecheck/build, and secret scan passing.

## Browser / visual checks

Not applicable. Ticket 187 changes API, database, readiness, and catalog behavior without changing rendered UI or client interactions.

## Accessibility notes

No accessibility surface changed.

## Risks / follow-ups

- Ticket 187 is complete and no longer blocks Ticket 188.
- Ticket 188 remains blocked only on Ticket 183 according to the current index.
- Migration deployment alone remains v1-open and does not activate v2.
- No provider verifier is bound by this ticket; transition execution therefore remains fail-closed until a separately approved, auditable provider-inventory integration is supplied.
- No commit, push, merge, deployment, hosted infrastructure/database access, hosted mutation, provider change, or lifecycle-v2 activation occurred.
- Local PostgreSQL and Redis remain running for concurrent work; stop later with `pnpm deps:down` when safe.
