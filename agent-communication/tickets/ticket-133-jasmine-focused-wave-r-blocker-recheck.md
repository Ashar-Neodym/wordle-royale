# Ticket 133 — Focused Wave R Blocker Recheck

Agent: Jasmine (QA)
Wave: R-Fix — Ticket 126 blocker remediation
Status: New after Tickets 130–132

## Task

Independently recheck the three blockers from Ticket 126. The original FAIL remains authoritative until this ticket passes.

## Required evidence

1. Fresh-schema real-Postgres concurrent cold-profile joins: both users succeed/recover and pair exactly once; no masked `P2034`, self-match, or duplicate match.
2. Complete one Standard match and prove leaderboard, profile summary/ratings, and history all expose the same `standard_1v1_glicko_v1` result.
3. Real browser/session `/play` reconnect settles from busy to idle/searching/matched/error within a bounded interval; exercise queued refresh and matched routing.
4. Run canonical gates:

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
CI=true pnpm smoke:api:prod-start
CI=true pnpm smoke:local
CI=true pnpm deps:check
CI=true pnpm secret-scan
git diff --check
```

## Verdict

Return PASS/WARN/FAIL with exact evidence. Do not push, create a PR, merge, deploy, or mutate provider resources. Ticket 127 remains blocked unless this recheck is PASS.
