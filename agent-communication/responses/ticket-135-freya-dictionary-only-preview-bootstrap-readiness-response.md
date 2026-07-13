# Ticket 135 — Dictionary-Only Preview Bootstrap and Operational Readiness Response

Agent: Freya (backend implementation)
Status: Implementation complete; final disposable-schema rerun awaits local command approval
Date: 2026-07-13

## Summary

Implemented the reviewed dictionary-only preview bootstrap and made Standard matchmaking readiness depend on an environment-approved dictionary release.

The bootstrap writes only the deterministic `en-5-test-vfixture.001` dictionary release and its 63 expected dictionary rows. It cannot create fixture identities, profiles, ratings, lobbies, matches, tickets, analytics, or audits. Matchmaking now checks the same shared selection policy before any first-join writes and revalidates the locked release immediately before match creation.

No hosted database, Vercel project, provider setting, or remote environment was modified.

## Bootstrap behavior

Added:

```text
pnpm --filter @wordle-royale/api db:bootstrap:preview-dictionary -- --dry-run --json
```

Apply requires all three guards:

```text
APP_ENV=preview
PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM=APPLY_EN_5_TEST_VFIXTURE_001_TO_PREVIEW
DATABASE_URL=<operator-supplied preview database>
```

The bootstrap:

- defaults to a database-free dry-run;
- validates the exact reviewed release ID, version, artifact hash, policy metadata, validation state, row IDs, checksums, and `20/40/3/63` counts before database access;
- imports Prisma only on the guarded apply path;
- writes one release plus only missing expected dictionary rows in one transaction;
- returns `created` on first apply and `unchanged` on compatible reruns;
- rejects altered release metadata, unexpected rows, altered IDs/checksums, and Prisma uniqueness races as `preview_dictionary_release_conflict`;
- prints aggregate operational metadata only;
- sanitizes unexpected database failures to `preview_dictionary_apply_failed` at the CLI boundary;
- does not print answer words, raw SQL, database URLs, or credentials.

The existing local seed now composes the same extracted deterministic dictionary plan, avoiding bootstrap/seed drift while preserving the local-only user/profile/rating seed path as a separate command.

## Environment-aware dictionary policy

Added one shared `StandardDictionaryService` used by readiness and matchmaking.

### Preview

Selection order is:

1. newest eligible production-approved active English five-letter release;
2. otherwise the exact validated preview fixture exception;
3. otherwise unavailable.

The fixture must match the reviewed release identity, artifact hash, full source metadata, declared counts, and database-side actual `answer/guess/banned` counts.

### Production

Production accepts only active, non-fixture, production-approved, validated English five-letter content with actual answer rows. It explicitly rejects the fixture release ID/version even if its status or policy flags are altered.

### Local/test

Local and test may use the exact deterministic fixture or production-approved content. Unknown environments fail closed.

Dictionary counts use database-side grouped counts rather than loading word rows into readiness or queue memory.

## Readiness behavior

`/readyz` now includes `dependencies.standardDictionary`.

- Queue enabled + valid environment-approved dictionary: `ok`.
- Queue enabled + missing/ineligible dictionary: blocking `unavailable`.
- Queue disabled: non-blocking `not_checked_stub` without querying dictionary tables.
- Database or required schema unavailable: sanitized dictionary `unavailable` without issuing a redundant selector query.
- Selector errors remain spoiler- and credential-safe.

The production-start smoke explicitly disables Standard matchmaking because its purpose is process/startup validation against a migration-only smoke schema, not preview dictionary bootstrap validation.

## Matchmaking behavior

Standard queue joins now:

1. validate the queue/mode/rated request;
2. begin the serializable transaction;
3. require an environment-approved dictionary before expiry, profile, ticket, audit, or match writes;
4. use the same selected release throughout pairing;
5. lock and revalidate that release immediately before match creation;
6. return the stable safe error when unavailable:

```json
{
  "code": "dictionary_release_unavailable",
  "message": "No approved dictionary release is available for Standard matchmaking."
}
```

This precondition is repeated in unique-constraint recovery and serializable retries. Missing-dictionary first joins, retries, and concurrent joins create no ratings, tickets, matches, rounds, participants, or audits.

The release row lock serializes eligibility changes against final match creation. If the selected release becomes ineligible within the pairing transaction, the transaction rolls back and returns the same stable 503.

## Tests added or extended

- Exact deterministic fixture plan identity/count/checksum tests.
- Plan mutation and conflict rejection tests.
- Database-free, spoiler-safe dry-run CLI test.
- Wrong-environment, missing-confirmation, and missing-database guard tests.
- Dictionary-only delegate-scope and idempotency tests.
- Existing release/word conflict tests.
- Preview/local/test/production selector policy tests.
- Actual-row-count and required-release revalidation tests.
- Readiness enabled/disabled/database/schema tests.
- Sequential, retry, and concurrent missing-dictionary queue tests with zero side effects.
- Fresh PostgreSQL migration-only integration covering:
  - unavailable readiness before bootstrap;
  - safe first joins with zero writes;
  - dictionary-only first apply and unchanged second apply;
  - exact `20/40/3/63` rows;
  - no identity/gameplay writes from bootstrap;
  - readiness transition to `ok`;
  - retirement/revalidation rollback;
  - one non-self exact-release match after bootstrap.

## Verification

Passed:

- `CI=true pnpm --filter @wordle-royale/api test`
  - 89 tests passed; zero failures.
- `CI=true pnpm --filter @wordle-royale/api build`
  - exit 0.
- `CI=true pnpm --filter @wordle-royale/api db:validate`
  - exit 0.
- `CI=true pnpm typecheck`
  - exit 0.
- `CI=true pnpm secret-scan`
  - exit 0; 214 source/config files scanned.
- `git diff --check`
  - exit 0.
- `CI=true pnpm smoke:api:prod-start`
  - exit 0; production build started and `/readyz` returned `status=ok` with the queue-disabled smoke configuration.
- Fresh disposable PostgreSQL schema integration
  - exit 0; 3 tests passed; migrations-only schema created and dropped.

After the successful PostgreSQL run, final review added database-side grouped counting, the release-row lock, and an explicit sequential retry assertion. Build, focused tests, the full 89-test API suite, schema validation, secret scan, and diff checks all passed afterward. A requested final disposable-schema rerun did not execute because the local command approval timed out; it was not bypassed or retried through another route.

## Files changed

- `README.md`
- `apps/api/package.json`
- `apps/api/prisma/bootstrap-preview-dictionary.ts`
- `apps/api/prisma/dictionary-fixture.ts`
- `apps/api/prisma/dictionary-fixture.test.mjs`
- `apps/api/prisma/seed-fixtures.ts`
- `apps/api/scripts/run-preview-dictionary-postgres-integration.mjs`
- `apps/api/src/app.module.ts`
- `apps/api/src/dictionary/standard-dictionary.service.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/matchmaking/matchmaking-config.ts`
- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/test/api-skeleton.test.ts`
- `apps/api/test/matchmaking.test.ts`
- `apps/api/test/preview-dictionary-postgres.integration.test.ts`
- `apps/api/test/readiness-dictionary.test.ts`
- `apps/api/test/standard-dictionary.test.ts`
- `scripts/api-prod-start-smoke.mjs`
- `agent-communication/index.md`
- `agent-communication/responses/ticket-135-freya-dictionary-only-preview-bootstrap-readiness-response.md`

## Operator notes

`README.md` now contains:

- exact migration, dry-run, guarded apply, and disposable integration commands;
- Vercel guidance explaining that bootstrap is manual and must not be added to build/start scripts;
- readiness and queue-disable behavior;
- exact pre-reference rollback SQL;
- post-reference retirement guidance.

## Risks and follow-ups

- Ticket 136 should independently rerun the final disposable PostgreSQL harness, including the post-review release-lock path.
- Hosted preview bootstrap remains a manual operator action after migrations and explicit approval.
- The deterministic fixture remains preview-only and is never production-approved.
- Local PostgreSQL and Redis were left running by the production-start smoke for reuse; `pnpm deps:down` stops them.
