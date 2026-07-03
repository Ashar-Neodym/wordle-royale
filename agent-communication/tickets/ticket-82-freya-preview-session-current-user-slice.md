# Ticket 82 — Preview Session and Current User Slice

Assigned agent: Freya
Priority: High
Wave: L — Public-preview readiness
Dependencies: Ticket 80 strongly preferred
Parallelization: L.1 after Ticket 80; can start if Ticket 80 provides enough auth boundary
Human action needed: None unless implementation requires real OAuth/provider credentials, which are out of scope.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-wave-k-merge.md`
- Ticket 80 response/doc
- current `apps/api/src/auth/`
- current profile/history read models

Auth is currently stub/dev-oriented. Preview MVP needs a safer current-user/session boundary without committing secrets or overbuilding full auth.

## Task

Implement the smallest production-safe current-user/session slice consistent with Ticket 80.

## Deliverables

1. Keep local dev fixture users working.
2. Add explicit environment-mode behavior for dev vs preview/prod.
3. Ensure `/auth/me` and current-user-dependent profile/history endpoints cannot silently impersonate users in preview/prod.
4. If full login is deferred, return honest `not_authenticated` / preview-safe behavior.
5. Add tests for dev fixture mode, preview/prod unauthenticated behavior, and no email/private data leakage.
6. Update docs/env examples as needed without adding real secrets.

## Verification

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/contracts test
pnpm build
pnpm secret-scan
git diff --check
```

## Response path

`agent-communication/responses/ticket-82-freya-preview-session-current-user-slice-response.md`

Do not answer only in chat. Write the Markdown response file.
