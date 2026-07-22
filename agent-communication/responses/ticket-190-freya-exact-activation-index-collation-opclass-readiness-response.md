# Ticket 190 — Exact Activation Index Collation and Opclass Readiness

Task: Ticket 190 — Exact Activation Index Collation and Opclass Readiness
Agent: Freya (backend implementation / reliability)
Status: Complete — implementation, fresh-schema stability gate, canonical verification, and independent review PASS

## Scope delivered

- Hardened activation lease-index readiness for both canonical indexes:
  - `SpeedLifecycleCapabilityLease_releaseId_expiresAt_idx`
  - `SpeedLifecycleCapabilityLease_controlProtocol_expiresAt_idx`
- Kept the existing exact checks for active schema, canonical name/table, B-tree access method, key order, ordering options, arity, no included/expression keys, non-unique/non-primary identity, valid/ready state, and no partial predicate.
- Added exact qualified operator-class identity for every key:
  - `pg_catalog.text_ops`
  - `pg_catalog.timestamp_ops`
- Added exact qualified per-key collation identity:
  - text keys: `pg_catalog.default`
  - timestamp keys: explicit `<noncollatable>` representation for OID zero
- Added current-schema singularity checks for both canonical key shapes so a differently named duplicate cannot coexist while readiness remains healthy.
- Preserved active-schema isolation: wrong-schema lookalikes cannot satisfy or invalidate a correct current-schema canonical shape.
- Preserved stable sanitized fail-closed readiness output and Speed/Standard isolation.

## Official tamper matrix

The Ticket 187 fresh-schema activation suite now independently proves `unavailable` for:

- wrong `C` collation on `releaseId`;
- wrong `C` collation on `controlProtocol`;
- wrong `text_pattern_ops` operator class;
- reversed key order;
- expression key (`lower(releaseId)`);
- BRIN instead of B-tree;
- unique instead of non-unique;
- partial predicate;
- `indisvalid=false`;
- `indisready=false`;
- an exact differently named current-schema duplicate while the canonical index remains present;
- a correct-name wrong-schema lookalike while the active-schema canonical index is absent.

After every mutation, the exact migration-defined index is restored and readiness must recover to `ok`.

## Files changed

- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/test/speed-lifecycle-activation-postgres.integration.test.ts`
- `agent-communication/responses/ticket-190-freya-exact-activation-index-collation-opclass-readiness-response.md`
- `agent-communication/index.md`

## Verification evidence

### Focused and stability PostgreSQL gates

- One focused fresh-schema activation run — 6/6 passed.
- `SPEED_ACTIVATION_ITERATIONS=10 pnpm --filter @wordle-royale/api test:postgres:speed-lifecycle-activation` — exit 0.
- 10/10 uniquely attributed fresh schemas passed; 6/6 cases each; 60/60 total.
- Ticket 184 canonical+decoy schema-readiness PostgreSQL suite — 8/8 passed.
- Every runner schema and in-test decoy schema was dropped.
- Final residue: zero Ticket 187/184 related schemas and zero related sessions.

### Canonical release gates

- Prisma generate — exit 0.
- Prisma validate — exit 0.
- API typecheck — exit 0.
- Full API suite — 162/162 passed.
- Contracts — 24/24 passed.
- Workspace validation — 9 packages passed.
- Workspace production build — passed.
- Production API start and `/readyz` smoke — `status=ok`.
- Secret scan — 267 source/config files passed.
- `git diff --check` — exit 0.

The first final residue helper accidentally used a literal redaction placeholder and failed authentication before querying or mutating the database. It was replaced with a credential-safe URL-object helper; the corrected check returned zero schemas and zero sessions. Connection details remain `[REDACTED]`.

## Independent review

Final strict read-only review: **PASS — no remaining Ticket 190 release blockers**.

An earlier review correctly found that the initial “duplicate” test removed the canonical index first. The implementation was strengthened with exact current-schema shape singularity, and the test now keeps the canonical index while adding an exact differently named duplicate. The corrected fresh-schema matrix and typecheck passed before final re-review.

The final reviewer confirmed exact qualified opclasses/collations for both indexes, duplicate rejection, active-schema isolation, all required mutations, restoration recovery, and sanitized failure behavior. The reviewer independently observed activation 6/6, schema readiness 8/8, sanitization 1/1, typecheck, Prisma validation, and diff hygiene passing.

## Browser / visual checks

Not applicable. Ticket 190 changes PostgreSQL readiness validation and integration tests only; no rendered UI or interaction changed.

## Accessibility notes

No accessibility surface changed.

## Risks / follow-ups

- Ticket 190 is complete and no longer blocks Ticket 191.
- Ticket 191 remains blocked only on Ticket 189 according to the current index.
- No migration shape, runtime activation semantics, gameplay behavior, or API contract changed.
- No commit, push, merge, deployment, hosted access/mutation, provider change, or lifecycle activation occurred.
- Local PostgreSQL and Redis remain running for concurrent work; stop later with `pnpm deps:down` when safe.
