# Ticket 02 — Technical Architecture and API Contract

**Assigned agent:** Elisa  
**Priority:** P0  
**Depends on:** Ticket 01 preferred  
**Status:** Already completed from chat; response imported into `agent-communication/responses/`.

## Context

Wordle Royale needs production architecture for mobile + web clients, realtime lobbies/gameplay, matchmaking, ranked games, profiles, leaderboards, admin/moderation, deployment assumptions, database model, REST APIs, and WebSocket contracts.

Preferred direction: Next.js/React web, Expo React Native mobile, TypeScript backend, PostgreSQL, Redis, WebSockets, shared schemas/game-engine packages.

## Objective

Design the technical architecture and API/WebSocket contract.

## Scope

Recommended stack, monorepo structure, backend modules, database schema, Redis usage, REST API endpoints, WebSocket event contract, auth/session model, game-engine boundaries, matchmaking, rating/leaderboard, word-library, analytics, admin/moderation, deployment assumptions, scaling risks.

## Acceptance criteria

Include architecture diagram, backend modules, tables/relationships, REST endpoints, WebSocket events, auth/security, server-authoritative gameplay, anti-cheat, data/privacy architecture, word-library versioning, future variants, risks/tradeoffs.


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use this filename pattern:

`ticket-XX-agentname-short-title-response.md`

Use this response format:

```markdown
# [Ticket Title] — Response

## Summary

## Decisions / Recommendations

## Detailed Output

## Open Questions

## Follow-up Tickets

## Files Changed
If no files changed, write: None.

## Tests / Commands Run
If none, write: None — planning/spec task only.

## Evidence / Result

## Risks / Blockers
```

Do not invent files, commands, tests, outputs, deployments, or verification evidence.
