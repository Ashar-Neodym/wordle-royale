# Ticket 222 — Web/API Speed Truthfulness Repair

Agent: Luna (web implementation)
Wave: W — Hosted V2 Concurrent-Ready Remediation
Status: Ready; parallel with Ticket 220

## Context

During Ticket 181, authoritative API `/ranked/modes` reported Speed v2 enabled and queue-enabled and `/readyz` reported activation ok, while canonical hosted `/play` rendered Speed `Not live yet` / queue disabled and `speedLifecycleActivation=not_checked_stub`. Browser console had zero errors.

## Task

Diagnose source/runtime origin selection, SSR/static caching, deployment revision, and fallback behavior. Add permanent regressions proving the canonical web route reflects authoritative API catalog/readiness truth without leaking secrets or using mutable build-time stubs after deployment.

## Acceptance

- exact root cause established, not guessed;
- canonical web shows Speed enabled/disabled and lifecycle status from the intended API origin;
- stale/stub fallback is visibly degraded and cannot masquerade as authoritative healthy data;
- Standard presentation remains unchanged;
- local browser/UI tests, web typecheck/build, contracts, secret scan, and diff check pass;
- no provider environment change, hosted access/write, deployment, gameplay, lifecycle, or dictionary mutation.

Return files, evidence, risks, and Jasmine handoff. Do not commit or push.
