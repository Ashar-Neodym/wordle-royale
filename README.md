# Wordle Royale

Wordle Royale is a pnpm monorepo for the first local build wave.

## Workspace layout

- `apps/api` — future NestJS backend/API/Socket.IO/worker code.
- `apps/web` — future Next.js web app.
- `apps/mobile` — future Expo React Native app.
- `packages/contracts` — shared TypeScript/Zod contracts, enums, API envelopes, event names.
- `packages/game-engine` — pure deterministic gameplay/scoring/rating logic.
- `packages/design-tokens` — Crown Grid Arena design token exports.
- `packages/fixtures` — shared safe test fixtures.
- `packages/word-tools` — dictionary fixture/import/validation tooling.
- `packages/rating-tools` — MMR simulation tooling.

## Current scaffold commands

```bash
pnpm install
pnpm typecheck
pnpm -r list --depth -1
```

`pnpm typecheck` currently runs a workspace validation script because the app/package implementations are placeholders. Future tickets should replace or extend package-level `typecheck` scripts with real TypeScript checks as code is added.

## Local development infrastructure

Local-only PostgreSQL 16 and Redis 7 are defined in `docker-compose.yml`.

```bash
pnpm deps:up       # start local Postgres/Redis
pnpm deps:check    # validate Docker Compose v2 and compose config
pnpm deps:verify   # start, health-check, readiness-check, and stop local dependencies
pnpm smoke:local   # validate local config and workspace scaffold
pnpm deps:down     # stop local services
```

For setup details, see `docs/local-development.md`.

## Controlled preview dictionary bootstrap

The hosted preview uses a dictionary-only bootstrap. It never runs `db:seed:local` and never creates fixture users, profiles, ratings, lobbies, matches, tickets, analytics, or audits.

Run migrations first, inspect the database-free dry-run, then apply only after explicitly targeting the isolated preview database:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
pnpm --filter @wordle-royale/api db:bootstrap:preview-dictionary -- --dry-run --json

APP_ENV=preview \
PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM=APPLY_EN_5_TEST_VFIXTURE_001_TO_PREVIEW \
pnpm --filter @wordle-royale/api db:bootstrap:preview-dictionary -- --apply --json
```

The apply command requires `DATABASE_URL` to be present in the operator environment. It fails closed outside `APP_ENV=preview`, requires the exact confirmation phrase, verifies the immutable fixture identity and all 63 rows, and reports either `created` or `unchanged`. Re-running it is safe. It never prints answer words or the database URL.

Vercel deployments do **not** run this command automatically. After migrations, run the guarded command manually from a trusted operator shell with the preview `DATABASE_URL`; do not place the confirmation phrase or bootstrap command in build/start scripts.

Operational checks:

- With `STANDARD_1V1_QUEUE_ENABLED=true`, `/readyz` is unavailable until an environment-approved Standard dictionary is selectable.
- With `STANDARD_1V1_QUEUE_ENABLED=false`, the dictionary dependency is `not_checked_stub` and does not block readiness.
- Preview accepts the exact reviewed fixture exception or production-approved active content. Production explicitly rejects the fixture.
- If rollback is required before any match references the fixture, delete its words and release in one reviewed transaction. Once referenced by matches, disable the queue and retire the release rather than deleting gameplay history.

Run the disposable-schema PostgreSQL integration only against a local test database:

```bash
PREVIEW_DICTIONARY_TEST_DATABASE_URL="$DATABASE_URL" \
pnpm --filter @wordle-royale/api test:postgres:preview-dictionary
```

Before any match references the preview fixture, the reviewed rollback is:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Match"
    WHERE "dictionaryReleaseId" = 'dict_en_5_test_vfixture_001'
  ) THEN
    RAISE EXCEPTION 'preview dictionary is referenced; disable the queue and retire it instead';
  END IF;
END $$;
DELETE FROM "DictionaryWord"
WHERE "dictionaryReleaseId" = 'dict_en_5_test_vfixture_001';
DELETE FROM "DictionaryRelease"
WHERE "id" = 'dict_en_5_test_vfixture_001';
COMMIT;
SQL
```

## CI

Initial PR-check skeleton lives at `.github/workflows/pr-checks.yml`. It uses existing pnpm scaffold scripts and does not require secrets.

See `docs/ci.md` for current behavior and future expansion notes.

## Safety notes

- No production infrastructure, secrets, or paid resources are created by this scaffold.
- Do not commit production third-party word-list sources until licensing is approved.
- Do not commit `.env` or `.env.local`; use `.env.example` and `.env.local.example` as placeholders only.

## Tooling/cost policy

Prioritize open-source, free, and local-first tooling by default. Do not add paid SaaS, managed cloud resources, proprietary datasets, or subscription dependencies without explicit approval from Ashar.

If a subscription or paid service seems necessary, document:

1. why it is needed,
2. the free/open-source alternative,
3. expected monthly cost range,
4. whether it is needed now or only later.
