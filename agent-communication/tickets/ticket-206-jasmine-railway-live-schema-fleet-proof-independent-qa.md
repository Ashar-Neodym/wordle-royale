# Ticket 206 — Railway Live-Schema Fleet-Proof Independent QA

Agent: Jasmine (QA)
Wave: V-Provider-Compatibility
Status: Blocked on Ticket 205

## Required checks

Independently verify the permanent sanitized Railway 5.27.1 live fixture and adversaries:

- null status replica count + one RUNNING + one REMOVED + regional configured count one passes exact proof;
- present numeric count still cross-checks region sum, RUNNING count, and expected count;
- missing/empty/zero/negative regional config, all removed, extra/missing/duplicate RUNNING IDs, unknown/transitional/failed status, rollout overlap, extra success, and contradictory counts fail closed;
- proof binds exact serving replica ID and region allocation;
- recognized provider errors remain sanitized and stable;
- canonical provider/operator/PostgreSQL/API/contracts/build/security gates pass.

Return PASS/WARN/FAIL. No hosted access, provider mutation, deployment, lifecycle transition, or merge.
