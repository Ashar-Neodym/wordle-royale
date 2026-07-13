# Ticket 123 — Database-Backed Standard 1v1 Queue and Matchmaker

Agent: Freya (backend implementation)
Wave: R — Live Standard 1v1 Matchmaking
Status: New after Ticket 122

## Goal

Implement the server-authoritative `standard_1v1` queue, atomic pairing, and match creation defined by Ticket 122.

## Context

Read Ticket 122's decision document and current auth, gameplay, lobby, Prisma, readiness, and API contract code. Preview uses Supabase Postgres and optional/no Redis.

## Scope

- Prisma migration and models/fields required for durable queue entries.
- Authenticated join/status/cancel endpoints and shared Zod contracts.
- Transaction-safe matching that cannot pair one user twice or self-match.
- Idempotent retries and deterministic queue/matched responses.
- Match creation using the existing server-authoritative gameplay path.
- Stale queue cleanup and safe reconnect behavior.
- Structured audit/error handling without exposing puzzle answers or secrets.

## Acceptance criteria

- Only `standard_1v1` is live; unsupported modes fail explicitly.
- Queue survives API restart because source of truth is Postgres.
- Concurrent tests prove no duplicate/self pairing.
- Two authenticated preview users can join and receive one shared match ID.
- Cancel is safe before pairing and cannot cancel an already paired match.
- Migration deploy/validate passes.
- No provider deployment or direct hosted DB mutation.

## Verification

```bash
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm --filter @wordle-royale/api db:validate
CI=true pnpm --filter @wordle-royale/api build
CI=true pnpm secret-scan
git diff --check
```
