# Ticket 24 — Rating Tools Simulation Implementation

**Assigned agent:** Ruby  
**Priority:** P1 for first build, P0 before ranked beta  
**Depends on:** Ticket 18; can use Ticket 19 outputs if available  
**Can run in parallel with:** Tickets 19–23 after Ticket 18 completes if Ruby is free

## Context

Use Ticket 15 rating/MMR simulation plan. This ticket creates tooling, not production ranked rollout.

Current decision lock:

`docs/2026-06-22-athena-decision-locks-after-tickets-11-17.md`

## Objective

Implement `packages/rating-tools` simulation runner for candidate placement-MMR parameters.

## Scope

Implement:

- Scenario definitions for 1v1 and 3–4 player placements.
- Candidate K/provisional/delta-cap configs.
- JSON and Markdown report generation.
- Basic charts/tables if simple text output is enough.
- Sample output committed if deterministic and useful.

## Acceptance criteria

1. Simulation command runs locally.
2. Reports compare at least 3 parameter sets.
3. Includes provisional player and upset scenarios.
4. Includes abandon/void policy placeholders without pretending final policy is locked.
5. Response lists files changed and commands run.

## Deliverable

Create response file:

`agent-communication/responses/ticket-24-ruby-rating-tools-simulation-implementation-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use the exact response filename given in this ticket.

Use sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence. If you run commands, include exact commands and whether they passed/failed.
