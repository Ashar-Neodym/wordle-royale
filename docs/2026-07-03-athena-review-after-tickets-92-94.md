# Athena review after Tickets 92–94 — Wave M preview demo/session UX

Date: 2026-07-03
Owner: Athena
Scope: Verify Tickets 92, 93, and 94 before Wave M checkpoint.

## Summary

Tickets 92–94 are accepted for checkpoint.

- Ticket 92 implemented the explicit preview demo-session API path selected by Ticket 89.
- Ticket 93 wired matching web UX: explicit `Start preview demo` CTAs, no fake signed-in fixture state, and preview session cookie forwarding for server-rendered pages.
- Ticket 94 re-ran the mobile/LAN Expo path and kept physical Expo Go visual verification honestly deferred because Ashar was not available to scan/open on phone.

## Key behavior now present

- `AUTH_MODE=preview_demo_session` is an explicit mode.
- `POST /auth/preview-demo/start` starts a short-lived preview demo session.
- Session tokens are raw only in an HttpOnly cookie; server storage uses token hashes.
- Missing/invalid/expired preview sessions return `not_authenticated`.
- Preview write paths use the resolved current user instead of `x-wordle-dev-user-id` fixture fallback.
- Web pages expose explicit preview demo-session CTAs for profile/history/lobby/write flows.
- Public browsing/share/result surfaces remain available and spoiler-safe.

## Athena verification run

Commands run by Athena:

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/contracts test
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
pnpm build
pnpm smoke:api:prod-start
pnpm secret-scan
git diff --check
pnpm deps:down
```

Observed result:

- API tests passed: 41/41.
- Contracts tests passed: 18/18.
- API build passed.
- Web build passed.
- Mobile build/config validation passed.
- Full workspace build passed.
- API production-start smoke passed; built API started and `/readyz` returned `status=ok`.
- Secret scan passed: 189 source/config files scanned.
- `git diff --check` passed.
- Local Docker dependencies were stopped afterward.

## Ticket-specific notes

### Ticket 92

Accepted. Minimal preview demo-session implementation matches Ticket 89 scope. It does not implement OAuth, email/password auth, magic links, provider secrets, external services, or full production accounts.

Known limitation: the preview demo session store is in-memory and not durable across API restarts. This is acceptable for Preview MVP but must not be treated as production account auth.

### Ticket 93

Accepted. Web UX now uses explicit preview demo affordances and avoids fake current-user fixture state. Luna reported browser smoke for home/profile/lobbies, no console errors, and spoiler-safe lobby share text.

Known limitation: final deployed domain/proxy cookie behavior still needs verification once a real preview deployment exists.

### Ticket 94

Accepted with caveat. Mobile machine checks and LAN API/Metro path were verified, but physical Expo Go screen validation remains deferred because Ashar could not check a phone at the time.

Deferred physical observation should remain visible in Jasmine's Ticket 96 review.

## Remaining risks / follow-ups

- Ticket 95 must checkpoint all Wave M work into a branch/PR and verify GitHub Actions run the new API production-start smoke remotely.
- Ticket 96 must independently QA the preview demo-session behavior, web UX, deploy-shape CI, no secret/generated artifacts, and mobile physical-smoke caveat.
- Actual public preview deployment remains out of scope until Ashar approves it in a later wave.
