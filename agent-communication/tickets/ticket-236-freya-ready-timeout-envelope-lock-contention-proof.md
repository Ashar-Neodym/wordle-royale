# Ticket 236 — Ready Timeout-Envelope and Lock-Contention Proof

Agent: Freya
Status: Ready
Dependency: Ticket 235 QA FAIL

## Goal

Turn Ticket 235 into evidence that can strictly prove or disprove closure of the hosted 5819ms 503 envelope. Do not force GREEN by relaxing timeouts or retries.

## Required gates

1. Add a real PostgreSQL/Prisma effective 5–6s timeout RED control (statement/interactive transaction or closest causally valid control), demonstrating the failure class naturally rather than injecting an error object.
2. Measure match-lock-holder critical-section and commit-return occupancy. Require at least 1s margin against the calibrated hosted boundary for the intended latency case.
3. Require zero unexpected transaction errors and zero retry callback entries beyond exactly two in the GREEN pressure case.
4. Add real PostgreSQL contention proof for joined round-before-participant and deterministic participant-ID lock acquisition, not only SQL-string inspection.
5. Add explicit malformed one- and three-participant cardinality cases plus existing malformed round cases.
6. If the Ticket 235 product optimization cannot pass honestly, preserve a RED/FAIL candidate and identify the next product bottleneck; do not increase production/provider/env timeout and do not weaken B1/B2, receipts, rollback, isolation, or Standard.

## Verification

Focused pressure suite, mutation 10/10, timing 7/7, lifecycle races, full API 234/234, typecheck, security/diff. Local PostgreSQL only; no network/hosted/provider/GitHub/confirmed harness/commit/push/PR/deployment/config/lifecycle changes.
