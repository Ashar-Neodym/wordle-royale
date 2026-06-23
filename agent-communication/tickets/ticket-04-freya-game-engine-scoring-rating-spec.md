# Ticket 4 — Game Engine, Scoring, and Rating Specification

**Assigned agent:** Freya  
**Priority:** P0  
**Depends on:** Elisa PRD and Architecture/API Contract

## Context

Wordle Royale is a competitive multiplayer Wordle-style game with server-authoritative gameplay.

Elisa has defined:

- Match/lobby lifecycle.
- REST and WebSocket contracts.
- Database schema for matches, rounds, guesses, score events, ratings, and leaderboards.
- Need for a deterministic game engine.

## Objective

Define the deterministic game engine, scoring model, match finalization, and rating/MMR model.

This is a specification task, not implementation yet.

## Scope

Specify:

- Standard Wordle-style mode.
- Word validation rules.
- Duplicate-letter feedback algorithm.
- Round lifecycle.
- Match lifecycle.
- Guess limits.
- Timer behavior.
- Invalid guess behavior.
- Score calculation.
- Tie-breakers.
- Match report fields.
- Rated vs unranked behavior.
- MMR/rating algorithm recommendation.
- Unit test cases.
- Pure function boundaries for shared/backend game engine.

## Product assumptions

Use these unless you strongly recommend otherwise:

- Launch mode: standard 5-letter word game.
- Guess limit: 6 guesses.
- Invalid guesses do **not** consume attempts, but consume time.
- Timer is server-authoritative and continues during disconnect/backgrounding.
- All players in a round get the same answer word.
- Client never receives answer before round end.
- Client never calculates authoritative score/rating.

## Scoring starting point

You may tune this:

```text
base_score = solved ? 100 : 0

Guess bonus:
1 guess: +60
2 guesses: +50
3 guesses: +40
4 guesses: +25
5 guesses: +10
6 guesses: +0

speed_bonus = solved ? round(50 * remaining_time_ratio) : 0
round_score = base_score + guess_bonus + speed_bonus
```

## Acceptance criteria

Your `.md` response must include:

1. Exact standard game rules.
2. Exact feedback algorithm, including duplicate-letter handling.
3. Examples for duplicate-letter cases.
4. Round state machine.
5. Match state machine.
6. Score formula.
7. Example scoring calculations.
8. Tie-breaker order.
9. Rated/unrated differences.
10. Rating/MMR recommendation:
    - Glicko-2, TrueSkill-style, custom placement MMR, or Elo variant.
    - Explain why.
11. Rating calculation examples for multiplayer placement.
12. Function/API proposal for game-engine package.
13. Unit test plan.
14. Edge cases:
    - timeout
    - disconnect
    - reconnect
    - abandoned match
    - invalid guesses
    - duplicate submissions
    - simultaneous final guesses
    - voided match
15. Follow-up implementation tickets.

## Deliverable back to Athena

Return a Markdown file named similar to:

`wordle-royale-game-engine-scoring-rating-spec.md`

---

---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use this filename pattern:

`ticket-XX-agentname-short-title-response.md`

Use this response format:

```markdown
# [Ticket Title] — Response

## Summary

## Decisions / Recommendations

## Detailed Output

## Open Questions

## Follow-up Tickets

## Files Changed
If no files changed, write: None.

## Tests / Commands Run
If none, write: None — planning/spec task only.

## Evidence / Result

## Risks / Blockers
```

Do not invent files, commands, tests, outputs, deployments, or verification evidence.
