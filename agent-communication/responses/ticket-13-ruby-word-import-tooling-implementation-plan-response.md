# Ticket 13 — Word Import Tooling Implementation Plan — Response

## Summary

This is a planning/specification response for Wordle Royale's word import, validation, versioning, review, and fixture tooling.

The recommended implementation is a TypeScript workspace package named `@wordle-royale/word-tools` plus shared schema/types in `@wordle-royale/contracts`. The tooling should produce deterministic, versioned dictionary artifacts for:

- Curated answer lists.
- Broad valid-guess lists.
- Banned/sensitive lists.
- Review queues.
- Validation reports.
- Small fixture dictionaries for engine/backend/QA tests.
- Prisma-compatible seed/import payloads.

The plan follows the locked project defaults:

- English 5-letter V1.
- Separate answer and valid-guess lists.
- Common English with US bias for answers; common UK variants allowed as valid guesses where not confusing.
- Severe offensive/slur terms excluded from both answers and valid guesses for V1.
- Immutable dictionary releases.
- Per-match/per-round dictionary version storage.
- Avoid proprietary Wordle answer lists unless licensing is explicitly safe.

## Decisions / Recommendations

1. **Build tooling as a local package, not one-off scripts.**
   - Create `packages/word-tools` for import/build/report CLI logic.
   - Create or extend `packages/contracts` for shared Zod schemas/types used by CLI, backend seed jobs, and tests.

2. **Use JSONL for source/staging records and JSON for version manifests.**
   - JSONL is append/diff-friendly for large word candidate sets.
   - Manifests should be deterministic JSON with checksums and counts.

3. **Keep production import and fixture generation separate.**
   - Test fixtures should be small, hand-curated, non-production, and safe to commit.
   - Production dictionaries must wait for license review and content approval.

4. **Generate review queues before activation.**
   - Automated filters should classify candidates, but answer-list activation needs human/content review.
   - CLI should support exporting review queues even before full admin UI exists.

5. **Target Elisa's Ticket 10 reconciled schema.**
   - Tooling should be designed around `word_sources`, `word_entries`, `word_entry_sources`, `word_reviews`, `word_lists`, `word_list_entries`, and `word_list_activation_events`.

6. **Use deterministic build outputs.**
   - Same inputs + same config should produce same normalized entries, manifests, checksums, and reports.
   - This is required for reproducible ranked dictionary versions.

## Detailed Output

### 1. Proposed package and file layout

Recommended project paths:

```text
packages/
  contracts/
    src/
      word-library/
        schemas.ts
        types.ts
        constants.ts
  word-tools/
    package.json
    tsconfig.json
    README.md
    src/
      cli.ts
      config.ts
      normalize.ts
      source-registry.ts
      import-source.ts
      classify.ts
      difficulty.ts
      validate.ts
      build-version.ts
      export-review-queue.ts
      export-prisma-seed.ts
      report.ts
      checksum.ts
      fixtures.ts
    config/
      word-tools.config.ts
    data/
      sources/
        README.md
        sources.example.json
      raw/
        .gitkeep
      staging/
        .gitkeep
      fixtures/
        en-5-test-answer-vfixture.001.json
        en-5-test-guess-vfixture.001.json
        en-5-test-banned-vfixture.001.json
        manifest.fixture.json
      generated/
        .gitkeep
      reports/
        .gitkeep
```

Recommended app/backend import paths once Freya implements the backend:

```text
apps/api/prisma/seed/
  seed-word-fixtures.ts
  seed-word-dictionary.ts

apps/api/src/modules/word-library/
  word-library.service.ts
  dictionary-version.service.ts
  guess-validator.service.ts
```

### 2. Proposed scripts/CLI commands

Recommended `packages/word-tools/package.json` scripts:

```json
{
  "scripts": {
    "word-tools": "tsx src/cli.ts",
    "word:fixture:build": "tsx src/cli.ts fixture build",
    "word:source:register": "tsx src/cli.ts source register",
    "word:import": "tsx src/cli.ts import",
    "word:classify": "tsx src/cli.ts classify",
    "word:validate": "tsx src/cli.ts validate",
    "word:review:export": "tsx src/cli.ts review export",
    "word:version:build": "tsx src/cli.ts version build",
    "word:seed:export": "tsx src/cli.ts seed export",
    "word:report": "tsx src/cli.ts report"
  }
}
```

Recommended root-level scripts after workspace setup:

```json
{
  "scripts": {
    "word:fixture:build": "pnpm --filter @wordle-royale/word-tools word:fixture:build",
    "word:import": "pnpm --filter @wordle-royale/word-tools word:import",
    "word:validate": "pnpm --filter @wordle-royale/word-tools word:validate",
    "word:version:build": "pnpm --filter @wordle-royale/word-tools word:version:build",
    "word:seed:export": "pnpm --filter @wordle-royale/word-tools word:seed:export"
  }
}
```

#### CLI command examples

Register a source:

```bash
pnpm word:source:register \
  --source-id scowl-en \
  --name "SCOWL English Words" \
  --url "https://example.invalid/source" \
  --license-name "TBD" \
  --license-url "https://example.invalid/license" \
  --commercial-use unknown \
  --redistribution unknown \
  --attribution-required unknown
```

Import a source into staging:

```bash
pnpm word:import \
  --source-id scowl-en \
  --input packages/word-tools/data/raw/scowl-en.txt \
  --language en \
  --locale en \
  --word-length 5 \
  --output packages/word-tools/data/staging/scowl-en.en-5.candidates.jsonl
```

Classify staged candidates:

```bash
pnpm word:classify \
  --input packages/word-tools/data/staging/scowl-en.en-5.candidates.jsonl \
  --config packages/word-tools/config/word-tools.config.ts \
  --output packages/word-tools/data/staging/scowl-en.en-5.classified.jsonl
```

Validate candidate lists:

```bash
pnpm word:validate \
  --input packages/word-tools/data/staging/scowl-en.en-5.classified.jsonl \
  --report packages/word-tools/data/reports/scowl-en.en-5.validation-report.json
```

Export review queue:

```bash
pnpm word:review:export \
  --input packages/word-tools/data/staging/scowl-en.en-5.classified.jsonl \
  --format csv \
  --output packages/word-tools/data/reports/scowl-en.en-5.review-queue.csv
```

Build a dictionary version:

```bash
pnpm word:version:build \
  --classified packages/word-tools/data/staging/scowl-en.en-5.classified.jsonl \
  --version en-5-standard-v2026.06.001 \
  --answer-output packages/word-tools/data/generated/en-5-standard-answer-v2026.06.001.json \
  --guess-output packages/word-tools/data/generated/en-5-standard-guess-v2026.06.001.json \
  --banned-output packages/word-tools/data/generated/en-5-standard-banned-v2026.06.001.json \
  --manifest-output packages/word-tools/data/generated/en-5-standard-v2026.06.001.manifest.json
```

Export Prisma seed payload:

```bash
pnpm word:seed:export \
  --manifest packages/word-tools/data/generated/en-5-standard-v2026.06.001.manifest.json \
  --output apps/api/prisma/seed/generated/en-5-standard-v2026.06.001.seed.json
```

Build small test fixture dictionaries:

```bash
pnpm word:fixture:build \
  --output packages/word-tools/data/fixtures
```

### 3. Proposed output formats

#### Source metadata format

Path:

```text
packages/word-tools/data/sources/sources.json
```

Format:

```json
{
  "sources": [
    {
      "sourceId": "scowl-en",
      "name": "SCOWL English Words",
      "url": "https://example.invalid/source",
      "version": "unknown",
      "licenseName": "TBD",
      "licenseUrl": "https://example.invalid/license",
      "attributionRequired": "unknown",
      "commercialUseAllowed": "unknown",
      "redistributionAllowed": "unknown",
      "downloadedAt": "2026-06-22T00:00:00.000Z",
      "rawChecksumSha256": "sha256-placeholder",
      "notes": "Production use blocked until license review is complete."
    }
  ]
}
```

Use string values such as `true`, `false`, or `unknown` for licensing fields until reviewed.

#### Candidate JSONL record

Path example:

```text
packages/word-tools/data/staging/scowl-en.en-5.candidates.jsonl
```

Record format:

```json
{"text":"crane","normalizedText":"crane","language":"en","locale":"en","length":5,"sourceIds":["scowl-en"],"rawLine":1234,"importedAt":"2026-06-22T00:00:00.000Z"}
```

#### Classified JSONL record

Path example:

```text
packages/word-tools/data/staging/scowl-en.en-5.classified.jsonl
```

Record format:

```json
{
  "text": "crane",
  "normalizedText": "crane",
  "language": "en",
  "locale": "en",
  "length": 5,
  "difficultyTier": "medium",
  "difficultyScore": 42.5,
  "frequencyScore": 0.87,
  "frequencyRank": 1234,
  "partOfSpeech": "noun",
  "isAnswerEligible": true,
  "isGuessEligible": true,
  "isBanned": false,
  "isOffensive": false,
  "isSensitive": false,
  "isProperNoun": false,
  "isAbbreviation": false,
  "isPlural": false,
  "isInflection": false,
  "hasDuplicateLetters": false,
  "letterRarityScore": 0.31,
  "regionalVariant": "both",
  "reviewStatus": "needs_review",
  "reviewReasons": ["answer_candidate_requires_human_review"],
  "sourceIds": ["scowl-en"],
  "metadata": {
    "classificationVersion": "v1"
  }
}
```

#### Dictionary list artifact format

Path examples:

```text
packages/word-tools/data/generated/en-5-standard-answer-v2026.06.001.json
packages/word-tools/data/generated/en-5-standard-guess-v2026.06.001.json
packages/word-tools/data/generated/en-5-standard-banned-v2026.06.001.json
```

Format:

```json
{
  "listId": "en-5-standard-answer-v2026.06.001",
  "name": "English 5-letter standard answers",
  "type": "answer",
  "language": "en",
  "locale": "en",
  "wordLength": 5,
  "version": "v2026.06.001",
  "rankedEligible": false,
  "status": "draft",
  "words": [
    {
      "text": "crane",
      "normalizedText": "crane",
      "difficultyTier": "medium",
      "difficultyScore": 42.5,
      "sourceIds": ["scowl-en"]
    }
  ]
}
```

#### Manifest format

Path example:

```text
packages/word-tools/data/generated/en-5-standard-v2026.06.001.manifest.json
```

Format:

```json
{
  "manifestVersion": 1,
  "dictionaryVersion": "en-5-standard-v2026.06.001",
  "language": "en",
  "locale": "en",
  "wordLength": 5,
  "policy": {
    "regionalPolicy": "common_english_us_answer_bias",
    "severeOffensivePolicy": "exclude_from_answers_and_guesses",
    "answerTarget": "4000-8000",
    "guessTarget": "12000-20000"
  },
  "lists": {
    "answer": {
      "listId": "en-5-standard-answer-v2026.06.001",
      "count": 5000,
      "checksumSha256": "sha256-placeholder"
    },
    "guess": {
      "listId": "en-5-standard-guess-v2026.06.001",
      "count": 15000,
      "checksumSha256": "sha256-placeholder"
    },
    "banned": {
      "listId": "en-5-standard-banned-v2026.06.001",
      "count": 500,
      "checksumSha256": "sha256-placeholder"
    }
  },
  "sources": [
    {
      "sourceId": "scowl-en",
      "licenseName": "TBD",
      "licenseReviewed": false
    }
  ],
  "validation": {
    "passed": false,
    "reportPath": "packages/word-tools/data/reports/en-5-standard-v2026.06.001.validation-report.json"
  },
  "createdAt": "2026-06-22T00:00:00.000Z"
}
```

### 4. Small fixture dictionary plan for tests

Purpose:

- Provide deterministic, safe dictionaries for Freya backend/game-engine tests and Jasmine QA checks.
- Avoid dependency on production dictionary licensing.
- Cover duplicate-letter feedback, banned-word rejection, answer-vs-guess separation, invalid length, proper-noun-like exclusions, and difficulty tiers.

Recommended fixture paths:

```text
packages/word-tools/data/fixtures/en-5-test-answer-vfixture.001.json
packages/word-tools/data/fixtures/en-5-test-guess-vfixture.001.json
packages/word-tools/data/fixtures/en-5-test-banned-vfixture.001.json
packages/word-tools/data/fixtures/manifest.fixture.json
apps/api/prisma/seed/generated/en-5-test-vfixture.001.seed.json
```

Recommended fixture contents:

#### Answer fixture

Include 20–30 safe, common words, including duplicate-letter cases:

```text
crane
slate
flame
brave
crown
grid
arena
plant
chair
light
sound
pride
bloom
level
civic
array
mamma
allee
knoll
press
```

Notes:

- `level`, `civic`, `array`, `mamma`, `allee`, `knoll`, and `press` support duplicate-letter feedback tests.
- Fixture answers do not need to represent production quality or target size.

#### Valid-guess fixture

Include all fixture answers plus non-answer valid guesses:

```text
adieu
roate
raise
stare
tears
rates
later
cigar
rebut
sissy
humph
awake
blush
focal
evade
naval
serve
heath
dwarf
model
karma
```

Notes:

- These are for test coverage only.
- If any fixture word creates licensing or product concerns, replace with another hand-curated safe word.

#### Banned/sensitive fixture

Use placeholder synthetic entries for tests rather than real slurs/profanity in committed fixtures:

```text
xxxxx
yyyyy
zzzzz
```

These should be marked as banned in fixture metadata. Tests should assert banned-word behavior without committing offensive content.

Recommended fixture validation expectations:

- Answer list count >= 20.
- Guess list includes every answer word.
- Banned list has no overlap with answer/guess lists.
- All fixture words are length 5 and lowercase ASCII.
- Duplicate-letter cases are explicitly tagged.

### 5. Production dictionary pipeline plan

#### Phase 1 — source registration

- Add source metadata to `sources.json`.
- Store raw source file under `packages/word-tools/data/raw/` only if license allows repository storage.
- If raw source cannot be committed, store retrieval instructions and checksum only.

#### Phase 2 — raw import

- Read raw source file.
- Normalize line endings and trim whitespace.
- Drop comments/blank lines.
- Create candidate JSONL with source lineage.

#### Phase 3 — normalization

Rules for V1:

- Lowercase.
- English-only.
- 5-letter-only.
- ASCII `a-z` only.
- Reject spaces, hyphens, apostrophes, punctuation, digits, accents, emojis.
- Deduplicate by `(language, normalizedText)`.

#### Phase 4 — classification/filtering

Classify each candidate:

- `isAnswerEligible`
- `isGuessEligible`
- `isBanned`
- `isOffensive`
- `isSensitive`
- `isProperNoun`
- `isAbbreviation`
- `isPlural`
- `isInflection`
- `hasDuplicateLetters`
- `regionalVariant`
- `difficultyTier`
- `difficultyScore`
- `frequencyScore`
- `letterRarityScore`
- `reviewStatus`

Default V1 eligibility rules:

- Severe offensive/slur candidates: `isBanned = true`, `isAnswerEligible = false`, `isGuessEligible = false`.
- Proper nouns/abbreviations: not answer eligible; may be rejected from guesses unless common lowercase word use is confirmed.
- Common UK variants: not preferred as answers unless familiar/common; allowed as guesses where not confusing.
- Expert/rare words: valid guesses only by default unless manually approved as answers.

#### Phase 5 — validation

Run structural, content, and list consistency checks.

Hard failures:

- Non-5-letter word in V1 lists.
- Non-ASCII lowercase word in V1 lists.
- Duplicate normalized words.
- Banned word in answer/guess list.
- Answer word not present in valid-guess list.
- Missing source lineage.
- Missing license metadata.
- Empty/too-small answer or guess list.
- Active/ranked list with unreviewed answer entries.

Warnings:

- Difficulty distribution skew.
- Low frequency answer candidate.
- High duplicate-letter concentration.
- Regional variant answer candidate.
- Source license not fully reviewed.

#### Phase 6 — review queue

Export `needs_review` candidates for human/content review:

- Low-frequency answer candidates.
- Sensitive/regional ambiguity.
- Proper-noun ambiguity.
- Hard/expert candidates proposed as answers.
- Words with conflicting source classifications.

#### Phase 7 — version build

- Build answer, guess, and banned list artifacts.
- Generate manifest and checksums.
- Export Prisma seed payload.
- Mark production artifacts `rankedEligible = false` until content/license review passes.

#### Phase 8 — backend seed/import

Two paths:

1. **Local/test seed path:** load fixture seed JSON into Prisma for tests.
2. **Production/staging import path:** admin/backend import job loads approved dictionary artifacts into database draft lists.

#### Phase 9 — activation

- Admin validates draft list through backend endpoint.
- Admin activates list atomically.
- Backend writes `word_list_activation_events` and admin audit logs.
- Ranked dictionaries require `rankedEligible = true` and approved manifest checks.

### 6. Validation report format

Recommended path:

```text
packages/word-tools/data/reports/{dictionaryVersion}.validation-report.json
```

Format:

```json
{
  "reportVersion": 1,
  "dictionaryVersion": "en-5-standard-v2026.06.001",
  "generatedAt": "2026-06-22T00:00:00.000Z",
  "passed": false,
  "summary": {
    "candidateCount": 20000,
    "answerCount": 5000,
    "guessCount": 15000,
    "bannedCount": 500,
    "autoRejectedCount": 2500,
    "needsReviewCount": 1200,
    "errorCount": 1,
    "warningCount": 3
  },
  "checks": [
    {
      "id": "answer_words_are_guess_valid",
      "level": "error",
      "passed": true,
      "message": "All answer words exist in valid guess list."
    },
    {
      "id": "license_metadata_complete",
      "level": "error",
      "passed": false,
      "message": "Source scowl-en has commercialUseAllowed=unknown."
    },
    {
      "id": "difficulty_distribution",
      "level": "warning",
      "passed": false,
      "message": "Hard tier exceeds configured target by 8%."
    }
  ],
  "difficultyDistribution": {
    "easy": 1000,
    "medium": 2600,
    "hard": 1200,
    "expert": 200
  },
  "sourceSummary": [
    {
      "sourceId": "scowl-en",
      "candidateCount": 18000,
      "licenseReviewed": false
    }
  ]
}
```

Recommended CI/test behavior:

- Fixture validation must pass in CI.
- Production dictionary validation can run in CI only if artifacts are committed and licensing permits.
- Any production/ranked artifact with unresolved license metadata should fail ranked eligibility validation.

### 7. Licensing metadata format

The CLI should validate that every source has explicit license metadata before production build.

Recommended schema:

```ts
type LicenseReviewStatus = 'unreviewed' | 'approved' | 'rejected' | 'needs_legal_review';
type LicenseBoolean = true | false | 'unknown';

type WordSourceMetadata = {
  sourceId: string;
  name: string;
  url?: string;
  version?: string;
  licenseName: string;
  licenseUrl?: string;
  attributionRequired: LicenseBoolean;
  commercialUseAllowed: LicenseBoolean;
  redistributionAllowed: LicenseBoolean;
  derivativeWorksAllowed: LicenseBoolean;
  licenseReviewStatus: LicenseReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  downloadedAt?: string;
  rawChecksumSha256?: string;
  notes?: string;
};
```

Production rule:

- `licenseReviewStatus` must be `approved` before a source can contribute to a production active or ranked-eligible dictionary.
- `commercialUseAllowed` and `redistributionAllowed` cannot be `unknown` for production active dictionaries.

### 8. Review workflow integration

#### CLI-first workflow

1. Import and classify source candidates.
2. Export review queue CSV/JSON.
3. Content reviewer edits review decisions in a controlled review file.
4. CLI imports review decisions.
5. CLI rebuilds dictionary draft.
6. CLI exports Prisma seed/import payload.

Recommended review decision format:

```json
{
  "normalizedText": "crane",
  "decision": "approved",
  "answerEligible": true,
  "guessEligible": true,
  "difficultyTier": "medium",
  "reviewer": "content-admin-user-id-or-name",
  "reviewedAt": "2026-06-22T00:00:00.000Z",
  "notes": "Safe common answer."
}
```

#### Admin API workflow after backend exists

Use Ticket 10 amended endpoints:

```text
GET    /api/v1/admin/word-sources
POST   /api/v1/admin/word-sources
GET    /api/v1/admin/words
GET    /api/v1/admin/words/{wordId}
POST   /api/v1/admin/words/import
PATCH  /api/v1/admin/words/{wordId}
POST   /api/v1/admin/words/{wordId}/review
POST   /api/v1/admin/words/{wordId}/deactivate
GET    /api/v1/admin/word-lists
POST   /api/v1/admin/word-lists
POST   /api/v1/admin/word-lists/{listId}/validate
POST   /api/v1/admin/word-lists/{listId}/activate
GET    /api/v1/admin/word-difficulty-metrics
```

Required audit behavior:

- Every review decision creates a `word_reviews` record.
- Every activation creates a `word_list_activation_events` record and admin audit log.
- Every source import records `word_sources` and `word_entry_sources` lineage.

### 9. Dependencies on Elisa schema amendments

Ticket 13 should target Ticket 10's reconciled schema. Required dependencies:

#### Required tables

- `word_sources`
- `word_entries`
- `word_entry_sources`
- `word_reviews`
- `word_lists`
- `word_list_entries`
- `word_list_activation_events`
- `word_difficulty_metrics`

#### Required `word_entries` fields

Tooling expects or should map to:

- `text`
- `normalized_text`
- `language`
- `locale`
- `length`
- `difficulty_tier`
- `difficulty_score`
- `frequency_score`
- `frequency_rank`
- `part_of_speech`
- `is_answer_eligible`
- `is_guess_eligible`
- `is_banned`
- `is_offensive`
- `is_sensitive`
- `is_proper_noun`
- `is_abbreviation`
- `is_plural`
- `is_inflection`
- `has_duplicate_letters`
- `letter_rarity_score`
- `regional_variant`
- `review_status`
- `deactivated_reason`
- `metadata`

#### Required `word_lists` fields

- `name`
- `language`
- `type` — `answer`, `guess_valid`, `banned`
- `version`
- `status` — `draft`, `active`, `deprecated`, `deactivated`
- `ranked_eligible`
- `word_length`
- `manifest`
- `checksum`
- `activated_at`
- `deactivated_at`

#### Required match/round dictionary fields

Backend integration depends on:

- `matches.answer_list_id`
- `matches.valid_guess_list_id`
- `matches.banned_list_id`
- `matches.dictionary_policy`
- `match_rounds.answer_list_id`
- `match_rounds.valid_guess_list_id`
- `match_rounds.banned_list_id`

Ruby tooling does not implement match logic, but seed/import artifacts must populate list records compatible with these fields.

### 10. Implementation task plan

#### Task 1 — Create shared word-library schemas

**Objective:** Add shared types/schemas for word source metadata, candidate records, classified records, list artifacts, manifests, and validation reports.

**Files:**

- Create: `packages/contracts/src/word-library/schemas.ts`
- Create: `packages/contracts/src/word-library/types.ts`
- Create: `packages/contracts/src/word-library/constants.ts`
- Test: `packages/contracts/src/word-library/schemas.test.ts`

**Verification:**

```bash
pnpm --filter @wordle-royale/contracts test
```

Expected: schema tests pass.

#### Task 2 — Create `packages/word-tools` CLI shell

**Objective:** Add package scaffolding and a CLI entrypoint with subcommands.

**Files:**

- Create: `packages/word-tools/package.json`
- Create: `packages/word-tools/tsconfig.json`
- Create: `packages/word-tools/src/cli.ts`
- Create: `packages/word-tools/src/config.ts`
- Test: `packages/word-tools/src/cli.test.ts`

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools word-tools --help
```

Expected: help output lists source/import/classify/validate/review/version/seed/fixture commands.

#### Task 3 — Implement normalization

**Objective:** Normalize raw words using V1 English 5-letter policy.

**Files:**

- Create: `packages/word-tools/src/normalize.ts`
- Test: `packages/word-tools/src/normalize.test.ts`

**Test cases:**

- `CRANE` -> `crane`
- rejects `can't`
- rejects `abc1d`
- rejects `four`
- rejects `sixsix`
- rejects non-ASCII accented forms for V1

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools test -- normalize
```

Expected: normalization tests pass.

#### Task 4 — Implement source registry and license validation

**Objective:** Parse and validate source metadata with license review status.

**Files:**

- Create: `packages/word-tools/src/source-registry.ts`
- Create: `packages/word-tools/data/sources/sources.example.json`
- Test: `packages/word-tools/src/source-registry.test.ts`

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools test -- source-registry
```

Expected: rejects production source with `commercialUseAllowed = unknown` when production/ranked mode is requested.

#### Task 5 — Implement raw source import

**Objective:** Convert source word text files into candidate JSONL with source lineage.

**Files:**

- Create: `packages/word-tools/src/import-source.ts`
- Test: `packages/word-tools/src/import-source.test.ts`

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools test -- import-source
```

Expected: imports valid 5-letter candidates, skips invalid lines with reasons, deduplicates normalized words.

#### Task 6 — Implement classification and difficulty tagging

**Objective:** Assign answer/guess eligibility, banned/sensitive flags, duplicate-letter flags, regional flags, and initial difficulty tiers.

**Files:**

- Create: `packages/word-tools/src/classify.ts`
- Create: `packages/word-tools/src/difficulty.ts`
- Test: `packages/word-tools/src/classify.test.ts`
- Test: `packages/word-tools/src/difficulty.test.ts`

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools test -- classify
pnpm --filter @wordle-royale/word-tools test -- difficulty
```

Expected: banned placeholders are excluded, duplicate letters are detected, difficulty tiers are deterministic.

#### Task 7 — Implement validation reports

**Objective:** Validate candidate/list consistency and generate JSON validation reports.

**Files:**

- Create: `packages/word-tools/src/validate.ts`
- Create: `packages/word-tools/src/report.ts`
- Test: `packages/word-tools/src/validate.test.ts`

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools test -- validate
```

Expected: validation fails when an answer is missing from guess list, banned overlap exists, or license metadata is incomplete for production mode.

#### Task 8 — Implement review queue export/import

**Objective:** Export `needs_review` candidates and consume review decisions.

**Files:**

- Create: `packages/word-tools/src/export-review-queue.ts`
- Test: `packages/word-tools/src/export-review-queue.test.ts`

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools test -- export-review-queue
```

Expected: CSV/JSON review queue includes normalized text, flags, suggested eligibility, review reasons, and source IDs.

#### Task 9 — Implement version builder and checksums

**Objective:** Build answer/guess/banned list artifacts and manifest with deterministic checksums.

**Files:**

- Create: `packages/word-tools/src/build-version.ts`
- Create: `packages/word-tools/src/checksum.ts`
- Test: `packages/word-tools/src/build-version.test.ts`
- Test: `packages/word-tools/src/checksum.test.ts`

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools test -- build-version
```

Expected: same inputs produce same list ordering and checksum.

#### Task 10 — Implement Prisma seed export

**Objective:** Export generated artifacts into backend seed payload matching Elisa/Freya Prisma schema.

**Files:**

- Create: `packages/word-tools/src/export-prisma-seed.ts`
- Test: `packages/word-tools/src/export-prisma-seed.test.ts`

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools test -- export-prisma-seed
```

Expected: seed JSON contains source, entry, entry-source, list, list-entry, and manifest payloads.

#### Task 11 — Implement fixture dictionary builder

**Objective:** Generate deterministic fixture dictionaries and seed payload for backend/game-engine tests.

**Files:**

- Create: `packages/word-tools/src/fixtures.ts`
- Create: `packages/word-tools/data/fixtures/en-5-test-answer-vfixture.001.json`
- Create: `packages/word-tools/data/fixtures/en-5-test-guess-vfixture.001.json`
- Create: `packages/word-tools/data/fixtures/en-5-test-banned-vfixture.001.json`
- Create: `packages/word-tools/data/fixtures/manifest.fixture.json`
- Test: `packages/word-tools/src/fixtures.test.ts`

**Verification:**

```bash
pnpm word:fixture:build
pnpm word:validate --input packages/word-tools/data/fixtures/manifest.fixture.json
```

Expected: fixture manifest validates successfully.

#### Task 12 — Add documentation

**Objective:** Document how to add a source, build fixtures, generate reports, and export seeds.

**Files:**

- Create: `packages/word-tools/README.md`
- Create: `packages/word-tools/data/sources/README.md`

**Verification:**

```bash
pnpm --filter @wordle-royale/word-tools test
pnpm word:fixture:build
```

Expected: tests pass and docs commands match actual scripts.

### 11. Follow-up coding tickets

#### Follow-up coding ticket A — Shared word-library contracts

- **Target agent:** Ruby or Freya
- **Why needed:** Tooling and backend need shared schemas to avoid drift.
- **Exact task:** Implement `packages/contracts/src/word-library/*` schemas/types/constants for source metadata, candidate records, classified records, list artifacts, manifests, and validation reports.
- **Inputs/context needed:** Ticket 13 response, Ticket 10 schema amendments.
- **Expected output back to Athena:** Files changed, schema tests, commands run, and validation evidence.

#### Follow-up coding ticket B — Word-tools CLI scaffolding

- **Target agent:** Ruby
- **Why needed:** Core tooling package foundation.
- **Exact task:** Create `packages/word-tools` with CLI entrypoint, package scripts, config loader, and help output.
- **Inputs/context needed:** This implementation plan and repository workspace conventions.
- **Expected output back to Athena:** Package files, CLI help evidence, tests run.

#### Follow-up coding ticket C — Normalization/import/classification pipeline

- **Target agent:** Ruby
- **Why needed:** Converts raw sources into reviewable classified candidates.
- **Exact task:** Implement normalization, source registry, raw import, classification, and difficulty tagging modules with tests.
- **Inputs/context needed:** Ticket 05 content rules and Ticket 13 path/schema plan.
- **Expected output back to Athena:** Modules, tests, fixture import example, validation evidence.

#### Follow-up coding ticket D — Validation/report/review queue tooling

- **Target agent:** Ruby
- **Why needed:** Prevents unsafe or low-quality dictionaries from activating.
- **Exact task:** Implement validation report generation and review queue export/import.
- **Inputs/context needed:** Validation rules and report format from this response.
- **Expected output back to Athena:** Validation reports, review queue sample, tests run.

#### Follow-up coding ticket E — Version build and Prisma seed export

- **Target agent:** Ruby + Freya review
- **Why needed:** Backend seed/import path must match Prisma schema.
- **Exact task:** Implement deterministic version builder, checksums, manifests, and Prisma seed JSON export.
- **Inputs/context needed:** Ticket 10 final schema and Freya backend foundation plan.
- **Expected output back to Athena:** Generated fixture seed payload, checksum evidence, backend compatibility notes.

#### Follow-up coding ticket F — Backend fixture seed integration

- **Target agent:** Freya
- **Why needed:** Game-engine/backend tests need fixture dictionaries loaded in DB.
- **Exact task:** Add Prisma seed support for fixture dictionary artifacts generated by Ruby's word-tools package.
- **Inputs/context needed:** Generated fixture seed JSON and Ticket 10 schema.
- **Expected output back to Athena:** Seed script, backend tests using fixture dictionary, commands run.

#### Follow-up coding ticket G — QA dictionary test matrix

- **Target agent:** Jasmine
- **Why needed:** Independent verification of word tooling and runtime dictionary behavior.
- **Exact task:** Create QA checks for fixture validation, banned-word rejection, answer/guess separation, dictionary version reproducibility, duplicate-letter fixtures, and emergency deactivation behavior.
- **Inputs/context needed:** Ticket 13 response and fixture artifacts after Ruby implementation.
- **Expected output back to Athena:** QA matrix and release-blocking checks.

### 12. Parallelization notes

Can run in parallel:

- Ruby can implement CLI scaffolding and shared schema drafts while Freya works on backend foundation.
- Ruby can build fixture dictionaries before production source licensing is finalized.
- Jasmine can draft QA matrix from this plan before tooling exists.
- Luna can design admin review UI from the review workflow while backend endpoints are pending.
- Yuna can define storage/CI policy for raw licensed sources, generated artifacts, and reports.

Should not run in parallel without coordination:

- Prisma seed export should wait for Elisa/Freya final Prisma schema names.
- Production dictionary import should wait for license approval.
- Ranked dictionary activation should wait for content review, backend activation endpoints, and QA validation.
- Admin API integration should wait for Freya's backend admin endpoints.

Recommended dependency sequence:

```text
1. Shared contracts/schemas
2. Word-tools CLI scaffold
3. Fixture builder
4. Normalization/import/classification
5. Validation/reporting
6. Review queue
7. Version builder/checksums
8. Prisma seed export
9. Backend seed integration
10. Admin API integration
11. Production source import after license approval
```

## Open Questions

1. Has the final repository workspace/package manager been initialized as `pnpm`? This plan assumes `pnpm` because the locked stack is TypeScript/NestJS/Next.js.
2. Should raw third-party source files be committed to the repository, or should the repo store only retrieval instructions/checksums until licensing is approved?
3. Who is the named reviewer/approver for production dictionary source licenses?
4. Should the first implemented fixture seed live only in `packages/word-tools`, or should it immediately integrate with `apps/api/prisma/seed`?
5. Should review decisions be edited as CSV for human friendliness or JSON for stricter schema validation in V1?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Athena
- **Why that agent is needed:** Athena owns sequencing and decision routing.
- **Exact task:** Confirm whether Ruby should implement fixture tooling first or wait for Freya's Prisma schema/backend foundation.
- **Inputs/context they need:** This response and Ticket 10 schema amendments.
- **Expected output back to Athena:** Approved implementation sequence and any decision notes for source/license handling.

### Follow-up ticket 2

- **Target agent:** Elisa
- **Why that agent is needed:** Elisa owns final architecture/API/data model contracts.
- **Exact task:** Confirm the final word-library Prisma model names/field names and whether the seed payload format in this plan matches the intended backend contract.
- **Inputs/context they need:** Dependencies on Elisa schema amendments section in this response.
- **Expected output back to Athena:** Confirmed schema contract or required amendments.

### Follow-up ticket 3

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns tooling/data pipelines.
- **Exact task:** Implement `packages/contracts/src/word-library` and `packages/word-tools` CLI scaffold with fixture generation only; defer production source import until licensing is approved.
- **Inputs/context they need:** Implementation task plan sections 1, 2, and 11.
- **Expected output back to Athena:** Files changed, tests run, fixture artifacts generated, and validation report evidence.

### Follow-up ticket 4

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/core server implementation.
- **Exact task:** Add Prisma seed support for Ruby's fixture dictionary artifacts and wire backend guess validation tests against active dictionary versions.
- **Inputs/context they need:** Fixture dictionary plan, seed export format, and Ticket 10 match/round dictionary version fields.
- **Expected output back to Athena:** Backend seed script, tests, and compatibility notes.

### Follow-up ticket 5

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA/verification.
- **Exact task:** Draft acceptance tests for word import tooling outputs: normalization, banned placeholders, answer-vs-guess separation, fixture list consistency, validation report failures, and deterministic manifest checksums.
- **Inputs/context they need:** Validation report format and fixture dictionary plan in this response.
- **Expected output back to Athena:** QA matrix and release blockers for word tooling.

### Follow-up ticket 6

- **Target agent:** Yuna
- **Why that agent is needed:** Yuna owns operations, CI, storage, secrets, and deployment safety.
- **Exact task:** Define repository/CI policy for raw word source storage, generated artifacts, validation reports, license metadata, and whether production dictionary generation runs in CI.
- **Inputs/context they need:** Production pipeline plan and licensing metadata format in this response.
- **Expected output back to Athena:** Ops/CI policy for dictionary artifacts and source licensing boundaries.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-13-ruby-word-import-tooling-implementation-plan-response.md`

## Tests / Commands Run

None — planning/spec task only.

## Evidence / Result

Created the required Markdown response file:

`/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-13-ruby-word-import-tooling-implementation-plan-response.md`

The response covers the ticket acceptance criteria:

1. Proposed scripts/CLI commands.
2. Proposed file paths and output formats.
3. Small fixture dictionary plan for tests.
4. Production dictionary pipeline plan.
5. Validation report format.
6. Licensing metadata format.
7. Review workflow integration.
8. Dependencies on Elisa schema amendments.
9. Follow-up coding tickets.
10. Parallelization notes.

## Risks / Blockers

- **Production licensing blocker:** Production dictionary source selection and license approval remain unresolved. Do not import or activate production dictionaries until this is approved.
- **Schema dependency:** Prisma seed/export implementation depends on final Freya/Elisa Prisma model names and migrations.
- **Content review dependency:** Automated classification cannot replace human review for answer-list activation.
- **Admin tooling dependency:** Full review/activation workflow requires backend admin endpoints and audit logging.
- **Repository policy risk:** Raw third-party word lists may not be safe to commit; Yuna/Athena should define source storage policy before production source work begins.
