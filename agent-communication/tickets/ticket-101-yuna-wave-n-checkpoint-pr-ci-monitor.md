# Ticket 101 — Wave N Checkpoint Branch, PR, and CI Monitor

Agent: Yuna (devops)
Wave: N — Controlled public preview setup
Status: New

## Context

Run only after Tickets 97–100 are complete or explicitly deferred by Athena.

## Task

Checkpoint Wave N work to a branch/PR and monitor CI.

## Scope

- Inspect accumulated changes from Tickets 97–100.
- Ensure no secrets, generated artifacts, provider credentials, or real `.env` files are staged.
- Run full local gates.
- Commit and push a Wave N checkpoint branch.
- Create/update a PR if GitHub auth is available; otherwise Athena will create it with the saved token.
- Monitor CI if PR exists.
- Do not merge.
- Do not deploy.

## Required local gates

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm build
CI=true pnpm smoke:api:prod-start
CI=true pnpm secret-scan
git diff --check
CI=true pnpm deps:down
```

## Response file

Write your response to:

`agent-communication/responses/ticket-101-yuna-wave-n-checkpoint-pr-ci-monitor-response.md`
