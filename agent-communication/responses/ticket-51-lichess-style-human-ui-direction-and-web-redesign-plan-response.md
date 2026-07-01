# Ticket 51 — Lichess-Style Human UI Direction and Web Redesign Plan

Task: Define and apply a first-pass human, game-first, lichess-inspired direction for the Wordle Royale web shell.
Agent: Luna (coder)
Status: Completed with one workspace-wide build caveat unrelated to this web UI slice

## Summary

Implemented the ticket 51 reset away from the previous glossy/AI/SaaS-style shell and toward a quieter, game-first UI direction:

- Added a durable design direction note at `docs/2026-06-30-lichess-style-web-ui-direction.md`.
- Reworked the web app's first viewport around practical play affordances:
  - compact text navigation (`Play`, `Lobbies`, `Leaderboard`, `Profile`),
  - restrained rated-game headline,
  - server/fallback status kept as a small operational note,
  - lobby actions in the left rail,
  - current game board as the main content area.
- Removed the radial page background, crown/glow motif, gold-heavy decorative logo, and marketing-demo copy from the primary shell.
- Simplified status cards so the UI reads more like a game site and less like a dashboard/status demo.
- Preserved ticket 49 behavior: live/fallback state remains visible, live actions remain disabled when API is offline, and the active game UI still avoids answer/hash/salt exposure.

## Files changed for this ticket

- `docs/2026-06-30-lichess-style-web-ui-direction.md`
  - New UI direction/design constraints document.
- `apps/web/src/app/globals.css`
  - Removed radial gradient app background.
  - Switched the global page background/focus color toward the muted human-game palette.
- `apps/web/src/app/layout.tsx`
  - Updated metadata away from `Crown Grid Arena` toward `Rated word games`.
- `apps/web/src/app/page.tsx`
  - Replaced hero/marketing shell with calmer game-first copy and layout.
  - Moved server/lobby rail next to the board to make play the page center of gravity.
- `apps/web/src/components/web-shell.module.css`
  - Replaced glow/rounded SaaS styling with flatter muted panels, compact rows, restrained buttons, and two-column play layout.
- `apps/web/src/components/LobbyScreens.tsx`
  - Rewrote primary lobby copy from implementation/demo language to player-facing lobby language.
  - Kept live-vs-fixture honesty and disabled actions when API is unavailable.
- `apps/web/src/components/GameplayScreen.tsx`
  - Rewrote primary game copy around `Current game`, `Board preview`, and server authority/safety.
- `apps/web/src/components/StatusPanels.tsx`
  - Reduced status strip to server/rating essentials instead of a dashboard-like state showcase.

## Verification

### Web typecheck

Command:

```bash
pnpm --filter @wordle-royale/web typecheck
```

Result: exit `0`

Output:

```text
$ tsc --noEmit -p tsconfig.json
```

### Web production build

Command:

```bash
pnpm --filter @wordle-royale/web build
```

Result: exit `0`

Output excerpt:

```text
$ next build
▲ Next.js 16.2.9 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 1525ms
  Running TypeScript ...
  Finished TypeScript in 2.3s ...
  Generating static pages using 4 workers (0/2) ...
✓ Generating static pages using 4 workers (2/2) in 367ms
```

### Visual/browser smoke

Started local web server:

```bash
pnpm --filter @wordle-royale/web exec next dev --hostname 127.0.0.1 --port 3031
```

Then opened:

```text
http://127.0.0.1:3031/
```

Observed in browser snapshot:

- Navigation: `Play`, `Lobbies`, `Leaderboard`, `Profile`.
- Hero heading: `Play a ranked Wordle match.`
- Primary fallback label remains visible: `Server offline · fixture mode`.
- Lobby fallback remains honest: `Server offline at http://127.0.0.1:3001. Showing fixture rooms; live actions are disabled.`
- Board is visible in the first main layout area as `Current game` / `Board preview`.
- Visual pass: calmer dark game-site surface, practical left lobby rail, board-first right pane, no crown glow/radial landing-page treatment. No obvious layout breakage in desktop viewport.

### Workspace build caveat

Command:

```bash
pnpm build
```

Result: exit `2`

The web package completed successfully during the recursive build, but the workspace build later failed in `apps/api` on existing API/test TypeScript errors outside this ticket's web UI slice:

```text
apps/api build: src/gameplay/gameplay-persistence.service.ts(412,9): error TS2393: Duplicate function implementation.
apps/api build: src/gameplay/gameplay-persistence.service.ts(456,9): error TS2393: Duplicate function implementation.
apps/api build: src/gameplay/gameplay-persistence.service.ts(658,9): error TS2393: Duplicate function implementation.
apps/api build: src/gameplay/gameplay-persistence.service.ts(662,9): error TS2393: Duplicate function implementation.
apps/api build: test/leaderboard-controller.test.ts(20,33): error TS2532: Object is possibly 'undefined'.
apps/api build: test/leaderboard-controller.test.ts(21,34): error TS2532: Object is possibly 'undefined'.
apps/api build: test/leaderboard-read-model.test.ts(36,15): error TS2532: Object is possibly 'undefined'.
apps/api build: test/leaderboard-read-model.test.ts(48,15): error TS2532: Object is possibly 'undefined'.
apps/api build: test/leaderboard-read-model.test.ts(60,15): error TS2532: Object is possibly 'undefined'.
apps/api build: test/leaderboard-read-model.test.ts(72,15): error TS2532: Object is possibly 'undefined'.
```

I did not modify those API files for ticket 51.

## Result

Ticket 51 is complete for the web UI direction/reset scope. The web app typechecks and builds, the visual browser smoke confirms the new calmer game-first layout, and the direction note is recorded for future Wave H tickets.

## Risks / follow-ups

- The lower-page report/profile sections still have some fixture/demo copy; future UI tickets should continue converting them into compact rating/profile tables.
- The first-pass layout is desktop-smoked; mobile responsive rules exist but should receive visual QA in a dedicated pass.
- Workspace-wide `pnpm build` is currently blocked by API TypeScript errors outside this ticket.
