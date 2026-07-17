# Ticket 158 — Server-Authoritative Speed Queue and Gameplay

Agent: Freya (backend implementation)
Wave: T — Live Speed/Blitz Ranked 1v1
Status: Ready — Ticket 157 complete; Speed v1 timing approved by Ashar on 2026-07-16

## Goal

Implement `speed_1v1` queue, match creation, authoritative timing, reconnect, expiry, and terminal outcome under Elisa's approved contract.

## Acceptance

- Preserve Standard behavior and shared lifecycle/idempotency guarantees.
- No client timestamp may decide the result.
- Equal-guess solves use server-authoritative elapsed time.
- Timeout/abandon/reconnect outcomes are deterministic and exactly once.
- Add true PostgreSQL concurrent pairing/timing/rollback regressions.
- Keep dictionary/readiness and spoiler boundaries intact.
- Run canonical backend gates and fresh-schema harnesses.

No hosted deployment or provider mutation.
