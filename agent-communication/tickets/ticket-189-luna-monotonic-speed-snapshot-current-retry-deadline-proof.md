# Ticket 189 — Monotonic Speed Snapshot and Current Retry-Deadline Proof

Agent: Luna (web implementation)
Wave: U-Fix-2
Status: New

## Blockers

Ticket 188 proved two remaining frontend defects:

1. Same-phase snapshots with equal `serverTime` can regress `readyCount`, `viewerReady`, operation correlation, or accepted-guess progress.
2. Retry-safe checks the recovery snapshot's historical `serverTime`, so the deadline may be expired when the affordance appears or is clicked.

## Acceptance criteria

- Define deterministic monotonic snapshot ordering within equal-time/equal-phase responses.
- Reject regressions in ready count, viewer-ready state/time/operation identity, accepted-guess count/operation set, starts/deadline identity, and terminal truth.
- Preserve cross-phase and local request-generation fencing; do not invent progress from client state.
- Anchor authoritative `serverTime` to monotonic receipt time and evaluate deadline openness at affordance-render time and immediately before dispatch.
- A retry cannot dispatch at/after the anchored authoritative deadline; stable operation ID and definitive original-POST settlement/absence proof remain mandatory.
- Delayed UI rendering, tab suspension, stale recovery response, equal timestamps, and late click tests must fail closed.
- Add focused helpers plus component/browser adversarial tests for all readiness/gameplay/terminal tie-breakers and current-time retry checks.
- Preserve no automatic mutation replay, single-flight reads, accessibility, Standard isolation, and spoiler safety.
- Run focused web/full build/typecheck/security/diff/browser-console checks.

No hosted mutation.
