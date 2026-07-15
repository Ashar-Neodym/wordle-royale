# Ticket 150 — Wave S Reliability Polish Independent QA Response

Task: Ticket 150 — Wave S Reliability Polish Independent QA
Agent: Jasmine (QA)
Verdict: **FAIL**
Date: 2026-07-14

## Summary

Wave S passes the bounded read policy, mutation-safety, matchmaking deadline, favicon, metadata, build, typecheck, console, secret-scan, and diff gates. An independent real-time probe also proved that a genuinely delayed 1.5-second idempotent read succeeds within the five-second attempt budget and that one transient failure recovers exactly once on attempt two.

However, the required failure/retry UX is not yet correct on `/profile` or `/play`:

1. their leaderboard “Retry” links are same-document fragment links and do not rerun server reads; and
2. a partial failure can label the current profile page as the unrelated hard-coded `alice` rated profile and show that profile inside an explicitly unavailable leaderboard state.

These reproduce required-check failures for truthful fallback, usable retry, and profile/leaderboard accuracy under partial failure. **Ticket 151 remains blocked.**

## Acceptance criteria checked

| # | Required check | Result | Evidence |
|---|---|---:|---|
| 1 | Delayed idempotent hosted-shaped reads recover within the bounded policy | PASS | Independent real-time probe delayed `getLeaderboard()` for 1,500ms without timer acceleration: connected in 1,507ms, one fetch. A separate probe failed attempt one transiently and connected on attempt two after the 200ms delay. |
| 2 | Exhausted reads render truthful fallback plus usable retry | **FAIL** | Truthful unavailable copy renders, but `/profile#leaderboard` and `/play[?matchId=…]#leaderboard` are same-document fragment navigations. Browser click did not create a navigation or resource request and the failed state remained. |
| 3 | Mutations are never automatically duplicated/retried | PASS | API-client inspection confirms read retry is private to `requestReadEnvelope`; all mutation helpers use single-attempt `requestEnvelope`. Behavioral tests proved exactly one fetch each for queue join/cancel, guess, and completion. |
| 4 | Matchmaking 90/95/100/110 lifecycle remains unchanged | PASS | Focused policy tests passed exact lifecycle-derived values and all four join/reconnect/current/cancel operations. `/play` still exports static `maxDuration = 100`. |
| 5 | Profile, leaderboard, and `/play` accurate under success/failure/retry | **FAIL** | With current profile and leaderboard reads exhausted but `/profiles/alice/rating` connected, `/profile` rendered heading “Alice Fixture” while also saying “Profile unavailable.” The unavailable leaderboard also rendered Alice’s rated-profile card. `/play` preserved the same unrelated rated card under “Live read unavailable,” and its retry link did not refetch. |
| 6 | Production build serves favicon non-404 with correct content type | PASS | Production Next server returned `200 OK` and `content-type: image/x-icon`; file inspection reports one 32×32, 32-bit ICO, 4,286 bytes. |
| 7 | Metadata accurate and spoiler/secret safe | PASS | Browser and tests confirmed title `Wordle Royale`, expected description, `#769656` theme color, dark color scheme, and one 32×32 icon link. No answer/salt/internal-environment metadata was found. |
| 8 | Browser console has no new errors | PASS | Independent production browser smoke recorded zero console messages and zero JavaScript errors. Metadata page had no failed resources. |
| 9 | Canonical web/workspace gates, build, secret scan, diff check | PASS | Focused tests 16/16; independent probe 3/3; web typecheck, production build, workspace validation, secret scan, and `git diff --check` all exited 0. |

## Commands run + exit codes

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test \
  ../web/src/lib/application-metadata.test.ts \
  ../web/src/lib/server-read-policy.test.ts \
  ../web/src/lib/matchmaking-deadline-policy.test.ts \
  ../web/src/components/standard-queue-state.test.ts
exit 0 — 16 passed, 0 failed

Independent temporary real-time read-policy probe
exit 0 — 3 passed, 0 failed
- real 1,500ms delayed read: connected in 1,507ms, one attempt
- transient first failure: connected on attempt two after bounded retry delay
- connected non-transient HTTP 400: one attempt only

CI=true pnpm --filter @wordle-royale/web typecheck
exit 0

CI=true pnpm --filter @wordle-royale/web build
exit 0 — production build succeeded; dynamic profile/leaderboard/play routes retained

CI=true pnpm typecheck
exit 0 — workspace validation passed for 9 packages

CI=true pnpm secret-scan
exit 0 — 224 source/config files scanned

git diff --check
exit 0

file/stat/sha256sum apps/web/src/app/favicon.ico
exit 0 — one 32×32 32-bit ICO; 4,286 bytes

Production favicon HTTP smoke
exit 0 — 200 OK; content-type image/x-icon

Production browser smoke against deterministic partial-failure API
completed — reproduced both blockers; console 0 errors

Cleanup/port verification
exit 0 — ports 3150 and 3151 closed; temporary QA files absent
```

## Browser/visual evidence

### Partial-failure `/profile` reproduction

The deterministic API returned:

- `503` for the current profile summary;
- `503` for the leaderboard;
- a connected rated-profile response for the existing hard-coded `alice` lookup.

The production page simultaneously rendered:

- page heading **“Alice Fixture”**;
- card heading **“Profile unavailable”**;
- text stating no fixture player is shown as the user’s account;
- an Alice rated-profile card inside the **“LIVE READ UNAVAILABLE”** leaderboard section.

This is internally contradictory and can misidentify an unrelated profile as the current player during a partial read failure.

### Retry reproduction

The `/profile` leaderboard retry anchor resolved to:

```text
/profile#leaderboard
```

Before and after clicking it, browser performance state remained:

```text
navigation entries: 1
resource entries:   9
```

The unavailable state remained. The link only targets the section already on the current document and does not rerun server reads.

The `/play` retry similarly resolved to:

```text
/play?matchId=<same-current-match-id>#leaderboard
```

The no-match variant uses `/play#leaderboard`, which has the same same-document behavior.

### Favicon/metadata

Production `/learn/rules` browser inspection showed:

- title: `Wordle Royale`;
- expected public description;
- theme color: `#769656`;
- color scheme: `dark`;
- exactly one favicon link with `image/x-icon` and `32x32`;
- zero failed browser resources;
- zero console/JavaScript errors.

## Findings

### Blocker 1 — leaderboard retry actions on `/profile` and `/play` do not retry

**Owner: Luna**

Affected locations:

- `apps/web/src/app/profile/page.tsx:53`
- `apps/web/src/app/play/page.tsx:44-46,122`
- `apps/web/src/components/ReportAndProfile.tsx:123-129`

The fallback uses an ordinary anchor. Adding only `#leaderboard` to the already-current URL is a same-document fragment navigation, not a server refresh.

Required fix:

- make the action trigger a real reload/server rerender, for example with a distinct retry query parameter or an explicit client `router.refresh()` action;
- preserve `matchId` on `/play`;
- add a behavioral component/browser test proving that clicking retry causes a new read and can transition unavailable → connected.

### Blocker 2 — unrelated `alice` profile leaks into current-profile and unavailable-leaderboard states

**Owner: Luna**

Affected locations:

- `apps/web/src/lib/api-client.ts:373-384` — `getWebApiSnapshot()` always requests `getRatedProfile('alice')`;
- `apps/web/src/app/profile/page.tsx:13-16` — that response becomes the page-title fallback;
- `apps/web/src/components/ReportAndProfile.tsx:104-122` — rated-profile card renders even when the leaderboard read is unavailable.

Required fix:

- never use the hard-coded public `alice` lookup as current-user identity fallback;
- suppress unrelated/fixture rated-profile data whenever the current-profile or authoritative leaderboard state is unavailable, unless it is explicitly labeled as a separate public profile and cannot be mistaken for the current user;
- add partial-failure tests covering independent current-profile, rated-profile, and leaderboard outcomes.

### Test gap — committed “1.5-second” test accelerates the delay to zero

**Owner: Luna**

`server-read-policy.test.ts:41-49` replaces all scheduled timers with zero-delay timers. The test finished in approximately 7ms, so it verifies configured timer arguments rather than an actual 1.5-second delayed read. Independent QA proved the implementation works with a real delay, so this is not an additional product blocker, but the committed regression test should be corrected or renamed and supplemented with a real/fake-clock test whose elapsed virtual time genuinely crosses 1.2 seconds.

The committed suite also lacks first-failure/second-success coverage; independent QA passed that scenario.

## Regression/security/scope review

- Generic reads are bounded to two attempts at 5,000ms with 200ms between attempts.
- Retries are restricted to timeout/transport, 408, 429, 5xx, or unreadable-response cases.
- A connected non-transient 400 was independently verified as single-attempt.
- Mutation helper inspection found no automatic retry path.
- Standard matchmaking current-ticket reads remain separate and single-attempt with lifecycle-derived 95-second API limits.
- Existing 90/95/100/110 lifecycle ordering did not drift.
- Exhausted leaderboard reads no longer mix fixture standings rows into the unavailable state; the remaining problem is the separately rendered hard-coded rated-profile card.
- Public metadata contains no puzzle answers, hash/salt authority, secrets, localhost/internal environment details, or connection information.
- No provider, hosted deployment, database, migration, or remote branch was mutated.
- Existing shared-worktree changes from other tickets were not reverted or overwritten.

## Required fixes / owner

1. **Luna:** make `/profile` and `/play` leaderboard retry controls cause a real rerender/refetch while preserving route state.
2. **Luna:** remove hard-coded `alice` from current-profile fallback identity and unavailable authoritative-read surfaces.
3. **Luna:** add partial-failure and clicked-retry regression coverage; correct the accelerated delayed-read test.
4. **Jasmine:** rerun Ticket 150 after the fixes.
5. **Yuna:** keep Ticket 151 blocked until Jasmine returns PASS.

## Residual risks

- This ticket verified local production/deploy-shaped behavior, not a newly deployed hosted Wave S build.
- Provider cold starts and real hosted upstream delays still require Ticket 152/153 after checkpoint authorization.
- A worst-case exhausted generic read consumes roughly 10.2 seconds by design.
- The favicon is appropriate for the required desktop/browser target; larger install/PWA assets remain out of scope.

## Cleanup

- Stopped the temporary production Next server and deterministic API server.
- Confirmed ports 3150 and 3151 were closed.
- Removed the temporary read-policy probe, mock API, and captured HTML.
- No QA process, container, provider resource, or hosted mutation remains.
