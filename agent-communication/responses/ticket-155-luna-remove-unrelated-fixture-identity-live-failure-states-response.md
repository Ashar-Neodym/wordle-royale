# Ticket 155 — Remove Unrelated Fixture Identity from Live Failure States — Response

Task: Ticket 155 — Remove Unrelated Fixture Identity from Live Failure States
Agent: Luna (coder)
Status: Complete; ready for independent QA.

## Files changed

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/profile-read-presentation.ts`
- `apps/web/src/lib/profile-read-presentation.test.ts`
- `apps/web/src/components/ReportAndProfile.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/leaderboard/page.tsx`
- `apps/web/src/app/play/page.tsx`
- `apps/web/src/app/server/page.tsx`
- `agent-communication/responses/ticket-155-luna-remove-unrelated-fixture-identity-live-failure-states-response.md`

## Implementation

### Removed hard-coded generic identity lookup

`getWebApiSnapshot()` no longer requests `getRatedProfile('alice')` and no longer exposes a generic `ratedProfile` field. Its parallel reads are now limited to:

- health;
- readiness;
- current user;
- current profile;
- lobbies;
- leaderboard.

`getRatedProfile()` remains available only as an explicit public read and now requires a caller-supplied handle; it has no default fixture handle.

### Current-profile identity is authoritative

The `/profile` page heading now comes only from the current-profile summary. When that authoritative read is unavailable, the heading is session-neutral:

- `Preview player` for an ordinary unavailable read;
- `Preview profile` at the signed-out/session boundary.

An independently connected rated-profile response cannot become the current-user heading.

The existing `/profile/[handle]` route remains the explicitly separate public-profile surface. It is labeled `Public profile`, is routed by the requested handle, and does not claim to be the signed-in user.

### Removed unrelated profile card from leaderboard surfaces

`ProfileLeaderboard` no longer accepts or renders a generic rated-profile card. This applies to leaderboard sections on:

- `/leaderboard`;
- `/profile`;
- `/play`.

Therefore, an unavailable authoritative leaderboard can show only its truthful error/retry state—never an unrelated profile card.

The server-status page now reports the existing current-profile read (`api.profile`) rather than the removed generic rated-profile lookup.

### Truthful fixture-preview boundary

A dependency-free presentation helper now distinguishes:

- `unavailable` — no leaderboard or fixture rows;
- `live` — connected live rows;
- `fixture_preview` — the live leaderboard read succeeded but returned zero rows.

Fixture rows remain available only in the last case and retain explicit preview labeling.

## Partial-failure matrix

Added all **8 combinations** of independently connected/unavailable:

- current profile;
- unrelated rated profile;
- leaderboard.

Assertions prove:

- the heading is the connected current profile or a neutral preview heading;
- it can never become `Alice Fixture` from an unrelated rated profile;
- unavailable leaderboards never select fixture preview;
- connected empty leaderboards select the explicitly labeled fixture preview.

A behavioral snapshot test also executes `getWebApiSnapshot()` and proves it makes six expected generic reads, makes no `/profiles/*/rating` request, and returns no `ratedProfile` property.

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/lib/profile-read-presentation.test.ts \
  ../web/src/lib/server-read-policy.test.ts \
  ../web/src/lib/matchmaking-deadline-policy.test.ts \
  ../web/src/components/standard-queue-state.test.ts
```

Exit 0 — **21 passed, 0 failed**.

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

Exit 0 — **228 source/config files** scanned.

```text
git diff --check
```

Exit 0.

```text
Standalone asset staging: copy `.next/static`; copy optional `apps/web/public`
```

Exit 1 after static assets were copied because this app has no `apps/web/public` directory. This was non-blocking; the standalone server subsequently started and served all browser-smoke assets without failed resources or console errors.

## Production browser verification

Served the final standalone production artifact with a deterministic partial-failure API.

### Authoritative reads unavailable

The API returned:

- HTTP 503 twice for `/profiles/me/summary`;
- HTTP 503 twice for `/leaderboard?limit=20`;
- a connected Alice fixture if `/profiles/alice/rating` were requested.

Observed on `/profile`:

- page heading: `Preview player`;
- `Profile unavailable` with a real retry control;
- `Live leaderboard unavailable` with no fixture standings;
- no `Alice` text;
- no `@alice` identity;
- no rated-profile card;
- recorded API paths contained no `/profiles/alice/rating` request.

### Connected empty leaderboard

The API then returned a connected leaderboard with zero rows while current profile remained unavailable.

Observed:

- page heading remained `Preview player`;
- leaderboard label was `Leaderboard preview`;
- copy explicitly stated fixture rows were shown only because the live read succeeded with no ranked players;
- three fixture-preview rows rendered;
- no unrelated rated-profile card rendered;
- no `/profiles/alice/rating` request occurred.

Across both checks:

- zero JavaScript console errors;
- no horizontal overflow.

## Cleanup

- Stopped the temporary standalone web server and deterministic API.
- Removed the temporary API script.
- Confirmed ports `3156` and `3157` were closed.

## Risks and follow-ups

- Fixture standings intentionally remain on a connected-empty leaderboard as labeled design-preview data; they are never used as current-user identity and never appear under an unavailable leaderboard.
- Independent Ticket 156 QA should rerun the exact Wave S partial-failure blocker matrix.
- No provider mutation, hosted deployment, database operation, migration, pull request, or merge was performed.
