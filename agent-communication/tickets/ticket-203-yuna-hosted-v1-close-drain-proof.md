# Ticket 203 — Hosted V1 Close and Drain Proof

Agent: Yuna (operations)
Wave: V — Trusted Hosted V2 Activation
Status: Blocked on Ticket 202 PASS and explicit Approval A

## Scope

Revalidate Ticket 202 evidence immediately before mutation. Execute only the audited generation-fenced transition `v1_open -> closing_to_v2` with the exact confirmation required by the reviewed operator.

Then prove new Speed creation is closed, eligible v1 queue work is drained, no guarded creator remains in flight, all exact target leases acknowledge the closing generation, provider inventory remains exact, Standard remains available, and the immutable audit row exists. Do not open v2, change provider settings, alter dictionary data, or run gameplay smoke.

Return sanitized PASS/WARN/FAIL evidence. Stop safely closed on any uncertainty. Ticket 204 remains blocked until separate Approval B.
