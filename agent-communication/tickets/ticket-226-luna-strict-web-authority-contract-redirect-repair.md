# Ticket 226 — Strict Web Authority Contract and Redirect Repair

Agent: Luna (web/contracts implementation)
Wave: W-Fix — Ticket 223 blockers
Status: Ready

## Scope

Close Ticket 223 web blockers W1–W3 and commit the missing browser/authority matrix.

## Required RED baselines

- configured Speed: `enabled=true`, `queueEnabled=false`, supported temporary-unavailability reason currently becomes authoritative disabled;
- minimal healthy-looking noncanonical fixture currently becomes authoritative enabled;
- configured-origin reads redirected to another origin currently remain authoritative.

## Repair requirements

- Treat only a coherent explicit configuration-disabled identity as `disabled`.
- Treat `enabled=true/queueEnabled=false`, supported temporary-unavailability reasons, runtime/lifecycle non-OK, contradictory booleans, duplicate Speed rows, partial dependencies, malformed revision/status/identity, and missing required authority fields as `unavailable`.
- Runtime-parse health, readiness, ranked-mode, and success-envelope payloads with shared schemas; TypeScript casts do not establish authority.
- Require canonical API service identity and exact authority-critical fields.
- Reject authority-read redirects or validate every actual final response origin against the configured canonical origin. Record the validated actual response origin; never copy configured origin as proof. Never forward cookies cross-origin.
- Fail closed on malformed/noncanonical successful HTTP responses with sanitized diagnostics.
- Commit unit/component/production-browser fixtures for enabled, explicit disabled, configured temporary-unavailable, malformed/minimal stub, duplicate mode, redirect, revision mismatch, partial-read recovery/retry, direct Speed leaderboard URL, Standard isolation, and mobile/zoom overflow.
- Preserve one credential-free origin, no production localhost fallback, no secret/spoiler/provider leakage, and unchanged Standard behavior.

Run web/contracts/API focused tests, typechecks, production build/browser matrix, workspace build, secret scan, and `git diff --check`. No hosted access/config mutation, lifecycle/provider/dictionary change, commit, push, PR, or deploy.
