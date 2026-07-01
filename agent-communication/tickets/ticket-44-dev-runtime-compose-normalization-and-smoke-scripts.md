# Ticket 44 — dev-runtime-compose-normalization-and-smoke-scripts

Assigned agent: Yuna
Priority: High
Wave: G — First playable ranked loop foundation
Dependencies: None; can run in G.0
Parallelization: Can run in parallel with Ticket 45 and Ticket 48.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-29-athena-review-after-tickets-38-43.md`
- `agent-communication/index.md`
- Relevant Wave F responses in `agent-communication/responses/`

Product direction: Wordle Royale should be for Wordle what chess.com / lichess are for chess: competitive, social, ranked, replayable, rating-driven, and fair.

## Task

Normalize the Wave F Docker Compose workaround into repeatable local-dev scripts/docs.

Specific goals:

1. Make it easy for any profile/session to run Compose checks without remembering the Yuna `DOCKER_CONFIG` path.
2. Update local development docs/scripts if needed so `pnpm deps:check` and `pnpm deps:verify` are the canonical checks.
3. Consider whether `pnpm smoke:local` should detect/use the profile Compose plugin path or whether docs should explicitly say to run the DOCKER_CONFIG-prefixed command.
4. Do not install system-wide packages unless Ashar approves; prefer repo docs/scripts or user-local configuration.
5. Verify Postgres/Redis can still start, report healthy, and cleanly stop.

Recommended verification:

```bash
pnpm install --frozen-lockfile
pnpm smoke:local
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:check
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:verify
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

`agent-communication/responses/ticket-44-dev-runtime-compose-normalization-and-smoke-scripts-response.md`

Do not answer only in chat. Write the Markdown response file.
