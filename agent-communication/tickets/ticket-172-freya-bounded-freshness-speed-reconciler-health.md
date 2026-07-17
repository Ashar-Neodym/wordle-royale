# Ticket 172 — Bounded Freshness-Aware Speed Reconciler Health

Agent: Freya (backend implementation)
Wave: T-Fix-2
Status: New

## Blocker

Ticket 171 proved reconciler health is a process-lifetime boolean. After one success, a later never-resolving `reconcileDue()` leaves Speed catalog and operations live indefinitely.

## Requirements

1. Replace the boolean with monotonic freshness evidence: scheduler active/heartbeat, last successful completion, in-flight start, and pass generation/state.
2. Lock and document cadence, maximum pass duration, and freshness TTL; validate their ordering and keep them finite.
3. Startup remains unavailable until a successful completed pass.
4. Explicit failure immediately marks unavailable.
5. A pass exceeding its maximum duration marks unavailable even if its promise never settles.
6. Missing scheduler heartbeat or stale last success marks unavailable.
7. Late completion from an obsolete/timed-out generation cannot revive health incorrectly.
8. Define safe recovery: after the stalled pass settles or is safely cancelled, a new successful pass restores availability without process-lifetime false state. Do not create unbounded overlapping reconciliation work.
9. `/ranked/modes`, `/readyz`, and every Speed operation continue using the same sanitized `speed_1v1_unavailable` path.
10. Standard remains unaffected.
11. Add fake-monotonic-clock regressions for success, explicit failure, never-resolving pass, scheduler stop, late obsolete completion, and recovery success.
12. Run full API/contracts/build plus Speed and Standard PostgreSQL harnesses.

No hosted/provider mutation.
