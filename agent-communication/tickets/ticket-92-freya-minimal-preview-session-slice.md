# Ticket 92 — Minimal Preview Session Slice — Conditional Implementation

Assigned agent: Freya
Priority: Medium
Wave: M — Preview deploy-shape and checkpoint unblock
Dependencies: M.2 conditional; only after Ticket 89 decision
Parallelization: M.2 conditional; only after Ticket 89 decision
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

Implement only the minimal session/account behavior explicitly approved by Ticket 89. If Ticket 89 recommends no real session yet, do not implement auth; instead document why and close with tests proving honest unauthenticated preview behavior still holds.

## Scope

Allowed only if Ticket 89 approves it:

- small first-party session model or demo-session mechanism;
- server-side validation and tests;
- no OAuth/social login;
- no email provider;
- no committed secrets;
- no fake production/stub fallback in preview/prod.

If implementing credentials, include password hashing/session-cookie/security tests and migration considerations before coding.

## Acceptance criteria

- Behavior matches Ticket 89 exactly.
- Preview/prod do not silently use local fixture users.
- Public read endpoints remain public where intended.
- Current-user/write endpoints are either authenticated or honestly `not_authenticated`.
- Tests cover local, preview, and production-like modes.

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

`agent-communication/responses/ticket-92-freya-minimal-preview-session-slice-response.md`


Do not answer only in chat. Write the Markdown response file.
