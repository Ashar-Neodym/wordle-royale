# Wordle Royale — Athena Decision Locks After Tickets 11-17

This file supersedes `2026-06-22-athena-decision-locks-after-tickets-01-10.md` for the first build wave.

## Source responses reviewed

- Ticket 11 — Backend Foundation Implementation Plan
- Ticket 12 — Frontend Design System and App Shell Implementation Plan
- Ticket 13 — Word Import Tooling Implementation Plan
- Ticket 14 — Spec Consistency Review and Release Gate Plan
- Ticket 15 — Rating/MMR Simulation and Balance Plan
- Ticket 16 — Local Dev, CI, and Operational Readiness Plan
- Ticket 17 — Brand Token and UI Contract Plan

## Build-wave locks

- Package manager: `pnpm`.
- Workspace style: monorepo.
- Initial root layout:
  - `apps/api` — NestJS backend/API/Socket.IO/worker code.
  - `apps/web` — Next.js web app.
  - `apps/mobile` — Expo React Native app, placeholder acceptable in first scaffold if Expo setup is too heavy.
  - `packages/contracts` — shared TypeScript/Zod schemas, enums, event names, API envelopes.
  - `packages/game-engine` — pure deterministic game logic.
  - `packages/design-tokens` — Crown Grid Arena tokens, web/native exports.
  - `packages/fixtures` — test fixtures shared across apps/packages.
  - `packages/word-tools` — dictionary fixture/import/validation tooling.
  - `packages/rating-tools` — MMR simulation tooling.
- TypeScript across all packages.
- Shared contracts/enums should be created before deep backend/frontend integration.
- Use Zod + TypeScript as initial contract source of truth; OpenAPI/Nest Swagger can be generated later from backend routes if useful.
- Consent enum spelling: `training_insights_opt_in`.
- Rated private lobbies: reject/disable for V1 unless feature-flagged later.
- Share cards: spoiler-safe text/metadata first; image generation deferred.
- Repository should not commit production third-party word-list sources until licensing is approved. Commit only safe fixture words and source metadata templates.
- Local infra: Docker Compose for PostgreSQL 16 and Redis 7 only; app processes run via pnpm scripts.
- Provider-specific deployment is deferred until after local build/tests work.

## Ranked/MMR locks for implementation

- Base rating: 1500.
- Start simulation with pairwise Elo-style expectation inside placement groups.
- Average pairwise deltas for multiplayer placements.
- Established-player K candidate: 24.
- Provisional candidate: K=36 or 1.5x for first 10 rated matches.
- Delta cap candidates: ±40 established, ±60 provisional.
- Ranked beta should start 1v1 unless Ashar explicitly asks for multiplayer ranked beta.
- Multiplayer ranked remains feature-flagged until simulation + QA + telemetry pass.
- Beta ratings can reset before public launch.

## Release gates reinforced

- Ticket 10 remains mandatory contract baseline; do not implement from Ticket 02 alone.
- Idempotency is P0: lobby join/leave, match start, guess submit, rating apply, void/reversal.
- Duplicate-letter feedback correctness is release-blocking.
- Dictionary licensing is a production/public-release blocker, not a local fixture blocker.
- `Wordle Royale` trademark/legal risk is a public-launch blocker, not a local build blocker.
- Consent enforcement must be server-side.
- Full match reports are participant-only; public share cards must be spoiler-safe.
