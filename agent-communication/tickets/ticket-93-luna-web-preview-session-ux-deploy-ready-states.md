# Ticket 93 — Web Preview Session UX and Deploy-Ready States

Assigned agent: Luna
Priority: Medium
Wave: M — Preview deploy-shape and checkpoint unblock
Dependencies: M.2 web UX; after 89 and 92 if implemented
Parallelization: M.2 web UX; after 89 and 92 if implemented
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

Align web UX with the Ticket 89/92 Preview MVP account/session decision.

## Scope

1. If Preview MVP remains read-only/unauthenticated, make login-required panels and CTAs clear, honest, and non-broken.
2. If Ticket 92 implements a minimal session path, add the smallest matching web flow.
3. Preserve public leaderboard/lobby/profile/result browsing.
4. Keep spoiler-safe share/result UI intact.
5. Avoid fake account states, decorative over-polish, OAuth, provider setup, or local scoring authority.

## Acceptance criteria

- Current-user profile/history/play/write actions show correct auth/session states.
- Result/lobby invite/share flows still work and remain spoiler-safe.
- Responsive layout does not regress on key pages.
- Web build passes.

## Verification

```bash
pnpm --filter @wordle-royale/web build
pnpm build
pnpm secret-scan
git diff --check
```

If practical, include browser screenshots or concise manual viewport notes in the response.

## Response path

`agent-communication/responses/ticket-93-luna-web-preview-session-ux-deploy-ready-states-response.md`


Do not answer only in chat. Write the Markdown response file.
