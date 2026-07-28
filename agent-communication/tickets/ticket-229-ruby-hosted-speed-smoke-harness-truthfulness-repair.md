# Ticket 229 — Hosted Speed Smoke Harness Truthfulness Repair

Agent: Ruby
Status: Ready

Close every Ticket 228 independent-QA blocker without hosted/network access:

1. Runtime-validate result, both histories, both Speed profiles, Speed leaderboard, and Standard before/after baselines; prove exact expected match/mode/algorithm and exactly-once rating convergence instead of accepting HTTP 2xx only.
2. Verify terminal ticket/match cleanup through product read APIs; never set cleanup true unconditionally.
3. Recursively scan all accepted public payloads for forbidden answer/hash/salt/guess/secret-shaped keys and fail closed; evidence allowlisting alone is insufficient.
4. Require non-null immutable firstAck/deadline/start/round-deadline identities, prove two-ready transition, and enforce exact contract durations within explicit tolerance.
5. Require remaining invitation budget to exceed ready request timeout plus recovery reserve; enforce non-negative/exact countdown bounds.
6. Prove two distinct controlled actors via distinct session cookie/user identities, distinct tickets/participants, and one fresh shared match identity.

Expand deterministic tests so malformed opaque payloads fail and every above condition has a RED/GREEN case. Keep explicit one-lifecycle guard, no blind retries, fixed sanitized evidence, and exact committed routes/contracts.

Run focused tests, syntax, lint, typecheck, secret scan, and diff check. Do not source hosted env, access network/providers/GitHub, execute confirmed harness, commit, push, or open a PR.
