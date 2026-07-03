# @wordle-royale/mobile

Minimal Expo React Native shell for Wordle Royale.

## Local commands

```bash
pnpm --filter @wordle-royale/mobile dev
pnpm --filter @wordle-royale/mobile typecheck
pnpm --filter @wordle-royale/mobile build
```

`build` is a local validation/build-equivalent for this environment: it verifies Expo config generation and TypeScript compilation. It does not require EAS, cloud builds, app store setup, push notifications, or backend services.

The app is fixture-driven and imports built shared package outputs through local shims in `src/lib/`.

## Live API readiness card

The shell includes a non-authoritative API readiness card that probes `/healthz` and `/readyz` and clearly labels fixture/demo fallback mode. For physical-device Expo Go testing, point the app at your machine's LAN API URL rather than `localhost`.

1. Start the local dependencies/API from the repo root, using a local-only API port. Use the local Compose database URL from the repo's local API setup; do not commit real or shared credentials.

```bash
pnpm deps:up
pnpm ranked:smoke:reset
# Set DATABASE_URL to the local Compose Postgres database URL for wordle_royale_local.
PORT=3063 DATABASE_URL="$DATABASE_URL" pnpm --filter @wordle-royale/api dev
```

2. In another terminal, confirm the API is reachable from both localhost and the LAN address:

```bash
LAN_IP=$(hostname -I | awk '{print $1}')
curl -fsS "http://127.0.0.1:3063/readyz"
curl -fsS --max-time 5 "http://$LAN_IP:3063/readyz"
```

3. Start Expo Go with the LAN API URL:

```bash
LAN_IP=$(hostname -I | awk '{print $1}')
EXPO_PUBLIC_API_URL="http://$LAN_IP:3063" \
  pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8087
```

Expected Metro output includes `Metro waiting on exp://<LAN-IP>:8087`. Scan that QR/open the URL in Expo Go while the phone is on the same network.

Phone checklist:

- no red-screen runtime error;
- `wr Wordle Royale` header fits without clipping;
- `Play`, `Lobbies`, `Ratings`, `Menu` nav chips wrap and remain tappable;
- `Menu` subnav (`Profile`, `History`, `Rules`, `Settings`, `Server`) wraps without horizontal overflow;
- board tiles, keyboard rows, lobby/rating/profile cards, and long API URLs stay inside the screen;
- API card shows the LAN URL, `health: ok`, `ready: ok`, and `fixture/demo: off` when the API is reachable;
- if the API is stopped or the phone cannot reach the LAN URL, fixture/demo fallback is clearly labeled.

If `EXPO_PUBLIC_API_URL` is omitted, the app defaults to `http://127.0.0.1:3001`, which is useful for local web/simulator-style checks but usually not for a separate phone.
