# Ticket 20 — Word Fixture Tooling Implementation

**Assigned agent:** Ruby  
**Priority:** P0  
**Depends on:** Ticket 18  
**Can run in parallel with:** Tickets 19, 21, 22, 23 after Ticket 18 completes

## Context

Use Ticket 13. Production dictionary sources are not approved yet, so this ticket must create only safe non-production fixtures and tooling skeletons.

Current decision lock:

`docs/2026-06-22-athena-decision-locks-after-tickets-11-17.md`

## Objective

Implement initial `packages/word-tools` and fixture dictionary artifacts for tests.

## Scope

Implement:

- `packages/contracts` word-library schemas if not already present.
- `packages/word-tools` CLI or script scaffold.
- Small safe fixture answer list.
- Small safe fixture valid-guess list.
- Small banned/sensitive placeholder list using non-slur placeholders only.
- Deterministic manifest/checksum generation.
- Validation report for fixture outputs.

Do not import production word lists.

## Acceptance criteria

1. Fixture generation command exists and runs.
2. Generated fixture artifacts are deterministic.
3. Validation catches length, duplicate, answer/guess separation, and banned-list conflicts.
4. No proprietary/production word source is committed.
5. Response lists files changed and commands run.

## Deliverable

Create response file:

`agent-communication/responses/ticket-20-ruby-word-fixture-tooling-implementation-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use the exact response filename given in this ticket.

Use sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence. If you run commands, include exact commands and whether they passed/failed.
