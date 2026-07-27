# Ticket 209 — Reconciler Hosted-Latency Red Acceptance Matrix

Agent: Jasmine (QA-first)
Wave: V-Runtime-Readiness
Status: Ready — reconcile provisional assumptions to completed Ticket 208

## Goal

Before implementation, define permanent executable red tests reproducing the hosted failure and adversarial invariants.

## Required matrix

- Existing 1s transaction/2s pass cannot become healthy when dependency/readiness latency exceeds the envelope.
- Empty due queue, due work, transient latency, transaction timeout, hung transaction, stale/late completion, restart epoch, overlapping ticks, backlog, and recovery.
- No readiness from stale or obsolete completion; no mutation after pass ownership expires.
- Deterministic maximum expiry lateness under the architecture constants.
- Standard remains available when Speed fails closed.
- Real CLI operator module resolves correctly via selected module context.

Commit permanent tests/fixtures only after Ticket 208 constants are reconciled; report the initial RED reproduction and final handoff contract. No production code change, hosted access, provider mutation, deployment, lifecycle transition, or merge.

Ticket 208 fixes batch size `10`, selection limit `11`, structured `hasMore` evidence, and the rule that a backlog pass cannot establish caught-up readiness. Add dependency-minimal spies proving a pass does not call product readiness, database/schema probes, dictionary readiness, activation, leases, provider inventory, Redis, or HTTP.
