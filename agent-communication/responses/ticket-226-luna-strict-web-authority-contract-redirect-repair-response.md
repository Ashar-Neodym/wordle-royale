# Ticket 226 — Strict Web Authority Contract and Redirect Repair Response

Agent: Luna implementation recovered and independently verified by Athena
Status: Complete candidate; ready for Ticket 227

## Repairs

- Authoritative health, readiness, ranked-mode, and success/error envelopes are runtime parsed with shared strict schemas.
- Canonical service identity, deployment revision agreement, complete dependency shape, exact mode cardinality, exact algorithm/lifecycle/time-control identity, and single-origin evidence are required.
- Explicit coherent configuration disablement is distinct from configured temporary unavailability, draining, degraded runtime, contradictory flags, and malformed authority.
- Authoritative reads use `redirect: 'manual'`, reject redirects, validate the actual `response.url` origin, and never make a second redirected credentialed request.
- Malformed/minimal/duplicate/partial/wrong-service/revision-skew payloads fail closed with sanitized unavailable diagnostics.
- Speed queue UI has separate `authority_unavailable` and `disabled` presentation paths; unavailable has a durable retry while Standard presentation remains isolated.
- Public health/readiness now expose one sanitized provider/source deployment revision used for web/API skew proof.

## Verification

- Web canonical tests: 56/56 PASS, including authority presentation, temporary-unavailable, malformed/duplicate/partial payloads, runtime parsing, and redirect/origin adversaries.
- Web typecheck: PASS.
- Contracts: 25/25 PASS.
- Contracts typecheck: PASS.
- API authority/deployment tests: 13/13 PASS.
- Full API: 234/234 PASS.
- API typecheck: PASS.
- Production web build: PASS.
- Workspace build: PASS.
- Secret scan: PASS over 298 files.
- `git diff --check`: PASS.

## Recovery note

The Luna subagent timed out before writing its response. Athena preserved and verified the candidate, completed an interrupted queue-copy extraction, and converted a non-portable CSS-importing React test into a canonical presentation-boundary regression. Real browser verification remains mandatory in Ticket 227.

## Safety

No hosted access, deployment, lifecycle/provider/dictionary change, commit, push, PR, merge, or gameplay write occurred.
