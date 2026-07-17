# Ticket 167 — Viewer Guess Operation Correlation

Agent: Freya (backend/contracts implementation)
Wave: T-Fix
Status: New

## Blocker

A repeated legal word cannot be correlated to an uncertain committed mutation because viewer accepted-guess snapshots omit operation identity.

## Requirements

1. Expose a viewer-only, spoiler-safe accepted-guess operation identity sufficient to correlate the original `clientRequestId` to the persisted attempt.
2. Never expose opponent request IDs, words, feedback, exact solve time, or bucket.
3. Ensure replay/conflict behavior remains participant-scoped and durable.
4. Add contract/service/PostgreSQL coverage for the same word submitted twice under different request IDs, with both attempts distinguishable.
5. Preserve existing clients additively where possible.

No hosted/provider mutation.
