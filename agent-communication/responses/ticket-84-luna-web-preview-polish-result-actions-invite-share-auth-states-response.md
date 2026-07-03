# Ticket 84 — Web Preview Polish: Result Actions, Invite/Share, and Auth-Aware Empty States Response

Task: Polish the web surfaces around preview auth state, post-match result actions, lobby invite/share, and honest empty states.
Agent: Luna
Status: Complete

## Summary

Implemented the scoped Wave L web preview-polish pass.

Primary changes:

- Match detail/result route now renders post-match action UI when `GET /matches/:matchId/result` includes Ticket 83 `resultActions`:
  - play again / rematch affordance;
  - honest disabled rematch copy when backend says `not_implemented`;
  - history, leaderboard, and profile links;
  - spoiler-safe share-summary textarea generated from server-provided result action text/path.
- Profile and History current-user routes now recognize preview/session auth failures as first-class states rather than generic offline states.
- Web API client now preserves API error codes in client error messages, so UI can distinguish `not_authenticated` from network/offline failures.
- Lobby cards now expose a safe `Invite / share` disclosure with read-only invite copy containing only room code + lobby link.
- Added compact, keyboard-focusable styling for auth panels, share disclosures, and result-action cards while preserving the lichess-like dark game-site style.

No production login/account settings, OAuth, social login, local scoring authority, answer exposure, or real rematch-creation backend behavior was added.

## Files changed

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/app/matches/[matchId]/page.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/history/page.tsx`
- `apps/web/src/components/ProfileHistory.tsx`
- `apps/web/src/components/LobbyScreens.tsx`
- `apps/web/src/components/web-shell.module.css`
- `agent-communication/responses/ticket-84-luna-web-preview-polish-result-actions-invite-share-auth-states-response.md`

## Implementation details

### Match result actions

`/matches/:matchId` now reads `liveResult.resultActions` and renders:

- `Create rematch lobby` card with honest unavailable reason if `available: false`;
- `Play again` link to `resultActions.links.nextRankedHref`;
- `Share result` read-only textarea using only `resultActions.share.text` and `resultActions.share.path`;
- review links to history, leaderboard, and profile.

If a completed result loads without `resultActions`, the route shows a fallback warning and safe links rather than pretending share/rematch support exists.

### Preview auth state

Current-user profile/history routes now use `isAuthLimited(...)` to detect API errors such as:

```text
not_authenticated: Sign in is required for this action.
```

Those routes render a dedicated preview-auth panel explaining that public preview does not silently impersonate the local stub user. Public lobbies/ratings remain linked; current-player data is not faked.

### Lobby invite/share

Each lobby card now has an `Invite / share` disclosure. The read-only invite text is safe to copy because it only contains:

- room code;
- `/lobbies?code=<code>` link;
- no account data;
- no answer/hash/salt/game authority.

Example smoke value:

```text
Join my Wordle Royale room GRID22: /lobbies?code=GRID22
```

## Verification

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Final required checks:

```bash
pnpm --filter @wordle-royale/web typecheck
pnpm --filter @wordle-royale/web build
pnpm build
pnpm secret-scan
git diff --check
```

Results:

- `pnpm --filter @wordle-royale/web typecheck` — exit `0`
- `pnpm --filter @wordle-royale/web build` — exit `0`
- `pnpm build` — exit `0`
- `pnpm secret-scan` — exit `0`; `Secret scan passed (185 source/config files scanned).`
- `git diff --check` — exit `0`

Root build evidence included:

```text
apps/mobile build: Done
apps/web build: ✓ Compiled successfully
apps/api build: Done
```

Web build route evidence included:

```text
├ ƒ /history
├ ƒ /lobbies
├ ƒ /matches/[matchId]
├ ƒ /profile
├ ƒ /profile/[handle]
```

### Preview-auth adapter smoke

Started API in preview/session-required mode on `127.0.0.1:3085` and confirmed current-user auth boundary:

```bash
curl -s -w '\nHTTP %{http_code}\n' http://127.0.0.1:3085/auth/me
```

Result:

```text
{"data":null,"error":{"code":"not_authenticated","message":"Sign in is required for this action.","details":{"authMode":"session_required","appEnv":"preview"}},...}
HTTP 401
```

Then exercised the web API client directly against that API:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3085 \
  pnpm --filter @wordle-royale/web exec tsx -e "...getCurrentProfileSummary/getMatchHistory smoke..."
```

Result:

```json
{
  "profile": "not_authenticated: Sign in is required for this action.",
  "history": "not_authenticated: Sign in is required for this action.",
  "profileAuth": true,
  "historyAuth": true
}
```

### Production web smoke

Started production web server on `127.0.0.1:3084` and checked:

```text
/profile 200 spoiler_keys_absent=true
/history 200 spoiler_keys_absent=true
/lobbies 200 spoiler_keys_absent=true invite_share=true
/matches/11111111-1111-4111-8111-111111111111 200 spoiler_keys_absent=true match_unavailable=true
```

Browser smoke:

- `/lobbies` rendered the `Invite / share` disclosures.
- Opening `GRID22` share disclosure produced textareas with safe values:
  - `Join my Wordle Royale room CROWN1: /lobbies?code=CROWN1`
  - `Join my Wordle Royale room GRID22: /lobbies?code=GRID22`
- Horizontal overflow check returned `false`.
- Browser console after route checks: `0` JS errors, `0` messages.
- Visual inspection showed the lobbies page remains a calm dark game-site layout; invite/share textarea stayed inside the card without clipping.

Cleanup:

- Stopped preview API and production web smoke servers.
- Verified no tracked background processes remained.

## Risks / follow-ups

- Positive completed-match result-actions UI was typechecked/build-verified against the Ticket 83 contract, but not live-smoked with a seeded completed match containing `resultActions`; the available local smoke path used an unavailable fake match id.
- Rematch remains intentionally not implemented server-side; UI displays backend-provided disabled copy and routes players to the next ranked lobby path instead.
- Preview/session-required pages depend on deployment providing `NEXT_PUBLIC_API_URL` at build/runtime in a way Next can read for server-side fetches; direct adapter smoke verified the web client behavior against preview API mode.
- Real production login/account settings remain out of scope per Ticket 80/82.
