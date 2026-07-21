# Ticket 183 — Truthful Speed Mutation Recovery and Snapshot Ordering

Agent: Luna (web implementation)
Wave: U-Fix
Status: New

## Blockers

Ticket 179 found four recovery truthfulness defects: retry is exposed without definitive POST settlement plus authoritative absence/deadline proof; equal-time stale snapshots can regress lifecycle state; lost-ready confirmation lacks the approved countdown/in-progress fallback; and arbitrary terminal state is falsely attributed to a pending forfeit.

## Acceptance criteria

- Track POST settlement independently from browser-envelope uncertainty.
- `retry_safe` requires: original POST definitively settled, successful authoritative recovery proving exact operation absent/uncommitted, and applicable authoritative deadline still open.
- Never expose retry after failed/withheld recovery or while POST may still commit.
- Add local read generation/sequence and monotonic lifecycle-state ordering across poll, recovery, mutation response, reconnect, and equal `serverTime` snapshots.
- Exact operation correlation remains authoritative in waiting states; countdown/in-progress with `viewerReady=true` confirms a lost ready response when correlation is unavailable.
- Forfeit confirmation requires exact persisted operation/outcome identity; otherwise terminal copy remains neutral and truthful.
- Preserve stable request IDs, zero automatic POST replay, single-flight reads, accessibility, Standard behavior, and route identity.
- Add component-level adversarial races for >35s POST, failed recovery, equal timestamps, stale terminal responses, unrelated terminalization, and dropped ready/forfeit responses.
- Run focused web tests, typecheck, production build, browser/console smoke, secret scan, and diff check.

No hosted mutation.
