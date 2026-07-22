# Ticket 178 — Hosted-Latency Speed Mutation Budgets and Recovery UX Response

Task: Ticket 178 — Hosted-Latency Speed Mutation Budgets and Recovery UX
Agent: Luna (coder)
Status: **Complete; ready for Ticket 179 independent review and hosted QA**

## Scope delivered

### Explicit hosted mutation policy

Added `apps/web/src/lib/speed-mutation-policy.ts` as the single source of truth for Speed ready, guess, and forfeit mutation timing:

- backend lifecycle budget: `24,000 ms`
- API proxy budget: `26,000 ms`
- Next server-action envelope: `30,000 ms`
- browser operation envelope: `35,000 ms`
- soft uncertainty threshold: `8,000 ms`
- authoritative recovery read: `12,000 ms` per attempt
- recovery attempts: `2`
- recovery delay: `250 ms`

The policy keeps the required strict ordering:

```text
24,000 < 26,000 < 30,000 < 35,000
```

The worst bounded recovery path begins at 8 seconds and completes within the browser envelope:

```text
8,000 + 12,000 + 250 + 12,000 = 32,250 ms < 35,000 ms
```

### Bound request layers

- Ready, Speed guess, and forfeit API calls now use the explicit `26,000 ms` timeout.
- Standard guess and generic mutation defaults were not changed.
- Speed server actions use a separate `30,000 ms` race envelope.
- The browser uses a `35,000 ms` operation envelope.
- None of these layers automatically replay a mutation.
- A dedicated Speed recovery read uses `12,000 ms × 2` plus `250 ms`; ordinary hosted reads retain their existing policy.

### Recovery and stale-response behavior

- At 8 seconds the UI reports an uncertain operation and starts one read-only authoritative recovery while the original POST remains in flight.
- State reads are single-flight; the regular poller schedules its next read only after the preceding one settles.
- Ready, guess, and forfeit retain their original request UUID after uncertain outcomes.
- Ready reconciliation requires the exact authoritative `viewerReadyOperationId`.
- Guess reconciliation retains Ticket 168's exact accepted-guess operation correlation.
- Older late snapshots are fenced by authoritative `serverTime` and cannot regress a newer recovery snapshot.
- Browser/server-action transport rejection also triggers read-only recovery rather than mutation replay.

### Ready lifecycle and UX

- `waiting_invitation` displays the server-owned 90-second delivery/acceptance phase.
- `waiting_opponent_ready` displays the first-acknowledgement-driven 20-second ready phase.
- The invitation explicitly states that the 20-second phase has not started.
- Ready is available in both V2 pre-start phases where the viewer has not acknowledged.
- Mutation UX now distinguishes:
  - `pending`
  - `uncertain`
  - `confirmed`
  - `expired`
  - `retry_safe`
- Status changes use a visible polite atomic live region.
- Explicit state recovery uses the dedicated hosted-latency recovery policy.

## Files changed

- `apps/web/src/lib/speed-mutation-policy.ts`
- `apps/web/src/lib/speed-mutation-policy.test.ts`
- `apps/web/src/lib/speed-mutation-api-policy.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/app/actions.ts`
- `apps/web/src/components/SpeedGameplayPanel.tsx`
- `apps/web/src/components/speed-live-state.ts`
- `apps/web/src/components/speed-live-state.test.ts`
- `apps/web/src/components/web-shell.module.css`

## Verification

### TDD and focused tests

Initial expected red checks:

- missing Speed mutation policy module: exit `1`
- missing Speed-specific API policy functions: exit `1`
- missing V2 ready lifecycle/stale-snapshot helpers: exit `1`

Final focused command:

```bash
pnpm exec tsx --test \
  apps/web/src/lib/speed-mutation-policy.test.ts \
  apps/web/src/lib/speed-mutation-api-policy.test.ts \
  apps/web/src/components/speed-live-state.test.ts \
  apps/web/src/lib/server-read-policy.test.ts \
  apps/web/src/components/standard-queue-state.test.ts
pnpm --filter @wordle-royale/web typecheck
```

Result: exit `0`, `28/28` tests passed, typecheck passed.

Final ticket-specific rerun after cleanup:

```bash
pnpm exec tsx --test \
  apps/web/src/components/speed-live-state.test.ts \
  apps/web/src/lib/speed-mutation-policy.test.ts \
  apps/web/src/lib/speed-mutation-api-policy.test.ts
```

Result: exit `0`, `16/16` tests passed.

Coverage includes:

- exact budget constants and strict margin ordering
- 8-second soft uncertainty with one read-only recovery
- 35-second browser uncertainty without replay/cancellation
- 30-second server-action bound
- `26,000 ms` on ready, guess, and forfeit only
- two `12,000 ms` recovery attempts plus `250 ms`
- zero automatic Speed mutation retries
- 90-second invitation versus 20-second first-ready phase
- exact ready operation correlation
- stale authoritative snapshot fencing
- Ticket 168 repeated-word identity regression
- Standard queue and ordinary hosted-read regression coverage

### Contracts and repository checks

```bash
pnpm --filter @wordle-royale/contracts test
pnpm --filter @wordle-royale/web typecheck
pnpm --filter @wordle-royale/web build
pnpm validate:workspace
pnpm secret-scan
git diff --check
```

Results:

- contracts: exit `0`, `24/24` passed
- web typecheck: exit `0`
- production build: exit `0`
- workspace validation: exit `0`, 9 packages
- secret scan: exit `0`, 255 source/config files
- diff check: exit `0`

## Production-artifact browser/server evidence

A production Next standalone artifact was exercised against a deterministic threaded API with intentional hosted-style latency:

1. The initial V2 state rendered `Accept your Speed invitation` and `Accept and ready up`, separately from the 20-second opponent-ready phase.
2. Ready used one POST with a 9-second response delay. State GETs continued during the pending response, and the UI transitioned through authoritative ready/countdown state without duplicate ready POSTs.
3. A Speed guess used one POST with a 19-second response delay. It eventually rendered `confirmed — Guess accepted by the server`; the original operation was not replayed.
4. A separate `SLATE` guess deliberately dropped its first response before commit. `/__proof` showed exactly one POST and zero accepted rows. The UI rendered:
   - `retry_safe`
   - `“SLATE” is not confirmed. Retry will reuse its operation ID.`
   - input retained and locked
   - retry label retained the same word/request identity
   - no automatic second POST
5. Same route remained `/play?matchId=17817817-8178-4178-8178-178178178178#speed-gameplay`.
6. Browser checks showed:
   - zero console messages and zero JavaScript errors
   - no horizontal overflow
   - polite atomic live regions present
   - no opponent-word leakage

The temporary browser scenario reaching displayed zero correctly disabled retry because the authoritative gameplay deadline had elapsed; the retained operation identity remained visible instead of inventing extra time.

## Cleanup

- deterministic API stopped
- standalone Next server stopped
- temporary script removed
- ports `3178` and `3179` confirmed closed
- final `git diff --check` passed

Expected process exits from cleanup are `-15` for Python and `143` for Next (`128 + SIGTERM`).

## Risks and Ticket 179 follow-up

- Local deterministic latency verified the browser/server behavior, but no hosted provider or disposable PostgreSQL environment was mutated.
- Ticket 179 should repeat 8–19-second ready/guess/forfeit cases and dropped-response recovery against the hosted staging path.
- Hosted QA should verify durable exactly-once operation rows and confirm no overlapping state reads at the API/database layer.
- Hosted QA should cover both invitation expiry and first-ready-window expiry with two authenticated browsers.
- No deployment, migration, database operation, secret/config edit, commit, PR, or merge was performed.
