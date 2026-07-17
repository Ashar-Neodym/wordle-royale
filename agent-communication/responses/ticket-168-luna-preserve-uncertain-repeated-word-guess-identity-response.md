# Ticket 168 — Preserve Uncertain Repeated-Word Guess Identity Response

Task: Ticket 168 — Preserve Uncertain Repeated-Word Guess Identity
Agent: Luna (coder)
Status: **Complete; ready for Ticket 171 independent blocker recheck**

## Result

Closed the uncertain repeated-word retry gap in the Speed client.

The client now:

- retains an existing uncertain `{ id, guess }` operation even if input state changes;
- retries the retained word with the retained request UUID rather than deriving identity from word text;
- reconciles pending state only when `myState.acceptedGuesses[].clientRequestId` contains that exact operation ID;
- does not clear the second pending `CRANE` merely because an earlier accepted `CRANE` exists;
- locks the guess input while an uncertain operation remains unresolved;
- labels the available retry explicitly as `Retry “CRANE” with same request`;
- clears the retained operation and input when an authoritative refresh confirms that exact operation;
- leaves Submit disabled after that confirmation, preventing the old retry gesture from creating a third mutation;
- continues to make no automatic mutation retry; only the safe state read is automatic;
- preserves the existing route, deadline, accessibility, opponent-progress, and spoiler boundaries.

Repeated legal words remain supported as distinct intentional attempts: after the confirmed second operation clears, the player may deliberately type that word again, which correctly creates a new operation. The stale retry itself cannot silently become that third attempt.

## Files changed

- `apps/web/src/components/SpeedGameplayPanel.tsx`
- `apps/web/src/components/speed-live-state.ts`
- `apps/web/src/components/speed-live-state.test.ts`
- `agent-communication/responses/ticket-168-luna-preserve-uncertain-repeated-word-guess-identity-response.md`

Ticket 167’s contract/backend operation-correlation work was consumed as a prerequisite and is not attributed to Luna.

## TDD evidence

Red:

```text
pnpm exec tsx --test apps/web/src/components/speed-live-state.test.ts
exit 1
SyntaxError: module did not provide reconcileUncertainGuessRequest
```

Green:

```text
pnpm exec tsx --test apps/web/src/components/speed-live-state.test.ts
exit 0 — 7 passed, 0 failed
```

The new regression proves:

1. first accepted `CRANE` uses operation A;
2. uncertain second `CRANE` uses operation B;
3. a snapshot containing only operation A retains B;
4. changing typed input cannot replace B;
5. a snapshot containing exact operation B clears B.

## Production-artifact browser/server integration

Built and served the standalone production Next artifact against a deterministic server implementing the Ticket 167 operation-ID snapshot contract.

Scenario exercised:

1. Initial authoritative snapshot contained accepted `CRANE` operation A.
2. Browser typed and submitted `CRANE` again.
3. Server committed operation B and intentionally closed the response connection without returning a response.
4. The client performed only the authoritative state refresh.
5. Refreshed board rendered exactly two accepted `CRANE` rows.
6. Input was empty and Submit was disabled after exact operation-B correlation.
7. No third row appeared, demonstrating that the dropped response was not automatically replayed and the old retry gesture did not generate operation C.

The UI retained its labeled input, six-row accessible board, count-only opponent progress, and no opponent word/feedback/timing disclosure.

## Commands run + exit codes

```text
pnpm exec tsx --test \
  apps/web/src/components/speed-live-state.test.ts \
  apps/web/src/components/standard-queue-state.test.ts \
  apps/web/src/lib/profile-read-presentation.test.ts \
  apps/web/src/lib/server-read-policy.test.ts
exit 0 — 23 passed, 0 failed

pnpm --filter @wordle-royale/contracts test
exit 0 — 24 passed, 0 failed

pnpm --filter @wordle-royale/web typecheck
exit 0

pnpm --filter @wordle-royale/web build
exit 0 — production build and TypeScript passed

pnpm validate:workspace
exit 0 — 9 packages

pnpm secret-scan
exit 0 — 249 source/config files

git diff --check
exit 0
```

## Cleanup

- deterministic Ticket 168 API stopped;
- standalone Next server stopped;
- `/tmp/ticket-168-api.py` removed;
- ports `3168` and `3169` confirmed closed;
- final `git diff --check` passed.

## Risks / follow-ups

- Ticket 171 should independently repeat the production-browser dropped-response scenario and inspect the durable mutation/attempt rows against disposable PostgreSQL.
- The three Speed web files remain untracked as part of the shared uncommitted Wave T worktree; this handoff scopes Luna’s changes behaviorally rather than claiming ownership of the whole files.
- No hosted/provider mutation, deployment, hosted database operation, migration execution, commit, push, PR, or merge was performed.
