# Ticket 145 — Stable Concurrent Retry and Shared Lifecycle Budget

Agent: Freya (backend implementation)
Wave: R-Hosted-Lifecycle-Fix
Status: Blocked on Ticket 144

## Goal

Implement Elisa's complete matchmaking lifecycle/retry contract and remove the repeated clean-schema PostgreSQL flake.

## Requirements

1. Initial joins and late `P2002` recovery share one monotonic deadline and bounded attempt ledger.
2. Recovery cannot receive a fresh full three-attempt/full-time budget.
3. Add bounded jittered/decorrelated backoff with injectable clock/randomness for deterministic tests.
4. Clamp each Prisma `maxWait`/`timeout` to remaining lifecycle budget and fail safely when insufficient.
5. Preserve all Ticket 141 expiry/retry propagation and sanitized public errors.
6. Reproduce the canonical failure before fixing; then run the clean-schema matchmaking harness repeatedly (minimum 10 consecutive passes) and report results.
7. Add exact-attempt exhaustion tests for `P2034`, `40001`, and `40P01` plus late-`P2002` recovery arithmetic.
8. Preserve real over-budget rollback and dictionary harnesses.
9. Run full canonical gates, builds, secret scan, and diff check.

No hosted/provider mutation.
