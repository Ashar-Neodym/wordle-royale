# Ticket 18 — Monorepo Foundation Scaffold — Response

## Summary

Created the initial pnpm monorepo scaffold for Wordle Royale so backend, frontend, mobile, contracts, game-engine, design-token, fixture, word-tooling, and rating-tooling work can proceed in parallel.

The scaffold includes:

- Root pnpm workspace files.
- Shared TypeScript base config.
- Lightweight formatting/ignore config.
- Placeholder app/package boundaries for all required workspaces.
- Minimal package manifests and README files.
- A root `pnpm typecheck` placeholder validation script that verifies the workspace scaffold.
- Safe empty data directories for future word/rating tooling.

No production infrastructure, secrets, paid resources, or production dictionary sources were added.

## Decisions / Recommendations

1. **Use placeholder validation until real package implementations land.**
   - `pnpm typecheck` currently runs `node scripts/validate-workspace.mjs`.
   - This satisfies the scaffold gate without pretending that real TypeScript app/package code exists yet.
   - Follow-up implementation tickets should replace/extend package-level `typecheck` scripts with real TypeScript checks.

2. **Create all required workspace boundaries now.**
   - Apps: `api`, `web`, `mobile`.
   - Packages: `contracts`, `game-engine`, `design-tokens`, `fixtures`, `word-tools`, `rating-tools`.

3. **Avoid heavyweight framework initialization in this ticket.**
   - No NestJS/Next.js/Expo generators were run.
   - This prevents premature framework defaults from blocking Freya/Luna/Yuna follow-up implementation tickets.

4. **Keep production word sources blocked by default.**
   - `.gitignore` ignores `packages/word-tools/data/raw/*` and generated dictionary outputs except `.gitkeep` placeholders.
   - This matches Athena's lock that production third-party word-list sources should not be committed until licensing is approved.

## Detailed Output

### Workspace files created

Root files:

```text
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json
.editorconfig
.gitignore
README.md
scripts/validate-workspace.mjs
```

App boundaries:

```text
apps/api/
apps/web/
apps/mobile/
```

Package boundaries:

```text
packages/contracts/
packages/game-engine/
packages/design-tokens/
packages/fixtures/
packages/word-tools/
packages/rating-tools/
```

### Root scripts added

```json
{
  "validate:workspace": "node scripts/validate-workspace.mjs",
  "typecheck": "pnpm validate:workspace",
  "lint": "pnpm validate:workspace",
  "test": "pnpm validate:workspace",
  "build": "pnpm -r --if-present build",
  "dev:web": "pnpm --filter @wordle-royale/web dev",
  "dev:api": "pnpm --filter @wordle-royale/api dev",
  "dev:mobile": "pnpm --filter @wordle-royale/mobile dev",
  "word:fixture:build": "pnpm --filter @wordle-royale/word-tools word:fixture:build",
  "rating:simulate": "pnpm --filter @wordle-royale/rating-tools rating:simulate"
}
```

### Workspace packages discovered by pnpm

`pnpm -r list --depth -1` confirmed these workspace projects:

```text
wordle-royale@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale (PRIVATE)

@wordle-royale/api@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/apps/api (PRIVATE)

@wordle-royale/mobile@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/apps/mobile (PRIVATE)

@wordle-royale/web@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/apps/web (PRIVATE)

@wordle-royale/contracts@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/packages/contracts (PRIVATE)

@wordle-royale/design-tokens@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens (PRIVATE)

@wordle-royale/fixtures@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures (PRIVATE)

@wordle-royale/game-engine@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/packages/game-engine (PRIVATE)

@wordle-royale/rating-tools@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools (PRIVATE)

@wordle-royale/word-tools@0.0.0 /home/ashar/Desktop/hermes-projects/wordle-royale/packages/word-tools (PRIVATE)
```

### Validation behavior

`pnpm typecheck` runs the scaffold validator and confirms:

- Required root files exist.
- Required app package manifests exist.
- Required shared/tool package manifests exist.
- Expected workspace package names are present.

## Open Questions

1. Should follow-up tickets use real TypeScript `tsc --noEmit` immediately, or wait until each package has actual implementation files and dependencies?
2. Should framework generators be run by the owning implementation agents (`Freya` for NestJS, `Luna` for Next.js/Expo), or should Ruby provide a second scaffold pass?
3. Should the repository be initialized as a git repository now, or is that handled outside the agent workflow? `git status --short` failed because this folder is not currently a git repository.

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/core server implementation.
- **Exact task:** Implement the NestJS backend foundation inside `apps/api`, replacing placeholder scripts with real `dev`, `build`, `typecheck`, and test commands.
- **Inputs/context they need:** `apps/api` scaffold, Ticket 10 contract amendments, Ticket 11 backend foundation plan.
- **Expected output back to Athena:** Backend files changed, commands run, typecheck/test evidence, and any schema/API blockers.

### Follow-up ticket 2

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns frontend/mobile/product-facing implementation.
- **Exact task:** Implement initial Next.js web scaffold in `apps/web`, Expo/mobile scaffold in `apps/mobile` if in scope, and design-token consumption from `packages/design-tokens`.
- **Inputs/context they need:** `apps/web`, `apps/mobile`, `packages/design-tokens`, Ticket 12 frontend plan, Ticket 17 token contract.
- **Expected output back to Athena:** App scaffold files, commands run, local render/build evidence, and UI blockers.

### Follow-up ticket 3

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns tooling/integrations.
- **Exact task:** Implement `packages/word-tools` fixture tooling in the scaffolded package and replace placeholder word-tool scripts with real commands.
- **Inputs/context they need:** `packages/word-tools`, Ticket 13 word import tooling plan, Ticket 20 implementation ticket.
- **Expected output back to Athena:** Files changed, fixture artifacts, validation command output, and no production word-source licensing violations.

### Follow-up ticket 4

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns simulation/tooling scripts.
- **Exact task:** Implement `packages/rating-tools` simulation runner and replace placeholder rating scripts with real scenario/simulation/report commands.
- **Inputs/context they need:** `packages/rating-tools`, Ticket 15 MMR simulation plan, Ticket 24 implementation ticket.
- **Expected output back to Athena:** Simulation scripts, sample reports, commands run, and recommended tuning evidence.

### Follow-up ticket 5

- **Target agent:** Yuna
- **Why that agent is needed:** Yuna owns local dev, CI, infrastructure, and runtime reliability.
- **Exact task:** Add Docker Compose for local PostgreSQL 16/Redis 7, environment examples without secrets, and initial CI skeleton using the scaffolded workspace scripts.
- **Inputs/context they need:** Root workspace scaffold, Ticket 16 local dev/CI/ops plan, Ticket 22 implementation ticket.
- **Expected output back to Athena:** Docker/CI files changed, exact local commands, verification output, and any environment risks.

### Follow-up ticket 6

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA/release confidence.
- **Exact task:** Verify the scaffold acceptance criteria independently: pnpm install, workspace package discovery, root validation/typecheck, no secrets, and no production dictionary sources.
- **Inputs/context they need:** This response file and the scaffolded repository.
- **Expected output back to Athena:** Independent QA evidence with pass/fail results and any blockers.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/.editorconfig`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/.gitignore`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/pnpm-workspace.yaml`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/pnpm-lock.yaml`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/tsconfig.base.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/scripts/validate-workspace.mjs`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/apps/api/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/apps/api/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/apps/api/src/.gitkeep`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/apps/web/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/apps/web/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/apps/web/src/.gitkeep`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/apps/mobile/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/apps/mobile/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/apps/mobile/src/.gitkeep`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/contracts/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/contracts/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/contracts/tsconfig.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/contracts/src/index.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/game-engine/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/game-engine/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/game-engine/tsconfig.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/game-engine/src/index.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/tsconfig.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/design-tokens/src/index.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/tsconfig.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/fixtures/src/index.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/word-tools/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/word-tools/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/word-tools/tsconfig.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/word-tools/src/index.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/word-tools/data/raw/.gitkeep`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/word-tools/data/generated/.gitkeep`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/word-tools/data/fixtures/.gitkeep`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/word-tools/data/reports/.gitkeep`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/README.md`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/package.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/tsconfig.json`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/src/index.ts`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/scenarios/.gitkeep`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/packages/rating-tools/data/reports/.gitkeep`
- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-18-ruby-monorepo-foundation-scaffold-response.md`

Generated locally by `pnpm install` but not listed as source files:

- `/home/ashar/Desktop/hermes-projects/wordle-royale/node_modules/`

## Tests / Commands Run

### Command 1

```bash
pnpm --version
```

Exit code: `0`

Output:

```text
11.1.1
```

### Command 2

```bash
pnpm install
```

Exit code: `0`

Output:

```text
Scope: all 10 workspace projects
Already up to date

Done in 1s using pnpm v11.1.1

   ╭─────────────────────────────────────────╮
   │                                         │
   │   Update available! 11.1.1 → 11.8.0.    │
   │   Changelog: https://pnpm.io/v/11.8.0   │
   │    To update, run: pnpm add -g pnpm     │
   │                                         │
   ╰─────────────────────────────────────────╯
```

### Command 3

```bash
pnpm typecheck
```

Exit code: `0`

Output:

```text
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).
```

### Command 4

```bash
pnpm -r list --depth -1
```

Exit code: `0`

Output: workspace package list shown in Detailed Output.

### Command 5

```bash
git status --short
```

Exit code: `128`

Output:

```text
fatal: not a git repository (or any of the parent directories): .git
```

This is not a scaffold failure; it indicates the project folder has not been initialized as a git repository.

### Command 6

```text
Hermes execute_code validation for dictionary/source safety
```

Exit status: success

Output:

```text
raw entries ['.gitkeep']
generated entries ['.gitkeep']
env files []
```

## Evidence / Result

Acceptance criteria evidence:

1. **`pnpm install` works:** passed with exit code `0`.
2. **Workspace packages are discoverable by pnpm:** passed; `pnpm -r list --depth -1` listed root + 9 workspace projects.
3. **Root `pnpm typecheck` or placeholder validation exists:** passed; `pnpm typecheck` ran `scripts/validate-workspace.mjs` and exited `0`.
4. **No production dictionary sources or secrets added:** verified only `.gitkeep` files exist under word-tool raw/generated directories, and no `.env` files were created.
5. **Response lists files changed and commands run:** included above.

## Risks / Blockers

- **Git repository blocker:** `git status --short` failed because `/home/ashar/Desktop/hermes-projects/wordle-royale` is not currently a git repository. If version control is required, Athena/Ashar should decide whether to initialize git here.
- **Placeholder script risk:** `pnpm typecheck` is scaffold validation only, not real TypeScript compiler validation. Follow-up implementation tickets must add actual `tsc --noEmit` checks once dependencies/code are present.
- **Framework setup deferred:** NestJS, Next.js, and Expo were not initialized in this ticket; owning implementation agents should add them in focused follow-up tickets.
- **No CI/local infra yet:** Docker Compose, env examples, and GitHub Actions remain for Yuna/Ticket 22.
- **No production word sources:** This is intentional for licensing safety; word tooling must continue to avoid committing unapproved third-party dictionary sources.
