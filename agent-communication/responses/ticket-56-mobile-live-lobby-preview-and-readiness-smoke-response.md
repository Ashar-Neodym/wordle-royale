# Ticket 56 — Mobile Live Lobby Preview and Readiness Smoke Response

Task: Extend the mobile app from readiness-only toward a small read-only live preview while preserving fixture fallback and lichess-style calm/game-first UI.
Agent: Luna (coder)
Status: Completed

## Summary

Implemented a mobile read-only live preview slice on top of the Ticket 46 readiness adapter.

The Expo app now:

- still shows health/readiness and fixture fallback state;
- reads `EXPO_PUBLIC_API_URL` and clearly distinguishes env/default source;
- fetches read-only live endpoints for:
  - `/lobbies`,
  - `/leaderboard`,
  - `/profiles/ashar/rating`;
- renders a new **Live preview / Fixture preview** card for rooms, leaderboard rows, or rated profile data;
- falls back to clearly labeled fixture/demo rows when live preview data is missing or unavailable;
- keeps mobile gameplay read-only and non-authoritative — no mobile guessing, scoring, timers, or rating finalization added;
- applies the Wave H calmer lichess-style direction to mobile surfaces: flatter dark panels, restrained borders, less crown/gloss styling, quieter copy.

## Files Changed

Changed for this ticket:

- `apps/mobile/App.tsx`
- `apps/mobile/src/lib/api-client.ts`
- `apps/mobile/src/components/screens.tsx`
- `apps/mobile/src/components/primitives.tsx`
- `agent-communication/responses/ticket-56-mobile-live-lobby-preview-and-readiness-smoke-response.md`

Note: these mobile files are currently untracked in the repo because this project workflow has many prior uncommitted ticket files. I scoped edits to the mobile files above plus this response file.

## Detailed Output

### Mobile API adapter

Extended `apps/mobile/src/lib/api-client.ts` with typed read-only preview calls:

- `getMobileLobbies()` → `GET /lobbies`
- `getMobileLeaderboard()` → `GET /leaderboard`
- `getMobileRatedProfile()` → `GET /profiles/ashar/rating`

`getMobileApiReadinessSnapshot()` now returns health, readiness, lobbies, leaderboard, and rated profile checks together.

### Mobile UI

Added `LivePreviewCard` in `apps/mobile/src/components/screens.tsx`.

Behavior:

- If live lobbies exist, shows up to 3 room cards.
- If live leaderboard rows exist, shows up to 3 rating rows.
- If the rated profile endpoint is connected, shows Ashar’s profile/rating card.
- If none are available, shows fixture leaderboard rows with an explicit fallback reason.

The app order is now:

1. brand row
2. home dashboard
3. API readiness card
4. live/fixture preview card
5. existing fixture/status/gameplay/report/accessibility sections

### Style direction

Updated mobile colors/radii/copy toward the Wave H direction:

- flat dark brown/charcoal background;
- simple `wr` mark instead of the large crown emblem;
- smaller borders and less rounded SaaS-like cards;
- human/game-site copy;
- fixture sections relabeled as previews/practice/demo where appropriate.

## Verification Commands Run

From `/home/ashar/Desktop/hermes-projects/wordle-royale` unless noted.

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
Secret scan passed (166 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

```bash
pnpm build
```

Exit code: 0

Key output:

```text
packages/contracts build: Done
packages/design-tokens build: Done
packages/fixtures build: Done
packages/game-engine build: Done
packages/rating-tools build: Done
packages/word-tools build: Done
apps/mobile build: Done
apps/web build: Done
apps/api build: Done
```

## Live API Smoke

Started local dependencies and reset the local ranked smoke DB:

```bash
pnpm deps:check && pnpm deps:up && pnpm ranked:smoke:reset
```

Exit code: 0

Key output:

```text
Local dependency check passed.
The PostgreSQL database "wordle_royale_local" schema "public" at "localhost:5432" was successfully reset.
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
```

Started the API on `127.0.0.1:3056`, then exercised the mobile adapter against it:

```bash
EXPO_PUBLIC_API_URL=http://127.0.0.1:3056 pnpm --filter @wordle-royale/mobile exec tsx -e "import { getMobileApiReadinessSnapshot } from './src/lib/api-client.ts'; ..."
```

Exit code: 0

Output:

```json
{
  "apiUrl": "http://127.0.0.1:3056",
  "source": "env",
  "health": "connected",
  "ready": "connected",
  "lobbies": "connected",
  "lobbyCount": 0,
  "leaderboard": "connected",
  "leaderboardEntries": 0,
  "profile": "connected",
  "profileRating": 1200,
  "profileHandle": "ashar"
}
```

Interpretation:

- Mobile adapter successfully reached readiness, lobbies, leaderboard, and rated profile endpoints.
- After reset, there were no live lobbies or finalized leaderboard rows, so the mobile UI will use the connected rated profile as live preview data and fixture rows for the empty lists.
- This satisfies the ticket’s “live lobby preview or leaderboard/rating preview” scope without adding gameplay input.

## Expo Go Instructions for Ashar

If you want a real-phone Expo Go check, run from project root:

```bash
cd /home/ashar/Desktop/hermes-projects/wordle-royale
pnpm deps:up
pnpm ranked:smoke:reset
DATABASE_URL="postgresql://wordle:<local-password-from-docker-compose>@localhost:5432/wordle_royale_local?schema=public" PORT=3056 pnpm --filter @wordle-royale/api exec tsx src/main.ts
```

In another terminal, use this LAN URL for the phone:

```bash
EXPO_PUBLIC_API_URL=http://192.168.18.79:3056 pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8082
```

Expo startup was verified locally. Output included:

```text
Starting Metro Bundler
› Metro waiting on exp://192.168.18.79:8082
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
› Web is waiting on http://localhost:8082
› Using Expo Go
```

Expected phone observations:

- Wordle Royale opens with no red error screen.
- The app uses the calmer dark game-site style with a small `wr` mark.
- The API card shows `Server ready` if the phone can reach `http://192.168.18.79:3056`.
- The live preview card shows Ashar’s rated profile (`ashar`, rating `1200`) when API is reachable.
- If the phone cannot reach the API, the card clearly says fixture/demo fallback is active.

Replace `192.168.18.79` with the current LAN IP from `hostname -I` if it changes. Physical phones cannot use `127.0.0.1` for the dev machine API.

## Cleanup

Stopped Metro, stopped the local API process, and shut down Compose dependencies:

```bash
pnpm deps:down
```

Exit code: 0

```text
Container wordle-royale-redis Removed
Container wordle-royale-postgres Removed
Network wordle-royale_default Removed
```

Verified no tracked background processes remained.

## Risks / Blockers

### Blockers

None for Ticket 56.

### Warnings / follow-ups

1. Real-phone visual verification was not completed by Ashar in this run; Metro startup and config/build checks passed, and exact Expo Go instructions are above.
2. After `ranked:smoke:reset`, live lobbies and finalized leaderboard rows are empty by design. The ticket was verified through the connected rating/profile preview path.
3. A manual attempt to create a live lobby through the local API returned HTTP 500 in this working tree. I did not broaden Ticket 56 into backend debugging because the acceptance criteria allow leaderboard/rating preview when endpoints are available, and `/profiles/ashar/rating` is available and verified.
4. The mobile app intentionally does not implement mobile guessing/gameplay yet.
