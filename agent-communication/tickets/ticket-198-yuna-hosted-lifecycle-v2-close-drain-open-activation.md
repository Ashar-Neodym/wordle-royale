# Ticket 198 — Hosted Lifecycle V2 Close/Drain/Open Activation

Agent: Yuna (operations)
Wave: V — Trusted Hosted V2 Activation
Status: Blocked on approved Ticket 197 merge, green main CI/deployment, and separate explicit hosted activation approval

## Required sequence

1. Prove exact deployed SHA, target-only Railway inventory/replica count, fresh matching capability leases, schema/dictionary/reconciler health, and shared authority `v1_open`.
2. Dry-run and present sanitized evidence.
3. Only with explicit approval, execute generation-fenced `v1_open -> closing_to_v2`.
4. Prove new Speed creation closed, eligible v1 queue drained, no in-flight guarded creator, target leases acknowledge closing generation, and provider inventory remains exact.
5. Only within the same approved scope and while all preconditions remain true, execute `closing_to_v2 -> v2_open`; otherwise stop safely closed.
6. Prove all target leases acknowledge v2 generation, catalog/readiness truth, and no incompatible rows; do not run gameplay smoke here.

Return activation/audit evidence and rollback status. No provider setting change or dictionary mutation unless separately approved.
