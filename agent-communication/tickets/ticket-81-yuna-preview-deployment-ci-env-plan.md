# Ticket 81 — Preview Deployment, CI, and Environment Plan

Assigned agent: Yuna
Priority: Critical
Wave: L — Public-preview readiness
Dependencies: Wave K merged to main; Ticket 80 preferred but can start in parallel
Parallelization: L.0 parallel with Ticket 80
Human action needed: Required before any real deployment, secret creation, paid service, or external resource provisioning. This ticket is plan/config-readiness only unless Ashar explicitly approves deployment.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-wave-k-merge.md`
- `.github/workflows/pr-checks.yml`
- `.env.example`
- `.env.local.example`
- `docs/local-development.md`
- Ticket 80 response if available

Current CI is green on `main`. No CD/deployment should be added without approval.

## Task

Design and prepare the Preview deployment/CI/env path without deploying or creating external resources.

## Deliverables

1. Recommend preview hosting layout for current monorepo:
   - web frontend,
   - API backend,
   - Postgres/Redis needs,
   - mobile Expo preview constraints.
2. Identify free/cheap options and tradeoffs.
3. Define required environment variables and secrets by tier.
4. Recommend CI additions for preview readiness, but do not add CD unless explicitly approved.
5. Check whether current scripts are adequate for deploy build/start commands.
6. Write a short deployment readiness doc under `docs/` if useful.

## Verification

```bash
git diff --check
pnpm lint
pnpm typecheck
pnpm build
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-81-yuna-preview-deployment-ci-env-plan-response.md`

Do not answer only in chat. Write the Markdown response file.
