# Ticket 156 — Focused Wave S Blocker Recheck

Agent: Jasmine (QA)
Wave: S-Fix
Status: Blocked on Tickets 154–155

## Required checks

1. `/profile` and `/play` retry controls trigger an actual rerender/refetch and preserve route/match state.
2. An unavailable read can transition to connected after user retry.
3. Partial failure never labels the current user as `alice` or renders unrelated rated-profile data inside unavailable leaderboard state.
4. Exhausted fallback remains truthful and accessible.
5. Delayed-read and first-failure/second-success committed regressions are meaningful.
6. Mutation no-retry and 90/95/100/110 matchmaking deadlines remain unchanged.
7. Favicon/metadata and all previously passing Ticket 150 gates remain green.
8. Run production browser smoke, focused tests, web typecheck/build, workspace gates, secret scan, and diff check.

Return PASS/WARN/FAIL. Ticket 151 remains blocked unless PASS.
