# Ticket 61 — Lichess-Style Web Polish and Remove Live Fixture Noise Response

Task: Polish the web UI for a cleaner lichess-like first demo and remove confusing fixture/demo noise from live match view.
Agent: Luna (coder)
Status: Completed

## Summary

Implemented the Wave I web polish pass focused on live-vs-fixture clarity.

The web UI now treats `?matchId=...` as a focused live ranked match view:

- replaces the generic home hero with a compact live-match banner;
- keeps the main viewport board/result/rating oriented;
- hides the old fixture practice board while a match link is active;
- hides the fixture waiting-room and lower fixture result report while a match link is active;
- keeps a small explicit note saying practice boards are hidden during live match mode;
- moves the match-result/status panel immediately under the live board area;
- renames the lower leaderboard area to **Ratings after this match** for live match views;
- keeps API-off/live-state fallback visible but visually secondary.

## Files Changed

Changed for this ticket:

- `apps/web/src/app/page.tsx`
- `apps/web/src/components/GameplayScreen.tsx`
- `apps/web/src/components/ReportAndProfile.tsx`
- `apps/web/src/components/web-shell.module.css`
- `agent-communication/responses/ticket-61-luna-lichess-style-web-polish-and-remove-live-fixture-noise-response.md`

Note: these files already contained broad Wave H changes in the working tree. I scoped this ticket’s edits to live-match presentation, fixture-noise removal, and response evidence.

## Detailed Output

### Live match page mode

`apps/web/src/app/page.tsx` now computes `hasLiveMatch` from the `matchId` query parameter.

When `hasLiveMatch` is true:

- the page shows a compact live match banner instead of the normal marketing/home hero;
- the copy says practice fixtures are hidden from the live view;
- the lower fixture `WaitingRoom` section is not rendered;
- the lower fixture `MatchReport` section is not rendered because the live result panel now sits inside the gameplay area;
- the leaderboard/profile section receives `compactForLiveMatch` so it reads as ratings context for the active match.

### Gameplay fixture-noise removal

`apps/web/src/components/GameplayScreen.tsx` now treats any provided `matchState` result — connected or unavailable — as live match mode.

In live match mode:

- the header reads `LIVE BOARD`;
- the explanatory copy says practice boards are kept out of the live match view;
- server state/result panels stay visible;
- the fixture/demo Wordle board is not rendered;
- a quiet `Practice board hidden during live match` note is shown instead of the old fixture board.

In normal home mode with no `matchId`, the practice fixture board still renders as the local preview.

### Result and ratings placement

The live result panel remains directly inside the gameplay area, immediately after the live server board panel. This means completed-match outcomes are near the board instead of buried under fixture sections.

`ProfileLeaderboard` now supports `compactForLiveMatch`. In live match mode it labels the lower ratings section as:

- `Ratings after this match`
- `Live ratings` when live leaderboard rows exist
- `Ratings preview` when the read model has no finalized rows yet

This keeps leaderboard/rating context available without making fixture/demo state feel like part of the live match.

### Visual style

Added/adjusted small styles for:

- `.matchBanner`
- `.practiceNote`
- `.liveRatingsSection`

These use the existing calm human palette and avoid glossy/glowy treatment.

## Verification Commands Run

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

```bash
pnpm --filter @wordle-royale/web typecheck
```

Exit code: 0

```text
$ tsc --noEmit -p tsconfig.json
```

```bash
pnpm --filter @wordle-royale/web build
```

Exit code: 0

```text
$ next build
✓ Compiled successfully
Route (app)
┌ ƒ /
└ ○ /_not-found
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

```bash
pnpm secret-scan
```

Exit code: 0

```text
Secret scan passed (167 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

## Visual / Browser Smoke

Started local deps and reset local ranked DB:

```bash
pnpm deps:check && pnpm deps:up && pnpm ranked:smoke:reset
```

Exit code: 0

Started API on `127.0.0.1:3061` and web on `127.0.0.1:3062`, then opened:

```text
http://127.0.0.1:3062/?matchId=11111111-1111-4111-8111-111111111111#gameplay
```

This intentionally used a fake/unavailable match id to verify the live-match fallback path and fixture-noise removal.

Browser snapshot/visual observations:

- Top nav is compact: `Play`, `Lobbies`, `Leaderboard`, `Profile`.
- First live banner says `LIVE RANKED MATCH` and `Board first. Result and ratings stay with the match.`
- Server status remains visible but secondary in the left rail.
- Gameplay section reads `LIVE BOARD`, not `Board preview`.
- The unavailable state says practice fixtures stay hidden in live match mode.
- A quiet note says `Practice board hidden during live match.`
- No old fixture/demo Wordle board is rendered below the live panel.
- No fixture waiting-room or fixture match-report section appears in live match mode.
- Lower ratings section is labeled `Ratings after this match` instead of generic leaderboard/demo copy.
- Visual feel is flat, dark, restrained, and game-site-like; no obvious glossy/SaaS regression was visible.

Browser console:

```text
JS errors: 0
Messages: React DevTools info, HMR connected / Fast Refresh logs only
```

## Cleanup

Stopped the web dev server and API process, then ran:

```bash
pnpm deps:down
```

Exit code: 0

Verified no tracked background processes remained.

## Risks / Blockers

### Blockers

None for Ticket 61.

### Warnings / follow-ups

1. I attempted a full live completed-match API smoke, but `GET /auth/me` returned HTTP 500 in this working tree after reset. This matches the broader Wave H/Wave I warning area around stub-user/reset stability. I did not broaden Ticket 61 into backend debugging.
2. Because of that backend smoke issue, the browser visual smoke used a live-match URL with an unavailable match id to verify presentation/fallback and fixture-noise removal. Build/typecheck/root gates still passed.
3. Human visual acceptance by Ashar is still recommended, especially for the final lichess-style taste.
