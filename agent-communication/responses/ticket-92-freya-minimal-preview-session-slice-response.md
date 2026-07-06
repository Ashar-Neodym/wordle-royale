# Ticket 92 — Minimal Preview Session Slice Response

Task: Ticket 92 — Minimal Preview Session Slice
Agent: Freya (frontend)
Status: Complete

## Summary

Implemented an explicit preview-demo session path that removes silent dev-user fallback from preview current-user flows while still giving preview users a minimal way to enter a scoped demo session.

Key behaviors:

- Added `AUTH_MODE=preview_demo_session` as an explicit current-user mode.
- Added `POST /auth/preview-demo/start` to create a short-lived preview demo session.
- Preview demo sessions are stored server-side in memory by token hash; raw session tokens are only sent in an `HttpOnly` cookie.
- Current-user endpoints and write routes resolve the preview demo user from the cookie/request instead of `x-wordle-dev-user-id`.
- Invalid, missing, or expired preview demo sessions return the shared `not_authenticated` error envelope.
- `POST /auth/register` remains blocked outside dev-stub mode; no stub access/refresh token leaks in preview-demo mode.
- Lobby writes now use the resolved current user, so preview demo lobbies are hosted by the preview demo user instead of fixture users.
- Local/test dev fixture behavior remains compatible, including the existing no-header lobby join smoke behavior.

## Files changed for Ticket 92

- `.env.example`
  - Documented `PREVIEW_DEMO_SESSION_TTL_SECONDS`.
- `.env.local.example`
  - Documented `PREVIEW_DEMO_SESSION_TTL_SECONDS`.
- `apps/api/src/app.module.ts`
  - Registered `PreviewDemoSessionService`.
  - Added default preview demo session TTL config.
- `apps/api/src/auth/current-user.service.ts`
  - Added `preview_demo_session` auth mode.
  - Added preview session request resolution.
  - Added explicit guards for dev auth and preview demo session availability.
- `apps/api/src/auth/preview-demo-session.service.ts`
  - New service for explicit preview demo session creation/resolution.
  - Creates demo user/profile rows and sets secure-ish session cookies.
- `apps/api/src/auth/auth.controller.ts`
  - Added `POST /auth/preview-demo/start`.
  - Passed request context into current-user resolution.
  - Kept register blocked when dev auth is unavailable.
- `apps/api/src/lobby/lobby.controller.ts`
  - Passed resolved current user to lobby writes.
- `apps/api/src/lobby/lobby.service.ts`
  - Made lobby host/join member creation current-user-aware while preserving local fixture fallback.
- `apps/api/src/gameplay/gameplay.controller.ts`
  - Passed request context into current-user resolution for gameplay routes.
- `apps/api/test/api-skeleton.test.ts`
  - Added preview-demo session coverage for missing session, blocked register, explicit start, cookie use, lobby host ownership, invalid token, and expiry.

## Verification

Commands run:

```text
pnpm --filter @wordle-royale/api test
```

Result:

```text
exit 0 — 41/41 tests passed
```

```text
pnpm --filter @wordle-royale/api build
```

Result:

```text
exit 0
```

```text
pnpm --filter @wordle-royale/contracts test
```

Result:

```text
exit 0 — 18/18 tests passed
```

```text
pnpm build
```

Result:

```text
exit 0
```

```text
pnpm secret-scan
```

Result:

```text
exit 0 — Secret scan passed
```

```text
pnpm --filter @wordle-royale/api smoke:prod-start
```

Result:

```text
exit 0 — built API started with NODE_ENV=production and /readyz returned status=ok
```

```text
git diff --check
```

Result:

```text
exit 0
```

```text
pnpm deps:down
```

Result:

```text
exit 0 — local postgres/redis compose services stopped/removed
```

## Browser / visual checks

Not applicable. This ticket is API/session behavior only; no user-facing UI was changed.

## Accessibility notes

No UI changed. When the web app wires this endpoint, the preview entry action should be a clearly labeled button/link and errors from `not_authenticated` should be announced accessibly.

## Risks / follow-ups

- The preview demo session store is in-memory and intentionally minimal for preview MVP; sessions reset on API restart and are not suitable as durable production auth.
- Cookie security defaults to `Secure` for production-like environments unless `COOKIE_SECURE=false` is explicitly set for local tests.
- Real account login/session persistence is still deferred per Ticket 89 decision lock.
- Repository still contains pre-existing uncommitted work from Tickets 89–91; this response only describes the Ticket 92 slice.
