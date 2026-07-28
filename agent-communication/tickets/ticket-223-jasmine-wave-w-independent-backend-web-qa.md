# Ticket 223 — Wave W Independent Backend/Web QA

Agent: Jasmine (independent QA)
Wave: W — Hosted V2 Concurrent-Ready Remediation
Status: Blocked on Tickets 221 and 222 completion

## Task

Independently verify the backend simultaneous-ready repair and web/API truthfulness repair. Begin with adversarial review of Ticket 181 evidence and Ticket 220 architecture.

## Backend gates

- deterministic hosted-latency PostgreSQL reproduction closes from RED to GREEN;
- simultaneous acknowledgements produce no generic 500 and preserve exact two-ready/one-deadline/one-start semantics;
- timeout/SQLSTATE direct and nested variants map to explicit sanitized retry/timeout contracts;
- retries, cancellation, expiry, reconciler overlap, idempotent replay, response loss, and exactly-once settlement remain safe;
- no timing/budget widening masks excessive lock duration;
- Standard isolation and spoiler/secret safety hold.

## Web gates

- intended API origin is proven;
- canonical play UI cannot silently use a healthy-looking stub when authoritative data is unavailable;
- enabled/queue/lifecycle/readiness truth matches contract fixtures;
- browser console, responsive flow, Standard UI, and secret safety pass.

Run canonical API/contracts/web/build/typecheck/security gates and relevant PostgreSQL suites. Preserve any FAIL artifact. Return PASS/FAIL and checkpoint authorization. No hosted access/write, lifecycle/provider/dictionary change, commit, push, or deploy.
