Ticket 2 — Technical Architecture and API Contract
What I understood
You need a production-ready technical architecture for Wordle Royale covering mobile + web clients, real-time lobbies/gameplay, matchmaking, ranked games, profiles, leaderboards, admin/moderation, deployment assumptions, database model, REST APIs, and WebSocket contracts.

This spec is intended as a handoff to Athena and later implementation agents.

---

Wordle Royale — Architecture Spec and API Contract
Recommended stack
Frontend
Recommended:

Web: Next.js / React
Mobile: Expo React Native
Shared language: TypeScript
Shared packages: validation schemas, API client, game constants, UI tokens where possible

Backend
Recommended:

Runtime: Node.js + TypeScript
Framework: NestJS or Fastify
REST API: Fastify/Nest REST controllers
Realtime: WebSocket gateway using Socket.IO or raw WebSocket
Database: PostgreSQL
Cache/coordination: Redis
Queue/jobs: BullMQ or equivalent Redis-backed queue
ORM/query layer: Prisma or Drizzle
Object storage: S3-compatible storage if avatars/uploads are needed
Analytics sink: PostHog/Segment-style event pipeline or internal event table + warehouse later

Why this stack
TypeScript across web/mobile/backend reduces contract drift.
PostgreSQL is strong for users, matches, ranking history, leaderboards, audit logs.
Redis is appropriate for ephemeral lobby presence, matchmaking queues, rate limits, and real-time coordination.
WebSockets are required for lobby/game state updates.

Alternative acceptable stack
Backend: Python FastAPI + WebSockets
Queue: Celery/RQ
ORM: SQLAlchemy
This is also viable, but TypeScript gives better full-stack schema sharing for this product.

---

Text architecture diagram
 (1/27)
                       ┌──────────────────────────┐
                       │        Web Client         │
                       │     Next.js / React       │
                       └─────────────┬────────────┘
                                     │ HTTPS + WSS
                       ┌─────────────▼────────────┐
                       │      Mobile Client        │
                       │    Expo React Native      │
                       └─────────────┬────────────┘
                                     │
                                     ▼
                          ┌──────────────────┐
                          │  API Gateway /   │
                          │  Backend App     │
                          │  REST + WS       │
                          └───────┬──────────┘
                                  │
          ┌───────────────────────┼────────────────────────┐
          │                       │                        │
          ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐      ┌─────────────────┐
│ Auth/User       │     │ Lobby/Match     │      │ Profile/Stats   │
│ Module          │     │ Realtime Module │      │ Module          │
└───────┬─────────┘     └───────┬─────────┘      └───────┬─────────┘
        │                       │                        │
        ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐      ┌─────────────────┐
│ PostgreSQL      │     │ Redis           │      │ Rating/Ranking  │
│ Durable data    │     │ presence, locks,│      │ Pipeline        │
│ users/matches   │     │ queues, cache   │      └───────┬─────────┘
└─────────────────┘     └─────────────────┘              │
        ▲                       ▲                        ▼
        │                       │              ┌─────────────────┐
        │                       │              │ Leaderboard     │
 (2/27)
│                       │              │ Materialization │
        │                       │              └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Admin/Moderation│     │ Analytics/Event │
│ Module          │     │ Pipeline        │
└─────────────────┘     └─────────────────┘


---

Major backend modules
3.1 Auth module
Owns:

Registration
Login
OAuth provider linking
Session refresh
Password reset if email/password is enabled
Email verification
Account deletion
Device/session management

Primary tables:

users
user_auth_identities
user_sessions
email_verification_tokens
password_reset_tokens

---

3.2 User/profile module
Owns:

Display name / handle
Avatar metadata
Profile privacy
Public profile views
User settings
Aggregate stats

Primary tables:

users
user_profiles
user_settings
player_stats
match_participants

---

3.3 Lobby module
Owns:

Create lobby
Join by code
Public lobby browser
Lobby state transitions
Host transfer
Lobby expiry
Ready checks

Primary tables:

lobbies
lobby_members

Redis:

lobby presence
lobby room membership cache
lobby join locks

---

3.4 Matchmaking module
Owns:

Quick join queue
Ranked/unranked matching
Queue cancellation
Timeout handling
Duplicate queue prevention

Primary tables:

matchmaking_tickets

Redis:

sorted sets by mode/rating/difficulty
temporary queue records
queue locks

---

3.5 Game engine module
Owns server-authoritative gameplay:

Match initialization
Round creation
Word selection
Guess validation
Feedback calculation
Timer authority
Round completion
Score calculation
Match completion

Primary tables:

matches
match_rounds
round_player_states
guesses
(3/27)
score_events

Redis:

active match state cache
per-match lock
timer markers
WS fanout state

Important boundary:

The client never decides whether a guess is valid, whether a round is solved, or what the score is. The client only submits player intent.

---

3.6 Word library module
Owns:

Answer word list
Guess-valid word list
Difficulty tags
Word activation/inactivation
Dictionary versions
Admin review

Primary tables:

word_entries
word_lists
word_list_entries

---

3.7 Rating module
Owns:

Rated match finalization
Rating algorithm
Provisional status
Rating history
Season leaderboard updates

Primary tables:

ratings
rating_events
seasons
leaderboard_entries

Queue jobs:

FinalizeRatedMatchJob
RecalculateLeaderboardJob
VoidMatchRatingJob

---

3.8 Analytics module
Owns:

Product event ingestion
Gameplay event capture
Privacy-aware identifiers
Event export to warehouse later

Primary tables:

analytics_events

Could also stream to external analytics provider.

---

3.9 Admin/moderation module
Owns:

User search
Account moderation
Ban/suspend
Leaderboard removal
Match voiding
Word management
Audit logs
Suspicious match review

Primary tables:

moderation_actions
reports
admin_audit_logs
suspicious_match_flags

---

Database schema
Assumption: PostgreSQL with UUID primary keys. Use created_at and updated_at on all mutable entities.

4.1 Users and auth
users
users (
  id uuid primary key,
  email citext unique null,
  email_verified_at timestamptz null,
  status text not null, -- active, suspended, banned, deleted
  role text not null default 'player', -- player, moderator, admin
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null
)


user_auth_identities
 (4/27)
user_auth_identities (
  id uuid primary key,
  user_id uuid not null references users(id),
  provider text not null, -- password, google, apple, discord, etc.
  provider_subject text not null,
  password_hash text null,
  created_at timestamptz not null,
  unique(provider, provider_subject)
)


user_sessions
user_sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  refresh_token_hash text not null,
  device_label text null,
  platform text null, -- web, ios, android
  ip_hash text null,
  user_agent_hash text null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null
)


---

4.2 Profiles/settings
user_profiles
user_profiles (
  user_id uuid primary key references users(id),
  handle citext unique null,
  display_name text not null,
  avatar_url text null,
  bio text null,
  profile_visibility text not null default 'public', -- public, participants_only, private
  country_code text null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)


user_settings
user_settings (
  user_id uuid primary key references users(id),
  colorblind_mode boolean not null default false,
  reduced_motion boolean not null default false,
  sound_enabled boolean not null default true,
  haptics_enabled boolean not null default true,
  analytics_consent boolean not null default false,
  training_consent boolean not null default false,
  notification_preferences jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
)


---

4.3 Lobbies
lobbies
 (5/27)
lobbies (
  id uuid primary key,
  code text not null unique,
  host_user_id uuid null references users(id),
  visibility text not null, -- public, private
  state text not null, -- created, waiting, ready, starting, in_progress, completed, abandoned, cancelled, expired
  rated boolean not null default false,
  mode text not null default 'standard',
  language text not null default 'en',
  word_length int not null default 5,
  difficulty text not null default 'medium',
  max_players int not null,
  min_players int not null,
  rounds_count int not null,
  round_time_seconds int not null,
  scoring_preset text not null default 'standard',
  settings jsonb not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)


Indexes:

index lobbies_public_waiting_idx on lobbies(visibility, state, rated, difficulty, created_at);
index lobbies_code_idx on lobbies(code);


lobby_members
lobby_members (
  lobby_id uuid not null references lobbies(id),
  user_id uuid not null references users(id),
  role text not null, -- host, player
  state text not null, -- joined, ready, disconnected, left, kicked
  joined_at timestamptz not null,
  left_at timestamptz null,
  primary key(lobby_id, user_id)
)


---

4.4 Matchmaking
matchmaking_tickets
matchmaking_tickets (
  id uuid primary key,
  user_id uuid not null references users(id),
  state text not null, -- queued, matched, cancelled, timed_out, failed
  rated boolean not null,
  mode text not null,
  difficulty text null,
  rating_min int null,
  rating_max int null,
  matched_lobby_id uuid null references lobbies(id),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null
)


Constraint:

-- app-level or partial unique index
unique active queue ticket per user where state = 'queued'


---

4.5 Matches and gameplay
matches
 (6/27)
matches (
  id uuid primary key,
  lobby_id uuid null references lobbies(id),
  state text not null, -- initializing, in_progress, completed, abandoned, cancelled, voided
  rated boolean not null,
  mode text not null,
  language text not null,
  word_length int not null,
  difficulty text not null,
  rounds_count int not null,
  round_time_seconds int not null,
  scoring_preset text not null,
  started_at timestamptz null,
  completed_at timestamptz null,
  voided_at timestamptz null,
  void_reason text null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)


match_participants
match_participants (
  match_id uuid not null references matches(id),
  user_id uuid not null references users(id),
  placement int null,
  total_score int not null default 0,
  rounds_solved int not null default 0,
  total_guesses int not null default 0,
  total_solve_ms int not null default 0,
  outcome text null, -- won, lost, tied, forfeited, abandoned
  rating_delta int null,
  joined_at timestamptz not null,
  disconnected_at timestamptz null,
  forfeited_at timestamptz null,
  primary key(match_id, user_id)
)


match_rounds
match_rounds (
  id uuid primary key,
  match_id uuid not null references matches(id),
  round_number int not null,
  answer_word_id uuid not null references word_entries(id),
  state text not null, -- pending, active, completed
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  completed_at timestamptz null,
  unique(match_id, round_number)
)


round_player_states
round_player_states (
  round_id uuid not null references match_rounds(id),
  user_id uuid not null references users(id),
  state text not null, -- active, solved, failed, timed_out, disconnected
  solved_at timestamptz null,
  guess_count int not null default 0,
  score int not null default 0,
  solve_ms int null,
  primary key(round_id, user_id)
)


guesses
 (7/27)
guesses (
  id uuid primary key,
  round_id uuid not null references match_rounds(id),
  user_id uuid not null references users(id),
  guess_text text not null,
  guess_number int not null,
  valid boolean not null,
  feedback jsonb null,
  submitted_at timestamptz not null,
  rejected_reason text null,
  unique(round_id, user_id, guess_number)
)


score_events
score_events (
  id uuid primary key,
  match_id uuid not null references matches(id),
  round_id uuid null references match_rounds(id),
  user_id uuid not null references users(id),
  type text not null, -- solve_base, guess_bonus, speed_bonus, penalty, adjustment
  points int not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null
)


---

4.6 Word library
word_entries
word_entries (
  id uuid primary key,
  text citext not null,
  language text not null,
  length int not null,
  difficulty text not null,
  frequency_score numeric null,
  offensive boolean not null default false,
  sensitive boolean not null default false,
  active boolean not null default true,
  source text null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(language, text)
)


word_lists
word_lists (
  id uuid primary key,
  name text not null,
  language text not null,
  type text not null, -- answer, guess_valid, banned
  version text not null,
  active boolean not null default false,
  created_at timestamptz not null,
  unique(name, version)
)


word_list_entries
word_list_entries (
  word_list_id uuid not null references word_lists(id),
  word_id uuid not null references word_entries(id),
  primary key(word_list_id, word_id)
)


---

4.7 Ratings and leaderboards
seasons
 (8/27)
seasons (
  id uuid primary key,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  active boolean not null default false
)


ratings
ratings (
  user_id uuid not null references users(id),
  season_id uuid not null references seasons(id),
  mode text not null,
  rating int not null,
  rating_deviation numeric null,
  provisional boolean not null default true,
  matches_played int not null default 0,
  peak_rating int not null,
  updated_at timestamptz not null,
  primary key(user_id, season_id, mode)
)


rating_events
rating_events (
  id uuid primary key,
  user_id uuid not null references users(id),
  match_id uuid not null references matches(id),
  season_id uuid not null references seasons(id),
  mode text not null,
  rating_before int not null,
  rating_after int not null,
  rating_delta int not null,
  algorithm text not null,
  created_at timestamptz not null,
  unique(user_id, match_id, mode)
)


leaderboard_entries
leaderboard_entries (
  season_id uuid not null references seasons(id),
  mode text not null,
  user_id uuid not null references users(id),
  rank int null,
  rating int not null,
  matches_played int not null,
  win_rate numeric null,
  updated_at timestamptz not null,
  primary key(season_id, mode, user_id)
)


---

4.8 Reports, moderation, analytics
reports
reports (
  id uuid primary key,
  reporter_user_id uuid null references users(id),
  reported_user_id uuid null references users(id),
  match_id uuid null references matches(id),
  type text not null, -- cheating, offensive_name, abuse, bug, other
  status text not null, -- open, reviewing, resolved, dismissed
  description text null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)


moderation_actions
 (9/27)
moderation_actions (
  id uuid primary key,
  actor_user_id uuid not null references users(id),
  target_user_id uuid null references users(id),
  match_id uuid null references matches(id),
  type text not null, -- ban, suspend, warn, void_match, hide_leaderboard
  reason text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null
)


admin_audit_logs
admin_audit_logs (
  id uuid primary key,
  actor_user_id uuid not null references users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  before jsonb null,
  after jsonb null,
  ip_hash text null,
  created_at timestamptz not null
)


suspicious_match_flags
suspicious_match_flags (
  id uuid primary key,
  match_id uuid not null references matches(id),
  user_id uuid null references users(id),
  flag_type text not null,
  severity text not null, -- low, medium, high
  details jsonb not null default '{}',
  reviewed_at timestamptz null,
  reviewed_by uuid null references users(id),
  created_at timestamptz not null
)


analytics_events
analytics_events (
  id uuid primary key,
  user_id uuid null references users(id),
  anonymous_id text null,
  session_id uuid null,
  event_name text not null,
  platform text null,
  properties jsonb not null default '{}',
  consent_scope text not null, -- necessary, product_analytics, training_opt_in
  occurred_at timestamptz not null,
  ingested_at timestamptz not null
)


---

Redis usage
5.1 Presence
Keys:

presence:user:{userId}
presence:lobby:{lobbyId}:members
presence:match:{matchId}:members


Use:

Online/offline status
Lobby disconnect grace
Match reconnect status

---

5.2 Lobby locks
Keys:

lock:lobby:{lobbyId}:join
lock:lobby:{lobbyId}:start


Use:

Prevent lobby overfill
Prevent duplicate match start
Protect host-transfer race conditions

---

5.3 Match state cache
Keys:
 (10/27)
match:{matchId}:state
match:{matchId}:round:{roundId}:state
match:{matchId}:user:{userId}:state


Use:

Fast WebSocket reconnect
Low-latency gameplay reads
Server-authoritative current round state

Important:

PostgreSQL remains durable source of record.
Redis can be rebuilt from DB for completed states.
Active match state should be flushed to PostgreSQL at meaningful events.

---

5.4 Matchmaking queues
Keys:

queue:matchmaking:{rated}:{mode}:{difficulty}
queue:user:{userId}:active_ticket


Use:

Quick join
Rating-window expansion
Duplicate queue prevention
Timeout handling

---

5.5 Rate limiting
Keys:

rate:user:{userId}:guess_submit
rate:ip:{ipHash}:auth
rate:user:{userId}:lobby_create


Use:

Guess spam protection
Auth brute-force protection
Lobby abuse prevention

---

5.6 Leaderboard cache
Keys:

leaderboard:{seasonId}:{mode}
leaderboard:user:{userId}:{seasonId}:{mode}


Use:

Fast top-N leaderboard reads
User rank lookup

Durable leaderboard data should still exist in PostgreSQL.

---

REST API contract
Base path:

/api/v1


Response envelope:

{
  "data": {},
  "error": null,
  "requestId": "req_123"
}


Error envelope:

{
  "data": null,
  "error": {
    "code": "LOBBY_FULL",
    "message": "Lobby is full.",
    "details": {}
  },
  "requestId": "req_123"
}


Common HTTP codes:

200 success
201 created
204 no content
400 validation error
401 unauthenticated
403 unauthorized
404 not found
409 state conflict/race
422 domain rule violation
429 rate limited
500 internal error

---

6.1 Auth endpoints
Register
POST /api/v1/auth/register


Request:

{
  "email": "player@example.com",
  "password": "string",
  "displayName": "Ashar"
}


Response:
 (11/27)
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "player@example.com",
      "status": "active"
    },
    "accessToken": "jwt",
    "refreshToken": "opaque_refresh_token"
  },
  "error": null,
  "requestId": "req_123"
}


---

Login
POST /api/v1/auth/login


Request:

{
  "email": "player@example.com",
  "password": "string"
}


---

Refresh session
POST /api/v1/auth/refresh


Request:

{
  "refreshToken": "opaque_refresh_token"
}


---

Logout current session
POST /api/v1/auth/logout


---

List sessions
GET /api/v1/auth/sessions


---

Revoke session
DELETE /api/v1/auth/sessions/{sessionId}


---

6.2 Current user/profile endpoints
Current user
GET /api/v1/me


Response:

{
  "data": {
    "id": "uuid",
    "email": "player@example.com",
    "role": "player",
    "profile": {
      "handle": "ashar",
      "displayName": "Ashar",
      "avatarUrl": null,
      "profileVisibility": "public"
    }
  },
  "error": null,
  "requestId": "req_123"
}


---

Update profile
PATCH /api/v1/me/profile


Request:

{
  "handle": "ashar",
  "displayName": "Ashar",
  "avatarUrl": "https://..."
}


---

Update settings
PATCH /api/v1/me/settings


Request:

{
  "colorblindMode": true,
  "reducedMotion": false,
  "analyticsConsent": true,
  "trainingConsent": false
}


---

Delete account
DELETE /api/v1/me


Request:

{
  "confirmation": "DELETE"
}


---

6.3 Public profile endpoints
Get public profile
GET /api/v1/users/{userId}/profile


Response:
 (12/27)
{
  "data": {
    "userId": "uuid",
    "handle": "ashar",
    "displayName": "Ashar",
    "avatarUrl": null,
    "rating": 1520,
    "rank": 421,
    "stats": {
      "matchesPlayed": 42,
      "winRate": 0.31,
      "averageScore": 284,
      "averageGuesses": 4.1
    }
  },
  "error": null,
  "requestId": "req_123"
}


---

Get user match history
GET /api/v1/users/{userId}/matches?limit=20&cursor=...


---

6.4 Lobby endpoints
Create lobby
POST /api/v1/lobbies


Request:

{
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
  "scoringPreset": "standard"
}


Response:

{
  "data": {
    "id": "uuid",
    "code": "ABCD12",
    "state": "waiting",
    "hostUserId": "uuid"
  },
  "error": null,
  "requestId": "req_123"
}


Validation:

Rated lobbies must use ranked-compatible settings.
minPlayers <= maxPlayers.
Word length must be supported by active dictionary.

---

Get lobby
GET /api/v1/lobbies/{lobbyId}


---

Join by lobby ID
POST /api/v1/lobbies/{lobbyId}/join


---

Join by code
POST /api/v1/lobbies/join-by-code


Request:

{
  "code": "ABCD12"
}


Possible errors:

LOBBY_NOT_FOUND
LOBBY_FULL
LOBBY_EXPIRED
LOBBY_ALREADY_STARTED
RANK_REQUIREMENT_NOT_MET

---

Leave lobby
POST /api/v1/lobbies/{lobbyId}/leave


---

Update lobby settings
PATCH /api/v1/lobbies/{lobbyId}


Host only. Only allowed while lobby is waiting or ready.

---

Set ready state
POST /api/v1/lobbies/{lobbyId}/ready


Request:

{
  "ready": true
}


---

Start lobby match
POST /api/v1/lobbies/{lobbyId}/start


Host only.

Response:
 (13/27)
{
  "data": {
    "matchId": "uuid",
    "state": "initializing"
  },
  "error": null,
  "requestId": "req_123"
}


---

Browse public lobbies
GET /api/v1/lobbies?visibility=public&state=waiting&rated=false&difficulty=medium&limit=20&cursor=...


---

6.5 Matchmaking endpoints
Start quick join
POST /api/v1/matchmaking/queue


Request:

{
  "rated": true,
  "mode": "standard",
  "difficulty": "medium"
}


Response:

{
  "data": {
    "ticketId": "uuid",
    "state": "queued",
    "expiresAt": "2026-06-15T12:10:00Z"
  },
  "error": null,
  "requestId": "req_123"
}


---

Get queue ticket
GET /api/v1/matchmaking/queue/{ticketId}


---

Cancel quick join
DELETE /api/v1/matchmaking/queue/{ticketId}


---

6.6 Match/gameplay endpoints
Most active gameplay should use WebSockets. REST is still useful for snapshots and reports.

Get match snapshot
GET /api/v1/matches/{matchId}


Response:

{
  "data": {
    "id": "uuid",
    "state": "in_progress",
    "currentRound": {
      "roundId": "uuid",
      "roundNumber": 1,
      "startsAt": "timestamp",
      "endsAt": "timestamp"
    },
    "participants": []
  },
  "error": null,
  "requestId": "req_123"
}


---

Submit guess fallback
POST /api/v1/matches/{matchId}/rounds/{roundId}/guesses


Prefer WS, but REST fallback can help mobile recovery.

Request:

{
  "guess": "crane",
  "clientRequestId": "uuid"
}


Response:

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
    "roundState": "active"
  },
  "error": null,
  "requestId": "req_123"
}


---

Get match report
 (14/27)
GET /api/v1/matches/{matchId}/report


---

6.7 Leaderboard endpoints
Get leaderboard
GET /api/v1/leaderboards/global?seasonId=current&mode=standard&limit=50&cursor=...


Response:

{
  "data": {
    "entries": [
      {
        "rank": 1,
        "userId": "uuid",
        "handle": "player1",
        "displayName": "Player 1",
        "rating": 2100,
        "matchesPlayed": 120,
        "winRate": 0.52
      }
    ],
    "nextCursor": "..."
  },
  "error": null,
  "requestId": "req_123"
}


---

Get my leaderboard position
GET /api/v1/leaderboards/global/me?seasonId=current&mode=standard


---

6.8 Word/admin endpoints
Admin only.

GET    /api/v1/admin/words
POST   /api/v1/admin/words
PATCH  /api/v1/admin/words/{wordId}
DELETE /api/v1/admin/words/{wordId}
POST   /api/v1/admin/word-lists
POST   /api/v1/admin/word-lists/{listId}/activate


---

6.9 Moderation/admin endpoints
Admin/moderator only.

GET    /api/v1/admin/users
GET    /api/v1/admin/users/{userId}
POST   /api/v1/admin/users/{userId}/suspend
POST   /api/v1/admin/users/{userId}/ban
POST   /api/v1/admin/users/{userId}/restore

GET    /api/v1/admin/reports
PATCH  /api/v1/admin/reports/{reportId}

GET    /api/v1/admin/matches/{matchId}
POST   /api/v1/admin/matches/{matchId}/void

GET    /api/v1/admin/suspicious-matches
PATCH  /api/v1/admin/suspicious-matches/{flagId}


---

6.10 Analytics endpoints
Ingest client analytics
POST /api/v1/analytics/events


Request:

{
  "events": [
    {
      "eventName": "lobby_join_failed",
      "anonymousId": "anon_123",
      "occurredAt": "timestamp",
      "consentScope": "product_analytics",
      "properties": {
        "reason": "LOBBY_FULL",
        "platform": "ios"
      }
    }
  ]
}


Server should reject or downgrade events based on consent rules.

---

WebSocket contract
Recommended namespace:

/wss

 (15/27)
Authentication:

Client connects with short-lived access token.
Token can be passed via auth payload, not query string if possible.

Example:

{
  "token": "jwt"
}


Core concepts:

User socket room: user:{userId}
Lobby room: lobby:{lobbyId}
Match room: match:{matchId}

Message envelope:

{
  "type": "event.name",
  "requestId": "uuid-or-null",
  "sentAt": "2026-06-15T12:00:00Z",
  "payload": {}
}


Error event:

{
  "type": "error",
  "requestId": "uuid",
  "sentAt": "timestamp",
  "payload": {
    "code": "ROUND_NOT_ACTIVE",
    "message": "Round is not active.",
    "details": {}
  }
}


---

7.1 Connection events
Client → server: authenticate/connect
Handled during connection.

Server → client: connection.ready
{
  "type": "connection.ready",
  "payload": {
    "userId": "uuid",
    "serverTime": "timestamp"
  }
}


Server → client: connection.resync_required
{
  "type": "connection.resync_required",
  "payload": {
    "reason": "stale_client_state"
  }
}


---

7.2 Lobby events
Client → server: lobby.subscribe
{
  "type": "lobby.subscribe",
  "requestId": "uuid",
  "payload": {
    "lobbyId": "uuid"
  }
}


Server → client: lobby.snapshot
{
  "type": "lobby.snapshot",
  "payload": {
    "lobby": {
      "id": "uuid",
      "code": "ABCD12",
      "state": "waiting",
      "hostUserId": "uuid",
      "settings": {
        "rated": false,
        "difficulty": "medium",
        "roundsCount": 3,
        "roundTimeSeconds": 120
      }
    },
    "members": [
      {
        "userId": "uuid",
        "displayName": "Ashar",
        "role": "host",
        "state": "joined",
        "ready": false
      }
    ]
  }
}


Server → client: lobby.member_joined
 (16/27)
{
  "type": "lobby.member_joined",
  "payload": {
    "lobbyId": "uuid",
    "member": {
      "userId": "uuid",
      "displayName": "Player 2",
      "role": "player"
    }
  }
}


Server → client: lobby.member_left
{
  "type": "lobby.member_left",
  "payload": {
    "lobbyId": "uuid",
    "userId": "uuid",
    "reason": "left"
  }
}


Server → client: lobby.member_ready_changed
{
  "type": "lobby.member_ready_changed",
  "payload": {
    "lobbyId": "uuid",
    "userId": "uuid",
    "ready": true
  }
}


Server → client: lobby.settings_updated
{
  "type": "lobby.settings_updated",
  "payload": {
    "lobbyId": "uuid",
    "settings": {}
  }
}


Server → client: lobby.host_changed
{
  "type": "lobby.host_changed",
  "payload": {
    "lobbyId": "uuid",
    "hostUserId": "uuid"
  }
}


Server → client: lobby.match_starting
{
  "type": "lobby.match_starting",
  "payload": {
    "lobbyId": "uuid",
    "matchId": "uuid",
    "startsAt": "timestamp"
  }
}


Server → client: lobby.closed
{
  "type": "lobby.closed",
  "payload": {
    "lobbyId": "uuid",
    "reason": "expired"
  }
}


---

7.3 Matchmaking events
Client → server: matchmaking.subscribe
{
  "type": "matchmaking.subscribe",
  "requestId": "uuid",
  "payload": {
    "ticketId": "uuid"
  }
}


Server → client: matchmaking.status
{
  "type": "matchmaking.status",
  "payload": {
    "ticketId": "uuid",
    "state": "queued",
    "estimatedWaitSeconds": 30
  }
}


Server → client: matchmaking.matched
{
  "type": "matchmaking.matched",
  "payload": {
    "ticketId": "uuid",
    "lobbyId": "uuid",
    "matchId": null
  }
}


Server → client: matchmaking.timeout
{
  "type": "matchmaking.timeout",
  "payload": {
    "ticketId": "uuid",
    "options": ["retry", "create_lobby", "broaden_filters"]
  }
}


---
 (17/27)
7.4 Gameplay events
Client → server: match.subscribe
{
  "type": "match.subscribe",
  "requestId": "uuid",
  "payload": {
    "matchId": "uuid"
  }
}


Server → client: match.snapshot
{
  "type": "match.snapshot",
  "payload": {
    "matchId": "uuid",
    "state": "in_progress",
    "serverTime": "timestamp",
    "currentRound": {
      "roundId": "uuid",
      "roundNumber": 1,
      "state": "active",
      "startsAt": "timestamp",
      "endsAt": "timestamp",
      "wordLength": 5,
      "maxGuesses": 6
    },
    "myState": {
      "guesses": [],
      "roundState": "active",
      "score": 0
    },
    "standings": []
  }
}


Server → client: match.started
{
  "type": "match.started",
  "payload": {
    "matchId": "uuid",
    "startedAt": "timestamp"
  }
}


Server → client: round.started
{
  "type": "round.started",
  "payload": {
    "matchId": "uuid",
    "roundId": "uuid",
    "roundNumber": 1,
    "startsAt": "timestamp",
    "endsAt": "timestamp",
    "wordLength": 5,
    "maxGuesses": 6
  }
}


Client → server: guess.submit
{
  "type": "guess.submit",
  "requestId": "uuid",
  "payload": {
    "matchId": "uuid",
    "roundId": "uuid",
    "guess": "crane",
    "clientSubmittedAt": "timestamp"
  }
}


Server → client: guess.accepted
{
  "type": "guess.accepted",
  "requestId": "uuid",
  "payload": {
    "roundId": "uuid",
    "guess": "crane",
    "guessNumber": 2,
    "feedback": [
      { "letter": "c", "state": "absent" },
      { "letter": "r", "state": "present" },
      { "letter": "a", "state": "correct" },
      { "letter": "n", "state": "absent" },
      { "letter": "e", "state": "present" }
    ],
    "roundState": "active",
    "score": 0
  }
}


Server → client: guess.rejected
 (18/27)
{
  "type": "guess.rejected",
  "requestId": "uuid",
  "payload": {
    "roundId": "uuid",
    "guess": "xxxxx",
    "reason": "not_in_dictionary"
  }
}


Server → match room: round.player_progress
Send limited public progress, not full guesses unless product chooses otherwise.

{
  "type": "round.player_progress",
  "payload": {
    "roundId": "uuid",
    "userId": "uuid",
    "guessCount": 3,
    "state": "active"
  }
}


Server → match room: round.player_solved
{
  "type": "round.player_solved",
  "payload": {
    "roundId": "uuid",
    "userId": "uuid",
    "guessCount": 4,
    "solveMs": 45000,
    "score": 135
  }
}


Server → client: round.ended
{
  "type": "round.ended",
  "payload": {
    "roundId": "uuid",
    "answer": "crane",
    "standings": [
      {
        "userId": "uuid",
        "roundScore": 150,
        "totalScore": 300,
        "state": "solved"
      }
    ],
    "nextRoundStartsAt": "timestamp"
  }
}


Server → client: match.completed
{
  "type": "match.completed",
  "payload": {
    "matchId": "uuid",
    "finalStandings": [
      {
        "userId": "uuid",
        "placement": 1,
        "totalScore": 820,
        "ratingDelta": 24
      }
    ],
    "reportUrl": "/matches/uuid/report"
  }
}


Server → client: match.voided
{
  "type": "match.voided",
  "payload": {
    "matchId": "uuid",
    "reason": "server_integrity_issue"
  }
}


---

7.5 Reconnect events
Client → server: session.resync
{
  "type": "session.resync",
  "requestId": "uuid",
  "payload": {
    "activeLobbyId": "uuid-or-null",
    "activeMatchId": "uuid-or-null",
    "lastEventId": "optional"
  }
}


Server → client: session.resync_result
{
  "type": "session.resync_result",
  "requestId": "uuid",
  "payload": {
    "lobbySnapshot": {},
    "matchSnapshot": {},
    "missedEventsAvailable": false
  }
}

 (19/27)
Recommendation:

For V1, use snapshot-based resync rather than guaranteed event replay.
Add event replay later if needed.

---

Auth and session model
8.1 Authentication
Recommended:

Short-lived JWT access token, e.g. 15 minutes.
Long-lived opaque refresh token stored hashed in DB.
Web: secure HTTP-only cookie for refresh token where possible.
Mobile: secure storage/keychain for refresh token.
Access token used for REST and WebSocket auth.

8.2 Authorization
Roles:

player
moderator
admin

Authorization checks:

Users can only mutate their own profile/settings.
Lobby host can mutate lobby before match start.
Match participants can access match state/report.
Public profiles obey visibility settings.
Admin/mod endpoints require moderator/admin role.
Word management requires admin or content moderator role.

8.3 Session security
Requirements:

Refresh token rotation.
Session revocation.
Device/session list.
Password reset invalidates active sessions if email/password is enabled.
Account suspension invalidates active sessions.
WebSocket auth rechecked on connection and periodically for long connections.

8.4 Anti-cheat/security boundaries
Server must own:

Word selection
Guess validation
Feedback calculation
Timer authority
Score calculation
Match completion
Rating updates

Client may own:

Rendering
Input composition
Local optimistic UI before server acceptance, carefully
Animation/timer display based on server timestamps

Do not trust:

Client solve time
Client guess validity
Client score
Client completion state
Client rank/rating

---

Game engine boundaries
9.1 Server-authoritative state machine
The backend should implement explicit state machines for:

Lobby lifecycle
Match lifecycle
Round lifecycle
Participant round state

Do not scatter state transition logic across controllers.

Recommended internal modules:
 (20/27)
game/
  lobby-state-machine.ts
  match-state-machine.ts
  round-state-machine.ts
  scoring-engine.ts
  word-validator.ts
  feedback-engine.ts
  match-finalizer.ts


9.2 Idempotency
Use clientRequestId for guess submission and critical actions.

Required idempotent actions:

Submit guess
Start match
Join lobby
Leave lobby
Queue matchmaking
Cancel matchmaking

9.3 Timers
Timers should be server-driven.

Implementation options:

Store starts_at and ends_at in DB/Redis.
On each guess, compare server time to ends_at.
Background job finalizes expired rounds.
WebSocket emits countdown based on timestamps, not every-second server ticks.

Do not send per-second timer events unless necessary.

---

Rating pipeline
10.1 Recommended V1 algorithm
For V1 ranked multiplayer, use either:

Glicko-2 style rating, or
Custom placement-based MMR with provisional boost

Avoid simple two-player Elo unless ranked is strictly 1v1.

10.2 Rated match finalization flow
Match completed
  ↓
Persist final scores and placements
  ↓
Emit FinalizeRatedMatchJob
  ↓
Load participants and current ratings
  ↓
Calculate rating deltas
  ↓
Insert rating_events
  ↓
Update ratings
  ↓
Update leaderboard_entries
  ↓
Emit match.completed with rating deltas


10.3 Rating integrity rules
Rating update happens once per match.
rating_events unique on (user_id, match_id, mode).
Voided match creates reversing rating_events if already applied.
Suspicious matches can delay rating publication if anti-cheat confidence is high.

10.4 Leaderboard strategy
V1:

Store materialized leaderboard entries in PostgreSQL.
Cache top pages in Redis.
Recompute affected users after each rated match.
Periodically run consistency job.

Later:

Dedicated leaderboard service if traffic demands.

---

Admin and moderation architecture
11.1 Admin boundaries
 (21/27)
Admin actions must always produce audit logs.

Examples:

Ban user
Suspend user
Change user display name
Void match
Remove leaderboard entry
Activate word list
Disable word

11.2 Suspicious solve detection
V1 should implement simple flags:

Solve under threshold
Too many first-guess solves
Repeated perfect hard-word performance
Abnormal invalid guess pattern
Many accounts from same hashed device/IP, if legally allowed

Do not auto-ban from V1 signals. Flag for review.

11.3 Reports
Players can report:

User/profile
Match
Suspicious behavior
Offensive display name

Reports should not expose internal flagging decisions to reported users.

---

Deployment assumptions
12.1 Environments
Minimum environments:

local
staging
production

12.2 Suggested deployment
Simple production-ready starting point:

Web app:        Vercel or equivalent
Mobile app:     Expo/EAS builds
Backend API:    Render/Fly.io/Railway/AWS ECS
PostgreSQL:     Managed Postgres
Redis:          Managed Redis
Object storage: S3-compatible
Workers:        Same backend image running worker process


12.3 Required runtime processes
api-server       REST + WebSocket
worker           queues, rating finalization, analytics flush, expiry jobs
scheduler        periodic cleanup/recompute jobs; may be worker mode


Can be same codebase/image but separate process types.

12.4 Observability
Must have:

Structured logs with request IDs
Error tracking
API latency metrics
WebSocket connection counts
Matchmaking queue metrics
Match finalization failures
Rating job failures
Redis/Postgres health checks

---

Scaling risks and trade-offs
13.1 WebSocket scaling
Risk:

Multiple backend instances need shared presence/fanout.

Mitigation:

Use Redis adapter/pubsub for Socket.IO or equivalent.
Store rooms/state in Redis.
Design reconnect via snapshots.

Trade-off:
 (22/27)
Socket.IO is easier for rooms/reconnect; raw WS gives more control but more engineering burden.

Recommendation:

Use Socket.IO for V1 unless there is a strong reason not to.

---

13.2 Active match consistency
Risk:

Race conditions from simultaneous guesses, disconnects, timer expiry.

Mitigation:

Per-match or per-round Redis locks.
Idempotency keys.
DB constraints for guess order.
Server timestamp authority.

Trade-off:

Strong locking can reduce throughput but is acceptable for Wordle-style gameplay.

---

13.3 Matchmaking quality
Risk:

Low population makes ranked matchmaking slow.

Mitigation:

Expand rating window over time.
Offer fallback to create lobby.
Use bots only if product explicitly approves; not recommended for ranked.

---

13.4 Leaderboard correctness
Risk:

Real-time leaderboard updates can drift from ratings.

Mitigation:

Rating events as source of truth.
Periodic reconciliation job.
Unique constraints preventing duplicate rating application.

---

13.5 Analytics privacy
Risk:

Gameplay telemetry can become sensitive behavioral data.

Mitigation:

Separate consent scopes.
Minimize identifiers.
Retention policies.
Avoid raw free-text collection.
Make training/insight usage opt-in where required.

---

13.6 Word library quality
Risk:

Offensive/obscure/incorrect words harm trust.

Mitigation:

Separate answer and valid-guess lists.
Admin review.
Dictionary versioning.
Ability to deactivate words without app release.

---

Implementation guidance by agent
Freya — backend/core
Start with:

Auth/users/profile foundation
Lobby state machine
REST lobby endpoints
WebSocket lobby room events
Game engine core
Match finalization and scoring
Rating pipeline

Luna — frontend/product UI
Start with:

Auth screens
Home dashboard
Create lobby
Join by code
Lobby waiting room
Gameplay board
Match report (23/27)
Profile/leaderboard views

Ruby — tooling/data/integrations
Start with:

Word list import pipeline
Dictionary validation scripts
Analytics event catalog/types
Admin word tooling
Rating simulation scripts

Yuna — ops
Start with:

Environment matrix
Postgres/Redis provisioning
Backend/web deployment
CI/CD
Secrets management
Observability
Mobile app release checklist

Jasmine — QA
Start with:

Lobby lifecycle test matrix
WebSocket reconnect tests
Gameplay correctness tests
Scoring/rating tests
Edge-case race tests
Mobile background/resume tests

---

Key open decisions
Athena/Ashar should resolve these before implementation locks:

Backend framework
NestJS vs Fastify.

WebSocket library
Socket.IO vs raw WS.

Rating algorithm
Glicko-2/custom MMR vs Elo.

Ranked player counts
1v1 only initially or multiplayer ranked from launch.

Word length
Fixed 5-letter V1 or configurable at launch.

Auth methods
Email/password, Google, Apple, Discord, magic link.

Profile identity
Unique handles required or display-name-only.

Analytics provider
Internal DB first, PostHog/Segment, or warehouse-first.

Deployment platform
Vercel + managed backend, or all-in-one platform.

Admin dashboard scope
Full dashboard vs internal/admin API first.

---

Acceptance criteria mapping
| Acceptance criterion | Status |
|---|---|
| Recommended stack | Defined |
| Backend modules | Defined |
| Database schema | Defined |
| Redis usage | Defined |
| REST APIs | Defined |
| WebSocket events | Defined |
| Auth/session model | Defined |
| Game engine boundaries | Defined |
| Rating pipeline | Defined |
| Admin/moderation | Defined |
| Deployment assumptions | Defined |
| Text architecture diagram | Included |
| Scaling risks/trade-offs | Included |

---

What I did or recommend
 (24/27)
I produced the initial architecture and API contract covering:

Production stack recommendation
Text architecture diagram
Backend service/module boundaries
PostgreSQL schema
Redis usage plan
REST API contract
WebSocket event contract
Auth/session/security model
Server-authoritative game engine boundaries
Rating/leaderboard pipeline
Admin/moderation architecture
Deployment assumptions
Scaling risks and trade-offs
Implementation handoff guidance for other agents

---

Files changed
None.

---

Tests/commands run
No implementation tests were run. This was an architecture/specification ticket.

Tooling note: loaded the writing-plans skill to follow the project handoff/planning standard.

---

Evidence/result
Deliverable produced: Architecture spec and API contract suitable for Athena to convert into implementation tickets.

---

Blockers or risks
Blockers
No blocker for architecture delivery.

Risks
The architecture assumes a TypeScript full-stack direction; if Ashar prefers Python/FastAPI, contracts remain usable but implementation module names and tooling should change.
Multiplayer ranked rating needs explicit product decision before final implementation.
WebSocket scaling should be designed early; retrofitting multi-instance realtime later is painful.
Privacy/analytics consent must be implemented before high-volume telemetry collection.
Admin/moderation cannot be left until after launch if ranked leaderboards are public.

---

Follow-up tickets
Follow-up ticket 1
Target agent: Athena
Why that agent is needed: Athena owns scope sequencing and decision routing.
Exact task: Review open decisions in this architecture spec and ask Ashar to approve the key stack/rating/auth/realtime choices.
Inputs/context they need: This architecture spec, especially section 15.   (25/27)
Expected output back to Athena: Approved technical decisions and implementation sequencing.

---

Follow-up ticket 2
Target agent: Freya
Why that agent is needed: Freya owns backend/core server-side implementation.
Exact task: Create backend foundation with auth/users/profile schema, lobby schema, initial REST routes, and WebSocket connection/auth skeleton.
Inputs/context they need: Sections 3–8 of this spec.
Expected output back to Athena: Backend implementation summary, files changed, migrations created, API routes added, tests run.

---

Follow-up ticket 3
Target agent: Freya
Why that agent is needed: Game engine logic is backend-critical and must be server-authoritative.
Exact task: Implement the game engine state machines for lobby, match, round, guess validation, feedback generation, scoring, and match finalization.
Inputs/context they need: Sections 4.5, 7.4, 9, and 10 of this spec.
Expected output back to Athena: Game engine implementation summary with unit tests proving feedback, scoring, timers, and state transitions.

---

Follow-up ticket 4
Target agent: Luna
Why that agent is needed: Luna owns product-facing frontend implementation.
Exact task: Build frontend API client and WebSocket client contract wrappers for auth, lobbies, matchmaking, gameplay, profiles, and leaderboards.
Inputs/context they need: REST contract section 6 and WebSocket contract section 7.
Expected output back to Athena: Typed frontend client interfaces, screens/components using those contracts, and mock integration evidence.

---

Follow-up ticket 5
Target agent: Ruby
Why that agent is needed: Ruby owns tooling, scripts, pipelines, and integrations.
Exact task: Design and implement word-list import/versioning tooling plus analytics event type catalog.
Inputs/context they need: Sections 4.6, 6.10, and 11.   (26/27)
Expected output back to Athena: Import scripts, validation rules, analytics event definitions, and sample imported dictionary data.

---

Follow-up ticket 6
Target agent: Yuna
Why that agent is needed: Yuna owns deployment, CI/CD, infrastructure, secrets, and reliability.
Exact task: Produce deployment plan for web, mobile, backend API, worker, PostgreSQL, Redis, secrets, logs, metrics, and staging/production environments.
Inputs/context they need: Section 12 and scaling risks in section 13.
Expected output back to Athena: Operations plan, environment matrix, deployment checklist, and monitoring requirements.

---

Follow-up ticket 7
Target agent: Jasmine
Why that agent is needed: Jasmine owns independent QA and verification.
Exact task: Create acceptance and regression test matrix for REST APIs, WebSocket events, lobby lifecycle, match lifecycle, reconnects, scoring, rating, moderation, and analytics consent.
Inputs/context they need: Full architecture/API contract.
Expected output back to Athena: QA matrix with test cases, expected results, edge cases, and release blockers. (27/27)