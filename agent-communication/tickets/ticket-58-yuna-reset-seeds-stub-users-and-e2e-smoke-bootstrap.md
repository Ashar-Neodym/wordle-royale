# Ticket 58 — Reset Seeds Stub Users and E2E Smoke Bootstrap

Assigned agent: Yuna
Priority: High
Wave: I — Demo-stable ranked loop
Dependencies: Ticket 55, Ticket 57 warning
Parallelization: I.0; can run in parallel with Tickets 59 and 61.
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-51-57.md`
- `agent-communication/responses/ticket-55-repeatable-ranked-smoke-db-reset-and-dev-script-response.md`
- `agent-communication/responses/ticket-57-qa-review-wave-h-lichess-style-ranked-loop-response.md`

## Task

Fix the reset/smoke warning from Wave H: after `pnpm ranked:smoke:reset`, direct lobby creation should not fail just because `/auth/me` has not been called yet.

Deliverables:

1. Update the local ranked reset/seed path so local stub auth users/profiles required by smoke tests are explicitly present after reset.
2. Keep the script guarded to local Compose Postgres only.
3. Add a repeatable smoke bootstrap check that proves reset → create lobby can work without manually calling `/auth/me` first, or document exactly why `/auth/me` remains required and provide a wrapper that does it.
4. Do not create real secrets or production data.
5. Update docs with the exact local ranked demo setup commands.

## Recommended verification

```bash
pnpm deps:up
pnpm ranked:smoke:reset
pnpm --filter @wordle-royale/api test
pnpm deps:verify
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-58-yuna-reset-seeds-stub-users-and-e2e-smoke-bootstrap-response.md`

Do not answer only in chat. Write the Markdown response file.
