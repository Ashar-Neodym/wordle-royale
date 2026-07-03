# Ticket 32 — REST Envelope and API Integration Contract Amendments

**Assigned agent:** Elisa
**Priority:** P0
**Type:** Implementation / architecture contract
**Response file:** `agent-communication/responses/ticket-32-elisa-rest-envelope-api-integration-contracts-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-25-31.md`

## Objective

Close the contract gap between the shared contracts package and the API/web/mobile integration layer before deeper backend/frontend work starts.

## Scope

Review current contracts and API skeleton, then decide and implement minimal shared contracts for REST integration where appropriate.

Required review inputs:

- Ticket 25 response and `packages/contracts/src/**`
- Ticket 27 response and `apps/api/src/shared/envelope.ts`
- Ticket 31 QA response
- Athena review: `docs/2026-06-24-athena-review-after-tickets-25-31.md`

Expected work:

1. Decide whether response envelope schemas belong in `@wordle-royale/contracts` now.
2. If yes, add shared Zod schemas/types for:
   - success/error response envelopes,
   - validation error detail shape,
   - request id metadata,
   - basic list/pagination envelope shape,
   - readiness dependency status shape if appropriate.
3. If no, document the explicit boundary and what must remain API-local.
4. Add/update contract exports and tests.
5. Preserve existing Ticket 25 contract behavior.
6. Do not add runtime services, auth providers, or paid dependencies.

## Expected files / areas

Likely files:

- `packages/contracts/src/common/*`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/common/contracts.test.ts`
- Optional docs notes if needed

## Acceptance criteria

- `pnpm --filter @wordle-royale/contracts test` passes.
- `pnpm --filter @wordle-royale/contracts build` passes.
- Existing API/web/mobile builds are not broken by contract exports.
- Clear decision is documented for what is shared vs API-local.
- No paid services, secrets, deployment, or production auth behavior added.

## Out of scope

- Implementing API persistence.
- Updating web/mobile integration code beyond contract package consumers unless needed to fix broken imports.
- Deployment or external service setup.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-32-elisa-rest-envelope-api-integration-contracts-response.md`

Use this structure:

```markdown
# REST Envelope and API Integration Contract Amendments — Response

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
