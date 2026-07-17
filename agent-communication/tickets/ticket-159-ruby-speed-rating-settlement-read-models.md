# Ticket 159 — Speed Rating Settlement and Read Models

Agent: Ruby (rating/read-model implementation)
Wave: T — Live Speed/Blitz Ranked 1v1
Status: Ready — Ticket 157 complete; Speed v1 timing approved by Ashar on 2026-07-16

## Goal

Implement mode-specific Speed settlement and authoritative leaderboard/profile/history reads.

## Acceptance

- Separate `speed_1v1` rating rows/config from Standard.
- Exactly-once/idempotent settlement for win/loss/draw/forfeit/timeout.
- Equal-guess server-time winner maps correctly to rating outcome.
- Leaderboard, profile cards, history, result, and event deltas converge on one Speed algorithm/config.
- Legacy/prepared rows cannot override live Speed truth.
- Add real-PostgreSQL settlement/read convergence coverage.
- Preserve Standard data and behavior.

No hosted deployment or provider mutation.
