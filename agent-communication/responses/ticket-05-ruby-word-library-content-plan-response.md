# Ticket 5 — Dictionary, Word Library, and Content Moderation Plan — Response

## Summary

I designed the word-library and content system plan for Wordle Royale. The plan separates answer words from accepted guesses, treats dictionary data as versioned production content, and adds import/validation/admin review workflows so the game can support a large word library without damaging trust through offensive, obscure, regionally confusing, or incorrectly classified words.

Recommended launch direction:

- Launch language: English (`en`) only unless Ashar explicitly approves multilingual launch scope.
- Launch word length: 5-letter standard mode, while preserving schema support for future word lengths.
- Answer list target: curated `4,000–8,000` high-quality 5-letter answer words for V1 production.
- Valid guess list target: broad `12,000–20,000` accepted 5-letter guesses, depending on source quality/licensing.
- Dictionary model: versioned, reviewable, server-driven, and activatable without client app releases.

## Decisions / Recommendations

1. **Use separate lists for answers and valid guesses.**
   - Answer words should be common enough, non-offensive, non-proper nouns, and gameplay-balanced.
   - Valid guesses can be broader to avoid frustrating rejected guesses.

2. **Use an internal curated dictionary as the source of truth.**
   - External lists should feed an import pipeline, but the shipped dictionary should be a reviewed, versioned Wordle Royale dataset.

3. **Avoid copying proprietary Wordle answer lists unless licensing is clearly safe.**
   - Publicly circulating Wordle answer lists may be legally or ethically risky if copied directly from proprietary game assets.

4. **Version dictionaries as immutable releases.**
   - A ranked match should store the exact dictionary/list version used so results remain auditable.

5. **Require admin review before activation.**
   - Imports should land in a draft/staged state, then pass automated checks and human review before activation.

6. **Keep offensive/sensitive filtering conservative for answer words.**
   - Offensive/sensitive words may be rejected entirely or allowed only as valid guesses if product/legal policy permits. They should not appear as answers in V1.

7. **Use gameplay analytics to refine difficulty after launch.**
   - Initial difficulty should come from frequency/commonness and linguistic heuristics; later difficulty should blend observed solve rate, average guesses, timeout rate, and invalid-guess confusion.

## Detailed Output

### 1. Recommended word-list sources

Use a source stack, not a single source.

#### Primary candidate sources

| Source | Use | Notes |
|---|---|---|
| SCOWL / wordfreq-style frequency sources | Frequency/commonness and broad valid guesses | Useful for commonness scoring; licensing must be checked per exact dataset/package. |
| wordfreq Python package / wordfreq-derived data | Frequency ranking support | Good for frequency scoring if license is acceptable for production use. |
| wordfreq + wordfreq-style corpora | Commonness tiers | Should be used as metadata, not blindly as answer list. |
| wordfreq/wordfreq-style language frequency lists | Difficulty seed | Useful for easy/medium/hard classification. |
| wordfreq-independent open English word lists | Valid guesses | Must be filtered aggressively for proper nouns, archaic words, offensive words, abbreviations, and non-alpha entries. |
| Wiktionary-derived datasets | Part-of-speech and lexical metadata | Good enrichment source but noisy; requires cleanup and licensing attribution review. |
| WordNet | Lemma/proper noun/synset metadata | Useful for filtering and metadata, but not enough for gameplay quality alone. |
| wordfreq/common crawl style frequency counts | Commonness score | Helps reduce obscure answer words. |
| Manual editorial curation | Final answer list quality | Required before production activation. |

#### Recommended V1 sourcing approach

1. Gather candidate 5-letter English words from multiple open/licensed sources.
2. Normalize to lowercase ASCII alphabetic words for V1.
3. Remove offensive/sensitive terms, proper nouns, abbreviations, hyphenated terms, contractions, rare archaic terms, and confusing variants.
4. Split into:
   - `answer_candidate`
   - `valid_guess_candidate`
   - `excluded`
5. Score candidates by frequency/commonness, letter composition, duplicate-letter complexity, and editorial flags.
6. Human-review the answer list before activation.

### 2. Licensing notes and risks

Licensing must be reviewed before any production import. Do not assume a GitHub word list is safe just because it is public.

#### Key risks

- **Proprietary Wordle lists:** Public copies of NYT/Wordle answer lists may be derived from proprietary game assets. Avoid direct copying unless counsel/product explicitly approves.
- **Attribution/copyleft requirements:** Some dictionary datasets require attribution or have share-alike obligations that may affect redistribution.
- **Dataset mixing:** Combining sources can create complex attribution requirements. Store source lineage per word/list.
- **App distribution:** Mobile app stores and web deployment may require clear content and privacy disclosures if dictionaries contain sensitive content.

#### Required license metadata

Every imported source should record:

- `source_name`
- `source_url`
- `source_version_or_downloaded_at`
- `license_name`
- `license_url`
- `attribution_required`
- `redistribution_allowed`
- `commercial_use_allowed`
- `notes`

### 3. Proposed answer-list size target

Recommended V1 production target:

- **Minimum curated answer list:** `2,500` words
- **Preferred V1 answer list:** `4,000–8,000` words
- **Long-term answer library:** `10,000+` words across languages, categories, variants, and word lengths

Rationale:

- A tiny answer list creates repetition and spoiler/list-memorization problems.
- Too broad an answer list increases frustration from obscure answers.
- The answer list should prioritize trust and fun over raw size.

### 4. Proposed valid-guess-list size target

Recommended V1 valid guess target:

- **Minimum valid guess list:** `10,000` 5-letter words
- **Preferred V1 valid guess list:** `12,000–20,000` accepted 5-letter guesses

Rationale:

- Valid guesses can be more permissive than answer words.
- Players should not be blocked for legitimate but uncommon words.
- Still exclude offensive, malformed, proper-noun-only, and obviously invalid entries depending on moderation policy.

### 5. Difficulty tiering model

Recommended tiers:

| Tier | Label | Meaning | Intended use |
|---|---|---|---|
| 1 | Easy | Common, familiar, simple spelling | Onboarding, casual, lower-rated queues |
| 2 | Medium | Normal adult vocabulary | Default V1 lobby setting |
| 3 | Hard | Less common or structurally tricky | Competitive/harder lobbies |
| 4 | Expert | Rare, ambiguous, duplicate-heavy, or low frequency | Optional/non-default; avoid in ranked until tuned |

Initial difficulty score should combine:

- Frequency/commonness percentile
- Word familiarity/commonness
- Letter rarity
- Duplicate letters
- Uncommon letter positions
- Potential regional spelling confusion
- Morphological complexity
- Historic solve rate once available
- Average guesses once available
- Timeout/failure rate once available

Suggested computed fields:

```text
initial_difficulty_score =
  frequency_component
  + letter_rarity_component
  + duplicate_letter_component
  + regional_confusion_component
  + editorial_adjustment
```

Later observed difficulty:

```text
observed_difficulty_score =
  weighted_average(
    normalized_failure_rate,
    normalized_average_guesses,
    normalized_average_solve_time,
    normalized_timeout_rate,
    normalized_invalid_guess_confusion
  )
```

### 6. Metadata fields for each word

Refine `word_entries` beyond the current architecture with these fields or equivalent JSON metadata.

#### Core fields

- `id`
- `text`
- `normalized_text`
- `language`
- `locale` — e.g. `en-US`, `en-GB`, or `en`.
- `length`
- `active`
- `created_at`
- `updated_at`

#### Classification fields

- `difficulty_tier` — `easy`, `medium`, `hard`, `expert`.
- `difficulty_score` — numeric computed score.
- `frequency_score` — numeric commonness score.
- `frequency_rank` — optional rank from source corpus.
- `part_of_speech` — optional.
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
- `regional_variant` — e.g. `us`, `uk`, `both`, `unknown`.
- `theme_tags` — optional list for future categories.

#### Review/audit fields

- `review_status` — `imported`, `auto_rejected`, `needs_review`, `approved`, `rejected`, `deprecated`.
- `reviewed_by`
- `reviewed_at`
- `review_notes`
- `deactivated_reason`
- `source_lineage` — source names/versions.
- `metadata` — JSONB for enrichment fields.

### 7. Offensive/sensitive word filtering approach

Use layered filtering.

#### Layer 1 — automated exact-match exclusion

Maintain banned/sensitive lists for:

- Slurs
- Profanity
- Sexual explicit terms
- Hate/extremist terms
- Graphic violence terms
- Personal insults/harassment terms
- Region-specific offensive terms

#### Layer 2 — fuzzy/variant detection

Flag for review:

- Leetspeak-like variants
- Common misspellings of slurs
- Derogatory abbreviations
- Terms with regional offensive meanings

#### Layer 3 — human review

Human review is required for:

- Any word marked `sensitive`
- Any answer candidate below commonness threshold
- Any word with disputed regional meaning
- Any term with possible proper-noun ambiguity

#### V1 policy recommendation

- **Answer list:** no offensive/sensitive terms.
- **Valid guess list:** default to excluding offensive/slur terms unless Ashar/legal explicitly wants legitimate dictionary profanity accepted as guesses. If accepted as guesses later, they should remain impossible as answers.
- **User-facing display:** never reveal banned terms as generated content or featured examples.

### 8. Review workflow for activating/deactivating words

Recommended state flow:

```text
imported
  -> auto_rejected        # failed hard validation
  -> needs_review         # passed basic validation but needs human decision
  -> approved             # can be included in staged list
  -> active               # included in active dictionary version
  -> deprecated           # no longer used in new versions
  -> deactivated          # emergency disabled
```

#### Activation workflow

1. Import candidate source into staging tables.
2. Normalize words and attach source/license metadata.
3. Run validation and moderation filters.
4. Generate review queue.
5. Admin/content reviewer approves/rejects candidates.
6. Build draft dictionary version.
7. Run validation suite on draft version.
8. Activate dictionary version atomically.
9. Store activation audit log.

#### Deactivation workflow

1. Admin selects word or list entry.
2. Admin provides reason: `offensive`, `too_obscure`, `proper_noun`, `bad_source`, `bug`, `legal`, `other`.
3. System removes it from future selection immediately.
4. Existing/completed matches remain auditable with old dictionary version.
5. If a currently active round is affected, do not mutate the answer mid-round unless it is a severe moderation/legal emergency.

### 9. Versioning strategy

Use immutable semantic dictionary versions.

Suggested format:

```text
en-5-standard-answer-v2026.06.001
en-5-standard-guess-v2026.06.001
en-5-banned-v2026.06.001
```

Each match/round should store:

- `answer_word_id`
- `answer_list_id`
- `answer_list_version`
- `valid_guess_list_id`
- `valid_guess_list_version`
- `banned_list_version`

Rules:

- Active dictionary versions are selected at match/round generation time.
- Never mutate an active version in place; create a new version.
- Emergency deactivation should create a patch version and prevent future selection.
- Ranked matches should only use approved ranked-compatible dictionary versions.

### 10. Import pipeline design

Recommended tooling package path once implementation begins:

```text
packages/word-tools/
  src/
    import-source.ts
    normalize.ts
    classify.ts
    validate.ts
    build-version.ts
    export-fixtures.ts
  data/
    sources/
    staging/
    generated/
```

Recommended pipeline stages:

1. **Source registration**
   - Record source/license metadata.
   - Store raw file checksum.

2. **Raw import**
   - Read source file.
   - Store raw candidate entries with source lineage.

3. **Normalization**
   - Lowercase.
   - Trim whitespace.
   - Reject non-alpha V1 entries.
   - Normalize accents only if language policy supports it; for English V1, prefer ASCII-only.

4. **Structural validation**
   - Exact word length.
   - Alphabetic-only.
   - No spaces, hyphens, apostrophes, digits.
   - No duplicates after normalization.

5. **Classification/enrichment**
   - Frequency score.
   - Part of speech if available.
   - Proper noun suspicion.
   - Offensive/sensitive flags.
   - Plural/inflection flags.
   - Difficulty score.

6. **Eligibility assignment**
   - `answer_candidate`
   - `guess_candidate`
   - `banned`
   - `needs_review`
   - `auto_rejected`

7. **Review export/admin queue**
   - Export candidates needing decision.
   - Admin approves/rejects.

8. **Build dictionary version**
   - Generate answer list, guess list, banned list.
   - Run validation suite.
   - Produce manifest with counts/checksums.

9. **Activate**
   - Atomic activation in DB.
   - Audit log entry.

### 11. Validation rules

#### Hard validation rules

A word must:

- Match configured length for the list.
- Be lowercase-normalizable.
- Contain only allowed characters for the language/locale.
- Be unique by `(language, normalized_text)`.
- Have source lineage.
- Not be both `active` and `banned`.
- Not be answer-eligible if offensive/sensitive/proper-noun-only/abbreviation-only.
- Not be answer-eligible if below minimum commonness threshold unless manually approved.

#### Answer-list validation rules

An answer list must:

- Have minimum size threshold, recommended `>= 2,500` for V1.
- Contain only approved answer-eligible words.
- Exclude banned/offensive/sensitive words.
- Exclude known proper nouns and abbreviations.
- Have difficulty distribution within approved ranges.
- Have no duplicate normalized words.
- Have manifest checksum.

#### Valid-guess-list validation rules

A valid guess list must:

- Include all active answer words.
- Have broader candidate coverage than answer list.
- Exclude banned malformed terms.
- Follow V1 language/length/character policy.
- Have manifest checksum.

#### Runtime validation rules

On guess submission:

- Normalize guess.
- Validate match/round active state.
- Validate player participant state.
- Validate length and allowed characters.
- Check active valid-guess dictionary version for that round/match.
- Reject invalid guesses without consuming attempt, consistent with current product assumption.
- Rate-limit repeated invalid guesses.

### 12. Admin tooling requirements

Minimum admin tooling:

- Search words by text, status, difficulty, source, flags, list membership.
- View word detail with source/license/review metadata.
- Approve/reject imported candidates.
- Mark answer eligibility and guess eligibility.
- Mark offensive/sensitive/proper noun/plural/regional flags.
- Deactivate words with required reason.
- Create draft word-list versions.
- Run validation before activation.
- Activate/deactivate word-list versions.
- View dictionary version manifest and counts.
- Export review queue CSV/JSON if no full admin UI exists yet.
- Audit every admin action.

Recommended V1 approach:

- Start with admin APIs + CLI review/import tools.
- Add full admin UI once the data model and workflow are stable.

### 13. Analytics loop for improving difficulty using gameplay data

Collect aggregate difficulty signals per `(word_id, dictionary_version, difficulty_tier, mode)`.

Recommended metrics:

- Times selected as answer
- Solve rate
- Average guesses when solved
- Average solve time
- Timeout/failure rate
- First-guess solve rate
- Distribution of guess counts `1–6`
- Invalid guesses related to the answer/round
- Abandon rate during rounds containing the word
- Rating-adjusted solve rate
- Device/platform split if needed for UX issues

Recommended recalibration process:

1. Keep initial difficulty from imported metadata and editorial review.
2. After minimum sample size, compute observed difficulty.
3. Compare expected tier vs observed performance.
4. Flag outliers for content review.
5. Propose tier changes in a draft dictionary version.
6. Do not silently change active ranked dictionaries mid-season unless approved.

Suggested minimum sample sizes before auto-suggestions:

- `>= 100` answer appearances for casual insights.
- `>= 500` answer appearances for ranked difficulty changes.
- Use rating-adjusted buckets to avoid labeling words easy/hard based only on player population skew.

### 14. Data model refinements

Recommended additions/refinements to Elisa's schema:

#### `word_sources`

```sql
word_sources (
  id uuid primary key,
  name text not null,
  url text null,
  version text null,
  license_name text not null,
  license_url text null,
  attribution_required boolean not null default false,
  commercial_use_allowed boolean null,
  redistribution_allowed boolean null,
  downloaded_at timestamptz not null,
  checksum text null,
  notes text null
)
```

#### `word_reviews`

```sql
word_reviews (
  id uuid primary key,
  word_id uuid not null references word_entries(id),
  reviewer_user_id uuid not null references users(id),
  decision text not null, -- approved, rejected, deactivated, needs_more_info
  reason text null,
  before jsonb null,
  after jsonb null,
  created_at timestamptz not null
)
```

#### `word_difficulty_metrics`

```sql
word_difficulty_metrics (
  word_id uuid not null references word_entries(id),
  dictionary_version text not null,
  mode text not null,
  appearances int not null default 0,
  solve_rate numeric null,
  average_guesses numeric null,
  average_solve_ms numeric null,
  timeout_rate numeric null,
  failure_rate numeric null,
  rating_adjusted_score numeric null,
  updated_at timestamptz not null,
  primary key(word_id, dictionary_version, mode)
)
```

#### `word_list_activation_events`

```sql
word_list_activation_events (
  id uuid primary key,
  word_list_id uuid not null references word_lists(id),
  activated_by uuid not null references users(id),
  previous_active_word_list_id uuid null references word_lists(id),
  reason text not null,
  created_at timestamptz not null
)
```

### 15. Future language/category expansion

Design now for:

- Multiple languages: `language`, `locale`, per-language normalization rules.
- Multiple word lengths: `length` must not be hard-coded to 5 outside V1 mode config.
- Themed/category packs: tags, category membership, separate ranked eligibility.
- Regional dictionaries: US/UK/common English policy.
- Custom/private dictionaries later: require much stronger moderation and ranked exclusion by default.

V1 recommendation:

- English only.
- 5-letter only.
- No user-generated word packs.
- Themed packs are later, not launch-blocking.

## Open Questions

1. Should V1 English use US spelling only, UK spelling only, or a combined common-English policy?
2. Should offensive/profane words be rejected from valid guesses entirely, or only excluded from answers?
3. What exact license constraints does Ashar want: commercial use required, attribution acceptable, no copyleft, etc.?
4. Should ranked mode use only `easy/medium/hard` and exclude `expert` until enough analytics exist?
5. Should answer difficulty be host-selectable in ranked, or should ranked have a fixed official dictionary/difficulty mix?
6. Is there a preferred admin implementation for V1: CLI/import scripts first, admin API first, or full admin dashboard?

## Follow-up Tickets

### Follow-up ticket 1

- **Target agent:** Athena
- **Why that agent is needed:** Athena owns scope decisions and sequencing.
- **Exact task:** Route the open dictionary policy decisions to Ashar, especially regional spelling, offensive valid-guess policy, and ranked dictionary restrictions.
- **Inputs/context they need:** This response, Elisa PRD word-library section, Elisa architecture word-library schema.
- **Expected output back to Athena:** Approved content policy decisions and implementation priority order.

### Follow-up ticket 2

- **Target agent:** Elisa
- **Why that agent is needed:** Elisa owns architecture/API/data model contracts.
- **Exact task:** Review and approve/refine the proposed schema additions: `word_sources`, `word_reviews`, `word_difficulty_metrics`, and `word_list_activation_events`.
- **Inputs/context they need:** Data model refinements section in this response and Elisa's existing `word_entries`, `word_lists`, `word_list_entries` schema.
- **Expected output back to Athena:** Finalized word-library data model/API contract for implementation.

### Follow-up ticket 3

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/core server-side implementation.
- **Exact task:** Implement backend dictionary lookup and guess validation using active dictionary versions selected per match/round.
- **Inputs/context they need:** This plan, Freya game-engine spec once complete, Elisa API contract.
- **Expected output back to Athena:** Backend validation implementation with tests proving answer/guess/banned/version behavior.

### Follow-up ticket 4

- **Target agent:** Ruby
- **Why that agent is needed:** Ruby owns tooling/data pipelines.
- **Exact task:** Implement initial word import/normalization/validation CLI and produce a small non-production fixture dictionary for game-engine tests.
- **Inputs/context they need:** Approved source/licensing policy and finalized data model.
- **Expected output back to Athena:** Import script, validation script, fixture output, exact commands run, and validation evidence.

### Follow-up ticket 5

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns product-facing UI.
- **Exact task:** Design/admin-facing word review screens or lightweight UI flow for searching, approving, rejecting, and deactivating words.
- **Inputs/context they need:** Admin tooling requirements and finalized admin API contract.
- **Expected output back to Athena:** UI flow/component plan for word moderation/admin review.

### Follow-up ticket 6

- **Target agent:** Jasmine
- **Why that agent is needed:** Jasmine owns independent QA/verification.
- **Exact task:** Create a word-library QA matrix covering invalid guesses, banned words, duplicate letters, answer eligibility, version switching, emergency deactivation, and regional/proper-noun edge cases.
- **Inputs/context they need:** This response plus Freya's game-engine spec.
- **Expected output back to Athena:** Acceptance test matrix and release-blocking dictionary quality checks.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-05-ruby-word-library-content-plan-response.md`

## Tests / Commands Run

None — planning/spec task only.

## Evidence / Result

Created this Markdown response file in the required responses folder with the required response structure and covered the ticket acceptance criteria:

1. Recommended word-list sources.
2. Licensing notes and risks.
3. Proposed answer-list size target.
4. Proposed valid-guess-list size target.
5. Difficulty tiering model.
6. Metadata fields for each word.
7. Offensive/sensitive word filtering approach.
8. Review workflow for activating/deactivating words.
9. Versioning strategy.
10. Import pipeline design.
11. Validation rules.
12. Admin tooling requirements.
13. Analytics loop for improving difficulty using gameplay data.
14. Follow-up implementation tickets.

## Risks / Blockers

- **Licensing risk:** Exact word-list source licenses must be checked before production use.
- **Content trust risk:** A very large answer list can harm gameplay if it includes obscure, offensive, or regionally confusing words.
- **Policy blocker:** Ashar/Athena need to decide regional spelling and offensive valid-guess policy.
- **Implementation dependency:** Backend guess validation and ranked dictionary behavior depend on Freya's game-engine spec and Elisa's final API/data contract.
- **Moderation risk:** Admin review tooling is not optional for a production-ranked word game; without it, bad content can leak into live matches.
