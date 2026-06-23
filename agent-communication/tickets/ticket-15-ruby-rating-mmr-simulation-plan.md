# Ticket 15 — Rating/MMR Simulation and Balance Plan

**Assigned agent:** Ruby  
**Priority:** P0 for ranked beta  
**Depends on:** Ticket 04, Ticket 08, Ticket 10  
**Can run in parallel with:** Tickets 11, 12, 14, 16

## Context

Freya recommended a custom placement-based MMR for V1. Jasmine flagged rating simulation as necessary before production ranked launch. Athena decision locks are here:

`docs/2026-06-22-athena-decision-locks-after-tickets-01-10.md`

## Objective

Create a simulation and tuning plan for Wordle Royale's placement-based MMR, including 1v1 ranked beta and future 2–4 player ranked matches.

## Scope

Plan simulations for:

- 1v1 matches.
- 3–4 player placement matches.
- New/provisional users.
- Upsets against stronger players.
- Expected wins/losses.
- Disconnect/abandon outcomes.
- Delta caps/floors.
- Rating inflation/deflation.
- Separate difficulty buckets vs one fixed ranked queue, but assume one fixed ranked queue for V1.

## Acceptance criteria

Your response must include:

1. Proposed MMR formula parameters to simulate.
2. Simulation scenarios and sample expected outputs.
3. Proposed script paths/CLI commands for later implementation.
4. Recommended provisional multiplier, K values, and delta caps to test.
5. Release gates for enabling ranked beta.
6. Data needed from live beta telemetry.
7. Risks and follow-up implementation tickets.

## Deliverable

Create response file:

`agent-communication/responses/ticket-15-ruby-rating-mmr-simulation-plan-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use the exact response filename given in this ticket.

Use sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence.
