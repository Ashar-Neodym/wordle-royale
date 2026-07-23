# Ticket 199 — Exact Railway Fleet Proof, Safe Command Serialization, and Public-Origin Fencing

Agent: Freya (backend/operator implementation)
Wave: V-Fix
Status: New

## Ticket 196 blockers

Close all four trusted-provider boundary defects as one coherent proof-model change:

1. Active target instances must be complete, successful, uniquely/non-blank identified, and exactly equal to authoritative `numReplicas`.
2. A timed-out Railway command must be killed and awaited, or keep the adapter-wide gate held until actual settlement; no later observation may overlap it.
3. Readiness fetches must reject localhost, unspecified, loopback, link-local, RFC1918/private, metadata, and equivalent IPv4/IPv6 forms before network I/O.
4. Preserve canonical Railway regional allocation in observation/proof/digest and require exact per-region lease cardinality using persisted `providerRegion`.

## Acceptance criteria

- Add empty/under/over/duplicate/blank active-instance fixtures and prove all fail closed.
- Bind canonical distinct replica IDs and canonical region allocation to the observation, inventory digest, proof, transaction query, and audit evidence.
- Select/validate lease `providerReplicaId` and `providerRegion`; reject missing, duplicate, unexpected, wrong-region, or distribution-mismatched sets.
- Define cancellable executor ownership. On timeout, terminate the exact child, await exit, retain serialization until settlement, and prevent late output/state from authorizing later proof. Add cancellation-ignoring/hung executor adversaries with max concurrency exactly one.
- Reject dangerous hostnames and literal/encoded/equivalent IPv4 and IPv6 addresses before `fetch`; DNS/rebinding behavior must fail closed according to Ticket 194's public provider-origin contract. Prove fetch is never called for rejected targets.
- Preserve strict CLI schema/version/scope, proof freshness/anti-replay, close/open separation, dry-run zero writes, atomic audit/CAS, Standard isolation, sanitization, and no public endpoint.
- Add official unit, mocked-provider, and ten-run fresh PostgreSQL hostile tests for the exact Ticket 196 probes.
- Run full API/contracts/build/typecheck/Prisma/workspace/security/diff gates and cleanup.

No hosted provider/database access or mutation, activation, deployment, PR, or merge.
