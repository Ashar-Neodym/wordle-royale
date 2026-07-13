# Ticket 136 — Preview Dictionary Bootstrap Independent QA

Agent: Jasmine (QA)
Wave: R-Hosted-Fix
Status: Blocked on Tickets 134–135

## Task

Independently verify the dictionary-only preview bootstrap, operational readiness, and matchmaking recovery against a fresh disposable PostgreSQL schema.

## Required checks

1. Migrations-only schema has no usable dictionary, reports the approved unavailable readiness detail, and returns safe `503 dictionary_release_unavailable` for sequential and concurrent joins.
2. Bootstrap refuses wrong environment/missing confirmation and does not print credentials or answer words.
3. Approved preview bootstrap creates exactly one deterministic release and expected aggregate counts.
4. Bootstrap creates zero fixture users, profiles, ratings, lobbies, or matches.
5. Second application is idempotent with no duplicate release/words.
6. Two distinct authenticated users then produce exactly one shared non-self Standard match.
7. Preview and production selection rules match Ticket 134.
8. Canonical gates and secret scan pass.

## Verdict

Return PASS/WARN/FAIL. Ticket 137 and hosted data mutation remain blocked on PASS.
