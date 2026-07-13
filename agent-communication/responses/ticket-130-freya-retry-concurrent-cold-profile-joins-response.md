# Ticket 130 — Retry Concurrent Cold-Profile Queue Joins Response

Agent: Freya (backend implementation)
Status: Complete with shared-worktree verification warning
Date: 2026-07-10

## Summary

Fixed the real-PostgreSQL concurrent cold-profile queue race reported by Ticket 126. Retryable Prisma/PostgreSQL serialization failures now reach the matchmaking transaction boundary instead of being translated into `rating_profile_unavailable`, and raw-query serialization failures are recognized in addition to Prisma's top-level `P2034` form.

Added both focused `P2034` regression coverage and a true PostgreSQL integration harness that creates a fresh schema, deploys all migrations, seeds local fixtures, issues two concurrent first queue joins, verifies one shared non-self match, and drops the schema afterward.

## Changes made

### Retry propagation and bounded terminal behavior

Updated `apps/api/src/matchmaking/matchmaking.service.ts`:

- Added one retryability predicate covering:
  - Prisma `P2034` transaction conflicts;
  - raw-query Prisma `P2010` wrappers with PostgreSQL SQLSTATE `40001` (serialization failure);
  - raw-query Prisma `P2010` wrappers with PostgreSQL SQLSTATE `40P01` (deadlock detected).
- `findOrCreateRatingProfile()` now rethrows retryable failures unchanged so `inTransaction()` owns retry policy.
- Preserved the existing bounded three-attempt transaction policy.
- Added a short bounded backoff between attempts to avoid immediately recreating the same collision.
- Retry exhaustion now returns an explicit `503 matchmaking_retry_exhausted` error rather than an opaque internal error.
- Unique-profile races still retain their existing `P2002` replay behavior.
- Non-retryable profile creation failures still return `rating_profile_unavailable`.

### Focused regression coverage

Updated `apps/api/test/matchmaking.test.ts`:

- Added a cold-profile test that injects `P2034` during the first profile create.
- Proves the outer transaction runs a second attempt.
- Proves the user receives a queued ticket and the authoritative Standard Glicko profile is created instead of receiving a conflict.

### Real PostgreSQL integration coverage

Added:

- `apps/api/test/matchmaking-postgres.integration.test.ts`
- `apps/api/scripts/run-matchmaking-postgres-integration.mjs`
- `test:postgres:matchmaking` in `apps/api/package.json`

The runner:

1. Requires a disposable local PostgreSQL base URL through `MATCHMAKING_TEST_DATABASE_URL` or `DATABASE_URL`.
2. Generates a unique `ticket130_<pid>_<timestamp>` schema.
3. Applies the complete Prisma migration chain.
4. Applies deterministic local fixtures.
5. Deletes only the two test users' authoritative `standard_1v1_glicko_v1` profiles to produce a genuine cold-profile start while retaining required users/dictionary data.
6. Starts the real Nest application with the real Prisma service.
7. Sends two concurrent authenticated HTTP queue joins.
8. Asserts both return `201`, both recover to `matched`, and both expose the same match ID.
9. Queries PostgreSQL to assert exactly two matched tickets, two distinct users, one Standard match, two distinct participants, and no self/duplicate match.
10. Drops the temporary schema in `finally`, including failure paths.

No unique index, server-authority rule, or hosted database was changed.

## Files changed

- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/test/matchmaking.test.ts`
- `apps/api/test/matchmaking-postgres.integration.test.ts`
- `apps/api/scripts/run-matchmaking-postgres-integration.mjs`
- `apps/api/package.json`
- `agent-communication/responses/ticket-130-freya-retry-concurrent-cold-profile-joins-response.md`
- `agent-communication/index.md`

Parallel Ticket 131 and Ticket 132 edits coexist in the worktree and were not reverted or folded into this ticket.

## Real PostgreSQL evidence

Command shape, with the local disposable database credential intentionally omitted:

```bash
MATCHMAKING_TEST_DATABASE_URL='[REDACTED]' \
  CI=true pnpm --filter @wordle-royale/api test:postgres:matchmaking
```

Successful run:

- Temporary schema: `ticket130_1407984_1783680564313`.
- Applied migrations:
  - `20260623000000_initial_schema`
  - `20260709000000_mode_aware_rating_profiles`
  - `20260710000000_standard_1v1_matchmaking`
- Applied deterministic local fixture seed `en-5-test-vfixture.001`.
- Real PostgreSQL integration test: PASS, 1/1.
- Both concurrent joins returned `201`.
- Both current-ticket reads returned `matched` with one shared match ID.
- Database assertions confirmed two matched tickets, two distinct users, one match, and two distinct participants.
- PostgreSQL logs recorded SQLSTATE `40001` during the concurrent candidate query, proving the successful run exercised a real serialization conflict and recovered.
- Temporary schema was dropped successfully after the run.

The existing local PostgreSQL role password had drifted during prior QA; it was realigned to the checked-in local Compose configuration before the successful run. No hosted credential or hosted database was touched.

## Verification

Ticket-scoped and canonical commands:

```bash
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test test/matchmaking.test.ts
MATCHMAKING_TEST_DATABASE_URL='[REDACTED]' CI=true pnpm --filter @wordle-royale/api test:postgres:matchmaking
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm --filter @wordle-royale/api db:validate
CI=true pnpm --filter @wordle-royale/api build
CI=true pnpm secret-scan
git diff --check
```

Results:

- Focused matchmaking tests — PASS, exit 0; 13/13 passed.
- Real PostgreSQL cold-profile integration — PASS, exit 0; 1/1 passed; fresh schema migrated, seeded, exercised, and dropped.
- API build/typecheck — PASS, exit 0.
- Prisma validation — PASS, exit 0.
- Secret scan — PASS, exit 0; 202 source/config files scanned.
- `git diff --check` — PASS, exit 0.
- Full API command currently reports 63 passed, 10 failed, and the PostgreSQL integration suite skipped by default. All 13 Ticket 130 matchmaking tests pass. The 10 failures are in concurrently edited Ticket 131 leaderboard/profile read-model tests (`DEFAULT_ALGORITHM_CONFIG_VERSION` runtime reference and in-progress expected-rating/history changes), not the Ticket 130 queue/retry paths. Ticket 131 had no completion response at the time of this verification, so those parallel edits were preserved rather than modified here.

## Acceptance criteria mapping

- Preserve/rethrow retryable `P2034`/serialization errors: implemented for `P2034`, SQLSTATE `40001`, and `40P01`.
- Keep bounded retries and explicit terminal errors: three attempts remain bounded; exhaustion returns explicit `503 matchmaking_retry_exhausted`.
- True PostgreSQL integration test with a fresh schema: implemented and passed.
- Both cold users succeed/recover, pair once, share one match ID, and produce no self/duplicate match: asserted through HTTP and PostgreSQL reads.
- Do not weaken unique indexes or server authority: unchanged.
- No hosted mutation: confirmed.

## Browser / accessibility notes

Not applicable. Ticket 130 is a backend concurrency and PostgreSQL integration fix with no UI changes.

## Risks / follow-ups

- The integration harness is intentionally opt-in because it creates and drops a PostgreSQL schema; the normal unit suite skips it unless `RUN_MATCHMAKING_POSTGRES_INTEGRATION=1` is set by the runner.
- Ticket 133 should rerun the real-Postgres probe after Tickets 131 and 132 complete, then rerun the canonical full suite against the settled shared worktree.
- The shared full API gate must return green after Ticket 131 finishes before Wave R checkpoint work proceeds.
