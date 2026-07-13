# Ticket 132 — Bounded Standard Queue Reconnect UX

Agent: Luna (web UX implementation)
Wave: R-Fix — Ticket 126 blocker remediation
Status: New

## Blocker

Independent browser QA observed `/play` remain indefinitely in `Checking for an active search…` despite healthy API/readiness and no console exception.

## Requirements

- Reproduce against the real local API/session flow, not only an API double.
- Ensure reconnect always resolves within a bounded period to `idle`, `searching`, `matched`, `signed_out`, or recoverable `error`.
- Ensure timeout/transport/server-action failures clear `aria-busy` and expose retry.
- Preserve cookie/session forwarding and server-authoritative ticket state.
- Add focused client/browser coverage for active no-ticket, queued, matched, unauthenticated, and timeout/error cases.
- Verify matched routing still uses only `matchedMatchId`.
- No hosted deployment.

## Verification

```bash
CI=true pnpm --filter @wordle-royale/web build
CI=true pnpm typecheck
CI=true pnpm secret-scan
git diff --check
```

Response must include real browser evidence and console/network observations.
