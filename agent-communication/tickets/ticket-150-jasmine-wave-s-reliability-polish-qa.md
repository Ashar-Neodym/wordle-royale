# Ticket 150 — Wave S Reliability Polish Independent QA

Agent: Jasmine (QA)
Wave: S — Hosted Reliability Polish
Status: Blocked on Tickets 148–149

## Required checks

1. Delayed idempotent hosted-shaped reads recover within the new bounded policy.
2. Exhausted reads render truthful fallback plus a usable retry action.
3. Mutations are never automatically duplicated/retried.
4. Matchmaking 90/95/100/110-second lifecycle policy remains unchanged.
5. Profile, leaderboard, and `/play` remain accurate under success/failure/retry.
6. Production build serves favicon with non-404 status and correct content type.
7. Metadata is accurate and spoiler/secret safe.
8. Browser console has no new errors.
9. Canonical web/workspace gates, build, secret scan, and diff check pass.

Return PASS/WARN/FAIL. Ticket 151 remains blocked unless PASS.
