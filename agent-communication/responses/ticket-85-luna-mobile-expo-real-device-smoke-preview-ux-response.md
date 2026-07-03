# Ticket 85 — Mobile Expo Real-Device Smoke Closure and Preview UX Polish Response

Task: Mobile Expo Real-Device Smoke Closure and Preview UX Polish
Agent: Luna
Status: Complete with caveat: physical Expo Go smoke deferred

## Summary

I closed the repeatable local/LAN Expo Go smoke path as far as this agent session can verify without a physical phone observation.

What changed:

- Added durable physical-device Expo Go smoke instructions to `apps/mobile/README.md`:
  - dependency/API startup;
  - localhost and LAN readiness checks;
  - Expo Go LAN startup command;
  - expected `exp://<LAN-IP>:8087` Metro output;
  - exact phone visual checklist;
  - fixture/demo fallback expectations.
- Verified the API readiness card path against a real local API over the LAN IP.
- Verified the same mobile API adapter used by the Expo app can reach the LAN API and reports live readiness/profile/leaderboard data.
- Started Metro in LAN mode and confirmed it emitted a QR/Expo URL.
- Asked Ashar for in-session phone observation; no response arrived within the tool timeout, so physical Expo Go smoke remains explicitly deferred.

No React Native layout code changes were needed from machine-verifiable evidence. Existing Ticket 77 mobile bounds protections remain in place.

## Files changed

- `apps/mobile/README.md`
- `agent-communication/responses/ticket-85-luna-mobile-expo-real-device-smoke-preview-ux-response.md`

## Smoke setup used

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

LAN IP detected:

```text
192.168.18.79
```

Local API port:

```text
3063
```

Metro port:

```text
8087
```

Local dependencies/API:

```bash
pnpm deps:up
pnpm ranked:smoke:reset
LOCAL_DATABASE_PASSWORD=wordle_local_password
LOCAL_DATABASE_URL="postgresql://wordle:${LOCAL_DATABASE_PASSWORD}@localhost:5432/wordle_royale_local?schema=public"
PORT=3063 DATABASE_URL="$LOCAL_DATABASE_URL" pnpm --filter @wordle-royale/api dev

```

API readiness evidence:

- `curl -fsS http://127.0.0.1:3063/readyz` — exit `0`; returned `status: ok`, database `ok`, Redis `ok`.
- `curl -fsS --max-time 5 http://192.168.18.79:3063/readyz` — exit `0`; returned `status: ok`, database `ok`, Redis `ok`.
- `curl -fsS --max-time 5 http://192.168.18.79:3063/leaderboard?limit=3` — exit `0`; returned `2` seeded leaderboard entries.
- `curl -fsS --max-time 5 http://192.168.18.79:3063/profiles/ashar/rating` — exit `0`; returned handle `ashar`, rating `1200`.

Mobile API adapter evidence:

```json
{
  "apiUrl": "http://192.168.18.79:3063",
  "source": "env",
  "health": "connected:200",
  "readiness": "connected:200",
  "db": { "status": "ok" },
  "redis": { "status": "ok" },
  "lobbies": { "status": "connected", "count": 0 },
  "leaderboard": { "status": "connected", "count": 2 },
  "profile": { "status": "connected", "handle": "ashar", "rating": 1200 }
}
```

Metro command used:

```bash
EXPO_PUBLIC_API_URL=http://192.168.18.79:3063 \
  pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8087
```

Metro evidence:

```text
Starting project at /home/ashar/Desktop/hermes-projects/wordle-royale/apps/mobile
Starting Metro Bundler
› Metro waiting on exp://192.168.18.79:8087
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
› Web is waiting on http://localhost:8087
› Using Expo Go
```

## Physical Expo Go status

`physical Expo Go smoke deferred`

Reason:

- The agent session can start Metro and verify LAN/API/adapter behavior, but it cannot physically scan Expo Go or see a real phone screen.
- I prompted Ashar to scan `exp://192.168.18.79:8087` and check the visible UI; no response arrived within the 10-minute tool timeout.
- Therefore I am not claiming real-device visual confirmation.

## Exact next-step instructions for Ashar

From the repo root:

```bash
cd /home/ashar/Desktop/hermes-projects/wordle-royale
pnpm deps:up
pnpm ranked:smoke:reset
```

Terminal 1 — start API:

```bash
LOCAL_DATABASE_PASSWORD=wordle_local_password
LOCAL_DATABASE_URL="postgresql://wordle:${LOCAL_DATABASE_PASSWORD}@localhost:5432/wordle_royale_local?schema=public"
PORT=3063 DATABASE_URL="$LOCAL_DATABASE_URL" pnpm --filter @wordle-royale/api dev

```

Terminal 2 — verify LAN API and start Expo:

```bash
LAN_IP=$(hostname -I | awk '{print $1}')
curl -fsS "http://127.0.0.1:3063/readyz"
curl -fsS --max-time 5 "http://$LAN_IP:3063/readyz"

EXPO_PUBLIC_API_URL="http://$LAN_IP:3063" \
  pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8087
```

Expected Metro behavior:

```text
› Metro waiting on exp://<LAN-IP>:8087
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
```

Phone checklist to report back:

- no red-screen runtime error;
- `wr Wordle Royale` header fits without clipping;
- `Play`, `Lobbies`, `Ratings`, `Menu` nav chips wrap and remain tappable;
- tapping `Menu` shows `Profile`, `History`, `Rules`, `Settings`, `Server` without horizontal overflow;
- board tiles are centered and fully visible;
- keyboard rows do not extend off-screen;
- lobby/rating/profile cards and long API URL text stay inside cards;
- `Lobbies` or `Menu > Server` API card shows the LAN URL, not `localhost`;
- with the API running, API card shows `health: ok`, `ready: ok`, and `fixture/demo: off`;
- if the API is stopped or unreachable from the phone, fixture/demo fallback is clearly labeled and honest.

Useful screenshots/notes to return:

1. `Play` screen full height around board/keyboard.
2. `Lobbies` screen showing the API readiness card.
3. `Menu` expanded, plus `Menu > Server` if different.
4. Phone model/screen size and whether any text/card/nav item clipped.
5. Any red-screen error text, if one appears.

Cleanup after the smoke:

```bash
# stop Expo/API with Ctrl+C in their terminals, then:
pnpm deps:down
```

## Verification

Commands run:

```bash
pnpm --filter @wordle-royale/mobile typecheck
pnpm deps:up
pnpm ranked:smoke:reset
curl -fsS http://127.0.0.1:3063/readyz
curl -fsS --max-time 5 http://192.168.18.79:3063/readyz
EXPO_PUBLIC_API_URL=http://192.168.18.79:3063 pnpm exec tsx -e "...getMobileApiReadinessSnapshot..."
EXPO_PUBLIC_API_URL=http://192.168.18.79:3063 pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8087
pnpm --filter @wordle-royale/mobile build
pnpm --filter @wordle-royale/mobile exec expo config --type public
pnpm --filter @wordle-royale/mobile exec expo install --check
pnpm build
pnpm secret-scan
git diff --check
pnpm deps:down
ss -ltnp | grep -E ':(3063|8087)\\b' || true
```

Results:

- `pnpm --filter @wordle-royale/mobile typecheck` — exit `0`.
- `pnpm deps:up` — exit `0`.
- `pnpm ranked:smoke:reset` — exit `0`; local schema reset, Prisma `db push`, and fixture seed completed.
- Local/LAN readiness curls — exit `0`; health/readiness/database/Redis all `ok` after corrected local DB password.
- Mobile adapter LAN smoke — exit `0`; connected to health/readiness/lobbies/leaderboard/profile endpoints.
- Expo Metro LAN startup — succeeded; emitted `exp://192.168.18.79:8087`.
- `pnpm --filter @wordle-royale/mobile build` — exit `0`.
- `pnpm --filter @wordle-royale/mobile exec expo config --type public` — exit `0`; confirmed name `Wordle Royale`, orientation `portrait`, dark UI, Android edge-to-edge enabled.
- `pnpm --filter @wordle-royale/mobile exec expo install --check` — exit `0`; dependencies are up to date.
- `pnpm build` — exit `0`; packages, mobile, web, and API builds passed.
- `pnpm secret-scan` — exit `0`; `Secret scan passed (185 source/config files scanned).`
- `git diff --check` — exit `0`.
- `pnpm deps:down` — exit `0`.
- `ss -ltnp | grep -E ':(3063|8087)\\b' || true` — exit `0`; no API/Metro ports remained listening.
- `process list` — no tracked background processes remained.

## Risks / follow-ups

- Physical real-device Expo Go visual confirmation remains deferred until Ashar scans the QR/open URL and reports the phone checklist.
- The seeded smoke state had no open lobby rows (`lobbies.count: 0`), but readiness/profile/leaderboard data were live and fixture fallback was off for reachable endpoints.
- The first API start used an incorrect local DB password and showed database unavailable; restarting with the Compose local password fixed readiness. The README now uses a `<local-password>` placeholder rather than a real credential.
