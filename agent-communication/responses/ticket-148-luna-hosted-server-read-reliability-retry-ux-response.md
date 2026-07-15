# Ticket 148 — Hosted Server-Read Reliability and Retry UX — Response

Task: Ticket 148 — Hosted Server-Read Reliability and Retry UX
Agent: Luna (coder)
Status: Complete; ready for independent QA.

## Files changed

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/read-fallback.ts`
- `apps/web/src/lib/server-read-policy.test.ts`
- `apps/web/src/components/ProfileHistory.tsx`
- `apps/web/src/components/ReportAndProfile.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/profile/[handle]/page.tsx`
- `apps/web/src/app/leaderboard/page.tsx`
- `apps/web/src/app/play/page.tsx`
- `agent-communication/responses/ticket-148-luna-hosted-server-read-reliability-retry-ux-response.md`

## Implementation

### Hosted read policy

Added one bounded policy for ordinary idempotent server reads:

```text
Per-attempt timeout: 5,000 ms
Maximum attempts:    2
Retry delay:          200 ms
Maximum policy time:  10,200 ms plus negligible request bookkeeping
```

The second attempt is made only for transient read failures:

- transport failures;
- request timeout/abort;
- HTTP 408;
- HTTP 429;
- HTTP 5xx;
- an unreadable HTTP response.

Connected responses and non-transient HTTP failures are returned immediately. Every attempt continues to use `cache: 'no-store'` and forwards the current SSR cookie header.

### Server-render read inventory

The shared hosted policy now covers these ordinary read helpers and all pages that consume them:

- health and readiness;
- current user and current profile;
- lobby listing;
- ranked match state and result;
- leaderboard and rated-profile reads;
- current/public profile summaries;
- match history;
- the parallel `getWebApiSnapshot()` reads used by the home, play, profile, leaderboard, lobby, and server surfaces.

Standard matchmaking current-ticket reads remain on the separately enforced lifecycle-derived `95,000 ms` API budget. They are not wrapped in two 95-second attempts, which would violate the existing `90/95/100/110` lifecycle chain. Their client UI already supplies explicit `Check queue status` recovery.

### Mutation safety

The retry policy is reachable only through `requestReadEnvelope`. Mutations continue to use the single-attempt request path.

Behavioral coverage confirms no automatic retry for:

- Standard queue join;
- Standard queue cancellation;
- gameplay guess submission;
- ranked-match completion.

The existing operation-specific matchmaking deadlines remain unchanged.

### User-visible recovery and truthful fallbacks

- Profile read failure now shows `Retry profile`.
- Public-profile retry preserves the requested handle.
- Leaderboard failure now shows `Retry live leaderboard`.
- Play-page leaderboard retry preserves `matchId` when present.
- History failure now shows `Retry history`.
- Existing queue-read failure continues to show `Check queue status`.
- An unavailable leaderboard no longer renders fixture standings beneath a live-read error.
- Fixture rows are retained only when a live leaderboard read succeeds but contains no ranked rows, and that state is explicitly labeled as a fixture preview.
- Profile failure explicitly states that no fixture player is being shown as the user’s account.

## Verification

### Focused behavioral tests

```text
pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/lib/server-read-policy.test.ts \
  ../web/src/lib/matchmaking-deadline-policy.test.ts \
  ../web/src/components/standard-queue-state.test.ts
```

Exit 0: 14 tests passed.

Coverage includes:

- a simulated 1.5-second read succeeding within the new 5-second budget rather than failing at the former 1.2-second limit;
- two exhausted transient read attempts returning a truthful `unavailable` result;
- exactly one attempt for queue and gameplay mutations;
- explicit profile and leaderboard retry fallback models;
- the existing Standard queue state and `90/95/100/110` lifecycle assertions.

### Build and static verification

```text
CI=true pnpm --filter @wordle-royale/web typecheck
```

Exit 0.

```text
CI=true pnpm --filter @wordle-royale/web build
```

Exit 0. Next compiled, typechecked, and generated all routes successfully.

```text
CI=true pnpm typecheck
```

Exit 0. Workspace scaffold validation passed for 9 packages.

```text
CI=true pnpm secret-scan
```

Exit 0. Secret scan passed for 222 source/config files.

```text
git diff --check
```

Exit 0.

### Browser fallback smoke

Ran the web app locally on `127.0.0.1:3148` with no API listening on the configured default API port, intentionally exercising exhausted read fallbacks.

Observed:

- `/profile` displayed `Profile unavailable`, `Retry profile`, and `Retry live leaderboard`;
- the profile retry link reloaded the same route successfully;
- profile leaderboard retry targeted `/profile#leaderboard`;
- `/leaderboard` displayed `Retry live leaderboard` and no fixture rows under the unavailable state;
- `/play` displayed recoverable `Check queue status` and `Retry live leaderboard` actions;
- fallback text explicitly said no fixture standings were mixed into the unavailable leaderboard;
- no `Showing fixture preview` timeout copy was present;
- no horizontal overflow was detected;
- browser console reported zero JavaScript errors.

The temporary web process was stopped, and port 3148 was confirmed closed.

## Risks and follow-ups

- Independent hosted QA should validate real delayed platform responses and transient upstream failures; local tests use deterministic fetch/timer instrumentation.
- A generic read can consume up to approximately 10.2 seconds when both attempts exhaust. This is deliberate and bounded.
- Matchmaking current-ticket reads intentionally retain their separate lifecycle budget rather than receiving generic two-attempt retry behavior.
- No hosted deployment, provider mutation, database operation, schema migration, pull request, or merge was performed.
