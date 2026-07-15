# Ticket 154 — Real Server-Read Retry Controls — Response

Task: Ticket 154 — Real Server-Read Retry Controls
Agent: Luna (coder)
Status: Complete; ready for independent QA.

## Files changed

- `apps/web/src/components/ServerReadRetryButton.tsx`
- `apps/web/src/lib/server-read-retry.ts`
- `apps/web/src/lib/server-read-policy.test.ts`
- `apps/web/src/lib/read-fallback.ts`
- `apps/web/src/components/ProfileHistory.tsx`
- `apps/web/src/components/ReportAndProfile.tsx`
- `apps/web/src/components/web-shell.module.css`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/profile/[handle]/page.tsx`
- `apps/web/src/app/leaderboard/page.tsx`
- `apps/web/src/app/play/page.tsx`
- `agent-communication/responses/ticket-154-luna-real-server-read-retry-controls-response.md`

## Implementation

### Real server-read retry control

Replaced fallback retry anchors with a shared client button. Activating it:

1. marks the control pending;
2. disables the button;
3. exposes `aria-busy="true"`;
4. changes the visible label to `Retrying…` and announces a polite live-region status;
5. performs a full same-URL reload on the next timer turn.

The same-URL reload forces a fresh server-component render and fresh `cache: 'no-store'` API reads. It preserves the pathname, query string, and fragment automatically. In particular, `/play?matchId=...` retains the exact authoritative `matchId` query value.

The control is now used for exhausted:

- current and public profile reads;
- leaderboard reads on `/leaderboard`, `/profile`, and `/play`;
- history reads.

The old `retryHref` model and same-document `#leaderboard` fallback links were removed.

### Retry-control behavior coverage

The dependency-free retry helper tests now prove:

- idle and pending accessibility state;
- one reload is scheduled after a retry request;
- a second request is rejected while pending.

### Corrected hosted-read timing coverage

The former accelerated “1.5-second” test now waits for a real 1,500 ms response. The observed focused-test duration was **1,520.78 ms**, genuinely crossing the retired 1,200 ms boundary while remaining below the 5,000 ms attempt deadline.

Added first-failure/second-success coverage. A transient first transport failure recovered on attempt two after the bounded retry delay.

### Preserved safety contracts

- Queue join/cancel and gameplay guess/completion mutations remain single-attempt.
- Matchmaking current-ticket reads retain the separate lifecycle-derived contract.
- Focused policy tests continue to enforce `90,000 < 95,000 < 100,000 < 110,000 ms`.
- No mutation was moved onto the ordinary read retry path.

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/lib/server-read-policy.test.ts \
  ../web/src/lib/matchmaking-deadline-policy.test.ts \
  ../web/src/components/standard-queue-state.test.ts
```

Exit 0 — **17 passed, 0 failed**.

```text
CI=true pnpm --filter @wordle-royale/web typecheck
```

Exit 0.

```text
CI=true pnpm --filter @wordle-royale/web build
```

Exit 0 — production build compiled, typechecked, and generated all routes.

```text
CI=true pnpm typecheck
```

Exit 0 — workspace validation passed for **9 packages**.

```text
CI=true pnpm secret-scan
```

Exit 0 — **226 source/config files** scanned.

```text
git diff --check
```

Exit 0.

## Production browser verification

Ran the production Next server against a deterministic temporary API:

- the first two leaderboard requests returned HTTP 503, exhausting the ordinary read policy;
- `/play?matchId=final-preserved-154` rendered `Live leaderboard unavailable` and the real retry button;
- activating the control caused a new server read: the API counter moved from **2 to 3**;
- the third read returned a live `Retry Winner` row;
- the rendered page transitioned from unavailable to connected;
- the URL remained exactly `/play?matchId=final-preserved-154`;
- no fixture leaderboard row remained under the connected result;
- no horizontal overflow was detected;
- browser console reported **0 messages and 0 JavaScript errors**.

The final built artifact, not a development-only source render, was used for this check.

## Cleanup

- Stopped the temporary production web server and mock API.
- Removed the temporary mock API script.
- Confirmed ports `3154` and `3155` were closed.

## Risks and follow-ups

- The control intentionally uses a full same-URL reload rather than shallow fragment navigation, trading a small amount of client continuity for a reliably fresh server render.
- Busy state is brief when the reload starts immediately, but the pending/disabled/accessibility behavior is explicitly modeled and tested.
- Ticket 155 separately owns removal of unrelated hard-coded fixture identity from partial-failure states; this ticket does not claim that work.
- Independent QA should rerun the Wave S blocker scenario and hosted delayed/transient reads.
- No provider mutation, hosted deployment, database operation, migration, pull request, or merge was performed.
