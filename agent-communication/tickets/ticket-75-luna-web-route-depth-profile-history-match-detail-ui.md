# Ticket 75 — Web Route Depth: Profile, History, and Match Detail UI

Assigned agent: Luna
Priority: High
Wave: K — GitHub checkpoint and product depth
Dependencies: Ticket 73; ideally Ticket 74 for live data, otherwise use clear fallback/placeholder states.
Parallelization: K.2 after route contracts/API shape.
Human action needed: Optional visual review by Ashar.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-tickets-65-71.md`
- `docs/2026-06-30-lichess-style-web-ui-direction.md`
- Ticket 73 response
- Ticket 74 response if available

## Task

Turn the new web routes into more useful product surfaces, especially Profile and History.

## Deliverables

1. Profile page should show rated profile/rating/matches summary when live API data exists.
2. History page should show recent matches or an honest empty state.
3. Add a simple match detail/result view if Ticket 73/74 defines it and backend supports it.
4. Preserve lichess-like human style: compact, game-first, not glossy.
5. Maintain fallback/offline clarity without making fallback dominate.
6. Keep routes responsive and keyboard navigable.

## Recommended verification

```bash
pnpm --filter @wordle-royale/web typecheck
pnpm --filter @wordle-royale/web build
pnpm build
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-75-luna-web-route-depth-profile-history-match-detail-ui-response.md`

Do not answer only in chat. Write the Markdown response file.
