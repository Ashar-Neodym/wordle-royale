# Ticket 57 — qa-review-wave-h-lichess-style-ranked-loop

Assigned agent: Jasmine
Priority: High
Wave: H — Lichess-style UI reset and complete ranked loop
Dependencies: After Tickets 51–56 responses exist, or explicitly mark unavailable tickets deferred.
Parallelization: H.3 last.
Human action needed: Optional: if Ashar can review screenshots/phone UI, include his visual acceptance notes; otherwise QA should mark visual acceptance pending user review.

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

Perform independent QA for Wave H.

Scope:

1. Verify Tickets 51–56 responses and changed files.
2. Re-run root/package gates.
3. Verify the web UI has moved away from AI-generated/SaaS styling toward the documented human/lichess-style direction.
4. Verify ranked match completion/result/rating finalization route if implemented.
5. Verify leaderboard/rated profile read model if implemented.
6. Verify web live ranked guess/result/leaderboard flow and fallback behavior.
7. Verify repeatable ranked smoke/reset path.
8. Verify mobile build/readiness/live preview, with phone smoke if Ashar is available.
9. Separate blockers from warnings and recommend Wave I.

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
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local
pnpm secret-scan
pnpm deps:check
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
```

## Response path

`agent-communication/responses/ticket-57-qa-review-wave-h-lichess-style-ranked-loop-response.md`

Do not answer only in chat. Write the Markdown response file.
