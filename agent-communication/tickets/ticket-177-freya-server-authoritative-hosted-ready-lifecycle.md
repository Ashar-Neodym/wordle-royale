# Ticket 177 — Server-Authoritative Hosted Ready Lifecycle

Agent: Freya (backend implementation)
Wave: U — Hosted Speed Ready Reliability
Status: Blocked on Ticket 176 and any required contract approval

## Goal

Implement Elisa's approved invitation/ready lifecycle with finite server-owned deadlines and reliable simultaneous ready behavior under hosted-shaped latency.

## Acceptance criteria

- No client receives an already-impractical ready deadline because queue response latency consumed it.
- Zero-ready invitation expiry and first-ready opponent expiry are distinct and exactly-once.
- Concurrent ready operations are atomic, idempotent, and do not self-deadlock or serialize beyond the finite request budget.
- Late requests fail with stable sanitized semantics; recovery reads converge.
- No client timestamp authority; immutable reveal/deadline pair remains exactly once.
- Add deterministic delayed/concurrent real-PostgreSQL coverage including 8–19 second shaped delay without sleeping wall-clock time.
- Preserve Standard, settlement, reconciler generation fencing, and spoiler safety.
- Run canonical and PostgreSQL gates.

No hosted mutation.
