# Ticket 258 — Elisa — Separate durable-auth production topology and provider manifest

Status: **PASS architecture / activation NOT READY**

Read-only review at source `53bfc861f281182db198a1764658d5ce26c413f1`.

## Decision

Use a fully separate production stack: new Vercel web project, new Railway project/environment/API service, new PostgreSQL resource, distinct HTTPS web/API origins, initially one API replica, registration closed, preview untouched. Redis is either absent with `REDIS_REQUIRED=false` or a separately isolated production resource.

## Manifest invariants

- API dormant: production/session-required identity, `DURABLE_AUTH_ENABLED=false`, registration closed, exact web origin/CORS, secure host-only cookie, explicit bounded proxy hops, expected replicas `1`, no canary digest.
- Web dormant: `WORDLE_WEB_ENV=production`, `WORDLE_ACCOUNT_MODE=disabled`, `WORDLE_REGISTRATION_MODE` absent, `DURABLE_AUTH_ENABLED=false`, exact API/web authorities.
- Direct database URL is operator-only and never a hosted service variable.
- Preview IDs, domains, database, cookies, and credentials are forbidden in production.
- Each phase change requires a fresh deployment and fresh expiring receipt.

## Hard blockers

1. Current preflight cannot validate the documented dormant G3 phase.
2. Fresh production DB readiness is coupled to production-approved dictionary/ranked dependencies.
3. Provider collector/provenance and cross-provider ID mapping are absent.
4. Artifact digest is not independently established.
5. Proxy hop count must be proven for the new service; existing preview value is not production evidence.

No hosted or provider action was authorized or performed.
