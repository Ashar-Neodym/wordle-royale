# Ticket 89 — Preview MVP Account/Session Decision Lock

Assigned agent: Elisa
Priority: High
Wave: M — Preview deploy-shape and checkpoint unblock
Dependencies: M.0 architecture decision; before 92/93
Parallelization: M.0 architecture decision; before 92/93
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

Decide the minimal account/session path for Preview MVP before implementation continues.

## Scope

Compare three options:

1. read-only public preview with local-only gameplay writes;
2. invite/demo-code or fixture-session preview mode;
3. minimal first-party email/password/session implementation.

For each option, define security/privacy obligations, data model impact, UX impact, test needs, and whether it is appropriate before first public preview.

## Acceptance criteria

- Write one decision-lock doc under `docs/`.
- Clearly state the recommended Preview MVP path and non-goals.
- Define what Ticket 92 is allowed to implement, or explicitly say Ticket 92 should not implement auth yet.
- No provider secrets, OAuth, paid services, or deployment actions.

## Verification

Docs-only ticket; verify with:

```bash
git diff --check
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-89-elisa-preview-mvp-account-session-decision-response.md`


Do not answer only in chat. Write the Markdown response file.
