# Database and Prisma Schema Foundation — Response

## Summary

Implemented the first PostgreSQL/Prisma database schema foundation for Wordle Royale in `apps/api/prisma/schema.prisma`.

Delivered:

- Prisma schema using PostgreSQL provider and `DATABASE_URL`.
- 17 schema models covering users/profiles/consent, dictionary metadata, lobby/match/gameplay, rating/leaderboard, analytics, and audit basics.
- 12 enums for status/scope/type fields, including locked consent spelling `training_insights_opt_in`.
- Deterministic initial SQL migration generated from the Prisma schema with `prisma migrate diff` without connecting to a database.
- API package scripts for schema validation/generation/migration commands.
- Schema contract tests for required models/fields and answer-leakage guard on `MatchRound`.
- README documentation for local validation and database foundation scope.
- Root build preservation fix in `apps/web/tsconfig.json` so Next resolves built workspace package outputs instead of raw TS source aliases.

No real `.env` file, production secret, paid service, production database connection, or production dictionary source was added.

## Decisions / Recommendations

1. **Use Prisma + PostgreSQL as the local database foundation.**
   - `apps/api/prisma/schema.prisma` uses `provider = "postgresql"` and `url = env("DATABASE_URL")`.

2. **Store dictionary release identity on matches, rounds, and guesses.**
   - `Match.dictionaryReleaseId`, `MatchRound.dictionaryReleaseId`, and `GuessAttempt.dictionaryReleaseId` support future replay/audit against the exact dictionary release used.

3. **Avoid storing plaintext answer directly on rounds.**
   - `MatchRound` stores `answerWordHash` and optional `answerWordSaltRef`; it intentionally has no `answerWord String` field.
   - `GuessAttempt` stores `normalizedGuess`, `feedback Json`, and `serverValidation Json` for server-authoritative audit without requiring public payloads to reveal answers.

4. **Make rating events auditable and idempotency-ready.**
   - `RatingEvent` includes `idempotencyKey`, rating before/after/delta, config metadata, `voidedByEventId`, and `reversalOfEventId`.

5. **Keep analytics minimal but present.**
   - Added `AnalyticsEvent` and `AuditLog` as foundation tables rather than deferring completely, because Ticket 26 requested analytics/audit basics.

6. **Do not apply migrations in this environment.**
   - A deterministic SQL migration file was generated, but no real database or Docker Compose service was contacted.

7. **Allow approved local build scripts for Prisma packages.**
   - `pnpm-workspace.yaml` now allows build scripts for `@prisma/client`, `@prisma/engines`, `prisma`, and existing `sharp` so `pnpm install --frozen-lockfile` can pass under pnpm 11 build-approval policy.

## Detailed Output

### Schema areas implemented

Models added in `apps/api/prisma/schema.prisma`:

```text
UserAccount
UserProfile
ConsentRecord
DictionaryRelease
DictionaryWord
Lobby
Match
MatchRound
MatchParticipant
GuessAttempt
ScoreBreakdown
MatchReport
RatingProfile
RatingEvent
LeaderboardSnapshot
AnalyticsEvent
AuditLog
```

Enums added:

```text
UserAccountStatus
ConsentScope
ConsentDecision
DictionaryReleaseStatus
DictionaryWordKind
LobbyStatus
LobbyVisibility
MatchStatus
MatchMode
ParticipantOutcome
RatingEventType
RatingProfileStatus
```

### Required acceptance coverage

- **Users/profiles/consent:** `UserAccount`, `UserProfile`, `ConsentRecord`, `ConsentScope`, `ConsentDecision`.
- **Word library metadata:** `DictionaryRelease`, `DictionaryWord`, release status, word kind, source metadata, artifact checksum, and per-word checksum/metadata.
- **Lobby/match/gameplay:** `Lobby`, `Match`, `MatchRound`, `MatchParticipant`, `GuessAttempt`, `ScoreBreakdown`, `MatchReport`.
- **Rating/leaderboard:** `RatingProfile`, `RatingEvent`, `LeaderboardSnapshot`.
- **Void/reversal support:** `Match.status = voided`, `Match.voidedAt`, `Match.voidReason`, `RatingEvent.voidedByEventId`, `RatingEvent.reversalOfEventId`, `RatingEvent.type`.
- **Analytics/audit basics:** `AnalyticsEvent`, `AuditLog`.

### API package scripts added

```json
{
  "test": "node --test prisma/*.test.mjs",
  "db:validate": "DATABASE_URL=\"${DATABASE_URL:-postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public}\" prisma validate --schema prisma/schema.prisma",
  "db:generate": "DATABASE_URL=\"${DATABASE_URL:-postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public}\" prisma generate --schema prisma/schema.prisma",
  "db:migrate:dev": "prisma migrate dev --schema prisma/schema.prisma",
  "db:migrate:deploy": "prisma migrate deploy --schema prisma/schema.prisma"
}
```

The `***` password is a placeholder for validation only; it is not a real secret and `prisma validate` does not connect to a database.

### Migration

Created deterministic local migration SQL:

```text
apps/api/prisma/migrations/20260623000000_initial_schema/migration.sql
```

Generation command used `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` and did not connect to a live database.

### Build preservation fix

`pnpm build` initially failed in `apps/web` because Next resolved `@wordle-royale/design-tokens` and `@wordle-royale/fixtures` to raw `src/index.ts` aliases from the shared base tsconfig. Those source indexes use NodeNext `.js` specifiers that Turbopack did not resolve as TS source files.

Fixed by overriding `apps/web/tsconfig.json` paths to built `dist/index.js` outputs for:

```text
@wordle-royale/design-tokens
@wordle-royale/fixtures
```

After this, root `pnpm build` passed.

## Open Questions

1. Should `RatingEvent.voidedByEventId` / `reversalOfEventId` become explicit self-relations later, or remain scalar audit references for simpler first migration?
2. Should production answer words ever be stored plaintext in an internal-only table, or should the launch design keep hash-only round answers plus dictionary release references?
3. Should analytics events be split into separate product analytics vs operational audit tables before controllers are implemented?
4. Should future Prisma migrations be generated with `prisma migrate dev` once Docker Compose is available, or continue using deterministic `migrate diff` until the first live local DB apply?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend service logic/controllers.
- **Exact task:** Implement Prisma client integration and backend services for user/profile, lobby, match, guess submission, match finalization, and rating application using this schema.
- **Inputs/context they need:** `apps/api/prisma/schema.prisma`, Ticket 10 contracts, Ticket 19 game engine, Ticket 24 rating tools.
- **Expected output back to Athena:** Service code, API tests, idempotency tests, and schema mismatch notes.

### Follow-up ticket 2

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns data/import tooling.
- **Exact task:** Add a local seed/import command that loads Ticket 20 safe fixture dictionaries into `DictionaryRelease`/`DictionaryWord` tables once a local DB can be run.
- **Inputs/context they need:** `packages/word-tools/data/fixtures/*.json`, `apps/api/prisma/schema.prisma`.
- **Expected output back to Athena:** Seed script, command output against local Postgres, and no production dictionary sources.

### Follow-up ticket 3

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA/release confidence.
- **Exact task:** Review the Prisma schema against Tickets 10/18–24, focusing on answer leakage, idempotency, void/reversal fields, consent enforcement, and dictionary version traceability.
- **Inputs/context they need:** This response and `apps/api/prisma/schema.prisma`.
- **Expected output back to Athena:** QA pass/fail matrix and release-blocking schema concerns.

### Follow-up ticket 4

- **Target agent:** Yuna
- **Why that agent is needed:** Yuna owns local dev and CI reliability.
- **Exact task:** Add API DB validation to CI and verify migration apply against Docker Compose Postgres once Docker Compose v2 is available.
- **Inputs/context they need:** `apps/api` scripts, `docker-compose.yml`, `.env.local.example`.
- **Expected output back to Athena:** CI update, local DB apply evidence, and environment blocker notes.

## Files Changed

- `apps/api/README.md`
- `apps/api/package.json`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/schema.test.mjs`
- `apps/api/prisma/migrations/20260623000000_initial_schema/migration.sql`
- `apps/web/tsconfig.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `agent-communication/responses/ticket-26-ruby-database-prisma-schema-foundation-response.md`

Generated locally by pnpm but not listed as source files:

- `node_modules/`
- package-local `node_modules/` workspace links

## Tests / Commands Run

### RED test command

```bash
node --test apps/api/prisma/schema.test.mjs
```

Exit code: `1`

Expected RED failure:

```text
Error: ENOENT: no such file or directory, open '/home/ashar/Desktop/hermes-projects/wordle-royale/apps/api/prisma/schema.prisma'
✖ apps/api/prisma/schema.test.mjs
```

### Initial install command and build-approval blocker

```bash
pnpm install --no-frozen-lockfile
```

Exit code: `1`

Output:

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @prisma/client@6.19.3, @prisma/engines@6.19.3, prisma@6.19.3
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

Resolution: added explicit `allowBuilds` / `onlyBuiltDependencies` entries in `pnpm-workspace.yaml` for Prisma packages and existing `sharp`, then reran install with CI mode.

### Successful dependency install

```bash
CI=true pnpm install --no-frozen-lockfile
```

Exit code: `0`

Output included:

```text
Scope: all 10 workspace projects
Packages: +64
.../node_modules/@prisma/engines postinstall: Done
.../sharp@0.34.5/node_modules/sharp install: Done
.../node_modules/prisma preinstall: Done
.../node_modules/@prisma/client postinstall: Done
Done in 29.7s using pnpm v11.1.1
```

### Prisma validation failure during implementation

```bash
pnpm --filter @wordle-royale/api test && DATABASE_URL='postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public' pnpm --filter @wordle-royale/api db:validate
```

Exit code: `1`

Expected implementation failure before relation fix:

```text
Error validating field `match` in model `GuessAttempt`: The relation field `match` on model `GuessAttempt` is missing an opposite relation field on the model `Match`.
Error validating field `match` in model `ScoreBreakdown`: The relation field `match` on model `ScoreBreakdown` is missing an opposite relation field on the model `Match`.
```

Resolution: added `guessAttempts` and `scoreBreakdowns` relation arrays to `Match`.

### Migration generation

```bash
mkdir -p apps/api/prisma/migrations/20260623000000_initial_schema && DATABASE_URL='postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public' pnpm --filter @wordle-royale/api exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > apps/api/prisma/migrations/20260623000000_initial_schema/migration.sql && test -s apps/api/prisma/migrations/20260623000000_initial_schema/migration.sql
```

Exit code: `0`

Result: created non-empty deterministic SQL migration file. It was not applied to any database.

### Final schema validation, tests, frozen install, and build

```bash
pnpm --filter @wordle-royale/api db:validate && pnpm --filter @wordle-royale/api test && CI=true pnpm install --frozen-lockfile && pnpm build
```

Exit code: `0`

Output included:

```text
The schema at prisma/schema.prisma is valid 🚀
✔ schema uses PostgreSQL provider and app env datasource
✔ schema covers users profiles consent and analytics audit basics
✔ schema stores dictionary versions and per-word metadata without production source content
✔ schema covers lobby match round participant guesses scores and reports
✔ schema supports rating events idempotency voids reversals and leaderboard profiles
ℹ tests 5
ℹ pass 5
Scope: all 10 workspace projects
Already up to date
Done in 372ms using pnpm v11.1.1
apps/web build: ✓ Compiled successfully
apps/web build: Done
```

### Root test

```bash
pnpm test
```

Exit code: `0`

Output:

```text
Workspace scaffold validation passed (9 workspace packages).
```

### Safety/coverage inspection

```text
Hermes execute_code validation
```

Exit status: success

Output:

```text
models 17 ['UserAccount', 'UserProfile', 'ConsentRecord', 'DictionaryRelease', 'DictionaryWord', 'Lobby', 'Match', 'MatchRound', 'MatchParticipant', 'GuessAttempt', 'ScoreBreakdown', 'MatchReport', 'RatingProfile', 'RatingEvent', 'LeaderboardSnapshot', 'AnalyticsEvent', 'AuditLog']
enums 12 ['UserAccountStatus', 'ConsentScope', 'ConsentDecision', 'DictionaryReleaseStatus', 'DictionaryWordKind', 'LobbyStatus', 'LobbyVisibility', 'MatchStatus', 'MatchMode', 'ParticipantOutcome', 'RatingEventType', 'RatingProfileStatus']
env files ['.env.local.example', '.env.example']
migration lines 513
```

## Evidence / Result

Acceptance criteria status:

1. **Uses Prisma with PostgreSQL provider:** Passed; `prisma validate` passed and schema uses `provider = "postgresql"`.
2. **Does not require real secrets:** Passed; no real `.env` file created and `db:validate` uses placeholder local URL only.
3. **Does not connect to production or paid infra:** Passed; no database connection or paid resource was used.
4. **Dictionary version can be stored per match/round:** Passed; `Match`, `MatchRound`, and `GuessAttempt` reference `DictionaryRelease`.
5. **Guess attempts store server-authoritative validation/audit fields without public answer leakage:** Passed; `GuessAttempt` has `feedback Json` and `serverValidation Json`; `MatchRound` has `answerWordHash` and no `answerWord String` field.
6. **Rating events support void/reversal/idempotency follow-up:** Passed; `RatingEvent` has `idempotencyKey`, `voidedByEventId`, and `reversalOfEventId`.
7. **Add `pnpm --filter @wordle-royale/api db:validate` and it passes:** Passed with exit code `0`.
8. **`pnpm install --frozen-lockfile` passes after dependency changes:** Passed with exit code `0`.
9. **Root `pnpm build` passes:** Passed with exit code `0`.

## Risks / Blockers

- **Migration not applied:** Docker Compose/database startup remains unverified in this environment, so the migration was generated and validated but not applied to a live Postgres database.
- **Schema may need refinement after service implementation:** Backend service logic may reveal naming/index/relation adjustments before first real migration apply.
- **Answer storage policy still needs final security review:** Current schema avoids plaintext answer on `MatchRound`, but future backend implementation must preserve public payload boundaries.
- **Rating self-reference fields are scalar audit references for now:** This is simpler for the foundation but may be upgraded to explicit self-relations if Freya wants stronger relational constraints.
- **Build script approval policy is now explicit:** `pnpm-workspace.yaml` allows Prisma and `sharp` build scripts; future dependencies with build scripts should remain reviewed/explicit, not automatically allowed.
