# Ticket 46 — Mobile API Readiness Card and Expo Normalization — Response

## Summary

Implemented the mobile live API readiness foundation from Ticket 42 follow-ups.

The Expo mobile shell now has:

- a mobile-specific API readiness adapter for `/healthz` and `/readyz`;
- a compact in-app readiness card showing API base URL, env/default source, health/readiness, DB/Redis dependency status when available, and fixture/demo fallback mode;
- Expo dependency normalization verified by `expo install --check`;
- `react-native-safe-area-context` replacing deprecated core `SafeAreaView` usage.

No paid services, EAS builds, app-store setup, secrets, or push were used.

## Decisions / Recommendations

1. **Use `EXPO_PUBLIC_API_URL` for mobile LAN API configuration.**
   - Physical phones cannot use the dev machine's `localhost`.
   - The mobile adapter reads `EXPO_PUBLIC_API_URL` and falls back to `http://127.0.0.1:3001` for local/simulator-style checks.

2. **Keep the readiness card non-authoritative.**
   - The card checks API liveness/readiness and clearly labels fixture/demo fallback mode.
   - Gameplay, scoring, ratings, anti-cheat, and readiness authority remain backend-owned.

3. **Normalize small/safe Expo warnings now.**
   - Added `react-native-safe-area-context` and moved app root from core `SafeAreaView` to the safe-area-context provider/view.
   - Re-aligned installed Expo dependency state; `expo install --check` now reports dependencies are up to date.

4. **Do not duplicate web-only API client code.**
   - `apps/mobile/src/lib/api-client.ts` is intentionally small and mobile-specific.
   - Future gameplay/lobby endpoints should consume shared contracts but keep React Native transport/config concerns in the mobile app.

## Detailed Output

### Mobile API adapter

Added `apps/mobile/src/lib/api-client.ts` with:

- `getMobileApiBaseUrl()`
- `checkMobileHealth()`
- `checkMobileReadiness()`
- `getMobileApiReadinessSnapshot()`

Behavior:

- reads `EXPO_PUBLIC_API_URL`;
- normalizes trailing slashes;
- requests `/healthz` and `/readyz` with JSON `accept` headers;
- uses a short timeout;
- returns structured `connected` / `unavailable` results with request id, HTTP status, error text, and dependency payloads when present.

### Mobile readiness UI

Added `ApiReadinessCard` to the top of the mobile shell after the dashboard.

It displays:

- health status;
- readiness status;
- configured API base URL;
- whether the URL came from env or default;
- fixture/demo fallback mode on/off;
- DB and Redis dependency status when `/readyz` provides dependency details;
- fallback reason when API or readiness is unavailable.

### Safe area normalization

Changed `apps/mobile/App.tsx` from deprecated core React Native `SafeAreaView` to:

```ts
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
```

The app is now wrapped in `SafeAreaProvider`.

### Expo dependency normalization

Attempted first through Expo CLI:

```bash
pnpm --filter @wordle-royale/mobile exec expo install react@19.1.0 react-native@0.81.5 @types/react@~19.1.10 react-native-safe-area-context
```

This failed because the shared worktree `node_modules` was linked to Ruby's pnpm store while Luna's profile wanted its own store:

```text
[ERR_PNPM_UNEXPECTED_STORE] Unexpected store location
```

Recovered using the store path reported by pnpm:

```bash
pnpm --store-dir /home/ashar/.hermes/profiles/ruby/home/.local/share/pnpm/store/v11 --filter @wordle-royale/mobile add react@19.1.0 react-native@0.81.5 @types/react@~19.1.10 react-native-safe-area-context@~5.6.0
```

Then restored workspace links with the same store:

```bash
pnpm --store-dir /home/ashar/.hermes/profiles/ruby/home/.local/share/pnpm/store/v11 install --no-frozen-lockfile --config.confirmModulesPurge=false
```

Final Expo dependency check:

```bash
pnpm --filter @wordle-royale/mobile exec expo install --check
```

Output:

```text
Dependencies are up to date
```

### Expo Go smoke instructions for Ashar

If a real phone check is wanted after this ticket, run from project root:

```bash
cd /home/ashar/Desktop/hermes-projects/wordle-royale
EXPO_PUBLIC_API_URL=http://192.168.18.79:3001 pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8082
```

Then open Expo Go and scan the QR or open:

```text
exp://192.168.18.79:8082
```

Expected observations:

- Wordle Royale mobile screen opens with no red error screen.
- A **Live API readiness** card appears near the top.
- If API is unavailable from the phone, it should clearly show fixture/demo fallback mode and an unavailable/timeout reason.
- If API is reachable and ready, it should show health/readiness connected and DB/Redis status from `/readyz`.

Replace `192.168.18.79` with the current `hostname -I` LAN IP if it changes.

## Open Questions

1. Should mobile use API port `3001` as the permanent local default, or should this follow the runtime script normalization from Ticket 44 if that selects another port?
2. Should the mobile readiness card auto-refresh on an interval, or stay as a one-shot startup probe until live lobby/gameplay endpoints are added?
3. Should future phone smoke evidence require a screenshot/video, or is user-reported Expo Go observation sufficient for G.0 mobile readiness work?

## Follow-up Tickets

1. **Luna — Mobile live lobby preview using contracts**
   - Why Luna: mobile app implementation owner.
   - Task: once public lobby endpoints are stable, add a mobile read-only live lobby preview using the mobile API adapter and shared contracts.
   - Inputs/context: Ticket 46 API adapter, Ticket 47 endpoint shape, `@wordle-royale/contracts`.
   - Expected output: mobile source changes, mobile build pass, Expo Go smoke instructions/evidence.

2. **Luna/Jasmine — Expo Go phone smoke for readiness card**
   - Why: runtime visual confirmation after code landed.
   - Task: run Expo Go with `EXPO_PUBLIC_API_URL=http://<LAN-IP>:<API-PORT>` and verify the readiness card text in both fallback and live API modes.
   - Inputs/context: commands above, local API/deps from Tickets 38/39/44.
   - Expected output: short QA response with observed card state and any red-screen/runtime warnings.

3. **Elisa/Ruby — Contract guidance for mobile gameplay state**
   - Why: backend/architecture authority.
   - Task: define the minimal server-shaped state payloads mobile should render for ranked gameplay without client-side authority.
   - Inputs/context: Tickets 45/47/48.
   - Expected output: contract notes or follow-up implementation tickets.

## Files Changed

Changed/created for this ticket:

- `apps/mobile/src/lib/api-client.ts`
- `apps/mobile/src/components/screens.tsx`
- `apps/mobile/App.tsx`
- `apps/mobile/package.json`
- `apps/mobile/README.md`
- `pnpm-lock.yaml`
- `agent-communication/responses/ticket-46-mobile-api-readiness-card-and-expo-normalization-response.md`

Note: the working tree already contained uncommitted mobile shell files from earlier tickets; this ticket focused on the readiness adapter/card and Expo normalization.

## Tests / Commands Run

From `/home/ashar/Desktop/hermes-projects/wordle-royale`:

```bash
pnpm --filter @wordle-royale/mobile exec expo install react@19.1.0 react-native@0.81.5 @types/react@~19.1.10 react-native-safe-area-context
```

Exit code: 1 — blocked by pnpm store mismatch, not source failure.

```bash
pnpm --store-dir /home/ashar/.hermes/profiles/ruby/home/.local/share/pnpm/store/v11 --filter @wordle-royale/mobile add react@19.1.0 react-native@0.81.5 @types/react@~19.1.10 react-native-safe-area-context@~5.6.0
```

Exit code: 0.

```bash
pnpm --store-dir /home/ashar/.hermes/profiles/ruby/home/.local/share/pnpm/store/v11 install --no-frozen-lockfile --config.confirmModulesPurge=false
```

Exit code: 0.

```bash
pnpm --filter @wordle-royale/mobile typecheck
```

Exit code: 0.

```bash
pnpm --filter @wordle-royale/mobile exec expo install --check
```

Exit code: 0. Output: `Dependencies are up to date`.

```bash
pnpm --filter @wordle-royale/mobile build
```

Exit code: 0. Output:

```text
$ pnpm run validate
$ expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @wordle-royale/mobile exec expo config --type public
```

Exit code: 0. Public config still reports SDK `54.0.0`, platforms `ios`, `android`, `web`, and dark UI style.

```bash
pnpm secret-scan
```

Exit code: 0. Output:

```text
Secret scan passed (157 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

```bash
pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8082
```

Result: Metro started successfully and was then stopped. Output included:

```text
Starting project at /home/ashar/Desktop/hermes-projects/wordle-royale/apps/mobile
Starting Metro Bundler
› Metro waiting on exp://192.168.18.79:8082
› Web is waiting on http://localhost:8082
› Using Expo Go
```

No Expo dependency compatibility warnings appeared after normalization in this Metro startup output.

## Evidence / Result

Acceptance criteria status:

- Implement or document requested deliverables clearly: **done**.
- Mobile API client/readiness adapter: **implemented**.
- Mobile status/readiness card: **implemented**.
- Expo dependency warning normalization: **implemented and verified with `expo install --check`**.
- Deprecated core `SafeAreaView` replacement: **implemented with `react-native-safe-area-context`**.
- Relevant verification commands run: **done**.
- Blockers separated from warnings: **done below**.
- No push: **complied**.

## Risks / Blockers

### Blockers

None remaining for Ticket 46.

### Warnings / follow-ups

1. **Real phone visual smoke was not rerun after this code change.**
   - Metro startup was verified.
   - Expo Go instructions are included above for Ashar/Jasmine if phone visual evidence is required.

2. **Default API URL may not work on a physical phone.**
   - `http://127.0.0.1:3001` is only a safe local default.
   - Phone testing should set `EXPO_PUBLIC_API_URL=http://<LAN-IP>:<API-PORT>`.

3. **Local API was not required to be running for this ticket.**
   - The card is designed to show fixture/demo fallback when API readiness is unavailable.
   - Live DB/Redis readiness display should be visually verified in a follow-up with local API/deps running.

4. **pnpm store mismatch occurred during dependency update.**
   - Resolved using the existing Ruby profile pnpm store path already linked by the shared worktree.
   - This is an environment/worktree issue, not a mobile source blocker.
