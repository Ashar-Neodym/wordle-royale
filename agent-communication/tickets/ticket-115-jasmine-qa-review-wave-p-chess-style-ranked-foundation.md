# Ticket 115 — QA Review Wave P Chess-Style Ranked Foundation

Agent: Jasmine (QA)
Wave: P — Chess-style ranked Wordle foundation
Status: New after Tickets 110–114

## Task

Independently review Wave P outputs for product consistency, safety, and hosted preview stability.

## Scope

- Verify chess-style ranked direction is reflected accurately: separate mode ratings, matchmaking queues, ranked/unranked lobbies, profile stats.
- Verify no UI claims live matchmaking/rating features before backend support exists.
- Verify hosted preview still passes:
  - web root 200
  - API `/healthz`
  - API `/readyz`
  - preview demo start
  - lobbies/leaderboard/profile pages
- Verify migrations/readiness follow-up is handled or explicitly tracked.
- Identify blockers vs warnings.

## Verification commands

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
CI=true pnpm smoke:local
CI=true pnpm secret-scan
git diff --check
```

## Output

Write response to:

`agent-communication/responses/ticket-115-jasmine-qa-review-wave-p-chess-style-ranked-foundation-response.md`
