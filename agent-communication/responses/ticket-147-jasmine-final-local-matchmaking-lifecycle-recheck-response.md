# Ticket 147 — Final Local Matchmaking Lifecycle Recheck Response

Task: Ticket 147 — Final Local Matchmaking Lifecycle Recheck
Agent: Jasmine (QA)
Verdict: **PASS**
Date: 2026-07-14

## Summary

The complete local matchmaking lifecycle/retry repair satisfies Ticket 147.

Independent QA passed the canonical real-PostgreSQL matchmaking harness **10 consecutive times**, with a fresh migrated/seeded/disposed schema on every run. Each invocation exercised real active-ticket `P2002` metadata, concurrent cold-profile pairing, and six-second delayed pairing. The preview-dictionary PostgreSQL harness also passed 4/4, including real over-budget partial-write rollback.

The backend now enforces one monotonic 90-second lifecycle and one four-attempt ledger shared by initial work and recognized uniqueness recovery. Exact exhaustion coverage passes for `P2034`, PostgreSQL `40001`, and `40P01`; `P2028` is not retried. Per-attempt Prisma options are clamped to the remaining lifecycle envelope, jitter is bounded and deterministically testable, and retry attempts use fresh wall time.

The web chain is bounded and ordered as:

```text
backend lifecycle 90s < API proxy 95s < server action 100s < browser 110s
```

Behavioral instrumentation exercised the real four API client operations and the browser deadline runner for join, reconnect, current-ticket polling, and cancel. Source inspection confirmed all four `StandardQueuePanel` paths use their correct operation keys. An independent QA probe also proved that a sanitized API lifecycle `503` resolves before the browser deadline, remains a recoverable queue error, and causes exactly one join request rather than an automatic duplicate submission.

**Ticket 140 may proceed to its authorized checkpoint/CI stage.** This PASS is local-only and does not authorize hosted mutation by itself.

## Acceptance criteria checked

| # | Criterion | Result | Evidence |
|---|---|---:|---|
| 1 | Canonical real-PostgreSQL concurrent cold-profile harness passes at least 10 consecutive fresh-schema runs | PASS | Independent loop passed runs 01/10 through 10/10. Each invocation used the canonical runner, migrated and seeded a fresh `ticket130_*` schema, ran three PostgreSQL tests, and dropped the schema. Final residue query returned zero matching schemas. |
| 2 | Six-second delayed concurrent pairing creates exactly one shared non-self match | PASS | Included in all ten canonical harness runs. The test asserts exactly two matched tickets, one Standard match, two distinct expected participants, no self-pairing, no duplicate match, and no orphan match. |
| 3 | Jitter/backoff is bounded, breaks lockstep, and is deterministic under tests | PASS | Focused lifecycle tests passed exact deterministic sequences `[50,100,300]` and `[150,450,1000]`, repeated one sequence identically, and proved different random sequences diverge. Backoff is refused if the minimum next-attempt envelope cannot fit. |
| 4 | Initial and late-`P2002` recovery phases share one lifecycle deadline and attempt ledger | PASS | Coordinator tests passed shared initial/recovery attempts, no recovery transaction after attempt four, and lifecycle timeout before late recovery. Service inspection confirms all queue transaction paths use the shared coordinator. |
| 5 | Exact exhaustion coverage exists for `P2034`, `40001`, and `40P01` | PASS | Each class was forced through exactly four failures, three bounded sleeps, and exact sanitized `matchmaking_retry_exhausted`. |
| 6 | Per-attempt Prisma budgets never exceed remaining lifecycle time | PASS | Late-attempt test records reduced options and asserts `maxWait + timeout <= remaining - 1000ms reserve`. Coordinator rejects values below minimum clamped envelopes and retains `Serializable` isolation. |
| 7 | Timeout/retry errors remain sanitized and all partial writes roll back in real PostgreSQL | PASS | Focused tests passed exact public lifecycle, transaction-timeout, and retry-exhausted bodies without ORM/SQL detail. Preview PostgreSQL test exceeded the six-second budget after representative work and proved the expired attempt left no rating/ticket/audit/match/round/participant writes. |
| 8 | Web behavior proves backend lifecycle < proxy < server action < browser for join/reconnect/current/cancel | PASS | Policy imports the backend lifecycle and asserts exact 90/95/100/110-second values and margins. Real exported API functions schedule 95 seconds; browser operation runner schedules 110 seconds for all four keys; `/play` exports literal `maxDuration=100` and the production build passes. Actual panel call sites use the corresponding four keys. Independent API-503 probe passed. |
| 9 | PostgreSQL harnesses, API/web tests/builds, workspace gates, secret scan, and diff check pass | PASS | Matchmaking PostgreSQL 10/10; preview PostgreSQL 4/4; focused API 44/44; focused web 10/10; broad API 119/119; API build, web typecheck/build, workspace validation, Prisma validation, secret scan, and diff check all exited 0. |

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  test/matchmaking-lifecycle.test.ts \
  test/matchmaking-transaction-budget.test.ts \
  test/matchmaking.test.ts
exit 0 — 44 passed, 0 failed

CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/lib/matchmaking-deadline-policy.test.ts \
  ../web/src/components/standard-queue-state.test.ts
exit 0 — 10 passed, 0 failed

Canonical disposable-schema PostgreSQL loop:
CI=true pnpm --filter @wordle-royale/api test:postgres:matchmaking
runs 01/10 through 10/10 — all exit 0
elapsed by run: 29s, 30s, 30s, 37s, 29s, 29s, 35s, 34s, 30s, 29s
result: MATCHMAKING_POSTGRES_CONSECUTIVE_RESULT=10/10_PASS

CI=true pnpm --filter @wordle-royale/api test:postgres:preview-dictionary
exit 0 — 4 passed, 0 failed
- fresh bootstrap/readiness
- exact idempotent bootstrap
- release-revalidation rollback
- real over-budget partial-write rollback

Independent temporary web lifecycle-503 recovery probe
exit 0 — 1 passed
- one join request only
- preserved sanitized lifecycle code/message
- recoverable queue error with no inferred ticket
- observed 95,000ms API and 110,000ms browser timers

CI=true pnpm --filter @wordle-royale/api test
exit 0 — 119 passed, 0 failed, PostgreSQL-only suites skipped by the broad runner and run separately above

CI=true pnpm --filter @wordle-royale/api build
exit 0

CI=true pnpm --filter @wordle-royale/web typecheck
exit 0

CI=true pnpm --filter @wordle-royale/web build
exit 0 — optimized production build; /play remained dynamic

CI=true pnpm typecheck
exit 0 — workspace scaffold validation passed for 9 packages

CI=true pnpm --filter @wordle-royale/api db:validate
exit 0 — Prisma schema valid

CI=true pnpm secret-scan
exit 0 — 220 source/config files scanned

git diff --check
exit 0

PostgreSQL residue query
exit 0 — temporary_qa_schemas_remaining=0

pnpm deps:down
exit 0 — PostgreSQL/Redis containers and Compose network removed
```

### QA probe troubleshooting note

The first independent web recovery probe assertion expected the API timer to be registered before the browser timer. Runtime correctly registered the outer browser timer first and the inner API timer second. The assertion was corrected to compare the two observed deadline values independent of registration order; the probe then passed. This was a QA assertion-order issue, not a product defect. The temporary probe was removed.

The first direct PostgreSQL command was intentionally attempted without a database URL and failed closed before schema creation, as required by the runner. The canonical loop was then executed with the credential-safe disposable local URL assembled in process memory. No credential or connection string is recorded in this response.

## Browser/visual evidence

No visual-layout criterion was present. This ticket validates transaction, concurrency, rollback, and deadline behavior.

Web evidence was behavioral rather than screenshot-based:

- real API client functions were invoked under timer/fetch instrumentation;
- browser deadline wrappers were invoked for all four operation keys;
- the production Next build succeeded and retained `/play` as a dynamic route;
- actual `StandardQueuePanel` join/reconnect/current/cancel call sites were inspected;
- an independent lifecycle-503 probe verified recoverable state and no duplicate join request.

## Findings

No acceptance-blocking defect was reproduced.

### Warning — UI-handler anti-drift coverage remains one layer less direct than API coverage

**Suggested owner: Luna**

The committed policy test behaviorally invokes all real exported API client functions and the real browser deadline helper for each operation key. It does not mount `StandardQueuePanel` and click each UI handler under timer instrumentation. Static inspection currently confirms correct wiring:

- reconnect uses `reconnect`;
- join uses `join`;
- polling uses `current_ticket`;
- cancel uses `cancel`.

This is not a Ticket 147 blocker because behavioral timer evidence, exact call-site inspection, the independent recovery probe, and the production build agree. A future component-level test would provide stronger protection if operation budgets ever diverge.

### Warning — Server-action maximum necessarily retains a static literal boundary

Next requires `maxDuration` to be statically analyzable, so `/play` exports literal `100`. The test parses that exact export and compares it to the shared policy, while the production build validates the route configuration. This is materially stronger than the old whole-file loose regex checks, but it is not a runtime provider-limit test.

## Regression/security/scope review

- Exactly four transaction attempts are available across the complete request; recognized uniqueness recovery cannot create a second ledger.
- Only locked matchmaking-ticket uniqueness identities enter recovery. Unrelated `P2002` remains sanitized `matchmaking_ticket_conflict` and is not replayed.
- `P2028` has precedence and is never retried.
- `P2034`, `40001`, `40P01`, and recovery visibility conflicts are bounded by the shared ledger and lifecycle.
- Every transaction invocation retains `Serializable` isolation and remaining-time-clamped options.
- Fresh wall time is sampled for retry attempts, preserving the full 60-second ticket TTL after a late success.
- Dictionary availability/revalidation, row-locking, `SKIP LOCKED`, deterministic match idempotency, and self-match protections remain in place.
- Public responses contain no Prisma/PostgreSQL codes, SQL, constraints, credentials, URLs, dictionary answers, or injected sensitive detail.
- Real PostgreSQL rollback and authoritative pairing invariants passed.
- Secret scan and `git diff --check` passed after QA.
- No hosted provider, hosted database, deployment, merge, production schema, or dictionary content was mutated.

## Required fixes / owner

None for Ticket 147 acceptance.

Optional follow-up:

1. **Luna:** add a component-mounted operation-wiring test if future operation-specific budgets make wrong UI keys behaviorally significant.
2. **Yuna:** proceed with Ticket 140 only within its separately authorized checkpoint/PR/CI scope.

## Residual risks

- Hosted pooler latency, provider request limits, TLS/domain behavior, and deployment configuration remain unverified by this local ticket.
- The hosting path must support the configured 100-second server-action maximum; if it cannot, all four layers must be lowered together.
- Decorrelated jitter reduces lockstep but does not eliminate all contention; serializable correctness, idempotency, and bounded recovery remain the primary safeguards.
- Local 10/10 stability is strong evidence, not proof that every hosted scheduling/network pattern is impossible.

## Cleanup

- Removed the temporary Ticket 147 web probe and PostgreSQL-loop logs.
- Confirmed zero `ticket130_%`, `ticket135_%`, or `ticket147_%` schemas remained before teardown.
- Removed local PostgreSQL/Redis containers and Compose network.
- No hosted resource was touched.
