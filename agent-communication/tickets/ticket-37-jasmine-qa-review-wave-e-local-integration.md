# Ticket 37 — QA Review Gates for Wave E Local Integration

**Assigned agent:** Jasmine
**Priority:** P0
**Type:** QA / verification
**Response file:** `agent-communication/responses/ticket-37-jasmine-qa-review-wave-e-local-integration-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-25-31.md`

## Objective

Independently verify Wave E after Tickets 32–36 are completed.

## Dependency note

Send this only after response files for Tickets 32–36 exist. If sent early, produce gate definitions only and say final approval is pending.

## Scope

Review and verify:

1. REST/envelope contract decisions and exports.
2. API profile/lobby persistence/readiness behavior.
3. Web API client behavior and fixture fallback.
4. Docker Compose/local dependency verification or documented blocker.
5. Safe seed/fixture bridge and no proprietary dictionary content.
6. Free/open-source policy compliance.
7. Secret/env safety.
8. Root and package quality gates.

## Suggested commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local
pnpm secret-scan
pnpm --filter @wordle-royale/contracts test
pnpm --filter @wordle-royale/contracts build
pnpm --filter @wordle-royale/api db:validate
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
```

If Docker Compose is available, also verify the documented compose commands from Ticket 35.

## Acceptance criteria

- Provides pass/fail matrix by ticket 32–36.
- Runs exact verification commands where possible.
- Flags blockers vs follow-up warnings.
- Confirms whether root `pnpm build`, tests, smoke, and secret scan pass.
- Confirms no obvious secrets, paid service SDKs/configs, or proprietary dictionary datasets were added.
- Recommends whether Athena should commit/push the wave.

## Out of scope

- Implementing fixes unless tiny and clearly documented.
- Pushing to GitHub.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-37-jasmine-qa-review-wave-e-local-integration-response.md`

Use this structure:

```markdown
# QA Review Gates for Wave E Local Integration — Response

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
