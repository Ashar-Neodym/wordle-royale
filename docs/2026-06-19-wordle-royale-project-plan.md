# Wordle Royale Full Project Plan

> **Mode:** Planning only. No implementation started.
> **Owner:** Athena (orchestrator)
> **Workflow:** Human-mediated multi-agent tickets. Athena creates/updates master plan; Ashar manually passes tickets to Elisa/Luna/Freya/Ruby/Yuna/Jasmine.

## 1. Project understanding

Build a production-grade multiplayer word-game platform for mobile app stores and web. The core game is Wordle-like, but competitive and social:

- Users register/login and have persistent profiles.
- Users can create private or public lobbies.
- Others join by lobby code, public lobby browser, or quick/random matchmaking.
- A lobby host configures game options: time limit, difficulty, rounds, scoring rules, game mode/variant, privacy, rated/unrated.
- Multiple players play simultaneous Wordle-style rounds.
- Scoring combines guess efficiency and speed.
- A match report summarizes final ranking, round-by-round performance, stats, and rating changes.
- Rated games affect leaderboard/rating/ELO/MMR.
- Profiles show match history, statistics, rating rise/fall, achievements, and settings.
- Future game variants should be supported without rewriting the core platform.

This should be treated as a real launchable product, not a throwaway MVP.

## 2. Name check and recommendation

Searched web/app-store availability for `Wordle Royale`.

Findings:

- Google Search was blocked by bot detection from this environment.
- Google Play search page exists for `Wordle Royale` and returned a title: `Wordle Royale - Android Apps on Google Play`.
- Play results included related apps such as:
  - `Word Royale` by Monster Brain Studios (`com.monsterbrainstudios.word_royale`)
  - `Wordle!` by Lion Studios Plus
  - `NYT Games: Wordle & Crossword` by The New York Times Company
  - other Wordle-like apps.

Practical recommendation:

- Avoid using `Wordle` in the public product name unless a trademark attorney clears it.
- `Wordle` is strongly associated with NYT Games, and app stores may reject confusingly similar names.
- `Wordle Royale` is likely risky because it directly combines `Wordle` with a game-mode term.
- Use a distinct brand that communicates competitive word battles without relying on `Wordle`.

Better name candidates:

1. **LexiRoyale** — short, brandable, battle-royale feel.
2. **WordRush Arena** — clear competitive/speed identity.
3. **LetterRoyale** — close to your idea but less directly tied to Wordle.
4. **Glyph Duel** — stylish, distinct, game-like.
5. **Lexicon Clash** — strategic word battle feeling.
6. **Word Duel Arena** — descriptive, SEO-friendly.
7. **Letter League** — good for ranked/leaderboard identity.
8. **Vocab Royale** — close to battle royale; still maybe generic but safer than Wordle.
9. **GuessGrid Arena** — references Wordle-like grid without saying Wordle.
10. **LexiClash** — compact brand name.

Temporary internal codename can remain **Wordle Royale**, but public launch name should probably change.

## 3. Product pillars

1. **Competitive multiplayer word rounds**
   - Real-time or synchronized asynchronous puzzle rounds.
   - Fast match flow.
   - Fair scoring and anti-cheat basics.

2. **Social lobby system**
   - Private invite code lobbies.
   - Public lobby browser.
   - Quick join/random matchmaking.
   - Host-configurable settings.

3. **Ranked progression**
   - Rated games.
   - ELO/MMR/rank tiers.
   - Global and friend leaderboards.
   - Seasonal resets later.

4. **Profiles and stats**
   - Lifetime stats.
   - Recent matches.
   - Rating graph.
   - Accuracy, average guesses, fastest solve, win rate.

5. **Extensible variants**
   - Standard Wordle-like mode first.
   - Architecture supports future variants: color mode, themed words, longer words, team mode, daily challenges, custom dictionaries.

6. **Production readiness**
   - Auth, security, privacy, observability, testing, CI/CD, deployment, app-store readiness.

## 4. Recommended platform architecture

### 4.1 Client apps

Recommended approach:

- **Mobile:** React Native with Expo or Flutter.
- **Web:** Next.js or React web app.

Best option for this project:

- **React Native + Expo for mobile**
- **Next.js for web**
- Shared TypeScript packages for validation, game rules, API types.

Why:

- Fast iteration.
- Strong ecosystem.
- Easy cross-platform deployment.
- Shared logic between app and web.
- Real-time game UIs are manageable.

Possible monorepo:

```text
apps/
  mobile/              Expo React Native app
  web/                 Next.js web app
  api/                 backend service
packages/
  shared/              shared types, validation, constants
  game-engine/         pure Wordle-like game rules/scoring
  ui/                  optional shared UI tokens/components
infra/
  docker/
  terraform-or-render-config/
docs/
  product/
  architecture/
  plans/
```

### 4.2 Backend

Recommended stack:

- **Node.js / TypeScript backend** with NestJS or Fastify.
- **PostgreSQL** as primary database.
- **Redis** for matchmaking, lobby presence, timers, and real-time ephemeral state.
- **WebSockets** for live lobby/game updates.
- **REST or GraphQL** for normal account/profile/leaderboard queries.

Suggested backend style:

- REST for simple app flows.
- WebSocket events for lobby/game state.
- Keep game engine deterministic and server-authoritative.

### 4.3 Hosting

Good production path:

- Web: Vercel or Cloudflare Pages.
- API/WebSocket service: Fly.io, Render, Railway, or AWS ECS.
- Postgres: Neon, Supabase, Railway, or managed Postgres.
- Redis: Upstash, Railway Redis, or managed Redis.
- Object storage: S3/R2 later if avatars/media are needed.

Important: WebSockets are not ideal on serverless-only platforms. Use a persistent backend host for real-time game services.

## 5. Core domain model

### User

Fields:

- id
- username
- display_name
- email
- password_hash or OAuth provider identity
- avatar_url
- country/region optional
- created_at
- last_seen_at
- settings
- moderation_status

### ProfileStats

- user_id
- games_played
- games_won
- win_rate
- average_rank
- average_guesses
- average_solve_time
- fastest_solve
- current_rating
- peak_rating
- current_rank_tier
- streaks

### Lobby

- id
- lobby_code
- host_user_id
- visibility: private/public
- status: waiting/in_progress/completed/cancelled
- max_players
- game_mode
- difficulty
- word_length
- rounds
- time_limit_seconds
- rated_enabled
- scoring_profile
- created_at

### LobbyParticipant

- lobby_id
- user_id
- display_name_snapshot
- joined_at
- ready_status
- connection_status
- final_rank
- total_score

### Match

- id
- lobby_id
- status
- started_at
- ended_at
- rated
- rules_snapshot JSON
- final_report JSON

### Round

- id
- match_id
- round_number
- answer_word encrypted or server-hidden
- difficulty
- started_at
- ended_at

### Guess

- id
- round_id
- user_id
- guess
- result_pattern
- guess_number
- submitted_at
- response_time_ms
- is_correct

### RatingEvent

- id
- user_id
- match_id
- rating_before
- rating_after
- delta
- reason
- created_at

### LeaderboardSnapshot

- season_id
- user_id
- rating
- wins
- games_played
- rank

## 6. Game rules: initial standard mode

Default standard mode:

- 5-letter word.
- 6 guesses.
- All players get the same answer in a round.
- Players submit guesses independently.
- Server validates word exists in accepted dictionary.
- Server returns per-letter feedback:
  - correct position
  - exists wrong position
  - not present
- Round ends for each player when solved, out of guesses, or timer expires.
- Match advances when all players finish or timer expires.

## 7. Scoring model

Use a transparent points formula.

Example per-round score:

```text
base_score = solved ? 1000 : 0
remaining_guess_bonus = solved ? (max_guesses - guesses_used) * 100 : 0
time_bonus = solved ? floor(500 * remaining_time_ratio) : 0
streak_bonus = optional
penalty = invalid_guess_penalty optional
round_score = base_score + remaining_guess_bonus + time_bonus + streak_bonus - penalty
```

Ranked match points:

- Casual score determines match winner.
- ELO/MMR delta should use final ranking, opponent ratings, player count, and rated flag.
- Do not use raw puzzle score directly as MMR delta; use it to determine placement.

Rating approach:

- Start with simple Elo/Glicko-like system.
- For multiplayer, calculate pairwise outcomes:
  - Player ranked above another counts as a win against that player.
  - Player ranked below counts as a loss.
  - Ties split.
- Add provisional rating handling for new users.

## 8. Lobby and matchmaking flows

### Private lobby

1. User creates lobby.
2. Server generates lobby code.
3. Host configures settings.
4. Players join with code.
5. Players mark ready.
6. Host starts match.

### Public lobby

1. Host creates lobby and marks public.
2. Lobby appears in public browser.
3. Other users join if slots available.
4. Host starts match or auto-starts when ready/full.

### Quick join

1. User taps Quick Join.
2. Backend puts user into matchmaking queue.
3. Queue groups users by:
   - region/ping if available
   - rating band
   - desired mode
   - language
4. Backend creates lobby automatically.
5. Players enter ready countdown.
6. Match starts.

## 9. Required app screens

### Public/unauthenticated

- Landing page
- Login
- Register
- Forgot password
- Terms/privacy pages

### Authenticated home

- Play buttons:
  - Quick Join
  - Create Lobby
  - Join by Code
  - Browse Public Lobbies
- Current rating/rank card
- Recent match summary
- Daily/seasonal prompt later

### Lobby

- Lobby code/share button
- Player list and ready states
- Chat or quick reactions later
- Host settings panel
- Start button/countdown
- Public/private toggle

### Game screen

- Word grid
- Keyboard
- Timer
- Round indicator
- Player progress panel
- Score updates
- Connection/reconnect state

### Match report

- Final ranking
- Score breakdown
- Per-round table
- Rating changes
- Share result
- Rematch button

### Leaderboard

- Global leaderboard
- Friends leaderboard later
- Season leaderboard
- Filters: standard/ranked/region/variant

### Profile

- User info
- Rating graph
- Match history
- Stats cards
- Achievements later
- Settings link

### Settings

- Account settings
- Display name/avatar
- Privacy controls
- Notifications
- Language/dictionary
- Theme/accessibility
- Delete account/export data

## 10. Admin/moderation needs

For a launchable product, include at least basic admin capabilities:

- View users.
- Ban/suspend users.
- Inspect reported usernames/profile content.
- Manage word dictionaries.
- Disable problematic words.
- View match records for abuse reports.
- Rate-limit suspicious accounts/IPs.

Admin can be a simple protected web route initially.

## 11. Security and fairness

Important risks:

- Users can inspect client bundles.
- Users can modify app traffic.
- Users can automate guesses.
- Users can collude in public/ranked games.
- Word lists and answers must not leak early.

Rules:

- Server is authoritative.
- Never send answer word to clients before round ends.
- Client sends guesses; server validates and returns pattern.
- Store answer encrypted or hidden in memory if possible.
- Rate-limit guess submissions.
- Enforce one active ranked match per user/device/session.
- Track suspicious solve times and impossible patterns.
- Add replay/match logs for moderation.

## 12. Monetization options later

Do not overbuild monetization early, but design so it can be added.

Options:

- Cosmetics: themes, keyboard skins, avatar frames.
- Battle pass/seasons.
- Private tournament hosting.
- Ads in casual mode only, not during active rounds.
- Premium profile customization.

Avoid pay-to-win mechanics.

## 13. Analytics and observability

Track:

- Registration conversion.
- Quick join queue time.
- Lobby creation and abandonment.
- Match completion rate.
- Reconnect rate.
- Average round time.
- Guess distribution.
- Retention.
- Crash/error rates.

Technical observability:

- API request logs.
- WebSocket connection metrics.
- Queue size.
- Redis health.
- DB slow queries.
- Error tracking with Sentry or equivalent.

## 14. Testing strategy

### Unit tests

- Game engine feedback logic.
- Duplicate-letter Wordle rules.
- Scoring formula.
- Rating calculation.
- Lobby settings validation.

### Integration tests

- Auth flows.
- Create/join lobby.
- Start match.
- Submit guesses.
- Complete rounds.
- Generate match report.
- Rating updates.

### WebSocket tests

- Connect/disconnect/reconnect.
- Multi-user lobby state sync.
- Timer events.
- Quick join matchmaking.

### E2E tests

- User registers.
- Creates private lobby.
- Second user joins by code.
- Match runs to completion.
- Report appears.
- Leaderboard/profile update.

### QA/manual test passes

- Mobile small screen.
- Tablet.
- Web desktop.
- Slow network.
- App background/resume.
- Reconnect mid-round.

## 15. Milestones

### Milestone 0 — Product and architecture specification

Deliverables:

- Finalized product requirements.
- Public name decision.
- Architecture decision record.
- Data model and API contract.
- UI wireframes.
- Technical risk register.

### Milestone 1 — Foundation

Deliverables:

- Monorepo setup.
- Auth system.
- Shared game engine package.
- Basic web/mobile shell.
- Database schema.
- CI pipeline.
- Local dev environment.

### Milestone 2 — Private lobbies and standard game

Deliverables:

- Create/join private lobby by code.
- Host settings.
- Real-time player presence.
- Standard Wordle-like game loop.
- Round scoring.
- Match report.

### Milestone 3 — Public lobbies and quick join

Deliverables:

- Public lobby browser.
- Matchmaking queue.
- Auto-created lobbies.
- Reconnect handling.
- Better lobby UX.

### Milestone 4 — Rated mode and leaderboards

Deliverables:

- Rating system.
- Ranked quick join.
- Leaderboards.
- Profile stats and rating history.
- Anti-abuse basics.

### Milestone 5 — Production readiness

Deliverables:

- Admin/moderation panel.
- Privacy/terms flows.
- Analytics/observability.
- Load testing.
- Security review.
- App-store preparation.

### Milestone 6 — Launch polish

Deliverables:

- Visual design polish.
- Sounds/haptics optional.
- Onboarding.
- Shareable results.
- App icons/screenshots.
- Beta testing.
- Release candidate.

## 16. Initial multi-agent tickets

### Ticket 1 — Product requirements and edge-case expansion

**Assigned agent:** Elisa
**Priority:** P0
**Depends on:** None

**Context:**
Ashar wants a production-grade mobile + web multiplayer competitive Wordle-like game. Internal codename is Wordle Royale, but name may change. This is not an MVP; plan for a launchable product.

**Objective:**
Turn the concept into a complete product requirements document with missing flows, edge cases, and decisions needed.

**Scope:**
Include auth, onboarding, lobby types, matchmaking, game modes, scoring, ranked mode, profiles, leaderboards, settings, admin/moderation, privacy, and future variants.

**Acceptance criteria:**
- Identify all core user journeys.
- Identify important missing requirements and product decisions.
- Mark must-have vs should-have vs later.
- Include edge cases: disconnects, abandoned lobbies, ties, cheating, invalid words, host leaving, app backgrounding.
- Return copy-pasteable follow-up tickets if backend/frontend/ops decisions are needed.

**Verification:**
Review against the original concept and confirm nothing major is unaddressed.

**Deliverable back to Athena:**
Structured PRD plus open decision list.

---

### Ticket 2 — Technical architecture and API contract

**Assigned agent:** Elisa
**Priority:** P0
**Depends on:** Ticket 1 ideally, but can draft in parallel.

**Context:**
Need architecture for production mobile + web, real-time lobbies, matchmaking, ranked games, and persistent profiles.

**Objective:**
Design the technical architecture, services, data model, API endpoints, WebSocket event contract, and deployment approach.

**Scope:**
Recommend stack, database schema, Redis usage, real-time protocol, authentication/session model, rating pipeline, game engine boundaries, and admin system.

**Acceptance criteria:**
- Provide architecture diagram in text form.
- Define backend modules.
- Define database tables and relationships.
- Define REST endpoints.
- Define WebSocket events.
- Define auth/security model.
- Define scaling and deployment assumptions.
- Include risks/trade-offs.

**Verification:**
Architecture must support private lobbies, public lobbies, quick join, realtime rounds, profiles, leaderboards, and future variants.

**Deliverable back to Athena:**
Architecture spec and API contract.

---

### Ticket 3 — UX flow and wireframe plan

**Assigned agent:** Luna
**Priority:** P0
**Depends on:** Ticket 1, but can begin from concept.

**Context:**
Need mobile-first and web-compatible UX for a multiplayer word battle app.

**Objective:**
Design the screen map, navigation model, and wireframe-level UX for the full app.

**Scope:**
Include landing, auth, home, create lobby, join by code, public lobbies, quick join queue, lobby waiting room, game screen, match report, leaderboard, profile, settings, admin basics if relevant.

**Acceptance criteria:**
- Provide screen list.
- Provide user flow map.
- Describe each screen’s components and states.
- Include mobile and web layout notes.
- Include empty/loading/error/reconnect states.
- Include accessibility considerations.

**Verification:**
A developer should be able to create UI tickets from the output.

**Deliverable back to Athena:**
UX spec and frontend ticket suggestions.

---

### Ticket 4 — Game engine and scoring specification

**Assigned agent:** Freya
**Priority:** P0
**Depends on:** None

**Context:**
The core gameplay is a Wordle-like puzzle with competitive multiplayer scoring based on guess count and speed.

**Objective:**
Define the deterministic game engine rules, scoring algorithm, and rating model.

**Scope:**
Word validation, duplicate-letter feedback, round lifecycle, timers, scoring formula, tie-breakers, match report data, rating/ELO/MMR calculation, ranked vs casual differences.

**Acceptance criteria:**
- Define pure functions the game engine should expose.
- Include exact scoring formula proposal.
- Include duplicate-letter examples.
- Include tie-breaking rules.
- Include rating update algorithm.
- Include test cases for engine behavior.

**Verification:**
Spec should be implementable as a shared package with unit tests independent of UI/backend.

**Deliverable back to Athena:**
Game engine/scoring spec and test plan.

---

### Ticket 5 — Backend implementation plan

**Assigned agent:** Freya
**Priority:** P1
**Depends on:** Ticket 2 and Ticket 4.

**Context:**
Backend must support auth, lobbies, realtime game sessions, matchmaking, profiles, leaderboards, and admin basics.

**Objective:**
Break backend work into implementation tickets.

**Scope:**
Auth, users/profiles, lobby service, matchmaking service, game session service, WebSocket gateway, scoring/rating service, leaderboard service, admin/moderation, tests.

**Acceptance criteria:**
- Provide backend task breakdown.
- Include file/module suggestions.
- Include database migrations.
- Include verification commands.
- Include sequence/dependencies.

**Verification:**
Athena should be able to route backend implementation tickets from the output.

**Deliverable back to Athena:**
Backend implementation ticket plan.

---

### Ticket 6 — Infrastructure and deployment plan

**Assigned agent:** Yuna
**Priority:** P0
**Depends on:** Ticket 2 preferred.

**Context:**
This will be a production app with web, API, WebSockets, database, Redis, mobile releases, CI/CD, monitoring.

**Objective:**
Design the deployment and operations plan.

**Scope:**
Hosting provider recommendation, environment layout, secrets, CI/CD, preview environments, database backups, Redis, monitoring, error tracking, logging, app-store deployment path, domain/email needs.

**Acceptance criteria:**
- Recommend a practical hosting stack.
- Include dev/staging/prod environments.
- Include required environment variables.
- Include CI/CD pipeline outline.
- Include monitoring/alerting plan.
- Include cost-conscious options.
- Identify production risks.

**Verification:**
Plan must support WebSockets and mobile app production deployment.

**Deliverable back to Athena:**
Ops/deployment plan and setup tickets.

---

### Ticket 7 — Dictionary/content and moderation plan

**Assigned agent:** Ruby
**Priority:** P1
**Depends on:** Ticket 4 useful but not required.

**Context:**
The game needs accepted guess words, answer words, difficulty levels, future variants, and moderation controls.

**Objective:**
Design dictionary sourcing, word difficulty, content moderation, and word-list tooling.

**Scope:**
Word lists, difficulty classification, offensive word filtering, language support, daily/seeded puzzle support, import tooling, admin word management.

**Acceptance criteria:**
- Recommend word-list sources and licensing considerations.
- Define answer list vs accepted guesses.
- Propose difficulty scoring.
- Propose moderation/filtering system.
- Include tooling scripts needed.
- Include tests for dictionary validity.

**Verification:**
Output should let backend/game-engine agents implement dictionary handling safely.

**Deliverable back to Athena:**
Dictionary/content spec and tooling tickets.

---

### Ticket 8 — QA strategy and acceptance test matrix

**Assigned agent:** Jasmine
**Priority:** P0
**Depends on:** Tickets 1-4 helpful, but can start from concept.

**Context:**
This is planned as a full production project, not a small MVP. QA must be designed early.

**Objective:**
Create the QA strategy and acceptance test matrix for the whole product.

**Scope:**
Functional testing, realtime multiplayer testing, mobile/web compatibility, E2E flows, performance/load testing, security/fairness testing, app-store release checks.

**Acceptance criteria:**
- List critical user journeys to test.
- Define automated test layers.
- Define manual QA checklist.
- Define realtime edge-case tests.
- Define release-blocking criteria.
- Define beta testing plan.

**Verification:**
Athena should be able to use the output as the project’s QA gate plan.

**Deliverable back to Athena:**
QA strategy, test matrix, and release gates.

---

### Ticket 9 — Branding/name exploration

**Assigned agent:** Luna or Elisa
**Priority:** P1
**Depends on:** None

**Context:**
`Wordle Royale` appears risky because `Wordle` is strongly associated with NYT and related apps already exist on Google Play. Need a safer public brand.

**Objective:**
Create a shortlist of safer names and visual identity directions.

**Scope:**
Name candidates, tagline, vibe, app icon ideas, domain/social availability checklist, legal/trademark caution notes.

**Acceptance criteria:**
- Provide 15-30 name options.
- Categorize by style: competitive, elegant, playful, esports, casual.
- Avoid direct `Wordle` dependency.
- Include top 5 recommendations.
- Include next steps for legal/domain/app-store checks.

**Verification:**
Names should be distinct enough to reduce confusion with existing Wordle apps.

**Deliverable back to Athena:**
Branding/name shortlist.

## 17. Major open decisions for Ashar

1. Public name: keep internal `Wordle Royale` only, or choose a safer launch name?
2. Initial platform priority: mobile first, web first, or both together?
3. Stack preference: React Native/Expo + Next.js + TypeScript backend, or Flutter + another backend?
4. Auth methods: email/password only, or Google/Apple login from the start?
5. Real-time strictness: all players solve simultaneously live, or can rounds tolerate async delays?
6. Ranked mode from day one, or after casual/private lobbies are stable?
7. Chat in lobbies: include now, quick reactions only, or postpone?
8. Monetization: ignore for launch, or design cosmetics/premium early?
9. Dictionary language: English only initially?
10. Age/privacy policy target: adults/general audience, or kids-safe design?

## 18. Recommended immediate next step

Have the agents complete Tickets 1-4 first:

1. Elisa: PRD and architecture/API.
2. Luna: UX flow/wireframe plan.
3. Freya: game engine/scoring spec.
4. Jasmine: QA matrix.

Then Athena should reconcile their outputs into a final approved build plan before anyone starts coding.
