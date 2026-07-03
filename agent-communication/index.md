# Wordle Royale — Ticket Index

## Current status

Responses reviewed through Ticket 71. Athena wrote current Wave J review:

`docs/2026-07-01-athena-review-after-tickets-65-71.md`

Wave J is PASS after Athena fixed Jasmine's whitespace finding in `apps/mobile/README.md` and reran the verification gates.

## Product direction

Ashar's vision: Wordle Royale should be for Wordle what chess.com / lichess are for chess — competitive, social, ranked, replayable, multi-page, and rating-driven with Elo/MMR as a core loop.

## Visual/product correction

UI should stay human, calm, functional, minimal, game-first, rating/community oriented — closer to lichess than a glossy AI/SaaS dashboard. Ashar likes the improvement but wants more real page depth, dropdowns, product navigation, and safe responsive behavior across web and mobile.

## Completed responses

Tickets 01–71 responses are present in `agent-communication/responses/`.

## Wave K — GitHub checkpoint and product depth

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 72 | Yuna | GitHub Checkpoint Branch/PR and CI Monitor | Done with caveat: branch pushed; PR/CI needs manual PR/auth |
| 73 | Elisa | Product Navigation and Route Contracts v2 | Done; route contracts saved |
| 74 | Freya | Profile and Match History API Read Model Slice | New; K.1 |
| 75 | Luna | Web Route Depth: Profile, History, and Match Detail UI | New; K.2 |
| 76 | Ruby | Lobby Discovery and Matchmaking UX Slice | New; K.1/K.2 |
| 77 | Luna | Mobile Navigation and Bounds Follow-Up | New; K.2 optional phone smoke |
| 78 | Elisa | Privacy-Safe Product Analytics and Event Taxonomy Plan | New; K.1 planning |
| 79 | Jasmine | QA Review Wave K GitHub Checkpoint and Product Depth | New; K.3 last |

## Recommended order

1. Wave K.0 parallel: Tickets 72 and 73.
2. Wave K.1: Tickets 74, 76, and 78 after/with Ticket 73 direction.
3. Wave K.2: Tickets 75 and 77 after route/API shape is clear.
4. Wave K.3: Ticket 79 last.

## Persistent constraints

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Preserve spoiler safety and server authority for gameplay/rating logic.
- GitHub checkpoint is now desired; prefer branch/PR unless Ashar explicitly wants direct `main` push.
