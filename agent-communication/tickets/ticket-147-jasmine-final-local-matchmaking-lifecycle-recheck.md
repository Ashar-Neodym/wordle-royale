# Ticket 147 — Final Local Matchmaking Lifecycle Recheck

Agent: Jasmine (QA)
Wave: R-Hosted-Lifecycle-Fix
Status: Blocked on Tickets 144–146

## Task

Independently verify the complete lifecycle/retry repair before Ticket 140.

## Required checks

1. Canonical real-PostgreSQL concurrent cold-profile harness passes at least 10 consecutive fresh-schema runs.
2. Delayed six-second concurrent pairing creates exactly one shared non-self match.
3. Jitter/backoff is bounded, breaks lockstep, and is deterministic under tests.
4. Initial and late-`P2002` recovery phases share one lifecycle deadline and attempt ledger.
5. Exact exhaustion coverage exists for `P2034`, `40001`, and `40P01`.
6. Per-attempt Prisma budgets never exceed remaining lifecycle time.
7. Timeout/retry errors remain sanitized and all partial writes roll back in real PostgreSQL.
8. Web ordering behaviorally proves backend lifecycle < proxy < server action < browser for join/reconnect/current/cancel.
9. Both canonical PostgreSQL harnesses, API/web tests/builds, workspace gates, secret scan, and diff check pass.

Return PASS/WARN/FAIL. Ticket 140 remains blocked unless PASS.
