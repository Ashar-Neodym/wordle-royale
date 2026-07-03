# Ticket 41 — Ranked Gameplay Persistence Service Plan and First Live Match Slice

**Assigned agent:** Ruby
**Priority:** P0
**Type:** Gameplay/backend implementation plan or small slice
**Response file:** `agent-communication/responses/ticket-41-ruby-ranked-gameplay-persistence-first-live-match-slice-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-32-37.md`

## Objective

Prepare the ranked gameplay backbone for a chess.com/lichess-for-Wordle product: persist a minimal match/round/guess flow using the existing game engine, contracts, Prisma schema, and rating direction.

## Product context

Ashar's vision is: Wordle Royale should become for Wordle what chess.com / lichess are for chess, including Elo/MMR ratings, competitive ranked play, leaderboards, fair server-authoritative outcomes, and replayable social loops.

## Scope

1. Review game-engine package, rating tools, contracts, and Prisma match/round/guess/rating models.
2. Define the smallest live ranked/casual match persistence slice for V1.
3. Implement code/tests if dependencies are ready and scope remains small.
4. If implementation is too risky before live DB verification, produce a concrete file-level implementation plan and acceptance tests for Freya.
5. Keep authority server-side: clients submit guess intent only, never answer/score/feedback/rating authority.
6. Preserve spoiler safety and do not import production/proprietary dictionaries.

## Acceptance criteria

- If implementation occurs: relevant package/API tests pass and root build passes.
- If planning-only: response contains exact models, service boundaries, endpoints/events, and tests for the next implementation ticket.
- Elo/MMR/ranked implications are explicitly considered.
- Server-authoritative scoring and spoiler safety are preserved.
- Do not push.

## Required response format

Create `agent-communication/responses/ticket-41-ruby-ranked-gameplay-persistence-first-live-match-slice-response.md` with: Summary, Decisions / Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests / Commands Run, Evidence / Result, Risks / Blockers.

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Free/open-source/local-first only unless approved.
- No production word datasets, secrets, paid services, or push.
