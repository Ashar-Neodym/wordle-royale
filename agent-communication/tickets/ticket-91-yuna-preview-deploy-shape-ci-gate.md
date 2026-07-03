# Ticket 91 — Preview Deploy-Shape CI Gate

Assigned agent: Yuna
Priority: High
Wave: M — Preview deploy-shape and checkpoint unblock
Dependencies: M.1 ops/CI; after or alongside 90
Parallelization: M.1 ops/CI; after or alongside 90
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

Add CI coverage for preview deploy-shape readiness without deploying or using provider secrets.

## Scope

1. Read Ticket 90 output.
2. Extend GitHub Actions or workspace scripts to run an API production-start smoke if Ticket 90 provides one.
3. Keep CI free and deterministic.
4. Do not add CD jobs, cloud login actions, provider tokens, or secret-dependent steps.
5. Document any remaining deploy gaps.

## Acceptance criteria

- PR checks include deploy-shape validation appropriate for the monorepo.
- Local equivalent command passes.
- Workflow remains compatible with current Node/pnpm constraints.
- No external services/secrets required beyond local test services.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local
pnpm secret-scan
git diff --check
```

## Response path

`agent-communication/responses/ticket-91-yuna-preview-deploy-shape-ci-gate-response.md`


Do not answer only in chat. Write the Markdown response file.
