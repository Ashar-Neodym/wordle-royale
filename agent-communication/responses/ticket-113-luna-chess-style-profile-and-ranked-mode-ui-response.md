# Ticket 113 — Luna Response — Chess-Style Profile and Ranked Mode UI

## Status

Complete.

Implemented the first web UI slice for chess-style ranked modes and profile depth. This is intentionally UI/read-model scoped: it does not claim complete live matchmaking for modes the backend does not yet support.

## Files changed

- `apps/web/src/components/SiteNav.tsx`
  - Added a first-class profile/avatar-style header entry point.
  - Updated profile menu notes from local-account language to mode-rating/preview-account language.
- `apps/web/src/components/ProfileHistory.tsx`
  - Added mode-aware rating cards for Standard, Speed/Blitz, Classic, and Multiplayer.
  - Standard uses available profile read-model data when present.
  - Non-Standard modes are clearly labeled as prepared UI until mode-aware backend data lands.
  - Added provisional status, W/L/D summary, recent rating change, and rating graph affordance.
- `apps/web/src/app/profile/page.tsx`
  - Added a Mode ratings section for current profile.
  - Removed stale `Local player` fallback in favor of preview wording.
- `apps/web/src/app/profile/[handle]/page.tsx`
  - Added the same per-mode rating cards to public profiles.
- `apps/web/src/app/play/page.tsx`
  - Added ranked mode choice cards: Quick/Standard, Speed/Blitz, Classic, Multiplayer.
  - Copy states only the Standard lobby-backed path is live today; other cards are explicit affordances.
- `apps/web/src/components/LobbyScreens.tsx`
  - Updated lobby copy to distinguish Standard rated live path from prepared ranked/unranked lobby structure.
- `apps/web/src/components/web-shell.module.css`
  - Added calm/functional chess-like profile button, mode cards, mini stats, graph affordance, and responsive rules.

## Behavior notes

- Ratings are visibly per mode, matching Ticket 110 direction.
- Demo/preview limitations remain visible via the existing persistent preview notice.
- Standard profile card uses the current live profile summary shape when available.
- Speed/Blitz, Classic, and Multiplayer do not pretend backend matchmaking or per-mode rating read models are complete; they show `UI prepared` and explanatory caveat copy.
- Play page now frames modes like chess time controls and explicitly says non-Standard options are not finished matchmaking.
- Lobby page now says rated rooms currently map to Standard 1v1 and unranked/casual language is prepared but not fully live.

## Verification

Commands run:

```bash
CI=true pnpm --filter @wordle-royale/web build
# exit 0

CI=true pnpm smoke:local
# exit 0

pnpm secret-scan
# exit 0; Secret scan passed (192 source/config files scanned)

git diff --check
# exit 0
```

Browser smoke:

- Started local web dev server on `http://127.0.0.1:3113`.
- `/profile` rendered:
  - persistent public-preview limitation notice;
  - header profile/avatar entry point;
  - Mode ratings section;
  - Standard, Speed/Blitz, Classic, Multiplayer cards;
  - no fake live data for unavailable profile API.
- `/play` rendered:
  - ranked mode choice cards;
  - Standard live-lobby wording;
  - Speed/Blitz, Classic, and Multiplayer planned/prepared labels;
  - no false claim that full matchmaking is live.
- DOM check on `/play` returned:
  - `hasModes: true`
  - `hasProfileButton: true`
  - `overflow: false`

Cleanup:

- Stopped the web dev server.
- Confirmed no Hermes-tracked background processes remain.
- Confirmed nothing is listening on port `3113`.

## Acceptance criteria

- Web build passes: PASS.
- UI clearly communicates ratings are per mode: PASS.
- Demo/preview limitations remain visible: PASS.
- No false claim of complete live matchmaking if backend is not ready: PASS.

## Risks / follow-ups

- This is a UI slice only; no schema migration, API DTO expansion, matchmaking queue, or new rating event implementation was added.
- W/L/D and graph for Standard are derived from existing current profile summary/recent matches when present; richer per-mode history should replace this once Ticket 112/backend read models are live.
- Speed/Blitz, Classic, and Multiplayer cards should be wired to real mode-aware endpoints once available.
