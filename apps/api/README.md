# @wordle-royale/api

NestJS backend/API placeholder. Runtime service implementation belongs to follow-up tickets.

## Prisma database foundation

This package now contains the local PostgreSQL/Prisma schema foundation in `prisma/schema.prisma`.

Implemented schema areas:

- Users/profiles: `UserAccount`, `UserProfile`, consent records/scopes.
- Word library metadata: dictionary releases and per-word metadata rows for answer/guess/banned fixture/import records.
- Lobby/match/gameplay: lobbies, matches, rounds, participants, guess attempts, score breakdowns, and match reports.
- Rating/leaderboard: rating profiles, rating events, leaderboard snapshots, and void/reversal support fields.
- Analytics/audit basics: `AnalyticsEvent` and `AuditLog`.

Local validation commands:

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api db:validate
```

`db:validate` uses a local placeholder `DATABASE_URL` only for Prisma schema validation and does not connect to a database. Do not commit real `.env` files or production credentials.

A deterministic initial SQL migration was generated with `prisma migrate diff --from-empty --to-schema-datamodel`; it has not been applied to any live database in this ticket.
