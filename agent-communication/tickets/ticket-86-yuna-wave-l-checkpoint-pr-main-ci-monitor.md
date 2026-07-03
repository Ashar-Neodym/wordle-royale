# Ticket 86 — Wave L Checkpoint PR and Main CI Monitor

Assigned agent: Yuna
Priority: High
Wave: L — Public-preview readiness
Dependencies: After Tickets 80–85 are complete or explicitly deferred
Parallelization: L.3 before final QA, after implementation work
Human action needed: Optional/required depending on GitHub auth. Do not merge without Athena/Ashar approval.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-wave-k-merge.md`
- responses for Tickets 80–85 when present
- `.github/workflows/pr-checks.yml`

Wave K established the successful PR/checkpoint pattern. Repeat it for Wave L.

## Task

Create a safe Wave L checkpoint branch/PR and monitor CI.

## Deliverables

1. Inspect `git status`, generated artifacts, and diff stat.
2. Run full local gates.
3. Create a Wave L branch, e.g. `wave-l/preview-readiness`.
4. Commit Wave L changes with a concise summary.
5. Push the branch.
6. Create PR if tooling/auth allows; otherwise provide PR creation URL.
7. Monitor GitHub Actions to terminal status if PR exists.
8. Do not merge.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @wordle-royale/api test
pnpm build
pnpm smoke:local
pnpm secret-scan
pnpm deps:check
git diff --check
git status --short --branch
```

## Response path

`agent-communication/responses/ticket-86-yuna-wave-l-checkpoint-pr-main-ci-monitor-response.md`

Do not answer only in chat. Write the Markdown response file.
