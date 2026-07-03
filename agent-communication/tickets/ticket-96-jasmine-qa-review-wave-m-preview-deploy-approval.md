# Ticket 96 — QA Review Wave M Preview Deploy Approval

Assigned agent: Jasmine
Priority: High
Wave: M — Preview deploy-shape and checkpoint unblock
Dependencies: M.4 final QA after 95
Parallelization: M.4 final QA after 95
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

Independently verify Wave M and recommend whether Ashar should approve an actual public preview deployment in the next wave.

## Scope

1. Verify the Wave L PR/CI blocker is resolved or still clearly blocked.
2. Verify API production build/start smoke and preview deploy-shape CI.
3. Verify account/session behavior matches Ticket 89 and implementation, if any.
4. Verify web/mobile auth/session states and spoiler-safe ranked result/share flows.
5. Verify no secrets/generated artifacts and no unapproved deployment/provider setup.
6. Provide PASS/WARN/FAIL and Wave N recommendation.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @wordle-royale/api test
pnpm build
pnpm smoke:local
pnpm deps:check
pnpm secret-scan
git diff --check
git status --short --branch
```

If a PR exists, verify remote head SHA, CI run URL, mergeability, and whether `main` should be updated.

## Response path

`agent-communication/responses/ticket-96-jasmine-qa-review-wave-m-preview-deploy-approval-response.md`


Do not answer only in chat. Write the Markdown response file.
