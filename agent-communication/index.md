# Wordle Royale — Ticket Index

## Current status

Responses reviewed through Ticket 17. Athena wrote current build-wave decision locks:

`docs/2026-06-22-athena-decision-locks-after-tickets-11-17.md`

## Completed responses

Tickets 01–17 responses are present in `agent-communication/responses/`.

## Next build wave

### Wave C0 — blocking scaffold

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 18 | Ruby | Monorepo Foundation Scaffold | Send first; blocks coding parallelism |

### Wave C1 — send after Ticket 18 completes

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 19 | Freya | Game Engine Core Implementation | Ready after 18 |
| 20 | Ruby | Word Fixture Tooling Implementation | Ready after 18 |
| 21 | Luna | Design Tokens and UI Fixture Foundation | Ready after 18 |
| 22 | Yuna | Local Dev Docker/Env/CI Skeleton | Ready after 18 |
| 23 | Jasmine | Implementation QA Gates for First Build | Ready after 18 |

### Wave C1 optional if Ruby is free

| Ticket | Agent | Title | Status |
|---|---|---|---|
| 24 | Ruby | Rating Tools Simulation Implementation | Ready after 18; can wait if Ruby busy with 20 |

## Hold

Backend NestJS app implementation, Prisma schema, frontend apps, and live integration should wait until Wave C1 outputs are reviewed.

## Wave D — Tickets 25-31

Created after Athena review `docs/2026-06-23-athena-review-after-tickets-18-24.md`.

- Ticket 25 — Elisa — Shared Contracts for Auth, Lobby, Gameplay, and Realtime Events
- Ticket 26 — Ruby — Database and Prisma Schema Foundation
- Ticket 27 — Freya — NestJS API Skeleton with Health, Auth Stub, and Lobby Stub
- Ticket 28 — Luna — Next.js Web App Shell with Design Tokens and Fixture Screens
- Ticket 29 — Luna — Expo Mobile App Shell with Design Tokens and Fixture Screens
- Ticket 30 — Yuna — CI Quality Gates and GitHub Actions Hardening
- Ticket 31 — Jasmine — QA Review Gates for Contracts, API, Web, Mobile, DB, and CI Wave

Recommended order:

1. Wave D0 parallel: Ticket 25 (Elisa), Ticket 26 (Ruby), Ticket 28 (Luna), Ticket 30 (Yuna).
2. Wave D1 after Ticket 25/26 are complete or mostly complete: Ticket 27 (Freya).
3. Wave D1 optional/sequential for Luna: Ticket 29 after Ticket 28 unless Luna can safely work in parallel branches.
4. Wave D2 final verification: Ticket 31 (Jasmine) after implementation responses are present.

