# Ticket 136 — Preview Dictionary Bootstrap Independent QA Response

Task: Ticket 136 — Preview Dictionary Bootstrap Independent QA
Agent: Jasmine (QA)
Verdict: **PASS**
Date: 2026-07-13

## Summary

The dictionary-only preview bootstrap, readiness transition, missing-dictionary failure behavior, environment selection policy, idempotency, and post-bootstrap Standard matchmaking passed independent QA against a newly migrated disposable PostgreSQL schema.

The final disposable-schema run included the release-row lock and pair-time eligibility revalidation added after Freya's earlier PostgreSQL run. The harness created a unique schema, applied all three migrations, passed all three integration tests, and dropped the schema. A follow-up database query confirmed zero `ticket135_%` schemas remained.

Ticket 137 may proceed to its code/PR/CI checkpoint. **No hosted database mutation was performed or authorized by this QA pass.** Hosted preview bootstrap still requires Ashar's separate explicit approval and must use only the reviewed dictionary-only command.

## Acceptance criteria checked

| # | Criterion | Result | Independent evidence |
|---|---|---:|---|
| 1 | Migrations-only schema has no usable dictionary, approved unavailable readiness, and safe sequential/concurrent `503 dictionary_release_unavailable` | PASS | Fresh-PostgreSQL test verified top-level and `standardDictionary` readiness are unavailable; two sequential joins and two concurrent distinct-user joins returned the exact safe code/message with unchanged rating, ticket, match, round, participant, and audit counts. Source inspection confirmed the readiness detail is sanitized and environment-specific. |
| 2 | Bootstrap refuses wrong environment/missing confirmation and prints no credentials or answer words | PASS | Explicit CLI probes exited 1 with only `preview_dictionary_wrong_environment` and `preview_dictionary_confirmation_required`; sentinel credentials and sampled answer words were absent. Full API tests also cover missing database and spoiler-safe dry-run behavior. |
| 3 | Approved bootstrap creates exactly one deterministic release and expected aggregate counts | PASS | Fresh PostgreSQL: first apply returned `created`; release count 1; word count 63; aggregate counts `20 answer / 40 guess / 3 banned / 63 total`. |
| 4 | Bootstrap creates zero fixture users, profiles, ratings, lobbies, or matches | PASS | Before/after forbidden-table counts were identical. The only two users in the schema were deliberately created by the integration test before bootstrap as authenticated matchmaking actors; bootstrap created no users. Source review confirmed the bootstrap transaction accesses only `DictionaryRelease` and `DictionaryWord`. |
| 5 | Second application is idempotent with no duplicate release/words | PASS | Second apply returned `unchanged`; release count remained 1 and word count remained 63. |
| 6 | Two distinct authenticated users produce exactly one shared non-self Standard match | PASS | After bootstrap, two distinct user IDs produced two matched tickets, exactly one match, two distinct participants, and the exact preview dictionary release ID. |
| 7 | Preview and production selection match Ticket 134 | PASS | Tests prove preview/local/test accept only the exact fixture exception, preview prefers valid production-approved active content, production rejects the fixture even after altered flags/status, actual answer rows are required, and unknown environments fail closed. |
| 8 | Canonical gates and secret scan pass | PASS | API tests 89/89; API build, Prisma validation, workspace typecheck, secret scan, and `git diff --check` all exited 0. |

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api test:postgres:preview-dictionary
exit 0
- unique schema: ticket135_3577216_1783933670300
- 3 migrations applied
- integration tests: 3 passed, 0 failed/skipped
- disposable schema dropped

CI=true pnpm --filter @wordle-royale/api test
exit 0
- 89 passed, 0 failed, 0 skipped

Explicit guarded CLI probes
exit 0 for QA assertions
- wrong environment: command exit 1; output=preview_dictionary_wrong_environment; leak=no
- missing confirmation: command exit 1; output=preview_dictionary_confirmation_required; leak=no

CI=true pnpm --filter @wordle-royale/api build
exit 0

CI=true pnpm --filter @wordle-royale/api db:validate
exit 0

CI=true pnpm typecheck
exit 0
- workspace scaffold validation passed for 9 packages

CI=true pnpm secret-scan
exit 0
- 214 source/config files scanned

git diff --check
exit 0

Post-run PostgreSQL schema query
exit 0
- ticket135_schemas_remaining=0

pnpm deps:down
exit 0
- local PostgreSQL and Redis containers/network removed
```

## Browser/visual evidence

Not applicable. Ticket 136 is a database/bootstrap/readiness/matchmaking backend verification ticket; no UI acceptance criterion was present.

## Diff, regression, security, and scope review

- Reviewed the tracked Ticket 135 diff and all untracked implementation/test files rather than relying on Freya's report.
- Bootstrap apply guards execute before importing Prisma or opening a database connection.
- CLI failures are reduced to stable codes and do not print environment dumps, URLs, credentials, tokens, cookies, or word lists.
- Existing release identity, policy metadata, aggregate metadata, word IDs, normalized words, kinds, checksums, and exact final row set are conflict-checked instead of overwritten.
- Preview fixture eligibility is pinned to the reviewed identity/hash/metadata and actual database counts.
- Production explicitly rejects the fixture ID and version and requires active, non-fixture, production-approved, validated content with actual answer rows.
- Matchmaking checks dictionary availability before profile, expiry, ticket, audit, match, round, or participant writes and revalidates the locked release before match creation.
- The canonical secret scanner excludes `docs`, `agent-communication`, and Markdown. Reviewed Ticket 134–136 artifacts and the new README bootstrap instructions contained placeholders/aggregate data only; no live credential was observed.
- No hosted provider, hosted database, Vercel/Railway/Supabase setting, or remote environment was accessed or mutated.

## Findings

No acceptance-blocking defect found.

### Non-blocking hardening observations

1. **Conflicting CLI flags:** `--apply --dry-run` currently follows `--apply` rather than rejecting mutually exclusive flags. All apply guards still remain mandatory, and the documented command is unambiguous. Owner: Freya.
2. **Concurrent bootstrap invocations:** sequential reruns are idempotent as required, but simultaneous first applies can cause one process to receive sanitized `preview_dictionary_release_conflict` after a uniqueness race rather than `unchanged`. Avoid parallel operator runs; advisory locking/re-read could harden this later. Owner: Freya.
3. **Pair-time infrastructure errors:** an ineligibility result after the release lock correctly becomes the approved 503 and rolls back, as the real PostgreSQL test proves. An unrelated raw lock/query infrastructure exception can still surface as a generic server error; that is distinct from a missing/ineligible dictionary but could be normalized or observability-hardened later. Owner: Freya.
4. **Production release ordering:** selection orders nullable `releasedAt` descending before `createdAt`; production content policy should eventually define null timestamp ordering explicitly. Eligibility and fixture rejection are unaffected. Owner: Elisa/Freya.

## Required fixes / owner

None for Ticket 136 acceptance.

The hardening observations above are recommended follow-ups and do not block Ticket 137. They should not be folded into the hosted data operation itself.

## Residual risks

- This pass validates a local PostgreSQL 16 deployment shape, not the hosted Supabase/Railway/Vercel environment.
- Provider networking, TLS, connection-pool behavior, hosted migration state, and runtime environment variables remain for Ticket 137/resumed Ticket 128 verification.
- The exact 63-word fixture is intentionally preview-only and is not production content approval.
- Hosted bootstrap is a manual data mutation. Ashar has **not yet granted** explicit approval for that operation in this chat. Execution remains gated on Ticket 137 PR review/merge/current-main CI and a separate approval using the reviewed guarded command.

## Hosted-operation authorization

No hosted data-operation approval has been granted yet. Ticket 136 validates the command and policy only; it does not authorize Yuna to mutate Supabase or any provider environment.

After Ticket 137 is merged and current-main CI passes, Athena must request Ashar's explicit approval for exactly this reviewed operation:

```bash
APP_ENV=preview \
PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM=APPLY_EN_5_TEST_VFIXTURE_001_TO_PREVIEW \
pnpm --filter @wordle-royale/api db:bootstrap:preview-dictionary -- --apply --json
```

Any future approval authorizes only the dictionary-only preview mutation. It does not authorize `db:seed:local`, fixture identity creation, production-environment use, unrelated provider changes, or bypassing the guarded command.

The operator must supply the hosted preview `DATABASE_URL` through the provider environment without printing or copying it into logs/handoff files, then verify aggregate output and `/readyz`/two-user matchmaking behavior.

## Cleanup

- Disposable Ticket 135 schema dropped by the harness.
- Follow-up query confirmed zero `ticket135_%` schemas.
- Local `wordle-royale-postgres` and `wordle-royale-redis` containers and Compose network removed.
- No QA API/web background process remains.
- Post-QA `git status` showed only the pre-existing Ticket 134–136 implementation/handoff changes plus this response file; no generated build artifact was introduced into tracked status.
