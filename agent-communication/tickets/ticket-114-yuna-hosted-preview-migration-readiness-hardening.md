# Ticket 114 — Hosted Preview Migration/Readiness Hardening

Agent: Yuna (devops)
Wave: P — Chess-style ranked Wordle foundation / hosted preview reliability
Status: New; can run after Wave O evidence

## Context

Wave O hosted preview initially looked healthy by `/readyz`, but live preview actions failed until the Supabase migration was manually applied.

Read:

- `agent-communication/responses/ticket-109-jasmine-qa-review-wave-o-hosted-preview-response.md`
- `docs/2026-07-09-athena-hosted-preview-and-chess-ranked-direction.md`

## Task

Prevent future hosted preview deploys from missing migrations or falsely passing readiness.

## Scope

- Document or configure Railway pre-deploy migration step:
  - `pnpm --filter @wordle-royale/api db:migrate:deploy`
- Confirm whether Railway should run migrations automatically per deploy or via manual runbook before deploy.
- Propose readiness hardening so `/readyz` can detect required app schema/table availability, not only DB connectivity.
- Do not expose or commit secrets.
- Do not make provider changes requiring paid resources.

## Acceptance criteria

- Clear runbook or provider config recommendation exists.
- Hosted preview smoke checklist includes migration status.
- If code changes are needed for readiness hardening, create follow-up implementation ticket rather than broad-editing here.

## Output

Write response to:

`agent-communication/responses/ticket-114-yuna-hosted-preview-migration-readiness-hardening-response.md`
