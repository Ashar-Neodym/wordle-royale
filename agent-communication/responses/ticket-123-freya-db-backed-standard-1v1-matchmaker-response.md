# Ticket 123 — Database-Backed Standard 1v1 Queue and Matchmaker Response

Agent: Freya (backend implementation)
Status: Complete
Date: 2026-07-10

## Summary

Implemented the server-authoritative `standard_1v1` queue and matchmaker defined by Ticket 122. Queue state is durable in PostgreSQL, authenticated users can join/reconnect/cancel through spoiler-safe endpoints, and pairing atomically creates one shared match through the existing gameplay persistence path.

The final review fix uses a strict-then-relaxed repeat-opponent search: fresh eligible opponents are always preferred, and a recent opponent is considered only when the strict pass is empty and both queue tickets have waited at least 30 seconds.

## Changes made

### Durable queue persistence

- Added the `MatchmakingTicket` model, queue-state enum, relations, rating/provisional snapshots, search-window fields, expiry/terminal timestamps, matched identifiers, and idempotency key.
- Added a migration with:
  - uniqueness for `(userId, mode, idempotencyKey)`;
  - a partial unique index preventing more than one active `queued`/`matched` ticket per user and mode;
  - first-class `rankedMode` storage on queue-created matches.
- Added schema assertions for the durable ticket model and active-ticket constraint.
- Included `MatchmakingTicket` in application-schema readiness requirements.

### Authenticated API and shared contracts

- Added shared Zod schemas/types for Standard 1v1 queue requests, tickets, matched-opponent summaries, and search-window state.
- Added authenticated endpoints for:
  - joining the Standard queue;
  - reading the current active ticket;
  - reconnecting to a ticket by ID;
  - cancelling a queued ticket.
- New joins return `201`; idempotent replay or duplicate-active recovery returns `200`.
- Unsupported modes and unrated requests fail explicitly.
- Queue responses expose no answer word, answer hash, or server-only matching internals.

### Transaction-safe matching

- Uses PostgreSQL-backed queue state rather than process memory.
- Candidate selection uses deterministic ordering with `FOR UPDATE SKIP LOCKED` inside serializable transactions.
- Known serialization/deadlock failures receive bounded retries.
- Pairing rechecks ticket state, prevents self-pairing, conditionally transitions both tickets, and creates one deterministic shared match.
- Match, participant, round, answer-authority, ticket-transition, and audit writes occur through the server-authoritative persistence flow.
- Candidate compatibility is reciprocal for rating windows and provisional-player preferences.
- Candidates must retain an active `standard_1v1` rating profile using `standard_1v1_glicko_v1`.
- Search windows expand at 10, 20, and 30 seconds.

### Repeat-opponent and lifecycle handling

- The first candidate pass excludes opponents from recent `completed` or `voided` Standard matches within 12 hours.
- A second pass can allow a recent opponent only after the requester and candidate have both waited 30 seconds.
- The final defensive post-lock check uses the same terminal statuses and `COALESCE(completedAt, updatedAt)` semantics as candidate SQL.
- Added a regression test proving a fresh opponent is preferred over a closer recent opponent after relaxation becomes available, including a recent voided-match case.
- Expired queued tickets transition to `timed_out`.
- Completed/voided matched tickets transition out of the active-ticket constraint so users can queue again.
- Cancellation is idempotent while queued and rejected after pairing.
- Structured audit events cover queueing, matching, cancellation, timeout, and ticket consumption.

## Primary Ticket 123 files

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/schema.test.mjs`
- `apps/api/prisma/migrations/20260710000000_standard_1v1_matchmaking/migration.sql`
- `apps/api/src/app.module.ts`
- `apps/api/src/matchmaking/matchmaking.controller.ts`
- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/test/matchmaking.test.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/matchmaking/schemas.ts`
- `packages/contracts/src/matchmaking/types.ts`
- `apps/api/README.md`

The worktree also contains parallel Wave R work for Tickets 124 and 125. Those files/changes were preserved and not reverted.

## Verification

Commands run from the repository root after the final code and regression-test changes:

```bash
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test test/matchmaking.test.ts
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm --filter @wordle-royale/api db:validate
CI=true pnpm --filter @wordle-royale/api build
CI=true pnpm secret-scan
git diff --check
```

Results:

- Focused matchmaking tests — PASS, exit 0; 12/12 tests passed.
- Full API tests — PASS, exit 0; 72/72 tests passed.
- Prisma schema validation — PASS, exit 0; schema valid.
- API build/typecheck — PASS, exit 0.
- Secret scan — PASS, exit 0; 200 source/config files scanned.
- `git diff --check` — PASS, exit 0.
- The new migration chain and fixture seed were also exercised successfully against a fresh local database volume earlier in this ticket. No hosted database was mutated.

## Acceptance criteria mapping

- Only `standard_1v1` is live; unsupported modes fail explicitly: implemented and tested.
- Queue survives API restart: queue source of truth is PostgreSQL.
- Concurrent duplicate/self pairing is prevented: implemented transactionally and covered by concurrency tests.
- Two authenticated preview-shaped users receive one shared match ID: covered by API tests.
- Cancel is safe before pairing and rejected after pairing: implemented and tested.
- Migration deploy/validate passes: fresh local migration application succeeded; final Prisma validation passes.
- No provider deployment or direct hosted DB mutation: none performed.

## Browser/visual and accessibility notes

- Not applicable for Ticket 123: this ticket is an API/persistence slice with no UI changes in its scope.

## Risks / follow-ups

- The in-memory test double verifies service behavior and concurrency/idempotency logic but does not itself prove live PostgreSQL lock scheduling. The migration and SQL shape are covered; Ticket 126 should include real local-Postgres two-client integration coverage where practical.
- Parallel Ticket 124 rating-settlement and Ticket 125 queue-UX changes coexist in the worktree and should be integration-tested together by Ticket 126.
- Hosted migration/deployment remains explicitly deferred to the later approved Wave R deployment tickets.
