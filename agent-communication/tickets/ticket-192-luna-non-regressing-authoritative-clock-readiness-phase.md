# Ticket 192 — Non-Regressing Authoritative Clock and Readiness Phase

Agent: Luna (web implementation)
Wave: U-Fix-3
Status: New

## Blockers

Ticket 191 proved:

1. An accepted delayed/progressive response can re-anchor authoritative server time behind the existing monotonic lower bound and reopen an already-closed retry deadline.
2. Equal-time same-state snapshots can carry a contradictory/regressive `readiness.phase` if another field appears progressive.

## Acceptance criteria

- Maintain one non-decreasing authoritative server-time lower bound per match/round.
- At response receipt, derive effective time as at least `max(incoming serverTime, anchoredServerNow(previousAnchor, receiptMonotonicTime))`, or reject the stale anchor-changing response.
- Never reopen a deadline already proven closed, at render or immediately before dispatch, including delayed-in-transit responses, tab suspension, reconnect, mutation response, recovery, and poll races.
- Preserve the effective lower bound across accepted responses without altering immutable server deadlines or claiming extra time.
- Include `readiness.phase` in monotonic/identity rules. Reject contradictory phase/state combinations and regressions even when ready count or another field increases.
- Add checked-in helper/component tests for the exact Ticket 191 probes, exact deadline equality, forced late dispatch, all valid phase transitions, and invalid cross-field combinations.
- Preserve request IDs, retry proof prerequisites, zero automatic mutation replay, generation fencing, accessibility, Standard isolation, and spoiler safety.
- Run focused/full web tests, typecheck, production build/browser-console smoke, workspace/security/diff checks.

No hosted mutation.
