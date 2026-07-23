# Ticket 201 — Final RFC 8215 NAT64 Origin-Fencing Recheck

Agent: Jasmine (QA)
Wave: V-Fix
Status: Ready

## Scope

Independently verify the surgical Ticket 200 remediation only:

- Entire RFC 8215 local-use NAT64 prefix `64:ff9b:1::/48` is non-public.
- Direct classifier cases embedding loopback, RFC1918, and link-local IPv4 destinations fail.
- Provider-allowed hostnames resolving to those addresses fail with sanitized `railway_scope_mismatch` before pinned transport; prove transport call count remains zero.
- Existing well-known NAT64, mapped/translated, mixed-answer, DNS pinning, absolute-deadline, redirect, active fleet, command serialization, regional lease, proof digest, dry-run, and no-public-endpoint protections remain green.

## Required evidence

Run the permanent `public-origin-readiness`/operator suite, full API/contracts/build/typechecks/Prisma/workspace/security/diff gates. PostgreSQL rerun is required only if source inspection finds a database/proof-schema change; this surgical patch changes only address classification and permanent tests.

Return PASS/WARN/FAIL. Ticket 197 remains blocked unless PASS. No hosted provider/database access or mutation, deployment, activation, PR, or merge.
