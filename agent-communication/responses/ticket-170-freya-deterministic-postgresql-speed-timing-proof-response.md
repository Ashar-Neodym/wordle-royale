# Ticket 170 — Deterministic PostgreSQL Speed Timing Proof Response

Task: Ticket 170 — Deterministic PostgreSQL Speed Timing Proof
Agent: Freya (backend verification)
Status: **Complete; ready for Ticket 171 recheck**
Date: 2026-07-16

## Summary

Added a dedicated deterministic PostgreSQL integration harness for Speed timing and adjudication boundaries. The harness migrates and seeds a fresh disposable schema, controls event time through a database-owned clock row, executes exact boundary/concurrency cases, and always drops the schema.

The test seam is unreachable in ordinary runtime: it activates only when `NODE_ENV=test`, `APP_ENV=test`, and `RUN_SPEED_TIMING_POSTGRES_INTEGRATION=1` are all exact. Otherwise gameplay continues to use PostgreSQL `clock_timestamp()`.

## Deterministic proof

The suite now proves with controlled database event times:

- ready expiry at the exact 20-second boundary produces no-contest;
- the 3-second countdown rejects at 1 ms before reveal and accepts at the exact reveal instant;
- the 75-second hard deadline is inclusive;
- 1 ms after the deadline is rejected and consumes no attempt;
- concurrent ready acknowledgements persist exactly one immutable reveal/deadline pair;
- equal-guess solves at 5,050 ms and 5,099 ms share bucket 50 and draw;
- equal-guess solves at 5,099 ms and 5,100 ms occupy buckets 50/51 and produce one deterministic winner;
- fewer guesses beats a faster solve;
- malicious past/future client timestamps cannot alter acceptance, elapsed time, buckets, or outcome.

No wall-clock sleeps, scheduler luck, or JavaScript `Date.now()` determine these assertions.

## Files changed

- `apps/api/package.json`
- `apps/api/scripts/run-speed-timing-postgres-integration.mjs`
- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/test/speed-timing-postgres.integration.test.ts`

## Commands run + exit codes

```text
pnpm --filter @wordle-royale/api test:postgres:speed-timing
exit 0 — 4 passed, 0 failed; fresh schema migrated, seeded, tested, and dropped

pnpm --filter @wordle-royale/api test:postgres:speed-gameplay
exit 0 — 5 passed, 0 failed

pnpm --filter @wordle-royale/api test
exit 0 — 143 passed, 0 failed

pnpm --filter @wordle-royale/api typecheck
exit 0

pnpm validate:workspace
exit 0 — 9 workspace packages validated

pnpm build
exit 0 — all workspace builds passed

pnpm --filter @wordle-royale/api db:validate
exit 0 — Prisma schema valid

pnpm --filter @wordle-royale/api smoke:prod-start
exit 0 — production-start `/readyz` smoke passed

node scripts/secret-scan.mjs
exit 0 — 249 source/config files scanned

git diff --check
exit 0
```

One intermediate timing run correctly failed because the test expected both concurrent ready responses to contain the reveal pair; the first acknowledgement is allowed to return before the second persists it. The proof was corrected to assert the authoritative persisted match/round pair and reconnect snapshot. The final 4/4 run passed on a newly created schema, which was dropped.

## Independent review

The initial review found the first two-case suite did not explicitly prove fewer-guesses priority, concurrent ready immutability, ignored client timestamps, or post-deadline attempt preservation. All four proofs were added. Final independent re-review returned **PASS — no blocker remains**.

## Browser/visual checks

Not applicable. Ticket 170 is a backend PostgreSQL timing harness with no UI output.

## Accessibility notes

No UI changes.

## Risks/follow-ups

- The deterministic table exists only inside the disposable test schema; no production migration or runtime table was added.
- Ticket 171 should rerun `pnpm --filter @wordle-royale/api test:postgres:speed-timing` independently.
- No commit, push, deployment, hosted database mutation, or provider change was performed.
