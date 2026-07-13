# Athena Review — Wave R Ticket 126 QA Failure

Date: 2026-07-10
Verdict: Wave R is not checkpoint/deploy ready.

## Confirmed blockers

1. Concurrent cold-profile joins: `findOrCreateRatingProfile()` converts non-`P2002` errors, including Prisma `P2034` serialization failures, into `rating_profile_unavailable`, preventing the outer transaction retry.
2. Standard read-model drift: leaderboard/profile reads default to and filter on `placement_mmr_v1`, while queue-created Standard matches settle into `standard_1v1_glicko_v1`.
3. Queue reconnect UX: independent browser QA observed an indefinitely busy reconnect state; a bounded real-integration browser test is absent.

## Impact

- A legitimate second user may be rejected during simultaneous first queue entry.
- Players cannot see the rating that the Standard settlement path actually updates.
- The primary queue entry UI may remain unusable despite healthy API dependencies.

## Required loop

- Ticket 130: Freya fixes transaction retry propagation and adds real-Postgres concurrent cold-join coverage.
- Ticket 131: Ruby fixes authoritative Standard rating selection/read contracts and integration coverage.
- Ticket 132: Luna fixes bounded reconnect behavior and adds browser/client state coverage.
- Ticket 133: Jasmine independently rechecks the three blockers and canonical gates.

Ticket 127 remains blocked until Ticket 133 returns PASS. No PR, merge, migration deployment, or provider mutation is approved from the failed Ticket 126 result.
