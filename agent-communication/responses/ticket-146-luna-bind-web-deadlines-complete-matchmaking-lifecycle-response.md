# Ticket 146 — Bind Web Deadlines to Complete Matchmaking Lifecycle — Response

Task: Ticket 146 — Bind Web Deadlines to Complete Matchmaking Lifecycle
Agent: Luna (web implementation)
Status: Complete; ready for Ticket 147 independent recheck. No hosted/provider mutation performed.

## Summary

Bound the web deadline chain to Freya's enforced complete backend lifecycle rather than the older per-transaction/retry arithmetic. The resulting contract is Elisa's locked ordering:

```text
complete backend lifecycle:  90,000 ms
API proxy deadline:          95,000 ms
/play server-action maximum: 100,000 ms
browser deadline:            110,000 ms
```

Strict margins are now explicit and tested:

- backend lifecycle → API proxy: 5,000 ms;
- API proxy → complete server action: 5,000 ms;
- complete server action → browser: 10,000 ms.

The browser remains bounded and continues to use Ticket 132's recoverable timeout/error path. No queue state is inferred after a timeout.

## Files changed

Ticket 146 direct changes:

- `apps/web/src/lib/matchmaking-deadline-policy.ts`
  - adds the enforced 90-second backend lifecycle to the web policy;
  - changes API/server/browser budgets to 95/100/110 seconds;
  - documents each cross-layer margin.
- `apps/web/src/lib/matchmaking-deadline-policy.test.ts`
  - imports the actual backend `MATCHMAKING_LIFECYCLE_MS` constant;
  - behaviorally instruments the four exported API client operations and records their scheduled proxy deadlines;
  - behaviorally instruments all four browser operation wrappers and records their scheduled client deadlines;
  - retains the exact `/play` route-segment config assertion required because Next needs a numeric literal.
- `apps/web/src/app/play/page.tsx`
  - changes the statically analyzable server-action `maxDuration` from 130 to 100 seconds.

Existing Ticket 142 operation wiring remains active and was exercised rather than replaced:

- join → `matchmakingDeadlinePolicyFor('join')`;
- reconnect/current lookup → `matchmakingDeadlinePolicyFor('reconnect')`;
- ticket polling → `matchmakingDeadlinePolicyFor('current_ticket')`;
- cancel → `matchmakingDeadlinePolicyFor('cancel')`.

Both `api-client.ts` and `StandardQueuePanel.tsx` consume these operation keys. Updating the shared policy therefore changes the actual API and browser timers without duplicated call-site numbers.

## Behavioral anti-drift coverage

Ticket 142's broad whole-file call-site regex assertions were removed. The replacement coverage executes the real exported functions:

1. The policy test directly imports `MATCHMAKING_LIFECYCLE_MS` from the backend coordinator and asserts exact equality with the web policy's backend cap.
2. A controlled immediate `fetch` response executes:
   - `createStandard1v1Ticket()`;
   - `getCurrentStandard1v1Ticket()`;
   - `getStandard1v1Ticket()`;
   - `cancelStandard1v1Ticket()`.
3. Timer instrumentation proves each real API function schedules exactly 95,000 ms.
4. The real browser deadline wrapper is executed for `join`, `reconnect`, `current_ticket`, and `cancel`; each schedules exactly 110,000 ms and rejects through the existing bounded timeout path.
5. `/play`'s exact exported numeric `maxDuration` is parsed and compared with the policy's 100-second server-action value. A literal remains necessary because Next rejects imported route-segment config expressions.

## Commands run + exit codes

TDD red state:

- Focused policy/state tests before implementation — exit 1:
  - missing backend lifecycle binding;
  - real API functions scheduled the obsolete 125,000 ms proxy timeout;
  - browser operation wrappers scheduled the obsolete 140,000 ms deadline.

Final verification:

- `pnpm --filter @wordle-royale/api exec node --import tsx --test ../web/src/lib/matchmaking-deadline-policy.test.ts ../web/src/components/standard-queue-state.test.ts` — exit 0; 10 tests passed.
- `CI=true pnpm --filter @wordle-royale/web typecheck` — exit 0.
- `CI=true pnpm --filter @wordle-royale/web build` — exit 0; optimized production build completed and `/play` remained dynamic.
- `CI=true pnpm typecheck` — exit 0; workspace validation passed for 9 packages.
- `CI=true pnpm secret-scan` — exit 0; 220 source/config files scanned.
- `git diff --check` — exit 0.
- Stale-value search across web TypeScript for the prior 125/127/130/140-second constants — zero matches.

## Result

The web no longer budgets against a hypothetical sequence of independent retry loops. It now outlives the backend's single monotonic 90-second lifecycle coordinator with tested transport/server/browser margins:

```text
90s backend < 95s API < 100s server action < 110s browser
```

Join, reconnect, ticket polling, and cancel all use the lifecycle-derived operation policy. Recoverable UI timeout behavior and server-authoritative queue state remain unchanged.

## Risks/follow-ups

- Ticket 147 must independently rerun the full local lifecycle/retry contract and canonical gates; Luna has not self-approved final release readiness.
- The server-action config remains a numeric literal due Next's static route-config requirement, but direct equality coverage prevents drift from the shared policy.
- No hosted runtime, provider setting, database, schema, migration, deployment, PR, or merge was mutated.
