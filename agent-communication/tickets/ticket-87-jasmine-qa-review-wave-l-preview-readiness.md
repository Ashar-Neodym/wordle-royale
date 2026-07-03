# Ticket 87 — QA Review Wave L Preview Readiness

Assigned agent: Jasmine
Priority: High
Wave: L — Public-preview readiness
Dependencies: After Tickets 80–86, or explicitly mark deferred items
Parallelization: L.4 final
Human action needed: Optional. Include Ashar mobile/visual feedback if available.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-wave-k-merge.md`
- `agent-communication/index.md`
- responses for Tickets 80–86

## Task

Independently verify Wave L preview readiness.

## Scope

1. Verify auth/account/deployment boundary is clear and no fake production auth was introduced.
2. Verify preview/session behavior is safe by environment mode.
3. Verify ranked result/rematch/share/lobby flows remain spoiler-safe.
4. Verify web preview polish and responsive bounds.
5. Verify mobile Expo status: real-device smoke pass or explicitly deferred with actionable instructions.
6. Verify no secrets/generated artifacts are present.
7. Verify local gates and GitHub PR/CI if Ticket 86 created a PR.
8. Provide PASS/WARN/FAIL and Wave M recommendation.

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

If a PR exists, verify remote head SHA, CI run, mergeability, and whether main should be updated.

## Response path

`agent-communication/responses/ticket-87-jasmine-qa-review-wave-l-preview-readiness-response.md`

Do not answer only in chat. Write the Markdown response file.
