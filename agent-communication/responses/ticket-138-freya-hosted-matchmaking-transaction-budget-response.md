# Ticket 138 — Hosted Matchmaking Transaction Budget Response

Agent: Freya (backend implementation)
Status: Complete; ready for Ticket 139 independent QA
Date: 2026-07-13

## Summary

Replaced Prisma's implicit 5-second interactive-transaction timeout with one explicit, validated, bounded policy used by every Standard matchmaking transaction path.

The implementation preserves serializable isolation, bounded serialization/deadlock retries, idempotent uniqueness recovery, dictionary precondition/revalidation, row locks, and rollback semantics. It also aligns API-proxy, browser-action, and Vercel server-action budgets so the web tier cannot abandon a valid configured matchmaking attempt first.

No hosted provider, database, schema, environment variable, or deployment was modified.

## Transaction policy

Added `apps/api/src/matchmaking/matchmaking-transaction-budget.ts`.

Defaults:

```text
MATCHMAKING_TRANSACTION_MAX_WAIT_MS=5000
MATCHMAKING_TRANSACTION_TIMEOUT_MS=20000
```

Validated bounds:

```text
maxWait: 1000–10000 ms
timeout: 6000–30000 ms
```

Invalid, fractional, negative, malformed, too-small, or over-cap values fail service construction with a sanitized configuration error that names the variable and permitted range without echoing the supplied value.

Every call through `MatchmakingService.inTransaction()` now passes:

```ts
{
  isolationLevel: 'Serializable',
  maxWait: 5000,
  timeout: 20000,
}
```

The same resolved options apply to:

- first join;
- idempotent/active-ticket recovery;
- `P2034`/serialization retries;
- current-ticket reads;
- by-ID reads;
- cancellation;
- reconnect/pairing attempts.

## Retry and timeout behavior

Preserved:

- serializable transactions;
- three bounded attempts;
- `P2034` handling;
- Prisma raw-query `P2010` handling for PostgreSQL `40001` and `40P01`;
- short bounded retry backoff;
- `P2002` active-ticket recovery;
- ticket/dictionary row locks;
- dictionary selection and final revalidation;
- rollback/no-partial-write behavior.

Prisma interactive-transaction expiry (`P2028`) is not retried. It is converted to the sanitized response:

```json
{
  "code": "matchmaking_transaction_timeout",
  "message": "Matchmaking took too long to complete. Retry the request."
}
```

The public response does not expose Prisma codes/messages, SQL, database URLs, or credentials.

## End-to-end request budgets

Aligned hosted budgets:

```text
Prisma default attempt: maxWait 5s + transaction 20s
Prisma permitted maximum attempt: maxWait 10s + transaction 30s
Bounded attempts: 3
Web API proxy timeout: 125s
Browser action deadline: 127s
/play server-action maxDuration: 130s
```

The web tiers therefore exceed the worst configured retry bound of `3 × 40s` plus backoff. Normal hosted requests still fail server-side at the 20-second transaction timeout rather than waiting for the outer web limits.

Updated:

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/components/standard-queue-state.ts`
- `apps/web/src/app/play/page.tsx`
- `.env.example`
- `README.md`

## Regression coverage

Added or extended tests proving:

- explicit default options;
- accepted upper bounds;
- malformed/out-of-range values fail closed without value leakage;
- first join receives explicit options;
- read/current/by-ID/cancel paths receive identical options;
- active-ticket uniqueness recovery receives identical options;
- `P2034` initial and retry attempts receive identical options;
- an actual six-second latency-shaped request succeeds under the 20-second budget;
- over-budget expiry returns sanitized `503 matchmaking_transaction_timeout`;
- a timeout after simulated profile/ticket/audit writes rolls back ratings, tickets, matches, participants, rounds, and audits;
- browser action deadline exceeds the complete server-action request budget.

## Verification

Passed:

- Focused API transaction-budget/matchmaking tests: **20/20**.
  - Six-second latency test completed successfully in approximately 6.0 seconds.
- Standard queue client-state tests: **5/5**.
- Full API suite: **95/95**, zero failures.
- API build/typecheck: exit 0.
- Web typecheck: exit 0.
- Web production build: exit 0.
- Workspace validation/typecheck: exit 0.
- Prisma schema validation: exit 0.
- Secret scan: exit 0; 216 source/config files scanned.
- `git diff --check`: exit 0.
- Production-start API smoke: exit 0; `/readyz` returned `status=ok`.
- Real PostgreSQL concurrent matchmaking harness: **1/1**, temporary schema migrated, seeded, tested, and dropped.
- Real PostgreSQL preview dictionary/readiness harness: **3/3**, temporary schema migrated, tested, and dropped.

A first independent review found the existing seven-second browser deadline and incomplete post-write timeout rollback coverage. Both were corrected. The second review found no remaining Ticket 138 implementation blocker.

## Files changed

- `.env.example`
- `README.md`
- `apps/api/src/matchmaking/matchmaking-transaction-budget.ts`
- `apps/api/src/matchmaking/matchmaking.service.ts`
- `apps/api/test/matchmaking-transaction-budget.test.ts`
- `apps/api/test/matchmaking.test.ts`
- `apps/web/src/app/play/page.tsx`
- `apps/web/src/components/standard-queue-state.ts`
- `apps/web/src/components/standard-queue-state.test.ts`
- `apps/web/src/lib/api-client.ts`
- `agent-communication/index.md`
- `agent-communication/responses/ticket-138-freya-hosted-matchmaking-transaction-budget-response.md`

## Risks and follow-ups

- Ticket 139 must independently verify the option propagation, six-second latency path, timeout sanitization, rollback, and real PostgreSQL behavior.
- Ticket 140 remains blocked on Ticket 139 PASS.
- Hosted Ticket 128 must be rerun only after the reviewed checkpoint is merged and deployed.
- The preview dictionary is already bootstrapped; this repair does not require or authorize another hosted data mutation.
- Local PostgreSQL and Redis were left running for QA reuse; `pnpm deps:down` stops them.
