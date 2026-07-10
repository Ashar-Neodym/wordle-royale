# Ticket 105 — Controlled Preview Provisioning

Agent: Yuna (devops)
Wave: O — Controlled preview provisioning/deployment
Status: Blocked until Ashar explicit approval

## Context

Only run after Tickets 103–104 are complete and Ashar explicitly approves provider/resource/secret creation.

## Task

Provision the controlled preview infrastructure exactly according to the approved plan.

## Scope

- Create isolated preview Postgres.
- Create API service and web project/config as approved.
- Configure provider env/secrets only in provider UI/secret store.
- Optionally omit Redis with `REDIS_REQUIRED=false` unless approved.
- Do not merge unrelated changes.
- Capture URLs, resource IDs/names, costs/free-tier evidence, and rollback/delete instructions.

## Output

Write response to:

`agent-communication/responses/ticket-105-yuna-controlled-preview-provisioning-response.md`
