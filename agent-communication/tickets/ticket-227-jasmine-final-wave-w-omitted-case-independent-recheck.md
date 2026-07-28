# Ticket 227 — Final Wave W Omitted-Case Independent Recheck

Agent: Jasmine (independent QA)
Wave: W-Fix — Ticket 223 blockers
Status: Blocked on Tickets 225–226 completion

Preserve Ticket 223's FAIL and independently rerun all five blockers plus its additional-evidence section.

## Backend acceptance

- different-ID already-ready after deadline returns current monotonic state without second mutation/restart;
- receipt-aware projection failures never claim a nonexistent acknowledgement;
- direct/meta/nested database/dependency classes traverse real rollback-capable ready flows with persistence assertions;
- projection-lock barrier proves lock release before projection;
- zero/multiple-round projection fails closed;
- D*=300ms hosted-latency HTTP `[201,201]`, exact persistence, unchanged budgets;
- timing/races/replay/cancellation/reconciler/settlement/Standard/spoiler gates pass.

## Web acceptance

- configured temporary unavailability renders unavailable, not disabled;
- malformed/minimal/duplicate/partial authority payloads reject;
- cross-origin redirects reject and actual response origin is verified;
- runtime shared-schema parsing and canonical service identity are enforced;
- committed browser matrix covers enabled/disabled/unavailable/revision/redirect/retry/direct leaderboard/Standard/mobile-zoom cases with zero console errors and no leaks.

Run canonical API/contracts/web/PostgreSQL/typecheck/build/security/diff gates. Return PASS/FAIL and explicitly authorize or block Ticket 224. No hosted access/write, commit, push, PR, deploy, or lifecycle/provider/dictionary mutation.
