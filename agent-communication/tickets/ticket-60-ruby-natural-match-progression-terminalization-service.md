# Ticket 60 — Natural Match Progression Terminalization Service

Assigned agent: Ruby
Priority: High
Wave: I — Demo-stable ranked loop
Dependencies: Tickets 48, 52, 57
Parallelization: I.0; can run in parallel with 58/59 if service/API boundary is coordinated.
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-51-57.md`
- `agent-communication/responses/ticket-48-rating-finalization-and-leaderboard-transaction-slice-response.md`
- `agent-communication/responses/ticket-52-match-completion-result-and-rating-finalization-endpoints-response.md`

## Task

Make ranked matches naturally reach terminal states without direct database manipulation.

Deliverables:

1. Extend gameplay service logic so participants become terminal through normal game rules: solved, max attempts failed, abandoned, or dev/test helper terminalization if needed.
2. Ensure match/round completion eligibility is derived server-side.
3. Keep rating finalization idempotent and only after terminal eligibility.
4. Add tests for solved, failed/max-attempts, abandoned/voided if in scope, and not-ready states.
5. Coordinate with Freya 59 if API endpoints are required.

## Recommended verification

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api db:validate
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-60-ruby-natural-match-progression-terminalization-service-response.md`

Do not answer only in chat. Write the Markdown response file.
