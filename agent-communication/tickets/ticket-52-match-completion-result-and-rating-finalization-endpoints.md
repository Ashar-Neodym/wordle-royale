# Ticket 52 — match-completion-result-and-rating-finalization-endpoints

Assigned agent: Freya
Priority: High
Wave: H — Lichess-style UI reset and complete ranked loop
Dependencies: After Tickets 45/47/48 from Wave G. Can run in parallel with 51 and 53.
Parallelization: H.0/H.1 backend lane; parallel with Ruby 53, independent from Luna visual work.
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

Expose the missing backend piece that turns a ranked match from started/guessable into completed with rating results.

Deliverables:

1. Add public/local REST endpoint(s) for match completion/result summary using Ticket 45 contracts and Ticket 48 `finalizeRankedMatchRatings(...)` service.
2. Ensure incomplete/active matches cannot finalize ratings prematurely.
3. Ensure idempotency: repeated completion/result calls should not double-apply rating deltas.
4. Return spoiler-safe result summary and rating deltas only after completion.
5. Add API tests for success, active-match rejection, idempotency, and void/no-rating behavior if exposed.
6. Live-smoke the endpoint against local Postgres if practical.

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
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api db:validate
pnpm deps:check
```

## Response path

`agent-communication/responses/ticket-52-match-completion-result-and-rating-finalization-endpoints-response.md`

Do not answer only in chat. Write the Markdown response file.
