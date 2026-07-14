# Ticket 141 — Preserve Inner Transaction Expiry Semantics Response

Task: Ticket 141 — Preserve Inner Transaction Expiry Semantics
Agent: Freya (backend implementation)
Status: **Complete; ready for Ticket 143 independent recheck**
Date: 2026-07-13

## Summary

Preserved Prisma interactive-transaction expiry and retryable transaction failures through the inner dictionary-selection and rating-profile creation boundaries. The outer `inTransaction()` boundary remains the sole owner of timeout normalization and bounded serialization/deadlock retries.

A real disposable-PostgreSQL regression now exceeds the configured transaction budget during final dictionary revalidation, after rating-profile, ticket, and audit work has begun. It proves the public response remains sanitized and every write from the expired transaction is rolled back.

No hosted provider, database, environment, schema, or deployment was modified.

## Implemented behavior

- Renamed and reused one shared `isTransactionExpiryError()` classifier for Prisma `P2028`.
- `requireDictionary()` now rethrows:
  - Prisma `P2028` transaction expiry;
  - Prisma `P2034` serialization failure;
  - Prisma `P2010` wrappers carrying PostgreSQL `40001` serialization failure;
  - Prisma `P2010` wrappers carrying PostgreSQL `40P01` deadlock failure.
- `findOrCreateRatingProfile()` now rethrows the same transaction expiry plus the existing retryable errors.
- Genuine dictionary policy/lookup failures still normalize to spoiler-safe `503 dictionary_release_unavailable`.
- Genuine rating-profile preparation failures still normalize to `409 rating_profile_unavailable`.
- `inTransaction()` remains the only boundary that converts `P2028` into:

```json
{
  "code": "matchmaking_transaction_timeout",
  "message": "Matchmaking took too long to complete. Retry the request."
}
```

- Transaction expiry is not retried.
- Serialization/deadlock failures still use three bounded attempts with the same explicit Serializable transaction options.

## Regression coverage

Focused mock-backed coverage now verifies both inner operation boundaries—dictionary selection and rating-profile creation—for:

- `P2028` propagation to the outer timeout normalizer;
- sanitized public `503 matchmaking_transaction_timeout` output;
- no Prisma code, injected SQL/credential wording, or internal error detail in the response;
- no retry for expiry;
- `P2034` propagation into the bounded retry loop;
- raw PostgreSQL `40001` propagation into the bounded retry loop;
- raw PostgreSQL `40P01` propagation into the bounded retry loop;
- identical transaction options on initial and retry attempts.

The preview-dictionary PostgreSQL harness now sets a 6-second transaction timeout and delays final exact-release revalidation for 7 seconds. The delayed second join begins by creating its cold rating profile, ticket, and audit row, then expires. The test proves the response is sanitized and database counts return exactly to the pre-attempt baseline:

```text
ratings=1, tickets=1, matches=0, rounds=0, participants=0, audits=1
```

The retained rows belong only to the already-committed first queued player; none from the expired second join survive.

## Files changed

Ticket 141 scope:

- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/test/matchmaking.test.ts`
- `apps/api/test/preview-dictionary-postgres.integration.test.ts`
- `apps/api/scripts/run-preview-dictionary-postgres-integration.mjs`
- `agent-communication/responses/ticket-141-freya-preserve-inner-transaction-expiry-semantics-response.md`
- `agent-communication/index.md`

Concurrent Ticket 138/142 web and deadline-policy changes remain present in the shared worktree and were not modified as part of Ticket 141.

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  test/matchmaking.test.ts test/matchmaking-transaction-budget.test.ts
exit 0 — 28 passed, 0 failed

CI=true pnpm --filter @wordle-royale/api test:postgres:matchmaking
exit 0 — 1 passed; disposable schema migrated, seeded, tested, and dropped

CI=true pnpm --filter @wordle-royale/api test:postgres:preview-dictionary
exit 0 — 4 passed; includes real over-budget rollback probe; disposable schema migrated, tested, and dropped

CI=true pnpm --filter @wordle-royale/api test
exit 0 — 103 passed, 0 failed/skipped

CI=true pnpm --filter @wordle-royale/api build
exit 0

CI=true pnpm typecheck
exit 0 — workspace scaffold validation passed for 9 packages

CI=true pnpm --filter @wordle-royale/api db:validate
exit 0

CI=true pnpm --filter @wordle-royale/api smoke:prod-start
exit 0 — /readyz returned status=ok

CI=true pnpm secret-scan
exit 0 — 218 source/config files scanned

git diff --check
exit 0
```

The normal API suite reports the environment-gated PostgreSQL test files as skipped internally; both were run and passed through their dedicated disposable-schema harness commands above.

## Review

An independent focused review found no Ticket 141 blockers or actionable nits. It confirmed:

- both inner catches preserve expiry and retryable failures;
- outer normalization remains singular and sanitized;
- unit/API tests cover both operation boundaries and all required failure classes;
- the PostgreSQL regression demonstrates post-write expiry rollback;
- Ticket 138/142 shared-worktree edits were not treated as Ticket 141 scope.

## Browser/visual checks

Not applicable. Ticket 141 changes backend transaction semantics and database integration coverage only; no UI or layout changed in this ticket.

## Accessibility notes

No UI changes.

## Risks and follow-ups

- Ticket 142 owns the independent cross-layer browser/proxy/server-action deadline ordering fix in the shared worktree.
- Ticket 143 should rerun focused timeout-contract QA after both Tickets 141 and 142 are complete.
- The real rollback probe uses `pg_sleep(7)` against a deliberately bounded 6-second transaction in an isolated disposable schema; this adds approximately seven seconds to the preview-dictionary PostgreSQL harness by design.
- Hosted Supabase/pooler behavior remains intentionally untouched and must be rechecked only through the approved hosted workflow after Ticket 143 passes.
