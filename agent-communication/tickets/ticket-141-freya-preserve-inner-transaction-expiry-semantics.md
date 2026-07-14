# Ticket 141 — Preserve Inner Transaction Expiry Semantics

Agent: Freya (backend implementation)
Wave: R-Hosted-Timeout-Recheck
Status: New

## Blocker

Ticket 139 proved that Prisma `P2028` raised by dictionary selection is converted to `dictionary_release_unavailable`, and `P2028` raised by rating-profile creation is converted to `rating_profile_unavailable`. `inTransaction()` therefore cannot normalize the expiry to recoverable `matchmaking_transaction_timeout`.

## Requirements

1. Add one shared transaction-expiry classifier for Prisma `P2028`.
2. In `requireDictionary()`, rethrow transaction-expiry and retryable transaction errors; normalize only genuine dictionary lookup/policy failures.
3. In `findOrCreateRatingProfile()`, rethrow transaction expiry as well as existing retryable errors.
4. Keep outer `inTransaction()` as the sole timeout-normalization owner.
5. Add focused tests for inner dictionary/profile `P2028`, `P2034`, and raw PostgreSQL retry errors.
6. Prove public expiry response is `503 matchmaking_transaction_timeout` with no Prisma/SQL/credential detail.
7. Add a real-PostgreSQL over-budget rollback probe if practical; otherwise document the exact limitation for Ticket 143.
8. Run full API tests, builds, both PostgreSQL harnesses, secret scan, and diff check.

No hosted/provider mutation.
