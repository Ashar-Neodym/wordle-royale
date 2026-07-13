# Ticket 134 — Preview Dictionary Bootstrap and Readiness Contract — Response

Task: Ticket 134 — Preview Dictionary Bootstrap and Readiness Contract
Agent: Elisa (architect)
Status: Complete — decision lock only; no provider or data mutation

## Summary

Locked the environment, bootstrap, selection, readiness, failure, and rollback contract needed to clear Ticket 128's hosted dictionary blocker safely.

Decision: the exact validated fixture `en-5-test-vfixture.001` may be used in **`APP_ENV=preview` only**. It remains explicitly fixture-only and non-production-approved:

```text
id=dict_en_5_test_vfixture_001
version=en-5-test-vfixture.001
status=draft
fixtureOnly=true
productionApproved=false
sourcePolicy=hand_curated_safe_fixture_only
validation.passed=true
counts=20 answers / 40 guesses / 3 banned / 63 total
```

This is a narrow preview exception, not production content approval.

## Design output

Created:

- `docs/2026-07-13-preview-dictionary-bootstrap-readiness-contract.md`

## Locked decisions

### Preview/production boundary

- `APP_ENV=preview` may use:
  1. a valid active, production-approved, non-fixture release; otherwise
  2. only the exact validated `en-5-test-vfixture.001` exception.
- `APP_ENV=production` requires an active, validated, `fixtureOnly=false`, `productionApproved=true` release with actual answer rows.
- Production always rejects the exact fixture release, even if someone changes its status to active.
- Unknown environments fail closed.
- `NODE_ENV=production` does not imply content approval; hosted preview must be governed by `APP_ENV=preview`.

### Dictionary-only bootstrap

Freya should add:

```bash
pnpm --filter @wordle-royale/api db:bootstrap:preview-dictionary -- --dry-run
pnpm --filter @wordle-royale/api db:bootstrap:preview-dictionary -- --apply
```

Apply requires all of:

```text
--apply
APP_ENV=preview
PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM=APPLY_EN_5_TEST_VFIXTURE_001_TO_PREVIEW
DATABASE_URL present
```

Allowed writes are exactly one deterministic `DictionaryRelease` and its 63 `DictionaryWord` rows. The command must never create fixture users, profiles, ratings, lobbies, matches, matchmaking tickets, or other local seed data.

`db:seed:local` is explicitly prohibited against hosted preview.

### Idempotency and conflict behavior

- Release version/content identity is immutable.
- Existing exact release must match id, artifact hash, policy flags, validation state, and aggregate counts.
- Conflicts fail closed with `preview_dictionary_release_conflict` rather than overwriting.
- Second application returns unchanged/verified and preserves exact counts.
- Output is aggregate-only and must not print answer words, credentials, environment dumps, cookies, or tokens.

### Runtime selection

Readiness and matchmaking must share one environment-aware selector. Replace the current broad `active|draft` lookup, which can accept arbitrary unapproved drafts.

The selector must verify actual answer rows, not only count metadata.

### `/readyz`

Add blocking dependency `standardDictionary` when Standard queue is enabled:

```text
queue enabled + usable dictionary    -> standardDictionary=ok
queue enabled + no usable dictionary -> standardDictionary=unavailable; top-level unavailable
queue disabled                       -> standardDictionary=not_checked_stub; non-blocking
```

`/healthz` remains process liveness only.

### Missing dictionary behavior

Migrations-only database must produce the same safe result for sequential and concurrent joins:

```http
HTTP 503
```

```text
code=dictionary_release_unavailable
message=No approved dictionary release is available for Standard matchmaking.
```

Dictionary selection should occur before creation of rating profiles, queue tickets, audit rows, matches, rounds, or participants. Failed joins must roll back with zero side effects and never expose the generic `500` observed during Ticket 128.

### Rollback

Preferred emergency action is disabling Standard queue without destructive schema rollback.

For the exact fixture release:

- if unused by matches, a separately approved operation may delete or retire only that release;
- if referenced by any match, do not delete—mark the exact release retired;
- never bulk-delete dictionary tables or production-approved content.

## Files changed

Created:

- `docs/2026-07-13-preview-dictionary-bootstrap-readiness-contract.md`
- `agent-communication/responses/ticket-134-elisa-preview-dictionary-bootstrap-readiness-contract-response.md`

No product source, provider configuration, deployment, secrets, or hosted data were changed.

## Verification

```text
# date +%F
2026-07-13

# CI=true pnpm typecheck
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).

# git diff --check
<no output; exit 0>

# pnpm secret-scan
$ node scripts/secret-scan.mjs
Secret scan passed (205 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.

# git status --short --branch
## main...origin/main
 M agent-communication/index.md
?? agent-communication/responses/ticket-128-yuna-hosted-preview-wave-r-deploy-smoke-response.md
?? agent-communication/responses/ticket-134-elisa-preview-dictionary-bootstrap-readiness-contract-response.md
?? agent-communication/tickets/ticket-134-elisa-preview-dictionary-bootstrap-readiness-contract.md
?? agent-communication/tickets/ticket-135-freya-dictionary-only-preview-bootstrap-readiness.md
?? agent-communication/tickets/ticket-136-jasmine-preview-dictionary-bootstrap-qa.md
?? agent-communication/tickets/ticket-137-yuna-wave-r-hosted-fix-checkpoint-pr-ci.md
?? docs/2026-07-13-athena-ticket-128-dictionary-bootstrap-review.md
?? docs/2026-07-13-preview-dictionary-bootstrap-readiness-contract.md
```

Note: `pnpm secret-scan` excludes `docs` and `agent-communication`, where Ticket 134's Markdown artifacts live. The new artifacts were manually kept free of credentials, connection strings, cookies, tokens, and answer-word lists.

## Acceptance criteria

| Criterion | Status |
|---|---:|
| Exact preview/production boundary explicit | Pass |
| Exact fixture preview-only decision recorded | Pass |
| Dictionary-only, idempotent bootstrap contract defined | Pass |
| Explicit remote preview confirmation guard defined | Pass |
| `/readyz` operational dictionary semantics defined | Pass |
| Sequential/concurrent safe missing-dictionary behavior defined | Pass |
| Rollback/disable behavior defined | Pass |
| No wholesale `db:seed:local` against preview | Pass |
| No provider/data mutation performed | Pass |
| Implementation-ready handoff for Freya/Yuna | Pass |

## Implementation handoff

### Freya / Ticket 135

Implement:

- dictionary-only plan and guarded command;
- exact immutable/idempotent verification;
- shared preview/production selector;
- `standardDictionary` readiness dependency;
- stable `503` before matchmaking side effects;
- fresh-Postgres integration coverage.

### Jasmine / Ticket 136

Independently verify:

- wrong-env/missing-confirmation rejection;
- exact release/counts;
- zero fixture identities or gameplay rows;
- second-run idempotency;
- readiness before/after bootstrap;
- safe sequential/concurrent `503`;
- production rejection of fixture;
- two authenticated users create one shared non-self match after bootstrap.

### Yuna / Ticket 137 and resumed Ticket 128

- Ticket 137 must remain code/PR/CI only.
- Do not run hosted bootstrap until implementation is merged, Jasmine passes, and Ashar separately approves the hosted data mutation.
- After approval, run only the reviewed dictionary-only command and capture non-secret aggregate evidence.

## Risks / follow-ups

- JSON metadata eligibility checks must fail closed on missing/malformed fields.
- Shared selection logic is important; readiness and matchmaking must not drift.
- The exact preview fixture is intentionally small and is not suitable as a production dictionary.
- Provider-side queue disable or hosted bootstrap remains a separate explicit approval action.
