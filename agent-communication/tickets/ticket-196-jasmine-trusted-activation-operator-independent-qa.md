# Ticket 196 — Trusted Activation Operator Independent QA

Agent: Jasmine (QA)
Wave: V — Trusted Hosted V2 Activation
Status: Blocked on Ticket 195

## Required checks

Independently test provider-inventory parsing, immutable release/replica proof, freshness/anti-replay, exact lease cardinality, generation acknowledgement, queue drain, close/open separation, concurrent creator barriers, stale/extra/old deployment rejection, rollback, missing credentials, sanitized evidence, Standard isolation, and no public activation endpoint.

Use mocked Railway responses plus fresh disposable PostgreSQL hostile tests for at least ten clean runs. Confirm read-only/dry-run default and that no hosted provider/database state changes. Run full API/contracts/build/typecheck/Prisma/workspace/security/diff gates and cleanup. Return PASS/WARN/FAIL.
