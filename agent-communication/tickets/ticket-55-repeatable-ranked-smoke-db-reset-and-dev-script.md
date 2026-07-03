# Ticket 55 — repeatable-ranked-smoke-db-reset-and-dev-script

Assigned agent: Yuna
Priority: Medium
Wave: H — Lichess-style UI reset and complete ranked loop
Dependencies: Can run after Ticket 52 endpoint shape is known, or prepare generic reset first.
Parallelization: H.1/H.2 infra lane; useful before Jasmine 57.
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-29-athena-review-after-tickets-44-50.md`
- `agent-communication/index.md`
- Relevant Wave G responses in `agent-communication/responses/`

Important product correction from Ashar:

> The current UI looks too AI-generated. The desired direction is like lichess: human, calm, functional, game-first, minimal, readable, and community/rating oriented.

Do **not** continue the glossy AI/SaaS dashboard style.

## Task

Make ranked live smoke repeatable instead of accumulating noisy local lobbies/matches.

Deliverables:

1. Add or document a safe local-only DB reset/seed path for ranked smoke tests.
2. Do not risk production data; script must clearly require local/dev environment.
3. If feasible, add a `pnpm` script for ranked smoke setup/reset using existing fixture seed.
4. Coordinate with Ticket 52 endpoint names if adding an end-to-end smoke script.
5. Verify `deps:up`, reset/seed, and `deps:down` cleanup behavior.

## Constraints

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Do not push to GitHub.
- Keep changes focused to this ticket's scope.
- Preserve spoiler safety: never expose plaintext answers before allowed match completion.
- If you use Docker deps, prefer the normalized repo commands:

```bash
pnpm deps:check
pnpm deps:up
pnpm deps:down
```

## Acceptance criteria

- Complete the requested deliverable or clearly mark it blocked with actionable details.
- Run the most relevant verification commands.
- Separate blockers from warnings.
- List files changed.
- Write your response to the exact response path below.

## Recommended verification

```bash
pnpm deps:check
pnpm deps:up
pnpm --filter @wordle-royale/api db:validate
pnpm deps:down
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-55-repeatable-ranked-smoke-db-reset-and-dev-script-response.md`

Do not answer only in chat. Write the Markdown response file.
