# Ticket 11 — Backend Foundation Implementation Plan — Response

## Summary

This response provides a backend foundation implementation plan for Wordle Royale using the locked defaults from Athena and Elisa:

- TypeScript backend
- NestJS
- PostgreSQL + Prisma
- Redis + BullMQ
- Socket.IO
- Server-authoritative gameplay
- Email/password auth first
- Unique handle + non-unique display name
- Standard English 5-letter Wordle-style V1
- 6 guesses, 120-second ranked timer default
- Invalid guesses consume time but not attempts
- Custom placement-based MMR V1

This is a planning/specification task only. I did not scaffold or modify application code because Ticket 11 explicitly says not to start broad coding unless a repo scaffold already exists and Athena/Ashar explicitly asks for implementation.

## Decisions / Recommendations

1. **Treat this as a pre-implementation backend roadmap, not coding.** No `package.json` or backend scaffold was present in the project root when checked, so this plan assumes future scaffold creation.
2. **Build backend foundations in dependency order:** repo scaffold → shared contracts/enums → Prisma schema → idempotency → auth/profile/consent → word-library runtime lookup → lobbies → realtime → game/match flows → scoring/finalization → rating jobs → admin/analytics skeletons.
3. **Create `packages/game-engine` as a pure deterministic package before wiring gameplay APIs.** Duplicate-letter feedback, scoring, standings, and rating deltas should be tested independently from NestJS.
4. **Add an `IdempotencyModule` early.** It is required by lobby join/leave, match start, matchmaking, guess submit, rating apply, and void/reversal operations.
5. **Do not implement gameplay controllers before word-library runtime lookup exists.** Guess validation depends on active immutable dictionary/list versions.
6. **Do not implement rating finalization before match finalization is idempotent.** Rating events must be applied exactly once and reversed by event history, not silent mutation.
7. **Use Socket.IO gateways as transport adapters only.** Business logic belongs in services/modules; gateways should authenticate, validate payloads, call services, and emit typed events.
8. **Use generated/shared TypeScript contracts from the start.** Backend and frontend should share DTO/event types where possible to prevent API drift.

## Detailed Output

## 1. Proposed Backend Folder / Module Structure

Recommended monorepo structure:

```text
wordle-royale/
  apps/
    api/
      src/
        main.ts
        app.module.ts
        config/
          env.schema.ts
          app.config.ts
          database.config.ts
          redis.config.ts
          auth.config.ts
        common/
          decorators/
          filters/
          guards/
          interceptors/
          pipes/
          types/
          utils/
        prisma/
          prisma.module.ts
          prisma.service.ts
        redis/
          redis.module.ts
          redis.service.ts
        modules/
          auth/
            auth.module.ts
            auth.controller.ts
            auth.service.ts
            dto/
            strategies/
            guards/
            tests/
          users/
            users.module.ts
            users.service.ts
            users.controller.ts
            dto/
            tests/
          profiles/
            profiles.module.ts
            profiles.service.ts
            profiles.controller.ts
            dto/
            tests/
          consent/
            consent.module.ts
            consent.service.ts
            consent.controller.ts
            dto/
            tests/
          idempotency/
            idempotency.module.ts
            idempotency.service.ts
            idempotency.repository.ts
            tests/
          word-library/
            word-library.module.ts
            word-library.service.ts
            word-runtime.service.ts
            word-admin.controller.ts
            dto/
            tests/
          lobbies/
            lobbies.module.ts
            lobbies.controller.ts
            lobbies.service.ts
            lobby-state-machine.ts
            dto/
            tests/
          matchmaking/
            matchmaking.module.ts
            matchmaking.controller.ts
            matchmaking.service.ts
            tests/
          realtime/
            realtime.module.ts
            socket-auth.guard.ts
            socket-events.ts
            lobby.gateway.ts
            match.gateway.ts
            matchmaking.gateway.ts
            tests/
          matches/
            matches.module.ts
            matches.controller.ts
            matches.service.ts
            guess-submission.service.ts
            match-finalizer.service.ts
            match-report.service.ts
            tests/
          scoring/
            scoring.module.ts
            scoring.service.ts
            tests/
          ratings/
            ratings.module.ts
            ratings.service.ts
            rating-finalization.processor.ts
            rating-reversal.service.ts
            tests/
          leaderboards/
            leaderboards.module.ts
            leaderboards.controller.ts
            leaderboards.service.ts
            tests/
          analytics/
            analytics.module.ts
            analytics.controller.ts
            analytics.service.ts
            consent-enforcement.service.ts
            tests/
          admin/
            admin.module.ts
            admin-users.controller.ts
            admin-matches.controller.ts
            admin-audit.service.ts
            tests/
          moderation/
            moderation.module.ts
            reports.controller.ts
            moderation.service.ts
            suspicious-match.service.ts
            tests/
          jobs/
            jobs.module.ts
            bullmq.module.ts
            processors/
              match-expiry.processor.ts
              rating-finalization.processor.ts
              leaderboard-reconcile.processor.ts
              analytics-rollup.processor.ts
              idempotency-cleanup.processor.ts
        test/
          app.e2e-spec.ts
          helpers/
            test-app.ts
            prisma-test.ts
            redis-test.ts
            fixtures.ts
      prisma/
        schema.prisma
        migrations/
        seed.ts
      test/
        jest-e2e.json

  packages/
    contracts/
      src/
        rest/
        socket/
        enums.ts
        errors.ts
        index.ts
      tests/
    game-engine/
      src/
        constants.ts
        types.ts
        normalize.ts
        word-validator.ts
        feedback-engine.ts
        scoring-engine.ts
        standings.ts
        rating-engine.ts
        round-state-machine.ts
        match-state-machine.ts
        match-report.ts
        index.ts
      tests/
        feedback-engine.spec.ts
        scoring-engine.spec.ts
        standings.spec.ts
        rating-engine.spec.ts
        state-machines.spec.ts
    config/
      eslint-config/
      tsconfig/
```

### Module responsibility boundaries

| Module/package | Owns | Must not own |
|---|---|---|
| `packages/contracts` | Shared enums, DTO/event types, error codes | Business logic, DB access |
| `packages/game-engine` | Pure deterministic game rules, feedback, scoring, rating math, state reducers | DB, Redis, Socket.IO, wall-clock reads |
| `AuthModule` | Register/login/refresh/logout/session revocation | Profile rendering, gameplay permissions |
| `UsersModule` | User lookup/status/role basics | Auth token issuance |
| `ProfilesModule` | Handle/display name/profile privacy/onboarding profile completion | Consent enforcement |
| `ConsentModule` | Consent retrieval/update/timestamps | Analytics ingestion storage |
| `IdempotencyModule` | Request hash, replay, conflict, expiry | Domain-specific state transitions |
| `WordLibraryModule` | Active dictionary version lookup, runtime validation, admin word APIs | Import scripts owned by Ruby |
| `LobbiesModule` | Lobby CRUD, joins, ready state, host transfer, ranked compatibility | Socket transport implementation |
| `RealtimeModule` | Socket.IO auth, rooms, gateway adapters, event emission | Business rules |
| `MatchesModule` | Match lifecycle, guess submission orchestration, report generation | Pure feedback/scoring math |
| `ScoringModule` | Persist score events/breakdowns | Formula definitions outside game-engine |
| `RatingsModule` | Placement-MMR application/reversal jobs and events | Match standings calculation |
| `AnalyticsModule` | Event ingestion and server-side consent enforcement | Broad unrestricted client capture |
| `Admin/Moderation` | Admin actions, reports, audit logs, void actions | Silent rating mutation |

## 2. Ordered Implementation Phases

### Phase 0 — Scaffold and toolchain baseline

Goal: create the monorepo/backend foundation so every later backend ticket has a stable place to land.

Deliverables:

- Workspace/package manager selected and configured.
- NestJS API app created under `apps/api`.
- Shared packages created under `packages/contracts` and `packages/game-engine`.
- TypeScript, lint, format, and test config added.
- Environment validation added.
- Basic health endpoint added.

Expected verification commands:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter api test:e2e
```

If the project uses npm/yarn instead of pnpm, Athena should normalize these commands in the scaffold ticket.

### Phase 1 — Shared contracts, enums, and errors

Goal: lock shared state enums and DTO/event contracts before services depend on them.

Deliverables:

- Contract package exports:
  - match states,
  - round states,
  - player-round states,
  - lobby states,
  - consent scopes,
  - guess rejection reasons,
  - score event types,
  - rating event types,
  - API error codes,
  - Socket.IO event names and payload types.

Expected verification commands:

```bash
pnpm --filter @wordle-royale/contracts typecheck
pnpm --filter @wordle-royale/contracts test
pnpm typecheck
```

### Phase 2 — Prisma schema and database foundation

Goal: implement the amended schema from Tickets 02, 04, 05, and 10.

Deliverables:

- Prisma schema for:
  - users/auth/sessions,
  - profiles/settings/consent,
  - idempotency keys,
  - lobbies/lobby members,
  - matchmaking tickets,
  - matches/match participants/match rounds/round player states/guesses,
  - score events,
  - word entries/lists/sources/reviews/activation events/difficulty metrics,
  - ratings/rating events/rating jobs/leaderboard entries,
  - analytics events,
  - reports/moderation/admin audit logs/suspicious flags.
- Migration generated.
- Test seed or fixtures for local/dev.

Expected verification commands:

```bash
pnpm --filter api prisma validate
pnpm --filter api prisma migrate dev
pnpm --filter api prisma generate
pnpm --filter api test prisma-schema
```

### Phase 3 — Infrastructure adapters: Prisma, Redis, BullMQ, config

Goal: provide stable NestJS infrastructure modules.

Deliverables:

- `PrismaModule` and `PrismaService`.
- `RedisModule` and `RedisService`.
- BullMQ module setup.
- Health/readiness checks for API, DB, Redis.
- Structured request IDs.

Expected verification commands:

```bash
pnpm --filter api test config
pnpm --filter api test prisma
pnpm --filter api test redis
pnpm --filter api test jobs
pnpm --filter api test:e2e health
```

### Phase 4 — Idempotency foundation

Goal: implement reusable idempotency before any critical state-changing endpoints.

Deliverables:

- `IdempotencyModule`.
- Request hash generation.
- Replay behavior for same request hash.
- Conflict behavior for same key with different payload.
- Expiry cleanup job.
- Service wrapper/helper usable by lobbies, matchmaking, matches, ratings, and admin void actions.

Expected verification commands:

```bash
pnpm --filter api test idempotency
pnpm --filter api test:e2e idempotency
```

### Phase 5 — Auth, users, profiles, sessions, consent

Goal: implement account foundation required by lobbies/ranked play.

Deliverables:

- Email/password register/login.
- Password hashing.
- JWT access token.
- Opaque refresh token hashing/rotation.
- Logout/revoke session.
- Current user endpoint.
- Unique handle availability.
- Profile update.
- Consent get/update.
- Onboarding state/complete endpoint.

Expected verification commands:

```bash
pnpm --filter api test auth
pnpm --filter api test users
pnpm --filter api test profiles
pnpm --filter api test consent
pnpm --filter api test:e2e auth
pnpm --filter api test:e2e profiles
```

### Phase 6 — Word-library runtime foundation

Goal: provide active dictionary/version lookup and runtime validation hooks before gameplay.

Deliverables:

- Word/library Prisma models wired.
- Active answer/valid/banned list lookup.
- Ranked-eligible dictionary lookup.
- Runtime guess validation service.
- Basic admin skeleton for word list inspection/activation placeholders.
- Fixture dictionary for tests.

Expected verification commands:

```bash
pnpm --filter api test word-library
pnpm --filter api test:e2e word-library
pnpm --filter @wordle-royale/game-engine test word-validator
```

### Phase 7 — Pure game-engine package

Goal: implement deterministic pure functions before wiring gameplay APIs.

Deliverables:

- Word normalization.
- Guess validation result types.
- Duplicate-letter feedback algorithm.
- Scoring formula `standard_v1`.
- Standings/tie-breakers.
- Placement-MMR V1 calculation.
- Round/match state reducers.
- Match report builder helpers.

Expected verification commands:

```bash
pnpm --filter @wordle-royale/game-engine test
pnpm --filter @wordle-royale/game-engine typecheck
```

### Phase 8 — Lobby REST foundation and state machine

Goal: create/join/update/start lobbies with idempotency and ranked compatibility checks.

Deliverables:

- Create lobby.
- Join by ID.
- Join by code.
- Leave lobby.
- Ready state.
- Validate lobby settings endpoint.
- Host transfer policy.
- Start match preflight.
- Ranked-compatible settings lock.

Expected verification commands:

```bash
pnpm --filter api test lobbies
pnpm --filter api test:e2e lobbies
```

### Phase 9 — Socket.IO auth skeleton and lobby realtime

Goal: allow authenticated clients to receive lobby state and events.

Deliverables:

- Socket.IO gateway setup.
- Token auth guard for socket connections.
- User room and lobby room joins.
- Lobby snapshot event.
- Member joined/left/ready changed events.
- Ready reset event.
- Start failed/match starting events.
- Redis adapter integration hook.

Expected verification commands:

```bash
pnpm --filter api test realtime
pnpm --filter api test:e2e realtime-lobby
```

### Phase 10 — Match initialization and gameplay skeleton

Goal: generate matches/rounds and support server-authoritative snapshots without full finalization complexity.

Deliverables:

- Match creation from lobby start.
- Participant lock.
- Round generation with dictionary versions.
- Match snapshot endpoint.
- Match subscribe Socket.IO event.
- Round countdown/started events.
- Reconnect snapshot shape.

Expected verification commands:

```bash
pnpm --filter api test matches
pnpm --filter api test:e2e match-start
pnpm --filter api test:e2e reconnect
```

### Phase 11 — Guess submission via REST and Socket.IO

Goal: implement idempotent server-authoritative guess handling.

Deliverables:

- REST fallback guess submission.
- Socket.IO `guess.submit`.
- Idempotency by `clientRequestId`.
- Server-time deadline check.
- Word validation against active dictionary version.
- Duplicate-letter feedback.
- Invalid guesses rejected without consuming attempt.
- Valid guesses persisted with `guess_number`.
- Public progress events.

Expected verification commands:

```bash
pnpm --filter api test guess-submission
pnpm --filter api test:e2e guesses
pnpm --filter @wordle-royale/game-engine test feedback-engine
```

### Phase 12 — Scoring, round finalization, match finalization, reports

Goal: finalize rounds/matches exactly once and generate participant reports.

Deliverables:

- Score calculation wrapper.
- Score event persistence.
- Round finalization job/service.
- Match finalization service.
- Final standings/tie-breakers.
- Participant-only match report endpoint.
- Spoiler-safe share-card endpoint skeleton.
- Voided/abandoned report states.

Expected verification commands:

```bash
pnpm --filter api test scoring
pnpm --filter api test match-finalization
pnpm --filter api test match-report
pnpm --filter api test:e2e match-completion
```

### Phase 13 — Rating pipeline and leaderboard skeleton

Goal: apply placement-MMR changes exactly once after valid rated matches.

Deliverables:

- Rating state initialization.
- Rating finalization BullMQ job.
- Placement-MMR application.
- Rating event persistence.
- Rating reversal for voids.
- Leaderboard entry update/reconciliation skeleton.
- Rating history endpoint.

Expected verification commands:

```bash
pnpm --filter api test ratings
pnpm --filter api test leaderboards
pnpm --filter api test:e2e rated-match-finalization
pnpm --filter @wordle-royale/game-engine test rating-engine
```

### Phase 14 — Matchmaking skeleton

Goal: implement quick-join queue basics after lobby/match creation exists.

Deliverables:

- Queue endpoint.
- Cancel endpoint.
- Duplicate queue prevention.
- Timeout handling.
- Basic unranked availability match.
- Rated 1v1 beta-compatible queue path.
- Socket.IO status events.

Expected verification commands:

```bash
pnpm --filter api test matchmaking
pnpm --filter api test:e2e matchmaking
```

### Phase 15 — Admin/moderation and analytics skeletons

Goal: add minimum production-support hooks without overbuilding full admin UI.

Deliverables:

- Admin guards/roles.
- Admin user lookup skeleton.
- Reports skeleton.
- Match void endpoint with idempotency and rating reversal hook.
- Admin audit logs.
- Analytics event ingestion endpoint.
- Server-side consent enforcement.
- Necessary gameplay event capture skeleton.

Expected verification commands:

```bash
pnpm --filter api test admin
pnpm --filter api test moderation
pnpm --filter api test analytics
pnpm --filter api test:e2e admin-void-match
pnpm --filter api test:e2e analytics-consent
```

## 3. Bite-Sized Implementation Tickets

### Backend ticket B01 — Monorepo and API scaffold

- **Depends on:** none
- **Objective:** Create workspace, NestJS API app, shared packages, lint/typecheck/test tooling.
- **Acceptance criteria:** `apps/api`, `packages/contracts`, and `packages/game-engine` exist; health endpoint works; lint/typecheck/test scripts run.
- **Verification:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter api test:e2e`.

### Backend ticket B02 — Shared contracts and enums

- **Depends on:** B01
- **Objective:** Define shared backend/frontend enums and payload types from Ticket 10.
- **Acceptance criteria:** Contract package exports state enums, consent scopes, Socket.IO event names, error codes, and core DTO types.
- **Verification:** `pnpm --filter @wordle-royale/contracts typecheck`, `pnpm --filter @wordle-royale/contracts test`.

### Backend ticket B03 — Prisma schema foundation

- **Depends on:** B01, B02
- **Objective:** Add Prisma schema for auth, profiles, consent, idempotency, lobbies, matches, words, ratings, analytics, admin/moderation.
- **Acceptance criteria:** Schema validates, migration generated, Prisma client generated.
- **Verification:** `pnpm --filter api prisma validate`, `pnpm --filter api prisma migrate dev`, `pnpm --filter api prisma generate`.

### Backend ticket B04 — Config, Prisma, Redis, BullMQ infrastructure modules

- **Depends on:** B01, B03
- **Objective:** Add env validation, DB service, Redis service, BullMQ setup, and health checks.
- **Acceptance criteria:** API can connect to configured DB/Redis in local/test; health endpoint reports readiness.
- **Verification:** `pnpm --filter api test config`, `pnpm --filter api test:e2e health`.

### Backend ticket B05 — Idempotency module

- **Depends on:** B03, B04
- **Objective:** Implement reusable idempotency records/replay/conflict detection.
- **Acceptance criteria:** Same key+hash replays response; same key+different hash returns conflict; expiry cleanup exists.
- **Verification:** `pnpm --filter api test idempotency`, `pnpm --filter api test:e2e idempotency`.

### Backend ticket B06 — Auth, sessions, users, profiles, consent

- **Depends on:** B03, B04, B05
- **Objective:** Implement email/password auth, refresh sessions, current user, handle availability, profile update, onboarding, consent endpoints.
- **Acceptance criteria:** Register/login/refresh/logout work; unique handle enforced; consent states persisted.
- **Verification:** `pnpm --filter api test auth users profiles consent`, `pnpm --filter api test:e2e auth profiles`.

### Backend ticket B07 — Word-library runtime service

- **Depends on:** B03, B04
- **Objective:** Implement active dictionary version lookup and runtime guess validation services.
- **Acceptance criteria:** Service can load ranked answer/valid/banned lists and validate normalized guesses against versioned lists.
- **Verification:** `pnpm --filter api test word-library`, `pnpm --filter api test:e2e word-library`.

### Backend ticket B08 — Pure game-engine package

- **Depends on:** B02
- **Objective:** Implement deterministic pure functions for feedback, scoring, standings, state reducers, and placement-MMR.
- **Acceptance criteria:** Duplicate-letter examples, scoring examples, tie-breakers, and rating examples pass tests.
- **Verification:** `pnpm --filter @wordle-royale/game-engine test`.

### Backend ticket B09 — Lobby REST and state machine

- **Depends on:** B05, B06
- **Objective:** Implement lobby create/join/leave/ready/update/start preflight with idempotency.
- **Acceptance criteria:** Lobbies enforce capacity, states, host permissions, ready resets, ranked setting validation, and atomic joins.
- **Verification:** `pnpm --filter api test lobbies`, `pnpm --filter api test:e2e lobbies`.

### Backend ticket B10 — Socket.IO auth and lobby realtime

- **Depends on:** B06, B09
- **Objective:** Add authenticated Socket.IO gateway and lobby realtime events.
- **Acceptance criteria:** Socket auth works; clients can subscribe to lobby room; lobby events emit correctly.
- **Verification:** `pnpm --filter api test realtime`, `pnpm --filter api test:e2e realtime-lobby`.

### Backend ticket B11 — Match initialization and snapshots

- **Depends on:** B07, B08, B09, B10
- **Objective:** Start matches from lobbies, generate rounds with dictionary versions, expose snapshots and round start events.
- **Acceptance criteria:** Start match is idempotent; participants/rounds persist; active snapshots hide answers.
- **Verification:** `pnpm --filter api test matches`, `pnpm --filter api test:e2e match-start reconnect`.

### Backend ticket B12 — Guess submission REST/Socket.IO

- **Depends on:** B05, B07, B08, B11
- **Objective:** Implement server-authoritative guess submission.
- **Acceptance criteria:** Valid guesses consume attempts; invalid guesses do not; duplicate submissions replay; late guesses rejected; feedback is correct.
- **Verification:** `pnpm --filter api test guess-submission`, `pnpm --filter api test:e2e guesses`.

### Backend ticket B13 — Scoring and round/match finalization

- **Depends on:** B08, B11, B12
- **Objective:** Finalize rounds/matches with score events and deterministic standings.
- **Acceptance criteria:** Rounds finalize once; match finalizes once; score breakdowns and final standings persist.
- **Verification:** `pnpm --filter api test scoring match-finalization`, `pnpm --filter api test:e2e match-completion`.

### Backend ticket B14 — Match report and share-card skeleton

- **Depends on:** B13
- **Objective:** Implement participant-only match report and spoiler-safe share-card response skeleton.
- **Acceptance criteria:** Reports include dictionary versions, score breakdowns, standings, rating fields when available; non-participants denied.
- **Verification:** `pnpm --filter api test match-report`, `pnpm --filter api test:e2e match-report-privacy`.

### Backend ticket B15 — Rating pipeline and leaderboards

- **Depends on:** B08, B13
- **Objective:** Implement placement-MMR finalization job, rating events, reversals, rating history, leaderboard update skeleton.
- **Acceptance criteria:** Rated matches apply rating once; voids create reversal events; leaderboards update or queue reconciliation.
- **Verification:** `pnpm --filter api test ratings leaderboards`, `pnpm --filter api test:e2e rated-match-finalization`.

### Backend ticket B16 — Matchmaking skeleton

- **Depends on:** B09, B11
- **Objective:** Implement quick-join queue/cancel/timeout and duplicate queue prevention.
- **Acceptance criteria:** Users cannot have duplicate active queue tickets; queue timeout works; basic match/lobby assignment works.
- **Verification:** `pnpm --filter api test matchmaking`, `pnpm --filter api test:e2e matchmaking`.

### Backend ticket B17 — Admin/moderation skeleton

- **Depends on:** B06, B13, B15
- **Objective:** Add admin roles, reports skeleton, audit logs, and match void endpoint.
- **Acceptance criteria:** Admin-only guards work; void endpoint is idempotent; rating reversal is triggered when requested.
- **Verification:** `pnpm --filter api test admin moderation`, `pnpm --filter api test:e2e admin-void-match`.

### Backend ticket B18 — Analytics ingestion skeleton

- **Depends on:** B06
- **Objective:** Add analytics event ingestion with server-side consent enforcement.
- **Acceptance criteria:** Necessary gameplay events allowed; product/training analytics obey consent; rejected/downgraded events are test-covered.
- **Verification:** `pnpm --filter api test analytics`, `pnpm --filter api test:e2e analytics-consent`.

## 4. Exact Dependencies Between Backend Tasks

```text
B01 Monorepo scaffold
  ├─> B02 Shared contracts/enums
  │     └─> B08 Pure game-engine package
  │           ├─> B11 Match initialization
  │           ├─> B12 Guess submission
  │           ├─> B13 Scoring/finalization
  │           └─> B15 Rating pipeline
  │
  └─> B03 Prisma schema
        └─> B04 Config/Prisma/Redis/BullMQ
              ├─> B05 Idempotency
              │     ├─> B06 Auth/users/profiles/consent
              │     │     ├─> B09 Lobby REST/state machine
              │     │     │     ├─> B10 Socket.IO lobby realtime
              │     │     │     ├─> B11 Match initialization
              │     │     │     └─> B16 Matchmaking skeleton
              │     │     ├─> B17 Admin/moderation skeleton
              │     │     └─> B18 Analytics ingestion skeleton
              │     ├─> B12 Guess submission
              │     └─> B15 Rating pipeline
              │
              └─> B07 Word-library runtime
                    ├─> B11 Match initialization
                    └─> B12 Guess submission

B13 Scoring/finalization
  ├─> B14 Match report/share-card skeleton
  ├─> B15 Rating pipeline
  └─> B17 Admin void flow
```

Critical non-parallel dependencies:

- B03 must precede DB-dependent modules.
- B05 must precede critical state-changing endpoints.
- B07 must precede authoritative gameplay guess validation.
- B08 must precede B12/B13/B15 for deterministic gameplay/rating logic.
- B13 must precede B15 because ratings depend on final standings.
- B15 must precede full admin void/reversal verification.

## 5. Proposed Test Files and Test Types

### Unit tests

```text
packages/game-engine/tests/
  feedback-engine.spec.ts
  scoring-engine.spec.ts
  standings.spec.ts
  rating-engine.spec.ts
  state-machines.spec.ts
  word-validator.spec.ts

apps/api/src/modules/idempotency/tests/
  idempotency.service.spec.ts

apps/api/src/modules/lobbies/tests/
  lobby-state-machine.spec.ts
  lobbies.service.spec.ts

apps/api/src/modules/matches/tests/
  guess-submission.service.spec.ts
  match-finalizer.service.spec.ts
  match-report.service.spec.ts

apps/api/src/modules/ratings/tests/
  ratings.service.spec.ts
  rating-reversal.service.spec.ts

apps/api/src/modules/analytics/tests/
  consent-enforcement.service.spec.ts
```

### Integration tests

```text
apps/api/src/modules/auth/tests/
  auth.integration.spec.ts
  refresh-token.integration.spec.ts

apps/api/src/modules/word-library/tests/
  word-runtime.integration.spec.ts

apps/api/src/modules/lobbies/tests/
  lobbies.integration.spec.ts

apps/api/src/modules/matches/tests/
  guesses.integration.spec.ts
  match-finalization.integration.spec.ts

apps/api/src/modules/ratings/tests/
  rating-finalization.integration.spec.ts
```

### E2E tests

```text
apps/api/test/
  health.e2e-spec.ts
  auth.e2e-spec.ts
  profiles.e2e-spec.ts
  lobbies.e2e-spec.ts
  realtime-lobby.e2e-spec.ts
  match-start.e2e-spec.ts
  guesses.e2e-spec.ts
  reconnect.e2e-spec.ts
  match-completion.e2e-spec.ts
  match-report-privacy.e2e-spec.ts
  rated-match-finalization.e2e-spec.ts
  matchmaking.e2e-spec.ts
  admin-void-match.e2e-spec.ts
  analytics-consent.e2e-spec.ts
```

### Release-blocking test categories

- Duplicate-letter feedback correctness.
- Invalid guess does not consume attempt.
- Server deadline rejects late guesses.
- Idempotent guess replay does not double-count.
- Round finalization exactly once.
- Match finalization exactly once.
- Rating apply exactly once.
- Rating reversal uses reversal event, not silent mutation.
- Active snapshots do not leak answer.
- Participant-only match reports reject non-participants.
- Consent enforcement rejects/downgrades disallowed analytics.

## 6. Verification Commands Expected for Each Phase

Because no repo scaffold exists yet, these are expected commands for future implementation tickets, not commands executed in this planning task.

| Phase | Expected commands |
|---|---|
| Phase 0 scaffold | `pnpm install`; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm --filter api test:e2e` |
| Phase 1 contracts | `pnpm --filter @wordle-royale/contracts typecheck`; `pnpm --filter @wordle-royale/contracts test`; `pnpm typecheck` |
| Phase 2 Prisma | `pnpm --filter api prisma validate`; `pnpm --filter api prisma migrate dev`; `pnpm --filter api prisma generate` |
| Phase 3 infra adapters | `pnpm --filter api test config prisma redis jobs`; `pnpm --filter api test:e2e health` |
| Phase 4 idempotency | `pnpm --filter api test idempotency`; `pnpm --filter api test:e2e idempotency` |
| Phase 5 auth/profile/consent | `pnpm --filter api test auth users profiles consent`; `pnpm --filter api test:e2e auth profiles` |
| Phase 6 word runtime | `pnpm --filter api test word-library`; `pnpm --filter api test:e2e word-library` |
| Phase 7 game engine | `pnpm --filter @wordle-royale/game-engine test`; `pnpm --filter @wordle-royale/game-engine typecheck` |
| Phase 8 lobbies | `pnpm --filter api test lobbies`; `pnpm --filter api test:e2e lobbies` |
| Phase 9 realtime lobby | `pnpm --filter api test realtime`; `pnpm --filter api test:e2e realtime-lobby` |
| Phase 10 match start/snapshot | `pnpm --filter api test matches`; `pnpm --filter api test:e2e match-start reconnect` |
| Phase 11 guesses | `pnpm --filter api test guess-submission`; `pnpm --filter api test:e2e guesses` |
| Phase 12 finalization/reports | `pnpm --filter api test scoring match-finalization match-report`; `pnpm --filter api test:e2e match-completion match-report-privacy` |
| Phase 13 ratings | `pnpm --filter api test ratings leaderboards`; `pnpm --filter api test:e2e rated-match-finalization` |
| Phase 14 matchmaking | `pnpm --filter api test matchmaking`; `pnpm --filter api test:e2e matchmaking` |
| Phase 15 admin/analytics | `pnpm --filter api test admin moderation analytics`; `pnpm --filter api test:e2e admin-void-match analytics-consent` |

## 7. Risks / Blockers Before Coding

1. **No backend scaffold/package manifest exists yet.** A scaffold ticket must create the workspace and package scripts before implementation-specific verification commands are executable.
2. **Package manager is not explicitly locked.** This plan assumes `pnpm`; Athena/Ashar should confirm or allow implementation agents to choose.
3. **Dictionary fixture dependency.** Gameplay tests need a small approved fixture answer/valid/banned list from Ruby or a temporary test-only fixture.
4. **Auth security details need implementation choices.** Password hashing algorithm, JWT signing config, refresh token TTL, and cookie/mobile storage policy need to be specified in the auth ticket.
5. **Redis availability is required for realistic Socket.IO/BullMQ tests.** Yuna should define local Docker/Compose or managed dev setup.
6. **Rating algorithm requires simulation before ranked production.** Implementation can proceed with placement-MMR V1, but K values/provisional multipliers should be simulation-tested by Ruby before public ranked launch.
7. **Admin scope is intentionally skeletal.** Full admin UI is not part of this backend foundation plan unless Athena promotes it.
8. **Trademark/legal risk remains outside backend scope.** `Wordle Royale` naming should be reviewed before public launch.

## 8. Contract Questions for Elisa

1. **Idempotency response format:** Should idempotent replay return the original full response envelope byte-for-byte, or reconstruct the domain payload with a replay marker?
2. **Socket.IO envelope consistency:** Should emitted events use the full `{ type, requestId, sentAt, payload }` envelope as Ticket 10 recommends, or should the Socket.IO event name carry `type` and payload omit it?
3. **Prisma enum vs text fields:** Should state/status fields be Prisma enums for stronger type safety or text columns for migration flexibility?
4. **Invalid guess persistence:** Ticket 10 suggests persisting invalid guesses with `guess_number = null`; confirm this is approved for privacy/analytics defaults.
5. **Share-card payload:** Should backend V1 return only `shareText` JSON, or should it reserve an image URL field even before image rendering exists?
6. **Consent scope exact spelling:** Athena’s decision file says `training_insights_opt_in`, while Ticket 10 says `training_insight_opt_in`. Elisa should normalize the exact enum before implementation.
7. **Rated private lobby policy:** Decision locks say disabled by default unless protections are enforced. Should the create-lobby endpoint reject rated private lobbies completely in V1 or allow them behind a feature flag?

## 9. Parallelization Notes

### Safe to run concurrently after B01/B02/B03

- B06 Auth/profile/consent and B07 Word-library runtime can proceed in parallel after Prisma/schema foundation exists.
- B08 Pure game-engine package can proceed in parallel with most NestJS modules after shared contracts exist.
- B18 Analytics ingestion skeleton can proceed after auth/consent foundation, independent of gameplay finalization.
- B17 Admin/moderation skeleton can start basic role/audit/report work after auth, but match void/reversal depends on B13/B15.

### Must be sequential or tightly coordinated

- B03 Prisma schema before all DB-backed modules.
- B05 Idempotency before lobbies, guess submission, rating apply, and void operations.
- B07 Word-library runtime before authoritative guess submission.
- B09 Lobby REST before B10 lobby realtime and B11 match initialization.
- B11 Match initialization before B12 guess submission.
- B12 Guess submission before B13 finalization.
- B13 Match finalization before B15 rating pipeline.
- B15 Rating pipeline before full B17 admin void/reversal behavior.

### Recommended parallel workstreams

```text
Workstream A — Foundation
B01 -> B02 -> B03 -> B04 -> B05

Workstream B — Account/access
B06 -> B18

Workstream C — Game rules/data
B07 + B08 -> B11 -> B12 -> B13 -> B14 -> B15

Workstream D — Lobby/realtime
B09 -> B10 -> B16

Workstream E — Admin/safety
B17 basic after B06; full void/reversal after B15
```

## Open Questions

1. Should the implementation scaffold use `pnpm`, `npm`, or another package manager?
2. Should local development use Docker Compose for PostgreSQL/Redis, or rely on separately installed services?
3. Should Prisma state fields be enums or text columns for V1?
4. What exact enum spelling should be used for training consent: `training_insights_opt_in` or `training_insight_opt_in`?
5. Should rated private lobbies be rejected in V1 or feature-flagged?
6. Should share-card backend V1 generate only text or also reserve/generated image URLs?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Athena
- **Why that agent is needed:** Athena owns sequencing and decision routing.
- **Exact task:** Convert the backend implementation plan into approved coding tickets B01–B18, decide package manager, and sequence parallel workstreams.
- **Inputs/context they need:** This response, Ticket 10, Athena decision locks, Tickets 01/02/04.
- **Expected output back to Athena:** Approved backend ticket list with dependencies and assigned agents.

### Follow-up ticket 2

- **Target agent:** Elisa
- **Why that agent is needed:** Elisa owns architecture/API contract correctness.
- **Exact task:** Resolve contract questions on idempotency replay format, Socket.IO envelope shape, Prisma enum/text fields, invalid guess persistence, share-card payload, consent enum spelling, and rated private lobby behavior.
- **Inputs/context they need:** Section 8 of this response and Ticket 10.
- **Expected output back to Athena:** Contract amendment or confirmation for implementation agents.

### Follow-up ticket 3

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns word-list tooling and rating simulation support.
- **Exact task:** Provide test fixture dictionaries for backend/game-engine tests and simulation outputs for placement-MMR K/provisional/cap tuning.
- **Inputs/context they need:** Ticket 04, Ticket 05, Ticket 11 plan phases B07/B08/B15.
- **Expected output back to Athena:** Fixture dictionary files/plan and rating simulation recommendations.

### Follow-up ticket 4

- **Target agent:** Yuna
- **Why that agent is needed:** Yuna owns local environment, CI, and infrastructure planning.
- **Exact task:** Define local dev setup for PostgreSQL, Redis, BullMQ workers, Socket.IO Redis adapter, environment variables, and CI verification commands matching this plan.
- **Inputs/context they need:** This response and Ticket 07 infrastructure plan.
- **Expected output back to Athena:** Local dev/CI ops plan with exact commands and environment matrix.

### Follow-up ticket 5

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA/release confidence.
- **Exact task:** Convert this backend implementation plan into a QA acceptance matrix mapped to tickets B01–B18, with release-blocking backend tests.
- **Inputs/context they need:** This response, Ticket 08 QA strategy, Ticket 10 contract amendments.
- **Expected output back to Athena:** Backend QA matrix and phase-by-phase acceptance checks.

### Follow-up ticket 6

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns frontend/product-facing implementation and must align with backend contract sequencing.
- **Exact task:** Review backend phases for frontend dependency timing, especially auth/profile/consent, lobby realtime, gameplay snapshots, match reports, and share-card skeleton.
- **Inputs/context they need:** This response and Ticket 12 frontend plan.
- **Expected output back to Athena:** Frontend dependency notes and any mock/API-client sequencing concerns.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-11-freya-backend-foundation-implementation-plan-response.md`

## Tests / Commands Run

None — planning/spec task only.

No shell commands or implementation test commands were run for this ticket. The verification commands listed above are proposed commands for future implementation phases, not executed results.

## Evidence / Result

- Read assigned ticket file:
  - `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/ticket-11-freya-backend-foundation-implementation-plan.md`
- Read decision-lock document:
  - `/home/ashar/Desktop/hermes-projects/wordle-royale/docs/2026-06-22-athena-decision-locks-after-tickets-01-10.md`
- Read contract reconciliation response:
  - `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-10-elisa-contract-reconciliation-amendments-response.md`
- Checked for existing Ticket 11 response file matching `ticket-11-*`; none was present before writing.
- Checked for existing `package.json` in the project tree; none was found before writing, so this remained a planning task.
- Created the requested response file:
  - `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-11-freya-backend-foundation-implementation-plan-response.md`

## Risks / Blockers

- Implementation cannot begin safely until a repo scaffold/package manager/local dev setup is approved.
- Several contract details should be resolved by Elisa before coding: consent enum spelling, Socket.IO envelope shape, idempotency replay format, and rated private lobby behavior.
- Gameplay implementation depends on Ruby-provided dictionary fixtures or a temporary test-only fixture.
- Rating production readiness depends on Ruby simulation and Jasmine QA, even if V1 implementation uses the placement-MMR formula from Ticket 04.
- Future agents must not treat the verification commands in this plan as already executed; they are expected commands for later implementation work.
