# Ticket 133 — Focused Wave R Blocker Recheck — Response

Task: Independently recheck the three Ticket 126 Wave R blockers
Agent: Jasmine (QA)
Verdict: **PASS**

## Summary

All three Ticket 126 blockers are cleared on the settled Tickets 130–132 worktree:

1. A fresh-schema real-PostgreSQL concurrent cold-profile probe returned two successful first joins and exactly one shared non-self match while PostgreSQL recorded real serialization conflicts that the service recovered from.
2. A real-PostgreSQL Standard settlement made leaderboard, rated profile, public profile summary, and match history agree on `standard_1v1_glicko_v1`, ratings `1514/1486`, one game each, and winner delta `+14`.
3. The optimized production web build exercised real preview-demo sessions and a real database-backed queue. Reconnect settled to idle, a queued refresh recovered searching state, and two separate hostname-scoped sessions routed to the same server-returned matched match ID with `aria-busy="false"`.

The original Ticket 126 FAIL can be superseded by this focused PASS. Ticket 127 is no longer blocked by Ticket 126 remediation QA.

## Acceptance criteria checked

| Required evidence | Result | Independent evidence |
|---|---|---|
| Fresh-schema real-Postgres concurrent cold-profile joins | PASS | `test:postgres:matchmaking` created schema `ticket130_3305015_1783918754068`, applied all three migrations, seeded fixtures, passed 1/1, and dropped the schema. Both concurrent joins returned `201`; both current reads were matched to one shared match. |
| Real serialization conflict reaches retry boundary | PASS | PostgreSQL logs during the independent run recorded two `could not serialize access due to read/write dependencies among transactions` errors. The caller did not receive `409 rating_profile_unavailable`; the probe completed successfully. Source review confirmed retryable `P2034`, wrapped SQLSTATE `40001`, and `40P01` errors are rethrown by profile creation and handled by the bounded outer transaction retry. |
| No self-match or duplicate match | PASS | Real integration assertions passed: two matched tickets, two distinct users, one Standard match, two participants, two distinct participant users. Separate browser-flow DB queries also returned one match, two matched tickets, and two distinct participants. |
| Authoritative Standard reads after settlement | PASS | Fresh `ticket131_jasmine133` schema applied all migrations. Real integration passed 1/1: settlement and all public reads agreed on `standard_1v1_glicko_v1`; leaderboard entries were `1514/1` and `1486/1`; rated profile and summary exposed `1514/1`; history exposed delta `+14` and the same algorithm/version. |
| Bounded reconnect in real browser/session flow | PASS | Against `next start` and a real preview-demo API/database, unauthenticated `/play` showed session-required; authenticated no-ticket reconnect settled to idle with `aria-busy="false"`; queued refresh settled back to searching; matched refresh/routing settled with `aria-busy="false"`. |
| Matched routing uses server match ID | PASS | Both `127.0.0.1` and `localhost` preview-demo sessions navigated to `/play?matchId=2a3d8ed4-0e06-411e-9b5e-9e616462d6a4#gameplay`. DB queries confirmed that exact ID belonged to the single match shared by the two tickets. No ticket ID was used as a route fallback. |
| Canonical gates | PASS | All required commands exited 0. |

## Commands run + exit codes

Canonical chain:

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
CI=true pnpm smoke:api:prod-start
CI=true pnpm smoke:local
CI=true pnpm deps:check
CI=true pnpm secret-scan
git diff --check
```

Combined result: **exit 0**.

Additional focused verification:

- `MATCHMAKING_TEST_DATABASE_URL=<local disposable PostgreSQL> CI=true pnpm --filter @wordle-royale/api test:postgres:matchmaking` — **exit 0**, 1/1 passed; fresh schema migrated, seeded, exercised, and dropped.
- PostgreSQL log inspection for the integration interval — **exit 0**; two real serialization failures found and recovered.
- Fresh `ticket131_jasmine133` schema migration — **exit 0**, all three migrations applied.
- `RATING_READ_INTEGRATION_DATABASE_URL=<ticket131_jasmine133> CI=true pnpm --filter @wordle-royale/api test:rating-reads:postgres` — **exit 0**, 1/1 passed.
- `node --experimental-strip-types --test apps/web/src/components/standard-queue-state.test.ts` — **exit 0**, 5/5 passed.
- `CI=true pnpm --filter @wordle-royale/api test` — **exit 0**, 74 passed / 0 failed; opt-in PostgreSQL suites skipped in this generic run and exercised separately.
- `CI=true pnpm --filter @wordle-royale/contracts test` — **exit 0**, 19 passed / 0 failed.
- `CI=true pnpm --filter @wordle-royale/web typecheck` — **exit 0**.
- Browser-flow DB invariant query — **exit 0**, one match, two matched tickets, two distinct users, two distinct participants.
- QA cleanup: API/web processes terminated and `ticket131_jasmine133` plus `ticket133_browser` schemas dropped — **exit 0**.

## Browser/visual evidence

Target: optimized local production web build at `http://127.0.0.1:3135` and `http://localhost:3135`, backed by the real API and isolated `ticket133_browser` PostgreSQL schema.

Observed states:

1. **Signed out:** `Start a demo session to queue`; enabled `Start preview demo`.
2. **Authenticated/no ticket:** reconnect settled from `Checking for an active search…` to `Find a rated Standard match`; `aria-busy="false"`.
3. **Searching:** clicking `Find Standard match` produced `Looking for a Standard opponent`, elapsed server-ticket time, and enabled `Cancel search`.
4. **Queued refresh:** a fresh `/play` navigation initially showed reconnect, then recovered `Looking for a Standard opponent` and the existing durable ticket.
5. **Matched:** after a second hostname-isolated preview-demo session joined, both sessions recovered `Opponent found`, `aria-busy="false"`, and routed to the same match ID `2a3d8ed4-0e06-411e-9b5e-9e616462d6a4`.
6. **Non-live modes:** Speed / Blitz, Classic, and Multiplayer remained labeled `Not live yet` with prepared-mode links only.
7. **Console:** no JavaScript exceptions were recorded during the optimized-build flow.

## Findings

No release-blocking defect remains within Ticket 133 scope.

### Ticket 126 blocker 1 — Cleared

The real database reproduced serialization pressure but both first joins recovered. The prior masking path is fixed, retries are bounded to three attempts, and exhaustion has an explicit `503 matchmaking_retry_exhausted` terminal response.

### Ticket 126 blocker 2 — Cleared

The Standard Glicko profile/event is now explicitly authoritative for Standard reads. Legacy placement rows can coexist without winning leaderboard/profile/history selection. Real settlement-to-read integration passed.

### Ticket 126 blocker 3 — Cleared for production build

The production build hydrated the queue client and settled every exercised busy state. Idle reconnect, queued refresh, and matched routing all passed against real sessions and database state.

## Security, regression, and scope review

- No answer, hash, salt, or dictionary authority leaked through the exercised queue/read/browser states.
- Matchmaking remains server-authoritative; no client-supplied rating or match ID determined pairing.
- Retry handling did not weaken unique indexes or permit self/duplicate pairing.
- Legacy rating rows are preserved rather than destructively rewritten.
- Rating-read integration requires a schema prefixed `ticket131`, limiting accidental use against an arbitrary schema.
- No provider, hosted database, deployment, PR, branch, or remote resource was mutated.
- Other agents' shared-worktree changes and response files were preserved.

## Required fixes / owner

None for Ticket 133. Ticket 127 may proceed.

## Residual risks / warnings

1. During QA, `next dev` under this browser harness served the reconnect markup but did not attach React fiber or issue the reconnect server-action fetch, reproducing an indefinite checking state. The same code passed with the canonical optimized `next build` + `next start` path, which is the deploy-shaped release path. Treat the development/Turbopack behavior as a non-release-blocking local tooling warning.
2. The Ticket 130 integration runner creates and drops a random schema but does not independently reject a remote/provider database URL. Continue supplying only an explicitly disposable local PostgreSQL base URL.
3. Hosted preview behavior is outside Ticket 133; Ticket 128/129 remain responsible for deployment and final hosted verification.

## Files changed

- `agent-communication/responses/ticket-133-jasmine-focused-wave-r-blocker-recheck-response.md`
