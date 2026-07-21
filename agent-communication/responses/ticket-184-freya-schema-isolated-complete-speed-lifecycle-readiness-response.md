# Ticket 184 — Schema-Isolated Complete Speed Lifecycle Readiness

Task: Ticket 184 — Schema-Isolated Complete Speed Lifecycle Readiness
Agent: Freya (frontend / reliability)
Status: Complete — implementation, disposable PostgreSQL mutation matrix, canonical local verification, and independent review PASS

## Outcome

Speed readiness now fails closed against the complete lifecycle-v2 database contract in the active PostgreSQL schema rather than accepting partial or cross-schema lookalikes.

Implemented:

- Added `MatchMutationRequest` to mandatory application-schema tables.
- Replaced global enum-label counting with exact active-schema enum identity, complete label-set, and catalog-order validation for `SpeedCompletionReason` and `MatchMutationKind`.
- Validated exact readiness-critical columns across `Match` and `MatchMutationRequest`, including type namespace, nullability, and millisecond timestamp precision.
- Validated exactly one participant-scoped mutation idempotency uniqueness shape: `participantId`, `kind`, `clientRequestId`.
- Validated mutation uniqueness and due indexes structurally rather than by name alone: active schema/table, validity/readiness, uniqueness/partiality, B-tree access method, key count/order, default ordering options, canonical `pg_catalog` operator classes, exact collations, and non-expression keys.
- Validated both lifecycle-v2 due indexes with complete, exact, order-independent predicate-conjunct sets.
- Kept equivalent objects in another schema from satisfying or invalidating the active schema.
- Sanitized database, application-schema, and Speed lifecycle-schema dependency failures so SQL, provider, schema, connection, and credential details are not returned publicly.
- Preserved Speed-disabled/Standard readiness independence and the stable public Speed unavailable contract.

## Files changed

- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/test/speed-operational-readiness.test.ts`
- `apps/api/test/prisma-readiness-sanitization.test.ts`
- `apps/api/test/speed-schema-readiness-postgres.integration.test.ts`
- `apps/api/scripts/run-speed-schema-readiness-postgres-integration.mjs`
- `apps/api/package.json`
- `agent-communication/responses/ticket-184-freya-schema-isolated-complete-speed-lifecycle-readiness-response.md`
- `agent-communication/index.md`

## PostgreSQL regression coverage

The new runner creates independently migrated canonical and decoy schemas, runs the matrix only against the canonical schema, and drops both schemas in `finally` cleanup.

Coverage proves:

- canonical readiness passes despite equivalent complete objects in another schema;
- every mandatory application table independently fails when absent;
- every readiness-critical lifecycle/mutation column independently fails when absent;
- wrong types, enum namespaces/labels/order, nullability, and timestamp precision fail closed;
- missing, reordered, partial, wrong-ordering, wrong-opclass, same-name wrong-schema opclass, and wrong-collation idempotency uniqueness fail closed;
- missing, reversed-key, descending, wrong-collation, non-B-tree, incomplete-predicate, extra-predicate, and wrong-phase due indexes fail closed;
- logically equivalent complete predicates pass when their top-level `AND` conjuncts are reordered;
- restored canonical shapes return readiness to `ok`;
- sanitized dependency messages never include injected SQL/provider/connection detail.

## Commands run and results

- Prisma client generation: exit 0.
- Prisma schema validation: exit 0.
- API typecheck: exit 0.
- Web typecheck: exit 0.
- Focused Ticket 184 and Speed operational tests: 6/6 passed.
- Contracts: 24/24 passed.
- Full API suite: 156/156 passed; opt-in PostgreSQL files skipped in the generic run as designed.
- Ticket 184 canonical + decoy PostgreSQL mutation matrix: 8/8 passed; both disposable schemas dropped.
- Ticket 177 deterministic Speed timing PostgreSQL: 7/7 passed; schema dropped.
- Ticket 158 Speed gameplay PostgreSQL: 5/5 passed; schema dropped.
- Standard matchmaking PostgreSQL: 3/3 passed; schema dropped.
- Preview dictionary/readiness PostgreSQL: 4/4 passed; schema dropped.
- Workspace validation: 9 packages passed.
- Workspace production build: exit 0.
- Production API start and `/readyz` smoke: `status=ok`, exit 0.
- Secret scan: 258 source/config files passed.
- Final disposable-schema residue query: no Ticket 130/135/158/177/184 schemas found.
- `git diff --check`: exit 0.

Two initial Standard/dictionary harness invocations used a literal redaction placeholder and failed authentication before creating schemas. The URL was then assembled from repository-local non-secret components without exposing credentials; both fresh-schema reruns passed and cleaned up. An earlier invalid multicolumn hash-index test mutation failed during test setup because PostgreSQL does not support that index shape; it was replaced by a valid noncanonical BRIN mutation, and the complete suite passed.

## Independent review

Independent review found and drove fixes for:

- B-tree/access-order/operator-class validation;
- exact enum catalog order;
- raw provider-error sanitization;
- canonical operator-class namespace identity;
- order-independent exact due-predicate comparison;
- exact index collation identity.

Final strict blocker review: **PASS** with no remaining Ticket 184 blocker.

## Browser / visual checks

Not applicable. Ticket 184 changes readiness/catalog behavior and tests only; no rendered UI changed.

## Accessibility notes

No labels, focus order, keyboard behavior, contrast, announcements, or other accessibility behavior changed.

## Risks / follow-ups

- Ticket 185 remains independently ready and is not completed by this ticket.
- Ticket 188 remains blocked on the remaining Tickets 183–187 per the Wave U-Fix dependency plan.
- Local PostgreSQL and Redis remain running for concurrent work; later cleanup is `pnpm deps:down`.
- No commit, push, merge, deployment, hosted mutation, feature activation, provider change, or hosted database access occurred.
- Connection details are represented as `[REDACTED]`.
