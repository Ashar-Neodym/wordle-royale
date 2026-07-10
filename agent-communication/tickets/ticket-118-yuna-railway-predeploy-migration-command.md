# Ticket 118 — Railway Pre-Deploy Migration Command

Agent: Yuna (devops)
Wave: Q — Wave P QA follow-up and deploy hardening
Status: New; provider-setting change requires Ashar approval

## Context

Read:

- `docs/2026-07-09-hosted-preview-migration-readiness-hardening.md`
- `agent-communication/responses/ticket-114-yuna-hosted-preview-migration-readiness-hardening-response.md`

Future preview deploys should not miss Prisma migrations.

## Task

Prepare and, only after explicit Ashar approval/provider access, configure Railway API pre-deploy migration command.

## Scope

Preferred Railway API service pre-deploy command:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Start command should remain separate:

```bash
pnpm --filter @wordle-royale/api start
```

## Acceptance criteria

- If provider access/approval is available: configure Railway pre-deploy command and record non-secret evidence.
- If provider access/approval is not available: provide exact dashboard instructions and mark as approval-blocked.
- Do not print DB URLs, passwords, or env values.
- Include rollback instructions.
- Include one post-change smoke checklist.

## Output

Write response to:

`agent-communication/responses/ticket-118-yuna-railway-predeploy-migration-command-response.md`
