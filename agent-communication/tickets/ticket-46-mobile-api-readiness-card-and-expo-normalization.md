# Ticket 46 — mobile-api-readiness-card-and-expo-normalization

Assigned agent: Luna
Priority: Medium
Wave: G — First playable ranked loop foundation
Dependencies: None; can run in G.0
Parallelization: Can run in parallel with Tickets 44 and 45. Does not need gameplay endpoints yet.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-29-athena-review-after-tickets-38-43.md`
- `agent-communication/index.md`
- Relevant Wave F responses in `agent-communication/responses/`

Product direction: Wordle Royale should be for Wordle what chess.com / lichess are for chess: competitive, social, ranked, replayable, rating-driven, and fair.

## Task

Add the mobile live API readiness foundation from Ticket 42 follow-ups.

Deliverables:

1. Add a mobile API client/readiness adapter that can check `/healthz` and `/readyz` against a configurable LAN API base URL.
2. Add a compact mobile status/readiness card showing API base URL, health/readiness, DB/Redis state if available, and fixture/demo fallback mode.
3. Normalize Expo dependency warnings if safe and small; otherwise document exact package warnings and defer.
4. Replace deprecated core `SafeAreaView` with `react-native-safe-area-context` if dependency changes are safe; otherwise make this a clear follow-up.
5. Provide Expo Go smoke instructions for Ashar if a real phone check is needed.

Recommended verification:

```bash
pnpm --filter @wordle-royale/mobile build
pnpm --filter @wordle-royale/mobile exec expo config --type public
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

`agent-communication/responses/ticket-46-mobile-api-readiness-card-and-expo-normalization-response.md`

Do not answer only in chat. Write the Markdown response file.
