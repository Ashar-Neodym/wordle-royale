# Ticket 174 — Generation-Fenced Speed Reconciler Completion

Agent: Freya (backend implementation)
Wave: T-Fix-3
Status: New

## Blocker

Ticket 173 proved a reconciliation pass that already exceeded its 2,000 ms budget can later resolve and call `markPassSucceeded()`, reviving Speed without a new valid pass. Existing Ticket 172 tests incorrectly expect this behavior.

## Requirements

1. Create a scheduler epoch on every start/restart and invalidate it on stop.
2. Assign a unique generation/token to each reconciliation pass.
3. Require pass identity on success/failure completion updates.
4. Accept completion evidence only when it belongs to the current scheduler epoch, is the current pass, scheduler remains active, and elapsed age is within the maximum pass budget.
5. Timed-out, stopped, superseded, or previous-epoch completion must clear/settle single-flight state but cannot update success freshness or revive readiness.
6. Preserve single-flight behavior while obsolete work remains unresolved; do not start overlapping passes.
7. After obsolete work settles, require a newly started in-budget successful pass before Speed becomes available.
8. Ensure shutdown/start races and late failure callbacks cannot corrupt the new epoch.
9. Keep catalog, `/readyz`, and all Speed operations unavailable through the existing sanitized contract until valid new success.
10. Standard remains unaffected.
11. Replace the incorrect Ticket 172 expectations and add deterministic regressions for timeout→late resolve→still unavailable→new success→available, stop/restart old completion fencing, no overlap, and late failure.
12. Run focused/full API, contracts, build, security, Speed PostgreSQL, deterministic timing, and Standard PostgreSQL suites.

No hosted/provider mutation.
