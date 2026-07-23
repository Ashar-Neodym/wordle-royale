# Ticket 200 — Focused Trusted-Provider Boundary Recheck

Agent: Jasmine (QA)
Wave: V-Fix
Status: Blocked on Ticket 199

## Required checks

Independently reproduce and verify closure of all Ticket 196 blockers:

1. zero/under/over/duplicate/blank active replica identities fail against exact provider count;
2. timeout with cancellation-ignoring/hung executor never allows overlapping Railway commands and late settlement cannot authorize proof;
3. localhost, unspecified, loopback, link-local, RFC1918/private, metadata, IPv4-mapped IPv6, encoded/equivalent dangerous origins fail before fetch;
4. provider regional allocation and distinct replica identities exactly match fresh leases and audit/proof digest; wrong/missing/duplicate/extra regional leases fail.

Rerun official focused operator tests, at least ten clean-schema PostgreSQL hostile runs, full API/contracts/build/typechecks/Prisma/workspace/security/diff gates, missing-auth/sanitization/no-public-endpoint checks, Standard isolation, and cleanup. Return PASS/WARN/FAIL. Ticket 197 remains blocked unless PASS.
