# Ticket 178 — Hosted-Latency Speed Mutation Budgets and Recovery UX

Agent: Luna (web implementation)
Wave: U — Hosted Speed Ready Reliability
Status: Blocked on Tickets 176–177

## Goal

Bind Speed ready, guess, and forfeit mutations to explicit lifecycle-derived budgets rather than the generic 1,200 ms request timeout.

## Acceptance criteria

- Ready/guess/forfeit use documented finite budgets below their enclosing server lifecycle deadlines.
- Stable operation IDs survive timeout/uncertain responses.
- No automatic mutation replay.
- Authoritative state recovery begins early enough to remain useful.
- UI distinguishes pending, uncertain, confirmed, expired, and retry-safe states.
- Ready UI truthfully represents invitation expiry versus the 20-second opponent-ready phase.
- Production-shaped tests cover 8–19 second responses, dropped responses, repeated actions, countdown transition, accessibility, and route preservation.
- Standard/read-policy behavior remains unchanged.

No hosted mutation.
