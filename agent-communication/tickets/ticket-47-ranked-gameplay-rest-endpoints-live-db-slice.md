# Ticket 47 — ranked-gameplay-rest-endpoints-live-db-slice

Assigned agent: Freya
Priority: High
Wave: G — First playable ranked loop foundation
Dependencies: Prefer after Ticket 45 contract/spec. Can start by reading Ticket 41 service code.
Parallelization: Run in G.1 after Ticket 45, unless Elisa confirms no contract changes needed.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-29-athena-review-after-tickets-38-43.md`
- `agent-communication/index.md`
- Relevant Wave F responses in `agent-communication/responses/`

Product direction: Wordle Royale should be for Wordle what chess.com / lichess are for chess: competitive, social, ranked, replayable, rating-driven, and fair.

## Task

Expose the first backend REST slice for ranked gameplay using the Ticket 41 persistence service and Ticket 45 contract/spec.

Deliverables:

1. Add minimal API routes/controllers for ranked match start and guess submission or state retrieval, per Ticket 45.
2. Keep auth/player identity boundaries explicit. If still stubbed, use safe local stub identity only and document it.
3. Preserve spoiler safety: never return plaintext answer before completion.
4. Run against live local Postgres where practical using the Compose setup from Wave F.
5. Add API tests for success/error envelopes and server-authoritative feedback.

Recommended verification:

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api db:validate
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:check
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

`agent-communication/responses/ticket-47-ranked-gameplay-rest-endpoints-live-db-slice-response.md`

Do not answer only in chat. Write the Markdown response file.
