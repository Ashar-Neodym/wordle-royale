# Ticket 143 — Focused Transaction Timeout Contract Recheck Response

Task: Ticket 143 — Focused Transaction Timeout Contract Recheck
Agent: Jasmine (QA)
Verdict: **FAIL**
Date: 2026-07-14

## Summary

Tickets 141–142 repair the two defects that originally failed Ticket 139:

- Inner dictionary-selection and rating-profile `P2028` errors now reach the transaction boundary and return the sanitized `503 matchmaking_transaction_timeout` contract.
- The declared deadline ordering is now API proxy `125,000ms` → server action `130,000ms` → browser `140,000ms`, so the browser no longer abandons before the declared server-action lifetime.

Ticket 143 still fails because the canonical real-PostgreSQL concurrent matchmaking harness is not stable. One clean run passed, but an immediate repeated run reproduced a join returning sanitized `503 matchmaking_retry_exhausted` instead of `201`. Ticket 143 explicitly requires both PostgreSQL harnesses to pass; one green run cannot override a reproduced concurrency failure.

There is also an unresolved budget-design concern: one maximum three-attempt transaction loop can consume approximately `3 × (10s maxWait + 30s timeout)` plus backoff, while a late `P2002` uniqueness-recovery path can start a second `inTransaction()` loop. The current `125s/130s/140s` chain therefore orders the layers correctly but does not demonstrably bound the complete allowed join/recovery path.

**Ticket 140 remains blocked.**

## Acceptance criteria checked

| # | Criterion | Result | Evidence |
|---|---|---:|---|
| 1 | Dictionary-selection `P2028` reaches transaction boundary and returns sanitized `503 matchmaking_transaction_timeout` | PASS | Focused API tests passed. Injected sensitive detail, ORM code, and internal error detail were absent from the public response; expiry was not retried. |
| 2 | Rating-profile lookup/create `P2028` reaches the same boundary and contract | PASS | Focused API tests passed with the same sanitized timeout response and no expiry retry. |
| 3 | `P2034`, PostgreSQL `40001`, and `40P01` retain bounded retry behavior up to three attempts | PASS WITH COVERAGE NOTE | Focused tests proved each inner error class reaches the outer retry loop and can succeed on a subsequent attempt; source retains attempts 1–3 and transaction options on retry. The focused injections clear after one failure and do not independently force every class through exact three-attempt exhaustion. |
| 4 | Genuine missing/invalid dictionary returns `dictionary_release_unavailable` with zero writes | PASS | Sequential and concurrent focused cases passed; rating, ticket, match, round, participant, and audit counts remained unchanged. |
| 5 | Real over-budget partial-write path rolls back all relevant tables | PASS | Disposable PostgreSQL harness used a 6-second transaction timeout and 7-second final revalidation delay. It returned sanitized `matchmaking_transaction_timeout`; the committed baseline remained ratings=1, tickets=1, audits=1, matches=0, rounds=0, participants=0. No expired-attempt writes survived. |
| 6 | Cross-layer deadlines are explicit, bounded, tested, and browser outlives server action | **PARTIAL / BLOCKING RISK** | Numeric policy and focused tests pass at API=125s, server=130s, browser=140s. Call sites are wired correctly by inspection. However, the complete allowed backend path can enter a second retry loop after a late uniqueness conflict, which is not covered by these limits. Current source-wiring tests are whole-file regex checks and can be satisfied by stale/dead expressions rather than behaviorally proving the actual call sites. |
| 7 | Six-second delayed concurrent PostgreSQL pairing creates exactly one shared non-self match | PASS | Independent disposable-schema probe passed in approximately 24.236s: exactly two tickets, one match, two distinct expected participants, and no self-pairing. |
| 8 | Canonical gates, both PostgreSQL harnesses, web build/tests, secret scan, and diff check pass | **FAIL** | Preview-dictionary PostgreSQL harness passed 4/4 and broad gates passed. Canonical matchmaking PostgreSQL passed once but failed on repeat with one `503 matchmaking_retry_exhausted` response where `201` was required. |

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  test/matchmaking.test.ts test/matchmaking-transaction-budget.test.ts
exit 0 — 28/28 passed

CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/lib/matchmaking-deadline-policy.test.ts \
  ../web/src/components/standard-queue-state.test.ts
exit 0 — 8/8 passed

Canonical matchmaking PostgreSQL harness, clean disposable schema
exit 0 — 1/1 passed; schema dropped

Canonical matchmaking PostgreSQL harness, repeated probe
exit 1 on repeat 1/3
- apps/api/test/matchmaking-postgres.integration.test.ts:58
- actual status: 503
- expected status: 201
- public code: matchmaking_retry_exhausted
- disposable schema dropped

CI=true pnpm --filter @wordle-royale/api test:postgres:preview-dictionary
exit 0 — 4/4 passed; disposable schema dropped
- fresh bootstrap readiness
- idempotent exact bootstrap
- release-revalidation rollback
- real over-budget partial-write rollback

Independent six-second delayed concurrent PostgreSQL probe
exit 0 — 1/1 passed in approximately 24.236s
- exactly 2 tickets, 1 match, 2 distinct expected participants
- no self-pairing
- disposable schema dropped

CI=true pnpm --filter @wordle-royale/api test
exit 0

CI=true pnpm --filter @wordle-royale/api build
exit 0

CI=true pnpm --filter @wordle-royale/web typecheck
exit 0

CI=true pnpm --filter @wordle-royale/web build
exit 0 — /play remained a dynamic route

CI=true pnpm typecheck
exit 0 — 9 workspace packages validated

CI=true pnpm --filter @wordle-royale/api db:validate
exit 0

CI=true pnpm secret-scan
exit 0 — 218 source/config files scanned after QA-artifact cleanup

git diff --check
exit 0

pnpm deps:down
exit 0 — local PostgreSQL/Redis containers and Compose network removed
```

### Harness setup note

The first direct PostgreSQL harness launch failed because a temporary runner supplied an invalid local password value. The runner was corrected without printing credentials, after which the harnesses executed. This was a QA setup failure, not product evidence. No hosted provider, hosted database, deployment, or production mutation was performed.

## Browser/visual evidence

Not applicable. This recheck concerns API transaction semantics, PostgreSQL rollback/concurrency, and source-level timeout contracts. No visual acceptance criterion was present. Deadline constants and queue call sites were inspected directly, and focused web tests passed 8/8.

## Findings

### BLOCKER 1 — Canonical PostgreSQL matchmaking harness is flaky

**Likely owner: Freya**

The canonical cold-profile concurrent matchmaking harness passed once, then failed immediately during repeated execution:

```json
{
  "code": "matchmaking_retry_exhausted",
  "message": "Matchmaking was busy resolving concurrent queue activity. Retry the request."
}
```

Reproduction:

1. Start the repository's local PostgreSQL dependency.
2. Run `CI=true pnpm --filter @wordle-royale/api test:postgres:matchmaking` repeatedly against clean disposable schemas.
3. Observe that one concurrent join can return `503` rather than the expected `201`.
4. The failing assertion is at `apps/api/test/matchmaking-postgres.integration.test.ts:58`.

Required fix: identify the remaining concurrent cold-profile conflict/retry-exhaustion path and make the canonical harness stable under repeated clean-schema execution. Preserve the sanitized public response and bounded retry design.

### BLOCKER 2 — Deadline chain does not prove coverage of the complete allowed backend path

**Likely owner: Freya/Luna/Athena**

Current declared ordering is internally correct:

```text
API proxy:     125,000ms
server action: 130,000ms
browser:       140,000ms
```

However, `joinStandardQueueWithResult()` can execute an initial `inTransaction()` loop and, after a late `P2002`, enter a separate uniqueness-recovery `inTransaction()` loop. At maximum configuration, one three-attempt loop can approach 120 seconds before overhead. The current layer deadlines do not account for two such loops.

Required fix: cap the complete join/recovery lifecycle within the API deadline, prevent uniqueness recovery from receiving a fresh full retry budget, or increase/document the cross-layer limits based on complete-path arithmetic. Strengthen anti-drift tests so actual API/client/server-action call sites—not merely source-file regex matches—are checked.

## Regression/security/scope review

- Inner timeout responses do not expose Prisma codes/messages, SQL, database URLs, credentials, dictionary answers, or injected sensitive sentinel text.
- Transaction expiry remains non-retryable; serialization/deadlock classes retain bounded retries.
- Explicit `Serializable`, `maxWait`, and `timeout` options remain on transaction retries.
- Genuine dictionary-unavailable behavior remains distinct from transaction expiry and preserves zero writes.
- Real PostgreSQL evidence confirms rollback after partial work begins.
- No SQL interpolation regression or destructive production operation was introduced by QA.
- Secret scan and `git diff --check` passed before final reporting.
- No hosted mutation, deployment, merge, or production-schema operation was performed.

## Required fixes / owner

1. **Freya:** reproduce and fix the canonical concurrent PostgreSQL `matchmaking_retry_exhausted` failure; demonstrate repeated clean-schema stability.
2. **Freya/Luna/Athena:** define and enforce one complete end-to-end join budget, including late uniqueness recovery, then strengthen behaviorally tied deadline tests.
3. **Jasmine:** rerun both canonical PostgreSQL harnesses, repeated concurrency checks, focused timeout/retry tests, and canonical gates after repairs.
4. **Yuna:** keep Ticket 140 blocked until Jasmine returns PASS.

## Residual risks

- Hosted pooler/network behavior remains unverified; this ticket intentionally performed local QA only.
- Required retry classes are proven to reach and use the retry loop, but focused tests do not individually exhaust all three attempts for every class.
- Whole-file regex deadline tests provide weaker anti-drift protection than imported-policy assertions or behaviorally instrumented call-site tests.
- The PostgreSQL container had already exited before final cleanup, so a post-cleanup live schema query could not be rerun. Every completed disposable harness reported successful schema deletion, and Compose containers/network were subsequently removed.

## Cleanup

- Removed all Ticket 143 temporary runners and probe files.
- Every completed disposable PostgreSQL harness reported successful schema deletion; the attempted final schema query was unavailable because PostgreSQL had already exited.
- Removed local PostgreSQL/Redis containers and Compose network with `pnpm deps:down`.
- Confirmed no Ticket 143 runner, probe, or API QA background process remained.
- Final worktree status contains only the shared Ticket 138–143/product documentation and implementation changes; no QA temporary file remains.
