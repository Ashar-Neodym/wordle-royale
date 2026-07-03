# Ticket 63 — Mobile Expo Go Live Preview Confirmation Response

Task: Confirm the mobile live preview on a real device if possible, otherwise improve fallback/build evidence.
Agent: Luna (coder)
Status: Completed — build/config/live adapter evidence passed, and real-phone Expo Go confirmation was completed by Ashar.

## Summary

No source-code changes were needed for Ticket 63. I verified the current mobile app build/config path, exercised the mobile live-preview adapter against a local API using the machine LAN URL intended for Expo Go devices, then restarted Metro for Expo Go and collected Ashar's phone observations.

The mobile app is still aligned with the lichess-style direction from Ticket 56:

- small `wr` mark instead of a flashy crown;
- flat dark game-site surfaces;
- read-only live preview;
- clearly labeled fixture fallback;
- no mobile guessing/scoring/timer/rating authority.

Real-phone confirmation was completed after a follow-up run: Metro started on `exp://192.168.18.79:8083`, bundled the Android app successfully, and Ashar confirmed the app opened on the phone without a red-screen/runtime error.

## Files Changed

Changed for this ticket:

- `agent-communication/responses/ticket-63-luna-mobile-expo-go-live-preview-confirmation-response.md`

No mobile source files were changed.

## Commands Run

Working directory unless noted:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

### Mobile build/config checks

```bash
pnpm --filter @wordle-royale/mobile typecheck
```

Exit code: 0

```text
$ tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @wordle-royale/mobile build
```

Exit code: 0

```text
$ pnpm run validate
$ expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @wordle-royale/mobile exec expo config --type public
```

Exit code: 0

Key output:

```text
name: 'Wordle Royale'
slug: 'wordle-royale'
scheme: 'wordleroyale'
sdkVersion: '54.0.0'
platforms: [ 'ios', 'android', 'web' ]
userInterfaceStyle: 'dark'
```

```bash
pnpm --filter @wordle-royale/mobile exec expo install --check
```

Exit code: 0

```text
Dependencies are up to date
```

```bash
pnpm secret-scan
```

Exit code: 0

```text
Secret scan passed (168 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

### Local dependency / ranked DB setup

Initial command:

```bash
pnpm deps:check && pnpm deps:up && pnpm ranked:smoke:reset
```

Exit code: 1

Failure:

```text
unknown shorthand flag: 'T' in -T
Refusing ranked smoke reset: local Compose PostgreSQL did not become ready within 20 seconds.
```

Root cause/workaround for this environment: the direct `docker compose exec -T ...` calls need `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker`, matching the repo's Docker wrapper behavior.

Verification of Compose health:

```bash
pnpm deps:verify
```

Exit code: 0

Key output:

```text
Local dependency verification passed: PostgreSQL and Redis are healthy and accepting connections.
```

Successful reset with Docker config:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:up && \
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm ranked:smoke:reset
```

Exit code: 0

Key output:

```text
/var/run/postgresql:5432 - accepting connections
Prisma schema loaded from prisma/schema.prisma
The database is now in sync with your Prisma schema.
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
```

### LAN API readiness for mobile

Detected LAN IP:

```bash
hostname -I | awk '{print $1}'
```

Exit code: 0

```text
192.168.18.79
```

Started API on port `3063` and checked readiness through both localhost and LAN URL.

Local readiness:

```bash
curl -fsS http://127.0.0.1:3063/readyz
```

Exit code: 0

Parsed result:

```text
ok ok ok
```

LAN readiness:

```bash
curl -fsS --max-time 5 http://192.168.18.79:3063/readyz
```

Exit code: 0

Parsed result:

```text
ok ok ok
```

### Mobile live-preview adapter smoke against LAN API

Command run from `apps/mobile`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.18.79:3063 \
  pnpm --filter @wordle-royale/mobile exec tsx -e "import { getMobileApiReadinessSnapshot } from './src/lib/api-client.ts'; ..."
```

Exit code: 0

Output:

```json
{
  "apiUrl": "http://192.168.18.79:3063",
  "source": "env",
  "health": "connected",
  "ready": "connected",
  "database": "ok",
  "redis": "ok",
  "lobbies": "connected",
  "lobbyCount": 0,
  "leaderboard": "connected",
  "leaderboardEntries": 2,
  "profile": "connected",
  "profileHandle": "ashar",
  "profileRating": 1200
}
```

Interpretation:

- The LAN URL works from this machine and should be the correct API base URL for a phone on the same network.
- The mobile adapter connects to health/readiness/lobbies/leaderboard/profile.
- `leaderboardEntries: 2` and `profileHandle: ashar` mean the live preview card has real live data to render, not only fixture fallback, when the phone can reach the API.

## Expo Go / Real-Phone Step

Follow-up run started Metro for Expo Go:

```bash
EXPO_PUBLIC_API_URL=http://192.168.18.79:3063 \
  pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8083
```

Metro evidence:

```text
› Metro waiting on exp://192.168.18.79:8083
› Using Expo Go
Android Bundled 17919ms apps/mobile/index.ts (724 modules)
```

Ashar opened the app in Expo Go and confirmed:

- no red-screen/runtime error;
- Wordle Royale opened with the dark `wr` UI;
- API card showed the LAN URL / server-ready path;
- readiness badges appeared OK (`health` / `ready`); Ashar marked this as "I think so";
- live preview showed Ashar/profile or leaderboard live data; Ashar marked this as "I think so".

Interpretation: real-phone Expo Go confirmation is complete for this ticket. The two readiness/live-preview visual confirmations were user-observed rather than machine-inspected screenshots, but they matched the expected screen state while Metro and the LAN API were live.

## Cleanup

Stopped the Expo Metro process and the local API process, then ran:

```bash
DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker pnpm deps:down
```

Exit code: 0

Verified no tracked background processes remained.

## Risks / Blockers

### Blockers

- None for Ticket 63.

### Warnings / follow-ups

1. The mobile adapter evidence is stronger than Ticket 56: LAN URL live-preview endpoints returned connected, with leaderboard/profile data available.
2. Real-phone evidence depends on Ashar's visual confirmation in Expo Go; no phone screenshot was captured by the agent.
3. `pnpm ranked:smoke:reset` can fail in this Hermes shell unless `DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker` is exported/prefixed. This appears environment-specific rather than a mobile app issue.
