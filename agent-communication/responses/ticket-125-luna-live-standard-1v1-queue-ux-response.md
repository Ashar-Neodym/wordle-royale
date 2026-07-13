# Ticket 125 — Live Standard 1v1 Queue UX — Response

Task: Ticket 125 — Live Standard 1v1 Queue UX
Agent: Luna (web UX implementation)
Status: Complete — ready for Wave R integration QA; no hosted deployment performed

## Summary

Implemented the live `standard_1v1` automatic queue experience on `/play` against the locked Ticket 122 API contract and the Ticket 123 server-authoritative matchmaker now present in the working tree.

The UI provides explicit session gating, reconnects an active queue ticket after refresh, polls authoritative ticket state, allows cancellation before pairing, handles terminal/error states honestly, and routes matched users to the existing gameplay surface using the server-provided shared match ID. Speed / Blitz, Classic, and Multiplayer remain clearly marked as unavailable.

This response-file follow-up made no additional product-code changes.

## Files changed

Ticket 125 product files:

- `apps/web/src/components/StandardQueuePanel.tsx`
- `apps/web/src/app/play/page.tsx`
- `apps/web/src/app/actions.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/components/web-shell.module.css`

Handoff artifact:

- `agent-communication/responses/ticket-125-luna-live-standard-1v1-queue-ux-response.md`

The working tree also contains parallel Wave R backend, rating, contract, migration, test, and documentation changes from Tickets 123 and 124. Those are not attributed to Luna in this response.

## Behavior covered

### Session and entry states

- Signed-out users see an explicit `Start preview demo` action rather than an enabled anonymous queue button.
- API/session-unavailable state says queue status could not be confirmed and does not claim a ticket was created.
- Authenticated page load enters `reconnecting` and calls the current-ticket endpoint before presenting idle state.
- Idle state exposes `Find Standard match`.
- Joining state disables repeated actions while the server creates or recovers the user's active ticket.

### Searching and reconnect

- Queue creation sends only the locked Standard rated request shape with a generated idempotency/client request ID.
- A queued ticket renders `Looking for a Standard opponent`.
- The displayed elapsed search time is derived from the authoritative ticket `createdAt`; it is not an estimated or fabricated wait metric.
- Ticket status polls every two seconds using the ticket-specific endpoint.
- Refresh/re-entry recovers server state through `GET /matchmaking/standard-1v1/tickets/current`.
- No queue population, invented opponent, fake rating, or guessed wait estimate is shown.

### Cancellation and terminal states

- `Cancel search` is available only while the ticket is queued.
- Cancellation has a disabled `Cancelling…` state while awaiting server confirmation.
- Confirmed cancellation renders `Search cancelled` and offers `Search again`.
- Server `timed_out` state renders an honest timeout message with retry and lobby fallback.
- Failed requests retain recoverable `Check queue status` and `Use lobbies` actions.
- If cancellation loses a match/cancel race, the UI does not invent a result; it reports the server error and allows an authoritative status recheck.

### Matched routing

- A matched ticket renders `Opponent found`.
- The only match route used is the server-provided `matchedMatchId`:

```text
/play?matchId=<matchedMatchId>#gameplay
```

- An explicit `Open match` link is present, with automatic navigation after a short accessible matched announcement.
- The client never supplies an opponent, puzzle, result, or rating outcome.

### Product accuracy and accessibility

- Standard is identified as the only automatic rated queue in this preview.
- Speed / Blitz, Classic, and Multiplayer display `Not live yet` and cannot start matchmaking.
- Public-preview limitations remain visible.
- Queue state uses `aria-live="polite"`, `role="status"`, and `aria-busy`.
- Busy operations expose disabled buttons.
- Queue layout collapses responsively and preserves wrapped actions on narrower layouts.

## Verification commands and results

Commands run from the repository root during Ticket 125 implementation:

```bash
CI=true pnpm --filter @wordle-royale/web build
```

Result: PASS, exit `0`.

Observed:

```text
✓ Compiled successfully
Finished TypeScript
/profile, /profile/[handle], /lobbies, /play, and existing gameplay routes built successfully
```

```bash
CI=true pnpm typecheck
```

Result: PASS, exit `0`.

Observed:

```text
Workspace scaffold validation passed (9 workspace packages).
```

```bash
CI=true pnpm secret-scan
```

Result: PASS, exit `0`.

Observed:

```text
Secret scan passed (199 source/config files scanned).
```

```bash
git diff --check
```

Result: PASS, exit `0`; no whitespace errors.

The required web build includes all existing profile, lobby, match-detail, gameplay, leaderboard, and settings routes, satisfying the regression build criterion.

## Browser smoke evidence

The queue UI was exercised locally against a temporary contract-compatible API double during implementation. This verified the web state machine independently while Ticket 123 integration was landing.

Observed states and flows:

- authenticated idle: `Find a rated Standard match`;
- signed out: `Start a demo session to queue` and `Start preview demo`;
- joining/searching: `Looking for a Standard opponent` with elapsed time from `createdAt`;
- refresh during search: `/play` recovered the same active queued ticket through the current-ticket call;
- cancellation: `Search cancelled` with `Search again`;
- matched: `Opponent found` and route generated from the mock server's shared `matchedMatchId`;
- Speed / Blitz, Classic, and Multiplayer: `Not live yet`;
- desktop DOM overflow check: false;
- browser console: no messages and no JavaScript errors.

The temporary API double supplied contract-shaped ticket states only; it did not provide fake production queue metrics or become part of the repository.

## Ticket 123 dependency status

Ticket 123's implementation is now present in the working tree, including:

- authenticated create/current/status/cancel endpoints;
- durable PostgreSQL `MatchmakingTicket` persistence;
- shared matchmaking Zod contracts;
- transaction-safe pairing and shared match creation;
- timeout/cancellation lifecycle handling;
- API matchmaking tests.

Ticket 123's handoff records its focused matchmaking tests, complete API test suite, Prisma validation, and API build as passing. Luna did not rerun or re-attribute those backend tests in this response.

## Acceptance criteria mapping

| Criterion | Status | Evidence |
|---|---:|---|
| Explicit auth/session gating | Pass | Signed-out and session-unavailable states disable queue creation and expose demo-session/status-recovery actions. |
| Refresh during search recovers server state | Pass | Initial authenticated mount calls the locked current-ticket endpoint; browser smoke recovered queued state after reload. |
| Matched response routes to shared server match ID | Pass | Navigation and explicit link use only `ticket.matchedMatchId`. |
| Cancel and error states are honest/recoverable | Pass | Queued-only cancel, disabled cancelling state, retry/status check, and lobby fallback are implemented. |
| No fake wait/opponent/rating/population | Pass | Only elapsed time derived from `createdAt` is shown; no fabricated queue metrics are rendered. |
| Existing pages continue to build | Pass | Next production build completed successfully for all web routes. |
| No hosted deployment | Pass | No provider or hosted environment was changed. |

## Risks and follow-ups

- Ticket 126 should run the real local-PostgreSQL two-user browser/API integration: two sessions queue, receive the same match ID, enter gameplay, exercise cancel/match races, and verify timeout behavior.
- Luna's browser smoke used a contract-compatible API double while the backend dependency was landing; it does not replace real DB-backed queue integration QA.
- The web API client currently mirrors the locked ticket DTO locally. Ticket 123 now exports shared matchmaking contracts, so a later cleanup may import the shared type directly to reduce drift; current fields are compatible with the implemented response shape and the web build passes.
- Client polling is intentionally simple at a two-second interval for preview scale. Realtime transport, queue presence, and high-throughput optimization remain out of scope.
- Hosted migration and deployment remain reserved for the approved later Wave R deployment tickets.
