# Ticket 45 — ranked-gameplay-api-contract-and-state-machine-spec

Assigned agent: Elisa
Priority: High
Wave: G — First playable ranked loop foundation
Dependencies: None; can run in G.0
Parallelization: Can run in parallel with Ticket 44 and Ticket 48. Freya/Ruby implementation should wait for this if endpoint shapes are changed.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-29-athena-review-after-tickets-38-43.md`
- `agent-communication/index.md`
- Relevant Wave F responses in `agent-communication/responses/`

Product direction: Wordle Royale should be for Wordle what chess.com / lichess are for chess: competitive, social, ranked, replayable, rating-driven, and fair.

## Task

Define the minimal ranked gameplay API contract and state machine for the first playable loop.

Deliverables:

1. Propose REST endpoints/envelopes for ranked match start, current match state, guess submission, and match completion/result summary.
2. Define server-authoritative state shape for web/mobile: answer must not leak; feedback and score are server-provided.
3. Define minimal rating/MMR event contract for V1, including placement/default 1200 behavior and idempotency needs.
4. Update `@wordle-royale/contracts` only if the contract shape is clear and small enough; otherwise write a design note with exact follow-up implementation tasks.
5. Include migration/API compatibility notes for Freya/Ruby/Luna.

Recommended verification if contracts change:

```bash
pnpm --filter @wordle-royale/contracts test
pnpm --filter @wordle-royale/contracts build
pnpm typecheck
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

`agent-communication/responses/ticket-45-ranked-gameplay-api-contract-and-state-machine-spec-response.md`

Do not answer only in chat. Write the Markdown response file.
