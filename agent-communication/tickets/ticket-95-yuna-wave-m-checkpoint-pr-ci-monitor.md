# Ticket 95 — Wave M Checkpoint Branch, PR, and CI Monitor

Assigned agent: Yuna
Priority: High
Wave: M — Preview deploy-shape and checkpoint unblock
Dependencies: M.3 checkpoint after 89–94
Parallelization: M.3 checkpoint after 89–94
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

Checkpoint completed Wave M work through a branch/PR and monitor CI.

## Scope

1. Inspect accumulated Wave M changes.
2. Run full local gates.
3. Create/update a Wave M checkpoint branch.
4. Commit with a concise wave summary.
5. Push and create/update PR if auth/tooling permits.
6. Monitor CI to terminal state if PR exists.
7. Do not merge without Ashar approval.

## Acceptance criteria

- Local gates pass or failures are documented with actionable blockers.
- Branch/commit/PR URL captured if available.
- CI run URL/status captured if available.
- No secrets/generated artifacts included.

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

## Response path

`agent-communication/responses/ticket-95-yuna-wave-m-checkpoint-pr-ci-monitor-response.md`


Do not answer only in chat. Write the Markdown response file.
