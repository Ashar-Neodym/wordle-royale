# Standard 1v1 queue contract and persistence decision — Wave R

Date: 2026-07-10
Owner: Elisa
Ticket: 122 — Standard 1v1 Queue Contract and Persistence Decision
Status: decision lock for implementation; no code/provider mutation

## 1. Decision summary

Wave R should implement the first live automatic ranked queue for `standard_1v1` using a **database-backed matchmaking ticket table**, not a single-process in-memory queue.

Rationale:

- The hosted preview currently runs one Railway API instance, but restarts/deploys are expected. In-memory queue entries would disappear and create confusing user states.
- Supabase Postgres is already the approved preview database; a DB-backed queue adds no paid infrastructure and keeps Redis optional.
- Standard 1v1 pairing volume is expected to be small in preview, so Postgres row locks and simple polling are acceptable.
- The design keeps a clean upgrade path to Redis later for high-throughput hot queues, presence, pub/sub, and realtime.

Explicit live scope:

- In scope: ranked `standard_1v1` automatic queue, two-player match creation, status polling/reconnect, cancellation, timeout, stale cleanup, and single rating-settlement handoff.
- Out of scope: `speed_1v1`, `classic_1v1`, `multiplayer_lobby`, private rated matches, paid infrastructure, Redis requirement, provider/deploy changes.

## 2. Product behavior contract

### 2.1 User flow

1. Authenticated preview/demo user presses **Find Standard match**.
2. Client sends `POST /matchmaking/standard-1v1/tickets` with a `clientRequestId`.
3. Server creates or returns the user's active ticket.
4. Server attempts to pair immediately inside the same transaction.
5. If no opponent is available, ticket remains `queued` and client polls status.
6. When paired, both tickets move to `matched`, a server-authoritative ranked match is created, and both clients receive the same `matchId`.
7. Client navigates to the live match route using `matchedMatchId`.
8. If no opponent appears before expiry, ticket becomes `timed_out` and the UI offers retry or lobby fallback.
9. User can cancel only while ticket state is `queued`; cancellation after `matched` is not allowed and should be treated as entering/abandoning the match flow.

### 2.2 Queue states

Use this state machine for `standard_1v1` matchmaking tickets:

```text
queued -> matched
queued -> cancelled
queued -> timed_out
queued -> failed
matched -> consumed     optional/internal after client enters match
matched -> stale_matched optional/internal cleanup marker only if match creation was rolled back/invalid
```

MVP public DTO states should remain small:

```ts
type MatchmakingTicketState =
  | 'queued'
  | 'matched'
  | 'cancelled'
  | 'timed_out'
  | 'failed';
```

Implementation notes:

- `consumed` is optional and not required for Ticket 123. If used, keep it internal or expose only after Luna needs it.
- `matched` is terminal for cancellation. A matched player who leaves should be handled by gameplay abandonment/no-contest rules, not by reopening queue tickets.
- `failed` is for server errors that happen after ticket creation but before a valid match exists.

### 2.3 Reconnect contract

- A user may have at most one active `standard_1v1` ticket in `queued` or `matched` state.
- Repeating `POST` with the same `clientRequestId` must return the same ticket.
- Repeating `POST` with a different `clientRequestId` while an active ticket exists must return the active ticket with an `already_queued` semantic, not create a duplicate.
- `GET /matchmaking/standard-1v1/tickets/current` should return the active ticket if one exists, so a page refresh can reconnect.
- If the active ticket is `matched`, status response must include `matchedMatchId` and enough routing data for Luna to enter the match screen.

## 3. API contract

All responses use the existing response envelope pattern.

### 3.1 Create/join queue

```http
POST /matchmaking/standard-1v1/tickets
```

Request:

```ts
type CreateStandard1v1TicketRequest = {
  clientRequestId: string; // uuid, idempotency key from client
  mode: 'standard_1v1';
  rated: true;
  allowProvisionalOpponent?: boolean; // default true
};
```

Server-derived fields, not accepted from client:

- `userId`
- `ratingAtQueue`
- `searchMinRating`
- `searchMaxRating`
- `expansionStep`
- `expiresAt`
- `matchedMatchId`
- opponent identity
- dictionary release / answer / puzzle timing
- rating delta or result

Successful response codes:

- `201` when a new ticket is created.
- `200` when the request is idempotently replayed or an active ticket already exists.

Response:

```ts
type Standard1v1TicketDto = {
  ticketId: string;
  state: 'queued' | 'matched' | 'cancelled' | 'timed_out' | 'failed';
  mode: 'standard_1v1';
  rated: true;
  userId: string;
  ratingAtQueue: number;
  provisional: boolean;
  searchWindow: {
    minRating: number;
    maxRating: number;
    expansionStep: 0 | 1 | 2 | 3 | 4;
  };
  estimatedWaitSeconds: number | null;
  matchedMatchId: string | null;
  matchedOpponent?: {
    userId: string;
    displayName: string;
    handle: string | null;
    ratingAtQueue: number;
    provisional: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  cancelledAt: string | null;
  timedOutAt: string | null;
};
```

### 3.2 Get ticket status

```http
GET /matchmaking/standard-1v1/tickets/{ticketId}
GET /matchmaking/standard-1v1/tickets/current
```

Rules:

- User can only read their own ticket.
- `current` returns `204` or an envelope with `data: null` when no active ticket exists; pick one convention and keep Luna aligned.
- Status reads may opportunistically run stale cleanup for that user's expired ticket, but must not depend on the client polling for global cleanup.

### 3.3 Cancel ticket

```http
DELETE /matchmaking/standard-1v1/tickets/{ticketId}
```

Request body is optional; if used:

```ts
type CancelStandard1v1TicketRequest = {
  clientRequestId: string;
};
```

Rules:

- `queued -> cancelled` is allowed.
- `matched -> cancelled` is rejected with `ticket_already_matched`.
- `timed_out` or `cancelled` replay returns the terminal ticket without error.
- Cancelling another user's ticket returns `404` or `403`; prefer `404` to avoid user enumeration.

### 3.4 Error codes

Use stable machine-readable codes:

| Code | HTTP | Meaning |
|---|---:|---|
| `not_authenticated` | 401 | User/session required. |
| `standard_1v1_queue_disabled` | 503 | Feature flag disabled or dependency unavailable. |
| `unsupported_matchmaking_mode` | 400 | Anything except `standard_1v1` submitted to this endpoint. |
| `rated_required` | 400 | Standard queue is ranked only in Wave R. |
| `active_ticket_exists` | 200 or 409 | Prefer 200 with current ticket; 409 only if API style requires strict conflict. |
| `ticket_not_found` | 404 | Missing or unauthorized ticket. |
| `ticket_not_cancellable` | 409 | Terminal state or already matched. |
| `rating_profile_unavailable` | 409 | User lacks active `standard_1v1` rating profile and auto-create failed. |
| `match_creation_failed` | 500 | Transaction failed after pairing candidate; mark ticket failed only if durable partial state exists. |
| `queue_rate_limited` | 429 | Abuse throttling. |

## 4. Persistence model

### 4.1 Table recommendation

Add a first-class table rather than storing tickets in JSON:

```prisma
enum MatchmakingTicketState {
  queued
  matched
  cancelled
  timed_out
  failed
}

model MatchmakingTicket {
  id                    String                  @id @default(uuid())
  userId                String
  mode                  RankedMode              @default(standard_1v1)
  rated                 Boolean                 @default(true)
  state                 MatchmakingTicketState  @default(queued)
  ratingAtQueue         Int
  provisionalAtQueue    Boolean                 @default(true)
  allowProvisionalOpponent Boolean              @default(true)
  searchMinRating       Int
  searchMaxRating       Int
  expansionStep         Int                     @default(0)
  matchedMatchId        String?
  matchedOpponentUserId String?
  idempotencyKey        String
  createdAt             DateTime                @default(now())
  updatedAt             DateTime                @updatedAt
  expiresAt             DateTime
  cancelledAt           DateTime?
  timedOutAt            DateTime?
  failedAt              DateTime?
  failureCode           String?

  user         UserAccount @relation(fields: [userId], references: [id], onDelete: Cascade)
  matchedMatch Match?      @relation(fields: [matchedMatchId], references: [id], onDelete: SetNull)

  @@unique([userId, mode, idempotencyKey])
  // Implement partial unique active ticket index in SQL migration:
  // unique (user_id, mode) where state in ('queued', 'matched')
  @@index([mode, state, searchMinRating, searchMaxRating, createdAt])
  @@index([state, expiresAt])
  @@index([matchedMatchId])
}
```

Prisma caveat: partial indexes are not expressible in Prisma schema. Ticket 123 should add raw SQL in the migration for the active-ticket uniqueness constraint.

Recommended SQL shape:

```sql
CREATE UNIQUE INDEX matchmaking_ticket_one_active_per_user_mode
ON "MatchmakingTicket" ("userId", "mode")
WHERE "state" IN ('queued', 'matched');
```

### 4.2 Why not in-memory

Do not use in-memory queue for Wave R because it fails these requirements:

- loses queue state on deploy/restart;
- cannot reconnect users reliably after refresh;
- cannot safely prevent duplicates across future multiple API instances;
- cannot support durable audit/debugging for disputes;
- creates a harder migration path once live users depend on it.

A memory-only local fallback is acceptable only in unit tests/mocks, not in runtime preview.

## 5. Pairing algorithm and transaction contract

### 5.1 Rating window expansion

Use the Wave P expansion schedule for `standard_1v1`:

| Elapsed queued time | Window |
|---:|---:|
| 0–9s | ±100 |
| 10–19s | ±200 |
| 20–29s | ±300 |
| 30s+ | ±400 |

Ticket 123 should calculate expansion from `createdAt` at pair-attempt time, update `searchMinRating`, `searchMaxRating`, and `expansionStep`, then look for candidates.

MVP constants:

```text
queueTtlSeconds=60
staleMatchedGraceSeconds=120
repeatOpponentCooldownHours=12
provisionalGames=10
```

### 5.2 Candidate selection

For a new/queued ticket A, candidate B must satisfy:

- B.state = `queued`
- B.mode = `standard_1v1`
- B.rated = true
- B.userId != A.userId
- B.user's rating profile status = `active`
- A.ratingAtQueue within B window and B.ratingAtQueue within A window
- B.expiresAt > now
- no recent completed/voided standard_1v1 match between A and B inside repeat-opponent cooldown, unless both have waited >= 30s and there are no alternatives
- if `allowProvisionalOpponent=false`, candidate cannot be provisional

Ordering:

1. Narrowest rating distance.
2. Prefer provisional-vs-provisional or established-vs-established.
3. Older `createdAt` first.
4. Stable tie-break by `id`.

### 5.3 Atomic pairing

Ticket 123 should pair inside one DB transaction:

1. Upsert/find current user's active ticket using `idempotencyKey` and active-ticket unique constraint.
2. If already `matched`, return it.
3. Update expired queued tickets to `timed_out` before candidate search.
4. Lock ticket A row.
5. Select and lock one candidate row with `FOR UPDATE SKIP LOCKED` semantics.
6. Create a `Match` with:
   - `mode='ranked'`
   - `algorithmConfigVersion='placement_mmr_v1'` until Ruby/Ticket 124 changes it
   - idempotency key `matchmaking:standard_1v1:{minTicketId}:{maxTicketId}`
7. Create two `MatchParticipant` rows with deterministic seat order:
   - seat 1 = older ticket, then lower ticket id
   - seat 2 = other ticket
8. Create one `MatchRound` using server-selected dictionary/answer and standard rules.
9. Update both tickets to `matched`, `matchedMatchId`, `matchedOpponentUserId`.
10. Commit.

If Prisma cannot express row locking cleanly, use `$queryRaw` / `$executeRaw` for the lock candidate portion while keeping surrounding writes explicit and reviewed.

### 5.4 Idempotency

- Ticket creation idempotency key: `(userId, mode, clientRequestId)`.
- Active-ticket uniqueness: one active queued/matched ticket per `(userId, mode)`.
- Match creation idempotency key: deterministic from both ticket ids.
- Rating settlement idempotency remains separate and must key from match id + algorithm config + participant profile.
- Retrying after a transient network failure must return the same ticket/match, never create a second match.

## 6. Server-authoritative match creation

The queue creates a standard ranked match; clients never submit opponent, puzzle, result, rating, or placement.

Standard 1v1 match defaults:

```text
rankedMode=standard_1v1
players=2
wordLength=5
maxGuesses=6
rounds=1
roundTimeSeconds=120 for compatibility with current engine; can become 180 only after product approval
sameGuessTieBreaker=draw
scoringPreset=standard_v1
```

Implementation compatibility notes:

- Current Prisma `Match` has `mode: MatchMode` but no first-class `rankedMode` field. For Wave R MVP, store `standard_1v1` in a queryable new field if Ticket 123 adds one, or in `Match.algorithmConfigVersion`/metadata only as a temporary bridge if schema change is intentionally minimized. Elisa recommends adding a first-class `rankedMode` in a later schema hardening ticket if not already present.
- Current `RatingProfile.mode` and `LeaderboardSnapshot.mode` already use `RankedMode`; keep queue aligned to `standard_1v1` only.
- Use the same gameplay persistence service for server-selected dictionary/round creation, but do not let clients choose participant ids.

## 7. Abuse and safety constraints

### 7.1 Duplicate and self-match prevention

- Reject or return existing ticket when a user queues twice.
- Never pair tickets with the same `userId`.
- Do not trust client-provided opponent/user ids.
- Treat preview demo sessions as real users for duplicate protection.

### 7.2 Repeat opponent control

For MVP, enforce a best-effort repeat opponent cooldown:

```text
cooldown=12h
strict for first 30s in queue
relaxable after 30s only if no other candidates exist
```

If historical match query is expensive, Ticket 123 may implement a simpler first pass using recent `MatchParticipant` joins indexed by `userId, joinedAt`, then optimize later.

### 7.3 Queue dodging and cancel-after-match

- Cancels while `queued` are allowed but should be counted.
- Cancel after `matched` is not allowed.
- Leaving after match creation is gameplay abandonment/no-contest logic, not queue cancellation.
- Add audit/analytics events for:
  - queued
  - cancelled
  - timed_out
  - matched
  - match_create_failed
  - duplicate_active_ticket

### 7.4 Spoiler safety

Queue DTOs must not expose:

- answer word;
- answer hash salt/ref;
- dictionary answer candidate;
- opponent private session data;
- rating delta before match completion.

## 8. Cleanup behavior

### 8.1 Expiry

- New queued tickets expire after 60 seconds.
- Expired queued tickets transition to `timed_out` by:
  - scheduled/background cleanup if available;
  - opportunistic cleanup before pair attempts;
  - opportunistic cleanup on `GET current`/`GET ticket` for that user's ticket.

### 8.2 Stale matched rows

Matched tickets should normally remain durable evidence. Do not delete them automatically.

Only mark a matched ticket `failed` if:

- ticket row says matched but the referenced match is missing; or
- transaction left impossible partial state, which should be rare if transaction boundaries are correct.

### 8.3 Retention

For preview, keep terminal tickets for at least 7 days for debugging. Future cleanup may delete terminal `cancelled`/`timed_out` rows older than 30 days after analytics requirements are known.

## 9. Migration and rollback

### 9.1 Migration plan

Ticket 123 should:

1. Add `MatchmakingTicketState` enum.
2. Add `MatchmakingTicket` table.
3. Add indexes listed above, including raw SQL partial unique active-ticket index.
4. Add relation fields carefully; avoid breaking existing lobby/gameplay/profile reads.
5. Keep `REDIS_REQUIRED=false`; no `REDIS_URL` requirement.
6. Run Prisma validate/migration tests locally before PR.

### 9.2 Rollback plan

If Wave R queue has to be disabled after deploy:

- Disable queue endpoint with feature flag/config returning `standard_1v1_queue_disabled`.
- Leave existing matched matches and rating events intact.
- Do not drop table during emergency rollback; preserve audit/debug data.
- A schema rollback may drop only the queue table/enum if no live deploy has written production preview tickets, or after exporting/acknowledging data loss.

## 10. Test requirements

### 10.1 Contract/schema tests

Freya/Ticket 123:

- create ticket validates only `standard_1v1` and `rated=true`;
- duplicate `clientRequestId` returns same ticket;
- second different request returns existing active ticket;
- unsupported mode rejected;
- unauthenticated request rejected;
- cancel queued ticket succeeds;
- cancel matched ticket rejected.

### 10.2 Transaction/pairing tests

- two compatible users queue and receive the same `matchedMatchId`;
- simultaneous pair attempts do not create duplicate matches;
- self-match impossible;
- expired ticket is not paired;
- rating window expands at 10s/20s/30s;
- provisional filter is honored;
- repeat opponent cooldown is honored where implemented;
- match participants are deterministic and exactly two.

### 10.3 Integration tests

- queue-created match can be loaded by gameplay current-state endpoint;
- server-selected puzzle data remains spoiler-safe;
- completing a queue-created standard match triggers exactly one rating settlement path for Ticket 124;
- profile/leaderboard `standard_1v1` remains readable after settlement;
- Redis remains optional in readiness.

### 10.4 UI handoff tests

Luna/Ticket 125:

- initial idle state;
- queued polling state;
- matched navigation state;
- cancellation state;
- timeout retry state;
- reconnect after refresh via `current` endpoint;
- clear copy that only Standard queue is live.

## 11. Implementation handoff

### Freya / Ticket 123

Build DB-backed queue and matchmaker exactly for `standard_1v1`:

- add table/enum/index migration;
- add API module/controller/service;
- use transaction and row-lock semantics;
- create server-authoritative ranked match;
- keep Redis optional;
- return DTOs above.

### Ruby / Ticket 124

Activate rating settlement for queue-created `standard_1v1` matches:

- consume queue-created match results;
- use `standard_1v1` rating profile;
- ensure idempotent single settlement;
- preserve append-only rating event behavior.

### Luna / Ticket 125

Build UI against the queue DTOs:

- call create/status/cancel/current endpoints;
- poll while queued;
- navigate on `matchedMatchId`;
- show timeout/cancel/reconnect states;
- do not expose Speed/Classic/Multiplayer as live queues.

### Jasmine / Ticket 126

QA focus:

- two-user queue integration;
- concurrent request duplicates;
- cancel/match race;
- timeout cleanup;
- no spoiler leak;
- no Redis-required regression;
- rating settlement exactly once.

## 12. Open decisions

No Ashar approval is needed for DB-backed queue because it uses already-approved Supabase Postgres and avoids new providers/costs.

Product decisions deferred:

- Standard time control remains 120s for compatibility unless Ashar approves 180s.
- Repeat opponent cooldown can tune from 12h after real usage.
- Redis remains a later scale decision, not Wave R dependency.
