# Preview dictionary bootstrap and readiness contract — Wave R Hosted Fix

Date: 2026-07-13
Owner: Elisa
Ticket: 134 — Preview Dictionary Bootstrap and Readiness Contract
Status: decision lock for implementation; no provider or data mutation performed

## 1. Decision summary

The validated fixture release `en-5-test-vfixture.001` is approved for **`APP_ENV=preview` only** so the controlled hosted preview can exercise Standard 1v1 matchmaking.

This approval does **not** make the fixture production content:

```text
id=dict_en_5_test_vfixture_001
version=en-5-test-vfixture.001
status=draft
fixtureOnly=true
productionApproved=false
sourcePolicy=hand_curated_safe_fixture_only
validation.passed=true
answers=20
guesses=40
banned=3
totalWords=63
```

Locked implementation decisions:

1. Add a separate, dictionary-only bootstrap command. Never run `db:seed:local` against hosted preview.
2. Bootstrap writes only the exact approved `DictionaryRelease` and its 63 deterministic `DictionaryWord` rows.
3. Remote/hosted apply requires `APP_ENV=preview`, `--apply`, and an exact confirmation phrase.
4. Preview selection may accept only the exact validated fixture exception or a future active production-approved release.
5. Production selection must reject fixture-only, draft, or non-production-approved releases.
6. `/readyz` must include operational Standard dictionary availability whenever Standard queue is enabled.
7. Missing dictionary must produce the same spoiler-safe `503 dictionary_release_unavailable` for sequential and concurrent queue joins.
8. No hosted data mutation is authorized by Ticket 134. Hosted apply remains gated on implementation, QA PASS, and explicit Ashar approval.

## 2. Environment and content boundary

### 2.1 Environment contract

Use the resolved `APP_ENV` value already defined by runtime configuration:

| `APP_ENV` | Fixture release allowed? | Required release policy |
|---|---:|---|
| `local` | Yes for local tests/seeding | Local fixture workflow may use draft fixture data. |
| `test` | Yes for disposable test databases | Tests may use the deterministic fixture. |
| `preview` | **Yes, exact exception only** | Exact `en-5-test-vfixture.001` identity and metadata/count policy below. |
| `production` | **No** | Active, `fixtureOnly=false`, `productionApproved=true`, validation passed, usable answers. |
| unknown value | No | Fail closed; do not select or bootstrap fixture data. |

`NODE_ENV=production` does not imply content is production-approved. Selection must use resolved `APP_ENV`, because hosted preview runs production-built code with `APP_ENV=preview`.

### 2.2 Preview fixture exception

A release is usable as the preview fixture only when all conditions are true:

```text
APP_ENV=preview
id=dict_en_5_test_vfixture_001
locale=en
wordLength=5
version=en-5-test-vfixture.001
status=draft or active
sourceMetadata.fixtureOnly=true
sourceMetadata.productionApproved=false
sourceMetadata.sourcePolicy=hand_curated_safe_fixture_only
sourceMetadata.validation.passed=true
artifactSha256=<exact deterministic fixture artifact hash>
answerCount=20
guessCount=40
bannedCount=3
actual DictionaryWord counts=20 answer, 40 guess, 3 banned
```

The fixture should remain `draft`. Preview selection is the explicit exception; do not mark it `active` merely to bypass production policy.

If the exact version exists but its immutable identity, artifact hash, metadata policy, or word counts differ, treat it as a conflict—not as a candidate to overwrite or serve.

### 2.3 Production policy

For `APP_ENV=production`, a usable Standard dictionary must satisfy:

```text
locale=en
wordLength=5
status=active
sourceMetadata.fixtureOnly=false
sourceMetadata.productionApproved=true
sourceMetadata.validation.passed=true
answerCount > 0
at least one actual DictionaryWord(kind=answer)
```

Production must reject:

- `status=draft`;
- `fixtureOnly=true`;
- `productionApproved=false` or missing;
- the version/id `en-5-test-vfixture.001` / `dict_en_5_test_vfixture_001` regardless of other flags;
- releases with count metadata but no actual answer rows.

A future production dictionary approval is a separate content/licensing decision and is not granted here.

### 2.4 Selection order

Implement one shared selector used by matchmaking and readiness.

For `APP_ENV=preview`:

1. Prefer the newest valid `active`, non-fixture, production-approved release.
2. Otherwise accept only the exact validated preview fixture exception.
3. Otherwise return unavailable.

For `APP_ENV=production`:

1. Select only a valid active production-approved non-fixture release.
2. Otherwise return unavailable.

For local/test:

- deterministic fixture selection is allowed, but production rules must remain testable explicitly.

Do not retain the current broad `status IN ('active', 'draft') AND wordLength=5` lookup; it can select arbitrary draft or unapproved data.

## 3. Dictionary-only bootstrap contract

### 3.1 Command boundary

Ticket 135 should add a clearly named command:

```bash
pnpm --filter @wordle-royale/api db:bootstrap:preview-dictionary -- --dry-run
pnpm --filter @wordle-royale/api db:bootstrap:preview-dictionary -- --apply
```

Dry-run is the default when `--apply` is absent. Dry-run must not require or connect to `DATABASE_URL` and must produce aggregate metadata only.

The command must call a dictionary-only plan builder, not the existing whole local seed apply function.

Recommended code split:

```text
apps/api/prisma/dictionary-fixture.ts
  buildPreviewDictionaryPlan()
  buildPreviewDictionarySummary()
  validatePreviewDictionaryPlan()

apps/api/prisma/bootstrap-preview-dictionary.ts
  parse guards
  dry-run
  apply dictionary-only transaction

apps/api/prisma/seed-fixtures.ts
  may reuse buildPreviewDictionaryPlan()
  remains local-only user/profile/rating seed workflow
```

### 3.2 Exact confirmation guard

Applying the fixture requires all of:

```text
--apply
APP_ENV=preview
PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM=APPLY_EN_5_TEST_VFIXTURE_001_TO_PREVIEW
DATABASE_URL is present
```

Recommended guard behavior:

| Missing/invalid input | Exit | Stable code/message |
|---|---:|---|
| No `--apply` | 0 | Dry-run only. |
| `APP_ENV != preview` | non-zero | `preview_dictionary_wrong_environment` |
| Confirmation missing/wrong | non-zero | `preview_dictionary_confirmation_required` |
| `DATABASE_URL` missing | non-zero | `preview_dictionary_database_required` |
| Plan validation fails | non-zero | `preview_dictionary_plan_invalid` |
| Existing immutable release conflicts | non-zero | `preview_dictionary_release_conflict` |

The confirmation phrase is an operational guard, not a secret. It may be documented. Database credentials remain secret and must never be printed.

The command must not infer approval merely because the hostname looks remote or because `NODE_ENV=production`. It must require the exact `APP_ENV` and confirmation contract.

### 3.3 Allowed writes

The bootstrap transaction may write only:

- one `DictionaryRelease` with the exact approved deterministic identity;
- the 63 expected `DictionaryWord` rows belonging to that release.

It must not write or update:

- `UserAccount`;
- `UserProfile`;
- `RatingProfile`;
- `RatingEvent`;
- `Lobby`;
- `Match` / `MatchRound` / `MatchParticipant`;
- `MatchmakingTicket`;
- consent, analytics, or audit rows unless a later explicit operational-audit design is approved.

### 3.4 Idempotency and immutability

The release version is immutable content identity.

Apply algorithm:

1. Build and validate deterministic plan in memory.
2. Start one DB transaction.
3. Read release by `(locale, wordLength, version)`.
4. If absent, create exact release.
5. If present, compare id, artifact hash, source policy flags, validation flag, and aggregate counts.
6. If any immutable field conflicts, abort with `preview_dictionary_release_conflict`; do not overwrite.
7. Upsert/create expected words by deterministic identity or existing unique key.
8. Query actual counts by kind for this release.
9. Require exact `20/40/3/63` counts and no unexpected words.
10. Commit only if final verification passes.

A second application must report `unchanged` or `verified` and leave row counts identical. `createMany(skipDuplicates=true)` alone is insufficient unless followed by exact conflict/count verification.

### 3.5 Output safety

Allowed output:

```text
mode=dry-run|apply
releaseId=dict_en_5_test_vfixture_001
version=en-5-test-vfixture.001
status=draft
artifactSha256=<hash>
counts answer=20 guess=40 banned=3 total=63
fixtureOnly=true
productionApproved=false
result=planned|created|unchanged
```

Forbidden output:

- answer words or guess lists;
- database URL or parsed credentials;
- environment dumps;
- session cookies/tokens;
- raw Prisma errors containing connection strings.

Sanitize caught errors before displaying an operator message.

## 4. Runtime dictionary selector contract

Create a shared service/function such as:

```ts
type StandardDictionarySelection = {
  releaseId: string;
  version: string;
  policy: 'preview_fixture_exception' | 'production_approved';
  answerCount: number;
};

selectStandardDictionary(appEnv: string): Promise<StandardDictionarySelection | null>
checkStandardDictionary(appEnv: string): Promise<ReadinessDependency>
```

Both readiness and matchmaking must use the same policy predicate. They may use different query projections, but must not independently redefine eligibility.

Selection checks actual answer-row existence. For the preview fixture exception, check exact actual counts. Do not expose the selected answer or answer hash in logs/readiness/queue responses.

## 5. `/readyz` operational semantics

### 5.1 New dependency

Add a readiness dependency named `standardDictionary`:

```ts
dependencies: {
  database: ReadinessDependency;
  applicationSchema: ReadinessDependency;
  standardDictionary: ReadinessDependency;
  redis: ReadinessDependency;
}
```

The generic readiness contract already supports arbitrary dependency names, so this should not require a breaking envelope change.

### 5.2 Blocking behavior

When `STANDARD_1V1_QUEUE_ENABLED` resolves true:

- `standardDictionary.status=ok` only when the environment-specific selector finds a usable release with valid answer rows.
- `standardDictionary.status=unavailable` when no usable release exists, the fixture conflicts, counts are invalid, or the check errors.
- Top-level `/readyz.status=unavailable` and HTTP status should follow existing unavailable behavior.
- Message must be operational and spoiler-safe.

Examples:

```json
{
  "status": "unavailable",
  "message": "No usable Standard dictionary is available for APP_ENV=preview. Run the reviewed preview dictionary bootstrap after approval."
}
```

```json
{
  "status": "ok",
  "message": "Standard dictionary is available for preview matchmaking (version en-5-test-vfixture.001; 20 answers)."
}
```

When `STANDARD_1V1_QUEUE_ENABLED=false`:

```json
{
  "status": "not_checked_stub",
  "message": "Standard dictionary is not required because Standard matchmaking is disabled."
}
```

`not_checked_stub` remains non-blocking, matching Redis-optional semantics. `/healthz` remains process-liveness only and should not query dictionary data.

### 5.3 Dependency failure ordering

- If database is unavailable, dictionary check may also report unavailable with a sanitized database-dependent message.
- If application schema is missing dictionary tables, dictionary status is unavailable; do not throw an uncaught error.
- Readiness must never report top-level `ok` when queue is enabled but no usable dictionary exists.

## 6. Matchmaking failure contract

### 6.1 Stable public error

When no environment-approved Standard dictionary exists, every queue join path returns:

```http
HTTP 503
```

```json
{
  "code": "dictionary_release_unavailable",
  "message": "No approved dictionary release is available for Standard matchmaking."
}
```

Do not expose:

- whether a draft release exists;
- metadata mismatch details;
- answer counts beyond readiness/operator diagnostics;
- SQL/Prisma/provider error details.

### 6.2 Sequential and concurrent behavior

The service must normalize missing dictionary before queue/match side effects:

1. Resolve usable Standard dictionary at the start of the join transaction, before creating rating profiles, tickets, or audit rows.
2. If unavailable, throw the stable `ServiceUnavailableException` above.
3. Re-check/use the same selected release when pairing and match creation occur.
4. Any transaction retry caused by concurrent joins must preserve the same safe `503` when dictionary remains unavailable.

Required outcomes on a migrations-only database:

- sequential join A -> `503 dictionary_release_unavailable`;
- retry join A -> same `503`;
- concurrent joins A+B -> both safe `503` classifications, never generic `500`;
- zero new rating profiles, queue tickets, matches, rounds, participants, or audit rows from failed joins.

If a release is retired between selection and match creation, the transaction must fail safely and roll back all queue/match side effects.

## 7. Rollback and disable strategy

### 7.1 Preferred emergency action

If the preview fixture causes a problem after hosted apply:

1. Set `STANDARD_1V1_QUEUE_ENABLED=false` through the existing reviewed provider-change workflow.
2. Confirm `/readyz.dependencies.standardDictionary=not_checked_stub` and the queue endpoint returns `standard_1v1_queue_disabled`.
3. Preserve schema and existing match/rating data.

This provider change requires the usual explicit approval; Ticket 134 performs none.

### 7.2 Fixture release rollback

For the exact release only:

- If no `Match` references the release, a reviewed operator command may delete its `DictionaryWord` rows and exact `DictionaryRelease` row transactionally, or mark it `retired`.
- If any match references it, do not delete. Mark only the exact release `retired` so selectors stop using it while historical referential integrity remains intact.
- Never bulk-delete dictionary tables or drop schema/migrations as rollback.
- Never delete production-approved releases through the preview fixture rollback path.

Rollback mutation against hosted preview requires separate explicit Ashar approval and non-secret before/after counts.

## 8. Verification contract

### 8.1 Unit tests

- preview accepts exact fixture exception;
- preview rejects arbitrary draft fixtures;
- preview prefers valid production-approved active release;
- production rejects exact fixture even if status is changed to active;
- production rejects missing approval flags;
- production accepts valid active non-fixture approved release;
- unknown environment fails closed;
- readiness is non-blocking only when queue is disabled;
- readiness is unavailable when queue enabled and dictionary absent.

### 8.2 Bootstrap tests

- dry-run performs no DB connection/write;
- wrong environment rejects apply;
- missing/wrong confirmation rejects apply;
- dictionary-only apply creates exact `1` release and `63` words;
- aggregate counts are `20/40/3`;
- zero fixture users/profiles/ratings/lobbies/matches/tickets are created;
- second apply is idempotent;
- conflicting pre-existing release fails closed without mutation;
- output contains no answer words or credentials.

### 8.3 Fresh-PostgreSQL integration

Against a disposable freshly migrated schema:

1. Migrations only:
   - `/readyz` reports `standardDictionary=unavailable` when queue enabled;
   - sequential and concurrent joins return safe `503`;
   - no failed-join side effects.
2. Run dictionary-only bootstrap with explicit preview guard.
3. Verify exact release/word counts and zero fixture identity/game rows.
4. Run bootstrap again and verify unchanged counts.
5. `/readyz` becomes `ok` with `standardDictionary=ok`.
6. Two distinct authenticated preview users produce exactly one shared, non-self Standard match.
7. Match references the exact selected release without exposing answer data.

## 9. Hosted operation approval gate

The reviewed hosted sequence is:

1. Freya implements Ticket 135 without touching hosted providers/data.
2. Canonical CI and real-Postgres integration pass.
3. Jasmine independently returns Ticket 136 PASS.
4. Yuna completes Ticket 137 checkpoint PR/CI; no merge without Ashar approval.
5. Ashar approves PR merge; main CI and deploy are monitored.
6. **Separate approval:** Ashar explicitly approves hosted preview dictionary data mutation.
7. Yuna runs only the reviewed dictionary-only bootstrap command with `APP_ENV=preview` and exact confirmation.
8. Yuna records non-secret result, release identity/hash, and aggregate counts.
9. Yuna reruns Ticket 128 two-session queue/match/reconnect/rating smoke.
10. Jasmine performs final hosted QA under Ticket 129.

No step may substitute `db:seed:local` for the dictionary-only bootstrap.

## 10. Implementation handoff

### Freya / Ticket 135

Implement:

- dictionary-only plan and guarded command;
- immutable/idempotent apply verification;
- shared environment-aware Standard dictionary selector;
- `standardDictionary` readiness dependency;
- stable sequential/concurrent `503` behavior before side effects;
- fresh-Postgres integration and operator documentation.

### Jasmine / Ticket 136

Independently verify every boundary in Section 8, especially zero fixture identities/game rows and production rejection of the preview fixture.

### Yuna / Ticket 137 and resumed Ticket 128

Do not mutate hosted preview during Ticket 137. After merge and separate data-mutation approval, run only the exact reviewed command and capture aggregate, non-secret evidence.

## 11. Non-goals

- No production dictionary approval.
- No new dictionary content or licensing decision.
- No wholesale local seed against hosted preview.
- No provider configuration, deployment, or hosted data mutation.
- No Redis requirement.
- No changes to gameplay scoring or rating algorithms.
