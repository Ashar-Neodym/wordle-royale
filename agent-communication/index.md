# Wordle Royale — Ticket Index

## Current status

Wave K merged to `main` via PR #1 and post-merge CI passed.

Current review doc:

`docs/2026-07-01-athena-review-after-wave-k-merge.md`

## Product direction

Ashar's vision: Wordle Royale should be for Wordle what chess.com / lichess are for chess — competitive, social, ranked, replayable, multi-page, and rating-driven with Elo/MMR as a core loop.

## Visual/product correction

UI should stay human, calm, functional, minimal, game-first, rating/community oriented — closer to lichess than a glossy AI/SaaS dashboard. Continue adding real product depth, not decorative pages.

## Completed checkpoint

Tickets 01–79 are complete through Wave K. PR #1 merged to `main` and GitHub Actions passed on the merge commit.

## Wave L — Public-preview readiness

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 80 | Elisa | Preview MVP Auth, Account, and Deployment Boundary | New; L.0 critical planning |
| 81 | Yuna | Preview Deployment, CI, and Environment Plan | New; L.0 critical planning |
| 82 | Freya | Preview Session and Current User Slice | New; L.1 after 80 |
| 83 | Ruby | Player-Facing Ranked Loop Polish: Rematch, Share, and Result Actions | New; L.1 |
| 84 | Luna | Web Preview Polish: Result Actions, Invite/Share, and Auth-Aware Empty States | New; L.2 |
| 85 | Luna | Mobile Expo Real-Device Smoke Closure and Preview UX Polish | New; L.2 optional device smoke |
| 86 | Yuna | Wave L Checkpoint PR and Main CI Monitor | New; L.3 after implementation |
| 87 | Jasmine | QA Review Wave L Preview Readiness | New; L.4 final |

## Recommended order

1. L.0 parallel: Tickets 80 and 81.
2. L.1: Tickets 82 and 83 after/with Ticket 80 direction.
3. L.2: Ticket 84, then Ticket 85 if Luna has capacity / phone smoke available.
4. L.3: Ticket 86 checkpoint PR.
5. L.4: Ticket 87 QA last.

## Persistent constraints

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Do not deploy, create external services, or configure production secrets without explicit Ashar approval.
- Preserve spoiler safety and server authority for gameplay/rating logic.
- Use branch + PR + GitHub Actions for checkpoints.
