# Ticket 53 — leaderboard-and-rated-profile-read-model-slice

Assigned agent: Ruby
Priority: High
Wave: H — Lichess-style UI reset and complete ranked loop
Dependencies: After Ticket 48. Can run parallel with Ticket 52 if endpoint boundaries are coordinated.
Parallelization: H.0/H.1 backend/data lane; parallel with 51 and 52.
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

Add the first rated profile / leaderboard read-model slice.

Deliverables:

1. Define and implement a simple leaderboard/profile rating read service using `RatingProfile` rows.
2. Expose API route(s) only if low-risk and consistent with contracts; otherwise provide service/tests and exact route recommendation for Freya.
3. Include ratings, matches played, provisional status, and handle/display name where available.
4. Keep it deterministic and local-first; no external ranking service.
5. Add tests proving sorted leaderboard output and unrated/default behavior.
6. Document how this supports the chess.com/lichess-style competitive loop.

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
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-53-leaderboard-and-rated-profile-read-model-slice-response.md`

Do not answer only in chat. Write the Markdown response file.
