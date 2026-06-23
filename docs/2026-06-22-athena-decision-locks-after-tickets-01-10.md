# Wordle Royale — Athena Decision Locks After Tickets 01-10

This file supersedes `2026-06-19-athena-decision-locks-after-tickets-01-05.md` for implementation planning.

## Source responses reviewed

- Ticket 01 — Product Requirements Document
- Ticket 02 — Technical Architecture and API Contract
- Ticket 03 — UX Flow and Wireframe Plan
- Ticket 04 — Game Engine, Scoring, and Rating Specification
- Ticket 05 — Dictionary, Word Library, and Content Moderation Plan
- Ticket 06 — Analytics, Data Collection, and Insights Plan
- Ticket 07 — Infrastructure and Deployment Plan
- Ticket 08 — QA Strategy and Acceptance Test Matrix
- Ticket 09 — Branding and Visual Direction
- Ticket 10 — Architecture/API Contract Reconciliation Amendments

## Locked product defaults

- Public name remains `Wordle Royale` for now, but legal/trademark review is needed before public launch because it contains `Wordle`.
- Launch mode: standard English 5-letter Wordle-style competitive game.
- Guess limit: 6.
- Invalid guesses: do not consume attempts, but consume time.
- Timer: server-authoritative and continues during disconnect/backgrounding.
- Casual lobbies: support 2–4 players.
- Ranked V1: implement the architecture for multiplayer placement MMR, but Athena default is to allow a 1v1 ranked beta first if multiplayer ranked tuning is risky.
- Ranked timer planning default: 120 seconds per round.
- Ranked difficulty: use one official fixed ranked dictionary/difficulty mix for V1; defer separate rating buckets by difficulty.
- Rated private lobbies: disabled by default for V1 unless ranked-compatible settings and anti-cheat protections are explicitly enforced.
- Match reports: participant-only full reports by default; spoiler-safe public share cards allowed.
- Chat, friends/social graph, spectators, tournaments, monetization: deferred from V1 unless Ashar elevates them.

## Locked technical defaults

- Web: Next.js / React.
- Mobile: Expo React Native.
- Backend: TypeScript + NestJS.
- Realtime: Socket.IO V1.
- Database: PostgreSQL.
- ORM/migrations: Prisma.
- Redis: matchmaking, presence, locks, cache, rate limits, Socket.IO adapter, BullMQ backing.
- Queue/jobs: BullMQ.
- Auth V1: email/password first; Apple/Google planned for mobile readiness.
- Identity: unique handle + non-unique display name.
- Server authority: clients submit intent only; server validates guesses, feedback, timer, scoring, finalization, ratings.
- Critical implementation requirement: typed/generated/shared REST + Socket.IO contracts to avoid frontend/backend drift.
- Critical backend requirement: idempotency for lobby join/leave, match start, guess submission, rating finalization, and reversal/void operations.

## Locked data/content defaults

- Separate answer list and valid-guess list.
- Launch language: English only.
- Regional policy default: common English with a bias toward US spellings for answers; allow common UK variants as valid guesses where not confusing. Final production list still needs content review.
- Answer target: 4,000–8,000 curated 5-letter words.
- Valid guess target: 12,000–20,000 accepted 5-letter guesses.
- Severe offensive/slur terms: exclude from answers and reject from valid guesses for V1 unless legal/product review later changes policy.
- Dictionary releases: immutable/versioned; store dictionary/list version per match/round.
- Avoid proprietary Wordle answer lists unless licensing is clearly safe.

## Locked analytics/privacy defaults

- Internal-first analytics for V1.
- Consent scopes: `necessary`, `product_analytics`, `training_insights_opt_in`.
- Consent enforcement must be server-side; client-only consent is not sufficient.
- Do not send unrestricted client-side analytics capture in V1.
- Training/insight usage must be explicit opt-in and deletion-aware.
- Broad analytics should not store raw guess text by default; use derived features where possible.
- No free-text chat in V1; if added later, it triggers moderation/privacy scope expansion.

## Locked infra defaults

- Recommended deployment posture: Vercel for Next.js web; Fly.io or Render for NestJS API/WebSocket + worker; managed PostgreSQL; managed Redis; Expo EAS for mobile builds.
- Avoid serverless-only backend for gameplay WebSockets.
- Object storage deferred unless avatars/uploads are promoted into V1.
- CI/CD: GitHub Actions with PR checks, staging deploy, and manual production approval.
- Observability: Sentry + structured JSON logs initially; provider metrics/logs first.
- Production-affecting infra creation, secret changes, or paid resources require Ashar approval.

## Locked brand defaults

- Primary direction: Luna's Direction 1, `Crown Grid Arena`.
- Brand should be tile-first, crown/arena accented, polished competitive but not toxic.
- Must support colorblind, high-contrast, reduced-motion, and spoiler-safe share cards.

## Still-open decisions to ask Ashar later, not blockers for next planning wave

1. Final launch geography and minor/children policy.
2. Whether external analytics provider is ever needed; internal-first remains V1 default.
3. Final admin scope: API + CLI first vs full admin UI before launch.
4. Full legal/trademark decision on the `Wordle Royale` name.
5. Production dictionary licensing/source selection.
6. Final browser/device QA support matrix and public beta load targets.
