# Ticket 49 — web-live-lobby-actions-and-ranked-entry-flow

Assigned agent: Luna
Priority: High
Wave: G — First playable ranked loop foundation
Dependencies: After Ticket 47 backend endpoints are available; can prepare UI states earlier.
Parallelization: Run in G.2 after backend endpoint shape is known.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-29-athena-review-after-tickets-38-43.md`
- `agent-communication/index.md`
- Relevant Wave F responses in `agent-communication/responses/`

Product direction: Wordle Royale should be for Wordle what chess.com / lichess are for chess: competitive, social, ranked, replayable, rating-driven, and fair.

## Task

Move the web UI from live display/fallback into the first live action flow.

Deliverables:

1. Wire create/join lobby actions to the live local API where backend support exists.
2. Add a guarded ranked match entry/start flow if Ticket 47 exposes it; otherwise prepare the UI with disabled/coming-next state tied to documented API gap.
3. Preserve clear live-vs-fixture labels from Ticket 40.
4. Add user-visible error/loading/empty states.
5. Browser-smoke both live API mode and API-stopped fallback mode.

Recommended verification:

```bash
pnpm --filter @wordle-royale/web build
pnpm build
# plus browser smoke with NEXT_PUBLIC_API_URL pointing at live local API
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

`agent-communication/responses/ticket-49-web-live-lobby-actions-and-ranked-entry-flow-response.md`

Do not answer only in chat. Write the Markdown response file.
