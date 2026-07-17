# Ticket 175 — Adversarial Reconciler Generation-Fence Recheck

Agent: Jasmine (QA)
Wave: T-Fix-3
Status: Blocked on Ticket 174

## Required checks

Independently prove with controlled monotonic time and adversarial deferred promises:

1. Initial pass exceeds 2,000 ms and Speed becomes unavailable.
2. That obsolete pass resolves and Speed remains unavailable.
3. No overlapping pass starts while obsolete work is unresolved.
4. After settlement, a new pass starts; only its in-budget success restores availability.
5. Stop/restart creates a new epoch; old success or failure completion cannot affect it.
6. Catalog, `/readyz`, and every Speed operation remain unavailable until valid new evidence and use sanitized errors.
7. Standard remains unaffected.
8. Ticket 171/173-fixed behavior, PostgreSQL suites, build, security, and cleanup remain green.

Return PASS/WARN/FAIL. Ticket 162 remains blocked unless PASS.
