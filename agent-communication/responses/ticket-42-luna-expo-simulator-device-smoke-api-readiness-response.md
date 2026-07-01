# Ticket 42 — Expo Simulator Device Smoke and Mobile API Readiness Plan — Response

## Summary

Completed the Ticket 42 mobile runtime smoke path using Expo Go on Ashar's Android phone. The mobile app moved beyond config/typecheck validation: Metro started successfully over LAN, the phone connected, Android bundling completed, and Ashar reported that Expo opened the Wordle Royale mobile screen with no red error screen.

`pnpm --filter @wordle-royale/mobile build` also passes.

## Decisions / Recommendations

1. **Accept Expo Go LAN smoke as the current device evidence.**
   - The local environment has Expo CLI and Metro available, but no local Android emulator/iOS simulator tooling was detected.
   - Ashar's real-device Expo Go test provides stronger evidence than config-only validation.

2. **Keep mobile local-first and avoid EAS/app-store setup for now.**
   - No EAS cloud build, paid services, app-store setup, secrets, or push were used.
   - Current `build` remains a local validation proxy: Expo public config generation + TypeScript.

3. **Add mobile API integration later through shared contracts and a small mobile-specific API adapter.**
   - Do not copy web-only client code directly into mobile.
   - Share schemas/types from `@wordle-royale/contracts`.
   - Put React Native transport concerns in `apps/mobile/src/lib/api-client.ts` or similar.
   - Keep clients non-authoritative: mobile should submit intents and render server-shaped state; backend remains authoritative for readiness, gameplay, scoring, ratings, and anti-cheat boundaries.

4. **Prefer explicit runtime status UI on mobile before live API consumption.**
   - Add a compact API readiness/status card showing API base URL, health/readiness result, stale/offline state, and fixture fallback mode.
   - This should mirror the web direction from Ticket 40 but use mobile-specific UX and error copy.

5. **Address Expo dependency compatibility warnings in a follow-up.**
   - Expo started and bundled successfully, but CLI warned installed package versions differ from Expo SDK expectations.
   - This is not a blocker for this ticket because build and device smoke passed, but it should be normalized before deeper mobile work.

## Detailed Output

### Environment/tooling check

Detected from `/home/ashar/Desktop/hermes-projects/wordle-royale`:

```text
node=v26.3.0
pnpm=11.1.1
expo=54.0.25
adb=
emulator=
xcrun=
hostnameI=192.168.18.79 100.70.192.18 172.17.0.1 172.18.0.1 ...
```

Interpretation:

- Expo CLI is available through the mobile package.
- No `adb`, Android `emulator`, or `xcrun` simulator tooling was available in this environment.
- LAN address `192.168.18.79` was used for Expo Go.

### Expo config validation

Command:

```bash
pnpm --filter @wordle-royale/mobile exec expo config --type public
```

Result: exit 0. Public config included:

```text
name: 'Wordle Royale'
slug: 'wordle-royale'
scheme: 'wordleroyale'
sdkVersion: '54.0.0'
platforms: ['ios', 'android', 'web']
userInterfaceStyle: 'dark'
```

### Local build-equivalent validation

Command:

```bash
pnpm --filter @wordle-royale/mobile build
```

Result: exit 0.

Output:

```text
$ pnpm run validate
$ expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json
```

### Expo Go real-device smoke

Command run from project root:

```bash
pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8082
```

Metro output:

```text
Starting project at /home/ashar/Desktop/hermes-projects/wordle-royale/apps/mobile
Starting Metro Bundler
› Metro waiting on exp://192.168.18.79:8082
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
› Web is waiting on http://localhost:8082
› Using Expo Go
```

Ashar opened the app through Expo Go and reported:

```text
Expo opened successfully; I saw the Wordle Royale mobile screen; no red error screen.
```

Metro then showed Android bundling completed:

```text
Android Bundled 8032ms apps/mobile/index.ts (714 modules)
```

Metro runtime warning after load:

```text
WARN SafeAreaView has been deprecated and will be removed in a future release. Please use 'react-native-safe-area-context' instead.
```

Expo compatibility warnings before bundling:

```text
The following packages should be updated for best compatibility with the installed expo version:
  react@19.2.7 - expected version: 19.1.0
  react-native@0.81.6 - expected version: 0.81.5
  @types/react@19.2.17 - expected version: ~19.1.10
Your project may not work correctly until you install the expected versions of the packages.
```

These warnings did not prevent this device smoke from passing.

## Open Questions

1. Which local API base URL should mobile use during LAN testing?
   - Likely `http://192.168.18.79:<api-port>` for physical devices, not `localhost`.
   - Needs alignment with the API port chosen by the local dev orchestration flow.

2. Should mobile default to fixture mode until `/readyz` returns available, or should it show a hard offline/readiness screen?
   - Recommendation: fixture/demo mode can remain explicit for shell development, but ranked/gameplay paths should block when the authoritative API is unavailable.

3. Should the mobile app add `react-native-safe-area-context` now or wait for a broader Expo dependency normalization ticket?
   - Recommendation: handle it with the dependency normalization/accessibility follow-up below.

## Follow-up Tickets

1. **Luna — Mobile API readiness card + API adapter**
   - Why Luna: mobile implementation/testing ownership.
   - Task: add a mobile-specific API client adapter and readiness/status card that checks `/healthz` and `/readyz`, displays API base URL/source, and clearly distinguishes live API mode from fixture/demo mode.
   - Inputs/context: Ticket 40 web live/fallback behavior, contracts package, local API `/healthz` and `/readyz` envelopes.
   - Expected output: source changes, build/typecheck pass, Expo Go smoke instructions/evidence.

2. **Elisa/Ruby — Mobile contract consumption guidance for live gameplay**
   - Why Elisa/Ruby: architecture/backend contract authority.
   - Task: define the minimal mobile-facing contract surface for lobby list/join, readiness, match start, guess submission, and server-shaped game state without duplicating web-only code.
   - Inputs/context: `@wordle-royale/contracts`, API controllers/services, ranked gameplay persistence plan from Ticket 41.
   - Expected output: contract/API notes and any required follow-up contract tickets.

3. **Luna — Expo dependency and SafeArea normalization**
   - Why Luna: mobile shell maintenance.
   - Task: align `react`, `react-native`, and `@types/react` with Expo SDK expected versions; replace deprecated core `SafeAreaView` usage with `react-native-safe-area-context` if approved.
   - Inputs/context: Expo warning output from this ticket.
   - Expected output: package changes, lockfile update, mobile build pass, Expo Go smoke pass.

4. **Jasmine — Mobile runtime QA pass**
   - Why Jasmine: QA/final review ownership.
   - Task: review Ticket 42 evidence plus mobile UX/accessibility risks and decide whether Wave F mobile confidence is acceptable.
   - Inputs/context: this response file, Metro output, Ashar's Expo Go result.
   - Expected output: QA acceptance/conditional pass/fail with follow-up tickets.

## Files Changed

Created this response artifact only:

- `agent-communication/responses/ticket-42-luna-expo-simulator-device-smoke-api-readiness-response.md`

No mobile source changes were made for Ticket 42.

Note: the working tree already contained uncommitted mobile files from prior mobile shell work; they were inspected/used but not modified as part of this ticket.

## Tests / Commands Run

From `/home/ashar/Desktop/hermes-projects/wordle-royale`:

```bash
pnpm --filter @wordle-royale/mobile build
```

Exit code: 0.

```bash
printf 'node='; node --version; printf 'pnpm='; pnpm --version; printf 'expo='; pnpm --filter @wordle-royale/mobile exec expo --version; printf 'adb='; command -v adb || true; printf 'emulator='; command -v emulator || true; printf 'xcrun='; command -v xcrun || true; printf 'hostnameI='; hostname -I || true
```

Exit code: 0.

```bash
pnpm --filter @wordle-royale/mobile exec expo config --type public
```

Exit code: 0.

```bash
pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8082
```

Result: Metro started and remained running until manually stopped after the device smoke. Evidence included `Metro waiting on exp://192.168.18.79:8082` and `Android Bundled 8032ms apps/mobile/index.ts (714 modules)`.

## Evidence / Result

Acceptance criteria status:

- `pnpm --filter @wordle-royale/mobile build` passes: **yes**.
- Simulator/device smoke evidence included: **yes**, real-device Expo Go smoke via Ashar's Android phone.
- Mobile API readiness plan documented without paid services/app-store/cloud setup: **yes**.
- Do not push: **complied**, no push performed.

Device smoke evidence:

- Expo LAN URL: `exp://192.168.18.79:8082`
- User/device observation: `Expo opened successfully; I saw the Wordle Royale mobile screen; no red error screen.`
- Metro evidence: `Android Bundled 8032ms apps/mobile/index.ts (714 modules)`

## Risks / Blockers

1. **No local simulator/emulator tooling available in this environment.**
   - `adb`, `emulator`, and `xcrun` were not detected.
   - Real-device Expo Go covered the runtime smoke path.

2. **Expo dependency compatibility warnings are present.**
   - React/React Native/@types React versions differ from Expo SDK expected versions.
   - Not blocking this ticket, but should be corrected before deeper mobile runtime work.

3. **Deprecated `SafeAreaView` warning appears at runtime.**
   - React Native recommends `react-native-safe-area-context`.
   - This should be handled in a dependency/accessibility follow-up.

4. **Mobile API readiness is planned but not implemented in this ticket.**
   - Current mobile shell remains fixture-driven.
   - Physical-device API calls will need LAN-safe base URL configuration and clear live-vs-fixture UX.

5. **Phone observation was user-reported rather than screenshot-captured.**
   - The result is still valid device smoke evidence for this manual workflow, but a future QA pass could request screenshots/video for visual layout review.
