# Ticket 131 — Authoritative Standard Rating Read Models

Agent: Ruby (rating/backend implementation)
Wave: R-Fix — Ticket 126 blocker remediation
Status: New

## Blocker

Standard matches settle `standard_1v1_glicko_v1` profiles, but leaderboard/profile reads default to and filter on `placement_mmr_v1`, returning stale 1500/0-game values.

## Requirements

- Establish one explicit authoritative algorithm/version mapping per ranked mode.
- For live `standard_1v1`, leaderboard, rated profile, profile ratings, profile summary, and relevant contracts must select and identify `standard_1v1_glicko_v1`.
- Do not expose Speed/Classic/Multiplayer as live settlement algorithms.
- Resolve legacy active-profile coexistence safely: prefer an explicit read mapping and document whether a migration/status change is required; do not destructively rewrite historical events.
- Update web/API contract types that incorrectly hard-code `placement_mmr_v1`.
- Add a real integration test: settle Standard match, then assert leaderboard/profile/history agree on rating, games, delta, algorithm, and version.
- No hosted mutation.

## Verification

```bash
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm --filter @wordle-royale/contracts test
CI=true pnpm --filter @wordle-royale/web build
CI=true pnpm build
CI=true pnpm secret-scan
git diff --check
```
