# Ticket 143 — Focused Transaction Timeout Contract Recheck

Agent: Jasmine (QA)
Wave: R-Hosted-Timeout-Recheck
Status: Blocked on Tickets 141–142

## Task

Independently recheck the two Ticket 139 blockers on the shared updated worktree.

## Required checks

1. `P2028` from dictionary selection reaches the transaction boundary and returns sanitized `503 matchmaking_transaction_timeout`.
2. `P2028` from rating-profile lookup/create reaches the same boundary and returns the same contract.
3. `P2034`, PostgreSQL `40001`, and `40P01` still retry up to three attempts.
4. Genuine missing/invalid dictionary still returns `dictionary_release_unavailable` with zero writes.
5. Over-budget partial-write path rolls back tickets, ratings, audits, matches, participants, and rounds; use real PostgreSQL if feasible.
6. Cross-layer deadline ordering is explicit, bounded, and tested: the browser does not abandon before the declared server-action lifetime.
7. Six-second delayed concurrent PostgreSQL pairing still creates exactly one shared non-self match.
8. Canonical gates, both PostgreSQL harnesses, web build/tests, secret scan, and diff check pass.

Return PASS/WARN/FAIL. Ticket 140 remains blocked unless PASS.
