# Ticket 172 — Bounded Freshness-Aware Speed Reconciler Health Response

Task: Ticket 172 — Bounded Freshness-Aware Speed Reconciler Health
Agent: Freya (backend reliability)
Status: **Complete; ready for focused Jasmine recheck**
Date: 2026-07-16

## Summary

Replaced the process-lifetime Speed reconciler health boolean with bounded, monotonic freshness evidence. A previous successful pass can no longer keep Speed advertised or operational indefinitely when a later reconciliation pass hangs, the scheduler stops, or no fresh completion occurs.

The one-second reconciler cadence now has two explicit fail-closed bounds:

- successful completion freshness: two scheduling intervals / 2,000 ms;
- maximum in-flight pass age: two scheduling intervals / 2,000 ms.

Both bounds use Node's monotonic `performance.now()` rather than wall-clock time. The clock is injectable only for deterministic tests.

## Implemented behavior

- Tracks whether the scheduler is active.
- Tracks monotonic in-flight pass start time.
- Tracks monotonic last successful completion time.
- Tracks whether the latest completed pass succeeded.
- Starts unavailable and requires an initial successful reconciliation pass.
- Explicit reconciliation failure makes health unavailable immediately.
- A never-resolving pass becomes unavailable after 2,000 ms.
- A scheduler that silently stops producing completions becomes unavailable after 2,000 ms of stale success evidence.
- Module shutdown makes health unavailable immediately.
- A later successful completion refreshes evidence and restores readiness.
- Startup resets old evidence, preventing stale success from carrying across a scheduler restart.
- Runtime metrics now expose scheduler state, in-flight state/age, success age, and both configured budgets.
- Existing `SpeedOperationalReadinessService` continues to propagate this state to `/ranked/modes`, readiness evaluation, and every Speed operation through the stable sanitized `speed_1v1_unavailable` contract.
- Standard catalog and matchmaking remain independent from Speed reconciler health.

## Files changed

- `apps/api/src/gameplay/speed-runtime-health.service.ts`
- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts`
- `apps/api/test/speed-operational-readiness.test.ts`
- `apps/api/test/speed-reconciler-health.test.ts`
- `agent-communication/responses/ticket-172-freya-bounded-freshness-aware-speed-reconciler-health-response.md`
- `agent-communication/index.md`

## Focused regression coverage

The deterministic focused suite proves:

1. successful pass → live;
2. later explicit failure → unavailable;
3. later success → live again;
4. never-resolving pass → unavailable after the bounded threshold;
5. stalled scheduler/no fresh completion → unavailable;
6. stopped scheduler → unavailable immediately;
7. a successful stalled pass completing later → live again;
8. unavailable paths retain sanitized `speed_1v1_unavailable` behavior;
9. stale Speed health disables only Speed, while Standard remains enabled.

## Commands run + exit codes

```text
pnpm --filter @wordle-royale/api typecheck
exit 0

node --import tsx --test \
  test/speed-reconciler-health.test.ts \
  test/speed-operational-readiness.test.ts \
  test/speed-operational-paths.test.ts
exit 0 — 10 passed, 0 failed

pnpm --filter @wordle-royale/api test
exit 0 — 146 passed, 0 failed

pnpm --filter @wordle-royale/contracts test
exit 0 — 24 passed, 0 failed

pnpm --filter @wordle-royale/api test:postgres:speed-gameplay
exit 0 — 5 passed, 0 failed; disposable schema migrated, seeded, tested, and dropped

pnpm --filter @wordle-royale/api test:postgres:speed-timing
exit 0 — 4 passed, 0 failed; disposable schema migrated, seeded, tested, and dropped

pnpm --filter @wordle-royale/api test:postgres:matchmaking
exit 0 — 3 passed, 0 failed; Standard concurrency preserved on a disposable schema

pnpm --filter @wordle-royale/web typecheck
exit 0

pnpm validate:workspace
exit 0 — nine workspace packages validated

pnpm build
exit 0 — API, web, mobile, contracts, and shared packages built

pnpm --filter @wordle-royale/api db:validate
exit 0 — Prisma schema valid

pnpm --filter @wordle-royale/api smoke:prod-start
exit 0 — production-start `/readyz` returned status=ok

node scripts/secret-scan.mjs
exit 0 — 250 source/config files scanned

git diff --check
exit 0
```

## Independent review

Independent review inspected monotonic freshness, hung-pass handling, scheduler stalls/stops, explicit failure, recovery, startup/shutdown races, timer overlap behavior, operational propagation, and Standard independence. It also ran a real-timer hung-pass probe. Verdict: **PASS — no blocker remains**.

The real-timer probe independently confirmed that an initial success became ready, a subsequent pass hung, readiness expired after the two-second budget, overlapping ticks remained suppressed, and resolving work after shutdown could not restore readiness.

## Browser/visual checks

Not applicable. Ticket 172 changes backend runtime health and operational gating only; no rendered UI or layout changed.

## Accessibility notes

No UI, keyboard, focus, labels, live-region, or contrast behavior changed.

## Risks/follow-ups

- The two-second budget is deliberately tied to two missed one-second completion opportunities. If reconciliation workload later requires a longer legitimate pass, cadence and both health bounds must be reviewed together rather than independently loosened.
- The hung asynchronous database operation itself is not forcibly cancelled; health fails closed while it is stuck, and overlap remains suppressed. A later completion can refresh health safely.
- Jasmine should rerun the Ticket 171 hung-pass reproduction and focused canonical gates before Ticket 162 proceeds.
- No commit, push, deployment, hosted database mutation, or provider change was performed.
