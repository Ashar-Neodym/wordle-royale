# Ticket 116 — Profile Mode Card Accuracy Fix — Response

Task: Ticket 116 — Profile Mode Card Accuracy Fix
Agent: Luna (web UX implementation)
Status: Complete

## Summary

Fixed the profile mode-card accuracy warnings from Ticket 115.

- Prepared non-live mode cards no longer display hard-coded rating-looking values (`1475`, `1450`, `1425`) or fake sparklines.
- Speed / Blitz, Classic, and Multiplayer now render unmistakable placeholder UI: `Prepared`, `Not live yet`, `Prepared UI only`, em-dash counters, and `No live rating chart yet`.
- Standard mode now uses backend rating summary counters from `profile.rating.wins`, `profile.rating.losses`, `profile.rating.draws`, and `profile.rating.abandons` when a live profile is available.
- Standard no longer parses recent match outcome labels for W/L/D.
- Preview/demo limitations remain visible through the existing public-preview banner and mode-card caveat copy.

## Files changed

- `apps/web/src/components/ProfileHistory.tsx`
- `apps/web/src/components/web-shell.module.css`
- `agent-communication/responses/ticket-116-luna-profile-mode-card-accuracy-fix-response.md`

## Implementation notes

- Changed `ModeCard` to allow unavailable/prepared cards to carry `null` rating, counter, and graph fields instead of fabricated numeric data.
- Added an explicit `unavailable` Standard state for pages where profile data is not loaded.
- Kept the live Standard sparkline only for real profile data; prepared/unavailable modes render a non-chart placeholder.
- Added abandon counter display (`A`) so Standard reflects the backend rating summary more completely.

## Verification commands

```bash
CI=true pnpm --filter @wordle-royale/web build
```

Exit code: `0`

Observed:

```text
✓ Compiled successfully in 1768ms
Finished TypeScript in 3.0s
Route (app) ... /profile ... /profile/[handle]
```

```bash
CI=true pnpm smoke:local
```

Exit code: `0`

Observed:

```text
Local smoke passed. This smoke test validates local config only; it does not start app services.
```

```bash
CI=true pnpm secret-scan
```

Exit code: `0`

Observed:

```text
Secret scan passed (192 source/config files scanned).
```

```bash
git diff --check
```

Exit code: `0`

## Browser smoke

Local web server:

```bash
PORT=3116 pnpm --filter @wordle-royale/web dev
```

Checked pages:

- `http://127.0.0.1:3116/profile`
- `http://127.0.0.1:3116/profile/ashar`

Observed:

- Public-preview limitation banner remained visible.
- `/profile` rendered profile unavailable honestly when the API was offline.
- `/profile` mode cards rendered:
  - Standard: `Awaiting profile`, `Not live yet`, em-dash counters, `No live rating chart yet`.
  - Speed / Blitz, Classic, Multiplayer: `Prepared`, `Not live yet`, em-dash counters, and no fake charts.
- `/profile/ashar` rendered the same honest public-profile unavailable state and prepared mode placeholders.
- Browser console check after smoke: no console messages and no JavaScript errors.

## Static source check

Confirmed in `apps/web/src/components/ProfileHistory.tsx`:

- Standard counters are sourced from:
  - `profile.rating.wins`
  - `profile.rating.losses`
  - `profile.rating.draws`
  - `profile.rating.abandons`
- Removed the old recent-outcome regex parsing for W/L/D.
- Removed fake non-live rating offsets and fake prepared-mode graph data.

## Risks / follow-ups

- This is a UI accuracy fix only; it does not add real Speed / Blitz, Classic, or Multiplayer read-model data.
- When mode-specific backend profile data is wired, these prepared placeholders should be replaced with actual per-mode API values.
