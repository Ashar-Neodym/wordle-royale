# Ticket 117 — Schema-Aware Readiness Check Response

Agent: Freya (backend implementation)
Status: Complete
Date: 2026-07-09

## Summary

Hardened `/readyz` so it now checks both raw database connectivity and required application-schema table availability. This closes the Wave O/P issue where a reachable database with missing migrations/tables could still report readiness as OK.

## Changes made

### API readiness

- Added `PrismaService.checkApplicationSchema()` in `apps/api/src/prisma/prisma.service.ts`.
- The schema check queries `information_schema.tables` for all required Prisma application tables in the current schema:
  - `UserAccount`
  - `UserProfile`
  - `ConsentRecord`
  - `DictionaryRelease`
  - `DictionaryWord`
  - `Lobby`
  - `Match`
  - `MatchRound`
  - `MatchParticipant`
  - `GuessAttempt`
  - `ScoreBreakdown`
  - `MatchReport`
  - `RatingProfile`
  - `RatingEvent`
  - `LeaderboardSnapshot`
  - `AnalyticsEvent`
  - `AuditLog`
- Missing required tables now return a dependency status of `unavailable` with a migration-needed message.
- Query output does not include secrets, DB URLs, or connection strings.

### `/readyz` dependency envelope

Updated `apps/api/src/health/readiness.service.ts` so `/readyz` now includes:

```ts
dependencies: {
  database,
  applicationSchema,
  redis,
}
```

Readiness status aggregation now considers `applicationSchema` alongside `database` and `redis`. Optional Redis behavior remains unchanged: `not_checked_stub` is non-blocking when Redis is not required/configured.

### Tests

Updated `apps/api/test/api-skeleton.test.ts` to cover:

- Healthy readiness includes `applicationSchema.status === 'ok'`.
- DB reachable but schema missing returns top-level `status: 'unavailable'`.
- Missing schema reports clear missing-table/migration-needed dependency detail.
- Optional Redis still keeps readiness OK when `REDIS_REQUIRED=false`-style behavior is represented by `not_checked_stub`.
- Existing `/healthz` behavior remains covered by the existing health test.

## Verification

Commands run from repo root:

```bash
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm --filter @wordle-royale/api build
CI=true pnpm smoke:api:prod-start
CI=true pnpm secret-scan
git diff --check
```

Results:

- `CI=true pnpm --filter @wordle-royale/api test` — PASS, exit 0, 49 tests passed.
- `CI=true pnpm --filter @wordle-royale/api build` — PASS, exit 0.
- `CI=true pnpm smoke:api:prod-start` — PASS, exit 0; production-mode API started locally and `/readyz` returned `status=ok`.
- `CI=true pnpm secret-scan` — PASS, exit 0; 192 source/config files scanned.
- `git diff --check` — PASS, exit 0.

## Acceptance criteria mapping

- `/readyz` still returns OK for a migrated local/preview-shaped DB: verified by prod-start smoke.
- Missing required app schema is represented as unavailable with clear migration-needed dependency status: implemented and tested.
- API tests and prod-start smoke pass: verified.
- No healthz regression: existing healthz test still passes.

## Notes / risks

- The schema readiness dependency intentionally checks table presence, not every column/index/constraint. It is lightweight and catches the missing-migration class that caused the prior preview issue without making readiness expensive.
- Prod-start smoke left local Postgres/Redis running for reuse per existing script behavior; run `pnpm deps:down` when you want to stop them.
