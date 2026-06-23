# Ticket 21 — Design Tokens and UI Fixture Foundation

**Assigned agent:** Luna  
**Priority:** P0  
**Depends on:** Ticket 18  
**Can run in parallel with:** Tickets 19, 20, 22, 23 after Ticket 18 completes

## Context

Use Ticket 12 and Ticket 17. The selected brand direction is `Crown Grid Arena`.

Current decision lock:

`docs/2026-06-22-athena-decision-locks-after-tickets-11-17.md`

## Objective

Implement the first design-token package and UI fixture catalog foundation.

## Scope

Implement:

- `packages/design-tokens` TypeScript source tokens.
- Web CSS variable export if practical.
- React Native/plain object export if practical.
- Tile feedback token states including colorblind/high-contrast/reduced-motion metadata.
- Basic fixture data under `packages/fixtures` for auth, lobby, gameplay, match report, loading/error/reconnect states.
- Optional lightweight preview only if easy; do not overbuild.

## Acceptance criteria

1. Token package builds/typechecks.
2. Tokens include color, typography, spacing, radius, shadow, motion, tile, rank/lobby/connection states.
3. Fixture catalog includes at least gameplay and lobby states needed by frontend/backend tests.
4. Accessibility notes are encoded in docs or token metadata.
5. Response lists files changed and commands run.

## Deliverable

Create response file:

`agent-communication/responses/ticket-21-luna-design-tokens-and-ui-fixtures-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use the exact response filename given in this ticket.

Use sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence. If you run commands, include exact commands and whether they passed/failed.
