# Safe Seed and Fixture Bridge for Local Database Development — Response

## Summary

Implemented a safe local seed/fixture bridge for the Prisma-backed API package.

Delivered:

- New deterministic seed planner/runner at `apps/api/prisma/seed-fixtures.ts`.
- Database-free dry-run script: `pnpm --filter @wordle-royale/api db:seed:dry-run`.
- Local Postgres apply script: `pnpm --filter @wordle-royale/api db:seed:local`.
- Seed contract tests at `apps/api/prisma/seed-fixtures.test.mjs`.
- API typecheck now includes Prisma seed TypeScript files.
- API README documentation for Freya/Yuna local usage.
- API package dependencies wired to the existing safe fixture and word-tool packages.

The dry-run reports counts, checksums, policy, and fixture handles only. It intentionally does not print the fixture word list, keeping operational logs spoiler-safe.

No production dictionary, proprietary word source, paid service dependency, production secret, real `.env`, or real user email was added.

## Decisions / Recommendations

- Keep the seed flow local-only until a real local Postgres service is verified by Yuna.
- Use the existing hand-curated `en-5-test-vfixture.001` fixture artifacts as the only dictionary seed source.
- Treat `db:seed:dry-run` as the deterministic verification command when Docker/Postgres is unavailable.
- Do not run `db:seed:local` against production/shared databases. It is designed for local development only.
- Keep production dictionary ingestion as a future, separately reviewed ticket.

## Detailed Output

Seed plan contents:

- Dictionary release:
  - Version: `en-5-test-vfixture.001`
  - Locale: `en`
  - Word length: `5`
  - Status: `draft`
  - Source label: `safe-fixture`
  - Policy: `fixtureOnly=true`, `productionApproved=false`, `sourcePolicy=hand_curated_safe_fixture_only`
- Dictionary word rows:
  - Answer rows: `20`
  - Guess rows: `40`
  - Banned rows: `3`
  - Total rows: `63`
- Fixture users:
  - Count: `4`
  - Handles: `ashar`, `freya`, `luna`, `ruby`
  - Committed emails: `0`

Apply behavior:

- Requires `DATABASE_URL`.
- Upserts `DictionaryRelease` by `(locale, wordLength, version)`.
- Inserts dictionary word rows with `skipDuplicates`.
- Upserts local fixture users, profiles, and rating profiles.
- Does not delete or reset existing rows.

Dry-run output evidence:

```json
{
  "mode": "dry-run",
  "dictionary": {
    "id": "dict_en_5_test_vfixture_001",
    "version": "en-5-test-vfixture.001",
    "locale": "en",
    "wordLength": 5,
    "status": "draft",
    "sourceLabel": "safe-fixture",
    "artifactSha256": "53afa01086e8f173f0ae57b02eb9c5f67675ff4fe807551758297dfcc8717120",
    "counts": {
      "answer": 20,
      "guess": 40,
      "banned": 3,
      "totalWords": 63
    },
    "policy": {
      "fixtureOnly": true,
      "productionApproved": false,
      "sourcePolicy": "hand_curated_safe_fixture_only"
    },
    "validation": {
      "passed": true,
      "reportPath": "packages/word-tools/data/reports/en-5-test-vfixture.001.validation-report.json"
    }
  },
  "users": {
    "count": 4,
    "handles": ["ashar", "freya", "luna", "ruby"],
    "emailsCommitted": 0
  },
  "apply": {
    "available": false,
    "reason": "Run with --apply and a local DATABASE_URL to write this deterministic fixture plan to local Postgres."
  }
}
```

## Open Questions

- Should later local integration tickets seed sample lobbies/matches too, or should this ticket remain dictionary/users/rating-foundation only?
- Should the eventual Docker workflow add a single command that runs migrate + seed together after local Postgres is confirmed?

## Follow-up Tickets

- Add verified Docker/Postgres migrate+seed integration once Yuna's local orchestration is available.
- Add service-level tests that consume seeded dictionary/users through Prisma once Freya's persistence services land.
- Add sample lobby/match fixtures only if Freya/Freya-facing integration work needs seeded gameplay state.

## Files Changed

- `apps/api/prisma/seed-fixtures.ts`
- `apps/api/prisma/seed-fixtures.test.mjs`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/README.md`
- `pnpm-lock.yaml`

## Tests / Commands Run

- `pnpm --filter @wordle-royale/api test` — exit `1` initially, expected RED failure because `prisma/seed-fixtures.ts` did not exist yet.
- `CI=true pnpm install --no-frozen-lockfile` — exit `0`; updated lockfile for new workspace dependencies.
- `pnpm --filter @wordle-royale/api test` — exit `0`; 11/11 tests passed after implementation.
- `pnpm --filter @wordle-royale/api db:seed:dry-run` — exit `0`; emitted deterministic dry-run JSON without requiring `DATABASE_URL`.
- `pnpm --filter @wordle-royale/api build` — exit `2` initially after adding seed files to typecheck; exposed seed TypeScript contract issues.
- `pnpm --filter @wordle-royale/api build && pnpm --filter @wordle-royale/api test && pnpm --filter @wordle-royale/api db:seed:dry-run` — exit `0` after fixes.
- `CI=true pnpm install --frozen-lockfile` — exit `0`.
- `pnpm --filter @wordle-royale/fixtures build` — exit `0`.
- `pnpm --filter @wordle-royale/word-tools build` — exit `0`.
- `pnpm --filter @wordle-royale/api db:validate` — exit `0`.
- `pnpm build` — exit `0`.
- `pnpm secret-scan` — exit `0`; `Secret scan passed (145 source/config files scanned).`
- `pnpm test` — exit `0`; workspace scaffold validation passed.
- `env -u DATABASE_URL pnpm --filter @wordle-royale/api db:seed:local` — exit `1`, expected guardrail: `DATABASE_URL is required for --apply. Use --dry-run for database-free validation.`

## Evidence / Result

Acceptance criteria status:

- `pnpm --filter @wordle-royale/fixtures build` passed.
- `pnpm --filter @wordle-royale/word-tools build` passed.
- `pnpm --filter @wordle-royale/api db:validate` passed.
- Root `pnpm build` passed.
- `pnpm secret-scan` passed.
- Deterministic dry-run/validation command exists and passed: `pnpm --filter @wordle-royale/api db:seed:dry-run`.
- Live seed apply is pending local Docker/Postgres verification; `db:seed:local` correctly refuses to run without `DATABASE_URL`.
- Tests prove the dry-run summary is deterministic and does not print known fixture words.

## Risks / Blockers

- Live database apply was not executed because no local `DATABASE_URL`/Postgres instance was provided in this ticket context.
- `db:seed:local` should only be used after local migrations are applied.
- The seed script stores fixture dictionary words in local DB rows when applied; this is appropriate for local development, but dry-run logs intentionally avoid printing those words.
- This does not implement production dictionary ingestion, moderation, analytics, or full gameplay sample state.
