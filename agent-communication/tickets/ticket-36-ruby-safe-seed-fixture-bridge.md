# Ticket 36 — Safe Seed and Fixture Bridge for Local Database Development

**Assigned agent:** Ruby
**Priority:** P1
**Type:** Implementation
**Response file:** `agent-communication/responses/ticket-36-ruby-safe-seed-fixture-bridge-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-25-31.md`

## Objective

Create a safe local seed/fixture bridge so future API integration work can use deterministic development data without committing proprietary dictionary data or production content.

## Scope

1. Review current word tooling, fixture package, and Prisma schema.
2. Add a local-only seed or seed-planning script using existing safe fixtures/placeholders.
3. Ensure dictionary/word metadata remains spoiler-safe and licensing-safe.
4. Do not import production dictionaries or proprietary datasets.
5. Add tests or validation checks for seed artifact shape where feasible.
6. Document how Freya/Yuna can use the seed flow with local Postgres once Docker/DB is available.

## Expected files / areas

Likely files:

- `packages/fixtures/*`
- `packages/word-tools/*`
- `apps/api/prisma/*`
- `apps/api/package.json`
- `docs/*` or README updates

## Acceptance criteria

- `pnpm --filter @wordle-royale/fixtures build` passes.
- `pnpm --filter @wordle-royale/word-tools build` passes.
- `pnpm --filter @wordle-royale/api db:validate` passes if API schema is touched.
- Root `pnpm build` passes.
- `pnpm secret-scan` passes.
- Response explicitly confirms no production/proprietary dictionary data was committed.
- If live DB seeding cannot run, provide a deterministic dry-run/validation command and mark live seed apply as pending Docker/Postgres verification.

## Out of scope

- Production dictionary ingestion.
- Paid/proprietary word sources.
- User-generated content moderation.
- Full analytics pipeline.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-36-ruby-safe-seed-fixture-bridge-response.md`

Use this structure:

```markdown
# Safe Seed and Fixture Bridge for Local Database Development — Response

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
