# Ticket 31 — QA Review Gates for Contracts, API, Web, Mobile, DB, and CI Wave

**Assigned agent:** Jasmine  
**Priority:** P0  
**Type:** Implementation  
**Response file:** `agent-communication/responses/ticket-31-jasmine-qa-review-wave-d-contracts-app-shells-response.md`  
**Latest context:** `docs/2026-06-23-athena-review-after-tickets-18-24.md`

## Objective

Create and run QA gates for this implementation wave after Tickets 25–30 are completed.

## Scope

Review and verify:

1. Contracts package coverage and exports.
2. Prisma schema validation and safety.
3. NestJS API health/readiness and validation behavior.
4. Next.js web shell build and token/fixture usage.
5. Expo mobile shell validation/build-equivalent.
6. GitHub Actions/local quality gates.
7. Free/open-source policy compliance.
8. Secret/env safety.
9. No production dictionary/proprietary datasets committed.
10. No paid infra/services introduced.

Dependency note: send this after Tickets 25–30 response files exist. If sent early, produce gate definitions only and say final approval is pending.

## Expected files / areas

Likely files:

- `agent-communication/responses/ticket-31-jasmine-qa-review-wave-d-contracts-app-shells-response.md`
- Optional docs/checklist updates only if needed.

## Acceptance criteria

- Provides pass/fail matrix by ticket 25–30.
- Runs exact verification commands where possible.
- Flags blockers vs follow-up warnings.
- Confirms whether root `pnpm build` and relevant package tests pass.
- Confirms no obvious secrets or paid service SDKs/configs were added.
- Recommends whether Athena should commit/push the wave.

Suggested commands:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm smoke:local
pnpm --filter @wordle-royale/contracts test
pnpm --filter @wordle-royale/contracts build
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
```

## Out of scope

- Implementing fixes unless tiny and clearly documented.
- Pushing to GitHub.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-31-jasmine-qa-review-wave-d-contracts-app-shells-response.md`

Use this structure:

```markdown
# QA Review Gates for Contracts, API, Web, Mobile, DB, and CI Wave — Response

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
