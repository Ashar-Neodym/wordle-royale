# Ticket 50 — qa-review-wave-g-first-playable-ranked-loop

Assigned agent: Jasmine
Priority: High
Wave: G — First playable ranked loop foundation
Dependencies: After Tickets 44–49 responses exist, or explicitly mark missing ones as blocked/deferred.
Parallelization: Run last.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-29-athena-review-after-tickets-38-43.md`
- `agent-communication/index.md`
- Relevant Wave F responses in `agent-communication/responses/`

Product direction: Wordle Royale should be for Wordle what chess.com / lichess are for chess: competitive, social, ranked, replayable, rating-driven, and fair.

## Task

Perform independent QA for Wave G.

Scope:

1. Review Tickets 44–49 responses and changed files.
2. Re-run root/package gates.
3. Verify Docker/Compose runtime instructions are now repeatable.
4. Verify ranked backend service/endpoints/rating slice according to what was implemented.
5. Verify web live action flow and fallback behavior.
6. Verify mobile readiness card/build, and repeat Expo Go smoke if Ashar is available.
7. Separate PASS/WARN/FAIL and list exact blockers before Wave H.

Recommended verification:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm secret-scan
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:check
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
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

`agent-communication/responses/ticket-50-qa-review-wave-g-first-playable-ranked-loop-response.md`

Do not answer only in chat. Write the Markdown response file.
