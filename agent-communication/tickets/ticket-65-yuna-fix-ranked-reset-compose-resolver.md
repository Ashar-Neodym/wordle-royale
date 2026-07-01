# Ticket 65 — Fix Ranked Reset Compose Resolver

Assigned agent: Yuna
Priority: Critical
Wave: J — GitHub checkpoint, CI, multi-page product shell
Dependencies: Ticket 64 conditional pass
Parallelization: J.0 first; blocks GitHub checkpoint confidence.
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-58-64.md`
- `agent-communication/responses/ticket-64-jasmine-qa-review-wave-i-demo-stable-ranked-loop-response.md`

## Task

Fix the remaining Wave I conditional blocker: `pnpm ranked:smoke:reset` must work after `pnpm deps:up` without manually exporting `DOCKER_CONFIG`.

Jasmine/Athena repro:

```bash
pnpm deps:up && pnpm ranked:smoke:reset
```

Current failure:

```text
unknown shorthand flag: 'T' in -T
Refusing ranked smoke reset: local Compose PostgreSQL did not become ready within 20 seconds.
```

## Deliverables

1. Update `scripts/reset-ranked-smoke-db.mjs` to reuse the same Docker Compose resolver/environment used by `scripts/docker-compose.mjs` and `scripts/check-local-deps.mjs`, or otherwise make the documented command stable.
2. Keep all local-production safety guards.
3. Verify reset, seed, and cleanup work without manual `DOCKER_CONFIG` export.
4. Update docs if the canonical command changes.

## Recommended verification

```bash
pnpm deps:up
pnpm ranked:smoke:reset
pnpm ranked:smoke:bootstrap
pnpm deps:verify
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-65-yuna-fix-ranked-reset-compose-resolver-response.md`

Do not answer only in chat. Write the Markdown response file.
