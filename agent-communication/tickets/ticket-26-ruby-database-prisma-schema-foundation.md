# Ticket 26 — Database and Prisma Schema Foundation

**Assigned agent:** Ruby  
**Priority:** P0  
**Type:** Implementation  
**Response file:** `agent-communication/responses/ticket-26-ruby-database-prisma-schema-foundation-response.md`  
**Latest context:** `docs/2026-06-23-athena-review-after-tickets-18-24.md`

## Objective

Add the first PostgreSQL/Prisma database schema foundation for Wordle Royale, aligned with Tickets 10 and 18–24.

## Scope

Implement a local schema foundation for:

1. Users/profiles: user account, public profile fields, consent records/scopes.
2. Word library metadata: dictionary version/release metadata and answer/guess/banned word metadata references or tables suitable for future imports.
3. Lobby/match/gameplay: lobby, match, round, participant, guess attempt, score breakdown, match report basics.
4. Rating/leaderboard: rating profile, rating event, void/reversal support fields.
5. Analytics/audit basics: minimal server-side analytics event table or documented placeholder if deferred.

## Expected files / areas

Likely files:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/*` only if safe/local and deterministic.
- `apps/api/package.json` dependency/script updates if Prisma is installed.
- `.env.example` / `.env.local.example` placeholders if needed.
- `apps/api/README.md` or `docs/local-development.md`.

## Acceptance criteria

- Uses Prisma with PostgreSQL provider.
- Does not require real secrets.
- Does not connect to production or paid infra.
- Dictionary version can be stored per match/round.
- Guess attempts store enough information for server-authoritative validation/audit without leaking answer in public payloads.
- Rating events support void/reversal/idempotency follow-up.
- Add `pnpm --filter @wordle-royale/api db:validate` or equivalent, and it passes.
- `pnpm install --frozen-lockfile` passes after dependency changes.
- Root `pnpm build` passes.

## Out of scope

- Running migrations against a real database if Docker Compose is unavailable.
- Backend service logic/controllers.
- Production dictionary import.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-26-ruby-database-prisma-schema-foundation-response.md`

Use this structure:

```markdown
# Database and Prisma Schema Foundation — Response

## Summary

## Decisions / Recommendations

## Detailed Output

## Open Questions

## Follow-up Tickets

## Files Changed
If no files changed, write: None.

## Tests / Commands Run
If none, write: None — planning/spec task only.

## Evidence / Result

## Risks / Blockers
```

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Prioritize open-source/free/local-first tools.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets. Do not create real `.env` files. Use `.env.example` / `.env.local.example` placeholders only.
- Preserve existing passing checks. If a check fails, include exact command/output and either fix it or explain the blocker.
- Do not push to GitHub unless explicitly asked by Athena/Ashar.
