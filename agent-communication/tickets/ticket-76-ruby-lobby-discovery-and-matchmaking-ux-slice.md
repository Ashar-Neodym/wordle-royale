# Ticket 76 — Lobby Discovery and Matchmaking UX Slice

Assigned agent: Ruby
Priority: High
Wave: K — GitHub checkpoint and product depth
Dependencies: Tickets 47, 52, 59, 67; Ticket 73 preferred.
Parallelization: K.1/K.2 with backend/UI coordination.
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-tickets-65-71.md`
- Current lobby/gameplay services and contracts
- Ticket 73 response if available

## Task

Improve the first lobby discovery/matchmaking experience so the app feels more like a competitive game site.

## Deliverables

1. Review current lobby create/join/start flow and identify smallest backend/UI contract improvements.
2. Add or refine API behavior for lobby list filtering/status if needed.
3. Add tests for open/rated lobby discovery, joining, and start readiness.
4. Keep server authority and spoiler safety.
5. Coordinate with Luna's route work so `/lobbies` and `/play` can show better actions/states.
6. Avoid overbuilding full matchmaking queues unless scoped as a follow-up.

## Recommended verification

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/contracts test
pnpm build
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-76-ruby-lobby-discovery-and-matchmaking-ux-slice-response.md`

Do not answer only in chat. Write the Markdown response file.
