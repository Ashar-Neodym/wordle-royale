# Ticket 195 — Operator-Bound Railway Inventory Verifier

Agent: Freya (implementation)
Wave: V — Trusted Hosted V2 Activation
Status: Complete — local implementation, verification, and independent review PASS; no hosted operation performed

## Goal

Implement Ticket 194's trusted operator-bound Railway inventory proof and activation tooling without a public transition endpoint or a long-lived Railway credential in the hosted API.

## Acceptance criteria

- Verify immutable target release, serving deployment/replica inventory, prior-deployment absence, proof freshness/anti-replay, exact fresh capability leases, protocol/version support, observed generation, queue drain, schema/dictionary/reconciler health.
- Reuse database transition guards/CAS and never duplicate weaker activation logic.
- Default to read-only/dry-run; mutation requires an explicit command and expected generation/release/replica inputs.
- Separate close/drain and open-v2 commands; never chain them blindly.
- Fail closed on missing auth, ambiguous provider data, stale/extra leases, release mismatch, undrained queue, stale generation, timeout, or partial response.
- Emit sanitized audit evidence; never print tokens, database URLs, user IDs, dictionary answers, or spoilers.
- Add mocked provider and disposable PostgreSQL tests covering stale/mixed deployments, replica mismatch, replay, concurrent creation barrier, drain, CAS, rollback, and Standard isolation.
- No hosted mutation or provider configuration change.
