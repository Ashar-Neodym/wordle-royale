# Ticket 20 — Word Fixture Tooling Implementation — Response

## Summary

Implemented the initial safe fixture dictionary tooling for `packages/word-tools` and shared word-library schemas in `packages/contracts`.

Delivered:

- Shared Zod schemas/types/constants for word-list artifacts, manifests, and validation reports.
- `word-tools` CLI commands for safe fixture generation and manifest validation.
- Small hand-curated fixture answer list, valid-guess list, and non-slur banned placeholder list.
- Deterministic manifest/checksum generation.
- Fixture validation report generation.
- Tests covering normalization, schema parsing, fixture determinism, and validation failures for invalid length/format, duplicates, answer/guess separation, and banned-list conflicts.

No production dictionary source was imported or committed. Raw/generated production-style directories still contain only `.gitkeep` placeholders.

## Decisions/Recommendations

1. **Use only hand-curated fixture words for Ticket 20.**
   - This keeps local/game/backend tests unblocked without violating the production dictionary licensing gate.

2. **Use non-offensive banned placeholders.**
   - Banned fixture entries are `xxxxx`, `yyyyy`, and `zzzzz`, matching Ticket 13's recommendation to avoid committed slurs/profanity.

3. **Keep fixture artifacts deterministic.**
   - Fixture generation uses fixed timestamps, sorted words, stable JSON serialization, and SHA-256 checksums.

4. **Use Node's built-in test runner.**
   - Avoided heavier test framework setup. `typescript`, `@types/node`, and `zod` are the only added package dependencies for these packages.

5. **Use `pnpm install --recursive` when workspace links are missing.**
   - After removing a mistakenly generated nested output directory, workspace package links needed `pnpm install --recursive --no-frozen-lockfile` to restore `@wordle-royale/contracts` linkage under `packages/word-tools/node_modules`.

## Detailed Output

### Contracts implemented

Created `packages/contracts/src/word-library/` with:

- `constants.ts`
- `schemas.ts`
- `types.ts`
- `schemas.test.ts`

Schemas include:

- `wordEntrySchema`
- `wordListArtifactSchema`
- `wordLibraryManifestSchema`
- `validationReportSchema`

The contracts package now exports the word-library modules from `packages/contracts/src/index.ts`.

### Word tools implemented

Created/updated `packages/word-tools/src/` with:

- `normalize.ts` — lowercase ASCII 5-letter normalization and duplicate-letter detection.
- `validate.ts` — fixture list validation and validation report construction.
- `checksum.ts` — deterministic stable JSON serialization and SHA-256 hashing.
- `fixtures.ts` — safe fixture list definitions, artifact construction, manifest construction, and file writing.
- `cli.ts` — CLI parser/runner for fixture generation and manifest validation.
- `*.test.ts` tests for the above.

### CLI commands

```bash
pnpm word:fixture:build
pnpm --filter @wordle-royale/word-tools word:validate -- --input packages/word-tools/data/fixtures/manifest.fixture.json
pnpm --filter @wordle-royale/word-tools word-tools -- --help
```

### Generated fixture artifacts

```text
packages/word-tools/data/fixtures/en-5-test-answer-vfixture.001.json
packages/word-tools/data/fixtures/en-5-test-guess-vfixture.001.json
packages/word-tools/data/fixtures/en-5-test-banned-vfixture.001.json
packages/word-tools/data/fixtures/manifest.fixture.json
packages/word-tools/data/reports/en-5-test-vfixture.001.validation-report.json
```

Counts from the fixture build:

```text
answers=20 guesses=40 banned=3
validationPassed=true
```

### Deterministic SHA-256 evidence

The following checksum set was produced, then produced identically after a second `pnpm word:fixture:build` run:

```text
0ded13285bc8db058272df79fdc33de03a90127a33796c44a476cff2516bb4bd  packages/word-tools/data/fixtures/en-5-test-answer-vfixture.001.json
7d51febf0c599da5a941804658c49f668025e4274f086b12538151dea3bd9a81  packages/word-tools/data/fixtures/en-5-test-banned-vfixture.001.json
ec67e6fd307087c998617ffed03332cc98edf45af2f46bd8343cee6d6dc2c451  packages/word-tools/data/fixtures/en-5-test-guess-vfixture.001.json
064bc3e775d9cbafd23bc653719eca36858d47a3ffbcd673c772ece48db6442e  packages/word-tools/data/fixtures/manifest.fixture.json
344bdb00d539820d1959c371fe915baf5c6f3663e4e6bb9e1c64c14e94072da8  packages/word-tools/data/reports/en-5-test-vfixture.001.validation-report.json
```

### Production source safety check

Verified with tool output:

```text
packages/word-tools/data/raw ['.gitkeep']
packages/word-tools/data/generated ['.gitkeep']
nested misplaced exists False
```

Note: `.env.example` and `.env.local.example` exist in the repo from other/local-dev work, but Ticket 20 did not create secrets or production dictionary sources.

## Open Questions

1. Should `word:validate` be promoted to a root-level script, or is the package-filter command acceptable for now?
2. Should future backend seed export be added to this same package before Freya finalizes Prisma schema, or wait for the API schema to stabilize?
3. Should Jasmine add independent QA fixtures that intentionally fail validation, or are unit tests sufficient until backend integration exists?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Backend seed/import integration depends on API/Prisma schema ownership.
- **Exact task:** Consume `packages/word-tools/data/fixtures/*.json` in backend/game tests or Prisma seed once schema is ready.
- **Inputs/context they need:** Generated fixture artifacts, `packages/contracts/src/word-library/*`, Ticket 10 contract amendments.
- **Expected output back to Athena:** Backend seed/test evidence and any schema mismatch notes.

### Follow-up ticket 2

- **Target agent:** Jasmine
- **Why that agent is needed:** Independent QA should verify dictionary safety and validation behavior.
- **Exact task:** Add QA checks around fixture generation determinism, banned placeholder separation, answer/guess separation, duplicate-letter fixture coverage, and validation failure cases.
- **Inputs/context they need:** This response file and generated fixtures/report.
- **Expected output back to Athena:** QA pass/fail matrix and release-blocking issues.

### Follow-up ticket 3

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns backend/data tooling.
- **Exact task:** Add production-source registry/import/review tooling after licensing policy and source choice are approved.
- **Inputs/context they need:** Ticket 13 plan, source license decisions, current `word-tools` package.
- **Expected output back to Athena:** Source registry/import commands, review queue outputs, and license validation evidence.

## Files Changed

- `package.json`
- `pnpm-lock.yaml`
- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/word-library/constants.ts`
- `packages/contracts/src/word-library/schemas.ts`
- `packages/contracts/src/word-library/types.ts`
- `packages/contracts/src/word-library/schemas.test.ts`
- `packages/word-tools/package.json`
- `packages/word-tools/tsconfig.json`
- `packages/word-tools/README.md`
- `packages/word-tools/src/index.ts`
- `packages/word-tools/src/normalize.ts`
- `packages/word-tools/src/normalize.test.ts`
- `packages/word-tools/src/validate.ts`
- `packages/word-tools/src/validate.test.ts`
- `packages/word-tools/src/checksum.ts`
- `packages/word-tools/src/fixtures.ts`
- `packages/word-tools/src/fixtures.test.ts`
- `packages/word-tools/src/cli.ts`
- `packages/word-tools/src/cli.test.ts`
- `packages/word-tools/data/sources/README.md`
- `packages/word-tools/data/sources/sources.example.json`
- `packages/word-tools/data/fixtures/en-5-test-answer-vfixture.001.json`
- `packages/word-tools/data/fixtures/en-5-test-guess-vfixture.001.json`
- `packages/word-tools/data/fixtures/en-5-test-banned-vfixture.001.json`
- `packages/word-tools/data/fixtures/manifest.fixture.json`
- `packages/word-tools/data/reports/en-5-test-vfixture.001.validation-report.json`
- `agent-communication/responses/ticket-20-ruby-word-fixture-tooling-implementation-response.md`

Generated locally by pnpm but not listed as source files:

- `node_modules/`
- `packages/*/node_modules/` workspace dependency links

## Tests/Commands Run

### RED test command

```bash
CI=true pnpm install --no-frozen-lockfile && pnpm --filter @wordle-royale/word-tools test && pnpm --filter @wordle-royale/contracts test
```

Exit code: `1`

Expected RED failure evidence:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../packages/word-tools/src/cli.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../packages/word-tools/src/fixtures.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../packages/word-tools/src/normalize.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../packages/word-tools/src/validate.ts
```

### Install/link commands

```bash
CI=true pnpm install --no-frozen-lockfile
```

Exit code: `0`

```bash
pnpm install --recursive --no-frozen-lockfile
```

Exit code: `0`

Output included:

```text
Scope: all 10 workspace projects
Already up to date
Done in 397ms using pnpm v11.1.1
```

### Word-tools tests

```bash
pnpm --filter @wordle-royale/word-tools test
```

Exit code: `0`

Output:

```text
✔ parseCliArgs supports fixture build with output directory
✔ parseCliArgs supports manifest validation input
✔ buildFixtureArtifacts creates deterministic fixtures and manifest checksums
✔ fixture guesses include every answer and banned placeholders stay separate
✔ normalizeWord lowercases valid 5-letter ASCII input
✔ normalizeWord rejects punctuation digits invalid length and non-ASCII
✔ validateFixtureLists passes safe separated fixture lists
✔ validateFixtureLists catches length duplicate separation and banned conflicts
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

### Contracts tests

```bash
pnpm --filter @wordle-royale/contracts test
```

Exit code: `0`

Output:

```text
✔ word list artifact schema accepts fixture list metadata and words
✔ manifest schema requires deterministic list checksums
✔ validation report schema exposes failed checks
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

### Package typechecks

```bash
pnpm --filter @wordle-royale/word-tools typecheck && pnpm --filter @wordle-royale/contracts typecheck
```

Exit code: `0`

Output:

```text
$ tsc --noEmit -p tsconfig.json
$ tsc --noEmit -p tsconfig.json
```

### Root typecheck/scaffold validation

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

### Fixture generation and manifest validation

```bash
pnpm word:fixture:build && pnpm --filter @wordle-royale/word-tools word:validate -- --input packages/word-tools/data/fixtures/manifest.fixture.json
```

Exit code: `0`

Output:

```text
Generated fixture dictionary en-5-test-vfixture.001
answers=20 guesses=40 banned=3
validationPassed=true
Manifest en-5-test-vfixture.001 is structurally valid and validation.passed=true
```

### Determinism check

```bash
sha256sum packages/word-tools/data/fixtures/*.json packages/word-tools/data/reports/en-5-test-vfixture.001.validation-report.json && pnpm word:fixture:build >/tmp/word-fixture-build-2.log && sha256sum packages/word-tools/data/fixtures/*.json packages/word-tools/data/reports/en-5-test-vfixture.001.validation-report.json
```

Exit code: `0`

Result: checksums matched exactly across both runs. Full checksum values are listed in Detailed Output.

### Workspace package discovery

```bash
pnpm -r list --depth -1
```

Exit code: `0`

Output confirmed all 10 workspace projects, including `@wordle-royale/contracts` and `@wordle-royale/word-tools`.

## Evidence/Result

Acceptance criteria status:

1. **Fixture generation command exists and runs:** Passed. `pnpm word:fixture:build` exits `0` and generates 5 artifacts/report files.
2. **Generated fixture artifacts are deterministic:** Passed. SHA-256 checksums were identical across two consecutive fixture builds.
3. **Validation catches length, duplicate, answer/guess separation, and banned-list conflicts:** Passed. `validate.test.ts` asserts all four failure categories.
4. **No proprietary/production word source is committed:** Passed. `data/raw` and `data/generated` contain only `.gitkeep`; generated committed artifacts are hand-curated fixtures only.
5. **Response lists files changed and commands run:** Included in this response.

## Risks/Blockers

- **Production dictionary remains blocked.** This ticket intentionally does not solve production source licensing or content review.
- **Backend seed export not implemented yet.** It should wait for Freya's Prisma schema/API foundation to avoid contract drift.
- **Root `pnpm typecheck` still runs scaffold validation only.** Package-specific typechecks now pass for `contracts` and `word-tools`, but root typecheck has not yet been upgraded to recursive package typechecking.
- **Fixture words are test coverage tools, not product-quality dictionary choices.** They are safe, small, and deterministic, but not representative of launch dictionary scale or curation quality.
