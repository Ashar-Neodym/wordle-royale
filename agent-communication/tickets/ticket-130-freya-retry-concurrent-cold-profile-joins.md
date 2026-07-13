# Ticket 130 — Retry Concurrent Cold-Profile Queue Joins

Agent: Freya (backend implementation)
Wave: R-Fix — Ticket 126 blocker remediation
Status: New

## Blocker

Real PostgreSQL QA produced one `201 queued` and one `409 rating_profile_unavailable` for two concurrent first joins. Prisma `P2034` is masked inside `findOrCreateRatingProfile()` before the outer Serializable retry can handle it.

## Requirements

- Preserve/rethrow retryable `P2034`/serialization errors to the transaction boundary.
- Keep bounded retries and explicit terminal errors.
- Add a true PostgreSQL integration test using a fresh schema and two concurrent cold-profile joins.
- Assert both legitimate users succeed/recover, pair once, share one match ID, and produce no self/duplicate match.
- Do not weaken unique indexes or server authority.
- No hosted mutation.

## Verification

```bash
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm --filter @wordle-royale/api db:validate
CI=true pnpm --filter @wordle-royale/api build
CI=true pnpm secret-scan
git diff --check
```

Record the real-Postgres command/schema setup and terminal evidence in the response.
