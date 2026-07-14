# Athena Review — Hosted Matchmaking Transaction Timeout After Dictionary Bootstrap

Date: 2026-07-13
Verdict: Dictionary bootstrap succeeded and remains valid, but Ticket 128 is still blocked by Prisma's default interactive-transaction timeout.

## Evidence

- Hosted bootstrap first apply: `created`, exact `20/40/3/63`, fixture-only, non-production-approved.
- Second apply: `unchanged`.
- Hosted `/readyz`: top-level `ok`, `standardDictionary=ok`.
- Two live sessions: starts `201/201`, distinct users.
- Concurrent queue joins: `500/500`; no current tickets persisted.
- Sequential hosted queue join: `500 internal_server_error`; no ticket persisted.
- Local API pointed at the same hosted Supabase database reproduced a single join failure in 5.1 seconds.
- Read-only dictionary selection through the same pooler took about 2.0 seconds.
- Matchmaking calls Prisma interactive `$transaction(callback, { isolationLevel: 'Serializable' })` without `timeout` or `maxWait`, so Prisma uses the 5-second default.

## Root cause

The new environment-aware dictionary selector performs release lookup and grouped row-count verification inside the serializable matchmaking transaction. Hosted pooler/network latency leaves insufficient time for the remaining profile, ticket, audit, lock, and candidate queries. Prisma expires the transaction at the 5-second default and the API safely returns a generic 500 while rolling back.

## Required repair

- Define a bounded, environment-safe matchmaking transaction budget (recommended default 15–20 seconds, with a validated upper cap) and explicit `maxWait`.
- Keep serializable isolation and bounded `P2034` retry behavior.
- Do not solve this by removing dictionary revalidation or transaction locks.
- Add tests proving the explicit options are passed on initial, retry, read, cancel, and recovery transaction paths.
- Add latency-shaped regression coverage and verify rollback/no duplicate writes.
- Keep client/server request timeouts aligned so the UI does not give up before the server budget.
- After independent QA and PR merge, rerun hosted Ticket 128; no dictionary re-bootstrap should be required (`unchanged` is already proven).

No provider setting or hosted schema change is required by this repair.
