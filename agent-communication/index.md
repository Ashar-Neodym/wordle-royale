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
