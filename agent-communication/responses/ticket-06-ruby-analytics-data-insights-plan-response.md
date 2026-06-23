# Ticket 6 — Analytics, Data Collection, and Insights Plan — Response

## Summary

I designed the analytics, data collection, consent, retention, and future insights plan for Wordle Royale. The recommended approach is privacy-first and internal-first: collect only the data needed for gameplay integrity, product improvement, and explicitly consented future insights/training use.

The core recommendation is to separate analytics into three consent/data classes from day one:

1. **Necessary gameplay data** — required for matches, scoring, ratings, leaderboards, abuse prevention, and operational integrity.
2. **Product analytics** — optional/consent-aware events for funnel, retention, UX, and product quality.
3. **Training/insights opt-in** — explicit opt-in data for future modeling, recommendation, balancing, or ML-style analysis beyond standard product analytics.

This plan avoids collecting raw sensitive/free-text data, uses pseudonymous identifiers, supports export/delete obligations, and preserves a future warehouse/ML path without forcing risky data practices early.

## Decisions / Recommendations

1. **Use internal-first analytics for V1.**
   - Store canonical gameplay and server events internally because they are tied to match integrity, ratings, word difficulty, and anti-cheat.
   - Defer external product analytics providers until the privacy policy, consent flow, and event contracts are stable.
   - If using an external provider later, prefer PostHog EU/US self-hosted or cloud with strict event allowlisting, not unrestricted client-side capture.

2. **Define consent scope on every analytics event.**
   - Every event should carry `consent_scope`: `necessary`, `product_analytics`, or `training_insights_opt_in`.
   - Server should reject, drop, or downgrade events that are not allowed by the user's current consent settings.

3. **Separate game records from analytics events.**
   - Durable gameplay tables remain the source of truth for matches, rounds, scores, ratings, and leaderboards.
   - Analytics events should be append-only records optimized for analysis, not the authoritative game state.

4. **Pseudonymize analytics identifiers.**
   - Use internal `user_id` only where necessary.
   - Use `analytics_user_key` or salted hash for product analytics and warehouse exports.
   - Rotate or partition salts if legal/privacy requirements demand stronger unlinkability.

5. **Do not collect raw guess text into broad analytics by default.**
   - Guess text is gameplay data while a match is active and may be needed in `guesses` for validation/history.
   - For analytics/warehouse use, prefer derived features: validity, guess number, feedback pattern, solve state, timing buckets, and word IDs after round completion.

6. **Make future training/insight datasets opt-in and derived.**
   - Training/insight tables should contain minimized, transformed records rather than raw behavioral exhaust.
   - They should support consent revocation and deletion workflows.

## Detailed Output

### 1. Event taxonomy

#### A. Auth/account events

Purpose: account funnel, security, onboarding completion.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `auth.register_started` | product_analytics | client/server | Optional product funnel event. |
| `auth.register_completed` | necessary/product_analytics | server | Necessary as account audit; analytics copy requires consent. |
| `auth.login_succeeded` | necessary | server | Security/session audit. |
| `auth.login_failed` | necessary | server | Security/rate-limit audit; avoid raw password or secret data. |
| `auth.session_refreshed` | necessary | server | Security/session integrity. |
| `account.deleted_requested` | necessary | server | Compliance/audit. |
| `account.deleted_completed` | necessary | server | Compliance/audit. |

#### B. Onboarding/funnel events

Purpose: understand activation friction.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `onboarding.started` | product_analytics | client | Optional. |
| `onboarding.step_viewed` | product_analytics | client | Include step key, not full UI text. |
| `onboarding.step_completed` | product_analytics | client/server | Useful for funnel. |
| `onboarding.completed` | product_analytics | client/server | Activation metric. |
| `privacy.consent_updated` | necessary | server | Store consent choices as compliance record. |

#### C. Lobby events

Purpose: lobby lifecycle, join failures, public/private behavior.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `lobby.created` | necessary | server | Required for gameplay/lobby history. |
| `lobby.settings_updated` | necessary | server | Required for authoritative lobby state. |
| `lobby.join_attempted` | product_analytics | client/server | Optional funnel event; server state still records actual join. |
| `lobby.joined` | necessary | server | Required for lobby membership. |
| `lobby.join_failed` | product_analytics | server | Include reason code. |
| `lobby.left` | necessary | server | Required for lifecycle. |
| `lobby.ready_changed` | necessary | server | Required for game start logic. |
| `lobby.expired` | necessary | server/job | Operational cleanup. |
| `lobby.abandoned` | necessary | server/job | Lifecycle/quality metric. |
| `lobby.match_start_requested` | necessary | server | Audit host action. |

#### D. Matchmaking events

Purpose: queue quality, wait times, rated matchmaking health.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `matchmaking.queue_entered` | necessary | server | Required for matchmaking. |
| `matchmaking.queue_cancelled` | necessary | server | Required cleanup. |
| `matchmaking.queue_timed_out` | necessary | server/job | Required cleanup and UX metric. |
| `matchmaking.match_found` | necessary | server | Required lifecycle. |
| `matchmaking.match_accept_failed` | necessary | server | Race/quality issue. |
| `matchmaking.rating_window_expanded` | necessary | server/job | Matchmaking tuning. |

#### E. Match/round gameplay events

Purpose: authoritative gameplay, reports, scoring, word difficulty, anti-cheat.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `match.created` | necessary | server | Required. |
| `match.started` | necessary | server | Required. |
| `round.started` | necessary | server | Required. |
| `guess.submitted` | necessary | server | Required for gameplay; avoid broad analytics copy of raw guess text. |
| `guess.accepted` | necessary | server | Required for board/history. |
| `guess.rejected` | necessary | server | Required for invalid guess behavior/rate limits. |
| `round.player_solved` | necessary | server | Required for scoring. |
| `round.player_failed` | necessary | server | Required for scoring. |
| `round.player_timed_out` | necessary | server/job | Required for scoring. |
| `round.ended` | necessary | server | Required. |
| `match.completed` | necessary | server | Required. |
| `match.abandoned` | necessary | server/job | Required. |
| `match.voided` | necessary | admin/server | Required for ranked integrity. |

#### F. Scoring/rating/leaderboard events

Purpose: auditable competitive outcomes.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `score.round_calculated` | necessary | server | Required and auditable. |
| `score.match_finalized` | necessary | server | Required. |
| `rating.calculation_started` | necessary | worker | Internal/job observability. |
| `rating.updated` | necessary | worker | Required for ranked. |
| `rating.update_failed` | necessary | worker | Operational integrity. |
| `leaderboard.updated` | necessary | worker | Required for ranked display. |

#### G. Word library/difficulty events

Purpose: content quality and balance.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `word.answer_selected` | necessary | server | Store word ID/list version, not leaked to client before round end. |
| `word.difficulty_observed` | necessary/product_analytics | worker | Aggregate from gameplay. |
| `word.flagged_for_review` | necessary | worker/admin | Content quality. |
| `word.deactivated` | necessary | admin | Audit/admin action. |
| `dictionary.version_activated` | necessary | admin | Audit/admin action. |

#### H. Anti-cheat/security telemetry events

Purpose: ranked integrity and abuse prevention.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `anticheat.signal_recorded` | necessary | server | Use minimized details. |
| `anticheat.match_flagged` | necessary | worker | Admin review. |
| `anticheat.user_flagged` | necessary | worker | Admin review, not auto-ban. |
| `rate_limit.triggered` | necessary | server | Abuse prevention. |
| `client.integrity_warning` | necessary | client/server | If implemented; do not overtrust client. |

#### I. Profile/leaderboard/product engagement events

Purpose: retention and UX improvement.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `home.viewed` | product_analytics | client | Optional. |
| `profile.viewed` | product_analytics | client/server | Respect profile privacy. |
| `leaderboard.viewed` | product_analytics | client/server | Optional. |
| `match_report.viewed` | product_analytics | client/server | Optional. |
| `settings.updated` | necessary/product_analytics | server | Actual setting update necessary; analytics copy optional. |

#### J. Operational/reliability events

Purpose: debugging and runtime health.

| Event | Consent scope | Producer | Notes |
|---|---|---|---|
| `websocket.connected` | necessary | server | Connection reliability. |
| `websocket.disconnected` | necessary | server | Reconnect/forfeit behavior. |
| `websocket.resync_requested` | necessary | server | Gameplay continuity. |
| `api.error` | necessary | server | Operational logs; avoid secrets/PII. |
| `job.failed` | necessary | worker | Rating/leaderboard/cleanup reliability. |

### 2. Event schema examples

#### Base event envelope

```json
{
  "event_id": "evt_01H...",
  "event_name": "lobby.join_failed",
  "schema_version": 1,
  "consent_scope": "product_analytics",
  "occurred_at": "2026-06-15T12:00:00.000Z",
  "ingested_at": "2026-06-15T12:00:01.000Z",
  "producer": "server",
  "environment": "production",
  "request_id": "req_123",
  "user_id": "uuid-or-null",
  "analytics_user_key": "pseudonymous-stable-key-or-null",
  "anonymous_id": "anon_123-or-null",
  "session_id": "uuid-or-null",
  "platform": "web",
  "app_version": "1.0.0",
  "properties": {}
}
```

#### Lobby join failure

```json
{
  "event_name": "lobby.join_failed",
  "schema_version": 1,
  "consent_scope": "product_analytics",
  "producer": "server",
  "user_id": "uuid",
  "analytics_user_key": "auk_abc123",
  "properties": {
    "lobby_id": "uuid",
    "visibility": "public",
    "rated": false,
    "difficulty": "medium",
    "reason_code": "LOBBY_FULL",
    "current_player_count": 4,
    "max_players": 4
  }
}
```

#### Guess accepted, minimized analytics form

```json
{
  "event_name": "guess.accepted",
  "schema_version": 1,
  "consent_scope": "necessary",
  "producer": "server",
  "user_id": "uuid",
  "properties": {
    "match_id": "uuid",
    "round_id": "uuid",
    "guess_number": 3,
    "valid": true,
    "feedback_pattern": "absent,present,correct,absent,present",
    "submitted_ms_after_round_start": 42150,
    "dictionary_version": "en-5-standard-guess-v2026.06.001"
  }
}
```

Note: authoritative gameplay tables may store `guess_text` for match history/gameplay. Broad analytics exports should use derived/minimized fields by default.

#### Match completed

```json
{
  "event_name": "match.completed",
  "schema_version": 1,
  "consent_scope": "necessary",
  "producer": "server",
  "properties": {
    "match_id": "uuid",
    "rated": true,
    "mode": "standard",
    "difficulty": "medium",
    "rounds_count": 3,
    "player_count": 4,
    "duration_ms": 355000,
    "dictionary_answer_version": "en-5-standard-answer-v2026.06.001",
    "dictionary_guess_version": "en-5-standard-guess-v2026.06.001"
  }
}
```

#### Consent updated

```json
{
  "event_name": "privacy.consent_updated",
  "schema_version": 1,
  "consent_scope": "necessary",
  "producer": "server",
  "user_id": "uuid",
  "properties": {
    "product_analytics": true,
    "training_insights_opt_in": false,
    "policy_version": "privacy-v1.0",
    "source": "settings_screen"
  }
}
```

### 3. Consent scope definitions

#### `necessary`

Data required to provide the service and protect game integrity.

Includes:

- Account/session/security audit events.
- Lobby membership and state transitions.
- Match/round/guess/scoring/rating records.
- Leaderboard updates.
- Server errors and reliability logs needed to operate the service.
- Anti-cheat and abuse-prevention telemetry required for ranked integrity.
- Consent change records.
- Admin/moderation audit logs.

Rules:

- Should be disclosed in privacy policy.
- Does not require product analytics opt-in when truly required to operate the game.
- Must still be minimized and retained only as long as justified.

#### `product_analytics`

Optional or consent-aware data used to improve product experience.

Includes:

- Funnel events.
- Screen views.
- Button/action events not needed for game operation.
- Onboarding step analytics.
- Aggregate retention metrics.
- Lobby browser usage.
- Non-essential UX diagnostics.

Rules:

- Respect regional consent requirements.
- Should be disabled or limited before consent where required.
- Should not include raw secrets, raw free text, sensitive profile details, or full guess histories.

#### `training_insights_opt_in`

Explicit opt-in data used for future modeling, personalized insights, difficulty models, recommendation systems, or ML-style analysis beyond standard operations/product analytics.

Includes:

- Derived gameplay feature sequences.
- Longitudinal player performance profiles for insights.
- Model training snapshots.
- Personalized recommendation datasets.
- Experimental analytics beyond normal product improvement.

Rules:

- Must be separately toggleable from product analytics.
- Should be off by default.
- Must support revocation, deletion/exclusion, and clear disclosure.
- Should use derived/minimized features, not raw gameplay exhaust when possible.

### 4. Recommended analytics provider or internal-first approach

Recommended V1:

1. **Internal event table for canonical events.**
   - Use PostgreSQL `analytics_events` or a dedicated append-only events table for V1.
   - Server-side emission for gameplay-critical events.
   - Client-side events only for optional product UX analytics.

2. **Materialized aggregate tables for dashboards.**
   - Word difficulty aggregates.
   - Funnel aggregates.
   - Matchmaking quality aggregates.
   - Retention cohorts.
   - Anti-cheat review queues.

3. **Later warehouse export.**
   - Export minimized event streams to BigQuery/Snowflake/ClickHouse/DuckDB/S3 parquet when volume justifies it.

4. **External provider option later.**
   - PostHog is a reasonable later option for product analytics if configured with allowlisted events and privacy settings.
   - Avoid unrestricted session replay or full autocapture by default.

Why internal-first:

- Gameplay events are already server-authoritative.
- Privacy and consent requirements are easier to enforce centrally.
- Word difficulty/rating/anti-cheat need internal data joins.
- Avoids leaking sensitive gameplay/integrity signals to third parties early.

### 5. Data retention recommendations

| Data category | Recommended retention | Notes |
|---|---:|---|
| Account profile data | While account active | Delete/anonymize per account deletion policy. |
| Auth/session security logs | 90–365 days | Longer if needed for abuse/security, but minimize IP/user-agent data. |
| Active match/lobby state | Until completed + short cleanup window | Durable summary persists separately. |
| Match history summaries | While account active or as product policy | Needed for profiles/rating history. |
| Rating events | Long-term/season lifetime | Required for competitive auditability. |
| Leaderboard snapshots | Season + audit period | Keep enough to audit ranks/rewards. |
| Raw gameplay guess records | 90 days to account lifetime depending on match-history policy | Prefer minimizing raw guess text in analytics exports. |
| Raw product analytics events | 90–180 days | Aggregate longer. |
| Aggregated product metrics | 1–3 years | No direct identifiers where possible. |
| Anti-cheat telemetry | 180–365 days | Longer for confirmed abuse/moderation cases. |
| Moderation/audit logs | 1–5 years depending on policy/legal | Access restricted. |
| Training/insight opt-in datasets | Until consent revoked or model dataset expires | Prefer versioned snapshots with deletion/exclusion tracking. |
| Deleted account tombstones | Minimal, policy-defined | Keep only what is required to prevent abuse/legal issues. |

### 6. Privacy-safe identifier strategy

Recommended identifiers:

- `user_id`: internal UUID, used for necessary gameplay records.
- `anonymous_id`: client-generated ID before login; rotate on logout/account deletion where appropriate.
- `session_id`: app/web session ID, not the auth refresh token.
- `analytics_user_key`: HMAC/salted pseudonymous key derived from `user_id` for analytics exports.
- `device_key`: optional, privacy-sensitive, hashed/rotating if used for anti-cheat; avoid persistent cross-context fingerprinting unless policy/legal approves.
- `ip_hash`: salted hash with rotation window; do not store raw IP in analytics tables unless required in restricted security logs.
- `user_agent_hash`: store hash/coarse client info, not full user-agent in broad analytics.

Recommended pseudonymous key pattern:

```text
analytics_user_key = HMAC_SHA256(analytics_salt_vN, user_id)
```

Rules:

- Keep salt secret and rotateable.
- Store salt version with exported datasets.
- Use separate salts for product analytics vs training datasets if unlinkability is desired.
- Do not expose internal `user_id` to third-party analytics tools unless necessary and approved.

### 7. Export/delete implications

#### Data export

Users may need export support for:

- Account/profile data.
- Settings and consent history.
- Match history summaries.
- Rating history.
- Leaderboard/rank history where tied to account.
- Moderation/report data subject to safety/legal limits.

Do not necessarily expose:

- Internal anti-cheat scoring logic.
- Other players' private data.
- Admin notes that would compromise safety investigations.
- Raw security logs beyond legally required access rights.

#### Account deletion

Deletion should:

- Deactivate/delete account identity.
- Remove or anonymize profile fields.
- Revoke sessions.
- Remove from public leaderboards if policy requires.
- Preserve match/rating integrity with anonymized participant references where needed.
- Delete or anonymize product analytics tied to the user.
- Remove user from future training/insight datasets where possible.
- Record a minimal deletion audit/tombstone if needed for abuse prevention/legal compliance.

#### Consent revocation

If user disables product analytics:

- Stop future `product_analytics` collection.
- Depending on policy/region, delete or anonymize existing optional analytics.

If user disables training/insights opt-in:

- Stop future training dataset inclusion.
- Remove or mark existing eligible rows as excluded.
- Maintain model/dataset lineage so future training snapshots can exclude revoked users.

### 8. Anti-cheat telemetry list

Collect only what is justified for ranked integrity and disclosed appropriately.

Recommended V1 anti-cheat signals:

- Solve time per round.
- Time between guesses.
- Time from round start to first guess.
- Guess count distribution.
- First-guess solve frequency.
- Hard-word solve rate.
- Invalid guess rate and repeated invalid attempts.
- Duplicate submission/client request ID anomalies.
- Disconnect/reconnect frequency during active rounds.
- App background/foreground timing if available and disclosed.
- WebSocket reconnect/resync frequency.
- Rate-limit triggers.
- Client/server clock drift estimates.
- Known leaked answer/version exposure indicators if applicable.
- Many accounts sharing hashed IP/device signals, if legally/policy approved.
- Impossible state transitions or tampered client payloads.
- Abnormally consistent solve timing across many matches.

Do **not** do in V1:

- Do not auto-ban solely from heuristic telemetry.
- Do not collect keystroke biometrics.
- Do not collect raw clipboard contents.
- Do not collect precise location.
- Do not collect unrelated browser/app activity.
- Do not use invasive device fingerprinting without explicit legal/product approval.

### 9. Word difficulty analytics loop

Purpose: improve dictionary quality and difficulty balance using real gameplay outcomes.

Per word/version aggregate metrics:

- `appearances`
- `unique_players_seen`
- `solve_rate`
- `average_guesses_when_solved`
- `average_solve_ms_when_solved`
- `timeout_rate`
- `failure_rate`
- `first_guess_solve_rate`
- `invalid_guess_rate_in_round`
- `abandon_rate_in_round`
- `rating_bucket_solve_rates`
- `platform_split_solve_rates`

Recommended loop:

1. Start with imported/editorial difficulty.
2. Collect server-side gameplay outcomes per answer word and dictionary version.
3. Wait for minimum sample size before drawing conclusions.
4. Compute observed difficulty, adjusted by rating bucket and mode.
5. Flag mismatches:
   - Easy word performing like hard.
   - Hard word performing like easy.
   - High abandon/timeout word.
   - Suspiciously high first-guess solve rate.
6. Send flagged words to admin/content review.
7. Propose difficulty tier changes in a draft dictionary version.
8. Activate changes only through dictionary versioning.

Recommended sample thresholds:

- Casual review signal: at least `100` appearances.
- Ranked difficulty adjustment: at least `500` appearances.
- Anti-cheat/leaked-answer concern: investigate if first-guess solve rate is anomalous even before full sample size.

### 10. Future ML/training data model suggestion

Do not use raw `analytics_events` directly as a training dataset. Create explicit derived tables/snapshots.

#### `insight_dataset_snapshots`

```sql
insight_dataset_snapshots (
  id uuid primary key,
  name text not null,
  purpose text not null,
  consent_scope text not null, -- training_insights_opt_in
  source_event_min_at timestamptz not null,
  source_event_max_at timestamptz not null,
  created_at timestamptz not null,
  created_by uuid null references users(id),
  schema_version int not null,
  notes text null
)
```

#### `player_insight_features`

```sql
player_insight_features (
  snapshot_id uuid not null references insight_dataset_snapshots(id),
  analytics_user_key text not null,
  mode text not null,
  rating_bucket text null,
  matches_played int not null,
  solve_rate numeric null,
  average_guesses numeric null,
  average_solve_ms numeric null,
  preferred_difficulty text null,
  churn_risk_features jsonb not null default '{}',
  word_skill_features jsonb not null default '{}',
  primary key(snapshot_id, analytics_user_key, mode)
)
```

#### `word_insight_features`

```sql
word_insight_features (
  snapshot_id uuid not null references insight_dataset_snapshots(id),
  word_id uuid not null references word_entries(id),
  dictionary_version text not null,
  observed_difficulty_score numeric null,
  solve_rate numeric null,
  average_guesses numeric null,
  average_solve_ms numeric null,
  rating_adjusted_metrics jsonb not null default '{}',
  primary key(snapshot_id, word_id, dictionary_version)
)
```

#### Consent/deletion support

Add exclusion tracking:

```sql
training_data_exclusions (
  user_id uuid not null references users(id),
  analytics_user_key text not null,
  reason text not null, -- consent_revoked, account_deleted, admin_removed
  effective_at timestamptz not null,
  primary key(user_id, reason)
)
```

Rules:

- Only include users with active `training_insights_opt_in` consent at snapshot creation time.
- Store dataset snapshot lineage.
- Make snapshots reproducible and deletable/excludable by user where required.
- Prefer aggregate/derived features over raw chronological event streams.

### 11. What data should not be collected

Avoid collecting:

- Passwords, auth tokens, refresh tokens, OAuth tokens, or secrets in analytics/logs.
- Raw payment data if monetization appears later.
- Raw precise location.
- Contacts/address book.
- Clipboard contents.
- Keystroke biometrics.
- Full device fingerprinting unless explicitly approved and legally reviewed.
- Raw chat/free text unless chat becomes a feature and moderation policy is implemented.
- Screenshots/session replay by default.
- Raw IP addresses in broad analytics tables.
- Full user-agent strings in broad analytics tables.
- Unbounded raw guess histories in third-party analytics.
- Admin private notes in user exports unless legally required and safety-reviewed.
- Any data unrelated to game operation, product improvement, or explicitly opted-in insights.

### 12. Recommended implementation model

#### Event ingestion controls

- Server owns authoritative emission for necessary gameplay/rating/security events.
- Client can submit product analytics events only through an allowlisted endpoint.
- Validate event names and schemas at ingestion.
- Reject events with unknown properties.
- Attach consent scope server-side where possible.
- Apply rate limits to analytics ingestion.
- Add `schema_version` to every event.
- Do not accept arbitrary JSON event blobs from clients without validation.

#### Suggested table refinements

Elisa's architecture includes:

```sql
analytics_events (
  id uuid primary key,
  user_id uuid null references users(id),
  anonymous_id text null,
  session_id uuid null,
  event_name text not null,
  platform text null,
  properties jsonb not null default '{}',
  consent_scope text not null,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null
)
```

Recommended additions:

```sql
analytics_events (
  id uuid primary key,
  event_name text not null,
  schema_version int not null default 1,
  consent_scope text not null,
  producer text not null, -- client, server, worker, admin
  environment text not null,
  request_id text null,
  user_id uuid null references users(id),
  analytics_user_key text null,
  anonymous_id text null,
  session_id uuid null,
  match_id uuid null references matches(id),
  round_id uuid null references match_rounds(id),
  platform text null,
  app_version text null,
  properties jsonb not null default '{}',
  occurred_at timestamptz not null,
  ingested_at timestamptz not null
)
```

Recommended indexes:

```sql
index analytics_events_name_time_idx on analytics_events(event_name, occurred_at);
index analytics_events_user_time_idx on analytics_events(user_id, occurred_at);
index analytics_events_match_idx on analytics_events(match_id);
index analytics_events_consent_time_idx on analytics_events(consent_scope, occurred_at);
```

#### Event schema registry

Create a versioned event schema registry in code:

```text
packages/analytics-events/
  src/
    events.ts
    schemas.ts
    consent.ts
    validators.ts
```

This package should define:

- Allowed event names.
- JSON schemas/Zod schemas for each event.
- Required consent scope.
- Producer restrictions.
- Property allowlists.
- Redaction rules.

## Open Questions

1. Which jurisdictions/geographies are expected at launch? This affects GDPR/UK GDPR/CCPA/COPPA-style requirements.
2. Will Wordle Royale allow users under 13/16/18? If yes, analytics and consent rules need stricter child/minor handling.
3. Does Ashar want external analytics at launch, or should V1 remain fully internal-first?
4. Should raw guess text be visible in match history long-term, or only derived board feedback/results?
5. How long should match history remain visible to users after account deletion/anonymization?
6. Should ranked anti-cheat use hashed IP/device signals at launch, or wait until legal/privacy policy is finalized?
7. Will there be in-game chat or user-generated content at launch? Current recommendation assumes no free-text chat in V1.

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Athena
- **Why that agent is needed:** Athena owns scope decisions and decision routing.
- **Exact task:** Ask Ashar to approve analytics scope decisions: internal-first vs external provider, launch geography/minor policy, raw guess retention, and anti-cheat device/IP signal policy.
- **Inputs/context they need:** This response, Elisa PRD analytics/privacy sections, Elisa architecture `analytics_events` section.
- **Expected output back to Athena:** Approved analytics/privacy decisions and implementation sequencing.

### Follow-up ticket 2

- **Target agent:** Elisa
- **Why that agent is needed:** Elisa owns architecture/API/data contracts.
- **Exact task:** Review and finalize analytics event schema, consent enforcement model, and database additions including `analytics_user_key`, producer, schema version, match/round foreign keys, and future insight tables.
- **Inputs/context they need:** Detailed Output sections 2, 3, 10, and 12 in this response.
- **Expected output back to Athena:** Final analytics data model/API contract.

### Follow-up ticket 3

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/core server-side implementation.
- **Exact task:** Implement server-side event emission for necessary gameplay, lobby, matchmaking, scoring, rating, and anti-cheat events using the finalized event schema registry.
- **Inputs/context they need:** Final analytics schema, Freya game-engine spec, Elisa API contract.
- **Expected output back to Athena:** Backend implementation summary, files changed, event emission tests, and sample emitted events.

### Follow-up ticket 4

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns tooling/data pipelines/integrations.
- **Exact task:** Implement `packages/analytics-events` schema registry and validation tooling, plus an aggregate job spec for word difficulty and matchmaking metrics.
- **Inputs/context they need:** This response and approved event taxonomy.
- **Expected output back to Athena:** Event schema package, validators, example event fixtures, aggregate job outline, and verification commands.

### Follow-up ticket 5

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns product-facing UI.
- **Exact task:** Design consent/preferences UI for product analytics and training/insights opt-in, including onboarding and settings screens.
- **Inputs/context they need:** Consent scope definitions and open questions in this response.
- **Expected output back to Athena:** Consent UX copy/flow, settings UI plan, and edge cases for changing/revoking consent.

### Follow-up ticket 6

- **Target agent:** Yuna
- **Why that agent is needed:** Yuna owns operations, environments, secrets, reliability, and deployment.
- **Exact task:** Define analytics storage/retention operations, log redaction, backup retention, warehouse/export path, and secrets for analytics salts.
- **Inputs/context they need:** Identifier strategy, retention recommendations, and future warehouse plan from this response.
- **Expected output back to Athena:** Ops plan for analytics data retention, salt/secret handling, backups, and monitoring.

### Follow-up ticket 7

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA/verification.
- **Exact task:** Create QA acceptance matrix for analytics consent enforcement, event validation, no-secret logging, account export/delete, opt-in revocation, and anti-cheat telemetry boundaries.
- **Inputs/context they need:** This response plus finalized analytics API/data contract.
- **Expected output back to Athena:** Test matrix and release-blocking privacy/analytics checks.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-06-ruby-analytics-data-insights-plan-response.md`

## Tests / Commands Run

None — planning/spec task only.

## Evidence / Result

Created this Markdown response file in the required responses folder with the required response structure and covered the ticket acceptance criteria:

1. Event taxonomy.
2. Event schema examples.
3. Consent scope definitions for necessary, product analytics, and training/insights opt-in.
4. Recommended internal-first analytics approach.
5. Data retention recommendations.
6. Privacy-safe identifier strategy.
7. Export/delete implications.
8. Anti-cheat telemetry list.
9. Word difficulty analytics loop.
10. Future ML/training data model suggestion.
11. Risks/compliance notes.
12. Follow-up implementation tickets.

## Risks / Blockers

- **Compliance risk:** Launch geography and minor/children policy are not yet defined; these can materially change consent and retention requirements.
- **Scope risk:** External analytics providers can create privacy and data-boundary risk if added before event allowlists and consent enforcement exist.
- **Anti-cheat privacy risk:** Device/IP signals may be useful but need policy/legal approval and clear disclosure.
- **Training/ML risk:** Future insights/training use must remain explicitly opt-in and deletion-aware; do not silently repurpose gameplay telemetry.
- **Data minimization blocker:** Product must decide how long raw guess text and detailed match history should be retained.
