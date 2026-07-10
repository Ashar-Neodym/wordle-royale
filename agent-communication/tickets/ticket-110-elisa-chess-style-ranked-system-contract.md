# Ticket 110 — Chess-Style Ranked System Contract

Agent: Elisa (architect)
Wave: P — Chess-style ranked Wordle foundation
Status: New

## Context

Read:

- `docs/2026-07-09-athena-hosted-preview-and-chess-ranked-direction.md`
- Existing rating/gameplay contracts and Prisma schema.

Ashar wants Wordle Royale to follow chess.com/lichess structure: matchmaking queues, separate mode ratings, 1v1 ranked as the core loop, ranked/unranked lobbies, and profile stats/graphs per mode.

## Task

Define the product/API/data contract for chess-style ranked Wordle.

## Scope

- Define ranked modes/time controls for MVP: Standard, Speed/Blitz, Classic, Multiplayer/Lobby.
- Define 1v1 result rules: fewer guesses, speed tiebreaks, draws, failures, disconnects.
- Define ranked vs unranked lobby semantics.
- Define rating profile shape per mode: rating, confidence/provisional state, games played, W/L/D, rating delta history.
- Decide Elo-vs-Glicko path: preferably Glicko-style internal model or Elo-compatible MVP with migration path.
- Define matchmaking queue contracts and search expansion semantics.
- Define anti-abuse and server-authority constraints.

## Acceptance criteria

- Produces a clear contract doc with endpoint/DTO/schema implications.
- Separates user-facing product rules from internal rating algorithm details.
- Explicitly lists decisions that require Ashar approval.
- Does not implement code.

## Output

Write response to:

`agent-communication/responses/ticket-110-elisa-chess-style-ranked-system-contract-response.md`
