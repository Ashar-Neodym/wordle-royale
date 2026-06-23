# Ticket 21 — Design Tokens and UI Fixture Foundation — Response

## Summary

Implemented the first real `packages/design-tokens` and `packages/fixtures` foundation for the Wordle Royale monorepo.

The design-token package now includes Crown Grid Arena TypeScript source tokens, web CSS variable export helpers, React Native/plain-object export helpers, tile feedback metadata, and state tokens for rank, score, lobby, connection, and share-card UI.

The fixture package now includes typed safe fixture data for auth/onboarding, lobby, gameplay, match reports, leaderboard, loading/error/reconnect states, and a scenario catalog for frontend/backend tests.

## Decisions/Recommendations

- Kept both packages dependency-free beyond the workspace TypeScript toolchain already present in the monorepo lockfile.
- Replaced placeholder package scripts with real `tsc` typecheck/build scripts:
  - `typecheck`: `tsc --noEmit -p tsconfig.json`
  - `build`: `tsc -p tsconfig.json`
- Encoded accessibility metadata directly in token/fixture data where useful:
  - Tile tokens include label, icon, pattern, accessibility note, and `colorOnlySafe: false`.
  - Connection tokens include label and ARIA live-region intent.
  - Fixtures include explicit invalid/reconnect/resync/timed-out/failed/participant-only style states rather than UI-only shortcuts.
- Left optional preview work out of scope for this ticket to avoid overbuilding; packages are now ready for a separate preview/component ticket.

## Detailed Output

### Design tokens implemented

`packages/design-tokens/src/` now contains:

- `color.ts` — base palette and semantic colors.
- `typography.ts` — display/body/mono font stacks, size, line-height, weight, and tabular numeric intent.
- `spacing.ts` — spacing scale and component size tokens.
- `radius.ts` — radius scale.
- `shadow.ts` — web shadow tokens and React Native elevation/shadow approximations.
- `border.ts` — border width/style tokens.
- `motion.ts` — durations/easings and reduced-motion metadata.
- `tile.ts` — tile feedback state enum and token metadata for:
  - `empty`
  - `filled`
  - `pending`
  - `submitted`
  - `correct`
  - `present`
  - `absent`
  - `invalid`
  - `locked`
  - `disabled`
- `rank.ts` — rated/unrated/provisional tokens, rank tier colors, and rating-delta tokens.
- `lobby.ts` — lobby badge/state token metadata.
- `connection.ts` — live/unstable/reconnecting/resyncing/reconnected/offline/failed state tokens.
- `share-card.ts` — spoiler-safe share-card sizing, text, accent, tile, and content policy tokens.
- `themes.ts` — `wrTheme` and variants for default dark, colorblind, high contrast, and reduced motion.
- `css.ts` — CSS custom-property export strings for web consumption.
- `native.ts` — plain object/native export with safe px-to-number conversion for RN consumers.
- `index.ts` — package barrel exports.

### Fixture catalog implemented

`packages/fixtures/src/` now contains:

- `types.ts` — shared fixture/domain types and API envelope/error shape.
- `users.ts` — safe sample users.
- `auth.ts` — anonymous, loading, profile-incomplete, consent-incomplete, complete, and error auth/onboarding fixtures.
- `lobbies.ts` — private waiting, public ready, rated-private-disabled, full public lobby states, and API envelopes.
- `gameplay.ts` — gameplay fixtures for active round, invalid word, pending submit, solved, failed, timed out, reconnecting, and resyncing.
- `reports.ts` — ranked gain/loss reports, casual report, and leaderboard fixtures.
- `status.ts` — loading/empty/reconnect/offline/rate-limited/error fixtures.
- `scenarios.ts` — named scenario index covering frontend/backend test entry points.
- `index.ts` — package barrel exports.

### Build outputs

Running package builds generated TypeScript outputs under:

- `packages/design-tokens/dist/`
- `packages/fixtures/dist/`

## Open Questions

1. Should `dist/` build output be committed for these internal workspace packages, or should future tickets add package-level `.gitignore` entries and rely on build artifacts only locally/CI?
2. Should `@wordle-royale/design-tokens` eventually become the source for generated static CSS files on disk, or is exporting `cssVariables`/`cssThemeVariables` from TypeScript sufficient for the first frontend pass?
3. Should fixtures later import shared types from `@wordle-royale/contracts` after Ticket 19 stabilizes contracts, replacing the local fixture types?
4. Should the consent enum be normalized across all docs/contracts as `training_insights_opt_in`? Ticket 21/decision locks use that spelling, while older Ticket 10 text contains a singular `training_insight_opt_in` in one section.

## Follow-up Tickets

### Ticket: Commit policy for generated package build outputs

- Target agent: Ruby or Yuna
- Why that agent is needed: Workspace/build policy should be consistent across packages and CI.
- Exact task: Decide whether `packages/*/dist` outputs are committed, ignored, or only produced in CI/build pipelines. Add `.gitignore`/package ignore conventions accordingly.
- Inputs/context they need: Ticket 18 scaffold, Ticket 21 generated `dist` outputs, CI/build expectations.
- Expected output back to Athena: Repository policy and any ignore/config files changed.

### Ticket: Wire fixtures to contracts after contract package implementation

- Target agent: Luna or Freya
- Why that agent is needed: Fixture drift should be removed once shared contracts are real.
- Exact task: Replace duplicate local fixture type definitions with imports from `@wordle-royale/contracts` once contracts expose stable lobby/match/report/API envelope types.
- Inputs/context they need: Ticket 19 contract implementation, Ticket 21 fixture package.
- Expected output back to Athena: Fixture code using shared contracts, typecheck evidence, drift notes.

### Ticket: Build token/component preview surface

- Target agent: Luna
- Why that agent is needed: Token correctness needs visual inspection before full UI shell work.
- Exact task: Add a lightweight web preview route or Storybook/dev surface showing token swatches, typography, tile states, lobby badges, connection banners, rank/score chips, and share-card sample using `@wordle-royale/design-tokens` and `@wordle-royale/fixtures`.
- Inputs/context they need: Ticket 21 packages, Ticket 12 preview strategy, Ticket 17 brand plan.
- Expected output back to Athena: Preview files, screenshot/inspection evidence, commands run.

### Ticket: Accessibility QA for token metadata and fixture states

- Target agent: Jasmine
- Why that agent is needed: Independent QA should validate that the metadata is sufficient for accessible components.
- Exact task: Review tile, connection, lobby, score/rank tokens and fixture scenarios for colorblind, high-contrast, reduced-motion, screen-reader, keyboard/focus, and error/reconnect coverage.
- Inputs/context they need: Ticket 21 implementation, Ticket 17 token contract, Ticket 12 accessibility plan.
- Expected output back to Athena: Pass/fail QA report and required token/fixture changes.

## Files Changed

Source/config/docs changed:

- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/border.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/color.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/connection.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/css.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/index.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/lobby.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/motion.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/native.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/radius.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/rank.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/shadow.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/share-card.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/spacing.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/themes.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/tile.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/typography.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/auth.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/gameplay.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/index.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/lobbies.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/reports.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/scenarios.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/status.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/types.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/users.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-21-luna-design-tokens-and-ui-fixtures-response.md`

Generated by `tsc -p tsconfig.json`:

- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/dist/`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/dist/`

Workspace install state restored after pnpm purged modules during an initial non-TTY install attempt:

- `/home/ashar/Desktop/hermes-projects/wordle-royale/node_modules/`

## Tests/Commands Run

### Command 1

```bash
pnpm --filter @wordle-royale/design-tokens typecheck && pnpm --filter @wordle-royale/fixtures typecheck
```

Exit code: `1`

Result: failed before typechecking because pnpm attempted a non-TTY modules purge:

```text
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY
```

### Command 2

```bash
CI=true pnpm install && pnpm --filter @wordle-royale/design-tokens typecheck && pnpm --filter @wordle-royale/fixtures typecheck
```

Exit code: `1`

Result: failed because CI mode enabled frozen lockfile and the temporary package manifest change was not lockfile-compatible. I removed the unnecessary new package-level devDependencies instead of changing the lockfile for duplicate TypeScript dependencies.

### Command 3

```bash
pnpm install --no-frozen-lockfile && pnpm --filter @wordle-royale/design-tokens typecheck && pnpm --filter @wordle-royale/fixtures typecheck
```

Exit code: `2`

Result: install completed, but design-token typecheck found a real syntax issue in `src/css.ts`; fixed by rewriting the string-template newline joins.

### Command 4

```bash
pnpm install --no-frozen-lockfile --force
```

Exit code: `0`

Result: pnpm reported up to date, but package dependency links were still not restored because a stale `node_modules/.pnpm-workspace-state-v1.json` remained after the earlier purge.

### Command 5

```bash
pnpm --filter @wordle-royale/design-tokens typecheck
```

Exit code: `0`

Output:

```text
$ tsc --noEmit -p tsconfig.json
```

### Command 6

```bash
pnpm --filter @wordle-royale/fixtures typecheck
```

Exit code: `0`

Output:

```text
$ tsc --noEmit -p tsconfig.json
```

### Command 7

```bash
pnpm --filter @wordle-royale/design-tokens build && pnpm --filter @wordle-royale/fixtures build && pnpm typecheck
```

Exit code: `0`

Output:

```text
$ tsc -p tsconfig.json
$ tsc -p tsconfig.json
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).
```

### Command 8

```bash
pnpm test && pnpm build
```

Exit code: `2`

Result: root test passed, but root build failed in `@wordle-royale/contracts` because the earlier pnpm purge left `@types/node` unlinked:

```text
Workspace scaffold validation passed (9 workspace packages).
packages/contracts build: error TS2688: Cannot find type definition file for 'node'.
```

### Command 9

```bash
pnpm --filter @wordle-royale/contracts install --no-frozen-lockfile --force --config.confirmModulesPurge=false --reporter=append-only && pnpm --filter @wordle-royale/contracts typecheck
```

Exit code: `2`

Result: pnpm still considered workspace state up to date and did not restore links; contracts typecheck still failed on missing `@types/node`.

### Command 10

```bash
pnpm install --no-frozen-lockfile --force --child-concurrency=1 --config.sharedWorkspaceLockfile=true --config.confirmModulesPurge=false --reporter=ndjson | tail -n 40
```

Exit code: `0`

Result: diagnostic output showed pnpm was exiting early due stale workspace state:

```text
No manifest files were modified since the last validation. Exiting check.
```

### Command 11

```bash
rm -f node_modules/.pnpm-workspace-state-v1.json && pnpm install --no-frozen-lockfile --config.confirmModulesPurge=false
```

Exit code: `0`

Output:

```text
Scope: all 10 workspace projects
Lockfile is up to date, resolution step is skipped
Packages: +4
Done in 1.5s using pnpm v11.1.1
```

### Command 12

```bash
pnpm --filter @wordle-royale/design-tokens typecheck && pnpm --filter @wordle-royale/fixtures typecheck && pnpm --filter @wordle-royale/design-tokens build && pnpm --filter @wordle-royale/fixtures build && pnpm test && pnpm build
```

Exit code: `0`

Output:

```text
$ tsc --noEmit -p tsconfig.json
$ tsc --noEmit -p tsconfig.json
$ tsc -p tsconfig.json
$ tsc -p tsconfig.json
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).
$ pnpm -r --if-present build
Scope: 9 of 10 workspace projects
apps/api build: Placeholder build for @wordle-royale/api
apps/mobile build: Placeholder build for @wordle-royale/mobile
apps/web build: Placeholder build for @wordle-royale/web
packages/fixtures build: Done
packages/rating-tools build: Placeholder build for @wordle-royale/rating-tools
packages/game-engine build: Done
packages/design-tokens build: Done
packages/contracts build: Done
packages/word-tools build: Done
```

### Command 13

```bash
git status --short
```

Exit code: `128`

Output:

```text
fatal: not a git repository (or any of the parent directories): .git
```

## Evidence/Result

Acceptance criteria evidence:

1. **Token package builds/typechecks:** passed via package typecheck/build and root `pnpm build`.
2. **Tokens include required categories:** implemented color, typography, spacing, radius, shadow/elevation, border, motion, tile, rank/score, lobby, connection, share-card, web CSS export, and native/plain-object export.
3. **Fixture catalog includes gameplay and lobby states:** implemented lobby and gameplay fixture modules plus scenario catalog covering active/invalid/pending/solved/failed/timed-out/reconnect/resync and waiting/ready/full/locked/rated-private-disabled lobbies.
4. **Accessibility notes encoded:** tile tokens include accessible labels, patterns/icons, notes, colorblind/high-contrast/reduced-motion metadata; connection tokens include ARIA live-region intent; README documents accessibility metadata.
5. **Response lists files changed and commands run:** included above.

## Risks/Blockers

- There is still no git repository in `/home/ashar/Desktop/hermes-projects/wordle-royale`, so I could not produce a normal `git diff` or tracked-file status.
- `dist/` artifacts were generated by build commands. A follow-up should decide whether package build outputs should be committed or ignored.
- Fixture types intentionally duplicate expected contract shapes for now because `@wordle-royale/contracts` is still only a placeholder. These should be replaced with shared contract imports after Ticket 19.
- The token values are implementation-ready but still need independent contrast/colorblind/reduced-motion QA before production polish.
- Optional visual preview was not implemented in this ticket to avoid scope creep.
