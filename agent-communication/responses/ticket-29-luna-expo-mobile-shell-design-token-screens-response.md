# Expo Mobile App Shell with Design Tokens and Fixture Screens — Response

## Summary

Implemented the `apps/mobile` placeholder as a minimal Expo React Native shell for Wordle Royale. The app mirrors the core fixture-driven UX from the web shell with mobile-friendly sections for home/dashboard, lobby browser, quick join, waiting room, gameplay board, match report, and settings/accessibility mock state.

## Decisions / Recommendations

- Used Expo, React, and React Native only; no EAS, cloud build, app store setup, push notifications, backend integration, paid SaaS, or paid cloud resources were added.
- Kept the app fully fixture-driven. It imports shared design tokens and fixture data, but does not implement authoritative gameplay, scoring, validation, timer, auth, or backend logic on-device.
- Added a package-level local validation/build-equivalent script: `pnpm --filter @wordle-royale/mobile build`, which runs Expo config validation plus TypeScript compilation.
- Used local `src/lib/tokens.ts` and `src/lib/fixtures.ts` re-export shims to consume built shared package outputs, matching the pragmatic Turbopack/monorepo approach used for Ticket 28.

## Detailed Output

- Replaced the mobile placeholder package with an Expo app entrypoint:
  - `index.ts`
  - `App.tsx`
  - `app.json`
  - `tsconfig.json`
- Added reusable React Native components:
  - section/card primitives
  - badges
  - avatar renderer
  - tile renderer with color plus non-color markers and accessibility labels
- Added fixture screens/components:
  - home/dashboard mock state
  - reconnect/loading/error status rail
  - lobby browser and quick join mock
  - waiting room mock
  - gameplay board mock using fixture feedback
  - keyboard mock component
  - match report with explicit MMR delta text
  - settings/accessibility plus ranked snapshot state
- Updated `apps/mobile/README.md` with local commands and validation notes.

## Open Questions

None.

## Follow-up Tickets

- Add device/simulator visual QA once the team selects supported device profiles.
- Add automated React Native component tests or Expo snapshot tests once the testing stack is approved.
- Replace local built-output re-export shims if the workspace package export strategy is standardized for all app consumers.

## Files Changed

- `apps/mobile/package.json`
- `apps/mobile/README.md`
- `apps/mobile/app.json`
- `apps/mobile/index.ts`
- `apps/mobile/App.tsx`
- `apps/mobile/tsconfig.json`
- `apps/mobile/src/lib/tokens.ts`
- `apps/mobile/src/lib/fixtures.ts`
- `apps/mobile/src/components/tokens.ts`
- `apps/mobile/src/components/data.ts`
- `apps/mobile/src/components/primitives.tsx`
- `apps/mobile/src/components/screens.tsx`
- `pnpm-lock.yaml`

## Tests / Commands Run

- `pnpm --filter @wordle-royale/mobile add expo react react-native @wordle-royale/design-tokens@workspace:* @wordle-royale/fixtures@workspace:* && pnpm --filter @wordle-royale/mobile add -D typescript @types/react` — exit 1 initially due pnpm unexpected store location.
- `pnpm --store-dir /home/ashar/.hermes/profiles/yuna/home/.local/share/pnpm/store/v11 --filter @wordle-royale/mobile add expo react react-native @wordle-royale/design-tokens@workspace:* @wordle-royale/fixtures@workspace:* && pnpm --store-dir /home/ashar/.hermes/profiles/yuna/home/.local/share/pnpm/store/v11 --filter @wordle-royale/mobile add -D typescript @types/react` — exit 0.
- `pnpm --filter @wordle-royale/design-tokens build && pnpm --filter @wordle-royale/fixtures build && pnpm --filter @wordle-royale/mobile typecheck` — exit 1 initially due pnpm non-TTY module purge/install-state issue.
- `pnpm install --no-frozen-lockfile --config.confirmModulesPurge=false` — exit 0; restored workspace install state.
- `pnpm --filter @wordle-royale/design-tokens build && pnpm --filter @wordle-royale/fixtures build && pnpm --filter @wordle-royale/mobile typecheck` — exit 0.
- `pnpm --filter @wordle-royale/mobile build` — exit 0.
- `pnpm build` — exit 0.

## Evidence / Result

- Mobile package typecheck passed: `tsc --noEmit -p tsconfig.json`.
- Mobile build-equivalent validation passed: `expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json`.
- Root `pnpm build` passed across workspace packages, including `apps/mobile build` and the existing `apps/web build`.

## Risks / Blockers

- No active blockers.
- Simulator/device rendering was not exercised in this environment; validation is config + TypeScript build-equivalent only.
- Repository has unrelated uncommitted work from previous tickets/agents; I did not revert or broaden those changes.
- The local built-output package shims are a pragmatic bridge and should be removable if shared package exports are later standardized for all app consumers.
