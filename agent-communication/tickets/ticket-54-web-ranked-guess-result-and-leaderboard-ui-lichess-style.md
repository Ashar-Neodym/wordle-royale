# Ticket 54 — web-ranked-guess-result-and-leaderboard-ui-lichess-style

Assigned agent: Luna
Priority: High
Wave: H — Lichess-style UI reset and complete ranked loop
Dependencies: After Ticket 51 for style direction. Needs Ticket 52 for result endpoint and Ticket 53 if leaderboard API exists.
Parallelization: H.2 after backend endpoints/read-model are available.
Human action needed: Optional: Ashar should visually check the new web UI before Jasmine final QA if possible.

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

Implement the next web UI slice in the new human/lichess-inspired style.

Deliverables:

1. Apply the Ticket 51 visual direction to the main web shell.
2. Add live ranked guess submission UI if backend supports it, preserving server-authoritative feedback.
3. Add match result/rating delta display if Ticket 52 exposes result/finalization.
4. Add leaderboard/rated profile preview if Ticket 53 exposes a read route or service-backed API.
5. Keep fixture fallback explicit and less visually dominant than the real play path.
6. Use human game-site copy, not SaaS marketing copy.
7. Browser-smoke live API mode and API-down fallback mode.

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
pnpm --filter @wordle-royale/web build
pnpm build
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-54-web-ranked-guess-result-and-leaderboard-ui-lichess-style-response.md`

Do not answer only in chat. Write the Markdown response file.
