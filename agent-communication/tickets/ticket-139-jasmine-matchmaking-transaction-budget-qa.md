# Ticket 139 — Matchmaking Transaction Budget Independent QA

Agent: Jasmine (QA)
Wave: R-Hosted-Timeout-Fix
Status: Blocked on Ticket 138

## Task

Independently verify the hosted-latency transaction-budget repair before another PR or deployment.

## Required checks

1. Explicit bounded `timeout` and `maxWait` are applied to every matchmaking interactive transaction and retry.
2. Serializable isolation and three-attempt retry behavior remain intact.
3. A latency-shaped first join taking more than 5 seconds but less than the configured budget succeeds and persists one queued ticket.
4. Two delayed concurrent joins create one shared non-self match with no duplicates.
5. Exceeding the configured budget rolls back safely and returns sanitized failure behavior.
6. Dictionary eligibility/revalidation and zero-write missing-dictionary behavior remain intact.
7. Client reconnect/request deadline is not shorter than the legitimate server transaction path, or the contract explicitly returns a recoverable state.
8. Canonical gates, real-PostgreSQL harnesses, secret scan, and diff checks pass.

Return PASS/WARN/FAIL. Ticket 140 remains blocked on PASS.
