# Ticket 111 — Rating Algorithm Simulation and Mode Ladders

Agent: Ruby (tools/implementation)
Wave: P — Chess-style ranked Wordle foundation
Status: New after Ticket 110 contract direction

## Context

Read:

- `docs/2026-07-09-athena-hosted-preview-and-chess-ranked-direction.md`
- Ticket 110 output when available.
- Existing `packages/rating-tools` work from earlier tickets.

## Task

Prototype/simulate candidate rating formulas for Wordle ranked modes.

## Scope

- Compare Elo-with-provisional-K versus Glicko-style internal model.
- Model separate ladders for Standard, Speed/Blitz, Classic, and Multiplayer/Lobby.
- Simulate 1v1 outcomes: win/loss/draw, upset wins, provisional players, inactive players.
- Simulate multiplayer pairwise placement conversion with lobby-size delta scaling.
- Recommend initial parameters: starting rating, provisional games, K factors / rating deviation defaults, max delta caps.
- Keep work in tooling/docs unless Ticket 110 explicitly authorizes schema/code changes.

## Acceptance criteria

- Provides reproducible simulation command(s) or documented calculations.
- Produces recommended MVP rating parameters with trade-offs.
- Flags where product fairness/anti-abuse decisions affect math.

## Output

Write response to:

`agent-communication/responses/ticket-111-ruby-rating-algorithm-simulation-and-mode-ladders-response.md`
