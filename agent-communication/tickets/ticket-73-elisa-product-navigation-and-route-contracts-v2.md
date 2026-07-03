# Ticket 73 — Product Navigation and Route Contracts v2

Assigned agent: Elisa
Priority: High
Wave: K — GitHub checkpoint and product depth
Dependencies: Tickets 66–68, Wave J review
Parallelization: K.0 parallel with Ticket 72.
Human action needed: Optional product feedback from Ashar if needed.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-tickets-65-71.md`
- `docs/2026-06-30-multi-page-information-architecture.md`
- `docs/2026-06-30-lichess-style-web-ui-direction.md`

The app now has pages/dropdowns, but the product should continue toward a lichess-like structure with real depth, not empty route decoration.

## Task

Refine the product/navigation route contracts for the next implementation wave.

## Deliverables

1. Define which routes should become real next: Profile, History, Leaderboard details, Lobby detail, Match detail, Learn/Rules, Settings.
2. Specify minimal data requirements and API needs per route.
3. Define placeholder policy: which pages can remain honest placeholders and which should now show real data.
4. Include mobile navigation implications.
5. Keep scope MVP-friendly and compatible with current backend.
6. Write/update a concise docs file if needed.

## Recommended verification

Planning/spec ticket. Run build/tests only if source files are changed.

## Response path

`agent-communication/responses/ticket-73-elisa-product-navigation-and-route-contracts-v2-response.md`

Do not answer only in chat. Write the Markdown response file.
