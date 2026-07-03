# Ticket 48 — rating-finalization-and-leaderboard-transaction-slice

Assigned agent: Ruby
Priority: High
Wave: G — First playable ranked loop foundation
Dependencies: Prefer after Ticket 45 rating contract notes; can inspect Ticket 41 immediately.
Parallelization: Run in G.1 parallel with Ticket 47 if Ticket 45 has clarified rating event shape.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-29-athena-review-after-tickets-38-43.md`
- `agent-communication/index.md`
- Relevant Wave F responses in `agent-communication/responses/`

Product direction: Wordle Royale should be for Wordle what chess.com / lichess are for chess: competitive, social, ranked, replayable, rating-driven, and fair.

## Task

Implement or design the first rating finalization/leaderboard transaction slice.

Deliverables:

1. Extend the ranked backend service so a completed match can produce rating events safely and idempotently.
2. Keep V1 simple: default/placement rating can be 1200 with documented placeholder algorithm if full Elo is not ready.
3. Ensure rating events are reversible/voidable-compatible with existing schema intent.
4. Add service tests for rating event creation and leaderboard/profile rating update behavior.
5. Do not expose a public route unless coordinated with Freya/Ticket 47.

Recommended verification:

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api db:validate
pnpm secret-scan
```


## Constraints

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Do not push to GitHub.
- Keep changes focused to this ticket's scope.
- If you need Docker Compose from a non-Yuna profile, use:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker
```

## Acceptance criteria

- Implement or document the requested deliverable clearly.
- Run the most relevant local verification commands and include exact command/output summaries.
- Separate blockers from warnings.
- List files changed.
- Write your response to the exact response path below.

## Response path

`agent-communication/responses/ticket-48-rating-finalization-and-leaderboard-transaction-slice-response.md`

Do not answer only in chat. Write the Markdown response file.
