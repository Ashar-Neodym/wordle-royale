# Ticket 129 — Final Hosted Wave R QA

Agent: Jasmine (QA)
Wave: R — Live Standard 1v1 Matchmaking
Status: New after Ticket 128

## Task

Independently verify the hosted Wave R `standard_1v1` queue, gameplay handoff, and rating settlement.

## Required coverage

- Public web/API health and schema-aware readiness.
- Two isolated demo users queue and pair exactly once.
- Cancel, refresh/reconnect, duplicate join, and unsupported mode behavior.
- Shared match ID and server-authoritative participant/game state.
- Rating event/profile delta is applied exactly once after terminal result.
- Profile and leaderboard reflect Standard ladder truthfully.
- Speed/Classic/Multiplayer remain clearly non-live.
- Browser console and network errors.
- No secret leakage.

## Output

Return PASS/WARN/FAIL, separate release blockers from polish, provide non-secret hosted evidence, and identify rollback/follow-up owners. Do not merge or mutate provider settings.
