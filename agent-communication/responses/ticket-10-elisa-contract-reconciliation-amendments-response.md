# Ticket 10 — Architecture/API Contract Reconciliation Amendments — Response

## Summary

The original Ticket 02 architecture/API contract is directionally correct, but it is **not sufficient as-is** after Tickets 03–05 and Athena’s decision locks. It needs targeted amendments before Freya, Luna, Ruby, Yuna, and Jasmine implement against it.

This response reconciles the architecture contract with:

- Athena decision locks after Tickets 01–05
- Luna’s UX state requirements
- Freya’s game-engine/scoring/rating specification
- Ruby’s word-library/content plan

The core architecture remains valid: **Next.js/React web, Expo React Native mobile, TypeScript backend, NestJS, Socket.IO, PostgreSQL, Prisma, Redis, BullMQ, and server-authoritative gameplay**. The amendments below lock ambiguous defaults, add missing fields/tables, refine idempotency, formalize score/rating/dictionary/report contracts, and add UX-driven API/WebSocket events.

## Decisions / Recommendations

### Final contract decision

**Decision:** Ticket 02 is a good baseline but requires amendments before implementation.

Ticket 02 remains valid for:

- High-level service/module boundaries
- REST + WebSocket split
- PostgreSQL + Redis + queue architecture
- Server-authoritative gameplay principle
- Initial auth/profile/lobby/match/rating/admin concepts

Ticket 02 must be amended for:

1. Concrete framework/tool defaults.
2. Idempotency across critical state-changing actions.
3. Round/match state enums from Freya’s game-engine spec.
4. Score breakdown storage and report shape.
5. Dictionary version fields per match/round.
6. Ruby’s word-library schema additions.
7. Rating events, voids, and reversal records.
8. Participant-only match reports and spoiler-safe share cards.
9. Consent scopes and analytics rules.
10. UX-required REST/Socket.IO states for onboarding, lobby, matchmaking, reconnect, errors, and reports.

### Locked technical defaults

Implementation agents should assume these unless a newer Athena decision file supersedes them:

| Area | Locked default |
|---|---|
| Web | Next.js / React |
| Mobile | Expo React Native |
| Backend language | TypeScript |
| Backend framework | NestJS |
| Realtime | Socket.IO V1 |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache/coordination | Redis |
| Queue/jobs | BullMQ |
| Auth V1 | Email/password first; Apple/Google planned for mobile readiness |
| Identity | Unique handle + non-unique display name |
| Gameplay | Standard 5-letter mode, 6 guesses, server-authoritative timer/scoring |
| Invalid guesses | Do not consume attempts; consume time |
| Ranked rating | Custom placement-based MMR V1, simulation-tested |
| Dictionary | Versioned immutable internal English 5-letter dictionary releases |
| Consent scopes | Necessary gameplay, product analytics, training/insight opt-in |

## Detailed Output

## 1. Architecture/API Amendment List

### Amendment A — Lock backend framework and runtime assumptions

Ticket 02 allowed NestJS or Fastify. After Athena’s decision lock, implementation should use:

- **NestJS** for API modules, dependency injection, guards, pipes, and WebSocket gateways.
- **Socket.IO** through NestJS gateway integration for V1 realtime.
- **Prisma** for PostgreSQL migrations and typed data access.
- **BullMQ** for rating finalization, match expiry, dictionary activation, analytics aggregation, and leaderboard reconciliation.
- **Redis** for Socket.IO adapter, presence, locks, matchmaking queues, rate limiting, and short-lived active match cache.

Contract impact:

- Backend module boundaries should be expressed as NestJS modules.
- Socket.IO event contracts should be used instead of generic raw WebSocket assumptions.
- Prisma schema must encode the amended fields/tables below.

### Amendment B — Add first-class idempotency records

Ticket 02 mentioned `clientRequestId` but did not define storage. Add a shared idempotency table and action-specific constraints.

Required idempotent actions:

- Join lobby
- Leave lobby
- Start match
- Queue matchmaking
- Cancel matchmaking
- Submit guess
- Finalize match
- Apply rating changes
- Void match / reverse rating

Recommended shared table:

```sql
idempotency_keys (
  id uuid primary key,
  user_id uuid null references users(id),
  scope text not null, -- lobby_join, lobby_leave, match_start, matchmaking_queue, matchmaking_cancel, guess_submit, match_finalize, rating_apply, match_void
  client_request_id text not null,
  request_hash text not null,
  status text not null, -- in_progress, completed, failed, conflict
  response_snapshot jsonb null,
  resource_type text null,
  resource_id uuid null,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(user_id, scope, client_request_id)
)
```

Rules:

- Same `clientRequestId` + same request hash returns original result.
- Same `clientRequestId` + different request hash returns `IDEMPOTENCY_KEY_CONFLICT`.
- Server-generated background jobs may use `user_id = null` with deterministic scope/resource uniqueness.
- Guess submission should also store `client_request_id` on `guesses` for fast lookup.

### Amendment C — Replace loose state enums with explicit V1 state machines

Ticket 02 had simplified states. Adopt Freya’s explicit states.

#### Match states

```ts
type MatchState =
  | 'initializing'
  | 'countdown'
  | 'in_progress'
  | 'round_intermission'
  | 'finalizing'
  | 'completed'
  | 'abandoned'
  | 'cancelled'
  | 'voided';
```

#### Round states

```ts
type RoundState =
  | 'pending'
  | 'countdown'
  | 'active'
  | 'finalizing'
  | 'completed'
  | 'voided';
```

#### Player-round states

```ts
type PlayerRoundState =
  | 'not_started'
  | 'active'
  | 'solved'
  | 'failed'
  | 'timed_out'
  | 'forfeited'
  | 'disconnected'
  | 'voided';
```

Frontend contract impact:

- Luna should render `countdown`, `round_intermission`, `finalizing`, `voided`, reconnect, timeout, and disabled-input states explicitly.
- Jasmine should include each state transition in QA matrix.

### Amendment D — Store score breakdown explicitly

Ticket 02’s `score_events` table is directionally correct but match reports need normalized score breakdowns.

Keep `score_events`, but add score breakdown fields to `round_player_states` or store a structured `score_breakdown` JSONB.

Recommended DB amendment:

```sql
round_player_states add column valid_guess_count int not null default 0;
round_player_states add column score_breakdown jsonb not null default '{}';
```

Expected `score_breakdown` shape for `standard_v1`:

```json
{
  "base": 100,
  "guessBonus": 40,
  "speedBonus": 31,
  "penalty": 0,
  "adjustment": 0,
  "total": 171,
  "scoringPreset": "standard_v1"
}
```

Rules:

- `score_events` remains the audit/event source for scoring components.
- `round_player_states.score_breakdown` is a report/read optimization.
- `round_player_states.score` must equal `score_breakdown.total`.

### Amendment E — Store dictionary versions per match and round

Ticket 02 stored `answer_word_id` but not enough dictionary version data. Ruby and Athena require immutable dictionary releases and per-match version storage.

Add fields to `matches`:

```sql
matches add column answer_list_id uuid null references word_lists(id);
matches add column answer_list_version text null;
matches add column valid_guess_list_id uuid null references word_lists(id);
matches add column valid_guess_list_version text null;
matches add column banned_list_id uuid null references word_lists(id);
matches add column banned_list_version text null;
matches add column dictionary_policy jsonb not null default '{}';
```

Add fields to `match_rounds`:

```sql
match_rounds add column answer_list_id uuid null references word_lists(id);
match_rounds add column answer_list_version text not null;
match_rounds add column valid_guess_list_id uuid null references word_lists(id);
match_rounds add column valid_guess_list_version text not null;
match_rounds add column banned_list_id uuid null references word_lists(id);
match_rounds add column banned_list_version text null;
```

Rules:

- Match-level dictionary fields record defaults selected at match generation.
- Round-level dictionary fields preserve exact validation context for each round.
- Ranked matches must use approved ranked dictionary versions.
- Active dictionary versions are never mutated in place.

### Amendment F — Accept Ruby’s word-library schema additions

Approve Ruby’s proposed tables with minor normalization.

Add:

- `word_sources`
- `word_reviews`
- `word_difficulty_metrics`
- `word_list_activation_events`

Also refine `word_entries` and `word_lists` as described in section 2.

### Amendment G — Add rating reversal and void semantics

Ticket 02 stated that voided matches create reversing rating events but did not define how. Add explicit event types and reversal linking.

Amend `rating_events`:

```sql
rating_events add column event_type text not null default 'apply'; -- apply, reversal, adjustment
rating_events add column reversed_rating_event_id uuid null references rating_events(id);
rating_events add column reason text null;
rating_events add column metadata jsonb not null default '{}';
```

Constraint change:

- Replace `unique(user_id, match_id, mode)` with a partial unique index for apply events only:

```sql
unique(user_id, match_id, mode, event_type) where event_type = 'apply'
```

Rules:

- Applying rating: one `apply` event per user/match/mode.
- Voiding after rating applied: insert `reversal` event linked to the original `apply` event.
- Do not silently mutate or delete prior rating events.
- Leaderboard entries must be recomputed after reversals.

### Amendment H — Define match report visibility and share-card constraints

Athena locked:

- Full match reports are visible to participants.
- Share cards can be generated.
- Full report privacy may be configurable later.

Contract:

- `GET /api/v1/matches/{matchId}/report` requires participant/admin access for V1.
- Public share cards use a separate endpoint and must be spoiler-safe.
- Share cards must not expose hidden answer details beyond what the participant intentionally shares and product allows.

Add `match_report_settings` fields on `matches` or use `settings` JSONB:

```sql
matches add column report_visibility text not null default 'participants'; -- participants, public, private, admin_only
matches add column share_card_enabled boolean not null default true;
```

### Amendment I — Consent scopes are authoritative API values

Use exact consent scope enum:

```ts
type ConsentScope = 'necessary_gameplay' | 'product_analytics' | 'training_insight_opt_in';
```

Amend Ticket 02 `analytics_events.consent_scope`, which used `necessary`, to use `necessary_gameplay`.

Rules:

- `necessary_gameplay`: required to operate account/gameplay/security.
- `product_analytics`: optional analytics for product improvement.
- `training_insight_opt_in`: optional behavior/insight/model-training use.
- Server must reject or downgrade client analytics events that exceed the user’s consent.
- Guess submissions and match lifecycle events needed for gameplay/rating are `necessary_gameplay` even if analytics consent is off.

### Amendment J — Add UX-driven API/WebSocket additions

Luna’s UX plan requires additional surface area:

- Onboarding/profile completion state.
- Handle availability check.
- Consent update and retrieval.
- Lobby settings validation before create/update.
- Host settings update should reset ready states or emit affected readiness changes.
- Matchmaking duplicate queue state.
- Reconnect/resync states.
- Round intermission and finalizing events.
- Match report/share-card endpoints.
- User rating history endpoint.
- Match detail endpoint for history.

Detailed additions are in sections 3 and 4.

## 2. Updated / Added Database Tables and Fields

## 2.1 Users, profiles, and onboarding

Amend `user_profiles`:

```sql
user_profiles add column onboarding_completed_at timestamptz null;
user_profiles add column handle_normalized citext unique null;
```

Rules:

- `handle` is user-facing.
- `handle_normalized` is used for uniqueness and lookup.
- Display names remain non-unique.

Amend `user_settings`:

```sql
user_settings add column necessary_gameplay_acknowledged_at timestamptz null;
user_settings add column product_analytics_consent boolean not null default false;
user_settings add column training_insight_consent boolean not null default false;
user_settings add column consent_updated_at timestamptz null;
```

Deprecate/rename from Ticket 02:

- `analytics_consent` → `product_analytics_consent`
- `training_consent` → `training_insight_consent`

## 2.2 Lobbies

Amend `lobbies`:

```sql
lobbies add column client_request_id text null;
lobbies add column ranked_compatible boolean not null default false;
lobbies add column settings_locked_at timestamptz null;
lobbies add column ready_required boolean not null default true;
```

Amend `lobby_members`:

```sql
lobby_members add column ready boolean not null default false;
lobby_members add column last_seen_at timestamptz null;
lobby_members add column disconnected_at timestamptz null;
```

Rules:

- Ready state is explicit rather than inferred from `state`.
- Host settings changes should either reset `ready = false` for affected members or emit a confirmation-required state. V1 recommendation: reset ready states after ranked-relevant setting changes.

## 2.3 Matchmaking

Amend `matchmaking_tickets`:

```sql
matchmaking_tickets add column client_request_id text null;
matchmaking_tickets add column queue_preferences jsonb not null default '{}';
matchmaking_tickets add column estimated_wait_seconds int null;
matchmaking_tickets add column cancelled_reason text null;
matchmaking_tickets add column timed_out_at timestamptz null;
```

Add partial uniqueness:

```sql
unique(user_id) where state = 'queued'
```

## 2.4 Matches and gameplay

Replace/amend `matches`:

```sql
matches add column scoring_preset text not null default 'standard_v1';
matches add column max_guesses int not null default 6;
matches add column answer_list_id uuid null references word_lists(id);
matches add column answer_list_version text null;
matches add column valid_guess_list_id uuid null references word_lists(id);
matches add column valid_guess_list_version text null;
matches add column banned_list_id uuid null references word_lists(id);
matches add column banned_list_version text null;
matches add column dictionary_policy jsonb not null default '{}';
matches add column report_visibility text not null default 'participants';
matches add column share_card_enabled boolean not null default true;
matches add column finalized_at timestamptz null;
matches add column finalization_job_id text null;
```

Amend `match_participants`:

```sql
match_participants add column rating_before int null;
match_participants add column rating_after int null;
match_participants add column provisional_before boolean null;
match_participants add column provisional_after boolean null;
match_participants add column placement_group int null;
match_participants add column total_valid_guesses int not null default 0;
```

Amend `match_rounds`:

```sql
match_rounds add column state text not null default 'pending';
match_rounds add column countdown_starts_at timestamptz null;
match_rounds add column answer_list_id uuid null references word_lists(id);
match_rounds add column answer_list_version text not null;
match_rounds add column valid_guess_list_id uuid null references word_lists(id);
match_rounds add column valid_guess_list_version text not null;
match_rounds add column banned_list_id uuid null references word_lists(id);
match_rounds add column banned_list_version text null;
```

Amend `round_player_states`:

```sql
round_player_states add column valid_guess_count int not null default 0;
round_player_states add column score_breakdown jsonb not null default '{}';
round_player_states add column last_guess_at timestamptz null;
round_player_states add column forfeited_at timestamptz null;
```

Amend `guesses`:

```sql
guesses add column client_request_id text not null;
guesses add column normalized_guess_text text not null;
guesses add column received_at timestamptz not null;
guesses alter column guess_number drop not null;
guesses add column request_hash text not null;
guesses add column error_code text null;
guesses add column metadata jsonb not null default '{}';
```

Constraints:

```sql
unique(round_id, user_id, client_request_id);
unique(round_id, user_id, guess_number) where valid = true;
```

Reason:

- Invalid guesses are persisted for audit/analytics/rate-limit insight but do not consume a valid `guess_number`.

## 2.5 Score events

Keep Ticket 02 `score_events`, but standardize event types:

```ts
type ScoreEventType =
  | 'solve_base'
  | 'guess_bonus'
  | 'speed_bonus'
  | 'penalty'
  | 'adjustment'
  | 'void_reversal';
```

Add optional linkage:

```sql
score_events add column reversed_score_event_id uuid null references score_events(id);
score_events add column reason text null;
```

## 2.6 Word library

Amend `word_entries`:

```sql
word_entries add column normalized_text citext not null;
word_entries add column locale text null;
word_entries rename column difficulty to difficulty_tier;
word_entries add column difficulty_score numeric null;
word_entries add column frequency_rank int null;
word_entries add column part_of_speech text null;
word_entries add column is_answer_eligible boolean not null default false;
word_entries add column is_guess_eligible boolean not null default false;
word_entries add column is_banned boolean not null default false;
word_entries rename column offensive to is_offensive;
word_entries rename column sensitive to is_sensitive;
word_entries add column is_proper_noun boolean not null default false;
word_entries add column is_abbreviation boolean not null default false;
word_entries add column is_plural boolean not null default false;
word_entries add column is_inflection boolean not null default false;
word_entries add column has_duplicate_letters boolean not null default false;
word_entries add column letter_rarity_score numeric null;
word_entries add column regional_variant text null;
word_entries add column review_status text not null default 'imported';
word_entries add column deactivated_reason text null;
```

Revise uniqueness:

```sql
unique(language, normalized_text)
```

Amend `word_lists`:

```sql
word_lists add column status text not null default 'draft'; -- draft, active, deprecated, deactivated
word_lists add column ranked_eligible boolean not null default false;
word_lists add column word_length int not null default 5;
word_lists add column manifest jsonb not null default '{}';
word_lists add column checksum text null;
word_lists add column activated_at timestamptz null;
word_lists add column deactivated_at timestamptz null;
```

Add Ruby-approved tables:

```sql
word_sources (
  id uuid primary key,
  name text not null,
  url text null,
  version text null,
  license_name text not null,
  license_url text null,
  attribution_required boolean not null default false,
  commercial_use_allowed boolean null,
  redistribution_allowed boolean null,
  downloaded_at timestamptz not null,
  checksum text null,
  notes text null,
  created_at timestamptz not null
)
```

```sql
word_reviews (
  id uuid primary key,
  word_id uuid not null references word_entries(id),
  reviewer_user_id uuid not null references users(id),
  decision text not null, -- approved, rejected, deactivated, needs_more_info
  reason text null,
  before jsonb null,
  after jsonb null,
  created_at timestamptz not null
)
```

```sql
word_difficulty_metrics (
  word_id uuid not null references word_entries(id),
  dictionary_version text not null,
  mode text not null,
  appearances int not null default 0,
  solve_rate numeric null,
  average_guesses numeric null,
  average_solve_ms numeric null,
  timeout_rate numeric null,
  failure_rate numeric null,
  rating_adjusted_score numeric null,
  updated_at timestamptz not null,
  primary key(word_id, dictionary_version, mode)
)
```

```sql
word_list_activation_events (
  id uuid primary key,
  word_list_id uuid not null references word_lists(id),
  activated_by uuid not null references users(id),
  previous_active_word_list_id uuid null references word_lists(id),
  reason text not null,
  created_at timestamptz not null
)
```

Optional source lineage join table:

```sql
word_entry_sources (
  word_id uuid not null references word_entries(id),
  source_id uuid not null references word_sources(id),
  source_metadata jsonb not null default '{}',
  primary key(word_id, source_id)
)
```

## 2.7 Ratings and leaderboards

Amend `ratings`:

```sql
ratings add column algorithm text not null default 'placement_mmr_v1';
ratings add column rating_deviation numeric null;
ratings add column provisional_matches_remaining int not null default 10;
```

Amend `rating_events` as above with reversal support.

Add optional rating job audit table:

```sql
rating_jobs (
  id uuid primary key,
  match_id uuid not null references matches(id),
  state text not null, -- queued, running, completed, failed, skipped
  algorithm text not null,
  attempts int not null default 0,
  error text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(match_id, algorithm)
)
```

## 2.8 Analytics

Amend `analytics_events`:

```sql
analytics_events alter column consent_scope set not null;
-- allowed values: necessary_gameplay, product_analytics, training_insight_opt_in
analytics_events add column source text null; -- client, server, worker, admin
analytics_events add column schema_version text not null default 'v1';
```

## 3. Updated / Added REST Endpoints

Base path remains `/api/v1`.

## 3.1 Auth/profile/onboarding

### Check handle availability

```http
GET /api/v1/handles/{handle}/availability
```

Response:

```json
{
  "data": {
    "handle": "ashar",
    "normalizedHandle": "ashar",
    "available": true
  },
  "error": null,
  "requestId": "req_123"
}
```

### Get onboarding state

```http
GET /api/v1/me/onboarding
```

Response:

```json
{
  "data": {
    "profileComplete": true,
    "consentComplete": true,
    "onboardingCompletedAt": "timestamp-or-null",
    "nextRequiredStep": null
  },
  "error": null,
  "requestId": "req_123"
}
```

### Complete onboarding

```http
POST /api/v1/me/onboarding/complete
```

### Get/update consent

```http
GET /api/v1/me/consent
PATCH /api/v1/me/consent
```

Request:

```json
{
  "productAnalyticsConsent": true,
  "trainingInsightConsent": false
}
```

## 3.2 Lobby endpoints

Existing lobby endpoints remain, but state-changing calls must accept `clientRequestId`.

### Create lobby amended request

```json
{
  "clientRequestId": "uuid",
  "visibility": "private",
  "rated": false,
  "mode": "standard",
  "language": "en",
  "wordLength": 5,
  "difficulty": "medium",
  "minPlayers": 2,
  "maxPlayers": 4,
  "roundsCount": 3,
  "roundTimeSeconds": 120,
  "scoringPreset": "standard_v1"
}
```

### Join lobby amended request

```http
POST /api/v1/lobbies/{lobbyId}/join
POST /api/v1/lobbies/join-by-code
```

```json
{
  "code": "ABCD12",
  "clientRequestId": "uuid"
}
```

### Validate lobby settings before create/update

```http
POST /api/v1/lobbies/validate-settings
```

Use by Luna to show ranked-compatibility and disabled settings before submission.

Response:

```json
{
  "data": {
    "valid": false,
    "rankedCompatible": false,
    "errors": [
      {
        "field": "roundTimeSeconds",
        "code": "RANKED_TIMER_NOT_SUPPORTED",
        "message": "Ranked V1 requires a 120 second timer."
      }
    ],
    "normalizedSettings": {}
  },
  "error": null,
  "requestId": "req_123"
}
```

### Start match amended request

```http
POST /api/v1/lobbies/{lobbyId}/start
```

```json
{
  "clientRequestId": "uuid"
}
```

## 3.3 Matchmaking endpoints

### Queue amended request

```http
POST /api/v1/matchmaking/queue
```

```json
{
  "clientRequestId": "uuid",
  "rated": true,
  "mode": "standard",
  "difficulty": "medium"
}
```

### Cancel amended request

```http
DELETE /api/v1/matchmaking/queue/{ticketId}
```

Optional body:

```json
{
  "clientRequestId": "uuid",
  "reason": "user_cancelled"
}
```

## 3.4 Gameplay/matches

### Submit guess fallback remains, but response is amended

```http
POST /api/v1/matches/{matchId}/rounds/{roundId}/guesses
```

Request:

```json
{
  "guess": "crane",
  "clientRequestId": "uuid"
}
```

Accepted response:

```json
{
  "data": {
    "accepted": true,
    "valid": true,
    "guessNumber": 2,
    "feedback": [
      { "letter": "c", "state": "absent" },
      { "letter": "r", "state": "present" },
      { "letter": "a", "state": "correct" },
      { "letter": "n", "state": "absent" },
      { "letter": "e", "state": "present" }
    ],
    "playerRoundState": "active",
    "roundState": "active",
    "score": 0,
    "serverReceivedAt": "timestamp"
  },
  "error": null,
  "requestId": "req_123"
}
```

Rejected response should use normal error envelope or a domain response. Recommendation: use normal success envelope with `accepted: false` only for gameplay-valid rejection that should render inline, and reserve HTTP errors for auth/state/system failures.

```json
{
  "data": {
    "accepted": false,
    "valid": false,
    "reason": "not_in_dictionary",
    "playerRoundState": "active",
    "attemptConsumed": false
  },
  "error": null,
  "requestId": "req_123"
}
```

### Get match report amended

```http
GET /api/v1/matches/{matchId}/report
```

V1 authorization:

- Participant: allowed.
- Admin/moderator: allowed.
- Non-participant: denied unless future `report_visibility = public`.

Report must include:

- Dictionary versions
- Score breakdowns
- Rating before/after/delta for rated matches
- Void/abandon state if applicable
- Per-round player results

### Get share card

```http
GET /api/v1/matches/{matchId}/share-card
```

Response:

```json
{
  "data": {
    "matchId": "uuid",
    "shareText": "Wordle Royale — Ashar placed 2nd with 3820 points",
    "imageUrl": "https://.../share-card.png",
    "spoilerSafe": true
  },
  "error": null,
  "requestId": "req_123"
}
```

### Get match detail/history item

```http
GET /api/v1/matches/{matchId}/detail
```

Can reuse report payload but should obey privacy.

## 3.5 Rating/profile endpoints

### Get rating history

```http
GET /api/v1/users/{userId}/ratings/history?seasonId=current&mode=standard&limit=100&cursor=...
```

Response:

```json
{
  "data": {
    "entries": [
      {
        "ratingEventId": "uuid",
        "matchId": "uuid",
        "ratingBefore": 1500,
        "ratingAfter": 1536,
        "ratingDelta": 36,
        "eventType": "apply",
        "createdAt": "timestamp"
      }
    ],
    "nextCursor": null
  },
  "error": null,
  "requestId": "req_123"
}
```

## 3.6 Word/admin endpoints

Expand Ticket 02 admin word endpoints:

```http
GET    /api/v1/admin/word-sources
POST   /api/v1/admin/word-sources
GET    /api/v1/admin/words
GET    /api/v1/admin/words/{wordId}
POST   /api/v1/admin/words/import
PATCH  /api/v1/admin/words/{wordId}
POST   /api/v1/admin/words/{wordId}/review
POST   /api/v1/admin/words/{wordId}/deactivate
GET    /api/v1/admin/word-lists
POST   /api/v1/admin/word-lists
POST   /api/v1/admin/word-lists/{listId}/validate
POST   /api/v1/admin/word-lists/{listId}/activate
GET    /api/v1/admin/word-difficulty-metrics
```

## 3.7 Admin moderation/rating endpoints

Amend match void endpoint:

```http
POST /api/v1/admin/matches/{matchId}/void
```

Request:

```json
{
  "reason": "server_integrity_issue",
  "publicReason": "This match was voided due to a technical issue.",
  "reverseRating": true,
  "clientRequestId": "uuid"
}
```

Response should include whether rating was reversed or skipped.

## 4. Updated / Added Socket.IO Events

Use Socket.IO with the same logical envelope from Ticket 02:

```json
{
  "type": "event.name",
  "requestId": "uuid-or-null",
  "sentAt": "timestamp",
  "payload": {}
}
```

Socket.IO implementation note:

- The Socket.IO event name should match `type`, e.g. emit `guess.accepted` with the envelope payload or full envelope consistently.
- Recommendation: emit full envelope for typed shared client handling.

## 4.1 Lobby events

Add client intent events for actions Luna’s UI needs to trigger from realtime screens:

```ts
type LobbyClientEvent =
  | 'lobby.subscribe'
  | 'lobby.set_ready'
  | 'lobby.update_settings'
  | 'lobby.start_match'
  | 'lobby.leave';
```

### `lobby.set_ready`

```json
{
  "type": "lobby.set_ready",
  "requestId": "uuid",
  "payload": {
    "lobbyId": "uuid",
    "ready": true,
    "clientRequestId": "uuid"
  }
}
```

### Add `lobby.ready_reset`

Emitted when host settings changes reset readiness.

```json
{
  "type": "lobby.ready_reset",
  "payload": {
    "lobbyId": "uuid",
    "reason": "settings_changed",
    "affectedUserIds": ["uuid"]
  }
}
```

### Add `lobby.start_failed`

```json
{
  "type": "lobby.start_failed",
  "requestId": "uuid",
  "payload": {
    "lobbyId": "uuid",
    "code": "NOT_ALL_PLAYERS_READY",
    "message": "All players must be ready before the match can start."
  }
}
```

## 4.2 Matchmaking events

Add duplicate/created recovery states:

### `matchmaking.duplicate_queue`

```json
{
  "type": "matchmaking.duplicate_queue",
  "requestId": "uuid",
  "payload": {
    "existingTicketId": "uuid",
    "state": "queued"
  }
}
```

### Amend `matchmaking.status`

Include filters and timeout:

```json
{
  "type": "matchmaking.status",
  "payload": {
    "ticketId": "uuid",
    "state": "queued",
    "estimatedWaitSeconds": 30,
    "expiresAt": "timestamp",
    "preferences": {
      "rated": true,
      "mode": "standard",
      "difficulty": "medium"
    }
  }
}
```

## 4.3 Gameplay events

### Amend `guess.submit`

Add `clientRequestId`. The Ticket 02 `requestId` alone is not enough because `requestId` may be transport-level; `clientRequestId` is domain idempotency.

```json
{
  "type": "guess.submit",
  "requestId": "uuid",
  "payload": {
    "matchId": "uuid",
    "roundId": "uuid",
    "guess": "crane",
    "clientRequestId": "uuid",
    "clientSubmittedAt": "timestamp"
  }
}
```

### Amend `guess.accepted`

```json
{
  "type": "guess.accepted",
  "requestId": "uuid",
  "payload": {
    "roundId": "uuid",
    "clientRequestId": "uuid",
    "guess": "crane",
    "guessNumber": 2,
    "feedback": [
      { "letter": "c", "state": "absent" },
      { "letter": "r", "state": "present" },
      { "letter": "a", "state": "correct" },
      { "letter": "n", "state": "absent" },
      { "letter": "e", "state": "present" }
    ],
    "playerRoundState": "active",
    "roundState": "active",
    "score": 0,
    "serverReceivedAt": "timestamp"
  }
}
```

### Amend `guess.rejected`

```json
{
  "type": "guess.rejected",
  "requestId": "uuid",
  "payload": {
    "roundId": "uuid",
    "clientRequestId": "uuid",
    "guess": "xxxxx",
    "reason": "not_in_dictionary",
    "attemptConsumed": false,
    "playerRoundState": "active"
  }
}
```

Allowed rejection reasons:

```ts
type GuessRejectReason =
  | 'wrong_length'
  | 'invalid_characters'
  | 'not_in_dictionary'
  | 'banned_word'
  | 'round_not_active'
  | 'already_solved'
  | 'max_guesses_reached'
  | 'deadline_passed'
  | 'duplicate_request'
  | 'idempotency_key_conflict'
  | 'rate_limited';
```

### Add `round.countdown_started`

```json
{
  "type": "round.countdown_started",
  "payload": {
    "matchId": "uuid",
    "roundId": "uuid",
    "roundNumber": 2,
    "startsAt": "timestamp",
    "serverTime": "timestamp"
  }
}
```

### Amend `round.started`

Add dictionary-safe metadata but do not expose answer.

```json
{
  "type": "round.started",
  "payload": {
    "matchId": "uuid",
    "roundId": "uuid",
    "roundNumber": 1,
    "startsAt": "timestamp",
    "endsAt": "timestamp",
    "wordLength": 5,
    "maxGuesses": 6,
    "dictionaryVersion": "en-5-standard-answer-v2026.06.001"
  }
}
```

### Add `round.finalizing`

```json
{
  "type": "round.finalizing",
  "payload": {
    "matchId": "uuid",
    "roundId": "uuid"
  }
}
```

### Amend `round.ended`

Include score breakdowns.

```json
{
  "type": "round.ended",
  "payload": {
    "roundId": "uuid",
    "answer": "crane",
    "standings": [
      {
        "userId": "uuid",
        "roundScore": 171,
        "scoreBreakdown": {
          "base": 100,
          "guessBonus": 40,
          "speedBonus": 31,
          "penalty": 0,
          "adjustment": 0,
          "total": 171,
          "scoringPreset": "standard_v1"
        },
        "totalScore": 300,
        "state": "solved",
        "validGuessCount": 3,
        "solveMs": 45000
      }
    ],
    "nextRoundStartsAt": "timestamp-or-null"
  }
}
```

### Add `match.round_intermission`

```json
{
  "type": "match.round_intermission",
  "payload": {
    "matchId": "uuid",
    "completedRoundId": "uuid",
    "nextRoundStartsAt": "timestamp",
    "standings": []
  }
}
```

### Add `match.finalizing`

```json
{
  "type": "match.finalizing",
  "payload": {
    "matchId": "uuid"
  }
}
```

### Amend `match.completed`

Include report visibility and rating details.

```json
{
  "type": "match.completed",
  "payload": {
    "matchId": "uuid",
    "reportUrl": "/matches/uuid/report",
    "reportVisibility": "participants",
    "shareCardAvailable": true,
    "finalStandings": [
      {
        "userId": "uuid",
        "placement": 1,
        "placementGroup": 1,
        "totalScore": 820,
        "ratingBefore": 1500,
        "ratingAfter": 1536,
        "ratingDelta": 36,
        "provisional": true
      }
    ]
  }
}
```

## 4.4 Reconnect events

Ticket 02 snapshot-based resync remains correct. Amend payload to include active UI states.

### `session.resync_result`

```json
{
  "type": "session.resync_result",
  "requestId": "uuid",
  "payload": {
    "serverTime": "timestamp",
    "lobbySnapshot": {},
    "matchSnapshot": {},
    "activeRouteHint": "match",
    "inputEnabled": true,
    "missedEventsAvailable": false
  }
}
```

### Add `connection.state_changed`

```json
{
  "type": "connection.state_changed",
  "payload": {
    "state": "reconnecting",
    "message": "Connection unstable. Trying to reconnect..."
  }
}
```

## 5. Backend Module Boundary Updates

Use NestJS modules with clear boundaries.

Recommended modules:

```text
apps/api/src/modules/
  auth/
  users/
  profiles/
  consent/
  lobbies/
  matchmaking/
  realtime/
  game-engine/
  matches/
  scoring/
  ratings/
  leaderboards/
  word-library/
  analytics/
  admin/
  moderation/
  idempotency/
  jobs/
```

### Boundary changes from Ticket 02

#### Add `IdempotencyModule`

Owns:

- `idempotency_keys`
- Request hashing
- Conflict detection
- Response replay
- Expiry cleanup

Used by:

- Lobby
- Matchmaking
- Match/gameplay
- Rating
- Admin void actions

#### Split `ConsentModule` from generic user settings

Owns:

- Consent retrieval/update
- Analytics event consent enforcement
- Audit-friendly consent timestamps

#### Expand `WordLibraryModule`

Owns:

- Source metadata
- Import/review tables
- Active dictionary version lookup
- Ranked dictionary eligibility
- Dictionary activation events
- Runtime guess validation dictionary selection

Ruby still owns import tooling/scripts; Freya owns backend runtime enforcement.

#### Add `ScoringModule`

Owns:

- Score formula implementation wrapper
- Score event persistence
- Score breakdown materialization

Pure formula should live in shared game-engine package; module persists results.

#### Expand `RatingsModule`

Owns:

- Placement-MMR V1
- Rating job idempotency
- Rating events
- Reversals
- Leaderboard update triggers

#### `RealtimeModule` owns Socket.IO gateway only

It should not implement business rules directly. It should delegate to:

- `LobbiesService`
- `MatchmakingService`
- `MatchesService`
- `GameEngineService`

## 6. Implementation Dependency Notes

### Freya — Backend/core

Freya should not implement directly from Ticket 02 alone. Freya needs this amendment plus Tickets 04 and 05.

Backend implementation order:

1. Prisma schema with amended tables/fields.
2. Shared enums/types for states, consent scopes, scoring, rating events.
3. `IdempotencyModule`.
4. Auth/profile/consent foundation.
5. Word-library active-version lookup.
6. Lobby state machine and REST endpoints.
7. Socket.IO gateway skeleton.
8. Game-engine pure functions and persistence wrappers.
9. Match report generation.
10. Rating finalization/reversal jobs.

Release-blocking backend tests:

- Idempotency conflict/replay
- Duplicate-letter feedback
- Invalid guess attempt behavior
- Dictionary version reproducibility
- Match finalization exactly once
- Rating apply/reversal exactly once

### Luna — Frontend/product UI

Luna should align screens to these contract additions:

- `GET /me/onboarding`
- `GET /handles/{handle}/availability`
- `GET/PATCH /me/consent`
- Lobby settings validation endpoint
- Explicit lobby ready reset event
- `countdown`, `round_intermission`, `finalizing`, `voided` states
- Match report score breakdown
- Participant-only report vs spoiler-safe share card
- Reconnect `session.resync_result` payload

Luna must not compute authoritative score, feedback, rating, or timers locally beyond display interpolation from server timestamps.

### Ruby — Tooling/data/integrations

Ruby’s schema additions are accepted. Ruby should build tooling against:

- `word_sources`
- `word_entries`
- `word_entry_sources`
- `word_reviews`
- `word_lists`
- `word_list_entries`
- `word_list_activation_events`

Ruby should provide fixture dictionaries for Freya/Jasmine tests, but production dictionaries require license review and content approval.

### Yuna — Operations

Yuna should plan infrastructure for:

- API process
- Worker process with BullMQ
- Scheduler/cron-like worker mode
- Managed PostgreSQL
- Managed Redis usable for Socket.IO adapter and BullMQ
- Environment-specific secrets
- Observability for WebSocket connection counts, queue depth, match finalization failures, rating job failures, Redis lock contention, and dictionary activation events

Yuna should ensure horizontal Socket.IO scaling uses Redis adapter from the start.

### Jasmine — QA/verification

Jasmine should build test matrices from this amended contract, especially:

- State transition coverage
- Idempotency replay/conflict
- Reconnect/resync correctness
- Invalid guesses not consuming attempts
- Dictionary version locking
- Match report privacy
- Share-card spoiler safety
- Rating apply/reversal behavior
- Consent enforcement for analytics events

## 7. Match Report Contract Amendment

Recommended report shape:

```ts
interface MatchReport {
  matchId: string;
  lobbyId?: string | null;
  mode: 'standard';
  rated: boolean;
  scoringPreset: 'standard_v1';
  language: 'en';
  wordLength: 5;
  maxGuesses: 6;
  roundsCount: number;
  roundTimeSeconds: number;
  dictionary: {
    answerListVersion: string;
    validGuessListVersion: string;
    bannedListVersion?: string | null;
  };
  reportVisibility: 'participants' | 'public' | 'private' | 'admin_only';
  shareCardEnabled: boolean;
  startedAt: string;
  completedAt?: string | null;
  state: 'completed' | 'abandoned' | 'voided';
  voidReason?: string | null;
  participants: MatchReportParticipant[];
  rounds: MatchReportRound[];
  finalStandings: FinalStanding[];
}

interface MatchReportParticipant {
  userId: string;
  displayName: string;
  handle?: string | null;
  placement: number | null;
  placementGroup?: number | null;
  outcome: 'won' | 'lost' | 'tied' | 'forfeited' | 'abandoned' | 'voided';
  totalScore: number;
  roundsSolved: number;
  totalValidGuesses: number;
  totalSolveMs: number;
  ratingBefore?: number | null;
  ratingAfter?: number | null;
  ratingDelta?: number | null;
  provisional?: boolean | null;
}

interface MatchReportRound {
  roundId: string;
  roundNumber: number;
  answer: string;
  answerListVersion: string;
  validGuessListVersion: string;
  startedAt: string;
  endedAt: string;
  playerResults: RoundPlayerReport[];
}

interface RoundPlayerReport {
  userId: string;
  state: 'solved' | 'failed' | 'timed_out' | 'forfeited' | 'voided';
  validGuessCount: number;
  solveMs?: number | null;
  roundScore: number;
  scoreBreakdown: {
    base: number;
    guessBonus: number;
    speedBonus: number;
    penalty: number;
    adjustment: number;
    total: number;
    scoringPreset: 'standard_v1';
  };
}
```

## 8. Error Code Amendments

Add standardized error codes for frontend states:

```ts
type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'LOBBY_NOT_FOUND'
  | 'LOBBY_FULL'
  | 'LOBBY_EXPIRED'
  | 'LOBBY_ALREADY_STARTED'
  | 'LOBBY_NOT_JOINABLE'
  | 'NOT_LOBBY_HOST'
  | 'NOT_ALL_PLAYERS_READY'
  | 'RANK_REQUIREMENT_NOT_MET'
  | 'RANKED_SETTINGS_INVALID'
  | 'MATCH_NOT_FOUND'
  | 'MATCH_NOT_ACTIVE'
  | 'ROUND_NOT_ACTIVE'
  | 'DEADLINE_PASSED'
  | 'GUESS_WRONG_LENGTH'
  | 'GUESS_INVALID_CHARACTERS'
  | 'GUESS_NOT_IN_DICTIONARY'
  | 'GUESS_BANNED_WORD'
  | 'MATCH_REPORT_FORBIDDEN'
  | 'CONSENT_SCOPE_NOT_ALLOWED'
  | 'DICTIONARY_VERSION_UNAVAILABLE'
  | 'RATING_ALREADY_APPLIED'
  | 'MATCH_ALREADY_VOIDED';
```

## Open Questions

Only these still truly need Ashar/Athena resolution before implementation locks:

1. **Ranked V1 player count:** Should ranked launch support 2–4 players immediately, or start 1v1 while keeping the placement-MMR model ready for expansion?
2. **Ranked difficulty:** Should ranked use a fixed official difficulty mix, or allow separate ranked queues/rating buckets by difficulty?
3. **Offensive valid guesses:** Should severe offensive/slur terms be rejected from valid guesses entirely? Athena default says yes for V1, but this is policy-sensitive.
4. **Regional English policy:** US-only, UK-only, or common English for V1 dictionary?
5. **Admin scope:** Is V1 admin API + CLI tooling enough, or is a full admin UI required before launch?
6. **Analytics provider:** Internal DB first vs PostHog/Segment-style provider. Contract supports either, but ops/integration work differs.
7. **Full report privacy later:** Participant-only is V1 default; should public full reports be planned for V1 or deferred?

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Athena
- **Why needed:** Athena owns decision routing and sequencing.
- **Exact task:** Review the remaining open questions and decide which require Ashar now versus which can remain defaults for implementation.
- **Inputs/context needed:** This Ticket 10 amendment response and Athena’s decision-lock file.
- **Expected output back to Athena:** Updated decision-lock file for Tickets 01–10.

### Follow-up Ticket 2

- **Target agent:** Freya
- **Why needed:** Freya owns backend implementation.
- **Exact task:** Convert these amended schema requirements into a Prisma schema and migration plan, including idempotency, dictionary versions, score breakdowns, rating reversals, and word-library additions.
- **Inputs/context needed:** This response, Ticket 02 architecture, Ticket 04 game-engine spec, Ticket 05 word-library spec.
- **Expected output back to Athena:** Prisma schema/migration summary, files changed, and migration/test commands run.

### Follow-up Ticket 3

- **Target agent:** Freya
- **Why needed:** Game state and realtime behavior must match this contract.
- **Exact task:** Implement NestJS module skeletons and Socket.IO event handlers for lobby, matchmaking, gameplay, reconnect, match report, idempotency, and rating jobs.
- **Inputs/context needed:** REST and Socket.IO amendments in this response.
- **Expected output back to Athena:** Backend module skeletons, typed DTOs/events, and verification evidence.

### Follow-up Ticket 4

- **Target agent:** Luna
- **Why needed:** Frontend must render the amended state model.
- **Exact task:** Update frontend contract/types plan to include onboarding state, consent state, lobby validation, ready reset, countdown/intermission/finalizing/voided states, score breakdowns, participant-only reports, share cards, and reconnect resync payloads.
- **Inputs/context needed:** This response plus Ticket 03 UX plan.
- **Expected output back to Athena:** Frontend type/interface plan or implementation summary with edge-state coverage.

### Follow-up Ticket 5

- **Target agent:** Ruby
- **Why needed:** Word tooling must target the finalized schema.
- **Exact task:** Build or plan word import/review/version tooling against the approved `word_sources`, `word_reviews`, `word_difficulty_metrics`, `word_list_activation_events`, and `word_entry_sources` model.
- **Inputs/context needed:** This response and Ticket 05 word-library plan.
- **Expected output back to Athena:** Tooling plan or implementation summary with fixture dictionary outputs and validation evidence.

### Follow-up Ticket 6

- **Target agent:** Yuna
- **Why needed:** Infrastructure must support the locked stack and realtime scaling.
- **Exact task:** Confirm deployment/ops plan for NestJS API, Socket.IO Redis adapter, BullMQ workers, PostgreSQL, Redis, secrets, observability, and environment setup.
- **Inputs/context needed:** Locked stack and backend process assumptions from this response.
- **Expected output back to Athena:** Infrastructure plan and launch-readiness checklist.

### Follow-up Ticket 7

- **Target agent:** Jasmine
- **Why needed:** QA must verify the final amended contract, not the earlier broad contract.
- **Exact task:** Create a contract QA matrix covering amended REST endpoints, Socket.IO events, idempotency, dictionary versioning, score breakdowns, rating reversals, match report privacy, share-card spoiler safety, consent enforcement, and reconnect behavior.
- **Inputs/context needed:** This response and Tickets 03–05.
- **Expected output back to Athena:** QA matrix with release-blocking criteria.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-10-elisa-contract-reconciliation-amendments-response.md`

## Tests / Commands Run

None — planning/spec task only.

## Evidence / Result

Created the requested Markdown response file at:

`/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-10-elisa-contract-reconciliation-amendments-response.md`

Source documents reviewed for reconciliation:

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/ticket-10-elisa-contract-reconciliation-amendments.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/docs/2026-06-19-athena-decision-locks-after-tickets-01-05.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-02-elisa-architecture-api-response.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-03-luna-ux-flow-wireframe-plan-response.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-04-freya-game-engine-scoring-rating-spec-response.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-05-ruby-word-library-content-plan-response.md`

Acceptance criteria addressed:

1. Architecture/API amendment list included.
2. Final decision provided: Ticket 02 is valid baseline but needs changes.
3. Updated/added database tables and fields included.
4. Updated/added REST endpoints included.
5. Updated/added Socket.IO events included.
6. Backend module boundary updates included.
7. Implementation dependency notes for Freya/Luna/Ruby/Yuna/Jasmine included.
8. Remaining open decisions needing Ashar/Athena included.

## Risks / Blockers

1. **Schema expansion risk:** The amended schema is larger than Ticket 02. Freya should implement migrations in phases, not as one large unreviewed change.
2. **Idempotency risk:** If idempotency is skipped early, duplicate match starts, duplicate guesses, and duplicate rating events will create hard-to-debug production issues.
3. **Realtime drift risk:** Luna and Freya must share generated/typed event contracts; otherwise Socket.IO payload drift is likely.
4. **Dictionary licensing blocker:** Ruby/Yuna/Athena still need production-safe source licensing decisions before real dictionary import.
5. **Rating balance risk:** Placement-MMR V1 is architecturally accepted but still needs Ruby simulation and Jasmine test coverage before ranked launch.
6. **Privacy risk:** Consent enforcement must be server-side. Client-only consent gates are not sufficient.
7. **Admin tooling risk:** Participant-only match reports, void/reversal actions, and word activation require auditability before public ranked launch.
