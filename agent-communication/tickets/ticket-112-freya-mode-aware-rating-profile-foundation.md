# Ticket 112 — Mode-Aware Rating Profile Foundation

Agent: Freya (backend implementation)
Wave: P — Chess-style ranked Wordle foundation
Status: New; depends on Ticket 110, can use Ticket 111 parameters if ready

## Context

Read:

- `docs/2026-07-09-athena-hosted-preview-and-chess-ranked-direction.md`
- Ticket 110 output.
- Ticket 111 output if available.

## Task

Implement the backend foundation for per-mode ratings/profiles without prematurely rolling out full live matchmaking.

## Scope

- Add/adjust schema for mode-aware rating profiles if required.
- Preserve existing preview/demo behavior.
- Support separate rating records for Standard, Speed/Blitz, Classic, Multiplayer/Lobby.
- Track provisional status/games played and fields needed for later Glicko/Elo migration.
- Expose read endpoints or DTO additions needed by web profile and leaderboard.
- Add tests for rating-profile creation/read model behavior.

## Acceptance criteria

- Existing API tests pass.
- Preview demo session still starts on hosted-compatible config.
- No breaking changes to current web preview.
- Database migration included if schema changes are required.

## Verification commands

```bash
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm --filter @wordle-royale/api build
CI=true pnpm smoke:api:prod-start
```

## Output

Write response to:

`agent-communication/responses/ticket-112-freya-mode-aware-rating-profile-foundation-response.md`
