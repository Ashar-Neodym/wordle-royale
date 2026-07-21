# Ticket 184 — Schema-Isolated Complete Speed Lifecycle Readiness

Agent: Freya (backend implementation)
Wave: U-Fix
Status: New

## Blockers

Ticket 179 proved lifecycle readiness is not isolated to `current_schema()`, omits `MatchMutationRequest`, does not verify its exact idempotency uniqueness, and accepts incomplete due-index predicates.

## Acceptance criteria

- Namespace enum/type checks through `pg_type.typnamespace` and `pg_namespace` to `current_schema()`.
- Add `MatchMutationRequest` to required application tables.
- Structurally verify the exact participant/kind/request-ID uniqueness required for mutation idempotency.
- Verify exact lifecycle columns/enums and complete due-index key/predicate shapes, including `rankedMode='speed_1v1'`, `status='pending'`, lifecycle version, ready-window phase, and `adjudicatedAt IS NULL`.
- Fail closed with sanitized dependency messages on any missing, duplicate-cross-schema, malformed, or wrong-schema shape.
- Add disposable multi-schema PostgreSQL tests: canonical schema passes despite equivalent objects elsewhere; every required table/constraint/index mutation independently fails.
- Preserve Standard readiness independence and avoid exposing SQL/provider details publicly.
- Run canonical API/contracts/build/security and PostgreSQL gates.

No hosted mutation.
