# Ticket 77 — Mobile Navigation and Bounds Follow-Up Response

Task: Add or plan the first mobile navigation/depth follow-up while keeping Expo layout safe.
Agent: Luna
Status: Complete

## Summary

Implemented a scoped mobile navigation/depth follow-up for the Expo app shell.

Primary changes:

- Added a compact mobile-first navigation strip matching the Ticket 73 IA:
  - Primary: `Play`, `Lobbies`, `Ratings`, `Menu`
  - Menu: `Profile`, `History`, `Rules`, `Settings`, `Server`
- Split the previously long single-scroll demo into selected mobile sections so board/play actions stay above long profile/history/settings text.
- Added minimal mobile depth panels for:
  - Profile summary, using live rated-profile data when available and an honest fallback when not.
  - History, as an honest non-fake empty/mobile-depth placeholder until mobile wires the web history read model.
  - Rules, with spoiler-safe/mobile-authority copy.
- Kept all mobile surfaces read-only. No answer validation, guessing, scoring, joining, starting, or rating finalization was added on-device.
- Rechecked narrow-phone bounds math for nav chips, board, and keyboard.

## Files changed

- `apps/mobile/App.tsx`
- `apps/mobile/src/components/screens.tsx`
- `agent-communication/responses/ticket-77-luna-mobile-navigation-and-bounds-follow-up-response.md`

## Mobile IA review

Ticket 73 recommended:

```text
Primary: Play | Lobbies | Ratings | Menu
Menu: Profile | History | Rules | Settings | Server
```

Ticket 77 now implements this structure inside the Expo shell without adding React Navigation or a desktop-style dropdown. The app uses local state for an MVP-safe in-app section switcher:

- `Play` shows the home/play pitch, status rail, board preview, and result preview.
- `Lobbies` shows readiness, live preview, fixture lobby list, and waiting room.
- `Ratings` shows live/demo ratings and accessibility/rank tokens.
- `Menu > Profile` shows a compact read-only live/fallback profile summary.
- `Menu > History` exposes the route target but does not fake match rows.
- `Menu > Rules` shows spoiler-safe game rules.
- `Menu > Settings` reuses the existing accessibility/settings snapshot.
- `Menu > Server` shows the API readiness card.

## Bounds/safe-area check

Existing safe-area usage remains:

- `SafeAreaProvider`
- `SafeAreaView`
- dark portrait app config
- `ScrollView` with full-width content and bottom padding

Navigation bounds were added defensively:

- nav rows use `width: '100%'`, `maxWidth: '100%'`, and `flexWrap: 'wrap'`;
- nav chips use flexible basis/growth and `minWidth: 0`;
- menu panel is full-width with `overflow: 'hidden'`;
- existing board/keyboard/card wrapping from Ticket 68 was preserved.

Static 320px bounds math after the change:

```json
{
  "viewport": 320,
  "content": 296,
  "sectionInner": 272,
  "navKeyWidth": 68.75,
  "navFits": true,
  "board": 244,
  "boardFits": true,
  "flexibleKeyWidth": 24.5,
  "topKeyboard": 272,
  "keyboardFits": true
}
```

## Verification

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Commands run:

```bash
pnpm --filter @wordle-royale/mobile typecheck
pnpm --filter @wordle-royale/mobile build
pnpm --filter @wordle-royale/mobile exec expo config --type public
pnpm --filter @wordle-royale/mobile exec expo install --check
pnpm build
pnpm secret-scan
git diff --check
```

Results:

- `pnpm --filter @wordle-royale/mobile typecheck` — exit `0`
- `pnpm --filter @wordle-royale/mobile build` — exit `0`
- `pnpm --filter @wordle-royale/mobile exec expo config --type public` — exit `0`
- `pnpm --filter @wordle-royale/mobile exec expo install --check` — exit `0`; dependencies are up to date
- `pnpm build` — exit `0`
- `pnpm secret-scan` — exit `0`; `Secret scan passed (184 source/config files scanned).`
- `git diff --check` — exit `0`

Expo config evidence:

```text
name: 'Wordle Royale'
orientation: 'portrait'
userInterfaceStyle: 'dark'
android: { edgeToEdgeEnabled: true }
```

Root build evidence included:

```text
apps/mobile build: Done
apps/web build: ✓ Compiled successfully
apps/api build: Done
```

## Optional real-phone Expo Go smoke instructions

I did not request or perform a physical-phone check for this ticket. If Ashar wants to verify the original “out-of-bounds” concern on the actual phone, run:

```bash
cd /home/ashar/Desktop/hermes-projects/wordle-royale
EXPO_PUBLIC_API_URL=http://<LAN-IP>:3063 \
  pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8086
```

Then open Expo Go and scan the QR/open:

```text
exp://<LAN-IP>:8086
```

Phone checklist:

- no red error screen;
- `wr Wordle Royale` header fits;
- primary nav shows `Play`, `Lobbies`, `Ratings`, `Menu` without clipping;
- `Menu` opens/wraps `Profile`, `History`, `Rules`, `Settings`, `Server` without horizontal overflow;
- board tiles are centered and fully visible;
- keyboard row does not extend off-screen;
- API URLs/status text wrap inside cards;
- long profile/history/rules/settings text stays inside cards.

If the API is not running or the LAN URL is omitted, fixture fallback is expected and is not a ticket failure.

## Risks / follow-ups

- Real-phone runtime smoke was deferred; verification used typecheck/build/config/dependency checks plus static 320px bounds math.
- Mobile history currently exposes the destination honestly but does not fetch the web history read model yet. A future mobile-depth ticket can add a mobile adapter call for `/matches/history/me` and render spoiler-safe rows.
- This ticket intentionally avoided React Navigation and deeper routing dependencies; the local section switcher is sufficient for the first mobile navigation/depth follow-up.
