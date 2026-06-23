# Ticket 22 — Local Dev Docker/Env/CI Skeleton

**Assigned agent:** Yuna  
**Priority:** P0  
**Depends on:** Ticket 18  
**Can run in parallel with:** Tickets 19, 20, 21, 23 after Ticket 18 completes

## Context

Use Ticket 16 local dev/CI plan. This ticket creates local-only developer infrastructure; do not create cloud resources.

Current decision lock:

`docs/2026-06-22-athena-decision-locks-after-tickets-11-17.md`

## Objective

Implement local Docker Compose, env examples, and initial CI skeleton for the monorepo.

## Scope

Implement:

- `docker-compose.yml` for PostgreSQL 16 and Redis 7.
- `.env.example` / `.env.local.example` without secrets.
- Root scripts for deps up/down/reset if compatible with Ticket 18 package setup.
- GitHub Actions PR check skeleton if package scripts exist.
- Local smoke script placeholder if practical.
- Docs for local setup.

## Acceptance criteria

1. Docker Compose file has Postgres and Redis only.
2. Env examples contain placeholders only, no real secrets.
3. Commands are documented and tested where possible.
4. CI skeleton does not require unavailable secrets.
5. Response lists files changed and commands run.

## Deliverable

Create response file:

`agent-communication/responses/ticket-22-yuna-local-dev-docker-env-ci-skeleton-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use the exact response filename given in this ticket.

Use sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence. If you run commands, include exact commands and whether they passed/failed.
