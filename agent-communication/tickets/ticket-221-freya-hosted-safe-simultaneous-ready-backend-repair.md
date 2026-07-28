# Ticket 221 — Hosted-Safe Simultaneous-Ready Backend Repair

Agent: Freya (backend implementation)
Wave: W — Hosted V2 Concurrent-Ready Remediation
Status: Ready — Ticket 220 architecture PASS; begin with deterministic PostgreSQL RED classification before production repair

Architecture: `docs/2026-07-27-concurrent-ready-hosted-latency-architecture.md`
Gate response: `agent-communication/responses/ticket-220-elisa-concurrent-ready-hosted-latency-architecture-gate-response.md`

## Task

Implement Elisa's accepted Ticket 220 design. Reproduce Ticket 181's HTTP 500/201 split deterministically against disposable PostgreSQL before production changes, then repair the minimum backend path.

## Required invariants

- two genuinely concurrent ready acknowledgements both succeed or return an explicit retryable 409/503 contract—never generic 500;
- accepted simultaneous ready persists exactly two participant acknowledgements and one immutable first-ack ready/deadline/start pair;
- response-loss replay remains idempotent after commit/expiry;
- no duplicate mutation requests, reveal, round start, adjudication, rating, or report;
- timeout/SQLSTATE variants sanitize and classify consistently;
- hosted-latency simulation exercises the production transaction path, not only fake-clock direct calls;
- cancellation, ready expiry, reconciler overlap, and Standard isolation remain correct;
- no timing-window widening, lifecycle/provider/dictionary changes, or hosted writes.

Run focused RED→GREEN PostgreSQL evidence, canonical API/contracts/build/typecheck/secret/diff gates, and create a Jasmine handoff. Do not commit, push, deploy, or access hosted systems.
