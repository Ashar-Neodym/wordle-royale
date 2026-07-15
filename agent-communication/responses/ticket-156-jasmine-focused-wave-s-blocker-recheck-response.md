# Ticket 156 — Focused Wave S Blocker Recheck Response

Task: Ticket 156 — Focused Wave S Blocker Recheck
Agent: Jasmine (QA)
Verdict: **PASS**
Date: 2026-07-14

## Summary

Tickets 154–155 resolve both Ticket 150 release blockers.

Independent production-browser QA proved that exhausted `/profile` and `/play` leaderboard reads now render real retry buttons, activation performs a new same-URL server render, the API is called again, and unavailable state transitions to connected. The `/play` query retained its exact authoritative `matchId` through the reload.

The generic web snapshot no longer requests a hard-coded rated profile. Under the exact partial-failure case that previously mislabeled the current user, `/profile` remained session-neutral as `Preview player`, the unavailable leaderboard contained no unrelated rated-profile card or fixture rows, and the mock API recorded zero `/profiles/alice/rating` requests.

The corrected real 1.5-second regression, first-failure/second-success regression, mutation no-retry checks, 90/95/100/110-second matchmaking contract, favicon/metadata checks, production build, browser console, typechecks, workspace validation, secret scan, and diff check all passed.

**Ticket 151 may proceed within its separately authorized checkpoint/PR/CI scope.**

## Acceptance criteria checked

| # | Required check | Result | Evidence |
|---|---|---:|---|
| 1 | `/profile` and `/play` retry controls cause rerender/refetch and preserve route/match state | PASS | Shared client button schedules `window.location.reload()`. Production browser activation increased API counts and rerendered both routes. `/play?matchId=11111111-1111-4111-8111-111111111156` remained byte-for-byte unchanged after retry. |
| 2 | Unavailable read transitions to connected after retry | PASS | Leaderboard first exhausted two HTTP 503 attempts and rendered unavailable. User-triggered retry caused request three, which returned one live `Retry Winner` row; unavailable copy/button disappeared. |
| 3 | Partial failure never labels current user as `alice` or renders unrelated rated-profile data | PASS | `/profile` heading was `Preview player`; unavailable leaderboard showed no profile card/fixture row; DOM contained no Alice identity; API path counts contained no `/profiles/alice/rating`. `getWebApiSnapshot()` now performs six generic reads only. |
| 4 | Exhausted fallback remains truthful and accessible | PASS | Profile and leaderboard clearly state unavailable; no fixture/current-user substitution occurs. Retry is a native button with disabled and `aria-busy` pending state plus a polite screen-reader status region. |
| 5 | Delayed and first-failure/second-success committed regressions are meaningful | PASS | Committed test genuinely waited 1,507ms, exceeding the retired 1,200ms boundary while staying under 5,000ms. First transient failure recovered on attempt two after approximately 200ms and asserted exactly two fetches. |
| 6 | Mutation no-retry and matchmaking deadlines unchanged | PASS | Queue join/cancel and guess/completion each remained one fetch under transport failure. Deadline tests retained exact 90,000 < 95,000 < 100,000 < 110,000ms ordering and `/play` static `maxDuration = 100`. |
| 7 | Favicon/metadata and previously passing Ticket 150 gates remain green | PASS | Favicon served 200 `image/x-icon`, remained one 32×32 32-bit ICO; metadata and spoiler/secret checks passed. |
| 8 | Production browser, focused tests, build/typechecks/workspace/security/diff gates | PASS | Production browser smoke passed with zero console/JS errors and no horizontal overflow. Focused 23/23; all requested broad gates exited 0. |

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/lib/application-metadata.test.ts \
  ../web/src/lib/profile-read-presentation.test.ts \
  ../web/src/lib/server-read-policy.test.ts \
  ../web/src/lib/matchmaking-deadline-policy.test.ts \
  ../web/src/components/standard-queue-state.test.ts
exit 0 — 23 passed, 0 failed
- real delayed read: 1,507ms
- first-failure/second-success: 201ms

CI=true pnpm --filter @wordle-royale/web typecheck
exit 0

CI=true pnpm --filter @wordle-royale/web build
exit 0 — optimized production build; dynamic profile/leaderboard/play routes retained

CI=true pnpm typecheck
exit 0 — workspace validation passed for 9 packages

CI=true pnpm secret-scan
exit 0 — 228 source/config files scanned

git diff --check
exit 0

Production browser smoke against deterministic partial-failure/recovery API
completed — both original blockers resolved

curl/file/stat favicon smoke
exit 0
- HTTP 200
- content-type: image/x-icon
- one 32×32, 32-bit ICO
- 4,286 bytes

Cleanup and port verification
exit 0 — ports 3160 and 3161 closed; temporary mock removed
```

## Browser/visual evidence

### `/profile` exhausted state

The deterministic API returned two 503 responses each for current-profile summary and leaderboard, while retaining a sentinel `/profiles/alice/rating` route that would return `Alice Fixture` if called.

Observed production DOM:

- page heading: `Preview player`;
- `Profile unavailable` with `Retry profile` button;
- `Live read unavailable` / `Live leaderboard unavailable` with `Retry live leaderboard` button;
- no Alice text or unrelated rated-profile card;
- no fixture leaderboard rows;
- API counts showed two current-profile attempts, two leaderboard attempts, and no Alice route request.

Activating leaderboard retry caused a complete server rerender. Counts advanced from two to three leaderboard requests, and the page then rendered live `Retry Winner` data while retaining the neutral unavailable profile state.

### `/play` route-state preservation

Initial URL:

```text
http://127.0.0.1:3160/play?matchId=11111111-1111-4111-8111-111111111156
```

The initial render exhausted two leaderboard reads and showed the retry button. Activating it produced:

- second health/readiness/current-user/profile/lobby render reads;
- leaderboard count advancing from 2 to 3;
- state transition to the connected `Retry Winner` row;
- unavailable leaderboard copy removed;
- exact same URL and `matchId` after reload;
- no Alice text;
- no horizontal overflow.

The browser automation accessibility-click adapter did not dispatch the React client event reliably in this environment, so QA activated the already hydrated native button through its DOM `click()` method. This executes the button's real `onClick` path; the resulting full reload, API counts, preserved URL, and connected rerender were independently observed.

### Metadata, favicon, and console

- title: `Wordle Royale`;
- theme color: `#769656`;
- one favicon link;
- no answer/hash/salt authority or secret-pattern match in rendered HTML;
- browser console: 0 messages, 0 JavaScript errors.

## Findings

No acceptance-blocking defect was reproduced.

### Test-quality note — partial-failure matrix remains more structural than component-rendered

**Suggested owner: Luna; non-blocking**

The committed eight-combination matrix verifies the neutral title and leaderboard display-mode helpers, and the generic snapshot test proves no rated-profile request/property exists. It does not mount the full `/profile` component for all eight combinations. This is acceptable for Ticket 156 because independent production-browser QA reproduced the critical exhausted-current-profile/exhausted-leaderboard case with an Alice sentinel endpoint and proved the sentinel was never called or rendered.

A future rendered route/component regression could make this protection more direct.

## Regression/security/scope review

- Full reload is intentionally used instead of a fragment link, guaranteeing a fresh dynamic server-component render and `cache: no-store` reads.
- Pending retry state disables the control and rejects duplicate requests.
- Route pathname, query string, and fragment are naturally preserved by same-location reload.
- `getWebApiSnapshot()` has no `ratedProfile` field and no generic `/profiles/*/rating` request.
- Explicit public `/profile/[handle]` remains the only separate public-profile surface.
- Unavailable leaderboard mode selects zero rows and does not render the leaderboard list.
- Connected-empty leaderboard intentionally selects clearly labeled fixture preview; this does not affect unavailable state or current-user identity.
- All mutation helpers remain outside the generic read retry path.
- Standard current-ticket reads remain on their lifecycle-derived single-attempt budget.
- No metadata, rendered DOM, or changed code exposed puzzle answer authority, secrets, credentials, connection strings, SQL/ORM details, or internal environment configuration.
- No hosted deployment, provider configuration, database, migration, merge, or remote branch was mutated.
- Existing shared-worktree changes were not reverted or overwritten.

## Required fixes / owner

None for Ticket 156 acceptance.

Follow-up routing:

1. **Yuna:** Ticket 151 may proceed within its authorized checkpoint/PR/CI scope.
2. **Luna, optional:** add a mounted route/component partial-failure test if stronger direct UI anti-regression coverage is desired.

## Residual risks

- This was a local production/deploy-shaped recheck, not a newly deployed hosted Wave S verification.
- Real provider cold starts and hosted latency remain for Tickets 152–153 after checkpoint authorization.
- Full reload intentionally trades shallow client continuity for reliable fresh server reads.
- The retry button's pending visual state may be very brief because reload starts on the next timer turn; its state model and duplicate guard are tested.

## Cleanup

- Stopped the temporary production Next server and deterministic mock API.
- Confirmed ports 3160 and 3161 were closed.
- Removed the temporary mock API script.
- No QA process, container, temporary probe, or hosted mutation remains.
