# Ticket 166 — Fail-Closed Speed Catalog and Locked Identity

Agent: Freya (backend implementation)
Wave: T-Fix
Status: New

## Blocker

`/ranked/modes` advertises Speed from the feature flag alone and omits approved time-control identity. It can claim live while database/schema/dictionary/reconciler readiness is unavailable.

## Requirements

1. Create/reuse one authoritative Speed operational-readiness source covering feature flag, database, migrated schema, qualifying dictionary, and expiry reconciler health.
2. Make `/ranked/modes` report Speed `enabled=false` and `queueEnabled=false` whenever any dependency is unavailable.
3. Keep create/current/read/cancel/ready/guess/forfeit paths fail-closed with stable sanitized unavailable responses under the same source.
4. Expose and contract-test `roundTimeSeconds=75`, `readyWindowSeconds=20`, `countdownSeconds=3`, `solveTimeBucketMs=100`, and `tieBreaker=server_solve_time_bucket`.
5. Add separate regressions for database, schema, dictionary, reconciler, and flag failure.
6. Preserve Standard and readiness behavior.

No hosted/provider mutation.
