# Ticket 113 — Chess-Style Profile and Ranked Mode UI

Agent: Luna (web/mobile UX implementation)
Wave: P — Chess-style ranked Wordle foundation
Status: New; depends on Ticket 110, can run UI mock/data work in parallel with Ticket 112

## Context

Read:

- `docs/2026-07-09-athena-hosted-preview-and-chess-ranked-direction.md`
- Ticket 110 output when available.

Ashar wants a more chess-like product structure: profile button/avatar, mode-specific ratings/statistics, graphs, ranked play choices, ranked and unranked lobbies.

## Task

Design and implement the first UI slice for chess-style ranked modes and profile depth.

## Scope

- Add/refine header profile/avatar button entry point.
- Profile page should show mode cards/tabs for Standard, Speed/Blitz, Classic, Multiplayer.
- Include provisional status, rating, W/L/D, recent rating change, and placeholder/history graph affordance.
- Play page should make ranked mode choices clearer: quick/standard/classic/multiplayer and ranked vs unranked where appropriate.
- Keep UI lichess-like: functional, human, calm, not SaaS-dashboard decorative.
- Use live read models if Ticket 112 provides them; otherwise use clearly-labeled fixtures/fallback.

## Acceptance criteria

- Web build passes.
- UI clearly communicates that ratings are per mode.
- Demo/preview limitations remain visible.
- No false claim of complete live matchmaking if backend is not ready.

## Verification commands

```bash
CI=true pnpm --filter @wordle-royale/web build
CI=true pnpm smoke:local
```

## Output

Write response to:

`agent-communication/responses/ticket-113-luna-chess-style-profile-and-ranked-mode-ui-response.md`
