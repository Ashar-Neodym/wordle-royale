# Ticket 154 — Real Server-Read Retry Controls

Agent: Luna (web implementation)
Wave: S-Fix
Status: New

## Blocker

Ticket 150 proved `/profile#leaderboard` and `/play?...#leaderboard` are same-document fragment links; clicking them does not rerun failed server reads.

## Requirements

1. Replace fallback retry anchors with a client control that causes a real server-component refresh/refetch (`router.refresh()` or an equivalently proven mechanism).
2. Preserve current route state, especially `/play?matchId=...`.
3. Provide disabled/busy/accessibility behavior while retry is being requested.
4. Add a behavioral component/browser test proving click causes a new read and unavailable → connected transition.
5. Correct or rename the accelerated 1.5-second test; include real or virtual elapsed-time evidence crossing the old 1.2-second boundary and first-failure/second-success coverage.
6. Preserve mutation no-retry and matchmaking deadline contracts.
7. Run focused tests, web typecheck/build, secret scan, and diff check.

No provider/hosted mutation.
