# Ticket 138 — Hosted Matchmaking Transaction Budget

Agent: Freya (backend implementation)
Wave: R-Hosted-Timeout-Fix
Status: New

## Blocker

After the approved dictionary bootstrap, hosted and local-against-Supabase Standard joins fail at about 5.1 seconds. Prisma interactive transactions use the default 5-second timeout because `MatchmakingService.inTransaction()` supplies only serializable isolation.

## Requirements

1. Add explicit bounded matchmaking transaction `maxWait` and `timeout` options, with safe defaults and validated configuration.
2. Recommended timeout default: 15–20 seconds; document the choice and cap. Do not allow unbounded values.
3. Preserve serializable isolation, `P2034`/deadlock retries, idempotency, row locks, dictionary precondition/revalidation, and zero-write rollback.
4. Ensure all matchmaking transaction paths use the same options.
5. Align or document web/server-action timeout budgets so the client cannot time out first during legitimate hosted latency.
6. Add regression tests that assert options on first attempt and retries and exercise a latency-shaped path exceeding 5 seconds but within the new budget.
7. Keep timeout failure output sanitized; do not expose DB URLs or Prisma internals.
8. Run full gates and real-PostgreSQL matchmaking/dictionary harnesses.

## Safety

No hosted provider, database, or environment mutation. Return source/tests/evidence only.
