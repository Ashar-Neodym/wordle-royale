# Ticket 60 — Natural Match Progression Terminalization Service

Task: Make ranked matches naturally reach terminal states without direct database manipulation.

Agent: Ruby (backend)

Status: Done

## Summary

Implemented and verified the backend terminalization slice needed for demo-stable ranked loops:

- Participants now reach terminal state through normal gameplay when max attempts are exhausted (`failed`).
- Server-side completion eligibility now checks all persisted participants for terminal outcomes before completing the round/match.
- When every participant is terminal, the gameplay service completes the round and marks the match `completed` with `completedAt`.
- The local dev/test terminalization helper remains guarded outside production and now uses the same server-derived completion path.
- Rating finalization remains idempotent and gated behind terminal eligibility; existing not-ready and voided paths are preserved.
- Added regression coverage for max-attempt failure terminalization across all participants.

## Files changed

- `apps/api/src/gameplay/gameplay-persistence.service.ts`
  - Added server-side `completeRoundAndMatchIfAllParticipantsTerminal(...)` helper.
  - Updated accepted guess handling so terminal guess outcomes can complete the round/match once all participants are terminal.
  - Updated dev/test terminalization to reuse the same completion eligibility path.
- `apps/api/test/gameplay-persistence.test.ts`
  - Added coverage for both participants failing by max attempts and the service completing the round/match without direct DB edits.
  - Tightened mock behavior to count guesses and update participants per participant id.
- `apps/api/README.md`
  - Documented natural terminal states and server-derived completion eligibility.

Related existing API boundary used by this ticket:

- `POST /matches/dev/:matchId/users/:userId/terminalize`
  - Local/dev/test-only helper for fixture users.
  - Rejects production use.
  - Supports terminal outcomes such as `failed`, `abandoned`, and `voided` through the service validation boundary.
- `POST /matches/:matchId/complete`
  - Still performs idempotent rating finalization after terminal eligibility.

## API/data contract impact

- No new public production endpoint was added.
- No Prisma schema migration was required.
- Match/round terminalization is now derived from persisted participant terminal outcomes.
- Rating events continue to be created only by the idempotent finalization flow after terminal eligibility.
- Spoiler boundaries unchanged: no plaintext answers, answer hashes, or salts are returned in public/API responses.

## Commands run + exit codes

- `pnpm --filter @wordle-royale/api test -- test/gameplay-persistence.test.ts` — exit `1` during RED phase, proving the max-attempt terminalization gap.
- `pnpm --filter @wordle-royale/api test -- test/gameplay-persistence.test.ts` — exit `0` after implementation.
- `pnpm --filter @wordle-royale/api test` — exit `0`; `32/32` tests passed.
- `pnpm --filter @wordle-royale/api build` — exit `0`; `tsc --noEmit -p tsconfig.json` passed.
- `pnpm --filter @wordle-royale/api db:validate` — exit `0`; Prisma schema valid.
- `pnpm validate:workspace` — exit `0`; workspace scaffold validation passed for 9 packages.
- `pnpm secret-scan` — exit `0`; 167 source/config files scanned, passed.

## Verification evidence

Final relevant test output included:

```text
▶ GameplayPersistenceService
  ✔ starts a ranked match with hashed answer authority and no plaintext answer on the round
  ✔ rejects banned guesses without consuming an attempt or leaking feedback
  ✔ naturally completes the round and match after all participants fail by max attempts
  ✔ accepts a solved guess, persists feedback and score server-side, and completes participant and round state
✔ GameplayPersistenceService
ℹ tests 32
ℹ pass 32
ℹ fail 0
```

Build/typecheck output:

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
```

Prisma validation output:

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

Secret scan output:

```text
Secret scan passed (167 source/config files scanned).
```

## Security/data risks

- Low risk: no production data operations, no migration, no secret/env changes.
- Dev/test terminalization remains guarded by `NODE_ENV !== 'production'` and fixture-user validation.
- The service does update match status to `completed` automatically when all participants are terminal; this is intentional for the ranked loop and rating-finalization gate.

## Follow-ups

- If multi-round ranked modes are introduced, completion eligibility should become round-aware/match-format-aware rather than assuming the current one-round ranked slice.
- Freya/Luna UI can continue using the dev helper for local fixture smoke, then call the existing completion endpoint for idempotent rating finalization.
