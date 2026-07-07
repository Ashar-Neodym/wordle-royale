# Ticket 100 — Luna Response — Preview Release Copy and Mobile Physical-Smoke Closure

## Status

Complete with caveat: physical Expo Go visual smoke remains deferred/blocked.

I added visible, honest public-preview copy for web and a durable release-note/checklist. I also prepared the mobile physical-smoke path and verified the LAN API/mobile adapter, but did not close the phone observation because Expo Metro startup was blocked by the command-approval timeout before the phone could be opened.

## Files changed

- `apps/web/src/components/PageFrame.tsx`
  - Added a persistent preview notice to every routed web page.
- `apps/web/src/components/web-shell.module.css`
  - Added responsive styling for the preview notice.
- `apps/web/src/app/page.tsx`
  - Updated home preview/session copy to say demo sessions are not durable accounts and may reset.
  - Renamed profile route card from local-player language to preview demo identity.
- `apps/web/src/app/profile/page.tsx`
  - Updated auth-required copy to state demo sessions are non-durable and preview data may reset.
- `apps/web/src/app/settings/page.tsx`
  - Replaced local/stub account wording with explicit preview demo/no-password/no-durable-account copy.
- `docs/2026-07-06-preview-release-copy-and-mobile-smoke.md`
  - Added a small preview release copy and mobile physical-smoke checklist note.
- `agent-communication/responses/ticket-100-luna-preview-release-copy-and-mobile-smoke-response.md`
  - This response.

## Web preview copy added

Persistent web notice now appears through `PageFrame`:

```text
Public preview — Demo sessions only — no durable accounts yet. Sessions, ratings, lobbies, match history, and demo profiles may reset. Mobile remains experimental until physical Expo Go smoke is complete.
```

Other copy updates:

- Home preview card now says an active demo session is not a durable account and may reset.
- No-session home copy says no password/email is required.
- Settings page says account settings are not production-ready and preview uses explicit demo sessions only.
- Profile auth-required copy no longer implies production account state or silent local/stub sign-in.

## Mobile physical-smoke status

Status: `DEFERRED / BLOCKED`

Evidence gathered before the blocker:

- Ashar selected that phone observation was available.
- Local dependencies and ranked smoke seed were started/reset.
- API ran on `http://127.0.0.1:3101` / `http://192.168.18.79:3101`.
- Local and LAN `/readyz` returned `ok` for API/database/Redis.
- Mobile adapter with `EXPO_PUBLIC_API_URL=http://192.168.18.79:3101` returned:

```json
{
  "apiUrl": "http://192.168.18.79:3101",
  "source": "env",
  "health": "connected:200",
  "readiness": "connected:200",
  "db": "ok",
  "redis": "ok",
  "lobbies": { "status": "connected", "count": 0 },
  "leaderboard": { "status": "connected", "count": 2 },
  "profile": { "status": "connected", "handle": "ashar", "rating": 1200 }
}
```

Blocker:

- Attempted to start Expo Metro in LAN mode on port `8100` with `EXPO_PUBLIC_API_URL=http://192.168.18.79:3101`.
- The terminal command was blocked by command-approval timeout before Metro emitted an Expo URL.
- I did not retry the blocked command, per tool safety instruction.
- Therefore physical Expo Go visual confirmation is not claimed.

Exact next steps to close later:

```bash
cd /home/ashar/Desktop/hermes-projects/wordle-royale
pnpm deps:up
pnpm ranked:smoke:reset

# Terminal 1: start the API with the repo's local Compose database URL and Redis URL.
PORT=3101 DATABASE_URL="$DATABASE_URL" REDIS_URL="$REDIS_URL" pnpm --filter @wordle-royale/api dev

# Terminal 2: verify LAN readiness, then start Expo.
LAN_IP=$(hostname -I | awk '{print $1}')
curl -fsS "http://127.0.0.1:3101/readyz"
curl -fsS --max-time 5 "http://$LAN_IP:3101/readyz"
EXPO_PUBLIC_API_URL="http://$LAN_IP:3101" \
  pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8100
```

Phone checklist remains:

- no red-screen runtime error;
- `wr Wordle Royale` header fits without clipping;
- `Play`, `Lobbies`, `Ratings`, and `Menu` nav chips wrap/remain tappable;
- `Menu` subnav has no horizontal overflow;
- board tiles, keyboard rows, cards, and long API URL stay inside the screen;
- API card shows the LAN API URL, not `localhost`;
- health/ready are connected and fixture/demo is off while API is reachable;
- fallback mode is clearly labeled if API is stopped/unreachable.

## Verification commands

```bash
pnpm --filter @wordle-royale/web typecheck
# exit 0

pnpm --filter @wordle-royale/web build
# exit 0

pnpm --filter @wordle-royale/mobile build
# exit 0

pnpm deps:up
# exit 0

pnpm ranked:smoke:reset
# exit 0

curl -fsS http://127.0.0.1:3101/readyz
# exit 0; API/database/Redis ok

curl -fsS --max-time 5 http://192.168.18.79:3101/readyz
# exit 0; API/database/Redis ok

EXPO_PUBLIC_API_URL=http://192.168.18.79:3101 pnpm --filter @wordle-royale/mobile exec tsx -e "...getMobileApiReadinessSnapshot..."
# exit 0; health/readiness/lobbies/leaderboard/profile connected

pnpm secret-scan
# exit 0; Secret scan passed (190 source/config files scanned)

git diff --check
# exit 0
```

Browser smoke:

- `http://127.0.0.1:3100/` rendered the persistent public-preview notice.
- DOM check confirmed notice text included demo sessions, reset caveat, and mobile experimental caveat.
- DOM check reported no horizontal overflow at the desktop viewport.

## Cleanup

- Stopped web dev server.
- Stopped API dev server.
- Ran `pnpm deps:down` — exit `0`.
- Confirmed no Hermes-tracked background processes remain.
- Confirmed no listeners remained on ports `3100`, `3101`, `8100`, `5432`, or `6379`.

## Risks / follow-ups

- Physical Expo Go visual smoke remains the only unclosed mobile caveat.
- No deployment, provider provisioning, external account setup, EAS, or app-store work was performed.
- Preview copy is intentionally minimal and should remain non-production/non-durable until real account/session architecture is approved.
