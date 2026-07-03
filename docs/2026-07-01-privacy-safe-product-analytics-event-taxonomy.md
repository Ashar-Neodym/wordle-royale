# Privacy-safe product analytics and event taxonomy — Wave K

Date: 2026-07-01
Owner: Elisa
Input: Ticket 78, Wave J review, Ticket 73 route contracts, current Prisma analytics/audit schema

## Goal

Define the smallest MVP analytics/event taxonomy needed to understand reliability, navigation, lobby funnel, match health, rating movement, and API errors without over-collecting player data or weakening spoiler safety.

This is a planning/spec artifact only. It does not introduce analytics instrumentation, migrations, third-party SaaS, tracking scripts, cookies, pixels, or production exports.

## Principles

1. **Server-authoritative by default.** Gameplay, lobby, rating, and error events should be emitted by backend state transitions where possible. Client events are advisory only.
2. **Aggregate first, inspect later.** Prefer event counts, buckets, and derived fields over raw input.
3. **No active-match spoilers.** Never record answer words, answer hashes, answer salts, hidden opponent guesses, or dictionary internals in analytics payloads.
4. **Consent-gated product analytics.** Product analytics are optional and should respect the existing `product_analytics` consent concept. Necessary gameplay/audit records remain separate.
5. **Local/dev first.** MVP can log locally to stdout/dev database. Do not add external analytics providers until privacy policy, consent UI, retention, and export/delete behavior are explicitly designed.
6. **Stable names, small payloads.** Event names should be low-cardinality string literals; payload keys should be documented and bounded.

## Current schema mapping

Existing Prisma models already provide the right foundation:

- `AnalyticsEvent`
  - `userId?: string`
  - `matchId?: string`
  - `eventName: string`
  - `payload?: Json`
  - `consentScope?: ConsentScope`
  - `occurredAt`, `createdAt`
  - indexes on `(eventName, occurredAt)`, `(userId, occurredAt)`, `(matchId)`
- `AuditLog`
  - better for administrative/security/state-change evidence, not product analytics.
- Domain tables already contain canonical truth:
  - `Lobby`, `Match`, `MatchParticipant`, `GuessAttempt`, `RatingEvent`, `MatchReport`.

### Schema recommendation

Do **not** add a new analytics table for Wave K. `AnalyticsEvent` is sufficient for MVP.

Before implementation, reconcile the consent enum naming mismatch:

- Shared contracts use `product_analytics` via `packages/contracts/src/auth/constants.ts`.
- Prisma currently has `ConsentScope.analytics_events`.

Recommended fix for the implementation ticket: align Prisma to `product_analytics` in a migration, or add an explicit adapter layer if migration churn is not wanted yet. Do not silently map this in multiple call sites.

Optional future fields, not required for Wave K:

- `sessionId` or anonymous `installId` if guest funnels matter.
- `route` index if page analytics become high-volume.
- retention/deletion job metadata.

## Event taxonomy v1

All event names use dotted lower-case strings. Payloads must stay JSON-serializable, small, and schema-reviewed.

### 1. Page viewed

Event name:

```text
page.viewed
```

Emitter:

- Web/mobile client in local/dev only, or server route handler if server-rendered route visibility is enough.

Consent:

- `product_analytics` required outside local/dev.

Allowed payload:

```ts
type PageViewedPayload = {
  route: '/' | '/play' | '/lobbies' | '/leaderboard' | '/learn/rules' | '/profile' | '/profile/:handle' | '/history' | '/matches/:matchId' | '/server' | '/settings';
  surface: 'web' | 'mobile';
  authState: 'anonymous' | 'authenticated' | 'dev_stub';
  referrerRoute?: string | null;
};
```

Notes:

- Store route pattern, not raw URL, query string, invite code, lobby code, match UUID, or handle.
- If route pattern extraction fails, drop the event rather than storing a raw path.

### 2. Lobby created

Event name:

```text
lobby.created
```

Emitter:

- API after `Lobby` row creation succeeds.

Consent:

- `product_analytics` for product funnel copy; creation itself remains gameplay state.

Allowed payload:

```ts
type LobbyCreatedPayload = {
  lobbyId: string;
  mode: 'ranked' | 'casual';
  visibility: 'public' | 'private';
  maxPlayers: number;
  source: 'play' | 'lobbies' | 'quick_start' | 'dev_seed';
};
```

Do not collect:

- lobby join code in payload;
- user email;
- full settings JSON if it can grow unbounded.

### 3. Lobby joined

Event name:

```text
lobby.joined
```

Emitter:

- API after membership/join succeeds.

Consent:

- `product_analytics` for analytics copy.

Allowed payload:

```ts
type LobbyJoinedPayload = {
  lobbyId: string;
  mode: 'ranked' | 'casual';
  visibility: 'public' | 'private';
  joinMethod: 'public_list' | 'join_code' | 'direct_link' | 'host_auto' | 'dev_seed';
  playerCountAfter: number;
  maxPlayers: number;
};
```

Do not collect:

- join code;
- raw URL/direct-link token;
- invite referrer identities.

### 4. Match started

Event name:

```text
match.started
```

Emitter:

- API after `Match` transitions to active and initial round exists.

Consent:

- Product analytics copy requires `product_analytics`. The match row itself is necessary gameplay.

Allowed payload:

```ts
type MatchStartedPayload = {
  matchId: string;
  lobbyId?: string | null;
  mode: 'ranked' | 'casual';
  source: 'lobby' | 'matchmaking' | 'dev_seed';
  playerCount: number;
  roundCount: number;
  wordLength: 5;
  dictionaryVersion?: string;
  algorithmConfigVersion?: string | null;
};
```

Do not collect:

- answer word;
- answer hash;
- answer salt ref;
- complete dictionary metadata.

### 5. Guess submitted outcome bucket

Event name:

```text
guess.submitted
```

Emitter:

- API after a guess submission is accepted or rejected.

Consent:

- Product analytics copy requires `product_analytics`.

Allowed payload:

```ts
type GuessSubmittedPayload = {
  matchId: string;
  roundNumber: number;
  attemptNumber: number;
  accepted: boolean;
  outcomeBucket: 'accepted_solved' | 'accepted_progress' | 'rejected_not_in_dictionary' | 'rejected_duplicate' | 'rejected_invalid_shape' | 'rejected_round_closed' | 'rejected_rate_limited' | 'rejected_other';
  scoreDeltaBucket?: 'zero' | 'low' | 'medium' | 'high';
  latencyBucketMs?: 'lt_100' | '100_250' | '250_500' | '500_1000' | 'gte_1000';
};
```

Do not collect:

- raw guess text;
- feedback letters if they include the guessed letters;
- answer reveal state;
- full validation JSON.

This event is useful for game health and validation tuning without creating a guess corpus.

### 6. Match completed

Event name:

```text
match.completed
```

Emitter:

- API after match completion/report/rating finalization succeeds.

Consent:

- Product analytics copy requires `product_analytics`.

Allowed payload:

```ts
type MatchCompletedPayload = {
  matchId: string;
  mode: 'ranked' | 'casual';
  completionReason: 'all_players_final' | 'timeout' | 'admin_void' | 'dev_seed' | 'other';
  playerCount: number;
  durationBucketSec: 'lt_60' | '60_180' | '180_300' | '300_600' | 'gte_600';
  solvedCount: number;
  abandonedCount: number;
  ratingApplied: boolean;
};
```

Do not collect:

- answer word by default;
- per-player raw guess trails;
- private `MatchReport.participantData`.

If a future public share card reveals answers for completed matches, that remains a separate user-facing report/share feature, not generic analytics.

### 7. Rating changed

Event name:

```text
rating.changed
```

Emitter:

- API from the same transaction boundary that creates `RatingEvent`, or from a deterministic projection after `RatingEvent` creation.

Consent:

- Product analytics copy requires `product_analytics`.

Allowed payload:

```ts
type RatingChangedPayload = {
  matchId: string;
  algorithm: 'placement_mmr_v1';
  algorithmConfigVersion: string;
  playerCount: number;
  deltas: Array<{
    userId: string;
    deltaBucket: 'loss_large' | 'loss_small' | 'zero' | 'gain_small' | 'gain_large';
    provisional: boolean;
  }>;
};
```

Notes:

- `RatingEvent` remains the authoritative exact rating ledger.
- Analytics can use buckets to avoid duplicating exact before/after values unless needed for internal debugging.
- If exact deltas are needed for internal dashboards, prefer reading `RatingEvent` directly with admin access rather than duplicating exact values into analytics payloads.

### 8. Error envelope observed

Event name:

```text
api.error_observed
```

Emitter:

- API exception filter/server envelope layer.
- Optional client-side observation in local/dev only for route context.

Consent:

- Server reliability events may be treated as necessary operational telemetry if payload excludes personal data. Product analytics joins/route context require `product_analytics`.

Allowed payload:

```ts
type ApiErrorObservedPayload = {
  code: string;
  statusCode: number;
  endpointPattern: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  surface?: 'web' | 'mobile' | 'api' | 'realtime';
  routePattern?: string;
  matchState?: 'none' | 'lobby' | 'active_match' | 'completed_match';
};
```

Do not collect:

- request body;
- authorization headers;
- cookies;
- tokens;
- raw stack trace in analytics payload;
- full raw URL with query string.

Operational logs may include stack traces locally, but those are separate from product analytics and must not be exported as user analytics.

## What must never be collected

Never store these in `AnalyticsEvent.payload` or client analytics calls:

- access tokens, refresh tokens, cookies, authorization headers, session secrets;
- passwords or password reset tokens;
- email addresses unless a separately approved operational/audit workflow requires them;
- hidden answer words for active or unfinished matches;
- answer hashes, answer salts, salt references, dictionary artifact internals;
- raw guess text or raw opponent guess trails;
- full request/response bodies;
- full raw URLs containing lobby codes, invite tokens, or query parameters;
- private profile fields, consent records, account role/status, admin notes;
- IP addresses, user agent strings, or device fingerprints as product analytics without explicit privacy review;
- free-text content if chat/bios/reports are added later.

## Local/dev logging boundary

### Local/dev allowed

- Console logging with the same event names and redacted payloads.
- Writing `AnalyticsEvent` rows to the local dev database for smoke tests.
- Test fixtures that assert event shape and redaction behavior.
- Debug-only correlation IDs if they are generated and non-secret.

### Local/dev still prohibited

- Raw guesses or answers in analytics payloads.
- Secrets/tokens/headers.
- Uploading local analytics to a third-party provider.
- Enabling broad client-side autocapture.

## Future production boundary

Before production analytics is enabled, require:

1. Explicit consent behavior for `product_analytics` in UI/API.
2. Server-side consent enforcement for analytics writes.
3. A privacy/retention decision: retention period, deletion behavior, export behavior.
4. A provider decision if not using the application database; free/open-source/local-first preferred.
5. Automated payload redaction tests.
6. Volume controls and sampling if `guess.submitted` becomes high-volume.
7. Admin-only access policy for analytics reads.

No paid SaaS or external analytics dependency should be introduced without Ashar approval.

## Implementation handoff guidance

### Freya / backend contracts

- Add an analytics emitter abstraction only when instrumentation is explicitly ticketed.
- Emit from domain services after successful state changes, not from controller intent receipt.
- Gate product analytics by server-side consent.
- Keep `AuditLog` for admin/security actions and `AnalyticsEvent` for product/reliability events.
- Reconcile `ConsentScope.analytics_events` vs `product_analytics` before writing consent-scoped rows.

### Luna / web and mobile

- If adding `page.viewed`, emit route patterns only, not raw URLs.
- Do not add third-party analytics snippets or autocapture.
- Keep client analytics disabled by default outside local/dev until consent enforcement exists.

### Ruby / lobby UX

- Use `lobby.created` and `lobby.joined` to measure discovery/readiness funnel after backend instrumentation exists.
- Do not record join codes or invite tokens.

### Jasmine / QA

- Verify no analytics payload contains raw guesses, answers, answer hashes, answer salts, tokens, cookies, or raw URLs.
- Verify active-match spoiler safety for match/history pages remains intact.
- Verify consent-scoped events are not persisted when product analytics consent is false.

## Acceptance criteria for future instrumentation

- Events use documented names and bounded payload fields.
- Product analytics events are server-side consent-gated.
- Necessary operational error events are redacted and do not include request bodies/secrets.
- Guess analytics record only buckets/outcomes, never raw guess text.
- Match analytics never record active answers/hashes/salts.
- Secret scan and payload redaction tests pass.
- Any production export/provider is explicitly approved and documented.

## Non-goals

- Full analytics implementation in Wave K.
- Production analytics provider selection.
- User-facing privacy/settings UI changes.
- Warehouse/BI pipeline.
- Session replay, heatmaps, fingerprinting, ad tracking, or broad client autocapture.
- Training-data collection.
