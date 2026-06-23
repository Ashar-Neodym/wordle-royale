# Wordle Royale — Athena Decision Locks After Tickets 01-05

These are working defaults to unblock the next planning/implementation tickets. Ashar can still change them later, but agents should assume these unless a newer Athena decision file supersedes them.

## Product defaults

- Public name: Wordle Royale.
- Launch language: English only.
- Launch mode: standard 5-letter Wordle-style competitive mode.
- Ranked V1: fixed 5-letter words, 6 guesses, server-authoritative timer, server-authoritative scoring.
- Invalid guesses: do not consume attempts, but consume time.
- Timer: continues during disconnect/app backgrounding.
- Match reports: participants can view; share-card can be generated, but full report privacy should be configurable later.
- Chat/social graph/spectators/tournaments/monetization: not V1 blockers.

## Technical defaults

- Web: Next.js / React.
- Mobile: Expo React Native.
- Backend: TypeScript.
- Backend framework default: NestJS unless Elisa/Yuna identify a strong reason to use Fastify.
- Realtime: Socket.IO for V1.
- Database: PostgreSQL.
- ORM: Prisma unless Elisa/Freya identify a strong reason to use Drizzle.
- Redis: matchmaking, presence, locks, rate limits, Socket.IO adapter, queue backing.
- Queue: BullMQ.
- Auth V1: email/password plus Apple/Google planned for mobile release readiness; exact provider rollout can be phased.
- Identity: unique handle + non-unique display name.

## Gameplay/rating defaults

- Casual lobbies may support 2-4 players.
- Ranked V1 should support multiplayer placements, but if implementation risk is high, ranked can initially restrict to 1v1 while the same MMR model supports expansion.
- Rating: custom placement-based MMR for V1, simulation-tested before launch; keep upgrade path to TrueSkill/Glicko-style uncertainty.
- Ranked timer default for specs: 120 seconds per round unless tuning changes.
- Rated private lobbies: disabled by default for V1 unless all ranked-compatible settings and anti-cheat requirements are satisfied.

## Word library defaults

- Separate answer words and valid guess words.
- Answer target: 4,000–8,000 curated 5-letter English words for production V1.
- Valid guess target: 12,000–20,000 accepted 5-letter guesses.
- Use a reviewed internal Wordle Royale dictionary as source of truth; external sources only feed import/review tooling.
- Avoid proprietary Wordle answer lists unless licensing is clearly safe.
- Offensive/slur words: excluded from answers; default V1 should reject severe slurs/offensive terms from valid guesses too, with policy reviewed before launch.
- Use versioned immutable dictionary releases; store dictionary version per match.

## Data/privacy defaults

- Separate consent scopes: necessary gameplay, product analytics, training/insight opt-in.
- Training/insight usage should be opt-in unless legal review says otherwise.
- Avoid collecting free-text chat in V1 because chat is deferred.
