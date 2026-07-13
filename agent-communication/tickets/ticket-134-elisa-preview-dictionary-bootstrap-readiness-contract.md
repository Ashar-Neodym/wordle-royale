# Ticket 134 — Preview Dictionary Bootstrap and Readiness Contract

Agent: Elisa (architecture)
Wave: R-Hosted-Fix
Status: New

## Goal

Lock the environment/data contract that safely enables the hosted preview Standard queue without treating the fixture dictionary as production-approved content.

## Required decisions

1. Confirm whether `en-5-test-vfixture.001` may be used in `APP_ENV=preview` only.
2. Define selection rules for preview versus production, including status and `sourceMetadata.fixtureOnly` / `productionApproved` handling.
3. Define an idempotent dictionary-only bootstrap contract that never creates fixture users, profiles, ratings, matches, or lobbies.
4. Define the explicit confirmation guard required before applying fixture data to a remote preview database.
5. Define `/readyz` semantics for operational dictionary availability when Standard matchmaking is advertised live.
6. Define safe error behavior for missing dictionary under sequential and concurrent joins.
7. Define rollback: retire/delete only the exact fixture release if unused, or disable Standard matchmaking without destructive schema rollback.

## Inputs

- `docs/2026-07-13-athena-ticket-128-dictionary-bootstrap-review.md`
- Ticket 128 response
- `apps/api/prisma/seed-fixtures.ts`
- `apps/api/src/matchmaking/matchmaking.service.ts`

## Acceptance

- Exact preview/production boundary is explicit.
- No wholesale `db:seed:local` against hosted preview.
- No provider/data mutation is performed.
- Return an implementation-ready response for Freya and Yuna.
