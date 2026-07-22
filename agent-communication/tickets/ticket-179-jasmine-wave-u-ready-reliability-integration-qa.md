# Ticket 179 — Wave U Ready Reliability Integration QA

Agent: Jasmine (QA)
Wave: U — Hosted Speed Ready Reliability
Status: Blocked on Tickets 177–178

## Required checks

Independently verify real-PostgreSQL delayed concurrent joins/readies, invitation and first-ready deadlines, simultaneous acknowledgements, idempotency, reconnect, countdown, expiry/no-contest, forfeit, settlement/read convergence, Standard isolation, generation-fenced health, mutation uncertainty recovery, accessibility, spoiler safety, canonical gates, and cleanup.

Include repeated hostile boundary runs. Return PASS/WARN/FAIL. Ticket 180 remains blocked unless PASS.
