# Ticket 84 — Web Preview Polish: Result Actions, Invite/Share, and Auth-Aware Empty States

Assigned agent: Luna
Priority: High
Wave: L — Public-preview readiness
Dependencies: Tickets 80, 82, and 83 preferred; can begin with fallback contracts if those responses are not ready
Parallelization: L.2 after backend/session/result direction
Human action needed: Optional visual review by Ashar.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-wave-k-merge.md`
- `docs/2026-06-30-lichess-style-web-ui-direction.md`
- Ticket 80 response/doc
- Ticket 82 response if available
- Ticket 83 response if available

The web app has real pages. Wave L should make the player loop feel coherent and preview-safe.

## Task

Polish the web surfaces around preview auth state, post-match result actions, lobby invite/share, and honest empty states.

## Deliverables

1. Match detail/result page should expose clear CTAs: play again/rematch, go to lobby/play, profile/history, share summary if supported.
2. Profile/history pages should handle unauthenticated or preview-limited auth state honestly.
3. Lobby page should expose invite/share copy affordance where safe.
4. Maintain lichess-like human style, not glossy dashboard UI.
5. Preserve responsive bounds and keyboard navigation.
6. Do not fake production login/account settings.

## Verification

```bash
pnpm --filter @wordle-royale/web typecheck
pnpm --filter @wordle-royale/web build
pnpm build
pnpm secret-scan
git diff --check
```

## Response path

`agent-communication/responses/ticket-84-luna-web-preview-polish-result-actions-invite-share-auth-states-response.md`

Do not answer only in chat. Write the Markdown response file.
