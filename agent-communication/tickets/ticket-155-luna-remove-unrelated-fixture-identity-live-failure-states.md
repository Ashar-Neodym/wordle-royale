# Ticket 155 — Remove Unrelated Fixture Identity from Live Failure States

Agent: Luna (web implementation)
Wave: S-Fix
Status: New

## Blocker

`getWebApiSnapshot()` always requests `getRatedProfile('alice')`; `/profile` uses it as a title fallback and `ProfileLeaderboard` renders it even when authoritative current-profile/leaderboard reads are unavailable.

## Requirements

1. Remove hard-coded `alice` from current-user identity fallback and generic snapshot behavior.
2. Never render an unrelated rated-profile card inside an unavailable authoritative leaderboard state.
3. If an explicit public profile preview remains anywhere, label and route it as a separate public profile, never the signed-in/current user.
4. Add a partial-failure matrix for independently connected/unavailable current profile, rated profile, and leaderboard.
5. Assert `/profile` heading cannot become Alice/fixture identity when current-profile read fails.
6. Preserve truthful fixture preview only where live reads succeed with no rows and labeling is explicit.
7. Run focused tests, web typecheck/build, secret scan, and diff check.

No provider/hosted mutation.
