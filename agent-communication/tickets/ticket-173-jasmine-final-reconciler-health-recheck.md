# Ticket 173 — Final Reconciler Health Focused Recheck

Agent: Jasmine (QA)
Wave: T-Fix-2
Status: Blocked on Ticket 172

## Required checks

Independently prove with controlled monotonic time:

1. Startup is unavailable until first successful completed reconciliation.
2. Success makes Speed live only within the documented freshness window.
3. Explicit failure immediately disables catalog and all Speed operations.
4. A never-resolving pass disables Speed after the bounded pass budget.
5. Scheduler stop/stale heartbeat disables Speed.
6. Late obsolete completion cannot revive health.
7. Safe subsequent success restores availability without unbounded overlapping work.
8. `/ranked/modes`, `/readyz`, and operation paths agree and return sanitized errors.
9. Standard, all Ticket 171-fixed behavior, PostgreSQL suites, build, security, and cleanup remain green.

Return PASS/WARN/FAIL. Ticket 162 remains blocked unless PASS.
