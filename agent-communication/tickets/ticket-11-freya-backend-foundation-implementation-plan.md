# Ticket 11 — Backend Foundation Implementation Plan

**Assigned agent:** Freya  
**Priority:** P0  
**Depends on:** Tickets 01, 02, 04; Ticket 10 preferred before actual coding  
**Can run in parallel with:** Tickets 06, 07, 08, 09, 10 as a planning task

## Context

Wordle Royale needs implementation sequencing for backend foundations. Do not start broad coding unless a repo scaffold already exists and Athena/Ashar explicitly asked you to implement. For now, produce an implementation plan that can become coding tickets.

Decision defaults are in:

`docs/2026-06-22-athena-decision-locks-after-tickets-01-10.md`

Assume:

- TypeScript backend.
- NestJS default.
- PostgreSQL + Prisma.
- Redis + BullMQ.
- Socket.IO.
- Server-authoritative gameplay.

## Objective

Create a backend foundation implementation plan with bite-sized tasks, dependencies, file/module structure, test strategy, and verification commands.

## Scope

Plan backend work for:

- Monorepo/backend package structure.
- Auth/users/profile schema.
- Sessions/refresh token model.
- Lobby schema and state machine.
- WebSocket connection/auth skeleton.
- Lobby realtime events.
- Match/game-engine package integration points.
- Guess submission API/WS handling.
- Word validation integration with active dictionary versions.
- Scoring/match finalization integration.
- Rating event pipeline skeleton.
- Admin/moderation skeleton.
- Analytics event ingestion skeleton.

## Acceptance criteria

Your response must include:

1. Proposed backend folder/module structure.
2. Ordered implementation phases.
3. Bite-sized implementation tickets.
4. Exact dependencies between backend tasks.
5. Proposed test files and test types.
6. Verification commands expected for each phase.
7. Risks/blockers before coding.
8. Contract questions for Elisa if any.
9. Parallelization notes: which backend tasks can run concurrently and which cannot.

## Deliverable

Create response file:

`agent-communication/responses/ticket-11-freya-backend-foundation-implementation-plan-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use this filename pattern:

`ticket-XX-agentname-short-title-response.md`

Use the standard response sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence.
