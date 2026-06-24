# Next.js Web App Shell with Design Tokens and Fixture Screens — Response

## Summary

Implemented the `apps/web` placeholder as a minimal fixture-driven Next.js app shell for Wordle Royale. The shell includes landing/home, lobby browser, quick join, lobby waiting room, gameplay board, match report, and profile/leaderboard sections.

## Decisions / Recommendations

- Used Next.js + React as free/open-source local dependencies.
- Kept all screens static/fixture-driven; no backend, auth, timer authority, scoring authority, or client-side answer validation was added.
- Used `packages/design-tokens` for CSS variables, tile states, lobby/connection/rank/score visual states.
- Used `packages/fixtures` for lobby, gameplay, status, report, leaderboard, and user data.
- Added local `src/lib/tokens.ts` and `src/lib/fixtures.ts` re-export shims pointing to built package outputs. This avoids Turbopack resolving the source package `*.ts` files with NodeNext `.js` extension imports during Next production builds.
- Updated `packages/design-tokens` and `packages/fixtures` package entrypoints from `src/index.ts` to `dist/index.js` / `dist/index.d.ts`, matching their existing `exports` fields and build outputs.

## Detailed Output

- Added a Next.js App Router shell under `apps/web/src/app`.
- Added componentized UI under `apps/web/src/components`:
  - status/loading/error/reconnect/rank strip
  - accessible tile renderer with color and non-color markers
  - lobby browser and waiting room
  - gameplay board using fixture guesses/feedback
  - match report with MMR delta text
  - leaderboard/profile snapshot
- Added global CSS and CSS module styling using shared `--wr-*` variables emitted from design tokens.
- Added web package scripts: `dev`, `typecheck`, and `build`.
- Added `next.config.mjs`, `tsconfig.json`, and `next-env.d.ts`.
- Updated `apps/web/README.md` with local commands.

## Open Questions

None.

## Follow-up Tickets

- Add automated UI/a11y snapshot tests once the frontend testing stack is selected.
- Add route-per-screen navigation if Athena/Freya want separate pages instead of a single fixture showcase page.
- Replace the local dist re-export shim if/when the workspace package source/export strategy is standardized for Next/Turbopack consumption.

## Files Changed

- `apps/web/package.json`
- `apps/web/README.md`
- `apps/web/next.config.mjs`
- `apps/web/next-env.d.ts`
- `apps/web/tsconfig.json`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/StatusPanels.tsx`
- `apps/web/src/components/WordTile.tsx`
- `apps/web/src/components/LobbyScreens.tsx`
- `apps/web/src/components/GameplayScreen.tsx`
- `apps/web/src/components/ReportAndProfile.tsx`
- `apps/web/src/components/data.ts`
- `apps/web/src/components/web-shell.module.css`
- `apps/web/src/lib/tokens.ts`
- `apps/web/src/lib/fixtures.ts`
- `packages/design-tokens/package.json`
- `packages/fixtures/package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

## Tests / Commands Run

- `pnpm --store-dir /home/ashar/.hermes/profiles/ruby/home/.local/share/pnpm/store/v11 --filter @wordle-royale/web add next react react-dom` — exit 1 initially due pnpm build approval/workspace install handling, but dependencies were recorded; completed later through install/build flow.
- `pnpm --store-dir /home/ashar/.hermes/profiles/ruby/home/.local/share/pnpm/store/v11 --filter @wordle-royale/web add -D typescript @types/react @types/react-dom` — exit 0.
- `pnpm --store-dir /home/ashar/.hermes/profiles/ruby/home/.local/share/pnpm/store/v11 --filter @wordle-royale/web add @wordle-royale/design-tokens@workspace:* @wordle-royale/fixtures@workspace:*` — exit 0.
- `pnpm --store-dir /home/ashar/.hermes/profiles/ruby/home/.local/share/pnpm/store/v11 --filter @wordle-royale/web add -D @types/node` — exit 0.
- `pnpm --filter @wordle-royale/web typecheck` — failed once for missing `@types/node`, then passed after adding it.
- `pnpm --filter @wordle-royale/web build` — failed once on Turbopack resolving package source `.js` imports, then passed after using built package outputs.
- `pnpm --filter @wordle-royale/design-tokens build && pnpm --filter @wordle-royale/fixtures build && pnpm --filter @wordle-royale/web typecheck && pnpm --filter @wordle-royale/web build` — exit 0.
- `pnpm build` — exit 0.
- `pnpm --filter @wordle-royale/web dev --hostname 127.0.0.1 --port 3100` + `curl -I --max-time 10 http://127.0.0.1:3100` — dev server returned `HTTP/1.1 200 OK`.
- Browser smoke check at `http://127.0.0.1:3100/` — loaded title `Wordle Royale — Crown Grid Arena` and exposed the expected landing, lobby, waiting room, gameplay, report, and leaderboard regions.

## Evidence / Result

- `pnpm --filter @wordle-royale/web build` passed after compiling the static route `/` and `/_not-found`.
- Root `pnpm build` passed across workspace packages, including the new web build.
- Local dev smoke test returned `HTTP/1.1 200 OK`.
- Browser accessibility snapshot showed the implemented regions:
  - `Fixture-driven web shell for the first playable loop.`
  - `Lobby browser + quick join`
  - `Crown room CROWN1`
  - `Server-shaped gameplay board`
  - `Spoiler-safe ranked report`
  - `Ranked beta snapshot`

## Risks / Blockers

- No active blockers.
- There were pre-existing unrelated uncommitted changes in the repository from other tickets/agents; I did not revert or modify those beyond this ticket's required files/dependency updates.
- Next/Turbopack currently consumes the built `dist` outputs through local web shims. If packages later standardize on source-compatible exports for Turbopack, this shim can be simplified.
