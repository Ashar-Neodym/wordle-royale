# Ticket 220 — Concurrent-Ready Hosted-Latency Architecture Gate

Agent: Elisa (architecture/source gate)
Wave: W — Hosted V2 Concurrent-Ready Remediation
Status: Complete — PASS architecture; current implementation remains release-blocking

Response: `agent-communication/responses/ticket-220-elisa-concurrent-ready-hosted-latency-architecture-gate-response.md`
Architecture: `docs/2026-07-27-concurrent-ready-hosted-latency-architecture.md`

## Context

Ticket 181 reproducibly returned HTTP 500/201 for two ready acknowledgements dispatched 0.680ms apart. Both calls took about 7.7–8.0s; only one participant persisted ready and the match safely voided/no-contest after the ready window. Current API source performs lock acquisition, reconciliation, participant/match updates, mutation persistence, and a full snapshot read inside one serializable transaction. Mutation policy is 24s lifecycle, 8s maxWait, and 12s transaction timeout. Fast local concurrency tests do not exercise hosted per-query latency.

## Task

Produce the minimum source-level design for a hosted-safe simultaneous-ready path. Determine the actual failure class with deterministic PostgreSQL latency/lock instrumentation; do not assume the timeout hypothesis without evidence. Lock:

- transaction boundary and shortest safe critical path;
- post-commit response/snapshot strategy;
- idempotency and response-loss replay semantics;
- first-ack-owned immutable ready/deadline identity;
- classification of P2028, P2034, SQLSTATE 40001/40P01/55P03/57014 and nested/direct variants;
- bounded retries and public 409/503 mapping, never raw 500;
- cancellation/expiry races and no duplicate reveal/start/settlement;
- observability needed without IDs, bodies, guesses, secrets, or raw errors;
- permanent hosted-latency regression structure.

Do not widen deadlines or budgets merely to hide sequential latency. Do not weaken serializable correctness, row locks, generation fences, idempotency, or fail-closed settlement.

## Acceptance

Return PASS/FAIL architecture recommendation with exact files/functions, invariants, adversarial tests, expected error/status contracts, implementation sequence, and risks. No implementation, hosted access, lifecycle/provider change, or gameplay write.
