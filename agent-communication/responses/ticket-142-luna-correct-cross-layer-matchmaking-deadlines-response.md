# Ticket 142 — Correct Cross-Layer Matchmaking Deadlines — Response

Task: Ticket 142 — Correct Cross-Layer Matchmaking Deadlines
Agent: Luna (coder)
Status: Complete; ready for Ticket 143 independent recheck. No hosted/provider mutation performed.

## Files changed

- `apps/web/src/lib/matchmaking-deadline-policy.ts`
  - defines the shared, bounded cross-layer policy and the four covered operations.
- `apps/web/src/lib/matchmaking-deadline-policy.test.ts`
  - directly asserts ordering, minimum margins, bounded operation coverage, API/browser call-site wiring, and `/play` route configuration.
- `apps/web/src/lib/api-client.ts`
  - routes join, reconnect/current, ticket polling, and cancel API requests through the operation-specific shared proxy budget.
- `apps/web/src/components/standard-queue-state.ts`
  - derives the browser deadline from the shared policy and adds an operation-specific bounded wrapper.
- `apps/web/src/components/standard-queue-state.test.ts`
  - asserts the queue deadline equals the shared browser policy while retaining stalled-promise and state coverage.
- `apps/web/src/components/StandardQueuePanel.tsx`
  - explicitly labels join, reconnect, current-ticket polling, and cancel when applying the browser deadline.
- `apps/web/src/app/play/page.tsx`
  - keeps the statically analyzable Next route `maxDuration` literal required by Next and binds it to the policy through a direct source/config assertion.

## Corrected deadline contract

```text
API proxy timeout:              125,000 ms
Complete /play server action:   130,000 ms
Browser action deadline:        140,000 ms
```

Enforced margins:

- Server-action maximum is 5,000 ms later than the API proxy timeout, covering cookie forwarding, dispatch, response parsing, and return overhead.
- Browser deadline is 10,000 ms later than the complete server-action maximum, so the browser cannot abandon a legitimate server action first.
- The browser remains bounded at 140 seconds and retains Ticket 132's recoverable timeout/error behavior.

The policy is shared for:

- `join` — ticket creation;
- `reconnect` — authoritative current-ticket recovery;
- `current_ticket` — queued-ticket polling/status;
- `cancel` — authoritative cancellation.

Both the API proxy layer and browser action wrapper select their budget through the same operation policy. The focused test reads the actual API client, queue panel, and `/play` route source to prevent an operation or route config from silently drifting away from that policy.

## Next route configuration note

An initial implementation exported `maxDuration` from an imported policy property. `next build` rejected that because route-segment configuration must be statically analyzable. The final `/play` route therefore uses the required literal `130`; the policy test parses that export and asserts exact equality with `MATCHMAKING_DEADLINE_POLICY.serverActionMaxDurationSeconds`. This preserves Next/Vercel behavior while keeping drift directly testable.

## Commands run + exit codes

Final verification:

- `pnpm --filter @wordle-royale/api exec node --import tsx --test ../web/src/lib/matchmaking-deadline-policy.test.ts ../web/src/components/standard-queue-state.test.ts` — exit 0; 8 tests passed.
- `CI=true pnpm --filter @wordle-royale/web typecheck` — exit 0.
- `CI=true pnpm --filter @wordle-royale/web build` — exit 0; optimized Next build completed and `/play` remained dynamic.
- `CI=true pnpm typecheck` — exit 0; workspace validation passed for 9 packages.
- `CI=true pnpm secret-scan` — exit 0; 218 source/config files scanned.
- `git diff --check` — exit 0.

TDD/debug evidence:

- Initial policy test — exit 1 because the policy module did not exist (expected red state).
- Native Node type-stripping combined run — exit 1 because extensionless production imports require the workspace `tsx` resolver; canonical focused tests were rerun through the API workspace and passed.
- First web typecheck — exit 2 because the frozen policy's literal browser value narrowed the optional test override to `140000`; adding an explicit `number` annotation retained testability and fixed the type error.
- First web build — exit 1 due imported route-segment configuration; replaced with a statically analyzable literal plus direct equality assertion. Final build passed.

## Result

The invalid `125s proxy → 127s browser → 130s server action` ordering is removed. The browser now waits beyond the full declared server-action lifetime by a tested ten-second overhead margin without becoming unbounded.

## Risks/follow-ups

- Ticket 143 must independently recheck the cross-layer contract together with Ticket 141's backend expiry semantics; Luna has not self-approved final release readiness.
- Hosted runtime behavior was not mutated or exercised by this ticket.
- No deployment, provider setting change, database operation, migration, PR, or merge was performed.
