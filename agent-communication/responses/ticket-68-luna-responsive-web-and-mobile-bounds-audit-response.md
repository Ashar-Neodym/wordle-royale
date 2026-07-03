# Ticket 68 — Responsive Web and Mobile Bounds Audit Response

Task: Audit and fix responsive layout bounds across web and Expo mobile.
Agent: Luna
Status: Complete

## Summary

Completed a scoped responsive/bounds pass for the Ticket 67 multi-page web shell and the Expo mobile preview shell.

Primary fixes:

- Tightened Expo mobile card/container widths so sections, cards, status rows, and badges stay within the phone viewport.
- Reduced mobile tile and keyboard sizing so the board and top keyboard row fit a 320px-wide phone after app/section padding.
- Added wrapping/flex-shrink behavior for long mobile text such as API URLs, readiness messages, player rows, and badges.
- Tightened web mobile CSS for the route shell: wrapped status/leader/member rows, single-column small-screen forms, narrower <=360px board tiles, and protected the shell from accidental horizontal overflow.

No backend/API/gameplay behavior was changed.

## Files Changed

Changed for this ticket:

- `apps/mobile/App.tsx`
- `apps/mobile/src/components/primitives.tsx`
- `apps/mobile/src/components/screens.tsx`
- `apps/web/src/components/web-shell.module.css`
- `agent-communication/responses/ticket-68-luna-responsive-web-and-mobile-bounds-audit-response.md`

Note: the repo already has a broad dirty working tree from earlier tickets. The mobile files are still untracked in git status because they were introduced by earlier mobile tickets; this ticket made additional scoped responsive edits inside them.

## Responsive Audit Findings

### Mobile Expo shell

Before fixes, static bounds math showed the mock keyboard could overflow a 320px-wide phone:

```text
viewport=320
old RN section content width: 264px
old RN board width: 258px -> fits
old RN top keyboard width: 296px -> overflows
```

After fixes:

```text
viewport=320
RN section content width: 272px
RN board width: 244px -> fits
RN keyboard uses flex keys and fits available width
```

Applied changes:

- app padding reduced from `14` to `12` horizontal;
- section/card padding reduced and capped to `width: '100%'` / `maxWidth: '100%'`;
- row/between primitives now wrap instead of forcing wide rows;
- badges/text can shrink within rows;
- tile size reduced from `46` to `44` and tile gaps from `7` to `6`;
- keyboard rows now use flexible key widths with a max width instead of fixed minimums;
- long mono/API text and warning text can shrink/wrap inside cards;
- brand row wraps on narrow screens.

### Web shell

Web route shell audit covered the new Ticket 67 routes and responsive CSS. The existing board sizing already fit common small widths, but the shell needed defensive wrapping for rows/forms/cards.

Applied changes:

- `cardTopline`, `roomSummary`, `reportRow`, `leaderRow`, `memberRow`, `progressRow`, and `statusCard` now wrap.
- Inner row children get `min-width: 0` so text can shrink instead of pushing cards wide.
- server detail rows wrap, with long URL/status values using `overflow-wrap`.
- mobile breakpoint tightens page/card padding.
- mobile menu panel is explicitly single-column.
- guess input row becomes single-column on small screens.
- <=360px breakpoint shrinks board tiles to `48px` with `5px` gaps.
- shell gets `overflow-x: clip` on small screens to prevent accidental horizontal scroll from decorative/card edges.

Post-fix static bounds math:

```text
viewport=320
web board width: 260px
web shell content width: 306px -> fits

viewport=360
web board width: 260px
web shell content width: 346px -> fits

viewport=390
web board width: 284px
web shell content width: 372px -> fits
```

## Verification

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

### Web build

```bash
pnpm --filter @wordle-royale/web build
```

Exit code: `0`

Key output:

```text
✓ Compiled successfully
Route (app)
┌ ƒ /
├ ○ /_not-found
├ ○ /history
├ ƒ /leaderboard
├ ○ /learn/rules
├ ƒ /lobbies
├ ƒ /play
├ ƒ /profile
├ ƒ /server
└ ○ /settings
```

### Mobile build

```bash
pnpm --filter @wordle-royale/mobile build
```

Exit code: `0`

Key output:

```text
$ expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json
```

### Expo config

```bash
pnpm --filter @wordle-royale/mobile exec expo config --type public
```

Exit code: `0`

Key output:

```text
name: 'Wordle Royale'
orientation: 'portrait'
userInterfaceStyle: 'dark'
android: { edgeToEdgeEnabled: true }
```

### Expo dependency check

```bash
pnpm --filter @wordle-royale/mobile exec expo install --check
```

Exit code: `0`

Key output:

```text
Dependencies are up to date
```

### Root build

```bash
pnpm build
```

Exit code: `0`

Key output:

```text
apps/mobile build: Done
apps/web build: ✓ Compiled successfully
apps/api build: Done
```

### Secret scan

```bash
pnpm secret-scan
```

Exit code: `0`

Key output:

```text
Secret scan passed (179 source/config files scanned).
```

### Web route HTTP smoke

Started production web server for smoke testing:

```bash
pnpm --filter @wordle-royale/web exec next start --hostname 127.0.0.1 --port 3068
```

Checked routes:

```text
/                200
/play            200
/lobbies         200
/leaderboard     200
/profile         200
/learn/rules     200
/settings        200
/server          200
/history         200
```

### Browser overflow/console smoke

Browser route checks on production server:

```text
/        overflowing=false, offenders=[]
/lobbies overflowing=false, offenders=[]
/server  overflowing=false, offenders=[]
```

`/play` visual smoke at desktop viewport showed no clipped cards/buttons, no text escaping cards, no horizontal overflow, and the dark game-site layout remained intact.

Browser console after route checks:

```text
total_errors: 0
total_messages: 0
```

Cleanup:

```text
Stopped Next server on port 3068.
Verified no tracked background processes remained.
```

## Manual Phone Check Instructions

Real phone verification was not required to complete this ticket, but if Ashar wants to double-check the exact Expo Go bounds that motivated the ticket:

1. From the repo root, start Metro with a LAN API URL if using live preview:

   ```bash
   EXPO_PUBLIC_API_URL=http://<LAN-IP>:3063 \
     pnpm --filter @wordle-royale/mobile exec expo start --host lan --port 8084
   ```

2. Open Expo Go on the phone and scan the QR / open `exp://<LAN-IP>:8084`.

3. Check:
   - no red screen;
   - no horizontal clipping on the `wr Wordle Royale` header;
   - API URL stays inside the API card;
   - badges wrap instead of escaping cards;
   - board tiles are centered and fully visible;
   - keyboard row does not extend off-screen;
   - long lobby/result rows wrap instead of clipping.

If the local API is not running, fixture fallback is expected and is not a failure.

## Risks / Follow-ups

- I did not perform a real-phone screenshot capture in this ticket. Verification used build/config checks, static width math, HTTP route smoke, browser console checks, and desktop browser visual inspection.
- Final tactile/mobile visual acceptance is still best confirmed by Ashar on the specific phone where the earlier out-of-bounds feeling was noticed.
- No gameplay/API behavior changed; this was strictly a responsive layout hardening pass.
