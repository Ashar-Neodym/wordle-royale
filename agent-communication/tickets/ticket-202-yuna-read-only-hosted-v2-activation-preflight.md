# Ticket 202 — Read-Only Hosted V2 Activation Preflight

Agent: Yuna (operations)
Wave: V — Trusted Hosted V2 Activation
Status: Blocked on explicit read-only hosted preflight approval

## Scope

Use the reviewed local operator in dry-run/read-only mode against the exact Railway production project/environment/service and hosted database. Prove deployed SHA `6992ce1`, exact provider fleet and regions, immutable artifact, public readiness origin, fresh matching capability leases, operator schema/indexes, dictionary/reconciler health, authority `v1_open`, no incompatible active lifecycle work, and expected close/open confirmations.

Do not mutate provider settings, environment, database authority, audit rows, queue state, dictionary, or gameplay. Sanitize all output; never print credentials, URLs containing credentials, or raw provider payloads.

Return PASS/WARN/FAIL plus exact sanitized preflight evidence and rollback/no-write proof. Ticket 203 remains blocked.
