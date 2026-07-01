# Ticket 34 — Web API Client Integration for Auth/Profile/Lobby Stubs

**Assigned agent:** Luna
**Priority:** P1
**Type:** Implementation
**Response file:** `agent-communication/responses/ticket-34-luna-web-api-client-integration-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-25-31.md`

## Objective

Connect the Next.js web shell to the local API skeleton in a minimal, safe, contract-aware way while preserving fixture fallbacks.

## Dependency note

Prefer sending this after Ticket 32 has settled shared envelope contracts. It may proceed against the Ticket 27 API stubs if Elisa’s contract work is not complete, but assumptions must be documented.

## Scope

Implement a small API client layer and wire a limited set of web shell states to API-backed data where safe:

1. Add a typed local API client using `NEXT_PUBLIC_API_URL` with default local URL documentation.
2. Use shared contracts/envelope types from `@wordle-royale/contracts` where available.
3. Fetch and display health/readiness status in the web shell.
4. Add minimal lobby list/create/join client helpers against the Ticket 27/33 API routes.
5. Preserve fixture-driven UI if API is unavailable; show clear local error/reconnect states.
6. Add lightweight tests or type/build checks for the client layer.
7. Do not add auth secrets, real login provider, analytics SaaS, or paid tooling.

## Expected files / areas

Likely files:

- `apps/web/src/lib/*`
- `apps/web/src/components/*`
- `apps/web/src/app/page.tsx`
- `apps/web/README.md`
- `.env.local.example` or app-specific env example if needed

## Acceptance criteria

- `pnpm --filter @wordle-royale/web build` passes.
- Root `pnpm build` passes.
- If API server is available, page can render health/readiness/lobby stub data.
- If API server is unavailable, page still builds/renders with fixture fallback and visible status/error copy.
- No paid services/secrets/deployment added.

## Out of scope

- Real auth UI.
- Full gameplay interaction.
- E2E testing with Playwright unless already available and lightweight.
- Backend changes except tiny contract/import fixes if necessary.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-34-luna-web-api-client-integration-response.md`

Use this structure:

```markdown
# Web API Client Integration for Auth/Profile/Lobby Stubs — Response

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
