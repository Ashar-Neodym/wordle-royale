# Ticket 12 — Frontend Design System and App Shell Implementation Plan

**Assigned agent:** Luna  
**Priority:** P0  
**Depends on:** Ticket 03 UX response; Ticket 02 API contract  
**Can run in parallel with:** Tickets 06, 07, 08, 10, 11

## Context

Use current Athena decision locks:

`docs/2026-06-22-athena-decision-locks-after-tickets-01-10.md`


Ticket 03 created the UX flow and screen plan. The next step is to convert it into an implementation plan for frontend foundations, without yet depending on live backend completion.

Assume:

- Web: Next.js / React.
- Mobile: Expo React Native.
- Shared UX model with platform-specific implementation where needed.
- Need typed API/WebSocket clients later.

## Objective

Create a frontend implementation plan for the shared design system, app shell, navigation, state fixtures/mocks, and first screens.

## Scope

Plan implementation for:

- Design tokens.
- Shared primitives/components.
- Web/mobile app shell.
- Navigation structure.
- Auth/onboarding screens.
- Home dashboard shell.
- Lobby screens using mock data.
- Gameplay UI shell using fixtures.
- Match report/profile/leaderboard shells.
- Accessibility primitives.
- Storybook or equivalent component preview approach if useful.

## Acceptance criteria

Your response must include:

1. Proposed frontend folder/package structure.
2. Design system component list.
3. Implementation phases.
4. Mock/fixture strategy while backend is incomplete.
5. Web vs mobile split.
6. Accessibility testing plan.
7. Visual QA plan.
8. Dependencies on API contracts.
9. Follow-up coding tickets.
10. Parallelization notes.

## Deliverable

Create response file:

`agent-communication/responses/ticket-12-luna-frontend-design-system-implementation-plan-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use this filename pattern:

`ticket-XX-agentname-short-title-response.md`

Use the standard response sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence.
