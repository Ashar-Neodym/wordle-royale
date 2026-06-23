# Ticket 19 — Game Engine Core Implementation

**Assigned agent:** Freya  
**Priority:** P0  
**Depends on:** Ticket 18  
**Can run in parallel with:** Tickets 20, 21, 22, 23 after Ticket 18 completes

## Context

Implement the pure deterministic game engine before backend gameplay APIs. Use:

- Ticket 04 game-engine/scoring/rating spec.
- Ticket 10 contract amendments.
- Ticket 14 release gates.
- Current decision lock: `docs/2026-06-22-athena-decision-locks-after-tickets-11-17.md`.

## Objective

Implement `packages/game-engine` pure functions and tests for V1 Wordle Royale gameplay.

## Scope

Implement:

- Word normalization.
- Guess validation result types.
- Two-pass duplicate-letter feedback algorithm.
- Round score calculation.
- Standings/tie-break helper.
- Basic placement-MMR pure calculation using locked candidate defaults, if package boundaries allow.
- Test fixtures for duplicate letters, invalid guesses, score examples, ties, and rating examples.

Do not wire NestJS/database in this ticket.

## Acceptance criteria

1. Pure functions are implemented in `packages/game-engine`.
2. Tests prove duplicate-letter correctness.
3. Tests prove scoring examples and tie-break order.
4. Rating helper is either implemented with tests or explicitly deferred to Ticket 24 with reason.
5. Commands run are listed with exit codes.
6. No client-authoritative assumptions are introduced.

## Deliverable

Create response file:

`agent-communication/responses/ticket-19-freya-game-engine-core-implementation-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use the exact response filename given in this ticket.

Use sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence. If you run commands, include exact commands and whether they passed/failed.
