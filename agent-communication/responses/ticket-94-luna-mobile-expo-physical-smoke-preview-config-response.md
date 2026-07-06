# Ticket 94 — Luna Response — Mobile Expo Physical Smoke and Preview Config Closure

## Status

Complete with caveat: physical Expo Go smoke deferred by user availability.

Ashar explicitly selected: `I can’t check on phone now; mark deferred` after Metro was running and the Expo URL was available. I did not claim physical-device visual confirmation.

## Scope completed

- Re-ran mobile build/typecheck/config validation.
- Re-ran local dependencies and ranked smoke seed.
- Verified local and LAN API readiness.
- Verified the mobile API adapter against the LAN API URL used by Expo Go.
- Started Expo Metro in LAN mode and confirmed the QR/Expo URL emitted.
- Asked Ashar for phone observation while API and Metro were still running.
- Cleaned up API, Metro, and local dependencies after the user deferred phone observation.
- Confirmed the existing `apps/mobile/README.md` checklist remains accurate; no README/source changes were needed for Ticket 94.

## Files changed

- `agent-communication/responses/ticket-94-luna-mobile-expo-physical-smoke-preview-config-response.md`

No mobile source or README changes were made for this ticket.

## Environment used

- Repo: `/home/ashar/Desktop/hermes-projects/wordle-royale`
- LAN IP: `192.168.18.79`
- API port: `3095`
- Metro port: `8094`
- Expo URL emitted: `exp://192.168.18.79:8094`
- Mobile API URL used: `http://192.168.18.79:3095`

Local database/Redis connection values were used only in-process for local smoke and are not recorded here.

## Verification

### Mobile validation

```bash
pnpm --filter @wordle-royale/mobile typecheck
# exit 0

pnpm --filter @wordle-royale/mobile build
# exit 0
# runs Expo public config generation and TypeScript validation

pnpm --filter @wordle-royale/mobile exec expo config --type public
# exit 0

pnpm --filter @wordle-royale/mobile exec expo install --check
# exit 0
# Dependencies are up to date
```

### Local/LAN API readiness

```bash
pnpm deps:up
# exit 0

pnpm ranked:smoke:reset
# exit 0
```

Readiness checks:

- `curl -fsS http://127.0.0.1:3095/readyz` — exit `0`; returned API `status: ok`, database `ok`, Redis `ok`.
- `curl -fsS --max-time 5 http://192.168.18.79:3095/readyz` — exit `0`; returned API `status: ok`, database `ok`, Redis `ok`.

### Mobile adapter LAN smoke

Command shape:

```bash
EXPO_PUBLIC_API_URL="http://192.168.18.79:3095" \
  pnpm --filter @wordle-royale/mobile exec tsx -e "...getMobileApiReadinessSnapshot..."
```

Result:

```json
{
  "apiUrl": "http://192.168.18.79:3095",
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

### Expo Metro LAN startup

Command shape:

```bash
EXPO_PUBLIC_API_URL="http://192.168.18.79:3095" \
  pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8094
```

Observed Metro output:

```text
Starting project at /home/ashar/Desktop/hermes-projects/wordle-royale/apps/mobile
Starting Metro Bundler
› Metro waiting on exp://192.168.18.79:8094
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
› Web is waiting on http://localhost:8094
› Using Expo Go
```

### Physical Expo Go status

`DEFERRED`

Reason:

- I cannot scan/open Expo Go or inspect a physical phone screen from this agent session.
- I kept API and Metro running and asked Ashar to open `exp://192.168.18.79:8094` in Expo Go.
- Ashar responded: `I can’t check on phone now; mark deferred`.

Required next observation to close the caveat:

1. Phone is on the same Wi-Fi/LAN as this machine.
2. Open `exp://192.168.18.79:8094` in Expo Go while API and Metro are running.
3. Confirm:
   - no red-screen runtime error;
   - `wr Wordle Royale` header fits without clipping;
   - `Play`, `Lobbies`, `Ratings`, and `Menu` nav chips wrap/remain tappable;
   - `Menu` subnav (`Profile`, `History`, `Rules`, `Settings`, `Server`) has no horizontal overflow;
   - board tiles, keyboard rows, lobby/rating/profile cards, and long API URL stay inside the screen;
   - API card shows `http://192.168.18.79:3095`, not `localhost`;
   - API card shows health/ready connected and fixture/demo off while the API is reachable;
   - fixture/demo fallback is clearly labeled if the API is stopped or unreachable.

### Required ticket checks

```bash
pnpm secret-scan
# exit 0
# Secret scan passed (189 source/config files scanned)

git diff --check
# exit 0
```

## Cleanup

- Stopped Expo Metro.
- Stopped the API dev server.
- Ran `pnpm deps:down` — exit `0`.
- Confirmed Hermes tracked background process list is empty.
- Confirmed no listeners remained on ports `3095` or `8094`.

## Risks / follow-ups

- Physical phone visual evidence remains the only deferred item.
- No layout/config issue was machine-observable, so no mobile UI/source patch was made.
- Existing `apps/mobile/README.md` already contains the repeatable LAN API + Expo Go smoke checklist, and it still matches the flow used here.
