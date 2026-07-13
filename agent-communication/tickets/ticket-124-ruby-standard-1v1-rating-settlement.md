# Ticket 124 — Standard 1v1 Rating Settlement Activation

Agent: Ruby (rating/tools implementation)
Wave: R — Live Standard 1v1 Matchmaking
Status: New after Ticket 122; can run parallel with Ticket 123 once contracts are locked

## Goal

Connect completed `standard_1v1` matches to the mode-aware rating profile/event model using the approved rating baseline, with deterministic and idempotent settlement.

## Scope

- Production-safe rating calculation module using the locked Wave P parameters.
- Win/loss/draw/abandon adjudication inputs from server-authoritative match results.
- Atomic updates for both players and append-only rating events.
- Idempotency so retries cannot apply a rating change twice.
- Provisional game counters and rating deviation handling.
- No rating event for voided/unranked matches.
- Read models expose before/after delta and updated Standard profile.

## Acceptance criteria

- Rating deltas are zero-sum or explain bounded rounding behavior.
- Higher/lower-rated expected-result behavior is covered by tests.
- Draw, abandon, provisional, repeat settlement, and concurrent settlement tests pass.
- Existing simulation tooling remains reproducible.
- Only `standard_1v1` settlement is activated in this wave.
- No provider deployment or hosted mutation.

## Verification

```bash
CI=true pnpm --filter @wordle-royale/rating-tools test
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm typecheck
CI=true pnpm secret-scan
git diff --check
```
