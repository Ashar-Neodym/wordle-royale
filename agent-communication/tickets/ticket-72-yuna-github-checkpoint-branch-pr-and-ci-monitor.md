# Ticket 72 — GitHub Checkpoint Branch/PR and CI Monitor

Assigned agent: Yuna
Priority: Critical
Wave: K — GitHub checkpoint and product depth
Dependencies: Wave J review pass
Parallelization: K.0 first; can run alongside planning tickets, but should happen before more large changes if possible.
Human action needed: Optional. If push/PR requires credentials or final approval, ask Ashar/Athena for approval and exact preference: branch PR vs direct main.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-tickets-65-71.md`
- `agent-communication/responses/ticket-69-yuna-github-checkpoint-commit-push-and-ci-plan-response.md`
- `.github/workflows/pr-checks.yml`

Ashar wants GitHub used for version tracking. Wave J is now verified pass after Athena fixed the whitespace issue.

## Task

Create a safe GitHub checkpoint for the accumulated work and monitor CI if possible.

## Deliverables

1. Inspect final `git status`, `git diff --stat`, and `.gitignore` for generated/local-only artifacts.
2. Run final checkpoint gates and secret scan.
3. Prefer creating a branch and PR, e.g. `wave-k/checkpoint-ranked-loop-shell`, unless Ashar/Athena explicitly wants direct `main` push.
4. Commit with a broad wave summary message.
5. Push the branch or main as approved.
6. If GitHub Actions starts, monitor or provide the exact run URL/status. If `gh` is unavailable, use git output and GitHub web URL guidance.
7. If push is blocked, write exact blocker and exact commands for Athena/Ashar.

## Recommended verification

```bash
git status --short --branch
git diff --check
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @wordle-royale/api test
pnpm build
pnpm smoke:local
pnpm secret-scan
pnpm deps:check
git diff --stat
```

## Response path

`agent-communication/responses/ticket-72-yuna-github-checkpoint-branch-pr-and-ci-monitor-response.md`

Do not answer only in chat. Write the Markdown response file.
