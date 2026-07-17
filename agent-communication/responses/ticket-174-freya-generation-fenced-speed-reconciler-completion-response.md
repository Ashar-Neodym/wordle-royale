# Ticket 174 — Generation-Fenced Speed Reconciler Completion Response

Task: Ticket 174 — Generation-Fenced Speed Reconciler Completion
Agent: Freya (backend reliability)
Status: **Complete; Ticket 175 may proceed**
Date: 2026-07-16

## Summary

Added scheduler-epoch and pass-generation fencing to Speed reconciler health. A timed-out, stopped, superseded, or previous-epoch reconciliation completion can no longer refresh successful-completion evidence, clear a newer pass, update current error evidence, or revive Speed.

After obsolete work settles, the single-flight guard permits a newly generated pass. Speed remains unavailable until that new pass completes successfully within the existing 2,000 ms budget.

## Implemented behavior

- Every scheduler start/restart creates a new monotonically increasing epoch.
- Scheduler stop requires the matching epoch, so a stale stop callback cannot disable a newer scheduler.
- Every pass receives a globally increasing generation plus its scheduler epoch and monotonic start time.
- Success and failure completion APIs require the exact pass identity.
- Completion is accepted only when all conditions hold:
  - scheduler remains active;
  - scheduler epoch is current;
  - completion belongs to the current pass generation;
  - pass start identity matches;
  - elapsed monotonic age is within 2,000 ms.
- Timed-out late success remains unavailable and increments `obsoleteCompletions`.
- Timed-out late failure remains unavailable, increments `obsoleteCompletions`, and cannot update `lastErrorAt`.
- Old success/failure callbacks cannot clear or corrupt a current pass in a newer epoch.
- Stop/restart does not overlap unresolved previous-epoch work; the service-level single-flight guard remains active until that promise settles.
- Once obsolete work settles, only a newly started in-budget success restores availability.
- Runtime metrics expose current scheduler epoch, current pass generation, health ages/budgets, and obsolete completion count.
- Existing catalog, `/readyz`, queue, gameplay, state, forfeit, guess, and reconciliation gates continue consuming the same sanitized `speed_1v1_unavailable` readiness source.
- Standard remains independent.

## Files changed

- `apps/api/src/gameplay/speed-runtime-health.service.ts`
- `apps/api/src/gameplay/speed-expiry-reconciler.service.ts`
- `apps/api/test/speed-operational-readiness.test.ts`
- `apps/api/test/speed-reconciler-health.test.ts`
- `agent-communication/responses/ticket-174-freya-generation-fenced-speed-reconciler-completion-response.md`
- `agent-communication/index.md`

## Deterministic regression coverage

The focused suite now proves:

1. timed-out pass → late success → still unavailable;
2. new in-budget success after obsolete settlement → available;
3. timed-out pass → late failure → obsolete metric increment, no current error update, still unavailable;
4. no overlapping reconciliation while obsolete work remains unresolved;
5. stop/restart creates a new epoch;
6. old success cannot revive or clear the new epoch's current pass;
7. old failure cannot corrupt the new epoch's current pass or health;
8. previous-epoch service work remains fenced after restart;
9. catalog remains fail-closed while Standard remains available;
10. existing queue/gameplay/reconciliation operation guards retain the stable sanitized response.

## Commands run + exit codes

```text
pnpm --filter @wordle-royale/api typecheck
exit 0

node --import tsx --test \
  test/speed-reconciler-health.test.ts \
  test/speed-operational-readiness.test.ts \
  test/speed-operational-paths.test.ts
exit 0 — 13 passed, 0 failed

pnpm --filter @wordle-royale/api test
exit 0 — 149 passed, 0 failed

pnpm --filter @wordle-royale/contracts test
exit 0 — 24 passed, 0 failed

pnpm --filter @wordle-royale/api test:postgres:speed-gameplay
exit 0 — 5 passed, 0 failed; disposable schema dropped

pnpm --filter @wordle-royale/api test:postgres:speed-timing
exit 0 — 4 passed, 0 failed; disposable schema dropped

pnpm --filter @wordle-royale/api test:postgres:matchmaking
exit 0 — 3 passed, 0 failed; disposable schema dropped

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

One initial Standard PostgreSQL invocation used an incorrectly interpolated local credential and exited 1 before connecting. The corrected `[REDACTED]` invocation passed 3/3 and dropped its disposable schema; only the passing run is credited.

## Independent review

The first independent review found that late failures were fenced by epoch/generation but did not yet enforce the 2,000 ms age budget. That finding was fixed by applying the same monotonic age gate to failure completions and adding a deferred service-level regression.

Final independent re-review verdict: **PASS**.

## Browser/visual checks

Not applicable. Ticket 174 changes backend reconciler lifecycle and health evidence only; no rendered UI changed.

## Accessibility notes

No UI, keyboard, focus, labels, live-region, or contrast behavior changed.

## Risks/follow-ups

- Obsolete asynchronous database work is not forcibly cancelled. It remains single-flight until settlement, but all late health updates are fenced.
- A new valid pass cannot begin until unresolved obsolete work settles; Speed intentionally remains fail-closed during that period.
- Ticket 175 should adversarially verify timeout, late success/failure, stop/restart epochs, no overlap, recovery, and all readiness surfaces before Ticket 162 proceeds.
- No commit, push, deployment, hosted database mutation, or provider change was performed.
