# Ticket 132 — Bounded Standard Queue Reconnect UX — Response

Task: Ticket 132 — Bounded Standard Queue Reconnect UX
Agent: Luna (coder)
Status: Complete; ready for independent Ticket 133 QA. No hosted deployment performed.

## Files changed

- `apps/web/src/components/StandardQueuePanel.tsx`
  - wraps reconnect, join, cancel, and polling server-action calls in an independent client-visible deadline;
  - settles timeout/transport failures into recoverable `error` state, clearing `aria-busy` and exposing `Check queue status`;
  - uses an action generation counter so stale late reconnect/join/cancel completions cannot overwrite newer state or update an unmounted panel;
  - preserves cookie-forwarding server actions and applies only server-returned ticket state;
  - routes matched tickets through the shared `hrefForMatchedTicket` helper.
- `apps/web/src/components/standard-queue-state.ts`
  - adds the 7-second client action deadline, authoritative queue-result resolution, and matched-href construction.
- `apps/web/src/components/standard-queue-state.test.ts`
  - covers active/no-ticket, queued, matched, unauthenticated, transport error, stalled timeout, and matched routing.

## Behavior and acceptance mapping

- Authenticated reconnect now has a hard 7-second client deadline independent of the API fetch timeout and same-origin server-action transport.
- A no-ticket `204`/connected-null response resolves to `idle`.
- `queued` and `matched` states come only from the server ticket.
- Unauthenticated responses resolve to `signed_out`.
- Timeout, transport, polling, join, and cancellation failures settle to recoverable `error`; busy controls are removed and status retry is available.
- Late results from expired/superseded interactive attempts are ignored.
- The matched URL is constructed only when `ticket.state === 'matched'` and from `ticket.matchedMatchId`; `ticketId` is never a routing fallback.
- Existing server actions and API-client cookie forwarding remain unchanged.

## Real local API/browser evidence

The API ran locally on port 3132 with PostgreSQL, Redis, the application schema, and `AUTH_MODE=preview_demo_session`; Next ran on port 3133. `/readyz` returned `status: ok` with database, application schema, and Redis all `ok`.

Browser flow against the real API/database/session path:

1. Unauthenticated `/play` rendered `Start a demo session to queue` and an enabled `Start preview demo` action.
2. Starting a preview demo produced an authenticated active session with no ticket; reconnect settled to `Find a rated Standard match` (`idle`).
3. Joining produced `Looking for a Standard opponent` with server-derived elapsed time and an enabled cancel action (`searching`).
4. A second distinct preview-demo session was started on the alternate local hostname and joined the real queue. The backend paired both durable tickets and created one shared match.
5. Both sessions recovered `Opponent found`, `aria-busy="false"`, and navigated to the same server-returned match route. The visible `Open match` href and browser location contained the identical `matchedMatchId`; no ticket ID was used.
6. The API was then stopped to exercise a real transport failure. `/play` showed `Queue status is unavailable`, `aria-busy="false"`, and enabled retry. Activating `Check queue status` settled to `Search needs attention` with `fetch failed`, retained `aria-busy="false"`, and again exposed `Check queue status`.
7. No horizontal overflow was detected in the exercised desktop viewport.

Console/network observations:

- Browser console reported zero JavaScript errors throughout unauthenticated, idle, queued, matched, and API-down retry flows.
- Development-only messages were React DevTools/HMR logs plus Next's existing smooth-scroll warning.
- Browser resource timing recorded same-origin `/play` fetches (approximately 10–23 ms in captured samples); queue API access remained behind same-origin server actions rather than exposing cross-origin cookie handling to the browser.
- The real API-down retry exposed the transport failure as `fetch failed` without leaving the panel busy.
- The focused stalled-promise test independently proved the client deadline rejects an action that never resolves.

## Commands run + exit codes

- `node --experimental-strip-types --test apps/web/src/components/standard-queue-state.test.ts` — exit 0; 5 tests passed.
- `CI=true pnpm --filter @wordle-royale/web typecheck` — exit 0.
- `CI=true pnpm --filter @wordle-royale/web build` — exit 0; optimized Next build completed and `/play` remained dynamic.
- `CI=true pnpm typecheck` — exit 0; workspace validation passed for 9 packages.
- `CI=true pnpm secret-scan` — exit 0; 205 source/config files scanned.
- `git diff --check` — exit 0.

## Result

Reconnect can no longer remain indefinitely at `Checking for an active search…`: every interactive queue action has a bounded client failure path, authoritative server results remain intact, and users receive a recoverable retry state after timeout or transport failure.

## Risks/follow-ups

- Independent Ticket 133 browser QA remains required; Luna has not self-approved final release readiness.
- The deterministic timeout assertion uses a deliberately stalled promise in the focused test. The real-browser failure check used an actual stopped local API and therefore returned quickly with connection failure rather than consuming the full 7-second deadline.
- No hosted deployment, provider mutation, migration, PR, or merge was performed.
