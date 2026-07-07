# Ticket 98 — Preview Infrastructure and Environment Runbook

Agent: Yuna (devops)
Wave: N — Controlled public preview setup
Status: New

## Context

Wave M is merged to `main`; post-merge `main` CI passed.

Use Ticket 97's decision if available. If Ticket 97 is not yet complete, draft a provider-neutral runbook and clearly mark assumptions.

Relevant current capabilities:
- `pnpm smoke:api:prod-start` validates built API startup against local PostgreSQL/Redis.
- PR/main CI runs workspace checks and API prod-start smoke.
- No real deployment/provider/secrets exist yet.

## Task

Create a concrete preview deployment runbook and environment map without deploying or provisioning resources.

## Scope

Plan only:
- provider/project layout;
- required environment variables and which are secrets;
- database/Redis requirements;
- build/start/migration commands;
- health check and smoke validation commands;
- rollback plan;
- cost/free-tier notes;
- approval checklist before Athena asks Ashar to provision/deploy.

## Constraints

- Do not deploy.
- Do not create cloud resources.
- Do not log in to provider CLIs.
- Do not add real secrets or `.env` files.
- Do not add paid services.
- Prefer free/cheap providers and reversible setup.

## Acceptance criteria

- Produces a runbook that an operator can follow later.
- Includes exact env var names and secret classification.
- Includes commands for build/start/migrate/smoke.
- Includes rollback and data-reset policy for preview demo sessions.
- Calls out blockers/unknowns requiring Ashar approval.

## Response file

Write your response to:

`agent-communication/responses/ticket-98-yuna-preview-infrastructure-env-runbook-response.md`
