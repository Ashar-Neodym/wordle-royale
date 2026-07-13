# Ticket 122 — Standard 1v1 Queue Contract and Persistence Decision — Response

Task: Ticket 122 — Standard 1v1 Queue Contract and Persistence Decision
Agent: Elisa (architect)
Status: Complete — architecture/contract decision lock; no code/provider mutation

## Summary

Created the Wave R implementation contract for the first live automatic ranked queue: `standard_1v1`.

Primary decision: use a **database-backed matchmaking ticket table** in the already-approved Supabase Postgres database, not an in-memory queue. This keeps Redis optional, survives Railway restarts/deploys, supports reconnect/status polling, and gives Freya/Ruby/Luna stable contracts for Tickets 123–125.

## Design output

Created:

- `docs/2026-07-10-standard-1v1-queue-contract.md`

The document defines:

- queue API endpoints;
- request/response/error schemas;
- ticket state transitions;
- durable persistence fields;
- transaction/idempotency rules;
- atomic pairing behavior;
- rating-band expansion;
- provisional-player handling;
- duplicate/self-match/repeat-opponent protections;
- cleanup behavior;
- migration/rollback guidance;
- test requirements and agent handoff.

## Key decisions

### 1. Persistence

Use a DB-backed queue table:

```text
MatchmakingTicket
- id
- userId
- mode=standard_1v1
- rated=true
- state=queued|matched|cancelled|timed_out|failed
- ratingAtQueue
- provisionalAtQueue
- allowProvisionalOpponent
- searchMinRating/searchMaxRating/expansionStep
- matchedMatchId
- matchedOpponentUserId
- idempotencyKey
- createdAt/updatedAt/expiresAt/cancelledAt/timedOutAt/failedAt
```

Recommended partial unique SQL index:

```sql
CREATE UNIQUE INDEX matchmaking_ticket_one_active_per_user_mode
ON "MatchmakingTicket" ("userId", "mode")
WHERE "state" IN ('queued', 'matched');
```

Prisma caveat recorded: this partial index likely needs raw SQL in the migration because Prisma schema cannot model it directly.

### 2. API contract

Recommended endpoints:

```text
POST   /matchmaking/standard-1v1/tickets
GET    /matchmaking/standard-1v1/tickets/current
GET    /matchmaking/standard-1v1/tickets/{ticketId}
DELETE /matchmaking/standard-1v1/tickets/{ticketId}
```

Only `standard_1v1` and `rated=true` are live in Wave R. `speed_1v1`, `classic_1v1`, and multiplayer stay out of live scope.

### 3. State transitions

Public ticket states:

```text
queued -> matched
queued -> cancelled
queued -> timed_out
queued -> failed
```

Cancellation after `matched` is rejected. Once a ticket is matched, leaving becomes gameplay abandonment/no-contest handling, not queue cancellation.

### 4. Pairing transaction

Ticket 123 should pair inside one DB transaction:

1. Upsert/find active ticket with idempotency.
2. Expire stale queued tickets.
3. Lock the requester ticket.
4. Select one compatible queued candidate using row-lock semantics (`FOR UPDATE SKIP LOCKED` if needed via raw SQL).
5. Create server-authoritative ranked match.
6. Create exactly two participants with deterministic seat order.
7. Create the initial round with server-selected puzzle.
8. Update both tickets to `matched` with the same `matchedMatchId`.
9. Commit.

### 5. Matchmaking rules

Rating window expansion:

```text
0–9s:   ±100
10–19s: ±200
20–29s: ±300
30s+:   ±400
```

Candidate constraints:

- same mode: `standard_1v1`;
- rated only;
- no self-match;
- active rating profile;
- unexpired queued ticket;
- reciprocal rating-window compatibility;
- provisional preference/filter support;
- repeat-opponent cooldown best effort.

### 6. Abuse/safety locks

Defined protections for:

- duplicate sessions / duplicate queue requests;
- self-match attempts;
- repeat opponents;
- queue dodging;
- cancel-after-match;
- spoiler safety;
- idempotent match creation;
- exactly-once rating settlement handoff.

## Files changed

Created:

- `docs/2026-07-10-standard-1v1-queue-contract.md`
- `agent-communication/responses/ticket-122-elisa-standard-1v1-queue-contract-response.md`

No product source code, provider settings, deployments, or secrets were changed.

## Verification

```text
# date +%F
2026-07-10

# CI=true pnpm typecheck
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).

# git diff --check
<no output; exit 0>

# pnpm secret-scan
$ node scripts/secret-scan.mjs
Secret scan passed (192 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.

# git status --short --branch
## main...origin/main
 M agent-communication/index.md
?? agent-communication/responses/ticket-120-yuna-hosted-preview-wave-q-deploy-smoke-response.md
?? agent-communication/responses/ticket-121-jasmine-qa-review-wave-q-follow-up-hosted-preview-response.md
?? agent-communication/responses/ticket-122-elisa-standard-1v1-queue-contract-response.md
?? agent-communication/tickets/ticket-122-elisa-standard-1v1-queue-contract.md
?? agent-communication/tickets/ticket-123-freya-db-backed-standard-1v1-matchmaker.md
?? agent-communication/tickets/ticket-124-ruby-standard-1v1-rating-settlement.md
?? agent-communication/tickets/ticket-125-luna-live-standard-1v1-queue-ux.md
?? agent-communication/tickets/ticket-126-jasmine-wave-r-standard-queue-integration-qa.md
?? agent-communication/tickets/ticket-127-yuna-wave-r-checkpoint-pr-ci.md
?? agent-communication/tickets/ticket-128-yuna-hosted-preview-wave-r-deploy-smoke.md
?? agent-communication/tickets/ticket-129-jasmine-final-hosted-wave-r-qa.md
?? docs/2026-07-10-standard-1v1-queue-contract.md
```

Note: `pnpm secret-scan` excludes `docs` and `agent-communication`, where this ticket's Markdown artifacts live; I manually kept the new artifacts free of real secrets.

## Acceptance criteria status

| Criterion | Status |
|---|---:|
| Produces concise decision-lock document under `docs/` | Pass |
| Defines request/response/error schemas and state transitions | Pass |
| Defines transactional pairing/idempotency rules and cleanup behavior | Pass |
| Keeps `speed_1v1`, `classic_1v1`, and multiplayer out of live scope | Pass |
| Includes migration/rollback and test requirements | Pass |
| No production/provider mutation | Pass |

## Implementation handoff

### Freya / Ticket 123

Implement DB-backed `standard_1v1` queue and matchmaker:

- add `MatchmakingTicket` table/enum/index migration;
- use active-ticket partial unique index;
- implement create/status/current/cancel endpoints;
- pair with transaction/row-lock semantics;
- create server-authoritative match/participants/round;
- keep Redis optional.

### Ruby / Ticket 124

Activate rating settlement for queue-created `standard_1v1` matches:

- settle against `standard_1v1` rating profile;
- preserve append-only rating events;
- guarantee exactly-once settlement.

### Luna / Ticket 125

Build live queue UI:

- idle/create queue;
- queued polling;
- cancellation;
- timeout retry;
- matched navigation;
- reconnect via `GET current`;
- copy says only Standard queue is live.

### Jasmine / Ticket 126

QA should target:

- two-user queue match;
- concurrent duplicate requests;
- cancel/match race;
- timeout cleanup;
- no spoiler leak;
- Redis remains optional;
- rating settlement happens exactly once.

## Risks / follow-ups

- Partial unique active-ticket index requires raw SQL migration review.
- Prisma may need raw SQL for row-lock candidate selection.
- DB-backed queue is acceptable for preview but not the final high-scale architecture; Redis/realtime can be introduced later when traffic justifies it.
- Current gameplay uses 120s round timing; contract keeps 120s for compatibility unless Ashar approves changing Standard to 180s.
