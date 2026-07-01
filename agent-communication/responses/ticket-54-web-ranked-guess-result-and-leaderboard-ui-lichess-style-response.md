# Ticket 54 — Web Ranked Guess, Result, and Leaderboard UI (Lichess Style)

Task: Wire the lichess-style web shell to the ranked guess/result/leaderboard read APIs without exposing answer authority client-side.
Agent: Luna (coder)
Status: Completed

## Summary

Implemented a first live ranked gameplay UI slice in the web app:

- Added web API client helpers for:
  - `POST /matches/:matchId/rounds/:roundId/guesses`
  - `POST /matches/:matchId/complete`
  - `GET /matches/:matchId/result`
  - `GET /leaderboard`
  - `GET /profile/me/rated`
- Added server actions for ranked guess submission and match finalization attempts.
- Rendered live ranked game state above the fixture board when `matchId` is present.
- Added a five-letter guess form that submits to the API and shows accepted/rejected feedback from the server.
- Added live standings in the current-game panel.
- Added result UI for completed match summaries and a clear “not ready” state while active matches are incomplete.
- Added leaderboard/profile read model UI with fixture fallback when no rated entries exist yet.
- Preserved the lichess-style quieter layout: dark flat surfaces, left lobby rail, primary board area, compact text/status, and no SaaS/gloss treatment.
- Kept answer authority out of the UI: the live screen only renders server feedback; it does not expose answer, hash, or salt.

## Files changed

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/app/actions.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/GameplayScreen.tsx`
- `apps/web/src/components/ReportAndProfile.tsx`
- `apps/web/src/components/web-shell.module.css`
- `agent-communication/responses/ticket-54-web-ranked-guess-result-and-leaderboard-ui-lichess-style-response.md`

## Verification

### Static checks

```text
$ pnpm --filter @wordle-royale/web typecheck
$ tsc --noEmit -p tsconfig.json
exit 0
```

```text
$ pnpm --filter @wordle-royale/web build
$ next build
✓ Compiled successfully
✓ Generating static pages using 4 workers (2/2)
exit 0
```

```text
$ pnpm --filter @wordle-royale/api test
29 tests passed
exit 0
```

```text
$ pnpm build
packages/contracts build: Done
packages/design-tokens build: Done
packages/fixtures build: Done
packages/game-engine build: Done
packages/rating-tools build: Done
packages/word-tools build: Done
apps/mobile build: Done
apps/web build: Done
apps/api build: Done
exit 0
```

### Live local API smoke

Local Compose dependencies were started, reset, and seeded:

```text
$ pnpm deps:check && pnpm deps:up && pnpm ranked:smoke:reset
Local dependency check passed.
The PostgreSQL database was successfully reset.
Applied local fixture seed: en-5-test-vfixture.001
exit 0
```

Started API on `127.0.0.1:3054`, then created a ranked lobby, joined the local guest, started a ranked match, submitted `CRANE`, fetched state, and fetched leaderboard:

```text
POST /lobbies -> 201 ok
POST /lobbies/db267496-2969-423d-932d-73caeff5e828/join -> 201 ok
POST /matches/ranked/start -> 201 ok
POST /matches/37dce546-1dd2-4480-820e-8a83e2b7c832/rounds/f7b19d71-d360-4d72-b4c6-132f9ba1554f/guesses -> 201 ok
GET /matches/37dce546-1dd2-4480-820e-8a83e2b7c832/state -> 200 ok
GET /leaderboard?limit=5 -> 200 ok
{
  "lobbyCode": "9C4664",
  "matchId": "37dce546-1dd2-4480-820e-8a83e2b7c832",
  "roundId": "f7b19d71-d360-4d72-b4c6-132f9ba1554f",
  "guessRows": 1,
  "standings": 2,
  "leaderboardEntries": 0
}
exit 0
```

`leaderboardEntries: 0` is expected for this smoke because the match remains active/incomplete, so no rating event has been finalized yet.

### Web live UI smoke

Started web on `127.0.0.1:3055` with `NEXT_PUBLIC_API_URL=http://127.0.0.1:3054` and loaded the live match URL.

HTML smoke assertions:

```text
Your word: True
Finalize ratings: True
Move accepted: True
Guess CRANE accepted: True
Standings: True
Leaderboard: True
Match result: True
No answer, hash, or salt: True
exit 0
```

Browser visual smoke showed:

- calm dark lichess-style layout,
- left lobby rail,
- primary live board area,
- accepted guess feedback for `CRANE`,
- live standings panel,
- guess input and submit button,
- result not-ready panel,
- fixture fallback board below,
- match result and leaderboard sections further down,
- no obvious broken desktop styling.

### Cleanup

```text
$ pnpm deps:down
Container wordle-royale-postgres Removed
Container wordle-royale-redis Removed
Network wordle-royale_default Removed
exit 0
```

No background processes remained after cleanup.

## Notes / follow-ups

- The live final result panel is wired to `GET /matches/:matchId/result`; the smoke verified its incomplete/not-ready state. A full browser smoke for completed ratings needs either multi-user guess authority or a dedicated deterministic completed-match fixture/API path.
- Leaderboard UI falls back to fixture rows until the local rated read model has finalized rated entries.
- Submit/finalize actions are intentionally server actions with redirect-query feedback; richer client-side optimistic UX can come later.
