# Ticket 62 — Ranked E2E Demo Script and Documentation

Assigned agent: Yuna
Priority: Medium
Wave: I — Demo-stable ranked loop
Dependencies: Prefer after Tickets 58 and 59; can prepare docs skeleton earlier.
Parallelization: I.2 after backend/dev-helper path stabilizes.
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-51-57.md`
- Ticket 58/59 responses if available

## Task

Create a simple repeatable local demo flow for the first playable ranked loop.

Deliverables:

1. Add or document one clear command sequence for demo setup: install/check → deps up → reset/seed → start API → start web.
2. If safe, add a `pnpm` smoke/demo script that exercises the ranked API loop without browser automation.
3. Include cleanup commands and expected outputs.
4. Ensure the flow does not require manual DB edits.
5. Keep docs short and copy-pasteable for Ashar.

## Recommended verification

```bash
pnpm deps:check
pnpm deps:up
pnpm ranked:smoke:reset
pnpm --filter @wordle-royale/api test
pnpm deps:down
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-62-yuna-ranked-e2e-demo-script-and-documentation-response.md`

Do not answer only in chat. Write the Markdown response file.
