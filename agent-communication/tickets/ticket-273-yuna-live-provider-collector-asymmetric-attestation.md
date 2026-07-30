# Ticket 273 — Yuna — Live provider collector and asymmetric attestation

Blocked on Ticket 272.

## Goal

Implement the production live collector/verifier lane for Vercel, Railway, and PostgreSQL.

## Scope

- Verifier challenge and approved collector Ed25519 keyring.
- Fixed direct HTTPS or absolute pinned CLI operation plans; no arbitrary commands/queries.
- Protected inputs/keys, no-follow semantics, bounded outputs/timeouts, minimal env, `shell:false`.
- Structured allowlist sanitization and raw-response digests without raw data disclosure.
- Atomic signed evidence/inventory/receipt bundle and replay ledger.
- Provider/API identity and variable-state evidence without secret-value retrieval.
- Production CLI E2E with fake executables/local TLS; no live calls.
- Fixture/live lanes impossible to mix; test seams reject production.

## Verification

Hostile matrix from Ticket 271, CLI E2E, v2 regressions, preflight composition, typecheck/workspace/secret/diff.
