# Ticket 157 — Live Speed/Blitz 1v1 Contract

Agent: Elisa (architecture/product contract)
Wave: T — Live Speed/Blitz Ranked 1v1
Status: Complete — contract delivered; exact Speed v1 timing approved by Ashar on 2026-07-16

## Goal

Turn prepared `speed_1v1` into the next live ranked mode without weakening Standard, server authority, idempotency, or spoiler safety.

## Required decisions

1. Recommend one exact round limit from the existing approved range of 60–90 seconds; do not treat it as final until Ashar explicitly approves.
2. Lock result ordering: solve/fail, guess count, then server-authoritative solve elapsed time for equal-guess solves.
3. Define start/reveal clock origin, pause/reconnect behavior, deadline expiry, abandon/forfeit, simultaneous terminalization, and tie precision.
4. Define server timestamp/monotonicity rules; client timestamps cannot adjudicate ratings.
5. Define queue APIs and whether the Standard coordinator is generalized or safely reused by mode.
6. Define mode-specific rating algorithm/config/read mapping (`speed_1v1_glicko_v1` unless a reviewed reason differs).
7. Define migration/data/backfill requirements and preserve existing Standard rows.
8. Define web countdown, latency messaging, reconnect, accessibility, and truthful non-live gating until deployment.
9. Define local/real-PostgreSQL/hosted acceptance evidence and rollback.

Architecture/docs only. No provider, database, deployment, or hosted mutation.
