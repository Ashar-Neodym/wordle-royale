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

The shell includes a non-authoritative API readiness card that probes `/healthz` and `/readyz` and clearly labels fixture/demo fallback mode. For physical-device Expo Go testing, point the app at your machine's LAN API URL rather than `localhost`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.18.79:3001 pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8082
```

Replace `192.168.18.79` with the LAN IP from `hostname -I` and `3001` with the local API port in use. If `EXPO_PUBLIC_API_URL` is omitted, the app defaults to `http://127.0.0.1:3001`, which is useful for local web/simulator-style checks but usually not for a separate phone.
