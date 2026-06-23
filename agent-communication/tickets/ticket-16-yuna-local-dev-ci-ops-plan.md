# Ticket 16 — Local Dev, CI, and Operational Readiness Plan

**Assigned agent:** Yuna  
**Priority:** P0  
**Depends on:** Ticket 07, Ticket 10  
**Can run in parallel with:** Tickets 11, 12, 13, 14, 15

## Context

Yuna's infrastructure plan selected a cost-conscious production path. Elisa's Ticket 10 locked NestJS, Socket.IO, PostgreSQL, Prisma, Redis, and BullMQ. Athena decision locks are here:

`docs/2026-06-22-athena-decision-locks-after-tickets-01-10.md`

## Objective

Create an operational implementation plan for local development, CI checks, staging readiness, health checks, migrations, backups, and release smoke tests.

## Scope

Plan:

- Local Docker Compose for PostgreSQL/Redis.
- Environment variable templates.
- Health/readiness endpoints.
- Worker heartbeat/queue health.
- Prisma migration workflow.
- GitHub Actions PR checks.
- Staging deployment flow.
- Release smoke checks.
- Backup/restore rehearsal.
- Log redaction and secret handling.
- Sentry/environment tagging.

## Acceptance criteria

Your response must include:

1. Proposed file paths/scripts.
2. Environment variable matrix.
3. Local dev startup workflow.
4. CI workflow outline.
5. Migration/rollback workflow.
6. Health/readiness check requirements for Freya.
7. Smoke test checklist for Jasmine.
8. Security/secrets cautions.
9. Follow-up implementation tickets.

## Deliverable

Create response file:

`agent-communication/responses/ticket-16-yuna-local-dev-ci-ops-plan-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use the exact response filename given in this ticket.

Use sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence.
