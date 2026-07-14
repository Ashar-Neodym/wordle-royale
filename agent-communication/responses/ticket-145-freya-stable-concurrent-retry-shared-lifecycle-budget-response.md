# Ticket 145 — Stable Concurrent Retry and Shared Lifecycle Budget Response

Task: Ticket 145 — Stable Concurrent Retry and Shared Lifecycle Budget
Agent: Freya (backend implementation)
Status: **Complete; ready for Ticket 146 web deadline binding and Ticket 147 independent recheck**
Date: 2026-07-14

## Summary

Implemented Elisa's locked complete-lifecycle contract as one shared backend coordinator for every Standard matchmaking transaction path. Initial work, serialization/deadlock retries, bounded jitter sleeps, and recognized active-ticket/idempotency uniqueness recovery now share one monotonic 90-second deadline and one four-attempt ledger.

The coordinator clamps every Prisma interactive-transaction `maxWait`/`timeout` to the remaining lifecycle envelope, reserves completion time, refreshes the wall clock for each attempt, and preserves exact sanitized public failures. A delayed real-PostgreSQL cold-pairing regression now runs in the canonical disposable-schema harness, and the final harness passed ten consecutive times.

No hosted database, provider configuration, environment, deployment, or dictionary content was modified.

## Implemented behavior

### One lifecycle and attempt ledger

- Added `apps/api/src/matchmaking/matchmaking-lifecycle.ts` as the single coordinator.
- Each request receives:
  - one monotonic 90-second lifecycle deadline;
  - one maximum of four Prisma transaction attempts total;
  - one 1-second completion/error-normalization reserve;
  - a minimum clamped `maxWait` of 250 ms;
  - a minimum clamped transaction `timeout` of 1 second.
- Initial work and uniqueness recovery consume the same attempt count and original deadline.
- Recovery cannot start after attempt four and cannot create a second retry loop.
- Join, current-ticket read, by-ID read, and cancel all use the coordinator.

### Retry stability

- Retryable failures remain:
  - Prisma `P2034`;
  - Prisma `P2010` carrying PostgreSQL `40001`;
  - Prisma `P2010` carrying PostgreSQL `40P01`.
- Retry sleeps use bounded decorrelated jitter:
  - base: 50 ms;
  - cap: 1000 ms;
  - next upper bound: `min(1000, previous × 3)`.
- The coordinator refuses a sleep if it would consume the minimum envelope required for another transaction attempt.
- Prisma `P2028` keeps precedence, is never retried, and remains the exact sanitized transaction-timeout response.

### Transaction budget clamping

- Preferred per-attempt settings remain the Ticket 138 values:
  - `maxWait=5000ms` by default;
  - `timeout=20000ms` by default;
  - Serializable isolation.
- Each attempt recalculates its Prisma options from the original monotonic lifecycle deadline.
- A late attempt receives reduced `maxWait` and `timeout` instead of opening another full configured budget.
- Fresh wall time is sampled for every attempt. Even direct service calls that supply a deterministic first-attempt timestamp switch to the injected wall clock on retries.
- Ticket expiration is computed from the successful attempt's wall time, preserving the full 60-second queue TTL after a retry.

### Scoped uniqueness recovery

- Only the two locked matchmaking-ticket uniqueness identities enter recovery:
  - `MatchmakingTicket_userId_mode_idempotencyKey_key`;
  - `matchmaking_ticket_one_active_per_user_mode`.
- The classifier recognizes both Prisma constraint-name strings and PostgreSQL field-target metadata:
  - `['userId', 'mode', 'idempotencyKey']`;
  - `['userId', 'mode']`.
- Real PostgreSQL coverage proves the active-ticket partial unique index is recognized from Prisma's actual `P2002` metadata.
- Unrelated ticket-create `P2002` errors do not enter recovery; they map to sanitized `409 matchmaking_ticket_conflict`.
- Recovery checks exact idempotency replay first, then the active ticket. If the winning row is not yet visible, the same coordinator may retry within the remaining shared ledger.

## Public error contract

Exact sanitized responses remain:

```json
{
  "code": "matchmaking_transaction_timeout",
  "message": "Matchmaking took too long to complete. Retry the request."
}
```

```json
{
  "code": "matchmaking_lifecycle_timeout",
  "message": "Matchmaking could not complete within its request deadline. Retry the request."
}
```

```json
{
  "code": "matchmaking_retry_exhausted",
  "message": "Matchmaking was busy resolving concurrent queue activity. Retry the request."
}
```

No Prisma codes, SQLSTATEs, SQL text, constraint details, credentials, or dictionary content are exposed.

## Regression and PostgreSQL coverage

Deterministic unit/API coverage verifies:

- successful first-attempt behavior;
- exactly four shared attempts for `P2034`, `40001`, and `40P01`;
- three bounded deterministic jitter sleeps;
- different random sequences breaking retry lockstep;
- no retry for `P2028`;
- shared attempts across initial work, recognized `P2002` recovery, and recovery visibility retry;
- no fifth/recovery transaction when attempt four consumes the ledger;
- the original deadline preventing late recovery;
- late-attempt Prisma option clamping;
- backoff refusal when the next minimum transaction envelope would not fit;
- fresh wall time and a full queue TTL after retry;
- exact sanitized lifecycle, transaction-timeout, retry-exhausted, and unrelated-conflict responses;
- unrelated `P2002` never entering active-ticket recovery.

The disposable PostgreSQL harness now verifies three cases per run:

1. Prisma's real metadata for the active-ticket partial unique index is classified correctly.
2. Concurrent cold-profile joins recover and create exactly one shared non-self match.
3. Two cold joins with six-second dictionary latency still create exactly two matched tickets, one Standard match, and two distinct participants—with no self-match, duplicate match, or orphan match.

The final metadata-aware delayed harness passed **10/10 consecutive fresh-schema runs**. Every run migrated, seeded, tested, and dropped its temporary schema.

The retained preview-dictionary PostgreSQL harness also passed 4/4, including exact-release revalidation and real over-budget rollback.

## Files changed

Ticket 145 scope:

- `apps/api/src/matchmaking/matchmaking-lifecycle.ts`
- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/test/matchmaking-lifecycle.test.ts`
- `apps/api/test/matchmaking.test.ts`
- `apps/api/test/matchmaking-postgres.integration.test.ts`
- `README.md`
- `agent-communication/responses/ticket-145-freya-stable-concurrent-retry-shared-lifecycle-budget-response.md`
- `agent-communication/index.md`

Concurrent Ticket 138/141/142/146 and other shared-worktree changes were preserved and not treated as Ticket 145 scope.

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  test/matchmaking-lifecycle.test.ts \
  test/matchmaking-transaction-budget.test.ts \
  test/matchmaking.test.ts
exit 0 — 44 passed, 0 failed

CI=true pnpm --filter @wordle-royale/api test:postgres:matchmaking
exit 0 — 3 passed; real P2002 metadata + cold concurrency + six-second delayed pairing

final metadata-aware delayed PostgreSQL loop: 10 consecutive harness invocations
exit 0 — runs 01/10 through 10/10 passed

CI=true pnpm --filter @wordle-royale/api test:postgres:preview-dictionary
exit 0 — 4 passed; disposable schema migrated, tested, and dropped

CI=true pnpm --filter @wordle-royale/api test
exit 0 — 119 passed, 0 failed

CI=true pnpm --filter @wordle-royale/api build
exit 0

CI=true pnpm validate:workspace
exit 0 — workspace scaffold validation passed for 9 packages

pnpm --filter @wordle-royale/api exec prisma validate --schema prisma/schema.prisma
exit 0

CI=true pnpm --filter @wordle-royale/api smoke:prod-start
exit 0 — /readyz returned status=ok

CI=true pnpm secret-scan
exit 0 — 220 source/config files scanned

git diff --check
exit 0
```

The normal API suite reports environment-gated PostgreSQL suites as skipped internally; both dedicated disposable-schema commands were run separately and passed as recorded above.

A few local harness invocations initially failed before test startup because a redacted placeholder connection URL was supplied instead of the local disposable-test URL. No database mutation occurred on those authentication failures. The corrected credential-safe local invocation produced the successful results above; no credential value is recorded here.

## Review

Three independent focused review passes were requested during implementation.

- The first identified overly broad ticket-create `P2002` handling and missing deadline/TTL assertions. Those were fixed with exact metadata classification, sanitized unrelated-conflict behavior, original-deadline recovery coverage, and a real-service retry TTL test.
- The second identified Prisma's two-field active-ticket target shape and a duplicate-match query weakness. Those were fixed and verified against real PostgreSQL.
- The final review found no blockers. Its remaining timestamp nit was also resolved: an explicitly supplied first-attempt test timestamp is no longer reused after a retry.

## Browser/visual checks

Not applicable. Ticket 145 changes backend transaction/retry semantics, documentation, and database integration coverage only. It does not change UI behavior or layout.

## Accessibility notes

No UI changes.

## Risks and follow-ups

- Ticket 146 owns binding the actual web/API/browser deadline chain to the enforced 90-second backend lifecycle cap.
- Ticket 147 should independently rerun the complete local contract, including ten consecutive fresh-schema PostgreSQL passes.
- The delayed PostgreSQL regression intentionally adds roughly 18 seconds per harness invocation because dictionary selection/revalidation are both latency-shaped.
- The integration harness performs broad cleanup only inside the disposable schema created by its runner; it must not be pointed at a shared or hosted schema.
- Hosted provider/database/deployment behavior remains untouched and must proceed only through the approved checkpoint sequence after Ticket 147 passes.
