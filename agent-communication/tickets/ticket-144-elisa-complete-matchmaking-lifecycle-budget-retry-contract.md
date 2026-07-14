# Ticket 144 — Complete Matchmaking Lifecycle Budget and Retry Contract

Agent: Elisa (architecture)
Wave: R-Hosted-Lifecycle-Fix
Status: New

## Goal

Lock one complete request-lifecycle contract that covers initial serializable attempts, serialization/deadlock backoff, late `P2002` active-ticket recovery, API proxy, server action, and browser deadline.

## Required decisions

1. Define one monotonic end-to-end backend lifecycle deadline; recovery must consume the same remaining budget rather than start a fresh full loop.
2. Define a bounded retry-attempt policy shared across initial and uniqueness-recovery phases.
3. Replace synchronized fixed 10/20ms backoff with deterministic-testable jittered/exponential or decorrelated backoff that breaks concurrent lockstep while remaining bounded.
4. Define how per-attempt Prisma `maxWait` and `timeout` are clamped to remaining lifecycle budget.
5. Define public errors for lifecycle exhaustion, transaction expiry, and retry exhaustion.
6. Keep serializable isolation, row locks, idempotency, exact dictionary revalidation, rollback, and spoiler safety.
7. Provide complete worst-case arithmetic and required API/server/browser margins.
8. Define behaviorally tied tests; whole-file regex presence alone is not sufficient.

No code, provider, or hosted mutation.
