# Ticket 59 — Dev Multi-User Ranked Smoke Without DB Edits

Assigned agent: Freya
Priority: Critical
Wave: I — Demo-stable ranked loop
Dependencies: Tickets 52, 55, 57
Parallelization: I.0/I.1; can start after reading 57, coordinate with Yuna 58.
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-51-57.md`
- `agent-communication/responses/ticket-52-match-completion-result-and-rating-finalization-endpoints-response.md`
- `agent-communication/responses/ticket-57-qa-review-wave-h-lichess-style-ranked-loop-response.md`

## Task

Remove the need for direct DB edits in local ranked E2E smoke.

Deliverables:

1. Add a safe local/dev-only way to act as at least two fixture users during ranked smoke, or add an admin/test helper endpoint guarded to local/dev.
2. Use it to exercise: create lobby → join as second user → start match → submit/terminalize both participants → complete match → fetch result/leaderboard.
3. Preserve production safety: helper must be disabled or rejected outside local/dev.
4. Add API tests for guard behavior and the multi-user/dev-helper flow.
5. Document exact smoke commands.

## Recommended verification

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api db:validate
pnpm deps:check
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-59-freya-dev-multi-user-ranked-smoke-without-db-edits-response.md`

Do not answer only in chat. Write the Markdown response file.
