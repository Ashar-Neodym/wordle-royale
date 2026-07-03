# Ticket 82 — Preview Session and Current User Slice Response

Task: Ticket 82 — Preview Session and Current User Slice
Agent: Freya (frontend)
Status: Complete

## Summary

Implemented the smallest preview-safe current-user boundary without adding OAuth, email providers, real credentials, or persistent production sessions.

The API now has an explicit environment/auth-mode resolver:

- Local/test `dev_stub` keeps fixture-user behavior working.
- Preview/production `session_required` rejects current-user-dependent routes with a shared `not_authenticated` error envelope instead of silently impersonating a fixture user.
- Dev helper routes remain gated and return `dev_helper_disabled` outside local/test dev-route mode.
- Stub register tokens are no longer emitted in preview/prod because `POST /auth/register` is guarded by the same current-user boundary until real login is implemented.

## Implementation details

- Added `CurrentUserService` as the central environment/auth-mode boundary.
- Registered auth boundary config defaults in `AppModule`:
  - `APP_ENV`
  - `AUTH_MODE`
  - `ENABLE_DEV_AUTH`
  - `ENABLE_DEV_ROUTES`
- Routed current-user behavior through the resolver for:
  - `GET /auth/me`
  - `POST /auth/register`
  - `GET /profile/me`
  - `PATCH /profile/me`
  - `GET /profiles/me/summary`
  - lobby write endpoints (`POST /lobbies`, `POST /lobbies/join-code`, `POST /lobbies/:lobbyId/join`)
  - `POST /matches/ranked/start`
  - `GET /matches/history/me`
  - `GET /matches/:matchId/state`
  - `POST /matches/:matchId/complete`
  - `POST /matches/:matchId/rounds/:roundId/guesses`
- Kept public read endpoints public:
  - lobby list/discovery
  - public profile summary by handle
  - ranked match result endpoint
- Preserved local/test fixture user switching through `x-wordle-dev-user-id`, restricted to known fixture IDs.
- Updated local env examples with explicit auth-mode/dev-route settings.
- Added preview/prod unauthenticated tests and no-stub-token assertions.

## Files changed

- `.env.example`
- `.env.local.example`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/current-user.service.ts`
- `apps/api/src/gameplay/gameplay.controller.ts`
- `apps/api/src/lobby/lobby.controller.ts`
- `apps/api/src/profile/profile.service.ts`
- `apps/api/test/api-skeleton.test.ts`
- `apps/api/test/gameplay-controller.test.ts`
- `apps/api/test/profile-history-read-model.test.ts`
- `agent-communication/responses/ticket-82-freya-preview-session-current-user-slice-response.md`

Note: the working tree also contains pre-existing Wave L/ticket files and changes from other agents/tickets; this response lists the Ticket 82 slice only.

## Verification

All requested checks passed:

```bash
pnpm --filter @wordle-royale/api test
# exit 0 — 40/40 tests passed

pnpm --filter @wordle-royale/api build
# exit 0

pnpm --filter @wordle-royale/contracts test
# exit 0 — 18/18 tests passed

pnpm build
# exit 0

pnpm secret-scan
# exit 0 — Secret scan passed (185 source/config files scanned)

git diff --check
# exit 0
```

## Browser/visual checks

Not applicable. Ticket 82 is an API/session-boundary slice only; no UI surfaces were changed.

## Accessibility notes

No UI changed. Follow-up UI auth states should surface the `not_authenticated` envelope as accessible login-required/preview-safe states.

## Risks / follow-ups

- Real login remains deferred; preview/prod current-user routes intentionally return `not_authenticated` until a real session implementation is approved.
- Lobby services still use fixture-shaped local behavior internally for local smoke tests; the controller now prevents those write paths from running in preview/prod without auth.
- Future auth work should replace `session_required` placeholder behavior with real session validation, CSRF/cookie policy, password hashing or approved auth provider, and account lifecycle flows.
- Public read endpoints were intentionally left public per Ticket 80 boundaries; review each new public endpoint for email/token/private-data leakage before preview deployment.
