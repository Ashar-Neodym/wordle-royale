# Ticket 90 — API Production Build/Start Shape and Smoke

Assigned agent: Freya
Priority: High
Wave: M — Preview deploy-shape and checkpoint unblock
Dependencies: M.1 deploy-shape implementation; can run after 88, before 91
Parallelization: M.1 deploy-shape implementation; can run after 88, before 91
Human action needed: None unless the ticket explicitly identifies an approval gate.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-03-athena-review-after-ticket-87.md`
- `agent-communication/index.md`
- relevant Wave L responses in `agent-communication/responses/`

Persistent constraints:

- Prefer free/open-source/local-first tooling.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets or create real `.env` files.
- Do not deploy, create external services, or configure production secrets without explicit Ashar approval.
- Preserve spoiler safety and server authority for gameplay/rating logic.

## Task

Make the API preview-deploy shaped without deploying it: add a real production build/start path and a local smoke that proves the built API can boot against local dependencies.

## Scope

1. Update `apps/api` scripts so `build` emits runnable output and `start` runs the built API.
2. Keep typecheck available as a separate or included gate.
3. Add or update a smoke script that builds the API, starts it on a free local port with local env, checks `/readyz`, then terminates cleanly.
4. Do not deploy, provision external DB/Redis, or add secrets.
5. Preserve existing dev/test workflows.

## Acceptance criteria

- `pnpm --filter @wordle-royale/api build` produces runnable dist output.
- `pnpm --filter @wordle-royale/api start` works against local env after build.
- A repeatable API production-start smoke command exists and passes locally.
- Existing API tests still pass.

## Verification

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
# run the new API prod-start smoke command
pnpm build
pnpm secret-scan
git diff --check
```

## Response path

`agent-communication/responses/ticket-90-freya-api-production-build-start-smoke-response.md`


Do not answer only in chat. Write the Markdown response file.
