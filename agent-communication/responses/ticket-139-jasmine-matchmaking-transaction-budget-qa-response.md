# Ticket 139 — Matchmaking Transaction Budget Independent QA Response

Task: Ticket 139 — Matchmaking Transaction Budget Independent QA
Agent: Jasmine (QA)
Verdict: **FAIL**
Date: 2026-07-13

## Summary

The explicit Prisma transaction budget fixes the original five-second hosted-latency ceiling, and independent real-PostgreSQL testing proved that two concurrent joins with an injected six-second database delay can still create exactly one shared non-self match without duplicates.

Ticket 139 nevertheless fails because two acceptance-critical contract defects remain:

1. A Prisma `P2028` transaction expiry raised inside dictionary selection or rating-profile creation is intercepted before `inTransaction()` can normalize it. The public response becomes the wrong error (`dictionary_release_unavailable` or `rating_profile_unavailable`) instead of the promised recoverable `matchmaking_transaction_timeout`.
2. The browser action deadline is 127 seconds while the `/play` server-action lifetime is 130 seconds. The browser can abandon a legitimate server action first, contrary to criterion 7.

Ticket 140 remains blocked pending fixes and a focused Jasmine recheck.

## Acceptance criteria checked

| # | Criterion | Result | Evidence |
|---|---|---:|---|
| 1 | Explicit bounded `timeout` and `maxWait` on every matchmaking interactive transaction and retry | PASS | All Standard queue paths converge on `inTransaction()`, which passes `Serializable`, `maxWait`, and `timeout`; focused tests verified join, current, by-ID, cancel, uniqueness recovery, and retry option propagation. Bounds are `maxWait=1000–10000ms`, `timeout=6000–30000ms`. |
| 2 | Serializable isolation and three-attempt retry remain intact | PASS | Source inspection confirms attempts 1–3, `Serializable`, `P2034` plus PostgreSQL `40001`/`40P01` retry classification, bounded 10/20ms backoff, and sanitized exhaustion. Existing retry test passed with identical options on initial and retry attempts. |
| 3 | A first join taking more than five seconds but less than budget succeeds with one ticket | PASS | Focused six-second regression passed. A separate real-PostgreSQL QA probe injected `pg_sleep(6)` inside dictionary selection; delayed joins completed within the 20-second per-attempt budget and persisted exactly two distinct tickets for two users. |
| 4 | Two delayed concurrent joins create one shared non-self match with no duplicates | PASS | Independent disposable-schema probe passed in 18,165ms overall: exactly two distinct tickets, one Standard match, two distinct participants matching the two users, and no duplicate match/participant rows. |
| 5 | Exceeding budget rolls back safely and returns sanitized failure behavior | **FAIL** | Outer-boundary and post-write mock expiry tests are sanitized and rollback their mock state, but targeted QA reproduced two inner-path `P2028` misclassifications. Dictionary expiry returned `dictionary_release_unavailable`; rating-profile expiry returned `rating_profile_unavailable`. Neither leaked the injected Prisma detail, but neither returned the promised `matchmaking_transaction_timeout`. Real PostgreSQL expiry/rollback coverage is also absent. |
| 6 | Dictionary eligibility/revalidation and zero-write missing-dictionary behavior remain intact | PASS | Fresh PostgreSQL dictionary harness passed 3/3, including missing-dictionary zero-write joins, bootstrap/readiness, lock/revalidation rollback, and exact-release matching. |
| 7 | Client deadline is not shorter than legitimate server path, or explicit recoverable contract exists | **FAIL** | API proxy timeout is 125s, browser action deadline is 127s, and `/play` `maxDuration` is 130s. Browser cancellation can precede the declared server-action lifetime by 3s, and the current test only checks `CLIENT_ACTION_DEADLINE_MS > 120000` rather than ordering all three budgets. |
| 8 | Canonical gates, real-PostgreSQL harnesses, secret scan, and diff checks pass | PASS | API 95/95, API build, web typecheck/build, workspace validation, Prisma validation, secret scan, diff check, real matchmaking 1/1, fresh dictionary 3/3, and delayed concurrent PostgreSQL 1/1 all passed. |

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  test/matchmaking-transaction-budget.test.ts test/matchmaking.test.ts
exit 0 — 20 passed
- six-second focused latency test passed

CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/components/standard-queue-state.test.ts
exit 0 — 5 passed

Targeted inner-path P2028 QA probe
exit 0 — defect reproduced
- dictionaryResponse.code=dictionary_release_unavailable
- ratingResponse.code=rating_profile_unavailable
- injected Prisma detail absent from both public responses

CI=true pnpm --filter @wordle-royale/api test:postgres:matchmaking
exit 0 — 1 passed; disposable schema migrated/seeded/dropped

CI=true pnpm --filter @wordle-royale/api test:postgres:preview-dictionary
exit 0 — 3 passed; disposable schema migrated/dropped

Independent real-PostgreSQL delayed-concurrency probe
exit 0 — 1 passed
- database delay: pg_sleep(6) inside dictionary selection
- elapsed: 18,165ms
- exactly 2 tickets, 1 match, 2 distinct participants
- disposable schema dropped

CI=true pnpm --filter @wordle-royale/api test
exit 0 — 95 passed, 0 failed/skipped

CI=true pnpm --filter @wordle-royale/api build
exit 0

CI=true pnpm --filter @wordle-royale/web typecheck
exit 0

CI=true pnpm --filter @wordle-royale/web build
exit 0

CI=true pnpm typecheck
exit 0 — workspace scaffold validation passed for 9 packages

CI=true pnpm --filter @wordle-royale/api db:validate
exit 0

CI=true pnpm secret-scan
exit 0 — 216 source/config files scanned after QA-artifact cleanup

git diff --check
exit 0

Post-run schema query
exit 0 — temporary_qa_schemas_remaining=0

pnpm deps:down
exit 0 — local PostgreSQL/Redis containers and Compose network removed
```

### Command troubleshooting note

The first direct web focused-test invocation failed because `tsx` is not a dependency of the web package. The same test was rerun through the API workspace's installed `tsx` runtime and passed 5/5. Initial PostgreSQL harness attempts also failed because command redaction converted an inline URL password to a three-character mask; a temporary non-printing launcher assembled the local-only URL in process memory. Both harnesses then passed. These were QA tooling/setup failures, not product failures. All temporary launchers and probes were removed.

## Browser/visual evidence

Not applicable. This ticket concerns transaction behavior and timeout contracts. The browser/server deadline constants and all queue action call sites were inspected directly; no visual acceptance criterion was present.

## Findings

### BLOCKER 1 — Inner transaction expiry bypasses timeout normalization

**Owner: Freya**

`MatchmakingService.inTransaction()` maps `P2028` to:

```json
{
  "code": "matchmaking_transaction_timeout",
  "message": "Matchmaking took too long to complete. Retry the request."
}
```

But two inner catches prevent some `P2028` errors from reaching that boundary:

- `apps/api/src/matchmaking/matchmaking.service.ts:384-392` — `requireDictionary()` catches every selector exception and converts it to `dictionary_release_unavailable`.
- `apps/api/src/matchmaking/matchmaking.service.ts:424-431` — `findOrCreateRatingProfile()` rethrows retryable errors only; `P2028` becomes `409 rating_profile_unavailable`.
- Correct outer normalization is at `apps/api/src/matchmaking/matchmaking.service.ts:533-545`.

**Reproduction:** inject `{ code: 'P2028' }` from dictionary selection or `ratingProfile.create()` during `joinStandardQueue()`. Actual public codes are respectively `dictionary_release_unavailable` and `rating_profile_unavailable`; expected is `matchmaking_transaction_timeout` for both.

**Required fix:** inner catches must rethrow transaction expiry and retryable transaction errors to `inTransaction()`. Add regression tests for `P2028` and retryable errors originating inside dictionary selection and rating-profile operations, not only from the `$transaction` wrapper.

### BLOCKER 2 — Browser can time out before declared server-action maximum

**Owner: Luna/Freya**

Current ordering:

```text
API fetch timeout:       125,000ms
Browser action deadline: 127,000ms
/play maxDuration:       130,000ms
```

Relevant locations:

- `apps/web/src/lib/api-client.ts:133-135`
- `apps/web/src/components/standard-queue-state.ts:22-23`
- `apps/web/src/app/play/page.tsx:14-16`

All join/reconnect/read/cancel operations use the browser deadline. Network, server-action dispatch, cookie forwarding, parsing, and scheduling overhead can consume the two-second proxy margin, while the browser is explicitly permitted to abandon the action three seconds before the server route's declared lifetime.

**Required fix:** make browser deadline greater than the complete server-action maximum with a meaningful overhead margin, or shorten the server path and return an explicit recoverable state before the browser deadline. Add one test comparing all three exported/configured budgets rather than checking only `CLIENT_ACTION_DEADLINE_MS > 120000`.

## Regression/security/scope review

- Explicit budget parser rejects malformed, fractional, negative, below-minimum, and above-cap input without echoing the supplied value.
- No unbudgeted Standard matchmaking interactive transaction path was found; join, read, by-ID, cancel, uniqueness recovery, and retries converge on the shared wrapper.
- Serializable isolation, row locks, candidate `SKIP LOCKED`, exact dictionary release revalidation, and bounded retry logic remain present.
- Parameter values continue to be passed separately to raw SQL; no new SQL interpolation was introduced.
- Timeout error responses tested by QA did not expose Prisma messages, SQL, database URLs, credentials, or the injected sensitive detail.
- `.env.example` contains numeric non-secret defaults only.
- Canonical secret scan passed after removing QA-only temporary files.
- No hosted provider/database/schema/configuration/deployment operation was performed.

## Required fixes / owner

1. **Freya:** preserve `P2028`, `P2034`, and raw PostgreSQL retry errors through inner dictionary/profile catches so `inTransaction()` owns timeout normalization and retry policy.
2. **Freya:** add focused inner-operation timeout tests and preferably a real-PostgreSQL over-budget rollback probe.
3. **Luna/Freya:** correct browser/proxy/server-action deadline ordering and add a direct cross-layer budget assertion.
4. **Jasmine:** rerun focused defect probes, full tests/builds, and both real-PostgreSQL harnesses after fixes.
5. **Yuna:** keep Ticket 140 blocked until Jasmine returns PASS.

## Residual risks

- Current six-second unit latency is synthetic; independent PostgreSQL delayed concurrency passed, but a real over-budget Prisma expiry after partial writes is still not in the committed suite.
- Maximum retry arithmetic (`3 × (10s maxWait + 30s timeout)` plus backoff) does not explicitly budget a pathological long initial `P2002` attempt followed by a separate full uniqueness-recovery transaction. Typical uniqueness failures should be fast, but the outer contract should document or cap this edge case.
- Hosted Supabase pooler/network behavior remains unverified until the fixes pass QA, Ticket 140 merges current-head CI, and Ticket 128 is redeployed/rechecked.

## Cleanup

- Removed all QA-only probe/test/launcher files.
- Confirmed zero `ticket130_%`, `ticket135_%`, or `ticket139_%` schemas remained.
- Removed local PostgreSQL/Redis containers and Compose network.
- No QA background process remains.
- Final secret scan and `git diff --check` passed after cleanup.
