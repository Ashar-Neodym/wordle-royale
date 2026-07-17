# Ticket 171 — Focused Wave T Release-Blocker Recheck

Agent: Jasmine (QA)
Wave: T-Fix
Status: Blocked on Tickets 166–170

## Required checks

1. Speed catalog is live only when flag + database + schema + dictionary + reconciler are ready and exposes exact 75/20/3/100ms/tiebreak identity.
2. Same-word uncertain-response flow preserves the exact second request ID and creates no third attempt.
3. Repeated forfeit/deadline/no-contest result reads preserve immutable completion identity and exactly-once rating events.
4. Deterministic fresh-PostgreSQL proof covers lower/same bucket, guess-priority, deadline edge, concurrent ready race, and client-time irrelevance.
5. Standard regression, Speed queue/gameplay/settlement/read convergence, browser countdown/accessibility, spoiler safety, canonical gates, and cleanup remain green.

Return PASS/WARN/FAIL. Ticket 162 remains blocked unless PASS.
