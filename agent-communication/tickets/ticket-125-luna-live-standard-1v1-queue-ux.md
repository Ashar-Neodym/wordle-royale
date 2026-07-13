# Ticket 125 — Live Standard 1v1 Queue UX

Agent: Luna (web UX implementation)
Wave: R — Live Standard 1v1 Matchmaking
Status: New after Ticket 122 contracts; integrate after Ticket 123

## Goal

Replace the `standard_1v1` UI-only/lobby detour with a real chess-style matchmaking experience backed by Ticket 123.

## Scope

- Standard mode `Find match` action.
- Clear states: signed out, joining, searching, elapsed wait, matched, cancelled, timed out, reconnecting, and error.
- Cancel search before pairing.
- Poll/reconnect using the locked API contract; do not fabricate opponents or queue metrics.
- Redirect matched users into the existing live match/gameplay route.
- Keep Speed, Classic, and Multiplayer clearly marked unavailable/prepared.
- Accessible status announcements, disabled-state behavior, and mobile-responsive layout.

## Acceptance criteria

- Auth/session gating is explicit.
- Refresh during search recovers server queue state.
- Matched response routes to the shared server match ID.
- Cancel and error states are honest and recoverable.
- No fake wait time, opponent, rating, or queue population values.
- Existing profile/lobby/gameplay pages continue to build.
- No hosted deployment.

## Verification

```bash
CI=true pnpm --filter @wordle-royale/web build
CI=true pnpm typecheck
CI=true pnpm secret-scan
git diff --check
```
