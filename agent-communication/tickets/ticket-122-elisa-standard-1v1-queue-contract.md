# Ticket 122 — Standard 1v1 Queue Contract and Persistence Decision

Agent: Elisa (architect)
Wave: R — Live Standard 1v1 Matchmaking
Status: New

## Goal

Turn the approved chess-style product direction into an implementation-ready contract for the first real automatic ranked queue: `standard_1v1`.

## Context

Read:

- `docs/2026-07-09-chess-style-ranked-system-contract.md`
- `agent-communication/responses/ticket-121-jasmine-qa-review-wave-q-follow-up-hosted-preview-response.md`
- current lobby/gameplay/rating contracts and Prisma schema

Preview currently runs one Railway API instance without required Redis. Do not introduce paid infrastructure or make Redis mandatory.

## Decisions required

- DB-backed versus single-instance in-memory queue; prefer durable DB-backed semantics suitable for restarts.
- Queue join, status, cancel, matched, timeout, stale-entry cleanup, and reconnect states.
- Atomic pairing and duplicate/concurrent request protection.
- Rating-band expansion over queue time and provisional-player handling.
- Server-authoritative `standard_1v1` match creation and opponent assignment.
- Abuse constraints: self-match, repeat opponent, queue dodging, cancel-after-match, and duplicate sessions.
- Exact API contracts and persistence fields for Tickets 123–125.

## Acceptance criteria

- Produces a concise decision-lock document under `docs/`.
- Defines request/response/error schemas and state transitions.
- Defines transactional pairing/idempotency rules and cleanup behavior.
- Keeps `speed_1v1`, `classic_1v1`, and multiplayer out of live scope.
- Includes migration/rollback and test requirements.
- No production/provider mutation.

## Verification

```bash
CI=true pnpm typecheck
git diff --check
```
