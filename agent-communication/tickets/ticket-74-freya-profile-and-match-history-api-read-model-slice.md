# Ticket 74 — Profile and Match History API Read Model Slice

Assigned agent: Freya
Priority: High
Wave: K — GitHub checkpoint and product depth
Dependencies: Ticket 73 preferred; can start from current schema and leaderboard/profile services.
Parallelization: K.1 after/alongside Ticket 73.
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-tickets-65-71.md`
- Ticket 73 response if available
- Current API profile/leaderboard/gameplay modules

## Task

Add the first real profile/history read model slice so the new multi-page shell has meaningful data beyond placeholders.

## Deliverables

1. Add or refine API endpoints for current user's rated profile and recent ranked match history.
2. Keep response envelopes consistent with shared contracts.
3. Include spoiler-safe match summaries only; do not leak hidden answers for unfinished/current puzzles.
4. Add tests for empty state, seeded data, and completed ranked match history.
5. Update shared contracts/types if needed.
6. Keep auth stub/dev headers consistent with existing local flow.

## Recommended verification

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/contracts test
pnpm --filter @wordle-royale/contracts build
pnpm build
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-74-freya-profile-and-match-history-api-read-model-slice-response.md`

Do not answer only in chat. Write the Markdown response file.
