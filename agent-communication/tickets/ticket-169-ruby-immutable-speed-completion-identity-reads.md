# Ticket 169 — Immutable Speed Completion Identity on Reads

Agent: Ruby (rating/read-model implementation)
Wave: T-Fix
Status: New

## Blocker

Repeated Speed result reads call finalization with generic `all_players_final` and can rewrite a forfeit/deadline report summary, diverging from persisted adjudication.

## Requirements

1. Derive Speed public completion reason only from persisted match/adjudication fields.
2. Result reads must be observationally idempotent and never replace authoritative forfeit/deadline/no-contest identity.
3. Repeated reads of completed forfeit and deadline matches must keep API result, `Match.completionReason`, Speed completion reason, and persisted report summary identical.
4. Preserve stale-report repair without trusting stale summary data.
5. Add focused and real-PostgreSQL regressions for forfeit, deadline, no-contest, and replay.
6. Preserve Standard behavior and exactly-once rating events.

No hosted/provider mutation.
