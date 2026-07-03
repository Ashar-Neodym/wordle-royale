# Ticket 61 — Lichess-Style Web Polish and Remove Live Fixture Noise

Assigned agent: Luna
Priority: High
Wave: I — Demo-stable ranked loop
Dependencies: Ticket 51, Ticket 54, Ticket 57 warning
Parallelization: I.1; should run after or alongside backend smoke stabilization, but can start visual cleanup immediately.
Human action needed: Optional. Ashar should visually review the updated UI if available.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-51-57.md`
- `docs/2026-06-30-lichess-style-web-ui-direction.md`
- `agent-communication/responses/ticket-54-web-ranked-guess-result-and-leaderboard-ui-lichess-style-response.md`
- `agent-communication/responses/ticket-57-qa-review-wave-h-lichess-style-ranked-loop-response.md`

## Task

Polish the web UI for a cleaner lichess-like first demo and remove confusing fixture/demo noise from live match view.

Deliverables:

1. When a live ranked match is present, do not show the old fixture/demo board below it unless clearly tucked away as practice/demo.
2. Keep the main experience board-first, calm, minimal, human, and game-site-like.
3. Improve completed-match result/leaderboard placement so a user can understand the outcome quickly.
4. Keep API-off fallback clear but not visually dominant.
5. If possible, provide screenshots or a precise visual smoke description for Ashar.

## Recommended verification

```bash
pnpm --filter @wordle-royale/web typecheck
pnpm --filter @wordle-royale/web build
pnpm build
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-61-luna-lichess-style-web-polish-and-remove-live-fixture-noise-response.md`

Do not answer only in chat. Write the Markdown response file.
