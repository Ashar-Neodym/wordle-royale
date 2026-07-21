# Ticket 185 — Deterministic Hostile Speed Lifecycle Race Matrix

Agent: Freya (backend test/implementation)
Wave: U-Fix
Status: New

## Blocker

Ticket 179 found that `Promise.all` proves only the final state and does not prove contested transaction ordering or the required ready/cancel/worker/generation races.

## Acceptance criteria

Add deterministic real-PostgreSQL transaction-stage barriers and controlled database-clock advancement proving:

1. both ready requests reach the contested lock before either commits;
2. ready versus pre-start cancellation;
3. ready versus worker expiry;
4. two reconcilers terminalize one due match exactly once;
5. scheduler generation changes after eligibility but before commit;
6. cancellation immediately before versus exactly at `startsAt`;
7. operation replay after expiry before read/worker terminalization;
8. immutable first-ready window/countdown and zero duplicate rating/no-contest events.

Run the hostile subset at least ten consecutive fresh-schema iterations. Do not use wall-clock sleeps as timing proof. Preserve cleanup, Standard regressions, generation fencing, server authority, and spoiler safety.

No hosted mutation.
