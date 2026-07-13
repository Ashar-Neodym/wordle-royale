# Ticket 131 — Ruby — Authoritative Standard Rating Read Models

## Status

Done.

## Summary

Made Standard 1v1 rating reads authoritative for the already-selected settlement configuration:

- ranked mode `standard_1v1`
- public algorithm/version `standard_1v1_glicko_v1`
- persisted settlement configuration `standard_1v1_glicko_v1`

Leaderboard, rated-profile, profile-summary, and match-history reads now select the Standard Glicko profile/event rows rather than defaulting to legacy `placement_mmr_v1` rows. Legacy rows and events remain intact and readable as history; no destructive data rewrite or migration was introduced.

## Implementation

### Explicit per-mode authority mapping

Added the shared `authoritativeRatingAlgorithmByMode` mapping:

- `standard_1v1` → `standard_1v1_glicko_v1`
- `speed_1v1` → `null`
- `classic_1v1` → `null`
- `multiplayer_lobby` → `null`

Only Standard is advertised as enabled/live. Prepared ladders return honest unrated/empty models with `algorithm: null`. Unknown mode strings are rejected with `unsupported_ranked_mode` instead of silently falling back to Standard.

### Read-model convergence

Updated:

- `GET /leaderboard`
- `GET /profiles/:handle/rating`
- profile rating lists
- current/public profile summaries
- current-user match history

Standard leaderboard/profile queries now filter on `algorithmConfigVersion = standard_1v1_glicko_v1`. If active legacy and Standard rows coexist for the same user and mode, the Standard row is authoritative.

Match history now exposes:

- `ratingAlgorithm`
- `ratingAlgorithmConfigVersion`

History loads non-voided apply events, prefers Standard events over coexisting legacy rows, derives deltas from the same effective event, and returns a null algorithm identity if participants disagree on the selected version.

### Contracts and web types

Profile rating contracts now allow:

- `standard_1v1_glicko_v1`
- retained legacy `placement_mmr_v1`
- `null` for prepared/non-live ladders

Web API types no longer hard-code only legacy placement MMR, and the leaderboard mode type now reflects the actual ranked-mode IDs returned by the API.

### Legacy-row policy

No migration or status rewrite was required. Existing active `placement_mmr_v1` rows are safely ignored for authoritative Standard reads through explicit configuration filtering. Historical events are not mutated. A future retirement migration may mark legacy rows inactive only after product policy is finalized; it must remain append-only/history-safe.

## Tests added or strengthened

- Standard reads select Glicko rows when legacy active rows coexist.
- Prepared ladders do not claim live algorithms.
- Unknown mode strings reject rather than falling back.
- Profile summary, leaderboard, and history agree on Standard rating, games played, delta, and algorithm/version.
- History ignores voided Standard events and stale legacy events.
- Shared contract validates Standard and prepared-ladder rating identities.
- Real PostgreSQL integration settles a Standard match through `GameplayPersistenceService`, then reads leaderboard, rated profile, public profile summary, and match history from the same database state.

The PostgreSQL fixture:

- requires a disposable schema whose name begins with `ticket131`;
- uses run-unique UUIDs, handles, dictionary metadata, and idempotency keys;
- scopes leaderboard assertions to fixture users;
- removes only fixture-owned rows.

## Files changed

- `apps/api/src/leaderboard/leaderboard-read.service.ts`
- `apps/api/src/profile/profile-read.service.ts`
- `apps/api/test/leaderboard-read-model.test.ts`
- `apps/api/test/leaderboard-controller.test.ts`
- `apps/api/test/profile-history-read-model.test.ts`
- `apps/api/test/standard-rating-read-integration.test.ts`
- `apps/api/package.json`
- `apps/api/README.md`
- `packages/contracts/src/gameplay/constants.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/auth/schemas.ts`
- `packages/contracts/src/common/contracts.test.ts`
- `apps/web/src/lib/api-client.ts`
- `agent-communication/responses/ticket-131-ruby-authoritative-standard-rating-read-models-response.md`

## API/data contract impact

- No new public route.
- Standard leaderboard/profile DTOs identify `standard_1v1_glicko_v1`.
- Prepared ladders expose nullable algorithm/version fields rather than false live algorithms.
- Match-history DTOs add nullable `ratingAlgorithm` and `ratingAlgorithmConfigVersion`.
- Unknown leaderboard/profile rating modes now return an explicit bad-request error.
- No Prisma schema change or migration for Ticket 131.
- No production-data operation.

## Verification

### TDD red phase

- `CI=true pnpm --filter @wordle-royale/contracts test` — exit `1` before contract implementation.
- Focused leaderboard/profile API tests — exit `1` before read-model implementation.

### Focused verification

- `node --import tsx --test test/leaderboard-read-model.test.ts test/profile-history-read-model.test.ts` — exit `0`, 11/11 passed.
- `CI=true pnpm --filter @wordle-royale/api typecheck` — exit `0`.
- `RATING_READ_INTEGRATION_DATABASE_URL=<disposable-ticket131-schema> pnpm test:rating-reads:postgres` — exit `0`, 1/1 passed against real PostgreSQL.

An independent reviewer also provisioned a separate disposable `ticket131*` schema, applied all migrations, ran the same PostgreSQL integration test successfully, and dropped the schema afterward.

### Full verification

- `CI=true pnpm --filter @wordle-royale/api test` — exit `0`, 74/74 passed. The opt-in PostgreSQL test is skipped in the generic suite and was exercised separately above.
- `CI=true pnpm --filter @wordle-royale/contracts test` — exit `0`, 19/19 passed.
- `CI=true pnpm build` — exit `0` for all workspace packages, API, web, and mobile.
- `CI=true pnpm --filter @wordle-royale/api db:validate` — exit `0`.
- `CI=true pnpm validate:workspace` — exit `0`, 9 workspace packages validated.
- `CI=true pnpm secret-scan` — exit `0`, 204 source/config files scanned.
- `/usr/bin/git diff --check` — exit `0`.
- Independent post-fix review — PASS, no blocking logic, security, spoiler, migration, or fixture-isolation findings.

## Security and data risks

Low.

- Read paths remain server-derived and do not accept client rating values, outcomes, deltas, or algorithms.
- No answer, guess, hash, salt, or dictionary-word fields were added to competitive reads.
- Voided rating events are excluded from effective history selection.
- Legacy data is preserved rather than destructively rewritten.
- PostgreSQL integration is guarded against non-disposable schemas and uses fixture-owned cleanup.
- No secrets, environment files, production data, or deployment configuration were changed.

## Follow-ups

- If product policy later retires legacy active `placement_mmr_v1` profiles, use an explicit reviewed migration/status transition; do not rewrite historical rating events.
- Activate Speed, Classic, or Multiplayer read algorithms only together with their separately approved settlement implementations.
