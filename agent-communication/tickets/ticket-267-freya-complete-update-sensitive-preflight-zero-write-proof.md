# Ticket 267 — Freya — Complete update-sensitive preflight zero-write proof

## Blocker

Independent post-probe transaction compares row counts for only 9/26 Prisma models. Updates and writes to omitted tables are invisible.

## Goal

Prove public preflight GETs caused no persistent database mutation across the complete current schema.

## Acceptance

- One complete, deterministic, privacy-safe database state fingerprint covering every application Prisma model/table and full row content, plus counts.
- Baseline transaction and separate post-probe read-only transaction compare the fingerprint.
- Detect insert, delete, and update in each model group; include implementation-omitted updates and omitted-table writes.
- Fail closed on model/table manifest drift, unsupported types, unstable ordering, or fingerprint query failure.
- Never emit row content, dictionary answers, credentials, tokens, emails, or secrets—only sanitized counts/digests.
- Permanent real disposable PostgreSQL tests with all nine migrations, nonzero representative rows, negative mutations, no skips, and schema cleanup.
- Preserve phase/provider/readiness/migration/pg_control_system strictness.
