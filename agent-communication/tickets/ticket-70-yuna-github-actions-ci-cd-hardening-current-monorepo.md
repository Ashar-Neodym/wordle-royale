# Ticket 70 — GitHub Actions CI/CD Hardening for Current Monorepo

Assigned agent: Yuna
Priority: High
Wave: J — GitHub checkpoint, CI, multi-page product shell
Dependencies: Can run with Ticket 69; should not push without final approval.
Parallelization: J.2.
Human action needed: None unless GitHub auth/permissions are blocked.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-58-64.md`
- `.github/workflows/pr-checks.yml`
- Ticket 69 response if available

Ashar asked whether GitHub Actions/CI/CD can be used. Yes: use GitHub Actions for CI now. CD/deployment should wait until hosting choice is explicit.

## Task

Review and harden GitHub Actions for the current app shape.

## Deliverables

1. Verify the workflow runs the correct current gates for the monorepo.
2. Ensure CI does not require Docker unless clearly documented, or add safe non-Docker checks only.
3. Include web/mobile/api/package build/test checks that are stable in CI.
4. Keep secret scan in CI.
5. Do not add paid services or deploy steps.
6. Document future CD options separately; do not deploy.

## Recommended verification

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-70-yuna-github-actions-ci-cd-hardening-current-monorepo-response.md`

Do not answer only in chat. Write the Markdown response file.
