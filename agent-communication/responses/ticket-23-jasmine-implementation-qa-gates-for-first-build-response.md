# Ticket 23 — Implementation QA Gates for First Build — Response

## Summary

Created the first-build QA gate checklist for Wordle Royale, mapped to Tickets 18–22:

- Ticket 18 — Monorepo Foundation Scaffold
- Ticket 19 — Game Engine Core Implementation
- Ticket 20 — Word Fixture Tooling Implementation
- Ticket 21 — Design Tokens and UI Fixture Foundation
- Ticket 22 — Local Dev Docker/Env/CI Skeleton

This deliverable defines pass/fail criteria, release blockers, follow-up warnings, and required evidence/commands for Athena to use when reviewing the first implementation wave.

This is a QA planning/spec task. I did not implement application code. I did run limited local inspection/verification commands to ground the checklist and found a current command failure that should be treated as a build-readiness risk before final first-build approval.

## Decisions / Recommendations

1. **Use Ticket 10 + the 2026-06-22 Tickets 11–17 decision lock as controlling implementation contracts.** Ticket 02 alone is not sufficient.
2. **First-build approval should require every Ticket 18–22 owner response to include exact commands, exit codes, and changed file paths.** Self-reports without command evidence should not pass.
3. **Root CI/build commands must be non-interactive.** A first build cannot pass if `pnpm install`, `pnpm typecheck`, or CI prompts for manual approval or fails because of ignored build scripts.
4. **Duplicate-letter feedback is a release blocker, not a nice-to-have.** Ticket 19 must prove the two-pass algorithm with explicit duplicate-letter fixtures.
5. **Idempotency readiness must appear in contracts/types even before database/backend wiring.** This first wave should not implement client-authoritative or one-shot-only assumptions.
6. **Consent enum spelling is locked:** `training_insights_opt_in`. Any drift is a blocker because analytics/privacy contracts will spread quickly.
7. **Only fixture dictionary data is allowed.** No production/proprietary third-party word lists should be committed during this wave.
8. **Ticket 22 must keep Docker local-only and restricted to PostgreSQL 16 + Redis 7.** Any cloud resource, production deployment, real secret, or paid-resource action is out of scope.
9. **Design tokens must encode accessibility, not just brand colors.** Colorblind/high-contrast/reduced-motion support is part of the first-build gate.
10. **Current local risk:** `pnpm typecheck` failed in this environment due pnpm install/build-approval behavior around `esbuild`. This should be resolved or explicitly explained before Athena considers the first build green.

## Detailed Output

## 1. Global First-Build QA Gate

The first build wave can be marked **PASS** only if all of the following are true:

| Gate | Requirement | Blocker if missing? |
|---|---|---|
| Workspace integrity | Required monorepo apps/packages exist and are discoverable by pnpm | Yes |
| Non-interactive install/checks | `pnpm install` / `pnpm typecheck` / CI checks run without interactive prompts | Yes |
| Contracts baseline | Shared contracts include locked enums and idempotency-ready request shapes | Yes |
| Game-engine correctness | Duplicate-letter, scoring, ties, and validation tests pass | Yes |
| Fixture dictionary safety | Only safe fixture data committed; no production/proprietary word sources | Yes |
| Consent enum | `training_insights_opt_in` exact spelling exists where consent scopes are defined | Yes |
| Secret safety | No real credentials, tokens, production URLs, private keys, or paid-resource configs committed | Yes |
| Local infra scope | Docker Compose contains PostgreSQL 16 and Redis 7 only | Yes |
| UI/accessibility fixtures | Tokens/fixtures include tile states, colorblind/high-contrast/reduced-motion metadata or docs | Yes for Ticket 21 acceptance |
| Evidence quality | Each owner response lists files changed, commands, exit codes, and known risks | Yes |

## 2. Ticket-by-Ticket QA Checklist

## Ticket 18 — Monorepo Foundation Scaffold

### Pass/fail criteria

| Check | PASS condition | FAIL condition | Severity |
|---|---|---|---|
| Package manager | Root `package.json` uses `pnpm`; workspace uses pnpm workspaces | npm/yarn-only setup or missing workspace config | Blocker |
| Workspace layout | Required paths exist: `apps/api`, `apps/web`, `apps/mobile`, `packages/contracts`, `packages/game-engine`, `packages/design-tokens`, `packages/fixtures`, `packages/word-tools`, `packages/rating-tools` | Any required workspace missing | Blocker |
| Package names | pnpm discovers all expected package names | Missing/wrong package names | Blocker |
| Root scripts | Root scripts exist for at least `typecheck`, `lint`, `test`, `build`, and package-specific dev/tooling placeholders | No consistent root command surface | Warning initially; blocker once downstream tickets land |
| TypeScript baseline | Shared tsconfig exists and package tsconfigs can extend it | No TypeScript baseline | Blocker |
| Production safety | No production infra, real secrets, or production dictionary data added | Any real credential/source list/deployment config committed | Blocker |
| Evidence | Ruby response includes files changed and commands with exit codes | Missing evidence | Blocker for Athena approval |

### Exact verification commands

Run from project root:

```bash
pnpm --version
pnpm install --frozen-lockfile
pnpm -r list --depth -1
node scripts/validate-workspace.mjs
pnpm typecheck
pnpm lint
pnpm test
```

Additional file inspection gates:

```bash
node -e "const fs=require('fs'); for (const p of ['apps/api/package.json','apps/web/package.json','apps/mobile/package.json','packages/contracts/package.json','packages/game-engine/package.json','packages/design-tokens/package.json','packages/fixtures/package.json','packages/word-tools/package.json','packages/rating-tools/package.json']) { if (!fs.existsSync(p)) { console.error('missing', p); process.exitCode=1; } }"
```

### Required evidence from Ruby

- Output of `pnpm install --frozen-lockfile` or explanation if lockfile was intentionally generated first.
- Output of `pnpm -r list --depth -1` showing all workspaces.
- Output of `pnpm typecheck` or scaffold validation.
- Confirmation that no production word sources or `.env` files were committed.
- Exact file list changed.

### Release blockers

- Missing required workspace/package.
- Root commands cannot run non-interactively.
- Any real secret or production dictionary source committed.
- Package manager not pnpm.

### Follow-up warnings

- Placeholder `typecheck`/`test` scripts are acceptable for Ticket 18 only, but must be replaced/extended by Tickets 19–22.
- Project folder currently may not be initialized as a git repo; this affects `git`-based checks until Ashar/Athena decide repository handling.

## Ticket 19 — Game Engine Core Implementation

### Pass/fail criteria

| Check | PASS condition | FAIL condition | Severity |
|---|---|---|---|
| Pure functions | `packages/game-engine` exports deterministic pure functions with no DB/network/client authority dependencies | Logic depends on browser/backend mutable state or client authority | Blocker |
| Normalization | Trim/lowercase/length handling is implemented and tested | Input normalization missing/ambiguous | Blocker |
| Guess validation | Result types distinguish valid, wrong length, invalid characters, not in list, banned/sensitive | Generic boolean-only validation | Warning initially; blocker before backend integration |
| Duplicate-letter feedback | Two-pass Wordle algorithm passes fixtures | Any duplicate-letter fixture fails | Blocker |
| Score formula | `standard_v1` score fixtures pass | Scoring examples mismatch | Blocker |
| Tie-breaker | Deterministic standings order tested | Ties are nondeterministic | Blocker |
| Rating helper | Implemented with locked defaults or explicitly deferred to Ticket 24 with reason | Silent omission | Blocker for Ticket 19 acceptance |
| No client authority | No API suggests client-supplied score/time/feedback/rating is authoritative | Client-authoritative assumptions introduced | Blocker |
| Evidence | Freya response includes commands and exit codes | Missing command evidence | Blocker |

### Required duplicate-letter fixtures

Ticket 19 must include tests equivalent to these cases using exact feedback values `correct`, `present`, `absent`:

| Answer | Guess | Expected feedback |
|---|---|---|
| `apple` | `allee` | `correct present absent absent correct` |
| `cigar` | `civic` | `correct correct absent absent absent` |
| `belle` | `level` | `present correct absent present absent` |
| `allee` | `eagle` | `present present absent present correct` |
| `mamma` | `maxim` | `correct correct absent absent present` |
| `array` | `rarer` | `present present absent absent present` |
| `banal` | `llama` | `absent absent present absent present` |

Required invariants:

- Non-absent count for any letter must never exceed that letter’s answer count.
- Exact-position matches must be allocated before present-position matches.
- Feedback length always equals word length.
- Guess and answer are normalized before scoring.

### Required scoring/tie/rating checks

- Score example: 3 guesses at 45s of 120s = `100 + 40 + round(50 * 75/120) = 171`.
- Score example: 5 guesses at 90s of 120s = `100 + 10 + round(50 * 30/120) = 122`.
- Timeout/failed round = `0`.
- 1 guess at 10s of 120s = `206`.
- Invalid guesses do not affect valid guess count or score.
- Tie-breaker order: total score → rounds solved → total valid guesses → total solve ms → final-round result → best single-round score → declared tie.
- MMR locked defaults if implemented: base rating `1500`, established K candidate `24`, provisional K `36` or `1.5x` for first 10 rated matches, caps ±40 established / ±60 provisional.

### Exact verification commands

Run from project root after Ticket 19:

```bash
pnpm --filter @wordle-royale/game-engine typecheck
pnpm --filter @wordle-royale/game-engine test
pnpm test
pnpm typecheck
```

If package scripts use a different test runner, Freya must document the exact replacement command and output.

### Release blockers

- Duplicate-letter tests missing or failing.
- Score/tie tests missing or failing.
- Client-authoritative assumptions introduced.
- Rating helper silently omitted instead of implemented or explicitly deferred to Ticket 24.

### Follow-up warnings

- Property/fuzz tests can be follow-up if deterministic fixture tests pass, but must be added before public release.
- Backend/API wiring is explicitly out of scope for Ticket 19.

## Ticket 20 — Word Fixture Tooling Implementation

### Pass/fail criteria

| Check | PASS condition | FAIL condition | Severity |
|---|---|---|---|
| Fixture command | Fixture generation command exists and runs | No runnable fixture command | Blocker |
| Determinism | Running fixture build twice produces identical artifacts/checksums | Nondeterministic output without reason | Blocker |
| Safe data only | Fixture lists are small and clearly non-production | Production/proprietary source committed | Blocker |
| Validation | Tool catches wrong length, duplicates, answer/guess conflicts, banned conflicts | Validation incomplete/missing | Blocker |
| Manifest/checksum | Generated manifest includes version/source metadata/checksum | No manifest/checksum | Warning initially; blocker before integration |
| Consent enum | Contracts include `training_insights_opt_in` exactly if consent schemas touched | Enum spelling drift | Blocker |
| Source metadata | Source metadata template exists without claiming production licensing approval | Missing provenance path | Warning |
| Evidence | Ruby response includes commands, outputs, file list | Missing evidence | Blocker |

### Exact verification commands

Run from project root after Ticket 20:

```bash
pnpm --filter @wordle-royale/contracts typecheck
pnpm --filter @wordle-royale/contracts test
pnpm --filter @wordle-royale/word-tools typecheck
pnpm --filter @wordle-royale/word-tools test
pnpm word:fixture:build
pnpm --filter @wordle-royale/word-tools word:validate
```

Determinism check, if artifacts are generated under `packages/word-tools/data/generated/`:

```bash
pnpm word:fixture:build
sha256sum packages/word-tools/data/generated/* > /tmp/word-fixtures-first.sha256
pnpm word:fixture:build
sha256sum packages/word-tools/data/generated/* > /tmp/word-fixtures-second.sha256
diff /tmp/word-fixtures-first.sha256 /tmp/word-fixtures-second.sha256
```

If generated fixture paths differ, Ruby must provide the exact deterministic checksum command in the Ticket 20 response.

### Required fixture/content checks

- Answer list and valid-guess list are separate.
- Fixture words are 5-letter English V1 examples only.
- Banned/sensitive placeholder list uses non-slur placeholders only.
- Severe offensive/slur terms are not included as test strings.
- Raw/proprietary production word lists are absent.
- Dictionary/list manifest includes version and source metadata template.
- Validation reports include counts and rejection reasons.

### Release blockers

- Production/proprietary word source committed.
- Validation does not catch duplicates or length errors.
- Generated artifacts are nondeterministic.
- Consent enum spelling drift if contracts are changed.

### Follow-up warnings

- Production dictionary licensing remains a later public-release blocker, not a local fixture blocker.
- Fixture list quality does not need to represent final gameplay difficulty yet.

## Ticket 21 — Design Tokens and UI Fixture Foundation

### Pass/fail criteria

| Check | PASS condition | FAIL condition | Severity |
|---|---|---|---|
| Token package | `packages/design-tokens` builds/typechecks | Token package cannot typecheck/build | Blocker |
| Token coverage | Color, typography, spacing, radius, shadow, motion, tile, rank, lobby, connection states exist | Major categories missing | Blocker for Ticket 21 |
| Accessibility metadata | Tile states include non-color cues or metadata/docs for colorblind/high-contrast/reduced-motion | Color-only feedback | Blocker |
| Web/native exports | CSS variables and React Native/plain object exports exist if practical; otherwise documented deferral | Silent omission | Warning initially; blocker before frontend integration |
| Fixtures | `packages/fixtures` includes gameplay and lobby state fixtures | No gameplay/lobby fixtures | Blocker |
| Share-card safety | Share-card tokens/fixtures avoid spoilers | Spoiler content in public share fixtures | Blocker |
| Evidence | Luna response includes commands, file list, and if visual preview exists, screenshots or description | Missing evidence | Blocker |

### Exact verification commands

Run from project root after Ticket 21:

```bash
pnpm --filter @wordle-royale/design-tokens typecheck
pnpm --filter @wordle-royale/design-tokens build
pnpm --filter @wordle-royale/design-tokens test
pnpm --filter @wordle-royale/fixtures typecheck
pnpm --filter @wordle-royale/fixtures test
pnpm typecheck
```

If a lightweight preview is added:

```bash
pnpm --filter @wordle-royale/web dev
```

Then Jasmine should browser-smoke the preview route and capture screenshots/console output.

### Required accessibility checks

- `correct`, `present`, `absent`, `empty`, `invalid`, `submitted`, and focus states are distinguishable beyond color alone.
- Colorblind/high-contrast notes or metadata are encoded in tokens/docs.
- Reduced-motion metadata exists for animations/transitions.
- Focus ring/token is visible against light and dark/arena backgrounds.
- Connection/reconnect/error states have clear semantic labels.
- Lobby/ranked badges are not solely color-coded.

### Release blockers

- Tile feedback relies only on color.
- Gameplay/lobby fixtures missing.
- Token package cannot typecheck/build.
- Spoiler content appears in public share-card fixtures.

### Follow-up warnings

- Full WCAG contrast certification can be separate Jasmine follow-up after visual preview/components exist.
- Storybook/dev preview is useful but optional in this ticket unless Luna claims it was implemented.

## Ticket 22 — Local Dev Docker/Env/CI Skeleton

### Pass/fail criteria

| Check | PASS condition | FAIL condition | Severity |
|---|---|---|---|
| Docker services | `docker-compose.yml` defines PostgreSQL 16 and Redis 7 only | Extra cloud/prod services or wrong versions | Blocker |
| Local-only scope | No paid resources, production deployment, provider-specific secret mutation | Any production/payout side effect | Blocker |
| Env examples | `.env.example` / `.env.local.example` contain placeholders only | Real-looking secrets, tokens, production URLs | Blocker |
| Root scripts | Local infra scripts exist if compatible: up/down/reset/smoke | Missing scripts acceptable only if documented | Warning initially |
| CI skeleton | GitHub Actions PR check does not require unavailable secrets | CI requires secrets or production access | Blocker |
| Non-interactive checks | CI commands run without prompts | CI hangs/fails due interactive pnpm approval | Blocker |
| Documentation | Local setup docs include exact commands and expected outputs | Missing docs | Warning initially; blocker before onboarding new devs |
| Evidence | Yuna response includes commands, exit codes, files changed | Missing evidence | Blocker |

### Exact verification commands

Run from project root after Ticket 22:

```bash
docker compose config
docker compose up -d postgres redis
docker compose ps
docker compose exec postgres pg_isready -U wordle -d wordle_royale_local
docker compose exec redis redis-cli ping
docker compose down
```

Root/CI command checks:

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm typecheck
CI=true pnpm lint
CI=true pnpm test
```

CI file checks once `.github/workflows/` exists:

```bash
node -e "const fs=require('fs'); const p='.github/workflows'; if (!fs.existsSync(p)) { console.error('missing CI workflow directory'); process.exit(1); }"
```

### Env/secret-safety checks

The env examples must use placeholders and local-only values, for example:

- `DATABASE_URL=postgresql://wordle:wordle_local_password@localhost:5432/wordle_royale_local`
- `REDIS_URL=redis://localhost:6379`
- Placeholder values such as `replace-me`, `local-dev-only`, or `changeme-for-local-dev`

Blockers:

- Production hostnames in env examples.
- Real API keys/tokens/JWT secrets/private keys.
- Checked-in `.env` files with non-example names.
- GitHub Actions requiring production secrets for PR checks.

### Release blockers

- Docker Compose includes anything beyond local PostgreSQL/Redis without Athena approval.
- Real secret committed.
- CI cannot run in a clean non-interactive environment.
- Docker health checks fail with documented local setup.

### Follow-up warnings

- Provider-specific deployment is deferred and should not be added here.
- Backup/restore and deployment release gates are later Yuna tasks, not first local skeleton blockers.

## 3. Cross-Ticket Required Evidence Matrix

| Ticket | Required owner evidence | Minimum Jasmine verification before PASS |
|---|---|---|
| 18 | Files changed, `pnpm install`, workspace list, root validation/typecheck, no secrets/no prod dictionary | Re-run root install/check/list; inspect workspace paths; secret/source scan |
| 19 | Files changed, game-engine test/typecheck output, duplicate-letter/scoring/tie/rating evidence | Re-run game-engine tests; inspect fixtures; verify no client authority assumptions |
| 20 | Files changed, fixture build/validate output, checksum/manifest evidence, no prod sources | Re-run fixture build twice; compare checksums; inspect raw/generated data |
| 21 | Files changed, token/fixture typecheck/build output, accessibility metadata notes, optional preview evidence | Re-run token/fixture checks; inspect token state coverage; browser-smoke preview if present |
| 22 | Files changed, Docker/CI/env commands output, no real secrets, local-only docs | Run Docker config/up/health/down if Docker available; run CI=true pnpm checks; inspect env/workflows |

## 4. Release Blockers vs Follow-Up Warnings

### Release blockers for the first build wave

- Root install/typecheck/test commands fail in a way not documented or not fixable by normal setup.
- Any Ticket 18–22 response lacks files changed and command evidence.
- Any real secret, token, private key, production database URL, or paid-resource configuration is committed.
- Any production/proprietary third-party word source is committed.
- Duplicate-letter feedback tests are missing or failing.
- Consent enum spelling differs from `training_insights_opt_in`.
- Docker Compose includes non-local services or anything beyond PostgreSQL 16 and Redis 7.
- UI tile feedback is color-only with no accessibility metadata/docs.
- Client-authoritative scoring, timing, feedback, rating, or validation assumptions appear in game-engine/contracts.
- CI requires unavailable secrets or interactive prompts.

### Follow-up warnings, not first-build blockers if documented

- Expo mobile app remains placeholder after Ticket 18.
- NestJS/Next.js framework generators are deferred to later implementation tickets.
- Full Storybook/visual preview is deferred.
- Property/fuzz tests are deferred after deterministic game-engine fixtures pass.
- Production dictionary licensing remains unresolved, as long as only safe local fixtures are used.
- Public beta load targets remain unresolved.
- Legal/trademark risk for `Wordle Royale` remains unresolved for public launch.
- Full admin UI remains deferred, as long as no ranked/public launch claim is made.

## 5. No-Secret / No-Production-Source QA Checks

### Required checks

- Search for real-looking secrets, tokens, private keys, production URLs, and non-example env files.
- Check `.env*` files are examples/placeholders only.
- Check `packages/word-tools/data/raw/` contains only `.gitkeep` or explicitly approved fixture metadata.
- Check generated dictionary artifacts are fixture-sized and have source metadata.
- Check CI workflow does not reference production secrets for PR checks.

### First-build pass criteria

- Local placeholder passwords in Docker/env examples are acceptable only if clearly local and documented.
- Real credentials are never acceptable.
- Production/proprietary dictionary sources are never acceptable in this wave.
- Node dependency folders may exist locally after commands but should not be treated as source deliverables.

## 6. Current Local Observations From This QA Run

These observations are from limited local inspection while preparing this planning checklist. They are not a full implementation QA pass.

| Observation | Result | QA impact |
|---|---|---|
| Ticket 18 response exists | Found `agent-communication/responses/ticket-18-ruby-monorepo-foundation-scaffold-response.md` | Used as dependency input |
| Ticket 19–22 response files | Not found at time of initial response search | Expected if those tickets have not completed yet |
| Decision lock 11–17 exists | Found and reviewed | Used as controlling first-build lock |
| Root `package.json` | Found pnpm scripts and workspace commands | Used for command recommendations |
| `packages/word-tools/package.json` and `packages/contracts/package.json` | Found real scripts/deps in current tree | Indicates some later implementation files may already exist even without response files |
| `docker-compose.yml` | Found PostgreSQL 16 and Redis 7 local services | Good sign for Ticket 22 scope, but not fully verified |
| `packages/word-tools/data/` | File search showed only `.gitkeep` entries under raw/generated/fixtures/reports at the time of search | Good sign for no production word-source gate |
| Secret-pattern search | Returned many documentation/spec references plus local Docker `POSTGRES_PASSWORD: wordle_local_password` | Local-only placeholder likely acceptable; requires full source-level review excluding docs/node_modules before final pass |
| `pnpm typecheck` | Failed in this environment | Build-readiness risk; see Tests / Commands Run |

## Open Questions

1. Should first-build QA require all Ticket 19–22 responses to exist before Jasmine performs a full pass/fail verification, or should Jasmine verify each ticket independently as it arrives?
2. Should `pnpm approve-builds` / `allowBuilds` policy be explicitly managed by Yuna so CI can run without pnpm interactive build-approval failures?
3. Should local placeholder passwords such as `wordle_local_password` be standardized as acceptable in `.env.example`/Docker files, or should examples use only `replace-me-local` style placeholders?
4. Should the repo be initialized as a git repository before final first-build QA? Git-based changed-file and secret scans are less reliable without it.
5. Should Ticket 20 own consent enum schemas in `packages/contracts`, or should Elisa/Freya own all shared analytics/privacy contract types?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Yuna
- **Why that agent is needed:** Current pnpm checks failed in a non-interactive environment due install/build approval behavior.
- **Exact task:** Ensure root `CI=true pnpm install --frozen-lockfile`, `CI=true pnpm typecheck`, `CI=true pnpm lint`, and `CI=true pnpm test` run non-interactively. Resolve pnpm `approve-builds` / `allowBuilds` policy for dependencies such as `esbuild` without requiring manual prompts in CI.
- **Inputs/context they need:** This Ticket 23 response, current root `package.json`, `pnpm-workspace.yaml`, and observed command failure output.
- **Expected output back to Athena:** Files changed, exact commands run with exit codes, and explanation of pnpm build-script policy.

### Follow-up ticket 2

- **Target agent:** Freya
- **Why that agent is needed:** Game-engine correctness is a P0 release blocker.
- **Exact task:** When completing Ticket 19, include deterministic tests for duplicate-letter fixtures, score examples, tie-breaker order, invalid guess handling, and rating helper implementation/defer decision.
- **Inputs/context they need:** Ticket 19 assignment, Ticket 04 spec, Ticket 14 release gates, this Ticket 23 checklist.
- **Expected output back to Athena:** Ticket 19 response with files changed and command outputs proving tests pass.

### Follow-up ticket 3

- **Target agent:** Ruby
- **Why that agent is needed:** Word fixture tooling must prove deterministic and safe fixture output.
- **Exact task:** When completing Ticket 20, provide fixture build/validate commands, deterministic checksum evidence, validation failure coverage, and confirmation that no production/proprietary sources were committed.
- **Inputs/context they need:** Ticket 20 assignment, Ticket 13 plan, decision lock 11–17, this Ticket 23 checklist.
- **Expected output back to Athena:** Ticket 20 response with generated artifact paths, manifest/checksum evidence, and command outputs.

### Follow-up ticket 4

- **Target agent:** Luna
- **Why that agent is needed:** Design-token and UI fixture accessibility must be testable before UI implementation spreads.
- **Exact task:** When completing Ticket 21, include token build/typecheck output, fixture catalog coverage, and accessibility metadata/docs for colorblind, high-contrast, reduced-motion, focus, tile, lobby, rank, and connection states.
- **Inputs/context they need:** Ticket 21 assignment, Ticket 17 brand token plan, this Ticket 23 checklist.
- **Expected output back to Athena:** Ticket 21 response with files changed, command outputs, and visual/fixture evidence if preview exists.

### Follow-up ticket 5

- **Target agent:** Jasmine
- **Why that agent is needed:** This ticket is a checklist, not the final verification pass.
- **Exact task:** After Tickets 19–22 responses are available, perform independent QA verification of the first build wave by re-running owner commands, inspecting changed files, checking no-secret/no-production-source gates, and reporting PASS/FAIL/BLOCKED.
- **Inputs/context they need:** Responses for Tickets 18–22 and current repository state.
- **Expected output back to Athena:** Independent verification report with exact commands, exit codes, findings, and release-gate verdict.

## Files Changed

- Created `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-23-jasmine-implementation-qa-gates-for-first-build-response.md`

No application/source files were intentionally changed by this ticket. Local `pnpm` commands may have recreated/generated `node_modules/` as a side effect; those are dependency artifacts, not source deliverables.

## Tests / Commands Run

This was a QA planning/spec task, but I ran limited local inspection commands to ground the checklist.

### Command 1

```bash
pnpm --version && pnpm typecheck
```

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Exit code: `1`

Observed output summary:

```text
11.1.1
Scope: all 10 workspace projects
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY
...
[ERROR] Command failed with exit code 1: pnpm install
```

### Command 2

```bash
CI=true pnpm typecheck
```

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Exit code: `1`

Observed output summary:

```text
Scope: all 10 workspace projects
Recreating /home/ashar/Desktop/hermes-projects/wordle-royale/node_modules
Lockfile is up to date, resolution step is skipped
...
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.1

Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
[ERROR] Command failed with exit code 1: pnpm install
```

### File/tool inspections performed

- Read Ticket 23 assignment.
- Read Ticket 14 response.
- Read current decision lock: `docs/2026-06-22-athena-decision-locks-after-tickets-11-17.md`.
- Read Ticket 18 response.
- Read Ticket 19, 20, 21, and 22 ticket files.
- Read root `package.json`, `pnpm-workspace.yaml`, and `scripts/validate-workspace.mjs`.
- Read `packages/word-tools/package.json`, `packages/contracts/package.json`, and `docker-compose.yml`.
- Searched response files for Tickets 20–22; none were found at the time of search.
- Searched `packages/word-tools/data/`; only `.gitkeep` files were found under raw/generated/fixtures/reports at the time of search.
- Ran a broad secret-pattern content search; results included many docs/spec references and a local Docker placeholder password. This was not a full source-only secret audit.

## Evidence / Result

Created the requested response file at:

`/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-23-jasmine-implementation-qa-gates-for-first-build-response.md`

Acceptance criteria coverage:

1. **QA checklist maps each first-build ticket to pass/fail criteria:** Covered in section 2.
2. **Includes exact verification commands where possible:** Covered under each ticket and section 3.
3. **Flags release blockers vs follow-up warnings:** Covered in each ticket section and section 4.
4. **Includes duplicate-letter, idempotency-readiness, consent enum, fixture dictionary, and secret-safety checks:** Covered in sections 1–5.
5. **Response is a Markdown file only; no app code needed:** This file was created; no application/source implementation was intentionally changed.

## Risks / Blockers

1. **Current command blocker:** `pnpm typecheck` failed locally due pnpm install/build-approval behavior around `node_modules`/`esbuild`. Yuna should fix or document the required non-interactive pnpm policy before first-build approval.
2. **This is not the final first-build verification pass.** Tickets 19–22 response files were not found at the time of search, so this response defines gates rather than approving implementation.
3. **No git repository assumption is safe yet.** If the folder remains non-git, QA needs non-git file-diff and secret-scan alternatives.
4. **Secret scan was broad and noisy.** It found documentation references and a local Docker placeholder; final QA should run a source-focused scan excluding docs and `node_modules`.
5. **Some current implementation files appear to exist without corresponding agent responses.** `packages/word-tools`, `packages/contracts`, `.env.local.example`, and `docker-compose.yml` are present in the tree, but Tickets 20–22 responses were not found during this ticket. Athena should ensure each implementation owner creates the required response file before marking their ticket complete.
6. **Production dictionary licensing remains unresolved by design.** This blocks public/production release, not safe local fixture work.
7. **Legal/trademark and public beta load targets remain later release gates.** They do not block local first-build scaffolding unless the build claims public-release readiness.
